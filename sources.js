export function sourceDocument(catalog,id){return catalog.documents.find(d=>d.id===id)||null;}
export function questionDocument(catalog,q,answer=false){
 const id=answer?(q.answerDocumentId||q.documentId):q.documentId;
 if(id)return sourceDocument(catalog,id);
 if(q.id?.startsWith('book-'))return sourceDocument(catalog,'textbook');
 return null;
}
export function sourceURL(catalog,q,answer=false){const doc=questionDocument(catalog,q,answer),page=answer?(q.answerPage||q.page):q.page;return doc&&Number.isInteger(page)&&page>=1&&page<=doc.pages?`./${doc.path}#page=${page}`:null;}
export function readingPage(catalog,id,page){const d=sourceDocument(catalog,id);if(!d)throw Error('Unknown document.');return Math.max(1,Math.min(d.pages,Math.trunc(Number(page))||1));}
export function validSession(value,bank){
 if(!value||!['practice','exam','cards'].includes(value.kind)||!Array.isArray(value.ids)||!value.ids.length||new Set(value.ids).size!==value.ids.length||!Number.isInteger(value.index)||value.index<0||value.index>value.ids.length||!Array.isArray(value.results))return null;
 const byId=new Map(bank.map(q=>[q.id,q]));if(value.ids.some(id=>!byId.has(id)))return null;
 if(value.kind==='cards')return {...value,flipped:!!value.flipped};
 if(value.results.length!==value.index+(value.selected===null?0:1)||value.results.some((r,i)=>!r||r.id!==value.ids[i]||!Number.isInteger(r.answer)||r.answer<0||r.answer>=byId.get(r.id).options.length||r.correct!==(r.answer===byId.get(r.id).answer)))return null;
 if(value.selected!==null&&value.selected!==value.results.at(-1)?.answer)return null;
 return value;
}
