#!/usr/bin/env python3
"""WEDNESDAY local-first public web lead discovery. Python standard library only."""
from __future__ import annotations
import json, re, time, html
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode, urlparse, parse_qs, unquote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

HOST, PORT = "127.0.0.1", 8765
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36"
LAST_REQUEST = 0.0

SERVICES = {
 "Excel Reporting & Dashboards": {
  "terms":["excel dashboard","excel reporting","sales report","inventory report","management report","MIS report"],
  "direct":["looking for an excel","excel expert required","need an excel","excel dashboard required","excel reporting project","google sheets dashboard","spreadsheet automation required"],
  "problem":["manual reporting","reporting takes hours","spreadsheet errors","manual excel reports","inventory tracking in excel"]},
 "Google Sheets Automation": {
  "terms":["google sheets automation","google sheets dashboard","spreadsheet automation","google sheets workflow"],
  "direct":["google sheets expert required","need google sheets automation","looking for google sheets","spreadsheet automation project","google sheets developer"],
  "problem":["manual tracking","repetitive spreadsheet","spreadsheet errors","manual data entry"]},
 "Excel / Data Entry": {
  "terms":["excel data entry","spreadsheet cleanup","data cleaning excel"],
  "direct":["data entry operator required","excel data entry project","looking for data entry","spreadsheet cleanup required"],
  "problem":["data entry backlog","unorganised records","manual records","spreadsheet cleanup"]},
 "Website Development": {
  "terms":["website development","business website","website redesign","ecommerce website","web developer"],
  "direct":["website developer required","looking for a web developer","need a website developer","website development project","website redesign project"],
  "problem":["website under construction","website coming soon","outdated website","broken website","website not working","no official website"]},
 "Social Media Management": {
  "terms":["social media management","social media manager","instagram management","content calendar"],
  "direct":["social media manager required","looking for social media management","need social media manager","social media agency required"],
  "problem":["irregular social media posting","inactive instagram","no recent social media posts","social media account not updated"]},
 "Video Editing": {
  "terms":["video editing","reels editor","short form video","promotional video editing"],
  "direct":["video editor required","looking for a video editor","need a video editor","reels editor required","video editing project"],
  "problem":["new product launch","promotional videos","video content for business","product demonstration video"]},
 "Data Analysis": {
  "terms":["data analysis","business analytics","KPI dashboard","business intelligence"],
  "direct":["data analyst required","dashboard developer required","looking for data analyst","business dashboard project","power bi dashboard required"],
  "problem":["manual reporting","reporting delays","no KPI dashboard","sales reporting manually"]},
 "Digital Marketing": {
  "terms":["digital marketing","marketing services","online marketing","performance marketing","SEO marketing"],
  "direct":["digital marketing agency required","looking for digital marketing agency","need digital marketing services","marketing agency required","SEO agency required"],
  "problem":["low website traffic","poor online visibility","not generating online leads","digital marketing support"]}
}
INTERMEDIARY = ["job board","jobs portal","recruitment","staffing agency","placement agency","commission agent","lead seller","buy leads","sell leads","freelancer marketplace","project bidding","tender aggregator"]
PROVIDER = ["we offer digital marketing","our digital marketing services","we provide website development","our web development services","we offer social media management","our social media services","hire our agency","our video editing services","we provide excel services","our portfolio"]

class PageParser(HTMLParser):
 def __init__(self):
  super().__init__(); self.text=[]; self.links=[]; self.link=None; self.in_title=False; self.title=[]
 def handle_starttag(self, tag, attrs):
  a=dict(attrs)
  if tag=="a" and a.get("href"):
   self.link={"href":a["href"],"class":a.get("class",""),"text":""}; self.links.append(self.link)
  if tag=="title": self.in_title=True
 def handle_endtag(self, tag):
  if tag=="a": self.link=None
  if tag=="title": self.in_title=False
 def handle_data(self, data):
  s=data.strip()
  if s:
   self.text.append(s)
   if self.link is not None: self.link["text"] += " "+s
   if self.in_title: self.title.append(s)

def fetch(url, timeout=9, limit=400000):
 req=Request(url,headers={"User-Agent":UA,"Accept":"text/html,application/xhtml+xml"})
 with urlopen(req,timeout=timeout) as r:
  if "html" not in r.headers.get("Content-Type","").lower(): return ""
  return r.read(limit).decode("utf-8",errors="replace")

def result_url(url):
 p=urlparse(url)
 if "duckduckgo.com" in p.netloc:
  return unquote(parse_qs(p.query).get("uddg",[""])[0]) or url
 return url

