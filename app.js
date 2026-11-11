
/* =========================================================
   WEDNESDAY COMMAND CENTER
   Local-first application
   AI engine: Ollama
   Storage: Browser localStorage
   Supabase: Optional
   ========================================================= */

/* ================= CONFIGURATION ================= */

const OLLAMA_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "llama3.2";

const STORAGE_KEYS = {
  tasks: "wednesday_tasks",
  clients: "wednesday_clients",
  settings: "wednesday_settings"
};

const WEDNESDAY_SYSTEM_PROMPT = `
You are WEDNESDAY, Manan's calm, capable, disciplined personal AI and business operations assistant.
Personality: intelligent, composed, protective of the user's time, confident but never arrogant; concise by default, detailed when teaching. Use natural English or Hinglish matching the user's language.

PRIMARY MISSION
Help Manan build income-producing skills, find legitimate prospective clients, win freelance projects, manage work and learn technology. Be action-oriented: give the next useful step, not generic motivation.

KNOWN SERVICE AREAS
- Excel work, data entry, data cleaning, Google Sheets, reports, dashboards and trackers.
- Data analysis, basic SQL, Power BI and business reporting.
- Video editing, promotional reels, content creation and social media management.
- Flat 2D vector motion graphics and short animated videos made with CINE AI.
- Cafe and restaurant marketing, promotional campaigns, social content and local business outreach.
- Website creation, landing pages, logo/brand design and business promotion.
- Customer support, CRM setup, lead research and outreach.
Manan is building the WEDNESDAY assistant and wants to keep initial spending at ₹0. Prefer free/local-first solutions and disclose when a task genuinely requires a paid API, account, hosting plan or user action.

CORE RESPONSIBILITIES
1. Help plan the day, manage tasks, organise projects and maintain continuity.
2. Help discover potential clients for whichever service the user selects, in India or internationally.
3. Research prospects using real connected search functions when available; explain the source and evidence. Never fabricate businesses, contacts, hiring intent, budgets, reviews or project requests.
4. Qualify each prospect by service fit, public evidence, recency, public contact availability and next action. A score is a research priority, never a probability of hiring.
5. Prepare tailored first-contact messages, proposals, pricing options and sensible follow-up schedules.
6. Help manage a simple CRM: company, contact, service, source, evidence, status, last contact and next follow-up.
7. Teach Excel, data analysis, coding, websites, AI tools, marketing and sales in beginner-friendly steps.
8. Troubleshoot WEDNESDAY and other projects carefully; inspect existing code before suggesting replacement.
9. Turn vague goals into a short, realistic action plan and help complete it.
10. For daily check-ins, summarize today's recorded activity and recommend the next useful action. Mention blockers or pipeline details only when available; never imply a scheduled notification unless one is configured. Make clear when counts are local to this browser and do not imply revenue or clients won.
11. Help compare business ideas, create simple offers and pricing drafts, and prioritize low-cost ways to get the first client.
12. For stock-market questions, teach concepts and help analyze user-provided or currently verified public information. WEDNESDAY has no connected market-data feed; when a verified source is unavailable, say so and ask for dated data rather than guessing. Clearly date data, explain uncertainty and risk, never promise returns or present a guaranteed or personalized buy/sell instruction. Never place trades.

TRUTH AND SAFETY RULES
- Clearly distinguish verified facts, estimates, assumptions and suggestions.
- Never claim you searched, saved, sent, deployed, changed or tested something unless a tool or confirmed result proves it.
- Never send outreach, spend money, publish content, delete data or make consequential changes without explicit user approval.
- Never expose API keys, passwords, service-role keys or private customer data.
- Do not encourage spam, scraping behind logins, bypassing access controls or collecting private personal contact details. Use public business contact channels and respect opt-outs.
- If no live-search capability is connected, say so and provide a search plan; do not present imagined results as leads.
- Keep answers practical and easy to follow. For technical tasks, give exact file names, steps and complete code only when needed.
- Ask one focused question only when essential information is missing; otherwise make a sensible low-risk assumption and state it.
- Keep the initial budget at ₹0 unless Manan changes it.
`;

/* ================= GLOBAL STATE ================= */

const HISTORY_STORAGE_KEY = "wednesday_conversation_history";
const MAX_HISTORY_MESSAGES = 24;
const conversationHistory = loadData(HISTORY_STORAGE_KEY, []);
if (!Array.isArray(conversationHistory)) conversationHistory.length = 0;

function persistConversationHistory() {
  const recent = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  conversationHistory.splice(0, conversationHistory.length, ...recent);
  saveData(HISTORY_STORAGE_KEY, recent);
}

let activeRequestController = null;
let activeRequestId = 0;

let tasks = loadData(STORAGE_KEYS.tasks, []);
let clients = loadData(STORAGE_KEYS.clients, []);
let discoveredLeads = [];

let supabaseClient = null;
let supabaseAuthReady = false;
window.WEDNESDAY_SUPABASE_CLIENT = null;

window.WEDNESDAY_LOCAL_MODE = true;
window.WEDNESDAY_PAUSED = false;

/* ================= GENERAL HELPERS ================= */

function $(id) {
  return document.getElementById(id);
}

