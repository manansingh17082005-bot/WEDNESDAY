const CACHE="wednesday-foundation-v1";
const CACHE="wednesday-ollama-voice-v2";
const ASSETS=[
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./voice.js",
  "./config.js",
  "./manifest.webmanifest"
];
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
