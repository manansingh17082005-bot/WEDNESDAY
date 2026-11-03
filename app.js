
/* =========================================================
   WEDNESDAY — Main Application
   Local AI: Ollama
   Storage: Browser localStorage
   ========================================================= */

/* ---------- CONFIGURATION ---------- */

const OLLAMA_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "llama3.2";

const STORAGE_KEYS = {
  tasks: "wednesday_tasks",
  clients: "wednesday_clients",
  settings: "wednesday_settings"
};

const WEDNESDAY_SYSTEM_PROMPT = `
You are WEDNESDAY, a helpful, professional personal AI assistant.

Your responsibilities:
1. Help the user manage tasks, clients and daily work.
2. Help find potential business leads using ethical and permitted methods.
3. Create search strategies for Excel, data entry, video editing,
   website development, social media management, data analysis and logo design.
4. Write professional outreach messages, follow-ups and business proposals.
5. Help with business research, spreadsheets, productivity and learning.

Rules:
- Be practical, clear and professional.
- Never invent real businesses, contact details, reviews or search results.
- Clearly distinguish search suggestions from verified leads.
- Never claim that you searched a website unless a real search was performed.
- Never send messages or contact anyone automatically.
- Ask for confirmation before consequential actions.
- Keep the user's initial budget at zero unless they change it.
- Give step-by-step instructions when helping with technical work.
`;

/* ---------- GLOBAL STATE ---------- */

const conversationHistory = [];
let activeRequestController = null;
let activeRequestId = 0;

let tasks = loadData(STORAGE_KEYS.tasks, []);
let clients = loadData(STORAGE_KEYS.clients, []);

let supabaseClient = null;
let supabaseAuthReady = false;

/* ---------- GENERAL HELPERS ---------- */

function $(id) {
  return document.getElementById(id);
}

function loadData(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error("Storage read error:", error);
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Storage save error:", error);
    return false;
  }
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function showStatus(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#c44d4d" : "";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function setWednesdayCharacterState(state) {
  const stage = $("wednesday-stage");
  if (!stage) return;

  const allowed = [
    "idle", "listening", "thinking",
    "speaking", "happy", "error"
  ];

  stage.dataset.state = allowed.includes(state) ? state : "idle";
}

window.WEDNESDAY_SET_STATE = setWednesdayCharacterState;

window.WEDNESDAY_INTERRUPT = function () {
  if (activeRequestController) {
    activeRequestController.abort();
    activeRequestController = null;
  }

  activeRequestId++;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  setWednesdayCharacterState("idle");
};

/* ---------- OLLAMA CONNECTION ---------- */

async function askWednesday(message, onText = () => {}, signal) {
  setWednesdayCharacterState("thinking");

  const messages = [
    { role: "system", content: WEDNESDAY_SYSTEM_PROMPT },
    ...conversationHistory
  ];

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      options: {
        temperature: 0.6
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `Ollama error: ${response.status} ${response.statusText}`
    );
  }

  if (!response.body) {
    throw new Error("Ollama returned no streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullAnswer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Request stopped", "AbortError");
      }

      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const data = JSON.parse(line);

        if (data.error) throw new Error(data.error);

        const token = data.message?.content || "";

        if (token) {
          fullAnswer += token;
          onText(fullAnswer);
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const data = JSON.parse(buffer);

      if (data.error) throw new Error(data.error);

      const token = data.message?.content || "";

      if (token) {
        fullAnswer += token;
        onText(fullAnswer);
      }
    }

    if (!fullAnswer.trim()) {
      throw new Error("WEDNESDAY received an empty response.");
    }

    return fullAnswer;
  } finally {
    reader.releaseLock();
  }
}

async function askWednesdayOnce(prompt) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: WEDNESDAY_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      stream: false,
      options: { temperature: 0.6 }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  const answer = data.message?.content?.trim();

  if (!answer) {
    throw new Error("WEDNESDAY returned an empty response.");
  }

  return answer;
}

/* ---------- PAGE NAVIGATION ---------- */

