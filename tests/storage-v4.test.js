import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readJSON,saveJSON,loadCustomBank,storeCustomBank,deleteCustomBank} from '../storage.js';
function memoryStorage(initial={}){const values=new Map(Object.entries(initial));return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
// Minimal event-driven adapter exercises transaction completion/abort semantics.
function indexedMemory({abortWrite=false}={}){
 const values=new Map();let closed=0;
 return {values,get closed(){return closed;},open(){const request={};queueMicrotask(()=>{const db={objectStoreNames:{contains:()=>true},close(){closed++;},transaction(){const transaction={objectStore(){return {get:key=>make('get',key),put:(value,key)=>make('put',key,value),delete:key=>make('delete',key)};}};function make(kind,key,value){const req={};queueMicrotask(()=>{if(abortWrite&&kind==='put'){transaction.error=new Error('Disk full');transaction.onabort?.();return;}if(kind==='get')req.result=values.get(key);if(kind==='put')values.set(key,structuredClone(value));if(kind==='delete')values.delete(key);req.onsuccess?.();queueMicrotask(()=>transaction.oncomplete?.());});return req;}return transaction;}};request.result=db;request.onsuccess?.();});return request;}};
}
test('JSON helpers distinguish missing, corrupt and unwritable storage without clearing data',()=>{
 const storage=memoryStorage({broken:'{',existing:'{"old":1}'});assert.equal(readJSON('missing',42,storage).value,42);assert.equal(readJSON('broken',42,storage).ok,false);assert.equal(storage.getItem('broken'),'{');assert.equal(saveJSON('existing',{new:2},storage).ok,true);assert.deepEqual(readJSON('existing',null,storage).value,{new:2});const quota={setItem(){throw Error('Quota exceeded');}};const result=saveJSON('large',{keep:true},quota);assert.equal(result.ok,false);assert.match(result.error.message,/Quota/);assert.deepEqual(result.value,{keep:true});assert.equal(readJSON('x',[],null).ok,false);
});
test('legacy bank fallback works without IndexedDB and preserves values until explicit deletion',async()=>{
 const localStorage=memoryStorage({'labwise-bank':'[{"id":"legacy"}]'}),options={indexedDB:null,localStorage};assert.deepEqual((await loadCustomBank(options)).value,[{id:'legacy'}]);assert.equal((await storeCustomBank([{id:'new'}],options)).ok,true);assert.equal((await loadCustomBank(options)).value[0].id,'new');assert.equal((await deleteCustomBank(options)).ok,true);assert.equal(localStorage.getItem('labwise-bank'),null);
});
test('large bank uses IndexedDB, takes precedence over legacy, and deletes both only explicitly',async()=>{
 const indexedDB=indexedMemory(),localStorage=memoryStorage({'labwise-bank':'[{"id":"legacy"}]'}),options={indexedDB,localStorage};assert.equal((await loadCustomBank(options)).value[0].id,'legacy');const large=[{id:'large',explanation:'x'.repeat(6*1024*1024)}];const saved=await storeCustomBank(large,options);assert.equal(saved.ok,true);assert.equal(saved.backend,'indexedDB');assert.equal(localStorage.getItem('labwise-bank'),'[{"id":"legacy"}]');assert.equal((await loadCustomBank(options)).value[0].explanation.length,6*1024*1024);assert.equal((await deleteCustomBank(options)).ok,true);assert.equal(indexedDB.values.size,0);assert.equal(localStorage.getItem('labwise-bank'),null);assert.ok(indexedDB.closed>=4);
});
test('aborted IndexedDB write reports failure and leaves prior bank and legacy data intact',async()=>{
 const indexedDB=indexedMemory({abortWrite:true});indexedDB.values.set('custom',[{id:'old'}]);const localStorage=memoryStorage({'labwise-bank':'[{"id":"legacy"}]'});const result=await storeCustomBank([{id:'replacement'}],{indexedDB,localStorage});assert.equal(result.ok,false);assert.match(result.error.message,/Disk full/);assert.equal(indexedDB.values.get('custom')[0].id,'old');assert.equal(localStorage.getItem('labwise-bank'),'[{"id":"legacy"}]');assert.equal(indexedDB.closed,1);
});
test('IndexedDB read failure exposes warning alongside recoverable legacy bank',async()=>{const indexedDB={open(){throw Error('Access denied');}},localStorage=memoryStorage({'labwise-bank':'[{"id":"legacy"}]'});const result=await loadCustomBank({indexedDB,localStorage});assert.equal(result.ok,false);assert.equal(result.value[0].id,'legacy');assert.match(result.error.message,/Access denied/);});

test('a stalled database open times out, keeps the legacy bank, and closes a late connection',async()=>{
 let pending,closed=0;const indexedDB={open(){return pending={};}},localStorage=memoryStorage({'labwise-bank':'[{"id":"legacy"}]'});
 const result=await Promise.race([loadCustomBank({indexedDB,localStorage,timeoutMs:20}),new Promise(resolve=>setTimeout(()=>resolve({hung:true}),250))]);
 assert.equal(result.hung,undefined);assert.equal(result.ok,false);assert.equal(result.value[0].id,'legacy');assert.match(result.error.message,/too long/);
 pending.result={close(){closed++;},transaction(){throw Error('A timed-out connection must not start a transaction.');}};pending.onsuccess();assert.equal(closed,1);
 assert.equal(localStorage.getItem('labwise-bank'),'[{"id":"legacy"}]');
});

test('stalled transactions abort and cannot turn a failed save/delete into a successful result',async()=>{
 for(const kind of ['put','delete']){
  let aborted=0,closed=0,transaction;const localStorage=memoryStorage({'labwise-bank':'[{"id":"legacy"}]'});
  const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){closed++;},transaction(){transaction={abort(){aborted++;transaction.onabort?.();},objectStore(){return{put(){return{};},delete(){return{};}};}};return transaction;}};request.onsuccess();});return request;}};
  const options={indexedDB,localStorage,timeoutMs:20};
  const result=await(kind==='put'?storeCustomBank([{id:'new'}],options):deleteCustomBank(options));
  assert.equal(result.ok,false);assert.match(result.error.message,/too long/);assert.equal(aborted,1);assert.equal(closed,1);
  transaction.oncomplete();assert.equal(result.ok,false);assert.equal(localStorage.getItem('labwise-bank'),'[{"id":"legacy"}]');
 }
});
