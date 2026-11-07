/* WEDNESDAY hands-free voice: speak naturally without a wake phrase.
   Click Start listening once to grant microphone permission. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let enabled = false;
  let listening = false;
  let speaking = false;
  let processing = false;
  let restarting = false;
  let restartTimer = null;
  let finalTranscript = "";
  let lastFinalAt = 0;

  const STOP_PATTERN = /^(stop listening|pause voice|disable voice|go to sleep)$/i;

  function status(message, state = "idle") {
    const el = $("wednesday-voice-status");
    if (el) { el.textContent = message; el.dataset.state = state; }
    const btn = $("wednesday-handsfree");
    if (btn) {
      btn.textContent = enabled ? "🎙 Listening is ON · Pause" : "🎙 Start listening";
      btn.setAttribute("aria-pressed", String(enabled));
      btn.classList.toggle("voice-active", enabled);
    }
  }

  const setState = state => window.WEDNESDAY_SET_STATE?.(state);

  function stopRecognition() {
    if (!recognition) return;
    try { recognition.stop(); } catch (_) {}
  }

  function scheduleRestart(delay = 900) {
    clearTimeout(restartTimer);
    if (!enabled || speaking || processing || listening || restarting || !recognition) return;
    restartTimer = setTimeout(() => {
      if (!enabled || speaking || processing || listening || restarting) return;
      try { restarting = true; recognition.start(); }
      catch (error) {
        restarting = false;
        if (error?.name !== "InvalidStateError") {
          status("Couldn't restart microphone listening. Press Start listening to retry.", "error");
        }
      }
    }, delay);
  }

  let speechQueue = [];
  let streamBuffer = "";
  let streamCursor = 0;
  let streamActive = false;
  let streamEnded = false;
  function cleanForSpeech(value) {
    return String(value || "")
      .replace(/\x60{3}[\s\S]*?\x60{3}/g, " ")
      .replace(/\x60([^\x60]+)\x60/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      .replace(/\*\*|__|~~|\*|_/g, "")
      .replace(/[{}[\]|<>\x60]/g, " ")
      .replace(/[=~^]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  function finishSpeechQueue() {
    speaking = false; processing = false; streamActive = false; streamEnded = false;
    streamBuffer = ""; streamCursor = 0; setState("idle");
    if (enabled) scheduleRestart(900);
  }
  function pumpSpeechQueue() {
    if (speaking || !speechQueue.length) {
      if (!speaking && streamEnded && !speechQueue.length) finishSpeechQueue();
      return;
    }
    const text = cleanForSpeech(speechQueue.shift());
    if (!text) { pumpSpeechQueue(); return; }
    speaking = true;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /^en-IN$/i.test(v.lang)) || voices.find(v => /^en-GB$/i.test(v.lang)) || voices.find(v => /^en-US$/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
    if (preferred) utterance.voice = preferred;
    utterance.rate = 1.08; utterance.pitch = 1.05; utterance.volume = 1;
    utterance.onstart = () => setState("speaking");
    const finish = () => {
      speaking = false;
      if (speechQueue.length) pumpSpeechQueue();
      else if (streamEnded || !streamActive) finishSpeechQueue();
    };
    utterance.onend = finish; utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }
  function startSpeechStream() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel(); speechQueue = []; streamBuffer = ""; streamCursor = 0;
    streamActive = true; streamEnded = false; processing = true; speaking = false; stopRecognition();
  }
  function pushSpeechStream(fullText) {
    if (!streamActive || !("speechSynthesis" in window)) return;
    const text = String(fullText || "");
    if (text.length < streamCursor) streamCursor = 0;
    streamBuffer += text.slice(streamCursor); streamCursor = text.length;
    const sentencePattern = /[\s\S]*?[.!?](?=\s|$)/g;
    let match, consumed = 0;
    while ((match = sentencePattern.exec(streamBuffer)) !== null) {
      const sentence = match[0].trim(); if (sentence) speechQueue.push(sentence);
      consumed = sentencePattern.lastIndex;
    }
    if (consumed) streamBuffer = streamBuffer.slice(consumed);
    if (speechQueue.length) pumpSpeechQueue();
  }
  function endSpeechStream() {
    if (!streamActive) return;
    if (streamBuffer.trim()) speechQueue.push(streamBuffer.trim());
    streamBuffer = ""; streamEnded = true; pumpSpeechQueue();
  }
  function cancelSpeechStream() {
    streamActive = false; streamEnded = false; speechQueue = []; streamBuffer = ""; streamCursor = 0;
    processing = false; speaking = false;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    stopRecognition();
    setState("idle");
  }
  function speak(text) {
    if (!("speechSynthesis" in window) || !text) { processing = false; scheduleRestart(); return; }
    startSpeechStream(); pushSpeechStream(String(text).slice(0, 5000)); endSpeechStream();
  }
  window.WEDNESDAY_SPEAK = speak;
  window.WEDNESDAY_SPEAK_STREAM_START = startSpeechStream;
  window.WEDNESDAY_SPEAK_STREAM_PUSH = pushSpeechStream;
  window.WEDNESDAY_SPEAK_STREAM_END = endSpeechStream;
  window.WEDNESDAY_SPEAK_STREAM_CANCEL = cancelSpeechStream;

  function submitCommand(text) {
    const input = $("chat-input"), form = $("chat-form");
    const command = String(text || "").trim();
    if (!input || !form || !command) {
      processing = false;
      scheduleRestart();
      return;
    }
    processing = true;
    status("I heard you. Thinking…", "busy");
    input.value = command;
    form.requestSubmit();
  }

  function handleFinalTranscript(text) {
    const heard = String(text || "").trim();
    if (!heard) return;
    if (STOP_PATTERN.test(heard)) { disable(); return; }
    submitCommand(heard);
    stopRecognition();
  }

  function setupRecognition() {
    if (!Recognition) {
      status("Speech recognition isn't supported in this browser. Please use the latest Chrome or Edge.", "error");
      return false;
    }
    recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      clearTimeout(restartTimer);
      restarting = false;
      listening = true;
      if (enabled && !speaking && !processing) {
        status("I'm listening. Speak naturally — no wake phrase needed.", "listening");
        setState("listening");
      }
    };

    recognition.onresult = event => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) finalTranscript += (finalTranscript ? " " : "") + transcript.trim();
        else interim += transcript;
      }
      if (interim.trim() && !processing) {
        const el = $("wednesday-voice-status");
        if (el) el.textContent = "Hearing: " + interim.trim();
      }

      if (finalTranscript.trim()) {
        const now = Date.now();
        // Ignore duplicate final callbacks delivered within the same short utterance.
        if (now - lastFinalAt < 350) return;
        lastFinalAt = now;
        const phrase = finalTranscript.trim();
        finalTranscript = "";
        handleFinalTranscript(phrase);
      }
    };

    recognition.onerror = event => {
      restarting = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        enabled = false;
        listening = false;
        status("Microphone permission is blocked. Allow microphone access for this site in Chrome settings, then press Start listening.", "error");
      } else if (event.error === "audio-capture") {
        enabled = false;
        status("No microphone detected. Check your microphone connection and Windows input settings.", "error");
      } else if (event.error === "network") {
        status("The browser's speech recognition service is unavailable. Check your internet connection.", "error");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        status("Speech recognition error: " + event.error + ". Trying again…", "error");
      }
    };

    recognition.onend = () => {
      listening = false;
      restarting = false;
      if (enabled && !speaking && !processing) scheduleRestart(800);
      else if (!enabled) setState("idle");
    };
    return true;
  }

  function enable() {
    if (!recognition && !setupRecognition()) return;
    enabled = true;
    processing = false;
    finalTranscript = "";
    status("Starting microphone…", "listening");
    try {
      restarting = true;
      recognition.start();
    } catch (error) {
      restarting = false;
      if (error?.name === "InvalidStateError") {
        status("Microphone is starting. You can speak naturally now.", "listening");
      } else {
        status("Couldn't start microphone. Check site permissions and try again.", "error");
      }
    }
  }

  function disable() {
    enabled = false;
    processing = false;
    finalTranscript = "";
    clearTimeout(restartTimer);
    stopRecognition();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    speaking = false;
    status("Voice paused. Press Start listening when you're ready.");
    setState("idle");
  }

  function resumeAfterRequest() {
    processing = false;
    if (enabled && !speaking) scheduleRestart(700);
  }

  function addControls() {
    const form = $("chat-form");
    if (!form || $("wednesday-handsfree")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "wednesday-handsfree";
    btn.className = "secondary-btn handsfree-button";
    btn.textContent = "🎙 Start listening";
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => enabled ? disable() : enable());
    const send = form.querySelector('button[type="submit"]');
    if (send) form.insertBefore(btn, send); else form.append(btn);

    const note = document.createElement("small");
    note.id = "wednesday-voice-status";
    note.className = "voice-status";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.textContent = "Press Start listening once, allow microphone access, then talk normally. No wake phrase required.";
    form.insertAdjacentElement("afterend", note);
  }

  document.addEventListener("DOMContentLoaded", addControls);
  if (document.readyState !== "loading") addControls();
  window.WEDNESDAY_HANDSFREE = {
    enable, disable, speak, resumeAfterRequest,
    get enabled() { return enabled; },
    get listening() { return listening; }
  };
})();