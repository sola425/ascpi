import {hasCompleteTeaching} from './teaching.js';
export const MINUTE=60000, DAY=86400000;
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'});
export function dayKey(at=Date.now()){return dayFormat.format(new Date(at));}
export function schedule(previous={},rating='good',now=Date.now()){
 if(!['again','hard','good','easy'].includes(rating))throw Error('Unknown review rating.');
 const old=Math.max(0,Math.min(4,Number(previous.stage)||0));
 const stage=rating==='again'?0:rating==='hard'?old:Math.min(4,old+(rating==='easy'?2:1));
 const delay=rating==='again'?10*MINUTE:rating==='hard'?DAY:[DAY,DAY,3*DAY,7*DAY,14*DAY][stage];
 return {...previous,stage,due:now+delay,reviewedAt:now,reviews:(previous.reviews||0)+1};
}
export function shuffled(items,random=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result}
export function selectQueue(bank,records,{mode='all',topic='',query='',limit=0,randomize=false,now=Date.now()}={}){
 let result=bank.filter(q=>(!topic||q.topic===topic)&&(!query||`${q.question} ${q.context||''} ${q.source||''} ${q.explanation} ${q.simple||''}`.toLowerCase().includes(query.toLowerCase())));
 if(mode==='due')result=result.filter(q=>records[q.id]?.due<=now).sort((a,b)=>records[a.id].due-records[b.id].due);
 if(mode==='mistakes')result=result.filter(q=>records[q.id]?.correct===false);
 if(mode==='simple')result=result.filter(q=>hasCompleteTeaching(q)||q.explanationKind==='example');
 if(mode==='new')result=result.filter(q=>!records[q.id]);
 if(randomize)result=shuffled(result);
 return limit?result.slice(0,limit):result;
}
export function streak(log,now=Date.now()){
 const days=new Set(log.map(e=>dayKey(e.at)));let cursor=now,n=0;
 if(!days.has(dayKey(cursor)))cursor-=DAY;
 while(days.has(dayKey(cursor))){n++;cursor-=DAY}return n;
}
export function validateBackup(data){
 if(data?.version!==1||!data.records||typeof data.records!=='object'||Array.isArray(data.records)||!Array.isArray(data.saved)||!Array.isArray(data.log))throw Error('This is not a Labwise progress backup.');
 const records=Object.create(null);
 for(const[id,r]of Object.entries(data.records)){
  if(!r||typeof r!=='object'||!Number.isFinite(r.due)||r.due<0||!Number.isInteger(r.stage)||r.stage<0||r.stage>4||!Number.isFinite(r.reviews)||r.reviews<0||!(r.correct===undefined||typeof r.correct==='boolean'))throw Error('Backup contains invalid review data.');
  records[id]={due:r.due,stage:r.stage,reviews:r.reviews,...(r.correct===undefined?{}:{correct:r.correct}),at:Number.isFinite(r.at)?r.at:0,reviewedAt:Number.isFinite(r.reviewedAt)?r.reviewedAt:0};
 }
 if(data.saved.some(id=>typeof id!=='string')||data.log.some(e=>!e||typeof e.id!=='string'||!Number.isFinite(e.at)||!['answer','review'].includes(e.kind)||typeof e.correct!=='boolean'))throw Error('Backup contains invalid study history.');
 return {records,saved:[...new Set(data.saved)],log:data.log.slice(-10000).map(e=>({id:e.id,at:e.at,correct:e.correct,kind:e.kind})),goal:[5,10,20,30].includes(data.goal)?data.goal:10};
}
