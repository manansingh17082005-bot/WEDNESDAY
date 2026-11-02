/* WEDNESDAY voice interface — local Faster-Whisper + browser speech output */
(() => {
  const TRANSCRIBE_URL = "http://127.0.0.1:8000/transcribe";
  const $ = (selector) => document.querySelector(selector);

  let recorder = null;
  let stream = null;
  let chunks = [];
  let recording = false;
  let busy = false;
  let preferredVoice = null;

  function setStatus(message, state = "idle") {
    const status = $("#wednesday-voice-status");
    const button = $("#wednesday-mic-button");
    if (status) status.textContent = message;
    if (button) {
      button.dataset.state = state;
      button.textContent = state === "recording" ? "■ Stop & send" : "🎙 Speak";
      button.setAttribute("aria-label", state === "recording" ? "Stop recording and send" : "Start voice input");
    }
  }

  function chooseVoice(text = "") {
    if (!("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const wantsHindi = /[\u0900-\u097F]/.test(text);
    const preferredLanguage = wantsHindi ? /^(hi|hi-IN)/i : /^(en|en-IN)/i;
    preferredVoice = voices.find(v => preferredLanguage.test(v.lang) && /female|zira|aria|jenny|samantha|heera/i.test(v.name))
      || voices.find(v => preferredLanguage.test(v.lang))
      || voices.find(v => /female|zira|aria|jenny|samantha|heera/i.test(v.name))
      || voices[0]
      || null;
  }

  window.WEDNESDAY_SPEAK = function (text) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    chooseVoice(text);
    const utterance = new SpeechSynthesisUtterance(text);
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang || "en-IN";
    } else {
      utterance.lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN";
    }
    utterance.rate = 1.08;
    utterance.pitch = 1.08;
    window.speechSynthesis.speak(utterance);
  };

  function addVoiceControls() {
    const compose = $("#chat-form");
    const input = $("#chat-input");
    if (!compose || !input || $("#wednesday-mic-button")) return;

    const mic = document.createElement("button");
    mic.type = "button";
    mic.id = "wednesday-mic-button";
    mic.className = "secondary-btn";
    mic.textContent = "🎙 Speak";
    mic.style.cssText = "white-space:nowrap;min-height:44px;padding:10px 14px;cursor:pointer;";

    const status = document.createElement("small");
    status.id = "wednesday-voice-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Voice ready · tap Speak to talk";
    status.style.cssText = "display:block;flex-basis:100%;padding:4px 2px;color:var(--muted,#8b91a5);font-size:12px;";

    const submit = compose.querySelector('button[type="submit"]');
    if (submit) compose.insertBefore(mic, submit);
    else compose.append(mic);
    compose.append(status);

    mic.addEventListener("click", async () => {
      if (busy) return;
      if (!recording) await startRecording();
      else await stopAndTranscribe();
    });
  }

  async function startRecording() {
    try {
      // Pressing Speak while WEDNESDAY is answering is an immediate barge-in.
      if (typeof window.WEDNESDAY_INTERRUPT === "function") window.WEDNESDAY_INTERRUPT();
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is unavailable. Open the website in Chrome over HTTPS.");
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      recorder = new MediaRecorder(stream, { mimeType });
      chunks = [];
      recorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      recorder.start(250);
      recording = true;
      setStatus("Listening… speak clearly, then tap Stop & send", "recording");
    } catch (error) {
      cleanup();
      setStatus(error.message || "Could not start microphone.", "error");
    }
  }

  async function stopAndTranscribe() {
    if (!recorder || !recording) return;
    busy = true;
    recording = false;
    setStatus("Transcribing your voice…", "busy");

    const finished = new Promise(resolve => {
      recorder.addEventListener("stop", resolve, { once: true });
    });
    recorder.stop();
    await finished;
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    cleanup();

    if (!blob.size) {
      busy = false;
      setStatus("I didn't receive any audio. Please try again.", "error");
      return;
    }

    try {
      const form = new FormData();
      form.append("audio", blob, "wednesday-recording.webm");
      const response = await fetch(TRANSCRIBE_URL, { method: "POST", body: form });
      if (!response.ok) {
        let detail = "Voice server returned HTTP " + response.status;
        try { detail = (await response.json()).detail || detail; } catch (_) {}
        throw new Error(detail);
      }
      const result = await response.json();
      const transcript = (result.text || "").trim();
      if (!transcript) {
        setStatus("I couldn't hear clear words. Please try speaking a little closer to the microphone.", "error");
        return;
      }

      const input = $("#chat-input");
      const chatForm = $("#chat-form");
      if (!input || !chatForm) throw new Error("Chat input was not found.");
      input.disabled = false;
      input.value = transcript;
      setStatus(`Heard (${result.language || "language detected"}): ${transcript}`, "ready");
      chatForm.requestSubmit();
    } catch (error) {
      setStatus("Voice error: " + error.message, "error");
      console.error("WEDNESDAY voice error:", error);
    } finally {
      busy = false;
    }
  }

  function cleanup() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    recorder = null;
    chunks = [];
  }

  if ("speechSynthesis" in window) {
    chooseVoice();
    window.speechSynthesis.addEventListener?.("voiceschanged", chooseVoice);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addVoiceControls);
  } else {
    addVoiceControls();
  }
})();