const pageTitles = {
  overview: "Overview",
  assistant: "WEDNESDAY Assistant",
  "lead-generation": "Lead Generation",
  clients: "Client Management",
  outreach: "Outreach Studio",
  messages: "Messages",
  personal: "Personal Space",
  coach: "AI Coach",
  settings: "Settings"
};

function showPage(pageName) {
  document.querySelectorAll("[id^='page-']").forEach(page => {
    page.classList.toggle(
      "active",
      page.id === `page-${pageName}`
    );

    if (page.id !== `page-${pageName}`) {
      page.style.display = "none";
    } else {
      page.style.display = "";
    }
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  setText("page-title", pageTitles[pageName] || "WEDNESDAY");

  const nav = $("nav");
  if (nav) {
    nav.querySelectorAll("[data-page]").forEach(button => {
      button.setAttribute(
        "aria-current",
        button.dataset.page === pageName ? "page" : "false"
      );
    });
  }
}

function initializeNavigation() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

  showPage("overview");
}

/* ---------- DASHBOARD ---------- */

function updateDashboard() {
  setText("client-count", clients.length);
  setText("lead-count", "0");
  setText("task-count", tasks.filter(task => !task.completed).length);

  const dateLabel = $("date-label");
  if (dateLabel) {
    dateLabel.textContent = new Date().toLocaleDateString(
      undefined,
      { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    );
  }
}

/* ---------- TASK MANAGEMENT ---------- */

function renderTasks() {
  const list = $("task-list");
  if (!list) return;

  if (!tasks.length) {
    list.innerHTML = "<li>No tasks yet. Add your first task.</li>";
    updateDashboard();
    return;
  }

  list.innerHTML = tasks.map(task => `
    <li class="task-item" data-task-id="${escapeHTML(task.id)}">
      <label>
        <input
          type="checkbox"
          data-task-complete="${escapeHTML(task.id)}"
          ${task.completed ? "checked" : ""}
        >
        <span style="${task.completed ? "text-decoration:line-through;opacity:.6" : ""}">
          ${escapeHTML(task.text)}
        </span>
      </label>
      <button
        type="button"
        class="secondary-btn"
        data-task-delete="${escapeHTML(task.id)}"
      >Delete</button>
    </li>
  `).join("");

  list.querySelectorAll("[data-task-complete]").forEach(input => {
    input.addEventListener("change", () => {
      const task = tasks.find(item => item.id === input.dataset.taskComplete);
      if (!task) return;

      task.completed = input.checked;
      saveData(STORAGE_KEYS.tasks, tasks);
      renderTasks();
    });
  });

  list.querySelectorAll("[data-task-delete]").forEach(button => {
    button.addEventListener("click", () => {
      tasks = tasks.filter(
        item => item.id !== button.dataset.taskDelete
      );

      saveData(STORAGE_KEYS.tasks, tasks);
      renderTasks();
    });
  });

  updateDashboard();
}

function initializeTasks() {
  const form = $("task-form");
  const input = $("task-input");

  if (!form || !input) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    tasks.unshift({
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: new Date().toISOString()
    });

    saveData(STORAGE_KEYS.tasks, tasks);
    input.value = "";
    renderTasks();
  });

  renderTasks();
}

/* ---------- CHAT UI ---------- */

function addChatMessage(text, type = "assistant") {
  const body = $("chat-body");
  if (!body) return null;

  const bubble = document.createElement("div");
  bubble.className = type === "user" ? "user-bubble" : "assistant-bubble";
  bubble.textContent = text;

  body.appendChild(bubble);
  body.scrollTop = body.scrollHeight;

  return bubble;
}

