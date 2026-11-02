
/* WEDNESDAY voice interface
   Local Faster-Whisper + natural browser speech
*/

(() => {
  const TRANSCRIBE_URL = "http://127.0.0.1:8000/transcribe";

  const $ = (selector) => document.querySelector(selector);

  let recorder = null;
  let stream = null;
  let chunks = [];
  let recording = false;
  let busy = false;
  let preferredVoice = null;

  // -----------------------------------
  // STATUS DISPLAY
  // -----------------------------------

  function setStatus(message, state = "idle") {
    const status = $("#wednesday-voice-status");
    const button = $("#wednesday-mic-button");

    if (status) status.textContent = message;

    if (button) {
      button.dataset.state = state;
      button.textContent =
        state === "recording" ? "■ Stop & send" : "🎙 Speak";

      button.setAttribute(
        "aria-label",
        state === "recording"
          ? "Stop recording and send"
          : "Start voice input"
      );
    }
  }

  function getErrorMessage(error) {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;

    if (error && typeof error === "object") {
      return (
        error.message ||
        error.detail ||
        error.error ||
        JSON.stringify(error)
      );
    }

    return String(error || "Unknown error");
  }

  // -----------------------------------
  // CLEAN TEXT BEFORE SPEAKING
  // -----------------------------------

  function cleanForSpeech(text) {
    let clean = String(text || "");

    // Do not read programming code aloud.
    clean = clean.replace(/```[\s\S]*?```/g, " ");

    // Keep the words inside inline code.
    clean = clean.replace(/`([^`]+)`/g, "$1");

    // Keep image descriptions, not image URLs.
    clean = clean.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

    // Keep link names, remove link addresses.
    clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Remove raw web addresses.
    clean = clean.replace(/https?:\/\/\S+/gi, " ");

    // Remove Markdown headings and formatting.
    clean = clean.replace(/^#{1,6}\s*/gm, "");
    clean = clean.replace(/^\s*[-*+]\s+/gm, "");
    clean = clean.replace(/^\s*\d+[.)]\s+/gm, "");
    clean = clean.replace(/^\s*>\s?/gm, "");
    clean = clean.replace(/[*_~]{1,3}/g, "");
    clean = clean.replace(/[*#`]/g, "");

    // Remove HTML tags.
    clean = clean.replace(/<[^>]*>/g, " ");

    // Decode common HTML entities.
    clean = clean
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, " and ")
      .replace(/&lt;/gi, " less than ")
      .replace(/&gt;/gi, " greater than ")
      .replace(/&quot;/gi, "")
      .replace(/&#39;/gi, "");

    // Make common symbols sound natural.
    clean = clean
      .replace(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/g, "$1 rupees")
      .replace(/(\d+(?:\.\d+)?)%/g, "$1 percent")
      .replace(/&/g, " and ");

    // Remove decorative symbols and repeated punctuation.
    clean = clean.replace(/[ \t]+/g, " ");
    clean = clean.replace(/\n{2,}/g, ". ");
    clean = clean.replace(/\s+([,.!?;:])/g, "$1");
    clean = clean.replace(/([,.!?]){2,}/g, "$1");

    return clean.trim();
  }

  // -----------------------------------
  // SELECT NATURAL AVAILABLE VOICE
  // -----------------------------------

  function chooseVoice(text = "") {
    if (!("speechSynthesis" in window)) return;

    const voices = window.speechSynthesis.getVoices();

    if (!voices.length) {
      preferredVoice = null;
      return;
    }

    const wantsHindi = /[\u0900-\u097F]/.test(text);

    const preferredLanguage = wantsHindi
      ? /^(hi|hi-IN)/i
      : /^(en-IN|en-GB|en-US|en)/i;

    const preferredNames =
      /female|zira|aria|jenny|samantha|heera/i;

    preferredVoice =
      voices.find(
        (voice) =>
          preferredLanguage.test(voice.lang) &&
          preferredNames.test(voice.name)
      ) ||
      voices.find((voice) =>
        preferredLanguage.test(voice.lang)
      ) ||
      voices.find((voice) =>
        preferredNames.test(voice.name)
      ) ||
      voices[0] ||
      null;
  }

  // -----------------------------------
  // SPEAK AI RESPONSES
  // -----------------------------------

  window.WEDNESDAY_SPEAK = function (text) {
    if (!("speechSynthesis" in window) || !text) return;

    // Stop previous speech.
    window.speechSynthesis.cancel();

    const cleanText = cleanForSpeech(text);

    if (!cleanText) return;

    chooseVoice(cleanText);

    const utterance = new SpeechSynthesisUtterance(cleanText);

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang || "en-IN";
    } else {
      utterance.lang = /[\u0900-\u097F]/.test(cleanText)
        ? "hi-IN"
        : "en-IN";
    }

   
// Natural speaking settings.
utterance.rate = 0.96;
utterance.pitch = 1.0;
utterance.volume = 1.0;

// Character animation: start speaking.
utterance.onstart = () => {
  if (typeof window.WEDNESDAY_SET_STATE === "function") {
    window.WEDNESDAY_SET_STATE("speaking");
  }
};

