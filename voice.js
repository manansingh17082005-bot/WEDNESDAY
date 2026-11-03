/* WEDNESDAY voice: speech output + hands-free browser speech recognition.
   A user gesture is required once to grant microphone permission and unlock audio. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null, enabled = false, speaking = false, restarting = false;
  let restartTimer = null, finalText = "", lastSpoken = "";
  const status = (message, state="idle") => {
    const el=$("wednesday-voice-status");
    if(el){el.textContent=message;el.dataset.state=state;}
    const btn=$("wednesday-handsfree");
    if(btn){btn.textContent=enabled?"🎙 Hands-free is ON · Turn off":"🎙 Enable voice";btn.setAttribute("aria-pressed",String(enabled));btn.classList.toggle("voice-active",enabled);}
  };
  const setState = s => window.WEDNESDAY_SET_STATE?.(s);
  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    const clean=String(text).replace(/\*{1,3}|#{1,6}\s?|\[([^\]]+)\]\([^)]+\)/g,"$1").slice(0,5000);
    if(!clean.trim())return;
    lastSpoken=clean;
    window.speechSynthesis.cancel();
    speaking=true;
    if(recognition){try{recognition.stop();}catch(_){}}
    const utterance=new SpeechSynthesisUtterance(clean);
    const voices=window.speechSynthesis.getVoices();
    const preferred=voices.find(v=>/^en-IN$/i.test(v.lang))||voices.find(v=>/^en-US/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang));
    if(preferred)utterance.voice=preferred;
    utterance.rate=1.02;utterance.pitch=1.08;utterance.volume=1;
    utterance.onstart=()=>setState("speaking");
    utterance.onend=utterance.onerror=()=>{
      speaking=false;setState("idle");
      if(enabled)scheduleRestart();
    };
    window.speechSynthesis.speak(utterance);
  }
  window.WEDNESDAY_SPEAK=speak;
  function scheduleRestart(){
    clearTimeout(restartTimer);
    if(!enabled||speaking||!recognition||restarting)return;
    restartTimer=setTimeout(()=>{if(!enabled||speaking)return;try{restarting=true;recognition.start();}catch(_){restarting=false;}},900);
  }
  function submit(text){
    const input=$("chat-input"),form=$("chat-form");
    if(!input||!form||!text.trim())return;
    input.value=text.trim();form.requestSubmit();
  }
  function setupRecognition(){
    if(!Recognition){status("Voice input is not supported here. Please use Chrome or Edge.", "error");return false;}
    recognition=new Recognition();
    recognition.lang="en-IN";recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
    recognition.onstart=()=>{restarting=false;if(enabled&&!speaking){status("Listening… talk naturally. Say “stop listening” to pause.","listening");setState("listening");}};
    recognition.onresult=e=>{
      let interim="";
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=e.results[i][0].transcript.trim();
        if(e.results[i].isFinal)finalText+=(finalText?" ":"")+t;else interim+=t;
      }
      if(finalText.trim()){
        const heard=finalText.trim();finalText="";
        if(/^(stop listening|disable listening|go to sleep)$/i.test(heard)){disable();return;}
        try{recognition.stop();}catch(_){}
        status("Heard: "+heard,"busy");submit(heard);
      }else if(interim){const el=$("wednesday-voice-status");if(el)el.textContent="Hearing: "+interim;}
    };
    recognition.onerror=e=>{
      restarting=false;
      if(e.error==="not-allowed"||e.error==="service-not-allowed"){enabled=false;status("Microphone blocked. Allow it in your browser's site settings.","error");}
      else if(e.error!=="no-speech"&&e.error!=="aborted")status("Voice input: "+e.error+". Retrying…","error");
    };
    recognition.onend=()=>{restarting=false;if(enabled&&!speaking)scheduleRestart();};
    return true;
  }
  function enable(){
    if(!recognition&&!setupRecognition())return;
    enabled=true;finalText="";status("Starting microphone…","listening");scheduleRestart();
    // Start immediately inside the click gesture for browser permission.
    try{restarting=true;recognition.start();}catch(_){restarting=false;scheduleRestart();}
  }
  function disable(){
    enabled=false;clearTimeout(restartTimer);
    if(recognition){try{recognition.stop();}catch(_){}}
    status("Voice paused. Select Enable voice when you're ready.");setState("idle");
  }
  function addControls(){
    const form=$("chat-form");if(!form||$("wednesday-handsfree"))return;
    const btn=document.createElement("button");btn.type="button";btn.id="wednesday-handsfree";btn.className="secondary-btn handsfree-button";btn.textContent="🎙 Enable voice";
    btn.addEventListener("click",()=>enabled?disable():enable());
    const send=form.querySelector('button[type="submit"]');if(send)form.insertBefore(btn,send);else form.append(btn);
    const note=document.createElement("small");note.id="wednesday-voice-status";note.className="voice-status";note.setAttribute("role","status");note.setAttribute("aria-live","polite");note.textContent="Enable voice once and allow microphone access. Replies will be spoken aloud.";
    form.insertAdjacentElement("afterend",note);
  }
  document.addEventListener("DOMContentLoaded",addControls);
  if(document.readyState!=="loading")addControls();
  window.WEDNESDAY_HANDSFREE={enable,disable,speak,get enabled(){return enabled;}};
})();