function initializeChat() {
  const form = $("chat-form");
  const input = $("chat-input");

  if (!form || !input) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const message = input.value.trim();
    if (!message) return;

    window.WEDNESDAY_INTERRUPT();

    const requestId = activeRequestId;
    const controller = new AbortController();
    activeRequestController = controller;

    addChatMessage(message, "user");
    input.value = "";

    conversationHistory.push({
      role: "user",
      content: message
    });

    const replyBubble = addChatMessage("Thinking...", "assistant");

    try {
      let firstToken = true;

      const answer = await askWednesday(
        message,
        fullText => {
          if (requestId !== activeRequestId) return;

          if (firstToken && replyBubble) {
            replyBubble.textContent = "";
            firstToken = false;
          }

          if (replyBubble) {
            replyBubble.textContent = fullText;
            const body = $("chat-body");
            if (body) body.scrollTop = body.scrollHeight;
          }
        },
        controller.signal
      );

      if (requestId !== activeRequestId) return;

      conversationHistory.push({
        role: "assistant",
        content: answer
      });

      if (typeof window.WEDNESDAY_SPEAK === "function") {
        setWednesdayCharacterState("speaking");
        window.WEDNESDAY_SPEAK(answer);
      } else {
        setWednesdayCharacterState("idle");
      }
    } catch (error) {
      if (error.name === "AbortError") return;

      console.error(error);

      if (replyBubble) {
        replyBubble.textContent =
          `I couldn't connect to the local AI. ${error.message}`;
      }

      setWednesdayCharacterState("error");
    } finally {
      if (requestId === activeRequestId) {
        activeRequestController = null;
      }
    }
  });
}

/* ---------- CLIENT MANAGEMENT ---------- */

function renderClients() {
  const table = $("client-table");
  if (!table) return;

  if (!clients.length) {
    table.innerHTML = "<p>No clients added yet.</p>";
    updateDashboard();
    return;
  }

  table.innerHTML = `
    <div class="client-list">
      ${clients.map(client => `
        <div class="client-row">
          <strong>${escapeHTML(client.name)}</strong>
          <span>${escapeHTML(client.contact || "No contact")}</span>
          <span>${escapeHTML(client.service || "Not specified")}</span>
          <button
            type="button"
            class="secondary-btn"
            data-client-delete="${escapeHTML(client.id)}"
          >Delete</button>
        </div>
      `).join("")}
    </div>
  `;

  table.querySelectorAll("[data-client-delete]").forEach(button => {
    button.addEventListener("click", () => {
      clients = clients.filter(
        client => client.id !== button.dataset.clientDelete
      );

      saveData(STORAGE_KEYS.clients, clients);
      renderClients();
    });
  });

  updateDashboard();
}

function initializeClients() {
  const form = $("client-form");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    const name = $("client-name")?.value.trim();
    const contact = $("client-contact")?.value.trim();
    const service = $("client-service")?.value.trim();

    if (!name) return;

    clients.unshift({
      id: crypto.randomUUID(),
      name,
      contact,
      service,
      createdAt: new Date().toISOString()
    });

    saveData(STORAGE_KEYS.clients, clients);
    form.reset();
    renderClients();
  });

  renderClients();
}

/* ---------- LEAD GENERATION ---------- */

function getCheckedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
    .map(input => input.value);
}

function initializeLeadGeneration() {
  const searchButton = $("lead-search-btn");
  const clearButton = $("lead-clear-btn");

  if (searchButton) {
    searchButton.addEventListener("click", async () => {
      const services = getCheckedValues("lead-service");
      const sources = getCheckedValues("lead-source");

      const businessType = $("lead-business-type")?.value.trim();
      const location = $("lead-location")?.value.trim();
      const keywords = $("lead-keywords")?.value.trim();
      const limit = $("lead-limit")?.value || "20";

      if (!services.length) {
        showStatus("lead-search-status", "Select at least one service.", true);
        return;
      }

      if (!businessType || !location) {
        showStatus(
          "lead-search-status",
          "Enter a business type and location.",
          true
        );
        return;
      }

      if (!sources.length) {
        showStatus("lead-search-status", "Select at least one source.", true);
        return;
      }

      searchButton.disabled = true;
      showStatus("lead-search-status", "WEDNESDAY is preparing your search plan...");

      const prompt = `
Create a practical lead-generation search plan.

Services I offer:
${services.join(", ")}

Target business type:
${businessType}

Target location:
${location}

Additional keywords:
${keywords || "Suggest relevant keywords."}

Preferred sources:
${sources.join(", ")}

Desired lead target:
${limit}

Return:
1. A short search strategy.
2. Search queries for each selected source.
3. Useful filters to identify potential customers.
4. A simple lead qualification checklist.
5. A suggested spreadsheet structure.

Important:
Do not invent businesses, names, phone numbers, email addresses,
Instagram handles or verified leads.
Return search queries and research instructions only.
`;

      try {
        const result = await askWednesdayOnce(prompt);

        const output = $("lead-search-results");
        if (output) {
          output.textContent = result;
          output.style.whiteSpace = "pre-wrap";
        }

        showStatus(
          "lead-search-status",
          "Search plan generated. These are suggestions, not verified live leads."
        );
      } catch (error) {
        console.error(error);
        showStatus(
          "lead-search-status",
          `Could not generate the plan: ${error.message}`,
          true
        );
      } finally {
        searchButton.disabled = false;
      }
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      [
        "lead-business-type",
        "lead-location",
        "lead-keywords"
      ].forEach(id => {
        if ($(id)) $(id).value = "";
      });

      const output = $("lead-search-results");
      if (output) output.textContent = "";

      showStatus("lead-search-status", "Search form cleared.");
    });
  }
}