def search(query):
 page=fetch("https://html.duckduckgo.com/html/?"+urlencode({"q":query}),15,850000)
 parser=PageParser(); parser.feed(page); out=[]
 for a in parser.links:
  if "result__a" not in a["class"]: continue
  url=result_url(a["href"])
  if not url.startswith("http") or "duckduckgo.com" in urlparse(url).netloc: continue
  title=re.sub(r"\s+"," ",a["text"]).strip()
  if title: out.append({"title":title[:180],"url":url})
  if len(out)>=8: break
 return out

def page_text(source):
 p=PageParser(); p.feed(source)
 title=" ".join(p.title).strip()
 text=re.sub(r"\s+"," ",html.unescape(" ".join(p.text)))
 return title[:180],text[:28000]

def contacts(text):
 emails=re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}",text,re.I)
 email=next((x for x in emails if not any(t in x.lower() for t in ["example.","sentry."])), "")
 wa=re.search(r"(?:https?://)?(?:api\.)?wa\.me/(?:send/)?([0-9]{8,15})",text,re.I)
 whatsapp=wa.group(1) if wa else ""
 m=re.search(r"(?:phone|telephone|mobile|call|contact|tel|whatsapp)[^\d]{0,45}(\+?\d[\d\s().-]{7,18}\d)",text,re.I)
 candidate=m.group(1) if m else ""
 digits=re.sub(r"\D","",candidate)
 phone=("+"+digits if len(digits)>10 else ("+91 "+digits if len(digits)==10 else digits)) if 8<=len(digits)<=15 else ""
 return phone,email,whatsapp

def queries(data,service):
 p=SERVICES[service]; mode=data["businessModel"]; kind=data["businessType"]; place=data["location"]; extra=data.get("keywords","")
 q=[]
 if mode in ("freelance","both"):
  for term in p["direct"][:3]: q.append('"'+term+'" "'+place+'" '+kind+" "+extra)
 if mode in ("agency","both"):
  for term in p["problem"][:2]: q.append('"'+term+'" "'+place+'" '+kind+" business contact")
  q.append('"'+kind+'" "'+place+'" "'+p["terms"][0]+'" contact us')
 return list(dict.fromkeys(q))[:6]

def qualify(title,text,url,service,mode):
 p=SERVICES[service]; hay=(title+" "+text+" "+url).lower()
 direct=[x for x in p["direct"] if x in hay]
 problems=[x for x in p["problem"] if x in hay]
 matches=[x for x in p["terms"] if x in hay]
 intermediary=any(x in hay for x in INTERMEDIARY)
 provider=any(x in hay for x in PROVIDER)
 host=urlparse(url).netloc.lower()
 directory=any(x in host for x in ["linkedin.com","facebook.com","instagram.com","youtube.com","justdial.com","sulekha.com","indiamart.com","naukri.com","indeed.com"])
 if intermediary or (provider and not direct):
  return {"ok":False,"grade":"Rejected","score":0,"reasons":["Likely intermediary, job listing or service-provider advertisement."]}
 if direct:
  score=min(95,55+min(20,len(direct)*10)+(10 if matches else 0)+(10 if not directory else 0))
  return {"ok":True,"grade":"A","score":score,"reasons":["Explicit buyer-intent wording: "+", ".join(direct[:3])],"evidence":direct[:4]}
 if mode in ("agency","both") and problems and not directory:
  score=min(82,45+min(15,len(problems)*8)+(10 if matches else 0)+5)
  return {"ok":True,"grade":"B","score":score,"reasons":["Business-problem evidence: "+", ".join(problems[:3])],"evidence":problems[:4]}
 return {"ok":False,"grade":"C","score":0,"reasons":["No sufficiently strong buying or business-problem evidence."]}

