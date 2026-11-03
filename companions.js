/* WEDNESDAY — selectable AI companions */
(() => {
  "use strict";

  const STORAGE_KEY = "wednesday_active_companion";
  const characters = {
    shinchan: {
      name: "Shinchan",
      emoji: "🧒",
      role: "Everyday AI & coding helper",
      greeting: "Hey! I'm Shinchan. Ask me questions, build projects, learn coding or brainstorm ideas.",
      prompt: "You are Shinchan, WEDNESDAY's friendly everyday AI and technology helper. Help with general questions, coding, website development, troubleshooting, learning and creative brainstorming. Explain technical work step by step in simple language. Be playful and upbeat but stay accurate, respectful and useful. Never pretend you executed code or changed files unless a tool actually did so."
    },
    himawari: {
      name: "Himawari",
      emoji: "👧",
      role: "Excel, data & reports specialist",
      greeting: "Hi! I'm Himawari. Share an Excel problem, formula, dataset or report task and we'll work through it.",
      prompt: "You are Himawari, WEDNESDAY's Excel and data specialist. Focus on Excel formulas, spreadsheets, data cleaning, sorting, validation, pivot tables, dashboards, calculations and clear business reports. Give exact formulas and explain where to enter them. Check assumptions, preserve source data and never invent spreadsheet results when no data was supplied."
    },
    shiro: {
      name: "Shiro",
      emoji: "🐶",
      role: "Tasks & productivity companion",
      greeting: "Woof! I'm Shiro. I can help organise your tasks, plans, study sessions and daily priorities.",
      prompt: "You are Shiro, WEDNESDAY's organisation and productivity companion. Help break goals into practical steps, organise to-do lists, plan study sessions, prepare checklists, structure routines and review priorities. Keep plans realistic and concise. Do not claim to create real notifications, calendar events or reminders unless an available integration actually confirms it."
    }
  };

  let activeId = localStorage.getItem(STORAGE_KEY);
  if (!characters[activeId]) activeId = "shinchan";

  function setActiveCharacter(id) {
    if (!characters[id]) return;
    activeId = id;
    localStorage.setItem(STORAGE_KEY, id);

    document.querySelectorAll("[data-character]").forEach(button => {
      const selected = button.dataset.character === id;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    const character = characters[id];
    const detail = document.getElementById("companion-detail");
    if (detail) {
      detail.innerHTML = "<strong>" + character.name + "</strong><span>" +
        character.role + "</span>";
    }

    const headerName = document.getElementById("active-companion-name");
    const headerRole = document.getElementById("active-companion-role");
    const headerAvatar = document.getElementById("active-companion-avatar");
    const input = document.getElementById("chat-input");
    if (headerName) headerName.textContent = character.name;
    if (headerRole) headerRole.textContent = character.role + " · Llama 3.2";
    if (headerAvatar) headerAvatar.textContent = character.emoji;
    if (input) input.placeholder = "Ask " + character.name + " anything…";

    const stage = document.getElementById("wednesday-stage");
    if (stage) stage.dataset.companion = id;

    window.WEDNESDAY_ACTIVE_COMPANION = id;
    window.WEDNESDAY_COMPANION_PROMPT = character.prompt;
  }

  function renderCompanions() {
    const aside = document.querySelector(".character-companions");
    if (!aside) return;

    aside.innerHTML = `
      <div class="companion-picker">
        <div class="companion-picker-heading">
          <span class="eyebrow">MEET YOUR TEAM</span>
          <h3>Choose your companion</h3>
          <p>Each companion has a different speciality.</p>
        </div>
        <div class="companion-options" role="group" aria-label="Choose an AI companion">
          <button type="button" class="companion-option" data-character="shinchan" aria-pressed="false">
            <span class="companion-avatar shinchan-avatar">🧒</span>
            <span class="companion-option-copy"><strong>Shinchan</strong><small>Everyday AI & coding</small></span>
            <span class="companion-check" aria-hidden="true">✓</span>
          </button>
          <button type="button" class="companion-option" data-character="himawari" aria-pressed="false">
            <span class="companion-avatar himawari-avatar">👧</span>
            <span class="companion-option-copy"><strong>Himawari</strong><small>Excel & data reports</small></span>
            <span class="companion-check" aria-hidden="true">✓</span>
          </button>
          <button type="button" class="companion-option" data-character="shiro" aria-pressed="false">
            <span class="companion-avatar shiro-avatar">🐶</span>
            <span class="companion-option-copy"><strong>Shiro</strong><small>Tasks & productivity</small></span>
            <span class="companion-check" aria-hidden="true">✓</span>
          </button>
        </div>
        <div class="companion-detail" id="companion-detail" aria-live="polite"></div>
        <p class="companion-art-note">Character artwork can be added in the next step.</p>
      </div>`;

    aside.querySelectorAll("[data-character]").forEach(button => {
      button.addEventListener("click", () => setActiveCharacter(button.dataset.character));
    });

    setActiveCharacter(activeId);
  }

  // Add the selected companion's role to the system prompt for Ollama requests.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (url && url.includes("localhost:11434/api/chat") && init && typeof init.body === "string") {
      try {
        const payload = JSON.parse(init.body);
        if (Array.isArray(payload.messages) && payload.messages.length) {
          const systemMessage = payload.messages.find(message => message.role === "system");
          if (systemMessage) {
            systemMessage.content += "\n\nACTIVE WEDNESDAY COMPANION:\n" +
              (window.WEDNESDAY_COMPANION_PROMPT || characters[activeId].prompt);
          }
          init = { ...init, body: JSON.stringify(payload) };
        }
      } catch (error) {
        console.warn("Could not add companion instructions:", error);
      }
    }
    return originalFetch(input, init);
  };

  document.addEventListener("DOMContentLoaded", renderCompanions);
})();
