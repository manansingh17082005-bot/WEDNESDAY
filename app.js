
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
You are WEDNESDAY, a professional personal AI assistant.

Your responsibilities:
1. Help manage tasks, clients and daily work.
2. Help generate business leads using ethical research methods.
3. Create search strategies for Excel, data entry, video editing,
   website development, social media management, data analysis and logo design.
4. Write professional outreach messages and follow-ups.
5. Help with business research, spreadsheets and productivity.
6. Help the user learn technology and build projects.

Rules:
- Be practical, clear and professional.
- Never invent real businesses, contact details or search results.
- Distinguish search suggestions from verified leads.
- Never claim to have searched a website unless a real search was performed.
- Never send messages automatically.
- Ask for confirmation before consequential actions.
- Keep the user's initial budget at zero unless they change it.
- Give step-by-step technical instructions.
`;

/* ================= GLOBAL STATE ================= */

const conversationHistory = [];

let activeRequestController = null;
let activeRequestId = 0;

let tasks = loadData(STORAGE_KEYS.tasks, []);
let clients = loadData(STORAGE_KEYS.clients, []);
let discoveredLeads = [];

let supabaseClient = null;
let supabaseAuthReady = false;

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

  // Live lead retrieval has not been connected yet.
  setText("lead-count", "0");

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

      console.error("Assistant error:", error);

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
      "WhatsApp Status": whatsappNumber ? "Public WhatsApp link found" : "Not found / not verified",
      "Phone Number": lead.phone || "",
      "Email": lead.email || "",
      "Website": lead.website || "",
      "City": $("lead-location")?.value.trim() || "",
      "Source URL": lead.website || ""
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
    { wch: 30 }, { wch: 38 }, { wch: 18 }, { wch: 42 }
  ];
  leadsSheet["!autofilter"] = { ref: leadsSheet["!ref"] || "A1:I1" };
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
        <thead><tr><th></th><th>BUSINESS / RESULT</th><th>PUBLIC PHONE</th><th>WHATSAPP</th><th>EMAIL</th><th>SOURCE</th><th>CONTACT</th><th>OPENING DATE</th></tr></thead>
        <tbody>
          ${discoveredLeads.map((lead, index) => `
            <tr>
              <td><input type="checkbox" class="lead-select" data-lead-index="${index}" ${lead.added ? "disabled" : ""}></td>
              <td><strong>${escapeHTML(lead.name)}</strong><br><small>${escapeHTML(lead.snippet || "")}</small><br><a href="${escapeHTML(lead.website)}" target="_blank" rel="noopener noreferrer">Open source ↗</a></td>
              <td>${escapeHTML(lead.phone || "Not found")}</td>
              <td>${escapeHTML(lead.whatsappNumber ? "+" + lead.whatsappNumber : "Not found / not verified")}</td>
              <td>${escapeHTML(lead.email || "Not found")}</td>
              <td>${escapeHTML(lead.source || "Web search")}</td>
              <td><span class="client-status">${lead.contactVerified ? "Public contact found" : "Needs review"}</span></td>
              <td><span class="client-status">${lead.openingDateVerified ? "Verified" : "Not verified"}</span></td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
    </div>
    <p class="note">Search results are leads to review, not verified proof that a business is newly opened or wants your service. Missing phone/email fields are left blank.</p>
  `;

  $("lead-export-excel")?.addEventListener("click", downloadLeadExcel);\n\n  $("lead-export-excel")?.addEventListener("click", downloadLeadExcel);

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
    renderClients();
    renderDiscoveredLeads();
    showStatus("lead-search-status", `${added} new lead(s) added to Client CRM. Duplicates were skipped.`);
  });
}

function initializeLeadGeneration() {
  const searchButton = $("lead-search-btn");
  const clearButton = $("lead-clear-btn");

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
          body: { businessType, location, keywords, limit, sources, services }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        discoveredLeads = Array.isArray(data?.leads) ? data.leads : [];
        renderDiscoveredLeads();
        showStatus("lead-search-status", `Found ${discoveredLeads.length} public search result(s). Preparing your Excel report…`);\n        if (discoveredLeads.length && window.XLSX) {\n          try { downloadLeadExcel(); } catch (exportError) { console.warn("Automatic Excel download was blocked:", exportError); }\n        }
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