/* ---------- OUTREACH STUDIO ---------- */

function initializeOutreach() {
  const generateButton = $("outreach-generate-btn");
  const clearButton = $("outreach-clear-btn");
  const copyButton = $("outreach-copy-btn");

  if (generateButton) {
    generateButton.addEventListener("click", async () => {
      const business = $("outreach-business")?.value.trim();
      const service = $("outreach-service")?.value;
      const channel = $("outreach-channel")?.value;
      const tone = $("outreach-tone")?.value;
      const observation = $("outreach-observation")?.value.trim();
      const context = $("outreach-context")?.value.trim();

      if (!business || !service) {
        showStatus(
          "outreach-status",
          "Enter the business name and choose a service.",
          true
        );
        return;
      }

      generateButton.disabled = true;
      showStatus("outreach-status", "Writing your outreach draft...");

      const prompt = `
Write a personalised first-contact outreach message.

Business name: ${business}
Service offered: ${service}
Contact channel: ${channel}
Tone: ${tone}
Specific observation about the business: ${observation || "Not supplied"}
Additional context: ${context || "Not supplied"}

Requirements:
- Start naturally and professionally.
- Mention a relevant business opportunity.
- Explain how the service may help.
- Avoid unrealistic promises and guaranteed results.
- Do not pretend we have already worked with this business.
- Include one clear call to action.
- Keep it suitable for the selected contact channel.
- Return only the ready-to-review message.
`;

      try {
        const draft = await askWednesdayOnce(prompt);
        const output = $("outreach-draft");

        if (output) output.value = draft;

        showStatus(
          "outreach-status",
          "Draft created. Review it before sending."
        );
      } catch (error) {
        console.error(error);
        showStatus(
          "outreach-status",
          `Could not generate the draft: ${error.message}`,
          true
        );
      } finally {
        generateButton.disabled = false;
      }
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      [
        "outreach-business",
        "outreach-observation",
        "outreach-context",
        "outreach-draft"
      ].forEach(id => {
        if ($(id)) $(id).value = "";
      });

      showStatus("outreach-status", "Outreach form cleared.");
    });
  }

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const draft = $("outreach-draft")?.value.trim();

      if (!draft) {
        showStatus("outreach-status", "There is no draft to copy.", true);
        return;
      }

      try {
        await navigator.clipboard.writeText(draft);
        showStatus("outreach-status", "Draft copied to clipboard.");
      } catch (error) {
        showStatus(
          "outreach-status",
          "Clipboard access failed. Select and copy the draft manually.",
          true
        );
      }
    });
  }
}

/* ---------- WHATSAPP REPLY ASSISTANT ---------- */

