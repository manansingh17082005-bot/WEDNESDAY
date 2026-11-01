/* =========================================
   WEDNESDAY - OLLAMA + TWO-WAY VOICE
   Model: Llama 3.2
   ========================================= */

(() => {
  const OLLAMA_URL = "http://localhost:11434/api/chat";
  const MODEL = "llama3.2";

  const SYSTEM_PROMPT = `
You are WEDNESDAY, a personal AI assistant.
Your personality is intelligent, confident, witty, calm and helpful.
You may use a little dry humour, but always remain respectful.
You are not a generic chatbot. Your name is Wednesday.

Understand both Hindi and English, including Hinglish.
Reply in the same language the user uses.
If the user speaks Hindi, reply in Hindi.
If the user speaks English, reply in English.
If the user mixes both, you may mix both naturally.

Give clear, practical answers.
Do not claim to perform actions you cannot actually perform.
`;

  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const chatBody = document.getElementById("chat-body");

  if (!form || !input || !chatBody) {
    console.error("WEDNESDAY: Chat elements not found.");
    return;
  }

  let conversation = [];
  let recognition = null;
  let listening = false;

  // ---------- CREATE VOICE CONTROLS ----------

  const controls = document.createElement("div");
  controls.id = "wednesday-voice-controls";

  controls.innerHTML = `
    <div class="wd-status" id="wd-status">
      Connecting to Ollama...
    </div>

    <div class="wd-settings">
      <label>
        Language
        <select id="wd-language">
          <option value="auto">Auto (Hindi + English)</option>
          <option value="en-IN">English</option>
          <option value="hi-IN">Hindi</option>
        </select>
      </label>

      <label>
        Voice
        <select id="wd-voice">
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="kratos">Kratos-inspired Deep</option>
        </select>
      </label>
    </div>

    <div class="wd-buttons">
      <button type="button" id="wd-mic">🎙 Speak</button>
      <button type="button" id="wd-test">🔊 Test Voice</button>
      <button type="button" id="wd-stop">⏹ Stop Voice</button>
    </div>

    <div class="wd-note">
      Voice recognition requires microphone permission.
    </div>
  `;

  const style = document.createElement("style");

  style.textContent = `
    #wednesday-voice-controls {
      padding: 12px;
      margin: 10px 0;
      border: 1px solid rgba(128,128,128,.3);
      border-radius: 12px;
    }

    #wednesday-voice-controls .wd-status {
      font-size: 13px;
      margin-bottom: 10px;
      color: #16a34a;
    }

    #wednesday-voice-controls .wd-settings {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }

    #wednesday-voice-controls label {
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-size: 12px;
    }

    #wednesday-voice-controls select {
      padding: 9px;
      border-radius: 8px;
      max-width: 100%;
    }

    #wednesday-voice-controls .wd-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    #wednesday-voice-controls button {
      padding: 10px 13px;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
    }

    #wd-mic.wd-listening {
      background: #dc2626;
      color: white;
    }

    #wednesday-voice-controls .wd-note {
      margin-top: 9px;
      font-size: 11px;
      opacity: .7;
    }

    .wd-chat-message {
      padding: 11px 14px;
      margin: 9px 0;
      border-radius: 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.5;
    }

    .wd-user-message {
      margin-left: 12%;
      background: rgba(70,120,220,.14);
    }

    .wd-ai-message {
      margin-right: 12%;
      background: rgba(128,128,128,.13);
    }
  `;

  document.head.appendChild(style);
  form.parentNode.insertBefore(controls, form);

  const status = document.getElementById("wd-status");
  const languageSelect = document.getElementById("wd-language");
  const voiceSelect = document.getElementById("wd-voice");
  const micButton = document.getElementById("wd-mic");

  // ---------- CHAT DISPLAY ----------

  function addMessage(text, sender) {
    const message = document.createElement("div");

    message.className =
      "wd-chat-message " +
      (sender === "user" ? "wd-user-message" : "wd-ai-message");

    const heading = document.createElement("strong");
    heading.textContent = sender === "user" ? "You" : "Wednesday";

    const content = document.createElement("div");
    content.textContent = text;

    message.appendChild(heading);
    message.appendChild(content);

    chatBody.appendChild(message);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function setStatus(message, color) {
    status.textContent = message;
    status.style.color = color || "";
  }

  // ---------- CHECK OLLAMA ----------

  async function checkOllama() {
    try {
      const response = await fetch(
        "http://localhost:11434/api/tags"
      );

      if (!response.ok) {
        throw new Error("Ollama is not responding.");
      }

      const data = await response.json();

      const found = (data.models || []).some(model =>
        model.name.startsWith("llama3.2")
      );

      if (!found) {
        setStatus("Ollama connected, but Llama 3.2 was not found.", "#d97706");
        return;
      }

      setStatus("● Connected to Ollama — Llama 3.2", "#16a34a");

    } catch (error) {
      setStatus(
        "● Ollama not connected. Start Ollama on this computer.",
        "#dc2626"
      );
    }
  }

  checkOllama();

  // ---------- SEND MESSAGE TO LLAMA ----------

  async function sendMessage(text) {
    text = text.trim();

    if (!text) return;

    addMessage(text, "user");

    conversation.push({
      role: "user",
      content: text
    });

    input.value = "";
    setStatus("Wednesday is thinking...", "#d97706");

    try {
      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          stream: false,
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT
            },
            ...conversation
          ]
        })
      });

      if (!response.ok) {
        throw new Error("Ollama returned an error: " + response.status);
      }

      const data = await response.json();

      const reply = data.message?.content;

      if (!reply) {
        throw new Error("No response received from Llama.");
      }

      conversation.push({
        role: "assistant",
        content: reply
      });

      addMessage(reply, "assistant");
      speak(reply);

      setStatus("● Wednesday is ready", "#16a34a");

    } catch (error) {
      console.error(error);

      conversation.pop();

      addMessage(
        "I cannot connect to Ollama right now. Please check that Ollama is running on this computer and that browser access is allowed.",
        "assistant"
      );

      setStatus("Connection error — check Ollama and CORS settings.", "#dc2626");
    }
  }

  // Capture the form before the older app.js submit handler.
  form.addEventListener("submit", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    sendMessage(input.value);
  }, true);

  // ---------- VOICE OUTPUT ----------

  function getVoice() {
    const voices = window.speechSynthesis
      ? window.speechSynthesis.getVoices()
      : [];

    const mode = voiceSelect.value;
    const hindi = languageSelect.value === "hi-IN";

    let candidates = voices.filter(voice => {
      if (languageSelect.value === "hi-IN") {
        return voice.lang.toLowerCase().startsWith("hi");
      }

      if (languageSelect.value === "en-IN") {
        return voice.lang.toLowerCase().startsWith("en");
      }

      return voice.lang.toLowerCase().startsWith("en") ||
             voice.lang.toLowerCase().startsWith("hi");
    });

    if (!candidates.length) candidates = voices;

    if (mode === "female") {
      return candidates.find(v =>
        /female|zira|samantha|heera|priya|neerja|swara/i.test(v.name)
      ) || candidates[0];
    }

    if (mode === "male" || mode === "kratos") {
      return candidates.find(v =>
        /male|david|mark|ravi|hemant|daniel|alex/i.test(v.name)
      ) || candidates[0];
    }

    return candidates[0];
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      setStatus("Speech output is not supported by this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    const mode = voiceSelect.value;
    const selectedVoice = getVoice();

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    if (languageSelect.value !== "auto") {
      utterance.lang = languageSelect.value;
    } else {
      utterance.lang = /[\u0900-\u097F]/.test(text)
        ? "hi-IN"
        : "en-IN";
    }

    if (mode === "female") {
      utterance.pitch = 1.15;
      utterance.rate = 1;
    } else if (mode === "male") {
      utterance.pitch = 0.9;
      utterance.rate = 0.95;
    } else {
      // Kratos-inspired deep voice effect.
      utterance.pitch = 0.55;
      utterance.rate = 0.82;
    }

    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  }

  // ---------- VOICE INPUT ----------

// ---------- WEDNESDAY WAKE WORD ----------

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let wakeEnabled = false;
let awaitingCommand = false;
let restarting = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();

  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  function updateRecognitionLanguage() {
    recognition.lang =
      languageSelect.value === "hi-IN"
        ? "hi-IN"
        : "en-IN";
  }

  languageSelect.addEventListener(
    "change",
    updateRecognitionLanguage
  );

  recognition.onstart = () => {
    listening = true;
    restarting = false;
    micButton.textContent = "🔴 Wake word ON";
    micButton.classList.add("wd-listening");
    setStatus("Listening for 'Wednesday'...", "#16a34a");
  };

  recognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;

      const transcript = event.results[i][0].transcript.trim();

      const wakePattern = /\b(?:hey\s+)?wednesday\b/i;

      if (!awaitingCommand) {
        const match = transcript.match(wakePattern);

        if (!match) continue;

        const command = transcript
          .slice(match.index + match[0].length)
          .replace(/^[\s,!.?]+/, "")
          .trim();

        if (command) {
          awaitingCommand = false;
          sendMessage(command);
        } else {
          awaitingCommand = true;
          setStatus("Wednesday activated! Listening for your command...", "#16a34a");
        }
      } else {
        awaitingCommand = false;
        sendMessage(transcript);
      }
    }
  };

  recognition.onerror = event => {
    console.error("Wake word error:", event.error);

    if (event.error === "not-allowed" ||
        event.error === "service-not-allowed") {
      wakeEnabled = false;
      setStatus("Microphone permission denied.", "#dc2626");
    } else if (event.error !== "no-speech" &&
               event.error !== "aborted") {
      setStatus("Voice recognition error: " + event.error, "#dc2626");
    }
  };

  recognition.onend = () => {
    listening = false;

    if (wakeEnabled && !restarting) {
      restarting = true;

      setTimeout(() => {
        if (!wakeEnabled) return;

        try {
          updateRecognitionLanguage();
          recognition.start();
        } catch (error) {
          console.log("Recognition restarting...", error);
        }
      }, 700);
    } else if (!wakeEnabled) {
      micButton.textContent = "🎙 Enable Wake Word";
      micButton.classList.remove("wd-listening");
      setStatus("Wake word is OFF.", "#d97706");
    }
  };

  micButton.textContent = "🎙 Enable Wake Word";

  micButton.addEventListener("click", () => {
    if (wakeEnabled) {
      wakeEnabled = false;
      awaitingCommand = false;

      try {
        recognition.stop();
      } catch (error) {}

      micButton.textContent = "🎙 Enable Wake Word";
      micButton.classList.remove("wd-listening");
      setStatus("Wake word is OFF.", "#d97706");
      return;
    }

    wakeEnabled = true;
    updateRecognitionLanguage();

    try {
      recognition.start();
    } catch (error) {
      wakeEnabled = false;
      setStatus("Could not start microphone. Try again.", "#dc2626");
    }
  });

} else {
  micButton.disabled = true;
  micButton.textContent = "Voice unsupported";
  setStatus("Please use Chrome or Edge for voice recognition.", "#d97706");
}
  // ---------- TEST AND STOP BUTTONS ----------

  document.getElementById("wd-test").addEventListener("click", () => {
    speak(
      "Hello. I am Wednesday. Your personal assistant is ready."
    );
  });

  document.getElementById("wd-stop").addEventListener("click", () => {
    window.speechSynthesis?.cancel();

    if (recognition && listening) {
      recognition.stop();
    }

    setStatus("Voice stopped.", "#16a34a");
  });

  // Load available browser voices.
  if ("speechSynthesis" in window) {
    window.speechSynthesis.getVoices();

    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

})();