function loadData(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.error("Storage error:", error);
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Could not save data:", error);
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

function createId() {
  return window.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ================= WEDNESDAY CHARACTER STATE ================= */

function setWednesdayCharacterState(state) {
  const stage = $("wednesday-stage");
  if (!stage) return;

  const allowedStates = [
    "idle",
    "listening",
    "thinking",
    "speaking",
    "happy",
    "error"
  ];

  stage.dataset.state = allowedStates.includes(state)
    ? state
    : "idle";
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
  window.WEDNESDAY_SPEAK_STREAM_CANCEL?.();

  setWednesdayCharacterState("idle");
};

/* ================= OLLAMA STREAMING AI ================= */

async function askWednesday(message, onText = () => {}, signal) {
  setWednesdayCharacterState("thinking");

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: WEDNESDAY_SYSTEM_PROMPT },
        ...conversationHistory
      ],
      stream: true,
      keep_alive: "10m",
      options: {
        temperature: 0.5,
        num_predict: 384
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

        if (data.error) {
          throw new Error(data.error);
        }

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

      if (data.error) {
        throw new Error(data.error);
      }

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

/* Non-streaming request for smaller AI tasks */

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
      options: {
        temperature: 0.6
      }
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

/* ================= NAVIGATION ================= */

const pageTitles = {
  overview: "Overview",
  "dashboard-builder": "Dashboard Studio",
  assistant: "WEDNESDAY Assistant",
  "lead-generation": "Lead Generation",
  clients: "Client Management",
  outreach: "Outreach Studio",
  "business-hub": "Business Hub",
  messages: "Messages",
  personal: "Personal Space",
  coach: "AI Coach",
  settings: "Settings"
};

function showPage(pageName) {
  document.querySelectorAll("[id^='page-']").forEach(page => {
    const isActive = page.id === `page-${pageName}`;

    page.classList.toggle("active", isActive);
    page.style.display = isActive ? "" : "none";
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  setText("page-title", pageTitles[pageName] || "WEDNESDAY");
}

function initializeNavigation() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

  showPage("overview");
}

/* ================= DASHBOARD ================= */

function updateDashboard() {
  setText("client-count", clients.length);
  setText(
    "task-count",
    tasks.filter(task => !task.completed).length
  );

  setText("lead-count", discoveredLeads.length);

  const dateLabel = $("date-label");

  if (dateLabel) {
    dateLabel.textContent = new Date().toLocaleDateString(
      undefined,
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }
    );
  }
}

/* ================= TASK MANAGEMENT ================= */

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
      const task = tasks.find(
        item => item.id === input.dataset.taskComplete
      );

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
      id: createId(),
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

/* ================= CHAT ASSISTANT ================= */

function addChatMessage(text, type = "assistant") {
  const body = $("chat-body");
  if (!body) return null;

  const bubble = document.createElement("div");

  bubble.className = type === "user"
    ? "user-bubble"
    : "assistant-bubble";

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

    if (window.WEDNESDAY_PAUSED) {
      addChatMessage(
        "WEDNESDAY is paused. Resume the assistant to continue."
      );
      return;
    }

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
    persistConversationHistory();
    window.WEDNESDAY_ACTIVITY?.log?.("chat_message");

    const replyBubble = addChatMessage("Thinking...", "assistant");

    try {
      let answer = "";
      let toolSpeechStarted = false;
      let toolFirstToken = true;
      setWednesdayCharacterState("thinking");
      const toolResult = await window.WEDNESDAY_CHAT_TOOLS?.run(message, controller.signal, fullText => {
        if (requestId !== activeRequestId) return;
        if (toolFirstToken) {
          if (typeof window.WEDNESDAY_SPEAK_STREAM_START === "function") {
            window.WEDNESDAY_SPEAK_STREAM_START();
            toolSpeechStarted = true;
          }
          toolFirstToken = false;
        }
        if (replyBubble) replyBubble.textContent = fullText;
        window.WEDNESDAY_SPEAK_STREAM_PUSH?.(fullText);
      });

      if (toolResult?.handled) {
        answer = toolResult.answer || "I completed the requested research step.";
        if (replyBubble) replyBubble.textContent = answer;
        if (toolSpeechStarted) window.WEDNESDAY_SPEAK_STREAM_END?.();
      } else {
        let firstToken = true;
        const canStreamSpeech = typeof window.WEDNESDAY_SPEAK_STREAM_START === "function";
        if (canStreamSpeech) window.WEDNESDAY_SPEAK_STREAM_START();
        answer = await askWednesday(message, fullText => {
          if (requestId !== activeRequestId) return;
          if (firstToken && replyBubble) { replyBubble.textContent = ""; firstToken = false; }
          if (replyBubble) {
            replyBubble.textContent = fullText;
            const body = $("chat-body");
            if (body) body.scrollTop = body.scrollHeight;
          }
          window.WEDNESDAY_SPEAK_STREAM_PUSH?.(fullText);
        }, controller.signal);
        if (canStreamSpeech) window.WEDNESDAY_SPEAK_STREAM_END();
      }

      if (requestId !== activeRequestId) return;

      conversationHistory.push({
        role: "assistant",
        content: answer
      });
      persistConversationHistory();

      if (typeof window.WEDNESDAY_SPEAK === "function") {
        setWednesdayCharacterState("speaking");
        if ((toolResult?.handled && !toolSpeechStarted) || typeof window.WEDNESDAY_SPEAK_STREAM_START !== "function") window.WEDNESDAY_SPEAK(answer);
      } else {
        setWednesdayCharacterState("idle");
      }
    } catch (error) {
      window.WEDNESDAY_SPEAK_STREAM_CANCEL?.();
      if (error.name === "AbortError") return;

      console.error("Assistant error:", error);

      if (replyBubble) {
        replyBubble.textContent =
          `I couldn't complete that request. ${error.message}`;
      }

      setWednesdayCharacterState("error");
      window.WEDNESDAY_HANDSFREE?.resumeAfterRequest?.();
    } finally {
      if (requestId === activeRequestId) {
        activeRequestController = null;
      }
    }
  });
}

