/* WEDNESDAY — selectable companions with cursor-aware 2D faces */
(() => {
  "use strict";
  const STORAGE_KEY = "wednesday_active_companion";
  const characters = {
    shinchan:{name:"Shinchan",emoji:"🧒",role:"Everyday AI & coding helper",prompt:"You are Shinchan, WEDNESDAY's friendly everyday AI and technology helper. Help with general questions, coding, website development, troubleshooting, learning and creative brainstorming. Explain technical work step by step in simple language. Be playful and upbeat but accurate, respectful and useful."},
    himawari:{name:"Himawari",emoji:"👧",role:"Excel, data & reports specialist",prompt:"You are Himawari, WEDNESDAY's Excel and data specialist. Focus on Excel formulas, spreadsheets, data cleaning, sorting, validation, pivot tables, dashboards, calculations and clear business reports. Give exact formulas and explain where to enter them."},
    shiro:{name:"Shiro",emoji:"🐶",role:"Tasks & productivity companion",prompt:"You are Shiro, WEDNESDAY's organisation and productivity companion. Help break goals into practical steps, organise to-do lists, plan study sessions, prepare checklists and structure routines. Keep plans realistic and concise."}
  };
  let activeId=localStorage.getItem(STORAGE_KEY);
  if(!characters[activeId]) activeId="shinchan";
  function setActiveCharacter(id){
    if(!characters[id])return;
    activeId=id; localStorage.setItem(STORAGE_KEY,id);
    document.querySelectorAll("[data-character]").forEach(b=>{
      const selected=b.dataset.character===id;
      b.classList.toggle("is-selected",selected);
      b.setAttribute("aria-pressed",String(selected));
    });
    const c=characters[id], detail=document.getElementById("companion-detail");
    if(detail){detail.innerHTML="";const strong=document.createElement("strong");strong.textContent=c.name;const span=document.createElement("span");span.textContent=c.role;detail.append(strong,span);}
    const name=document.getElementById("active-companion-name"),role=document.getElementById("active-companion-role"),avatar=document.getElementById("active-companion-avatar"),input=document.getElementById("chat-input"),stage=document.getElementById("wednesday-stage");
    if(name)name.textContent=c.name;if(role)role.textContent=c.role+" · Llama 3.2";if(avatar)avatar.textContent=c.emoji;if(input)input.placeholder="Talk to "+c.name+"…";if(stage)stage.dataset.companion=id;
    window.WEDNESDAY_ACTIVE_COMPANION=id;window.WEDNESDAY_COMPANION_PROMPT=c.prompt;
    const greeting=document.getElementById("companion-greeting");if(greeting)greeting.textContent=id==="shinchan"?"Hey! I'm Shinchan. Let's have fun while we get things done!":id==="himawari"?"Hi! I'm Himawari. Let's make your data sparkle!":"Woof! I'm Shiro. Ready to organise your day?";
  }
  function render(){
    const aside=document.querySelector(".character-companions");if(!aside)return;
    aside.innerHTML=`
      <div class="companion-picker">
        <div class="companion-picker-heading"><span class="eyebrow">YOUR CHILDHOOD FRIENDS</span><h3>Always here with you</h3><p>Classic anime artwork, gentle idle motion and cursor reactions.</p></div>
        <div class="buddy-stage" id="buddy-stage" aria-label="Animated 2D companion">
          <div class="buddy-scene" id="buddy-scene">
            <div class="buddy-art shinchan-art"><img class="classic-character-image" src="./assets/shinchan.webp" alt="Classic Shinchan Nohara" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="character-image-placeholder" hidden>Add Shinchan artwork at assets/shinchan.png</span></div>
            <div class="buddy-art himawari-art"><img class="classic-character-image" src="https://img-13.stickers.cloud/packs/cac801b5-19b1-4f8f-aab7-20d3cb27263f/webp/c48cf2e8-07a1-4309-af4f-ee72641301b8.webp" alt="Classic Himawari Nohara" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="character-image-placeholder" hidden>Himawari artwork could not load — check your connection</span></div>
            <div class="buddy-art shiro-art"><div class="dog-ear ear-left"></div><div class="dog-ear ear-right"></div><div class="buddy-face"><i class="eye eye-left"></i><i class="eye eye-right"></i><i class="dog-nose"></i><i class="dog-mouth"></i></div><div class="buddy-body"></div></div>
          </div>
          <div class="buddy-shadow"></div>
        </div>
        <div class="companion-options" role="group" aria-label="Choose a companion">
          <button type="button" class="companion-option" data-character="shinchan" aria-pressed="false"><span class="companion-avatar shinchan-avatar"><img src="./assets/shinchan.webp" alt="" onerror="this.replaceWith(document.createTextNode('🧒'))"></span><span class="companion-option-copy"><strong>Shinchan</strong><small>Everyday AI & coding</small></span><span class="companion-check">✓</span></button>
          <button type="button" class="companion-option" data-character="himawari" aria-pressed="false"><span class="companion-avatar himawari-avatar"><img src="https://img-13.stickers.cloud/packs/cac801b5-19b1-4f8f-aab7-20d3cb27263f/webp/c48cf2e8-07a1-4309-af4f-ee72641301b8.webp" alt="" onerror="this.replaceWith(document.createTextNode('👧'))"></span><span class="companion-option-copy"><strong>Himawari</strong><small>Excel & data reports</small></span><span class="companion-check">✓</span></button>
          <button type="button" class="companion-option" data-character="shiro" aria-pressed="false"><span class="companion-avatar shiro-avatar">🐶</span><span class="companion-option-copy"><strong>Shiro</strong><small>Tasks & productivity</small></span><span class="companion-check">✓</span></button>
        </div>
        <div class="companion-detail" id="companion-detail" aria-live="polite"></div>
        <p class="companion-art-note" id="companion-greeting">Your friends are waiting!</p>
      </div>`;
    aside.querySelectorAll("[data-character]").forEach(b=>b.addEventListener("click",()=>setActiveCharacter(b.dataset.character)));
    setActiveCharacter(activeId);
    const scene=document.getElementById("buddy-scene");
    activateMovement(scene);
    document.addEventListener("mousemove",e=>{
      if(!scene)return;
      const r=scene.getBoundingClientRect(),x=(e.clientX-(r.left+r.width/2))/(r.width/2),y=(e.clientY-(r.top+r.height/2))/(r.height/2);
      scene.style.setProperty("--look-x",Math.max(-1,Math.min(1,x))*5+"px");
      scene.style.setProperty("--look-y",Math.max(-1,Math.min(1,y))*4+"px");
    },{passive:true});
    document.addEventListener("mouseleave",()=>{if(scene){scene.style.setProperty("--look-x","0px");scene.style.setProperty("--look-y","0px");}});
  }

  // Draggable companions with gentle autonomous wandering.
  function activateMovement(scene) {
    if (!scene || scene.dataset.movementReady) return;
    scene.dataset.movementReady = "true";
    const stage = document.getElementById("wednesday-stage");
    let dragging = null, startX = 0, startY = 0, baseX = 0, baseY = 0;
    let wander = 0, direction = 1, last = 0;
    const getActive = () => scene.querySelector('.buddy-art[style*="--active-art"]') ||
      scene.querySelector('.shinchan-art, .himawari-art, .shiro-art');
    scene.querySelectorAll(".buddy-art").forEach(art => {
      art.style.touchAction = "none";
      art.style.cursor = "grab";
      art.addEventListener("pointerdown", e => {
        if (art.offsetParent === null) return;
        dragging = art; startX = e.clientX; startY = e.clientY;
        baseX = Number(art.dataset.dragX || 0); baseY = Number(art.dataset.dragY || 0);
        art.setPointerCapture(e.pointerId); art.style.cursor = "grabbing";
        art.style.animationPlayState = "paused";
        e.preventDefault();
      });
      art.addEventListener("pointermove", e => {
        if (dragging !== art) return;
        const x = Math.max(-scene.clientWidth * .38, Math.min(scene.clientWidth * .38, baseX + e.clientX - startX));
        const y = Math.max(-35, Math.min(12, baseY + e.clientY - startY));
        art.dataset.dragX = x; art.dataset.dragY = y;
        art.style.setProperty("--drag-x", x + "px");
        art.style.setProperty("--drag-y", y + "px");
      });
      const finish = () => { if (dragging === art) { dragging = null; art.style.cursor = "grab"; art.style.animationPlayState = ""; } };
      art.addEventListener("pointerup", finish); art.addEventListener("pointercancel", finish);
    });
    function stroll(now) {
      if (!last) last = now;
      const dt = Math.min((now-last)/1000, .05); last = now;
      if (!dragging && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        wander += direction * dt * 10;
        if (wander > 24 || wander < -24) direction *= -1;
        scene.style.setProperty("--wander-x", wander + "px");
      }
      requestAnimationFrame(stroll);
    }
    requestAnimationFrame(stroll);
    scene.addEventListener("pointerenter", () => scene.classList.add("buddy-hovered"));
    scene.addEventListener("pointerleave", () => scene.classList.remove("buddy-hovered"));
  }

  const originalFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    const url=typeof input==="string"?input:input&&input.url;
    if(url&&url.includes("localhost:11434/api/chat")&&init&&typeof init.body==="string"){
      try{const payload=JSON.parse(init.body);const sys=payload.messages?.find(m=>m.role==="system");if(sys)sys.content+="\n\nACTIVE WEDNESDAY COMPANION:\n"+(window.WEDNESDAY_COMPANION_PROMPT||characters[activeId].prompt);init={...init,body:JSON.stringify(payload)};}catch(e){console.warn("Companion prompt injection skipped",e);}
    }
    return originalFetch(input,init);
  };
  document.addEventListener("DOMContentLoaded",render);
})();