// Character animation: return to idle after speaking.
utterance.onend = () => {
  if (typeof window.WEDNESDAY_SET_STATE === "function") {
    window.WEDNESDAY_SET_STATE("idle");
  }
};

utterance.onerror = () => {
  if (typeof window.WEDNESDAY_SET_STATE === "function") {
    window.WEDNESDAY_SET_STATE("error");
  }
};

window.speechSynthesis.speak(utterance);
};

  // -----------------------------------
  // MICROPHONE CONTROLS
  // -----------------------------------

  function addVoiceControls() {
    const compose = $("#chat-form");
    const input = $("#chat-input");

    if (!compose || !input || $("#wednesday-mic-button")) return;

    const mic = document.createElement("button");

    mic.type = "button";
    mic.id = "wednesday-mic-button";
    mic.className = "secondary-btn";
    mic.textContent = "🎙 Speak";

    mic.style.cssText =
      "white-space:nowrap;min-height:44px;padding:10px 14px;cursor:pointer;";

    const status = document.createElement("small");

    status.id = "wednesday-voice-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Voice ready · tap Speak to talk";

    status.style.cssText =
      "display:block;flex-basis:100%;padding:4px 2px;color:var(--muted,#8b91a5);font-size:12px;";

    const submit = compose.querySelector('button[type="submit"]');

    if (submit) {
      compose.insertBefore(mic, submit);
    } else {
      compose.append(mic);
    }

    compose.append(status);

    mic.addEventListener("click", async () => {
      if (busy) return;

      if (!recording) {
        await startRecording();
      } else {
        await stopAndTranscribe();
      }
    });
  }

  // -----------------------------------
  // START RECORDING
  // -----------------------------------

  async function startRecording() {
    try {
      if (typeof window.WEDNESDAY_INTERRUPT === "function") {
        window.WEDNESDAY_INTERRUPT();
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone unavailable. Open WEDNESDAY using HTTPS."
        );
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mimeType = MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus"
      )
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      recorder = new MediaRecorder(stream, { mimeType });

      chunks = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) {
          chunks.push(event.data);
        }
      });

      recorder.start(250);

      recording = true;

      setStatus(
        "Listening… speak clearly, then tap Stop & send",
        "recording"
      );

    } catch (error) {
      console.error("WEDNESDAY microphone error:", error);

      cleanup();
      recording = false;

      setStatus(
        "Microphone error: " + getErrorMessage(error),
        "error"
      );
    }
  }

  // -----------------------------------
  // STOP AND TRANSCRIBE
  // -----------------------------------

  async function stopAndTranscribe() {
    if (!recorder || !recording) return;

    busy = true;
    recording = false;

    setStatus("Transcribing your voice…", "busy");

    try {
      const currentRecorder = recorder;

      const finished = new Promise((resolve, reject) => {
        currentRecorder.addEventListener(
          "stop",
          resolve,
          { once: true }
        );

        currentRecorder.addEventListener(
          "error",
          (event) => {
            reject(
              event.error || new Error("Audio recording failed.")
            );
          },
          { once: true }
        );
      });

      currentRecorder.stop();

      await finished;

      const blob = new Blob(chunks, {
        type: currentRecorder.mimeType || "audio/webm"
      });

      cleanup();

      if (!blob.size) {
        throw new Error("No audio was recorded. Please try again.");
      }

      // FastAPI expects the multipart field to be named "file".
      const form = new FormData();

      form.append(
        "file",
        blob,
        "wednesday-recording.webm"
      );

      const response = await fetch(TRANSCRIBE_URL, {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        let detail =
          "Voice server returned HTTP " + response.status;

        try {
          const errorData = await response.json();
          detail = getErrorMessage(errorData.detail || errorData);
        } catch (_) {}

        throw new Error(detail);
      }

      const result = await response.json();
      const transcript = (result.text || "").trim();

      if (!transcript) {
        setStatus(
          "I couldn't hear clear words. Please try again.",
          "error"
        );
        return;
      }

      const input = $("#chat-input");
      const chatForm = $("#chat-form");

      if (!input || !chatForm) {
        throw new Error("Chat input was not found.");
      }

      input.disabled = false;
      input.value = transcript;

      setStatus(
        "Heard: " + transcript,
        "ready"
      );

      // Send recognised words to WEDNESDAY.
      chatForm.requestSubmit();

    } catch (error) {
      console.error("WEDNESDAY voice error:", error);

      setStatus(
        "Voice error: " + getErrorMessage(error),
        "error"
      );

    } finally {
      cleanup();
      busy = false;
    }
  }

  // -----------------------------------
  // RELEASE MICROPHONE
  // -----------------------------------

  function cleanup() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    stream = null;
    recorder = null;
    chunks = [];
  }

  // -----------------------------------
  // INITIALIZE
  // -----------------------------------

  if ("speechSynthesis" in window) {
    chooseVoice();

    window.speechSynthesis.addEventListener?.(
      "voiceschanged",
      () => chooseVoice()
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      addVoiceControls
    );
  } else {
    addVoiceControls();
  }

})();
