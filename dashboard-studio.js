/* WEDNESDAY Dashboard Studio — client-side dashboard builder */
(() => {
  "use strict";
  const KEY = "wednesday_saved_dashboards";
  let rows = [];
  let headers = [];
  let charts = [];
  let currentDashboard = null;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) { return []; } };
  const setStatus = (message, error=false) => { const el=$("dash-status"); if(el){el.textContent=message;el.dataset.error=String(error);} };
  const numeric = value => value !== null && value !== "" && Number.isFinite(Number(String(value).replace(/[,₹$%\s]/g,"")));
  const number = value => Number(String(value ?? 0).replace(/[,₹$%\s]/g,"")) || 0;
  function destroyCharts(){ charts.forEach(chart=>chart.destroy()); charts=[]; }
  function inferColumns(data){
    headers = Object.keys(data[0] || {});
    const numericCols = headers.filter(h => data.some(r=>r[h]!=="" && r[h]!=null) && data.filter(r=>r[h]!=="" && r[h]!=null).length / data.length >= .6 && data.filter(r=>numeric(r[h])).length / data.length >= .6);
    const categoryCols = headers.filter(h=>!numericCols.includes(h) && new Set(data.map(r=>String(r[h]??"").trim()).filter(Boolean)).size <= Math.max(2,Math.min(30,data.length*.7)));
    return {numericCols,categoryCols};
  }
  function options(id, values, preferred){
    const el=$(id); if(!el)return;
    el.innerHTML=values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    if(preferred && values.includes(preferred))el.value=preferred;
  }
  function populateControls(){
    const cols=inferColumns(rows);
    options("dash-metric",cols.numericCols,cols.numericCols[0]);
    options("dash-category",cols.categoryCols,cols.categoryCols[0]);
    options("dash-kpi",cols.numericCols,cols.numericCols[0]);
    const filter=$("dash-filter");
    if(filter){filter.innerHTML='<option value="">All records</option>'+cols.categoryCols.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");}
    $("dash-build-btn").disabled=!rows.length;
    setStatus(rows.length+" rows loaded · "+headers.length+" columns detected.");
    renderPreview();
  }
  function aggregate(){
    const metric=$("dash-metric")?.value, category=$("dash-category")?.value, filter=$("dash-filter")?.value;
    let data=rows;
    if(filter && category){const selected=filter;data=data.filter(r=>String(r[category]??"")===selected);}
    const grouped={};
    if(category && metric){data.forEach(r=>{const key=String(r[category]||"Unspecified");grouped[key]=(grouped[key]||0)+number(r[metric]);});}
    return {data,labels:Object.keys(grouped),values:Object.values(grouped),metric,category};
  }
  function renderPreview(){
    if(!rows.length)return;
    destroyCharts();
    const {data,labels,values,metric,category}=aggregate();
    const numericCols=headers.filter(h=>rows.filter(r=>numeric(r[h])).length/rows.length>=.6);
    const kpiField=$("dash-kpi")?.value || numericCols[0];
    const total=kpiField?data.reduce((sum,r)=>sum+number(r[kpiField]),0):data.length;
    const average=kpiField?(total/Math.max(data.filter(r=>numeric(r[kpiField])).length,1)):0;
    const kpis=[
      ["Records",data.length.toLocaleString()],
      [kpiField||"Total",kpiField?total.toLocaleString(undefined,{maximumFractionDigits:2}):data.length],
      ["Average",kpiField?average.toLocaleString(undefined,{maximumFractionDigits:2}):"—"],
      ["Fields",headers.length]
    ];
    $("dash-kpis").innerHTML=kpis.map(([label,value])=>'<article class="stat-card"><span>'+esc(label.toUpperCase())+'</span><strong>'+esc(value)+'</strong><small>Based on imported data</small></article>').join("");
    $("dash-table-head").innerHTML="<tr>"+headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
    $("dash-table-body").innerHTML=data.slice(0,100).map(r=>"<tr>"+headers.map(h=>"<td>"+esc(r[h])+"</td>").join("")+"</tr>").join("") || '<tr><td>No rows match this filter.</td></tr>';
    const canvas=$("dash-chart");
    if(canvas && window.Chart && labels.length){
      charts.push(new Chart(canvas,{type:$("dash-chart-type")?.value||"bar",data:{labels,datasets:[{label:metric||"Records",data:values,borderWidth:1,borderRadius:6,backgroundColor:"rgba(155,140,255,.68)",borderColor:"#9b8cff"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:"#dce2f0"}}},scales:{x:{ticks:{color:"#aeb8ca"},grid:{color:"rgba(255,255,255,.05)"}},y:{ticks:{color:"#aeb8ca"},grid:{color:"rgba(255,255,255,.07)"}}}}}));
    } else if(canvas) {
      const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle="#aeb8ca";ctx.font="14px sans-serif";ctx.fillText("Choose a category and numeric field to create a chart.",18,35);
    }
    currentDashboard={name:$("dash-name")?.value.trim()||"My Dashboard",metric,category,chartType:$("dash-chart-type")?.value||"bar",kpiField,createdAt:new Date().toISOString(),headers,rows};
  }
  async function readFile(file){
    if(!file)return;
    try{
      const buffer=await file.arrayBuffer();
      let data;
      if(window.XLSX){const wb=XLSX.read(buffer,{type:"array"});const sheet=wb.Sheets[wb.SheetNames[0]];data=XLSX.utils.sheet_to_json(sheet,{defval:""});}
      else throw new Error("Spreadsheet reader did not load. Refresh and try again.");
      if(!data.length)throw new Error("No data rows found in the first worksheet.");
      rows=data.slice(0,10000);populateControls();
    }catch(error){setStatus(error.message,true);}
  }
  function saveDashboard(){
    if(!rows.length)return;
    renderPreview();
    const all=saved();const record={...currentDashboard,id:crypto.randomUUID?.()||String(Date.now())};
    all.unshift(record);localStorage.setItem(KEY,JSON.stringify(all.slice(0,20)));
    renderSaved();setStatus("Dashboard saved in this browser. It is not yet synced to cloud storage.");
  }
  function renderSaved(){
    const list=$("dash-saved-list");if(!list)return;
    const all=saved();
    list.innerHTML=all.length?all.map(d=>'<button type="button" class="saved-dashboard" data-open-dashboard="'+esc(d.id)+'"><strong>'+esc(d.name)+'</strong><small>'+esc(new Date(d.createdAt).toLocaleDateString())+' · '+(d.rows?.length||0)+' rows</small></button>').join(""):"<p class='muted'>Your saved dashboards will appear here.</p>";
    list.querySelectorAll("[data-open-dashboard]").forEach(btn=>btn.addEventListener("click",()=>{const item=saved().find(d=>d.id===btn.dataset.openDashboard);if(!item)return;rows=item.rows||[];$("dash-name").value=item.name;populateControls();options("dash-metric",inferColumns(rows).numericCols,item.metric);options("dash-category",inferColumns(rows).categoryCols,item.category);$("dash-chart-type").value=item.chartType||"bar";options("dash-kpi",inferColumns(rows).numericCols,item.kpiField);renderPreview();setStatus("Loaded saved dashboard: "+item.name);}));
  }
  function exportDashboard(){
    if(!rows.length||!window.XLSX)return;
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Dashboard Data");
    const summary=[["Dashboard",currentDashboard?.name||"My Dashboard"],["Metric",currentDashboard?.metric||""],["Category",currentDashboard?.category||""],["Rows",rows.length],["Generated",new Date().toLocaleString()]];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),"Summary");XLSX.writeFile(wb,"WEDNESDAY_Dashboard.xlsx");
  }
  function init(){
    const upload=$("dash-file");
    upload?.addEventListener("change",e=>readFile(e.target.files?.[0]));
    $("dash-build-btn")?.addEventListener("click",renderPreview);
    ["dash-metric","dash-category","dash-chart-type","dash-kpi","dash-filter"].forEach(id=>$(id)?.addEventListener("change",renderPreview));
    $("dash-save-btn")?.addEventListener("click",saveDashboard);
    $("dash-export-btn")?.addEventListener("click",exportDashboard);
    $("dash-name")?.addEventListener("input",()=>{if(rows.length)currentDashboard.name=$("dash-name").value;});
    renderSaved();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();