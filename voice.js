/* WEDNESDAY hands-free voice companion
   Uses the browser Web Speech API. One user gesture enables the microphone;
   recognition restarts automatically when supported. */
(() => {
  "use strict";
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let enabled = false;
  let restarting = false;
  let speaking = false;
  let restartTimer = null;
  let finalTranscript = "";
  const $ = id => document.getElementById(id);
  const setState = state => window.WEDNESDAY_SET_STATE?.(state);
  const status = (message, state = "idle") => {
    const el = $("wednesday-voice-status");
    if (el) { el.textContent = message; el.dataset.state = state; }
    const button = $("wednesday-handsfree");
    if (button) {
      button.textContent = enabled ? "🎙 Hands-free is ON · Turn off" : "🎙 Enable hands-free";
      button.setAttribute("aria-pressed", String(enabled));
      button.classList.toggle("voice-active", enabled);
    }
  };
  function scheduleRestart() {
    if (!enabled || speaking || restarting || !recognition) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (!enabled || speaking || restarting) return;
      try { restarting = true; recognition.start(); }
      catch (_) { restarting = false; }
    }, 650);
  }
  function sendTranscript(text) {
    const input = $("chat-input");
    const form = $("chat-form");
    if (!input || !form || !text.trim()) return;
    input.value = text.trim();
    form.requestSubmit();
  }
  function buildRecognition() {
    if (!SpeechRecognition) {
      status("Hands-free speech recognition is not supported in this browser. Try Chrome or Edge.", "error");
      return false;
    }
    recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      restarting = false;
      if (enabled && !speaking) { status("Listening… speak naturally. Say “stop listening” to pause.", "listening"); setState("listening"); }
    };
    recognition.onresult = event => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const phrase = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) finalTranscript += (finalTranscript ? " " : "") + phrase;
        else interim += phrase;
      }
      const heard = finalTranscript.trim();
      if (heard) {
        finalTranscript = "";
        if (/^(stop listening|disable listening|go to sleep)$/i.test(heard)) {
          disable(); status("Hands-free paused. Enable it again whenever you're ready."); return;
        }
        try { recognition.stop(); } catch (_) {}
        status("Heard: " + heard, "busy");
        sendTranscript(heard);
      } else if (interim) {
        const el = $("wednesday-voice-status");
        if (el) el.textContent = "Hearing: " + interim;
      }
    };
    recognition.onerror = event => {
      restarting = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        enabled = false;
        status("Microphone permission was blocked. Allow microphone access in your browser site settings.", "error");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        status("Voice recognition: " + event.error + ". Trying again…", "error");
      }
    };
    recognition.onend = () => {
      restarting = false;
      if (enabled && !speaking) scheduleRestart();
    };
    return true;
  }
  function enable() {
    if (!recognition && !buildRecognition()) return;
    enabled = true;
    finalTranscript = "";
    scheduleRestart();
    status("Starting microphone…", "listening");
  }
  function disable() {
    enabled = false;
    clearTimeout(restartTimer);
    if (recognition) { try { recognition.stop(); } catch (_) {} }
    status("Hands-free paused.");
    setState("idle");
  }
  function addControls() {
    const form = $("chat-form");
    if (!form || $("wednesday-handsfree")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "wednesday-handsfree";
    button.className = "secondary-btn handsfree-button";
    button.textContent = "🎙 Enable hands-free";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => enabled ? disable() : enable());
    const send = form.querySelector('button[type="submit"]');
    if (send) form.insertBefore(button, send); else form.append(button);
    const note = document.createElement("small");
    note.id = "wednesday-voice-status";
    note.className = "voice-status";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.textContent = "One-time setup: enable hands-free and allow microphone access.";
    form.insertAdjacentElement("afterend", note);
  }
  // Keep the mic quiet while the character speaks, then resume listening.
  const originalSpeak = window.WEDNESDAY_SPEAK;
  if (typeof originalSpeak === "function") {
    window.WEDNESDAY_SPEAK = function(text) {
      speaking = true;
      if (recognition) { try { recognition.stop(); } catch (_) {} }
      const oldState = window.WEDNESDAY_SET_STATE;
      originalSpeak(text);
      const utteranceHook = () => {
        if (!window.speechSynthesis?.speaking && speaking) {
          speaking = false;
          if (enabled) scheduleRestart();
        }
      };
      const poll = () => {
        if (!speaking) return;
        if (!window.speechSynthesis?.speaking && !window.speechSynthesis?.pending) {
          speaking = false;
          if (enabled) scheduleRestart();
        } else setTimeout(poll, 350);
      };
      setTimeout(poll, 500);
    };
  }
  document.addEventListener("DOMContentLoaded", addControls);
  if (document.readyState !== "loading") addControls();
  window.WEDNESDAY_HANDSFREE = { enable, disable, get enabled() { return enabled; } };
})();
