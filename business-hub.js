/* WEDNESDAY BUSINESS HUB — local-first, human-approved sales workflow */
(() => {
  "use strict";
  const KEY = "wednesday_business_hub_v1";
  const defaults = { deals: [], money: [], approvals: [], profile: { model: "both", market: "both", approval: true } };
  let state;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
  const money = value => new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 }).format(Number(value)||0);
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e) { console.error("Business Hub save failed",e); }
    const cloud=window.WEDNESDAY_CLOUD_SYNC;
    if(cloud?.isConnected()) cloud.syncHub(state).then(merged=>{
      state=merged; localStorage.setItem(KEY,JSON.stringify(state));
      if($("bh-status")) $("bh-status").textContent="Synced with your signed-in Supabase account.";
      render();
    }).catch(error=>{
      if($("bh-status")) $("bh-status").textContent="Saved on this browser. Cloud sync issue: "+error.message;
    });
  };
  const load = () => { try { const raw=JSON.parse(localStorage.getItem(KEY)||"null"); return { ...defaults, ...(raw||{}), profile:{...defaults.profile,...(raw?.profile||{})}, deals:Array.isArray(raw?.deals)?raw.deals:[], money:Array.isArray(raw?.money)?raw.money:[], approvals:Array.isArray(raw?.approvals)?raw.approvals:[] }; } catch { return structuredClone(defaults); } };
  const id = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2);
  const today = () => new Date().toISOString().slice(0,10);

  function render() {
    const paid=state.money.filter(x=>x.kind==="income"&&x.state==="paid").reduce((s,x)=>s+Number(x.amount),0);
    const pending=state.money.filter(x=>x.kind==="income"&&x.state==="pending").reduce((s,x)=>s+Number(x.amount),0);
    const expenses=state.money.filter(x=>x.kind==="expense").reduce((s,x)=>s+Number(x.amount),0);
    const active=state.deals.filter(x=>!["Won","Lost"].includes(x.stage)).length;
    $("bh-paid").textContent=money(paid); $("bh-pending").textContent=money(pending);
    $("bh-expenses").textContent=money(expenses); $("bh-active").textContent=active;
    $("bh-net").textContent=money(paid-expenses);
    $("bh-deals").innerHTML=state.deals.length?state.deals.map(x=>`
      <tr><td><b>${esc(x.business)}</b><small>${esc(x.contact||"")}</small></td><td>${esc(x.service)}</td><td>${esc(x.market)}</td><td>${money(x.value)}</td>
      <td><select data-stage="${esc(x.id)}">${["New","Researched","Draft ready","Contacted","Replied","Interested","Meeting","Won","Lost"].map(s=>`<option ${x.stage===s?"selected":""}>${s}</option>`).join("")}</select></td>
      <td>${esc(x.followup||"—")}</td><td><button class="secondary-btn" data-deal-delete="${esc(x.id)}">Delete</button></td></tr>`).join(""):'<tr><td colspan="7" class="empty">No opportunities yet. Add your first prospect.</td></tr>';
    $("bh-money-list").innerHTML=state.money.length?state.money.slice().reverse().map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.label)}</td><td>${x.kind==="expense"?"Expense":"Income"}</td><td>${x.state==="pending"?"Pending":x.kind==="expense"?"Recorded":"Received"}</td><td>${money(x.amount)}</td><td><button class="secondary-btn" data-money-delete="${esc(x.id)}">Delete</button></td></tr>`).join(""):'<tr><td colspan="6" class="empty">No transactions recorded.</td></tr>';
    $("bh-approval-list").innerHTML=state.approvals.length?state.approvals.slice().reverse().map(x=>`<article class="bh-approval"><div><b>${esc(x.business)}</b><small>${esc(x.channel)} · ${esc(x.service)} · ${esc(x.createdAt)}</small><p>${esc(x.message)}</p><span class="client-status">${esc(x.status)}</span></div><div class="button-row"><button class="secondary-btn" data-approval-copy="${esc(x.id)}">Copy</button><button class="secondary-btn" data-approval-done="${esc(x.id)}">Mark contacted</button><button class="secondary-btn" data-approval-delete="${esc(x.id)}">Delete</button></div></article>`).join(""):'<p class="muted">No saved outreach drafts. Save a draft from Outreach Studio for review here.</p>';
    $("bh-profile-model").value=state.profile.model; $("bh-profile-market").value=state.profile.market;
    document.querySelectorAll("[data-stage]").forEach(el=>el.addEventListener("change",()=>{const d=state.deals.find(x=>x.id===el.dataset.stage);if(d){d.stage=el.value;save();render();}}));
    document.querySelectorAll("[data-deal-delete]").forEach(el=>el.addEventListener("click",()=>{state.deals=state.deals.filter(x=>x.id!==el.dataset.dealDelete);save();render();}));
    document.querySelectorAll("[data-money-delete]").forEach(el=>el.addEventListener("click",()=>{state.money=state.money.filter(x=>x.id!==el.dataset.moneyDelete);save();render();}));
    document.querySelectorAll("[data-approval-copy]").forEach(el=>el.addEventListener("click",async()=>{const x=state.approvals.find(a=>a.id===el.dataset.approvalCopy);if(!x)return;try{await navigator.clipboard.writeText(x.message);$("bh-status").textContent="Draft copied. Review it in your chosen channel before sending.";}catch{$("bh-status").textContent="Clipboard unavailable; select and copy the draft manually."}}));
    document.querySelectorAll("[data-approval-done]").forEach(el=>el.addEventListener("click",()=>{const x=state.approvals.find(a=>a.id===el.dataset.approvalDone);if(x){x.status="Contacted";x.contactedAt=new Date().toISOString();window.WEDNESDAY_ACTIVITY?.log?.("contacted");save();render();}}));
    document.querySelectorAll("[data-approval-delete]").forEach(el=>el.addEventListener("click",()=>{state.approvals=state.approvals.filter(a=>a.id!==el.dataset.approvalDelete);save();render();}));
  }
  function init() {
    if (!$("page-business-hub")) return;
    state=load();
    window.addEventListener("wednesday-cloud-ready", async()=>{
      if(!window.WEDNESDAY_CLOUD_SYNC?.isConnected()) return;
      try {
        state=await window.WEDNESDAY_CLOUD_SYNC.syncHub(state);
        localStorage.setItem(KEY,JSON.stringify(state));
        $("bh-status").textContent="Cloud sync connected. Your business records are synchronised.";
        render();
      } catch(error) {
        $("bh-status").textContent="Local records remain available. Cloud sync issue: "+error.message;
      }
    });
    $("bh-deal-form").addEventListener("submit",e=>{e.preventDefault();state.deals.unshift({id:id(),business:$("bh-business").value.trim(),contact:$("bh-contact").value.trim(),service:$("bh-service").value,market:$("bh-market").value,value:Number($("bh-value").value)||0,stage:$("bh-stage").value,followup:$("bh-followup").value,createdAt:new Date().toISOString()});save();e.target.reset();$("bh-followup").value=today();render();});
    $("bh-money-form").addEventListener("submit",e=>{e.preventDefault();state.money.push({id:id(),label:$("bh-money-label").value.trim(),kind:$("bh-money-kind").value,state:$("bh-money-state").value,amount:Number($("bh-money-amount").value),date:$("bh-money-date").value||today()});save();e.target.reset();$("bh-money-date").value=today();render();});
    $("bh-profile-form").addEventListener("submit",e=>{e.preventDefault();state.profile={model:$("bh-profile-model").value,market:$("bh-profile-market").value,approval:true};save();$("bh-status").textContent="Business preferences saved in this browser.";});
    $("bh-export").addEventListener("click",()=>{const payload={exportedAt:new Date().toISOString(),profile:state.profile,opportunities:state.deals,transactions:state.money,approvalQueue:state.approvals};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="WEDNESDAY_Business_Backup.json";a.click();URL.revokeObjectURL(url);});
    const saveApproval=$("outreach-save-approval-btn");
    if(saveApproval) saveApproval.addEventListener("click",()=>{const business=$("outreach-business")?.value.trim(),message=$("outreach-draft")?.value.trim();if(!business||!message){$("outreach-status").textContent="Enter a business and create a draft before saving it.";return;}state.approvals.push({id:id(),business,service:$("outreach-service")?.value||"",channel:$("outreach-channel")?.value||"",message,status:"Awaiting your approval",createdAt:new Date().toLocaleString()});window.WEDNESDAY_ACTIVITY?.log?.("draft_saved");save();render();$("outreach-status").textContent="Draft saved to Business Hub approval queue. It has not been sent.";});
    if($("bh-followup")) $("bh-followup").value=today();
    if($("bh-money-date")) $("bh-money-date").value=today();
    render();
  }
  document.addEventListener("DOMContentLoaded",init);
})();
