import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function worker(){
 const listeners={},added=[],put=[],shell=[],base='https://example.test/labwise/',a='assets/figures/'+'a'.repeat(24)+'.webp',b='assets/figures/'+'b'.repeat(24)+'.webp';let skipped=false;
 const cache={addAll:async urls=>{shell.push(...urls);},match:async()=>({json:async()=>({figures:{first:{path:a},second:{path:b},private:{path:'https://private.example/audio?token=secret'}}})}),put:async url=>{put.push(url);},add:async url=>{added.push(url);throw Error('Browser image quota exhausted.');}};
 const context=vm.createContext({URL,Set,Promise,Response,console,self:{location:{href:base+'sw.js',origin:new URL(base).origin},addEventListener:(name,listener)=>{listeners[name]=listener;},skipWaiting:async()=>{skipped=true;},clients:{claim:async()=>{}}},caches:{open:async name=>{assert.equal(name,'labwise-v17');return cache;},match:async value=>String(value?.url||value).endsWith(a)?{ok:true}:null,keys:async()=>[],delete:async()=>true},fetch:async()=>({network:true})});
 vm.runInContext(source,context);
 return{listeners,added,put,shell,base,a,b,get skipped(){return skipped;}};
}

test('source figures precache without allowing image quota failure to discard core study',async()=>{
 const w=worker();let done;w.listeners.install({waitUntil:promise=>{done=promise;}});await done;
 assert.equal(w.skipped,true);assert.ok(w.shell.includes('./compatibility.js'));assert.ok(w.shell.includes('./data/figures.json'));
 assert.deepEqual(w.put,[w.base+w.a]);assert.deepEqual(w.added,[w.base+w.b]);
 assert.ok(![...w.shell,...w.added,...w.put].some(url=>url.includes('token=')||url.includes('private.example')));
});

test('Auth and audio requests bypass the study cache even when hosted on the app origin',()=>{
 const w=worker();
 for(const url of [w.base+'auth/v1/user',w.base+'rest/v1/rpc/labwise_read_progress',w.base+'api/audio?text=private','https://project.supabase.co/auth/v1/settings']){
  let intercepted=false;w.listeners.fetch({request:{url,method:'GET',headers:{get:()=>null}},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false,url);
 }
 let intercepted=false;w.listeners.fetch({request:{url:w.base+w.a,method:'GET',headers:{get:()=>null}},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,true);
});

test('offline app and PDF navigation fragments still use their static cached files',()=>{
 const w=worker();
 for(const url of [w.base+'#library',w.base+'index.html#cards',w.base+'docs/boc-1.pdf#page=42']){
  let intercepted=false;w.listeners.fetch({request:{url,method:'GET',headers:{get:()=>null}},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,true,url);
 }
});
