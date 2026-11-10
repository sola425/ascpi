// All persistence operations report failure; callers keep their in-memory data.
const BANK_KEY='labwise-bank', DB_NAME='labwise-content', STORE='banks', ITEM='custom';
const failure=(error,backend,value=null)=>({ok:false,value,error:error instanceof Error?error:new Error(String(error)),backend});
const success=(value,backend)=>({ok:true,value,error:null,backend});
function localStore(explicit){return explicit===undefined?globalThis.localStorage:explicit;}
export function readJSON(key,fallback=null,storage){
 try{const raw=localStore(storage)?.getItem(key);if(raw===undefined)throw Error('Browser storage is unavailable.');return success(raw===null?fallback:JSON.parse(raw),'localStorage');}catch(error){return failure(error,'localStorage',fallback);}
}
export function saveJSON(key,value,storage){
 try{const target=localStore(storage);if(!target)throw Error('Browser storage is unavailable.');const serialized=JSON.stringify(value);if(serialized===undefined)throw Error('This value cannot be stored as JSON.');target.setItem(key,serialized);return success(value,'localStorage');}catch(error){return failure(error,'localStorage',value);}
}
function timeoutFor(options){return Number.isFinite(options.timeoutMs)&&options.timeoutMs>0&&options.timeoutMs<=60000?options.timeoutMs:8000;}
function database(factory,timeoutMs){
 return new Promise((resolve,reject)=>{
  let request,settled=false;
  const finish=(error,db)=>{if(settled){if(db)db.close();return;}settled=true;clearTimeout(timer);if(error)reject(error);else resolve(db);};
  const timer=setTimeout(()=>finish(Error('Question-bank storage took too long to open.')),timeoutMs);
  try{request=factory.open(DB_NAME,1);}catch(error){finish(error);return;}
  request.onupgradeneeded=()=>{
   if(settled){try{request.transaction?.abort();}catch{}return;}
   try{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);}catch(error){try{request.transaction?.abort();}catch{}finish(error);}
  };
  request.onerror=()=>finish(request.error||Error('Could not open question-bank storage.'));
  request.onblocked=()=>finish(Error('Question-bank storage is blocked by another open app.'));
  request.onsuccess=()=>finish(null,request.result);
 });
}
async function operation(factory,kind,value,timeoutMs){
 const db=await database(factory,timeoutMs);
 try{return await new Promise((resolve,reject)=>{
  let transaction,request,result=null,settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error){try{transaction?.abort();}catch{}reject(error);}else resolve(result);};
  const timer=setTimeout(()=>finish(Error('Question-bank storage took too long to finish.')),timeoutMs);
  try{transaction=db.transaction(STORE,kind==='get'?'readonly':'readwrite');const store=transaction.objectStore(STORE);request=kind==='get'?store.get(ITEM):kind==='put'?store.put(value,ITEM):store.delete(ITEM);}catch(error){finish(error);return;}
  request.onsuccess=()=>{if(!settled)result=kind==='get'?(request.result??null):value??null;};
  request.onerror=()=>finish(request.error||Error('Question-bank storage request failed.'));
  transaction.oncomplete=()=>finish();
  transaction.onabort=()=>finish(transaction.error||Error('Question-bank storage transaction was aborted.'));
  transaction.onerror=()=>finish(transaction.error||Error('Question-bank storage transaction failed.'));
 });}finally{db.close();}
}
function factoryFor(options){return Object.hasOwn(options,'indexedDB')?options.indexedDB:globalThis.indexedDB;}
function legacyFor(options){return Object.hasOwn(options,'localStorage')?options.localStorage:undefined;}
export async function loadCustomBank(options={}){
 try{const factory=factoryFor(options);if(!factory)return readJSON(BANK_KEY,null,legacyFor(options));const value=await operation(factory,'get',undefined,timeoutFor(options));if(value!==null)return success(value,'indexedDB');return readJSON(BANK_KEY,null,legacyFor(options));}catch(error){
  // Reading legacy data is safe after an IndexedDB failure, but expose the failure.
  const legacy=readJSON(BANK_KEY,null,legacyFor(options));return {...legacy,ok:false,error,backend:'indexedDB'};
 }
}
export async function storeCustomBank(bank,options={}){
 try{const factory=factoryFor(options);if(!factory)return saveJSON(BANK_KEY,bank,legacyFor(options));return success(await operation(factory,'put',bank,timeoutFor(options)),'indexedDB');}catch(error){return failure(error,'indexedDB',bank);}
}
export async function deleteCustomBank(options={}){
 let factory;
 try{
  factory=factoryFor(options);if(factory)await operation(factory,'delete',undefined,timeoutFor(options));
  const legacy=localStore(legacyFor(options));if(legacy)legacy.removeItem(BANK_KEY);else if(!factory)throw Error('Browser storage is unavailable.');
  return success(null,factory?'indexedDB':'localStorage');
 }catch(error){return failure(error,factory?'indexedDB':'localStorage');}
}
