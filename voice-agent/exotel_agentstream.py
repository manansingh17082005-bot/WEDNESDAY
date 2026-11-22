"""Local-first Exotel AgentStream voice gateway for WEDNESDAY.

Runs on the owner's Windows PC. Exotel reaches it through a private HTTPS/WSS tunnel.
The service fetches only the approved call brief; transcripts remain in memory.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import secrets
import tempfile
import threading
import time
import urllib.request
import wave
from typing import Any

import numpy as np
import pyttsx3
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from faster_whisper import WhisperModel

app = FastAPI(title="WEDNESDAY Exotel AgentStream", docs_url=None, redoc_url=None)
_whisper: WhisperModel | None = None
_tts_lock = threading.Lock()
SAMPLE_RATE = 16000


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def get_context(audit_id: str) -> dict[str, Any]:
    url = env("EXOTEL_AGENT_CONTEXT_URL")
    token = env("EXOTEL_AGENT_CONTEXT_SECRET")
    if not url or not token:
        raise RuntimeError("Set EXOTEL_AGENT_CONTEXT_URL and EXOTEL_AGENT_CONTEXT_SECRET.")
    req = urllib.request.Request(
        url + "?token=" + token,
        data=json.dumps({"audit_id": audit_id}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))


def get_whisper() -> WhisperModel:
    global _whisper
    if _whisper is None:
        _whisper = WhisperModel(env("WHISPER_MODEL", "tiny"), device="cpu", compute_type="int8")
    return _whisper


def transcribe_pcm(pcm: bytes) -> str:
    if len(pcm) < SAMPLE_RATE * 2 // 3:
        return ""
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = get_whisper().transcribe(audio, beam_size=1, vad_filter=True)
    return " ".join(segment.text.strip() for segment in segments).strip()


def ollama_reply(context: dict[str, Any], history: list[dict[str, str]], transcript: str) -> str:
    url = env("OLLAMA_URL", "http://localhost:11434/api/chat")
    model = env("OLLAMA_MODEL", "llama3.2")
    system = (
        "You are WEDNESDAY, an AI voice assistant calling transparently on behalf of Manan Singh's creative agency. "
        "Never pretend to be human. The recipient must know you are AI. Follow the owner-approved call script and discuss "
        "only the stated business service and evidence. Never invent research, prices, discounts, clients, guarantees, or results. "
        "Do not pressure, argue, or keep talking after a refusal. Ask one short question at a time. If they are interested, "
        "offer to have Manan follow up; do not claim a meeting is booked. If they ask to stop or not call again, acknowledge "
        "and end immediately. Keep each response natural and under 45 words. Match the language used by the recipient. "
        "Approved script: " + str(context.get("script", ""))[:4500] + "\nBusiness: " +
        str(context.get("business", "")) + "\nService: " + str(context.get("service", "")) +
        "\nPublic evidence: " + str(context.get("reason", ""))
    )
    messages = [{"role": "system", "content": system}] + history[-8:] + [{"role": "user", "content": transcript}]
    payload = json.dumps({"model": model, "stream": False, "messages": messages}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=40) as response:
        result = json.loads(response.read().decode("utf-8"))
    return str(result.get("message", {}).get("content", "")).strip()


def tts_pcm(text: str) -> bytes:
    if not text:
        return b""
    with _tts_lock:
        path = ""
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp:
                path = temp.name
            engine = pyttsx3.init()
            engine.setProperty("rate", int(env("WEDNESDAY_TTS_RATE", "165")))
            engine.save_to_file(text, path)
            engine.runAndWait()
            engine.stop()
            deadline = time.time() + 8
            while time.time() < deadline and (not os.path.exists(path) or os.path.getsize(path) < 100):
                time.sleep(0.1)
            with wave.open(path, "rb") as wav:
                channels = wav.getnchannels()
                width = wav.getsampwidth()
                rate = wav.getframerate()
                raw = wav.readframes(wav.getnframes())
            if width != 2:
                raise RuntimeError("Windows TTS must output 16-bit PCM.")
            audio = np.frombuffer(raw, dtype=np.int16)
            if channels > 1:
                audio = audio.reshape(-1, channels).mean(axis=1).astype(np.int16)
            if rate != SAMPLE_RATE and len(audio):
                new_length = max(1, int(len(audio) * SAMPLE_RATE / rate))
                audio = np.interp(
                    np.linspace(0, len(audio) - 1, new_length),
                    np.arange(len(audio)),
                    audio.astype(np.float32),
                ).astype(np.int16)
            return audio.tobytes()
        finally:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


async def speak(ws: WebSocket, stream_sid: str, text: str) -> None:
    pcm = await asyncio.to_thread(tts_pcm, text)
    # Exotel AgentStream accepts 16-bit mono PCM. Send 100 ms (3200-byte) frames.
    frame_size = 3200
    for offset in range(0, len(pcm), frame_size):
        frame = pcm[offset:offset + frame_size]
        if len(frame) < frame_size:
            frame += b"\x00" * (frame_size - len(frame))
        await ws.send_json({
            "event": "media",
            "stream_sid": stream_sid,
            "media": {"payload": base64.b64encode(frame).decode("ascii")},
        })
    await ws.send_json({
        "event": "mark",
        "stream_sid": stream_sid,
        "mark": {"name": "wednesday-response-finished"},
    })


def audit_id_from_start(start: dict[str, Any]) -> str:
    params = start.get("custom_parameters") or {}
    for key, value in params.items():
        if str(key).lower() in ("customfield", "custom_field", "audit_id", "auditid"):
            candidate = str(value)
            if re.fullmatch(r"[0-9a-f-]{36}", candidate, re.I):
                return candidate
    raise RuntimeError("Exotel start event did not include the WEDNESDAY audit ID in custom_parameters.")


def explicit_opt_out(text: str) -> bool:
    return bool(re.search(
        r"\b(don't call|do not call|stop calling|remove me|take me off|no more calls|opt out|unsubscribe)\b",
        text, re.I,
    ))


async def receive_turns(ws: WebSocket, queue: asyncio.Queue[bytes], stop: asyncio.Event) -> None:
    buffer = bytearray()
    speech_started = False
    silence_ms = 0
    while not stop.is_set():
        try:
            event = await ws.receive_json()
        except WebSocketDisconnect:
            stop.set()
            break
        kind = event.get("event")
        if kind == "stop":
            stop.set()
            break
        if kind != "media":
            continue
        try:
            chunk = base64.b64decode(event.get("media", {}).get("payload", ""), validate=False)
            samples = np.frombuffer(chunk, dtype=np.int16)
            if not len(samples):
                continue
            rms = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))
            duration_ms = int(len(samples) * 1000 / SAMPLE_RATE)
            if rms > float(env("WEDNESDAY_VAD_THRESHOLD", "420")):
                speech_started = True
                silence_ms = 0
            elif speech_started:
                silence_ms += duration_ms
            if speech_started:
                buffer.extend(chunk)
            if speech_started and silence_ms >= 850:
                if len(buffer) >= SAMPLE_RATE * 2 // 2:
                    await queue.put(bytes(buffer))
                buffer.clear()
                speech_started = False
                silence_ms = 0
        except Exception:
            continue


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "online", "service": "wednesday-exotel-agentstream", "audio": "pcm_s16le_16000"}


@app.websocket("/stream")
async def stream(ws: WebSocket) -> None:
    token = env("WEDNESDAY_AGENTSTREAM_TOKEN")
    supplied = ws.query_params.get("token", "")
    if not token or not secrets.compare_digest(token, supplied):
        await ws.close(code=1008)
        return
    await ws.accept()
    try:
        start_event = None
        while True:
            event = await ws.receive_json()
            if event.get("event") == "start":
                start_event = event
                break
            if event.get("event") == "stop":
                return
        start = start_event.get("start") or {}
        stream_sid = str(start.get("stream_sid") or start_event.get("stream_sid") or "")
        audit_id = audit_id_from_start(start)
        context = await asyncio.to_thread(get_context, audit_id)

        # Speak the opening exactly as it was reviewed and approved in WEDNESDAY.
        approved_script = str(context.get("script", "")).strip()
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", approved_script) if part.strip()]
        opening = "\n\n".join(paragraphs[:2]) if paragraphs else approved_script[:700]
        if not opening:
            opening = "Hello, I'm WEDNESDAY, an AI assistant calling on behalf of Manan Singh's creative agency. Is now a convenient time to speak?"
        await speak(ws, stream_sid, opening)

        queue: asyncio.Queue[bytes] = asyncio.Queue()
        stop = asyncio.Event()
        receiver = asyncio.create_task(receive_turns(ws, queue, stop))
        history: list[dict[str, str]] = []
        while not stop.is_set():
            try:
                utterance = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            transcript = await asyncio.to_thread(transcribe_pcm, utterance)
            if not transcript:
                continue
            if explicit_opt_out(transcript):
                await speak(ws, stream_sid, "Understood. I will record that you do not want further calls. Goodbye.")
                # The separate authenticated function records the opt-out.
                try:
                    context_url = env("EXOTEL_AGENT_OPTOUT_URL")
                    context_token = env("EXOTEL_AGENT_CONTEXT_SECRET")
                    body = json.dumps({"audit_id": audit_id, "reason": "Recipient requested no further calls"}).encode("utf-8")
                    req = urllib.request.Request(
                        context_url + "?token=" + context_token,
                        data=body,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    await asyncio.to_thread(lambda: urllib.request.urlopen(req, timeout=10).read())
                except Exception:
                    pass
                stop.set()
                break
            response = await asyncio.to_thread(ollama_reply, context, history, transcript)
            if not response:
                response = "I'm sorry, I didn't catch that. Would you mind repeating it?"
            history.append({"role": "user", "content": transcript})
            history.append({"role": "assistant", "content": response})
            await speak(ws, stream_sid, response)
            if re.search(r"\b(not interested|no thank you|not required|not looking for|not right now)\b", transcript, re.I):
                await speak(ws, stream_sid, "Thank you for your time. Have a good day.")
                stop.set()
                break
        receiver.cancel()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print("AgentStream session error:", str(exc))
    finally:
        try:
            await ws.close()
        except Exception:
            pass
