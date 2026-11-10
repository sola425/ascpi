const CACHE='labwise-v13';
const ASSETS=["./web-test.html", "./web-test.js", "./web-test.css", "./", "./index.html", "./style.css", "./game.css", "./game.js", "./game-ui.js", "./voice.js", "./game-sync.js", "./frenzy.js", "./arcade-ui.js", "./arcade.css", "./onboarding.js", "./onboarding.css", "./account-ui.js", "./account.css", "./sync-config.json", "./sync-config.js", "./sync-model.js", "./sync.js", "./supabase-client.js", "./duel-client.js", "./auth-callback.html", "./auth-callback.js", "./auth-callback.css", "./data/quiz-meta.json", "./app.js", "./questions.js", "./learning.js", "./teaching.js", "./storage.js", "./sources.js", "./icons.js", "./data/catalog.json", "./data/study-bank.json", "./data/study-pages.json", "./data/teaching.json", "./data/teaching-coverage.json", "./data/glossary.json", "./icon.svg", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest", "./compatibility.js", "./host-voice.js", "./host-dialogue.js", "./host-game.js", "./host-ui.js", "./host.css", "./figures.js", "./figures.css", "./data/figures.json"];
const STATIC_URLS=new Set(ASSETS.map(path=>new URL(path,self.location.href).href));
const FIGURE_ROOT=new URL('./assets/figures/',self.location.href);
const PDF_URLS=new Set(['textbook.pdf','boc-1.pdf','boc-2.pdf'].map(name=>new URL('./docs/'+name,self.location.href).href));
const isFigure=url=>url.origin===FIGURE_ROOT.origin&&url.pathname.startsWith(FIGURE_ROOT.pathname)&&/^[a-f0-9]{24}\.webp$/.test(url.pathname.slice(FIGURE_ROOT.pathname.length))&&!url.search;
async function cacheFigures(cache){
 const response=await cache.match('./data/figures.json');
 if(!response)throw Error('The source visual manifest was not cached.');
 const manifest=await response.json(),urls=[...new Set(Object.values(manifest.figures||{}).map(figure=>figure?.path).filter(path=>typeof path==='string'&&/^assets\/figures\/[a-f0-9]{24}\.webp$/.test(path)).map(path=>new URL('./'+path,self.location.href).href))];
 let next=0;
 // Image quota failure must not prevent installation of the core study shell.
 // Android includes every image in its APK and does not use this cache.
 await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{
  while(next<urls.length){
   const url=urls[next++];
   try{const previous=await caches.match(url);if(previous?.ok)await cache.put(url,previous);else await cache.add(url);}catch{/* An uncached image retries online; core study remains installed. */}
  }
 }));
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await cacheFigures(cache);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>/^labwise-v\d+$/.test(key)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);url.hash='';
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!(STATIC_URLS.has(url.href)||PDF_URLS.has(url.href)||isFigure(url)))return;
 event.respondWith((async()=>{
  const cached=await caches.match(event.request);if(!cached)return fetch(event.request);
  const range=event.request.headers.get('range');
  if(range&&PDF_URLS.has(url.href)){
   const blob=await cached.blob(),match=/bytes=(\d+)-(\d*)/.exec(range);
   if(match){
    const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),blob.size-1):blob.size-1;
    if(start>=blob.size||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${blob.size}`}});
    return new Response(blob.slice(start,end+1),{status:206,headers:{'Content-Type':'application/pdf','Content-Range':`bytes ${start}-${end}/${blob.size}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
   }
  }
  return cached;
 })());
});
