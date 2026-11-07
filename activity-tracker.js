/* WEDNESDAY BUSINESS ACTIVITY — local-first progress journal */
(() => {
  "use strict";
  const KEY = "wednesday_activity_v1";
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  let events = read();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(events.slice(-1200))); } catch (_) {} };
  function summary() {
    const count = type => events.filter(x => x.type === type).reduce((sum, x) => sum + (Number(x.count) || 1), 0);
    return { chatMessages: count("chat_message"), searches: count("lead_search"), leadsFound: count("leads_found"), leadsReviewed: count("lead_reviewed"), crmAdded: count("crm_added"), drafts: count("outreach_draft"), contacted: count("contacted") };
  }
  function render() {
    const target = document.getElementById("bh-activity-summary");
    if (!target) return;
    const s = summary();
    const items = [["Chat interactions",s.chatMessages],["Live searches",s.searches],["Leads discovered",s.leadsFound],["Leads reviewed",s.leadsReviewed],["CRM records added",s.crmAdded],["Outreach drafts",s.drafts],["Prospects contacted",s.contacted]];
    target.innerHTML = items.map(x => '<article class="bh-activity-item"><span>' + x[0] + '</span><strong>' + x[1] + '</strong></article>').join("");
    const next = s.leadsFound === 0 ? "Next: ask WEDNESDAY to find prospects for one service and location." : s.leadsReviewed === 0 ? "Next: review the leads found and select the strongest prospects." : s.drafts === 0 ? "Next: prepare a personalised outreach draft." : s.contacted === 0 ? "Next: review a draft and contact one suitable prospect yourself." : "Next: record replies, update stages and schedule follow-ups.";
    const note = document.getElementById("bh-activity-next");
    if (note) note.textContent = next;
  }
  function log(type, metadata = {}) {
    events.push({ type, at: new Date().toISOString(), count: Number(metadata.count) || 1 });
    events = events.slice(-1200); save(); render();
  }
  window.WEDNESDAY_ACTIVITY = { log, summary, render, history: () => events.slice() };
  document.addEventListener("DOMContentLoaded", render);
  window.addEventListener("storage", event => { if (event.key === KEY) { events = read(); render(); } });
})();