/* ================= CLIENT MANAGEMENT ================= */

function renderClients() {
  const table = $("client-table");
  if (!table) return;

  setText("client-total", `${clients.length} saved client${clients.length === 1 ? "" : "s"}`);
  const search = ($("client-search")?.value || "").trim().toLowerCase();
  const filtered = clients.filter(client =>
    [client.name, client.company, client.phone, client.email, client.contact, client.service, client.status]
      .some(value => String(value || "").toLowerCase().includes(search))
  );

  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="7" class="empty">${clients.length ? "No clients match your search." : "No clients added yet. Add your first client above."}</td></tr>`;
    updateDashboard();
    return;
  }

  table.innerHTML = filtered.map(client => {
    const digits = String(client.phone || "").replace(/\D/g, "");
    const whatsapp = digits.length >= 10 && digits.length <= 15
      ? `<a class="secondary-btn client-whatsapp" href="https://wa.me/${digits}" target="_blank" rel="noopener noreferrer">Open WhatsApp</a>`
      : '<span class="muted">Add valid phone</span>';

    return `<tr>
      <td><strong>${escapeHTML(client.name)}</strong></td>
      <td>${escapeHTML(client.company || "—")}</td>
      <td>${escapeHTML(client.phone || "—")}</td>
      <td>${escapeHTML(client.email || "—")}</td>
      <td>${escapeHTML(client.service || "—")}</td>
      <td><span class="client-status">${escapeHTML(client.status || "New")}</span></td>
      <td class="client-actions">${whatsapp}
        <button type="button" class="secondary-btn" data-client-delete="${escapeHTML(client.id)}">Delete</button>
      </td>
    </tr>`;
  }).join("");

  table.querySelectorAll("[data-client-delete]").forEach(button => {
    button.addEventListener("click", () => {
      const client = clients.find(item => item.id === button.dataset.clientDelete);
      if (!client || !window.confirm(`Delete ${client.name} from your client table?`)) return;
      clients = clients.filter(item => item.id !== button.dataset.clientDelete);
      saveData(STORAGE_KEYS.clients, clients);
      window.WEDNESDAY_CLOUD_SYNC?.syncClients(clients).catch(error => console.warn('CRM cloud sync:', error.message));
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
    const company = $("client-company")?.value.trim();
    const phone = $("client-phone")?.value.trim();
    const email = $("client-email")?.value.trim();
    const service = $("client-service")?.value.trim();
    const status = $("client-status")?.value || "New";

    if (!name) return;

    clients.unshift({
      id: createId(),
      name,
      company,
      phone,
      email,
      service,
      status,
      createdAt: new Date().toISOString()
    });

    saveData(STORAGE_KEYS.clients, clients);
    window.WEDNESDAY_ACTIVITY?.log?.("crm_added");
    window.WEDNESDAY_CLOUD_SYNC?.syncClients(clients).catch(error => console.warn('CRM cloud sync:', error.message));
    form.reset();
    renderClients();
    showStatus("client-status-message", "Client saved in this browser.");
  });

  $("client-search")?.addEventListener("input", renderClients);
  renderClients();
}

/* ================= LEAD GENERATION ================= */

function getCheckedValues(name) {
  return [
    ...document.querySelectorAll(
      `input[name="${name}"]:checked`
    )
  ].map(input => input.value);
}

function extractWhatsAppNumber(lead) {
  const text = [lead.website, lead.snippet, lead.phone].filter(Boolean).join(" ");
  const patterns = [
    /(?:https?:\/\/)?(?:api\.)?wa\.me\/(?:send\/)?([0-9]{10,15})/i,
    /api\.whatsapp\.com\/send\?[^\s"'<>]*phone=([0-9]{10,15})/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function getLeadExcelRows() {
  return discoveredLeads.map(lead => {
    const whatsappNumber = lead.whatsappNumber || extractWhatsAppNumber(lead);
    return {
      "Business Name": lead.name || "",
      "Contact Person": lead.contactPerson || "",
      "WhatsApp Number": whatsappNumber ? "+" + whatsappNumber : "",
      "WhatsApp Status": whatsappNumber ? "Public WhatsApp link found" : (lead.phone ? "Public phone available; WhatsApp not verified" : "Not found"),
      "WhatsApp Check Link": !whatsappNumber && lead.phone ? "https://wa.me/" + String(lead.phone).replace(/\D/g, "") : (whatsappNumber ? "https://wa.me/" + whatsappNumber : ""),
      "Phone Number": lead.phone || "",
      "Email": lead.email || "",
      "Website": lead.website || "",
      "City": $("lead-location")?.value.trim() || "",
      "Source URL": lead.website || "",
      "Research Priority": getLeadResearchPriority(lead),
      "Priority Tier": lead.priorityTier || "Needs review",
      "Qualification Signals": (lead.qualificationReasons || []).join("; ")
    };
  });
}

function downloadLeadExcel() {
  if (!discoveredLeads.length) {
    showStatus("lead-search-status", "Search for leads before creating an Excel report.", true);
    return;
  }
  if (!window.XLSX) {
    showStatus("lead-search-status", "Excel library did not load. Refresh the page and try again.", true);
    return;
  }

  const rows = getLeadExcelRows();
  const workbook = XLSX.utils.book_new();
  const leadsSheet = XLSX.utils.json_to_sheet(rows);
  leadsSheet["!cols"] = [
    { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 27 }, { wch: 20 },
    { wch: 30 }, { wch: 38 }, { wch: 18 }, { wch: 42 }, { wch: 18 }, { wch: 24 }, { wch: 70 }
  ];
  leadsSheet["!autofilter"] = { ref: leadsSheet["!ref"] || "A1:L1" };
  leadsSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(workbook, leadsSheet, "Lead List");

  const summary = [
    { Field: "Generated", Value: new Date().toLocaleString() },
    { Field: "Business type", Value: $("lead-business-type")?.value.trim() || "" },
    { Field: "Location", Value: $("lead-location")?.value.trim() || "" },
    { Field: "Keywords", Value: $("lead-keywords")?.value.trim() || "" },
    { Field: "Total results", Value: rows.length },
    { Field: "WhatsApp links found", Value: rows.filter(row => row["WhatsApp Number"]).length },
    { Field: "WhatsApp verification", Value: "Only publicly visible WhatsApp links are labelled as found. Other phone numbers are not assumed to be WhatsApp." },
    { Field: "Source", Value: "Tavily public web search. Verify details before contacting." }
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  summarySheet["!cols"] = [{ wch: 28 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Search Summary");

  const safeLocation = ($("lead-location")?.value || "Leads").trim().replace(/[^a-z0-9_-]+/gi, "_");
  const safeType = ($("lead-business-type")?.value || "Business").trim().replace(/[^a-z0-9_-]+/gi, "_");
  XLSX.writeFile(workbook, `WEDNESDAY_Leads_${safeType}_${safeLocation}.xlsx`);
  showStatus("lead-search-status", "Your Excel lead report is ready. Check your Downloads folder.");
}

function getLeadResearchPriority(lead) {
  if (Number.isFinite(Number(lead.priorityScore))) return Math.max(0, Math.min(100, Number(lead.priorityScore)));
  const text = [lead.name, lead.snippet, lead.website, lead.source].filter(Boolean).join(" ").toLowerCase();
  let score = 35;
  if (lead.phone || lead.email || lead.whatsappNumber) score += 20;
  if (lead.website && !/instagram\.com|facebook\.com|linkedin\.com|justdial\.com/i.test(lead.website)) score += 10;
  const signals = ["newly opened", "opening soon", "recently opened", "small business", "local business", "contact us", "book now", "menu", "services", "appointment", "business"];
  score += Math.min(25, signals.filter(term => text.includes(term)).length * 5);
  if (!lead.snippet) score -= 5;
  return Math.max(0, Math.min(100, score));
}

async function prepareLeadOutreach(index) {
  const lead = discoveredLeads[index];
  if (!lead) return;
  window.WEDNESDAY_ACTIVITY?.log?.("lead_reviewed");
  const services = getCheckedValues("lead-service");
  const service = services[0] || "Social Media Management";
  const serviceSelect = $("outreach-service");
  if (serviceSelect && [...serviceSelect.options].some(option => option.value === service)) {
    serviceSelect.value = service;
  }
  if ($("outreach-business")) $("outreach-business").value = lead.name || lead.company || "";
  if ($("outreach-phone")) $("outreach-phone").value = lead.whatsappNumber || lead.phone || "";
  if ($("outreach-observation")) {
    $("outreach-observation").value = lead.snippet
      ? "Public listing information to verify: " + lead.snippet
      : "Review the business website and public profile before making a specific claim.";
  }
  if ($("outreach-context")) {
    $("outreach-context").value = "Source: " + (lead.website || "Public web search") +
      "\nLocation searched: " + ($("lead-location")?.value.trim() || "Not specified") +
      "\nResearch priority score: " + getLeadResearchPriority(lead) + "/100 (heuristic, not proof of buying intent).";
  }
  if ($("outreach-channel")) {
    $("outreach-channel").value = lead.email ? "Email" : (lead.whatsappNumber || lead.phone ? "WhatsApp" : "Instagram DM");
  }
  showPage("outreach");
  const button = $("outreach-generate-btn");
  if (button) button.click();
}

function renderDiscoveredLeads() {
  const output = $("lead-search-results");
  if (!output) return;

  if (!discoveredLeads.length) {
    output.innerHTML = '<div class="empty-state-icon">⌕</div><h3>No leads loaded yet</h3><p>Run a live search to discover public business listings.</p>';
    return;
  }

  output.innerHTML = `
    <div class="lead-results-toolbar">
      <label><input type="checkbox" id="lead-select-all"> Select all</label>
      <div class="button-row"><button type="button" class="secondary-btn" id="lead-export-excel">Download Excel (.xlsx) ↓</button><button type="button" class="primary-btn compact" id="lead-add-selected">Add selected to Client CRM</button></div>
    </div>
    <div class="table-wrap">
      <table class="lead-table">
        <thead><tr><th></th><th>BUSINESS / RESULT</th><th>PRIORITY & SIGNALS</th><th>PUBLIC PHONE</th><th>WHATSAPP</th><th>EMAIL</th><th>SOURCE</th><th>CONTACT</th><th>ACTION</th></tr></thead>
        <tbody>
          ${discoveredLeads.map((lead, index) => `
            <tr>
              <td><input type="checkbox" class="lead-select" data-lead-index="${index}" ${lead.added ? "disabled" : ""}></td>
              <td><strong>${escapeHTML(lead.name)}</strong><br><small>${escapeHTML(lead.snippet || "")}</small><br><a href="${escapeHTML(lead.website)}" target="_blank" rel="noopener noreferrer">Open source ↗</a></td>
              <td><strong>${getLeadResearchPriority(lead)}/100</strong><br><small>${escapeHTML(lead.priorityTier || "Heuristic research priority")}</small><br><small>${escapeHTML((lead.qualificationReasons || []).join(" · ") || "No strong buying signal found")}</small></td>
              <td>${escapeHTML(lead.phone || "Not found")}</td>
              <td>${lead.whatsappNumber ? '<a class="lead-contact-link" href="https://wa.me/' + encodeURIComponent(lead.whatsappNumber) + '" target="_blank" rel="noopener noreferrer">+' + escapeHTML(lead.whatsappNumber) + ' · Open WhatsApp ↗</a><small>Public WhatsApp link found</small>' : (lead.phone ? '<a class="lead-contact-link" href="https://wa.me/' + encodeURIComponent(String(lead.phone).replace(/\D/g, "")) + '" target="_blank" rel="noopener noreferrer">Check public phone on WhatsApp ↗</a><small>Not verified as a WhatsApp account</small>' : 'Not found')}</td>
              <td>${escapeHTML(lead.email || "Not found")}</td>
              <td>${escapeHTML(lead.source || "Web search")}</td>
              <td><span class="client-status">${lead.contactVerified ? "Public contact found" : "Needs review"}</span></td>
              <td><button type="button" class="secondary-btn" data-lead-outreach="${index}">Prepare AI pitch ↗</button></td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
    </div>
    <p class="note">Business names and contact details are extracted from public search text. A phone number is not automatically a WhatsApp number; use the check link to see whether it is registered. Missing details are left blank.</p>
  `;

  $("lead-export-excel")?.addEventListener("click", downloadLeadExcel);
  output.querySelectorAll("[data-lead-outreach]").forEach(button => {
    button.addEventListener("click", () => prepareLeadOutreach(Number(button.dataset.leadOutreach)));
  });

  $("lead-select-all")?.addEventListener("change", event => {
    document.querySelectorAll(".lead-select:not(:disabled)").forEach(box => { box.checked = event.target.checked; });
  });

  $("lead-add-selected")?.addEventListener("click", () => {
    const indexes = [...document.querySelectorAll(".lead-select:checked")].map(box => Number(box.dataset.leadIndex));
    if (!indexes.length) {
      showStatus("lead-search-status", "Select at least one lead first.", true);
      return;
    }

    let added = 0;
    indexes.forEach(index => {
      const lead = discoveredLeads[index];
      if (!lead || lead.added) return;
      const duplicate = clients.some(client =>
        (lead.phone && String(client.phone || client.contact || "").replace(/\D/g, "").endsWith(lead.phone.replace(/\D/g, "").slice(-10))) ||
        (client.name || "").trim().toLowerCase() === lead.name.trim().toLowerCase()
      );
      if (duplicate) {
        lead.added = true;
        return;
      }
      clients.unshift({
        id: createId(),
        name: lead.name,
        company: lead.company || lead.name,
        phone: lead.phone || "",
        email: lead.email || "",
        service: $("lead-service-summary")?.textContent || getCheckedValues("lead-service").join(", "),
        status: "New",
        source: lead.source,
        website: lead.website,
        createdAt: new Date().toISOString()
      });
      lead.added = true;
      added++;
    });

    saveData(STORAGE_KEYS.clients, clients);
    if (added) window.WEDNESDAY_ACTIVITY?.log?.("crm_added", { count: added });
    renderClients();
    renderDiscoveredLeads();
    showStatus("lead-search-status", `${added} new lead(s) added to Client CRM. Duplicates were skipped.`);
  });
}

function initializeLeadGeneration() {
  const searchButton = $("lead-search-btn");
  const clearButton = $("lead-clear-btn");
  const locationList = $("lead-location-suggestions");
  const recentAreasKey = "wednesday_recent_lead_areas";
  const readRecentAreas = () => {
    try {
      const value = JSON.parse(localStorage.getItem(recentAreasKey) || "[]");
      return Array.isArray(value) ? value.filter(item => typeof item === "string").slice(0, 8) : [];
    } catch (_) { return []; }
  };
  const renderRecentAreas = () => {
    if (!locationList) return;
    locationList.innerHTML = readRecentAreas().map(area => '<option value="' + escapeHTML(area) + '"></option>').join("");
  };
  const rememberArea = area => {
    const cleaned = String(area || "").trim();
    if (!cleaned) return;
    try {
      const areas = [cleaned, ...readRecentAreas().filter(item => item.toLowerCase() !== cleaned.toLowerCase())].slice(0, 8);
      localStorage.setItem(recentAreasKey, JSON.stringify(areas));
    } catch (_) {}
    renderRecentAreas();
  };
  renderRecentAreas();
  window.WEDNESDAY_REMEMBER_LEAD_AREA = rememberArea;

  if (searchButton) {
    searchButton.addEventListener("click", async () => {
      if (window.WEDNESDAY_PAUSED) {
        showStatus("lead-search-status", "WEDNESDAY is paused.", true);
        return;
      }

      const services = getCheckedValues("lead-service");
      const sources = getCheckedValues("lead-source");
      const businessType = $("lead-business-type")?.value.trim();
      const location = $("lead-location")?.value.trim();
      const keywords = $("lead-keywords")?.value.trim();
      const market = $("lead-market")?.value || "both";
      const businessModel = $("lead-business-model")?.value || "both";
      const limit = Number($("lead-limit")?.value || 25);

      if (!services.length || !businessType || !location) {
        showStatus("lead-search-status", "Choose a service and enter a business type and location.", true);
        return;
      }

      if (!supabaseClient || !supabaseAuthReady) {
        showStatus("lead-search-status", "Live lead search needs your WEDNESDAY account connected. Sign in first, then configure the search provider as described in setup.", true);
        return;
      }

      searchButton.disabled = true;
      showStatus("lead-search-status", "Searching public web listings for real business leads…");

      try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (!sessionData?.session) throw new Error("Please sign in to WEDNESDAY before searching.");

        const { data, error } = await supabaseClient.functions.invoke("lead-discovery", {
          body: { businessType, location, keywords, limit, sources, services, market, businessModel, filters: { noWebsite: Boolean($("lead-filter-website")?.checked), weakSocial: Boolean($("lead-filter-social")?.checked), publicContact: Boolean($("lead-filter-contact")?.checked) } }
        });
        if (error) {
          // Supabase wraps non-2xx Edge Function responses in FunctionsHttpError.
          // Read the function's JSON body so setup/auth/provider errors are visible in the UI.
          let functionMessage = "";
          const responseContext = error.context;
          if (responseContext && typeof responseContext.clone === "function") {
            try {
              const errorBody = await responseContext.clone().json();
              functionMessage = errorBody?.error || errorBody?.message || "";
            } catch (_) {
              // The response may not contain JSON; fall back to status and SDK message.
            }
          }
          const statusCode = responseContext?.status;
          if (functionMessage) {
            throw new Error(functionMessage);
          }
          if (statusCode) {
            throw new Error(`Lead search function returned HTTP ${statusCode}. ${error.message || "Check Supabase Edge Function logs and configuration."}`);
          }
          throw new Error(error.message || "Lead search function failed. Check Supabase Edge Function logs.");
        }
        if (data?.error) throw new Error(data.error);

        discoveredLeads = Array.isArray(data?.leads) ? data.leads : [];
        rememberArea(location);
        window.WEDNESDAY_ACTIVITY?.log?.("lead_search");
        if (discoveredLeads.length) window.WEDNESDAY_ACTIVITY?.log?.("leads_found", { count: discoveredLeads.length });
        renderDiscoveredLeads();
        showStatus("lead-search-status", `Found ${discoveredLeads.length} public search result(s). Preparing your Excel report…`);
        if (discoveredLeads.length && window.XLSX) {
          try { downloadLeadExcel(); } catch (exportError) { console.warn("Automatic Excel download was blocked:", exportError); }
        }
      } catch (error) {
        console.error("Live lead search error:", error);
        showStatus("lead-search-status", error.message || "Live lead search failed. Check the Supabase function setup.", true);
      } finally {
        searchButton.disabled = false;
      }
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      ["lead-business-type", "lead-location", "lead-keywords"].forEach(id => { if ($(id)) $(id).value = ""; });
      discoveredLeads = [];
      renderDiscoveredLeads();
      showStatus("lead-search-status", "Search form cleared.");
    });
  }

  renderDiscoveredLeads();
}

/* ================= OUTREACH STUDIO ================= */

function initializeOutreach() {
  const generateButton = $("outreach-generate-btn");
  const clearButton = $("outreach-clear-btn");
  const copyButton = $("outreach-copy-btn");
  const whatsappButton = $("outreach-whatsapp-btn");
  const clientSelect = $("outreach-client-select");

  if (clientSelect) {
    clientSelect.innerHTML = '<option value="">Enter a new prospect below</option>' +
      clients.map(client => '<option value="' + escapeHTML(client.id) + '">' +
        escapeHTML(client.name) + (client.company ? ' — ' + escapeHTML(client.company) : '') +
        '</option>').join('');

    clientSelect.addEventListener("change", () => {
      const client = clients.find(item => item.id === clientSelect.value);
      if (!client) return;
      if ($("outreach-business")) $("outreach-business").value = client.company || client.name;
      if ($("outreach-phone")) $("outreach-phone").value = client.phone || client.contact || "";
      if ($("outreach-service") && client.service) {
        const option = [...$("outreach-service").options].find(item => item.value === client.service);
        if (option) $("outreach-service").value = client.service;
      }
    });
  }

  if (generateButton) {
    generateButton.addEventListener("click", async () => {
      if (window.WEDNESDAY_PAUSED) {
        showStatus("outreach-status", "WEDNESDAY is paused.", true);
        return;
      }

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

      showStatus(
        "outreach-status",
        "Writing your outreach draft..."
      );

      const prompt = `
Write a personalised first-contact outreach message.

Business name: ${business}
Service offered: ${service}
Contact channel: ${channel}
Tone: ${tone}
Specific observation: ${observation || "Not supplied"}
Additional context: ${context || "Not supplied"}

Requirements:
- Start naturally and professionally.
- Mention a relevant business opportunity.
- Explain how the service may help.
- Avoid unrealistic promises.
- Do not pretend we have worked with the business.
- Include one clear call to action.
- Keep it suitable for the selected channel.
- Return only the ready-to-review message.
`;

      try {
        const draft = await askWednesdayOnce(prompt);
        window.WEDNESDAY_ACTIVITY?.log?.("outreach_draft");

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

  if (whatsappButton) {
    whatsappButton.addEventListener("click", () => {
      const draft = $("outreach-draft")?.value.trim() || "";
      const rawPhone = $("outreach-phone")?.value.trim() || "";
      const digits = rawPhone.replace(/\D/g, "");
      if (!draft) {
        showStatus("outreach-status", "Generate or enter a message first.", true);
        return;
      }
      if (digits.length < 10 || digits.length > 15) {
        showStatus("outreach-status", "Enter a valid WhatsApp number with country code, e.g. 919876543210.", true);
        return;
      }
      window.open("https://wa.me/" + digits + "?text=" + encodeURIComponent(draft), "_blank", "noopener,noreferrer");
      showStatus("outreach-status", "WhatsApp chat opened with your draft. Review it and press Send yourself.");
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
        showStatus(
          "outreach-status",
          "There is no draft to copy.",
          true
        );
        return;
      }

      try {
        await navigator.clipboard.writeText(draft);
        showStatus("outreach-status", "Draft copied to clipboard.");
      } catch (error) {
        showStatus(
          "outreach-status",
          "Clipboard access failed. Copy the draft manually.",
          true
        );
      }
    });
  }
}

/* ================= WHATSAPP REPLY ASSISTANT ================= */

function initializeWhatsAppAssistant() {
  const generateButton = $("wa-generate-btn");
  const clearButton = $("wa-clear-btn");
  const copyButton = $("wa-copy-btn");

  if (generateButton) {
    generateButton.addEventListener("click", async () => {
      if (window.WEDNESDAY_PAUSED) {
        showStatus("wa-status", "WEDNESDAY is paused.", true);
        return;
      }

      const customerName = $("wa-customer-name")?.value.trim();
      const language = $("wa-language")?.value;
      const tone = $("wa-tone")?.value;
      const context = $("wa-context")?.value.trim();
      const customerMessage = $("wa-customer-message")?.value.trim();

      if (!customerMessage) {
        showStatus(
          "wa-status",
          "Paste the customer's message first.",
          true
        );
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

Write a clear, natural and helpful reply.
Do not invent prices, delivery dates, policies or commitments.
Return only the reply text.
`;

      try {
        const reply = await askWednesdayOnce(prompt);
        const output = $("wa-reply-output");

        if (output) {
          if ("value" in output) {
            output.value = reply;
          } else {
            output.textContent = reply;
          }
        }

        showStatus(
          "wa-status",
          "Reply generated. Review it before sending."
        );
      } catch (error) {
        console.error(error);

        showStatus(
          "wa-status",
          `Reply failed: ${error.message}`,
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
        "wa-customer-name",
        "wa-context",
        "wa-customer-message",
        "wa-reply-output"
      ].forEach(id => {
        const element = $(id);
        if (!element) return;

        if ("value" in element) {
          element.value = "";
        } else {
          element.textContent = "";
        }
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

/* ================= LOCAL AI STATUS ================= */

async function checkLocalAI() {
  const status = $("ai-status");

  try {
    const response = await fetch("http://localhost:11434/api/tags");

    if (!response.ok) {
      throw new Error("Ollama is not responding.");
    }

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
    if (status) {
      status.textContent =
        "Not connected — start Ollama on this computer.";
    }

    return false;
  }
}

/* ================= PAUSE CONTROLS ================= */

function initializePauseControls() {
  const pauseButton = $("pause-btn");
  const masterPause = $("master-pause");

  function updatePauseState(paused) {
    window.WEDNESDAY_PAUSED = paused;

    if (pauseButton) {
      pauseButton.textContent = paused ? "Resume" : "Pause";
    }

    if (masterPause) {
      masterPause.checked = paused;
    }

    setText(
      "pause-status",
      paused ? "WEDNESDAY is paused." : "WEDNESDAY is active."
    );

    setText(
      "automation-state",
      paused ? "Paused" : "Active"
    );

    if (paused) {
      window.WEDNESDAY_INTERRUPT();
    }
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

/* ================= OPTIONAL SUPABASE ================= */

function getSupabaseConfig() {
  let url = "";
  let key = "";

  try {
    if (typeof SUPABASE_URL !== "undefined") {
      url = SUPABASE_URL;
    }

    if (typeof SUPABASE_ANON_KEY !== "undefined") {
      key = SUPABASE_ANON_KEY;
    }
  } catch (_) {}

  url = url || window.SUPABASE_URL || window.WEDNESDAY_CONFIG?.supabaseUrl || "";
  key = key || window.SUPABASE_ANON_KEY || window.WEDNESDAY_CONFIG?.supabaseAnonKey || "";

  return {
    url: String(url).trim(),
    key: String(key).trim()
  };
}

function initializeSupabase() {
  const status = $("supabase-status");
  const gate = $("auth-gate");
  const config = getSupabaseConfig();

  /*
   * LOCAL MODE:
   * No Supabase URL/key means no login screen.
   * The application opens directly.
   */

  if (
    !config.url ||
    !config.key ||
    !window.supabase?.createClient
  ) {
    supabaseClient = null;
    window.WEDNESDAY_SUPABASE_CLIENT = null;
    supabaseAuthReady = false;
    window.WEDNESDAY_LOCAL_MODE = true;

    if (gate) {
      gate.style.display = "none";
    }

    if (status) {
      status.textContent = "Optional — Supabase not connected.";
    }

    return;
  }

  try {
    supabaseClient = window.supabase.createClient(
      config.url,
      config.key
    );
    window.WEDNESDAY_SUPABASE_CLIENT = supabaseClient;

    supabaseAuthReady = true;
    window.WEDNESDAY_LOCAL_MODE = false;

    if (status) {
      status.textContent = "Supabase client initialized.";
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      updateAuthInterface(session);
    });

    supabaseClient.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        updateAuthInterface(data.session);
      })
      .catch(error => {
        console.error("Supabase session error:", error);
      });

  } catch (error) {
    console.error("Supabase initialization error:", error);

    supabaseClient = null;
    supabaseAuthReady = false;
    window.WEDNESDAY_LOCAL_MODE = true;

    if (gate) gate.style.display = "none";

    if (status) {
      status.textContent = "Supabase unavailable — using local mode.";
    }
  }
}

function updateAuthInterface(session) {
  const gate = $("auth-gate");

  if (window.WEDNESDAY_LOCAL_MODE) {
    if (gate) gate.style.display = "none";
    return;
  }

  if (gate) {
    gate.style.display = session ? "none" : "";
  }
}

/* ================= AUTHENTICATION ================= */

function initializeAuthentication() {
  const gate = $("auth-gate");

  // Local mode does not require login.
  if (window.WEDNESDAY_LOCAL_MODE) {
    if (gate) gate.style.display = "none";
    return;
  }

  const form = $("login-form");
  const logoutButton = $("logout-btn");

  if (form) {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!supabaseClient || !supabaseAuthReady) {
        showStatus(
          "auth-message",
          "Supabase is not connected.",
          true
        );
        return;
      }

      const email = $("login-email")?.value.trim();
      const password = $("login-password")?.value;

      if (!email || !password) {
        showStatus(
          "auth-message",
          "Enter your email and password.",
          true
        );
        return;
      }

      const button = $("login-button");
      if (button) button.disabled = true;

      try {
        const { error } =
          await supabaseClient.auth.signInWithPassword({
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

/* ================= SETTINGS ================= */

function initializeSettings() {
  const saveButton = $("save-config");
  const testButton = $("test-supabase");

  if (saveButton) {
    saveButton.addEventListener("click", () => {
      const url = $("supabase-url")?.value.trim() || "";
      const key = $("supabase-key")?.value.trim() || "";

      if (!url || !key) {
        showStatus(
          "config-result",
          "Enter both values first.",
          true
        );
        return;
      }

      /*
       * Saves only in this browser.
       * It does not change config.js.
       * Do not enter service-role or secret keys here.
       */

      saveData(STORAGE_KEYS.settings, { url, key });

      showStatus(
        "config-result",
        "Saved in this browser. This does not connect Supabase automatically."
      );
    });
  }

  if (testButton) {
    testButton.addEventListener("click", async () => {
      const url = $("supabase-url")?.value.trim();
      const key = $("supabase-key")?.value.trim();

      if (!url || !key) {
        showStatus(
          "config-result",
          "Enter the Supabase URL and public key.",
          true
        );
        return;
      }

      try {
        const response = await fetch(
          `${url.replace(/\/$/, "")}/rest/v1/`,
          {
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Supabase returned ${response.status}`);
        }

        showStatus(
          "config-result",
          "Supabase endpoint responded successfully."
        );
      } catch (error) {
        showStatus("config-result", error.message, true);
      }
    });
  }
}

/* ================= APPLICATION STARTUP ================= */

window.addEventListener("wednesday-clients-synced", event => {
  clients = Array.isArray(event.detail) ? event.detail : clients;
  saveData(STORAGE_KEYS.clients, clients);
  renderClients();
});

document.addEventListener("DOMContentLoaded", () => {
  initializeSupabase();
  initializeAuthentication();

  initializeNavigation();
  initializeTasks();
  initializeClients();
  initializeChat();
  initializeLeadGeneration();
  initializeOutreach();
  initializeWhatsAppAssistant();
  initializePauseControls();
  initializeSettings();

  checkLocalAI();
  updateDashboard();

  console.log(
    "WEDNESDAY initialized. Local mode:",
    window.WEDNESDAY_LOCAL_MODE
  );
});