def run_search(data):
 selected=data.get("services") or []
 if len(selected)!=1 or selected[0] not in SERVICES: raise ValueError("Choose exactly one supported service.")
 service=selected[0]; kind=str(data.get("businessType","")).strip()[:80]; place=str(data.get("location","")).strip()[:100]
 if not kind or not place: raise ValueError("Enter a business type and location.")
 mode=data.get("businessModel","both")
 if mode not in ("freelance","agency","both"): mode="both"
 limit=max(1,min(20,int(data.get("limit",10))))
 qs=queries({"businessModel":mode,"businessType":kind,"location":place,"keywords":str(data.get("keywords",""))[:150]},service)
 found={}; screened=0; errors=[]
 for query in qs:
  try:
   for item in search(query):
    url=item["url"]; host=urlparse(url).netloc.lower()
    if not host: continue
    title=item["title"]; text=""
    try:
     title2,text=page_text(fetch(url,7,350000))
     if title2: title=title2
    except Exception: pass
    qualification=qualify(item["title"]+" "+title,text,url,service,mode); screened+=1
    filters=data.get("filters") or {}
    if filters.get("noWebsite") and not any(term in (text+" "+item["title"]).lower() for term in ["no website","website under construction","website coming soon","outdated website","broken website"]): continue
    if filters.get("weakSocial") and not any(term in (text+" "+item["title"]).lower() for term in ["inactive instagram","irregular posting","no recent posts","inactive social"]): continue
    if not qualification["ok"]: continue
    phone,email,whatsapp=contacts(text)
    if not (phone or email or whatsapp or text): continue
    key=re.sub(r"[^a-z0-9]","",(title or item["title"]).lower()) or host
    if key in found: continue
    lead_mode="Freelancer" if any(term in query.lower() for term in SERVICES[service]["direct"]) else "Agency"
    found[key]={
     "id":key,"name":title,"company":title,"contactPerson":"","phone":phone,"email":email,
     "whatsappNumber":whatsapp,"whatsappLink":"https://wa.me/"+whatsapp if whatsapp else "",
     "whatsappStatus":"Public WhatsApp link listed; verify before use" if whatsapp else ("Public phone found; WhatsApp not verified" if phone else "Not found"),
     "website":url,"source":"DuckDuckGo public web search","snippet":text[:950] or item["title"],
     "status":"Needs review","contactVerified":False,"publicContactFound":bool(phone or email or whatsapp),
     "priorityScore":qualification["score"],"priorityTier":qualification["grade"]+" · "+("Explicit buyer request" if qualification["grade"]=="A" else "Business opportunity evidence"),
     "qualification":qualification["grade"],"leadType":lead_mode,"businessModel":mode,
     "qualificationReasons":qualification["reasons"],"matchedServices":[service],
     "matchedEvidence":qualification.get("evidence",[]),"searchQuery":query,"added":False}
    if len(found)>=limit: break
   if len(found)>=limit: break
   time.sleep(1.1)
  except (HTTPError,URLError,TimeoutError) as exc:
   errors.append(str(exc)[:160])
 leads=sorted(found.values(),key=lambda x:x["priorityScore"],reverse=True)
 message="Public search engines may rate-limit automated requests. Retry later if access is temporarily blocked."
 if not leads and errors: message="The public search provider returned an error: "+errors[0]
 return {"leads":leads,"screenedCount":screened,"resultCount":len(leads),"provider":"DuckDuckGo public HTML search","searchedQueries":qs,"message":message,"qualityRule":"A = explicit buyer request; B = observable business problem. Scores are research priorities, not hiring probabilities."}

class Handler(BaseHTTPRequestHandler):
 def headers(self,status=200):
  origin=self.headers.get("Origin","")
  allowed=origin.startswith("https://manansingh17082005-bot.github.io") or origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1")
  self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8")
  self.send_header("Access-Control-Allow-Origin",origin if allowed else "null"); self.send_header("Vary","Origin")
  self.send_header("Access-Control-Allow-Methods","POST, OPTIONS"); self.send_header("Access-Control-Allow-Headers","Content-Type")
  self.send_header("Cache-Control","no-store"); self.end_headers()
 def do_OPTIONS(self): self.headers(204)
 def do_GET(self):
  if self.path=="/health":
   self.headers(); self.wfile.write(json.dumps({"ok":True,"service":"WEDNESDAY Local Lead Hunter"}).encode())
  else:
   self.headers(404); self.wfile.write(b'{"error":"Not found"}')
 def do_POST(self):
  global LAST_REQUEST
  if self.path!="/api/lead-search":
   self.headers(404); self.wfile.write(b'{"error":"Not found"}'); return
  if time.time()-LAST_REQUEST<1:
   self.headers(429); self.wfile.write(b'{"error":"Wait a moment before another search."}'); return
  LAST_REQUEST=time.time()
  try:
   size=int(self.headers.get("Content-Length","0"))
   if size<2 or size>32000: raise ValueError("Invalid request size.")
   data=json.loads(self.rfile.read(size).decode("utf-8")); result=run_search(data)
   self.headers(); self.wfile.write(json.dumps(result,ensure_ascii=False).encode("utf-8"))
  except Exception as exc:
   self.headers(400); self.wfile.write(json.dumps({"error":str(exc)},ensure_ascii=False).encode("utf-8"))
 def log_message(self,fmt,*args): print("[WEDNESDAY] "+fmt%args)

if __name__=="__main__":
 print("WEDNESDAY Local Lead Hunter")
 print("Local service: http://127.0.0.1:8765/health")
 print("Keep this window open while searching. Press Ctrl+C to stop.")
 ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
