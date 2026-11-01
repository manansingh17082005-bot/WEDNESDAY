const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let paused = true;
let clients = [];
let tasks = [
  {text:"Review client follow-ups",done:false,tag:"Work"},
  {text:"Complete today's study session",done:false,tag:"Personal"}
];

const titles = {
  overview:"Good morning, Manan.", assistant:"Talk to WEDNESDAY",
  clients:"Client CRM", messages:"Messages & inbox",
  personal:"Personal life manager", coach:"English & communication coach",
  settings:"Control & settings"
};

function showPage(name){
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${name}`));
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  $("#page-title").textContent=titles[name]||"WEDNESDAY";
}
$("#nav").addEventListener("click",e=>{
  const btn=e.target.closest("[data-page]");
  if(btn) showPage(btn.dataset.page);
});
$$("[data-go]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.go)));

function renderTasks(){
  $("#task-list").innerHTML="";
  tasks.forEach((task,i)=>{
    const li=document.createElement("li");
    const label=document.createElement("label");
    const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=task.done;
    cb.addEventListener("change",()=>{tasks[i].done=cb.checked;renderTasks()});
    const span=document.createElement("span"); span.textContent=task.text;
    if(task.done) span.style.textDecoration="line-through";
    const tag=document.createElement("em"); tag.textContent=task.tag;
    label.append(cb,span);li.append(label,tag);$("#task-list").append(li);
  });
  $("#task-count").textContent=tasks.filter(t=>!t.done).length;
}
$("#task-form").addEventListener("submit",e=>{
  e.preventDefault();const input=$("#task-input");const text=input.value.trim();if(!text)return;
  tasks.push({text,done:false,tag:"Personal"});input.value="";renderTasks();
});

$("#client-form").addEventListener("submit",e=>{
  e.preventDefault();
  const client={name:$("#client-name").value.trim(),contact:$("#client-contact").value.trim(),service:$("#client-service").value.trim()};
  if(!client.name)return;clients.push(client);
  $("#client-name").value=$("#client-contact").value=$("#client-service").value="";
  renderClients();
});
function renderClients(){
  $("#client-count").textContent=clients.length;
  const tbody=$("#client-table");tbody.innerHTML="";
  if(!clients.length){const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=4;td.className="empty";td.textContent="No clients added yet. Add your first client above.";tr.append(td);tbody.append(tr);return}
  clients.forEach(c=>{const tr=document.createElement("tr");[c.name,c.contact||"—",c.service||"—","New"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td)});tbody.append(tr)});
}

$("#chat-form").addEventListener("submit",e=>{
  e.preventDefault();const input=$("#chat-input");const value=input.value.trim();if(!value)return;
  const user=document.createElement("div");user.className="user-bubble";user.textContent=value;$("#chat-body").append(user);
  const reply=document.createElement("div");reply.className="assistant-bubble";
  const b=document.createElement("b");b.textContent="AI connection required";
  const p=document.createElement("p");p.textContent="I've received your message in this local preview, but live AI responses are not active yet. Next we'll connect a secure backend so your message can be processed by your chosen AI model.";
  const small=document.createElement("small");small.textContent="No message was sent to an external AI service.";
  reply.append(b,p,small);$("#chat-body").append(reply);input.value="";reply.scrollIntoView({behavior:"smooth",block:"nearest"});
});

function setPaused(value){
  paused=value;$("#automation-state").textContent=paused?"Paused":"Ready";
  $("#pause-status").textContent=paused?"Automations are paused.":"No external automations are configured in this foundation build.";
  $("#master-pause").textContent=paused?"Automations paused":"Pause all automations";
  $("#pause-btn").textContent=paused?"Ⅱ":"▶";
}
$("#master-pause").addEventListener("click",()=>setPaused(true));
$("#pause-btn").addEventListener("click",()=>setPaused(true));

$("#save-config").addEventListener("click",()=>{
  const url=$("#supabase-url").value.trim(),key=$("#supabase-key").value.trim();
  const result=$("#config-result");
  if(!url||!key){result.textContent="Enter both the project URL and public anon/publishable key.";return}
  if(!/^https:\/\/[a-zA-Z0-9.-]+\.supabase\.co$/.test(url)){result.textContent="That URL doesn't look like a Supabase project URL.";return}
  if(key.length<20){result.textContent="The key looks too short. Check the Supabase API settings.";return}
  window.WEDNESDAY_CONFIG.supabaseUrl=url;window.WEDNESDAY_CONFIG.supabaseAnonKey=key;
  result.textContent="Configuration accepted in this page session only. Database connection testing will be added in the next step.";
  $("#supabase-status").textContent="Config entered";
});

const now=new Date();$("#date-label").textContent=now.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}).toUpperCase();
renderTasks();renderClients();setPaused(true);
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