function initializeWhatsAppAssistant() {
  const generateButton = $("wa-generate-btn");
  const clearButton = $("wa-clear-btn");
  const copyButton = $("wa-copy-btn");

  if (generateButton) {
    generateButton.addEventListener("click", async () => {
      const customerName = $("wa-customer-name")?.value.trim();
      const language = $("wa-language")?.value;
      const tone = $("wa-tone")?.value;
      const context = $("wa-context")?.value.trim();
      const customerMessage = $("wa-customer-message")?.value.trim();

      if (!customerMessage) {
        showStatus("wa-status", "Paste the customer's message first.", true);
        return;
      }

      generateButton.disabled = true;
      showStatus("wa-status", "Preparing your reply...");

      const prompt = `
Write a WhatsApp reply to a customer.

Customer name: ${customerName || "Not provided"}
Reply language: ${language}
Tone: ${tone}
Business context: ${context || "Not provided"}

Customer's message:
${customerMessage}

Write a clear, natural, helpful reply.
Do not invent prices, delivery dates, policies or commitments.
Return only the reply text.
`;

      try {
        const reply = await askWednesdayOnce(prompt);
        const output = $("wa-reply-output");

        if (output) {
          if ("value" in output) output.value = reply;
          else output.textContent = reply;
        }

        showStatus("wa-status", "Reply generated. Review before sending.");
      } catch (error) {
        console.error(error);
        showStatus("wa-status", `Reply failed: ${error.message}`, true);
      } finally {
        generateButton.disabled = false;
      }
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      [
        "wa-customer-name",
        "wa-context",
        "wa-customer-message",
        "wa-reply-output"
      ].forEach(id => {
        const element = $(id);
        if (!element) return;

        if ("value" in element) element.value = "";
        else element.textContent = "";
      });

      showStatus("wa-status", "Reply form cleared.");
    });
  }

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const output = $("wa-reply-output");
      const reply = output?.value ?? output?.textContent ?? "";

      if (!reply.trim()) {
        showStatus("wa-status", "There is no reply to copy.", true);
        return;
      }

      try {
        await navigator.clipboard.writeText(reply);
        showStatus("wa-status", "Reply copied.");
      } catch (error) {
        showStatus("wa-status", "Could not copy the reply.", true);
      }
    });
  }
}

/* ---------- SETTINGS AND LOCAL AI STATUS ---------- */

async function checkLocalAI() {
  const status = $("ai-status");

  try {
    const response = await fetch("http://localhost:11434/api/tags");

    if (!response.ok) throw new Error("Ollama is not responding.");

    const data = await response.json();
    const models = data.models || [];
    const modelExists = models.some(model =>
      model.name === OLLAMA_MODEL ||
      model.name.startsWith(`${OLLAMA_MODEL}:`)
    );

    if (status) {
      status.textContent = modelExists
        ? `Connected — ${OLLAMA_MODEL}`
        : `Ollama connected, but ${OLLAMA_MODEL} was not found.`;
    }

    return modelExists;
  } catch (error) {
    if (status) status.textContent = "Not connected — start Ollama on this computer.";
    return false;
  }
}

function initializePauseControls() {
  const pauseButton = $("pause-btn");
  const masterPause = $("master-pause");

  function updatePauseState(paused) {
    window.WEDNESDAY_PAUSED = paused;

    if (pauseButton) {
      pauseButton.textContent = paused ? "Resume" : "Pause";
    }

    if (masterPause) masterPause.checked = paused;

    setText(
      "pause-status",
      paused ? "WEDNESDAY is paused." : "WEDNESDAY is active."
    );

    setText(
      "automation-state",
      paused ? "Paused" : "Active"
    );

    if (paused) window.WEDNESDAY_INTERRUPT();
  }

  if (pauseButton) {
    pauseButton.addEventListener("click", () => {
      updatePauseState(!window.WEDNESDAY_PAUSED);
    });
  }

  if (masterPause) {
    masterPause.addEventListener("change", () => {
      updatePauseState(masterPause.checked);
    });
  }

  updatePauseState(false);
}

/* ---------- SUPABASE ---------- */

function getSupabaseConfig() {
  let url = "";
  let key = "";

  try {
    if (typeof SUPABASE_URL !== "undefined") url = SUPABASE_URL;
    if (typeof SUPABASE_ANON_KEY !== "undefined") key = SUPABASE_ANON_KEY;
  } catch (_) {}

  url = url || window.SUPABASE_URL || "";
  key = key || window.SUPABASE_ANON_KEY || "";

  return {
    url: String(url).trim(),
    key: String(key).trim()
  };
}

