/* WEDNESDAY voice controller
   Browser speech recognition + spoken replies.
   Start listening only after the user clicks Activate wake word.
   Browser speech recognition may use the browser vendor's speech service.
*/
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let enabled = false;
  let listening = false;
  let speaking = false;
  let restarting = false;
  let restartTimer = null;
  let awaitingWakeCommand = false;

  const WAKE_PATTERN = /\b(?:hey|hi|hello|okay|ok)\s+(?:wednesday|wensday|wens\s*day|wins\s*day)\b/i;
  const STOP_PATTERN = /^(?:stop listening|disable listening|go to sleep|pause voice)$/i;

  function status(message, state = "idle") {
    const el = $("wednesday-voice-status");
    if (el) {
      el.textContent = message;
      el.dataset.state = state;
    }

    const btn = $("wednesday-handsfree");
    if (btn) {
      btn.textContent = enabled ? "🎙 Wake word is ON · Turn off" : "🎙 Activate wake word";
      btn.setAttribute("aria-pressed", String(enabled));
      btn.classList.toggle("voice-active", enabled);
    }
  }

  const setState = state => window.WEDNESDAY_SET_STATE?.(state);

  function stopRecognition() {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (_) {}
  }

  function scheduleRestart(delay = 700) {
    clearTimeout(restartTimer);
    if (!enabled || speaking || listening || restarting || !recognition) return;

    restartTimer = setTimeout(() => {
      if (!enabled || speaking || listening || restarting || !recognition) return;
      try {
        restarting = true;
        recognition.start();
      } catch (error) {
        restarting = false;
        // InvalidStateError usually means the browser is already starting it.
        if (error?.name !== "InvalidStateError") {
          status("Couldn't restart voice input. Tap the wake-word button to try again.", "error");
        }
      }
    }, delay);
  }

  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;

    const clean = String(text)
      .replace(/\*{1,3}|#{1,6}\s?/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .slice(0, 5000);

    if (!clean.trim()) return;

    window.speechSynthesis.cancel();
    speaking = true;
    stopRecognition();

    const utterance = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(v => /^en-IN$/i.test(v.lang)) ||
      voices.find(v => /^en-GB$/i.test(v.lang)) ||
      voices.find(v => /^en-US$/i.test(v.lang)) ||
      voices.find(v => /^en/i.test(v.lang));

    if (preferred) utterance.voice = preferred;
    utterance.rate = 1.02;
    utterance.pitch = 1.08;
    utterance.volume = 1;

    utterance.onstart = () => setState("speaking");
    const finish = () => {
      speaking = false;
      setState("idle");
      if (enabled) scheduleRestart(900);
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    window.speechSynthesis.speak(utterance);
  }

  window.WEDNESDAY_SPEAK = speak;

  function submitCommand(text) {
    const input = $("chat-input");
    const form = $("chat-form");
    if (!input || !form || !text.trim()) return;

    input.value = text.trim();
    form.requestSubmit();
  }

  function handleTranscript(rawText) {
    const heard = String(rawText || "").trim();
    if (!heard) return;

    if (STOP_PATTERN.test(heard)) {
      disable();
      return;
    }

    if (awaitingWakeCommand) {
      awaitingWakeCommand = false;
      status("Heard your request. Processing…", "busy");
      submitCommand(heard);
      return;
    }

    const match = WAKE_PATTERN.exec(heard);
    if (!match) {
      // Show the actual transcript so the user can tell whether the
      // microphone heard them but misrecognised the wake phrase.
      status('Heard: "' + heard + '" · Say “Hey Wednesday” to start.', "listening");
      return;
    }

    const command = heard.slice(match.index + match[0].length)
      .replace(/^[\s,.:;!?-]+/, "")
      .trim();

    if (command) {
      status("Wake phrase detected. Processing your request…", "busy");
      submitCommand(command);
      stopRecognition();
      return;
    }

    awaitingWakeCommand = true;
    status("Wake phrase detected. I'm listening for your request…", "listening");
    speak("I'm listening. What would you like me to do?");
  }

  function setupRecognition() {
    if (!Recognition) {
      status("Voice input isn't supported in this browser. Please use an up-to-date version of Chrome or Edge.", "error");
      return false;
    }

    recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      clearTimeout(restartTimer);
      restarting = false;
      listening = true;
      if (enabled && !speaking) {
        status("Listening for “Hey Wednesday”…", "listening");
        setState("listening");
      }
    };

    recognition.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) {
          const interim = result[0]?.transcript?.trim();
          if (interim) {
            const el = $("wednesday-voice-status");
            if (el) el.textContent = "Hearing: " + interim;
          }
          continue;
        }

        // Try the browser's alternative transcripts as well. This helps
        // when it hears the name Wednesday with a slightly different spelling.
        const alternatives = Array.from(result).map(item => item.transcript || "");
        const candidate = alternatives.find(text => WAKE_PATTERN.test(text)) || alternatives[0] || "";
        handleTranscript(candidate);
      }
    };

    recognition.onerror = event => {
      restarting = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        enabled = false;
        listening = false;
        status("Microphone permission is blocked. Allow microphone access for this website in Chrome site settings, then activate again.", "error");
      } else if (event.error === "audio-capture") {
        status("No microphone was found. Check your microphone connection and Windows input settings.", "error");
      } else if (event.error === "network") {
        status("The browser speech service is unavailable. Check your internet connection and try again.", "error");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        status("Voice input error: " + event.error + ". Retrying…", "error");
      }
    };

    recognition.onend = () => {
      listening = false;
      restarting = false;
      if (enabled && !speaking) scheduleRestart(800);
      else if (!enabled) setState("idle");
    };

    return true;
  }

  function enable() {
    if (!Recognition) {
      if (!recognition) setupRecognition();
      return;
    }
    if (!recognition && !setupRecognition()) return;

    enabled = true;
    awaitingWakeCommand = false;
    status("Starting microphone…", "listening");

    // Call start directly from the click handler so the browser can show
    // its microphone permission prompt in response to a user gesture.
    try {
      restarting = true;
      recognition.start();
    } catch (error) {
      restarting = false;
      if (error?.name === "InvalidStateError") {
        status("Voice input is already starting. Wait a moment and say “Hey Wednesday”.", "listening");
      } else {
        status("Couldn't start the microphone. Check site permissions and try again.", "error");
        scheduleRestart(1000);
      }
    }
  }

  function disable() {
    enabled = false;
    awaitingWakeCommand = false;
    clearTimeout(restartTimer);
    listening = false;
    stopRecognition();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    speaking = false;
    status("Voice paused. Activate wake word when you're ready.");
    setState("idle");
  }

  function addControls() {
    const form = $("chat-form");
    if (!form || $("wednesday-handsfree")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "wednesday-handsfree";
    btn.className = "secondary-btn handsfree-button";
    btn.textContent = "🎙 Activate wake word";
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => enabled ? disable() : enable());

    const send = form.querySelector('button[type="submit"]');
    if (send) form.insertBefore(btn, send);
    else form.append(btn);

    const note = document.createElement("small");
    note.id = "wednesday-voice-status";
    note.className = "voice-status";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.textContent = "Click Activate wake word and allow microphone access. Then say “Hey Wednesday”.";
    form.insertAdjacentElement("afterend", note);
  }

  document.addEventListener("DOMContentLoaded", addControls);
  if (document.readyState !== "loading") addControls();

  window.WEDNESDAY_HANDSFREE = {
    enable,
    disable,
    speak,
    get enabled() { return enabled; },
    get listening() { return listening; }
  };
})();