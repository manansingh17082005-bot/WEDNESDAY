/* WEDNESDAY SALES AGENT — consent-first calling workspace */
(() => {
  "use strict";
  const KEY = "wednesday_sales_agent_v1";
  const CLIENTS_KEY = "wednesday_clients";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const load = (key, fallback) => { try { const x=JSON.parse(localStorage.getItem(key)||"null"); return x ?? fallback; } catch { return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2);
  const state = () => load(KEY,{queue:[],settings:{provider:"",fromNumber:"",endpoint:""},calls:[]});
  let data = state();
  const getClients = () => load(CLIENTS_KEY,[]);
  const putClients = x => save(CLIENTS_KEY,x);

  function mount() {
    const nav=$("nav");
    if (!nav || $("page-sales-agent")) return;
    const item=document.createElement("button");
    item.className="nav-item"; item.dataset.page="sales-agent";
    item.innerHTML="<span>☎</span> AI Sales Agent";
    nav.insertBefore(item, nav.querySelector('[data-page="business-hub"]'));
    item.addEventListener("click", () => { if (typeof window.showPage === "function") window.showPage("sales-agent"); else { document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "page-sales-agent")); document.querySelectorAll("[data-page]").forEach(b => b.classList.toggle("active", b === item)); const title = $("page-title"); if (title) title.textContent = "AI Sales Agent"; } });
    const page=document.createElement("section");
    page.className="page"; page.id="page-sales-agent";
    page.innerHTML=`
      <div class="section-heading"><div><span class="eyebrow">LEAD → CONVERSATION → CLIENT</span><h2>AI Sales Agent</h2><p class="muted">Find prospects in Lead Generation, qualify them, prepare a natural call and track the result. Calling is locked until lawful contact permission and a verified calling provider are configured.</p></div><span class="sa-status"><i></i> Approval-first mode</span></div>
      <div class="sa-hero"><div><span class="eyebrow light">YOUR DIGITAL SALES ASSISTANT</span><h2>More conversations.<br>Less repetitive work.</h2><p>WEDNESDAY researches each business, prepares a personalised introduction and keeps your sales pipeline organised.</p></div><div class="sa-orb">☎</div></div>
      <div class="sa-kpis"><article><span>PROSPECTS IN QUEUE</span><strong id="sa-total">0</strong></article><article><span>CALL-ELIGIBLE</span><strong id="sa-eligible">0</strong></article><article><span>CALLS LOGGED</span><strong id="sa-calls">0</strong></article><article><span>INTERESTED</span><strong id="sa-interested">0</strong></article></div>
      <div class="sa-grid">
        <section class="panel"><div class="panel-head"><div><span class="eyebrow">STEP 01 · PROSPECTS</span><h3>Build your call queue</h3></div><button class="secondary-btn" id="sa-import">Import CRM leads</button></div>
          <p class="muted">Only import business contacts you have a lawful basis to contact. Existing CRM records are not automatically call consent.</p>
          <div class="sa-form"><label>Business / prospect<input id="sa-business" placeholder="Example: ABC Cafe"></label><label>Public business phone<input id="sa-phone" type="tel" placeholder="+91 98XXXXXXXX"></label><label>Service to offer<select id="sa-service"><option>Video Editing</option><option>Social Media Management</option><option>Website Development</option><option>Excel Reporting & Dashboards</option><option>Data Analysis</option><option>Logo Design</option><option>Other</option></select></label><label>Why this prospect may fit<input id="sa-reason" placeholder="Evidence from their public business presence"></label></div>
          <button class="primary-btn" id="sa-add">Add prospect to queue</button><p id="sa-message" class="muted" role="status" aria-live="polite"></p>
        </section>
        <section class="panel"><div class="panel-head"><div><span class="eyebrow">STEP 02 · CALL PERMISSION</span><h3>Consent & eligibility</h3></div><span class="sa-lock">LOCKED BY DEFAULT</span></div>
          <p class="muted">A publicly listed phone number is not consent to receive a sales call. Record the prospect's permission and verify the applicable Indian commercial-calling requirements before activating calls.</p>
          <label class="sa-check"><input type="checkbox" id="sa-consent"> Prospect explicitly agreed to receive a call</label>
          <div class="sa-form"><label>How was permission obtained?<select id="sa-consent-source"><option value="">Select evidence</option><option>Inbound request / callback request</option><option>Website opt-in</option><option>Written email or message</option><option>Existing customer permission</option></select></label><label>Permission date<input type="date" id="sa-consent-date"></label><label>Consent evidence reference<input id="sa-consent-proof" placeholder="Message / form record reference"></label><label>Registered consent reference<input id="sa-consent-register" placeholder="Consent Register reference"></label><label>Consent purpose<select id="sa-consent-purpose"><option value="Sales / promotional calls">Sales / promotional calls</option><option value="Business development calls">Business development calls</option></select></label><label>Preference/DLT scrub reference<input id="sa-scrub-ref" placeholder="Scrubber result / transaction reference"></label></div><label class="sa-check"><input type="checkbox" id="sa-scrubbed"> Recipient preference and consent scrub completed; this number is eligible for this purpose</label>
          <p class="sa-warning">Do not mark consent based on a public listing, a guessed relationship, or a prior unanswered call. Honour opt-outs immediately.</p>
          <button class="secondary-btn" id="sa-save-consent">Save permission for selected prospect</button>
        </section>
      </div>
      <section class="panel"><div class="panel-head"><div><span class="eyebrow">STEP 03 · PERSONALISATION</span><h3>AI call brief</h3></div><button class="secondary-btn" id="sa-script">Generate call script</button></div>
        <div class="sa-form"><label>Selected prospect<select id="sa-selected"><option value="">Choose a prospect</option></select></label><label>Call language<select id="sa-language"><option>English</option><option>Hindi</option><option>Hinglish</option></select></label><label>Call objective<select id="sa-objective"><option>Ask permission to share a short idea</option><option>Understand current requirements</option><option>Offer a discovery meeting</option><option>Follow up on an inbound enquiry</option></select></label></div>
        <label class="sa-script-label">Draft script<textarea id="sa-script-text" rows="8" placeholder="Choose a prospect and generate a personalised call script. The AI must identify itself as an AI assistant calling on behalf of your agency."></textarea></label>
        <p class="note">The caller must clearly identify itself as an AI assistant, state whom it represents, explain the reason for the call, avoid pretending to be human, and end promptly if the recipient declines.</p>
      </section>
      <div class="sa-grid">
        <section class="panel"><div class="panel-head"><div><span class="eyebrow">STEP 04 · TELEPHONY</span><h3>Calling provider</h3></div><span class="sa-lock">NOT CONNECTED</span></div>
          <p class="muted">Provider selected: Exotel India. WEDNESDAY sends a single approved call request through a Supabase Edge Function. API key, token, Account SID, caller ID and AgentStream URL are stored only as Supabase server secrets.</p><div class="sa-warning">Live calls remain locked until Exotel activates your account and caller ID, your sender/A2P setup and DLT scrubbing path are verified, and a public secure AgentStream WebSocket voice bot is deployed. Do not enter API credentials in this browser.</div><p id="sa-provider-status" class="muted">Exotel backend code is prepared. Server deployment and provider configuration are still required.</p>
        </section>
        <section class="panel"><div class="panel-head"><div><span class="eyebrow">STEP 05 · HUMAN CONTROL</span><h3>Call approval</h3></div><span class="sa-lock">EXPLICIT APPROVAL REQUIRED</span></div>
          <p class="muted">Before a call can be initiated, review the exact prospect, number, permission evidence, script, caller ID and provider. This build does not auto-dial or launch calls.</p>
          <label class="sa-check"><input type="checkbox" id="sa-final-approval"> I reviewed this exact call and approve it</label>
          <button class="primary-btn" id="sa-call" disabled>Calling unavailable — setup required</button>
          <p id="sa-call-status" class="muted" role="status" aria-live="polite">No calls have been placed. Provider and compliant calling setup are required.</p>
        </section>
      </div>
      <section class="panel"><div class="panel-head"><div><span class="eyebrow">SALES PIPELINE</span><h3>Prospect queue & call history</h3></div><span class="muted">Stored in this browser</span></div><div class="table-wrap"><table class="sa-table"><thead><tr><th>BUSINESS</th><th>PHONE</th><th>SERVICE</th><th>PERMISSION</th><th>STATUS</th><th>NEXT STEP</th><th></th></tr></thead><tbody id="sa-queue"></tbody></table></div><h3 class="sa-history-title">Call activity</h3><div id="sa-history" class="sa-history"><p class="muted">No call activity yet.</p></div></section>
      <div class="sa-compliance"><b>Important — India calling compliance</b><p>Before any commercial AI voice campaign, confirm current TRAI/DLT requirements, telemarketer registration and number category, consent and preference checks, calling-hour restrictions, caller disclosures and provider rules with your telecom provider or compliance adviser. This workspace is intentionally unable to cold-call arbitrary public numbers.</p></div>`;
    $("main").insertBefore(page, $("main").querySelector("footer"));
    bind();
    render();
  }

  function persist(){save(KEY,data);render();}
  function selected(){return data.queue.find(x=>x.id===$("sa-selected")?.value)||null;}
  function addLead(lead){
    const phone=String(lead.phone||lead.contact||"").trim().replace(/^(?!\\+)([6-9]\\d{9})$/, "+91$1");
    if(!lead.name&&!lead.company) return false;
    const duplicate=data.queue.some(x=>phone && x.phone.replace(/\D/g,"")===phone.replace(/\D/g,""));
    if(duplicate)return false;
    data.queue.unshift({id:uid(),business:lead.company||lead.name||"Business",phone,service:lead.service||"Social Media Management",reason:lead.notes||lead.source||"Imported from WEDNESDAY CRM",consent:false,consentSource:"",consentDate:"",consentProof:"",consentRegisterRef:"",consentPurpose:"Sales / promotional calls",scrubbed:false,scrubRef:"",status:"Research",createdAt:new Date().toISOString()});
    return true;
  }
  function render(){
    if(!$("sa-queue"))return;
    $("sa-total").textContent=data.queue.length;
    $("sa-eligible").textContent=data.queue.filter(x=>x.consent&&x.consentSource&&x.consentDate&&x.consentProof&&x.consentRegisterRef&&x.scrubbed&&x.scrubRef).length;
    $("sa-calls").textContent=data.calls.length;
    $("sa-interested").textContent=data.queue.filter(x=>x.status==="Interested").length;
    const current=$("sa-selected").value;
    $("sa-selected").innerHTML='<option value="">Choose a prospect</option>'+data.queue.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.business)+' · '+esc(x.phone||"No phone")+'</option>').join("");
    if(data.queue.some(x=>x.id===current))$("sa-selected").value=current;
    $("sa-queue").innerHTML=data.queue.length?data.queue.map(x=>'<tr><td><b>'+esc(x.business)+'</b><small>'+esc(x.reason)+'</small></td><td>'+esc(x.phone||"Not supplied")+'</td><td>'+esc(x.service)+'</td><td>'+(x.consent&&x.consentSource&&x.consentDate&&x.consentProof?'<span class="sa-ok">Evidence recorded</span>':'<span class="sa-no">Not eligible</span>')+'</td><td><select data-stage="'+esc(x.id)+'">'+["Research","Permission requested","Eligible for review","Call approved","Contacted","Interested","Meeting","Not interested","Do not contact"].map(s=>'<option '+(x.status===s?'selected':'')+'>'+s+'</option>').join("")+'</select></td><td>'+esc(x.nextStep||"Review prospect")+'</td><td><button class="secondary-btn" data-pick="'+esc(x.id)+'">Select</button></td></tr>').join(""):'<tr><td colspan="7" class="empty">No prospects yet. Import your existing CRM leads or add a business.</td></tr>';
    $("sa-history").innerHTML=data.calls.length?data.calls.slice().reverse().map(c=>'<article><b>'+esc(c.business)+'</b><span>'+esc(c.when)+'</span><p>'+esc(c.outcome)+'</p></article>').join(""):'<p class="muted">No call activity yet.</p>';
    $("sa-provider").value=data.settings.provider||"";
    $("sa-from").value=data.settings.fromNumber||"";
    $("sa-endpoint").value=data.settings.endpoint||"";
    const pReady=Boolean(data.settings.provider&&data.settings.fromNumber&&data.settings.endpoint);
    $("sa-provider-status").textContent=pReady?"Provider details saved. Server-side verification is still required before calling.":"No provider configured. Real calling is disabled.";
    const x=selected();
    const eligible=Boolean(x&&x.consent&&x.consentSource&&x.consentDate&&x.consentProof&&pReady);
    const approved=$("sa-final-approval").checked;
    $("sa-call").disabled=!(eligible&&approved);
    $("sa-call").textContent=eligible?(approved?"Place this approved call":"Review and approve this exact call"):"Calling locked — consent / scrub evidence required";
    if(x){$("sa-consent").checked=!!x.consent;$("sa-consent-source").value=x.consentSource||"";$("sa-consent-date").value=x.consentDate||"";$("sa-consent-proof").value=x.consentProof||"";$("sa-consent-register").value=x.consentRegisterRef||"";$("sa-consent-purpose").value=x.consentPurpose||"Sales / promotional calls";$("sa-scrubbed").checked=!!x.scrubbed;$("sa-scrub-ref").value=x.scrubRef||"";}
  }
  function bind(){
    $("sa-add").addEventListener("click",()=>{
      const business=$("sa-business").value.trim(),phone=$("sa-phone").value.trim();
      if(!business){$("sa-message").textContent="Enter a business name.";return;}
      addLead({name:business,phone,service:$("sa-service").value,notes:$("sa-reason").value.trim()});
      persist();$("sa-message").textContent="Prospect saved. This does not grant permission to call.";
      ["sa-business","sa-phone","sa-reason"].forEach(id=>$(id).value="");
    });
    $("sa-import").addEventListener("click",()=>{
      const clients=getClients();let n=0;
      clients.forEach(x=>{if(addLead(x))n++;});
      persist();$("sa-message").textContent=n+" CRM prospect(s) imported. Call permission was not assumed.";
    });
    $("sa-selected").addEventListener("change",render);
    $("sa-save-consent").addEventListener("click",()=>{
      const x=selected();if(!x){$("sa-message").textContent="Select a prospect first.";return;}
      x.consent=$("sa-consent").checked;x.consentSource=$("sa-consent-source").value;x.consentDate=$("sa-consent-date").value;x.consentProof=$("sa-consent-proof").value.trim();
      if(x.consent&&(!x.consentSource||!x.consentDate||!x.consentProof)){x.consent=false;$("sa-message").textContent="Permission evidence is incomplete. Add the source, date and evidence reference.";persist();return;}
      x.status=x.consent?"Eligible for review":"Permission requested";
      persist();$("sa-message").textContent=x.consent?"Permission record saved. Verify all applicable calling rules before any call.":"Consent not recorded.";
    });
    $("sa-script").addEventListener("click",()=>{
      const x=selected();if(!x){$("sa-call-status").textContent="Select a prospect first.";return;}
      const lang=$("sa-language").value, objective=$("sa-objective").value;
      const opener=lang==="Hindi"?"Namaste, main WEDNESDAY hoon, ek AI assistant, aur main "+( "Manan Singh ki creative agency" )+" ki taraf se call kar raha/rahi hoon.":"Hello, I'm WEDNESDAY, an AI assistant calling on behalf of Manan Singh's creative agency.";
      const intro=lang==="Hindi"?"Kya abhi 30 seconds baat karna theek rahega?":"Is now a convenient time for a brief 30-second conversation?";
      const purpose="I’m reaching out regarding "+x.service+". We noticed: "+x.reason+".";
      const ask="Our goal is to understand whether this is relevant to your business. "+objective+". Would you be open to a short conversation with Manan?";
      const close="If this isn't relevant or you don't want further calls, please tell me and I'll record that preference. Thank you.";
      $("sa-script-text").value=[opener,intro,purpose,ask,close].join("\n\n");
      $("sa-call-status").textContent="Draft created for review only. No call has been placed.";
    });
    $("sa-save-provider").addEventListener("click",()=>{
      data.settings={provider:$("sa-provider").value,fromNumber:$("sa-from").value.trim(),endpoint:$("sa-endpoint").value.trim()};
      persist();$("sa-provider-status").textContent="Saved locally. No provider connection has been tested; secrets must remain server-side.";
    });
    $("sa-call").addEventListener("click",()=>{$("sa-call-status").textContent="Calling is not enabled in this build. A verified server-side telephony integration and compliance checks must be completed first.";});
    $("sa-queue").addEventListener("change",e=>{const id=e.target.dataset.stage;if(!id)return;const x=data.queue.find(x=>x.id===id);if(x){x.status=e.target.value;if(x.status==="Do not contact"){x.consent=false;x.nextStep="Suppress future outreach";}persist();}});
    $("sa-queue").addEventListener("click",e=>{const id=e.target.dataset.pick;if(!id)return;$("sa-selected").value=id;render();$("sa-call-status").textContent="Prospect selected. Review permission and script before any action.";});
    $("sa-final-approval").addEventListener("change",e=>{if(e.target.checked){$("sa-call-status").textContent="Approval recorded for review only. Actual calling remains disabled until server verification.";}});
  }
  document.addEventListener("DOMContentLoaded",mount);
})();