function initializeSupabase() {
  const status = $("supabase-status");
  const config = getSupabaseConfig();

  if (
    !config.url ||
    !config.key ||
    !window.supabase?.createClient
  ) {
    if (status) status.textContent = "Not connected — check config.js.";
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(
      config.url,
      config.key
    );

    supabaseAuthReady = true;

    if (status) status.textContent = "Supabase client initialized.";

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      updateAuthInterface(session);
    });

    supabaseClient.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      updateAuthInterface(data.session);
    }).catch(error => {
      console.error("Supabase session error:", error);
    });
  } catch (error) {
    console.error("Supabase initialization error:", error);
    if (status) status.textContent = "Supabase initialization failed.";
  }
}

function updateAuthInterface(session) {
  const gate = $("auth-gate");
  const app = document.querySelector(".app-shell") ||
              document.querySelector(".app");

  if (gate) gate.style.display = session ? "none" : "";
  if (app && gate) app.style.display = session ? "" : "none";
}

function initializeAuthentication() {
  const form = $("login-form");
  const logoutButton = $("logout-btn");

  if (form) {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!supabaseAuthReady || !supabaseClient) {
        showStatus(
          "auth-message",
          "Supabase is not configured. Check config.js and Supabase settings.",
          true
        );
        return;
      }

      const email = $("login-email")?.value.trim();
      const password = $("login-password")?.value;

      if (!email || !password) {
        showStatus("auth-message", "Enter your email and password.", true);
        return;
      }

      const button = $("login-button");
      if (button) button.disabled = true;

      try {
        const { error } = await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        showStatus("auth-message", "Login successful.");
      } catch (error) {
        showStatus("auth-message", error.message, true);
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      if (!supabaseClient) return;

      const { error } = await supabaseClient.auth.signOut();

      if (error) {
        console.error("Logout error:", error);
      }
    });
  }
}

/* ---------- SETTINGS FORM ---------- */

function initializeSettings() {
  const saveButton = $("save-config");
  const testButton = $("test-supabase");

  const savedSettings = loadData(STORAGE_KEYS.settings, {});

  if ($("supabase-url") && savedSettings.url) {
    $("supabase-url").value = savedSettings.url;
  }

  if (saveButton) {
    saveButton.addEventListener("click", () => {
      const url = $("supabase-url")?.value.trim() || "";
      const key = $("supabase-key")?.value.trim() || "";

      if (!url || !key) {
        showStatus("config-result", "Enter both values first.", true);
        return;
      }

      /*
       * This saves settings only in this browser.
       * It does not rewrite config.js or securely store secrets.
       */
      saveData(STORAGE_KEYS.settings, { url, key });

      showStatus(
        "config-result",
        "Saved in this browser. Update config.js separately if required."
      );
    });
  }

  if (testButton) {
    testButton.addEventListener("click", async () => {
      const url = $("supabase-url")?.value.trim();
      const key = $("supabase-key")?.value.trim();

      if (!url || !key) {
        showStatus("config-result", "Enter the Supabase URL and public key.", true);
        return;
      }

      try {
        const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`
          }
        });

        if (!response.ok) {
          throw new Error(`Supabase returned ${response.status}`);
        }

        showStatus("config-result", "Supabase endpoint responded successfully.");
      } catch (error) {
        showStatus("config-result", error.message, true);
      }
    });
  }
}

/* ---------- INITIALIZATION ---------- */

document.addEventListener("DOMContentLoaded", () => {
  initializeNavigation();
  initializeTasks();
  initializeClients();
  initializeChat();
  initializeLeadGeneration();
  initializeOutreach();
  initializeWhatsAppAssistant();
  initializePauseControls();
  initializeSettings();

  initializeSupabase();
  initializeAuthentication();

  checkLocalAI();
  updateDashboard();

  console.log("WEDNESDAY application initialized.");
});
