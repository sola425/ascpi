// The book's source rationale and the separately authored teaching layer stay distinct.
export function validateTeaching(lesson, optionCount, label='Teaching note') {
 if(!lesson||typeof lesson!=='object'||Array.isArray(lesson))throw Error(`${label} must be an object.`);
 for(const key of ['questionInPlainEnglish','explanation','memory'])if(typeof lesson[key]!=='string'||!lesson[key].trim())throw Error(`${label} needs ${key}.`);
 if(!Array.isArray(lesson.optionExplanations)||lesson.optionExplanations.length!==optionCount||lesson.optionExplanations.some(s=>typeof s!=='string'||!s.trim()))throw Error(`${label} needs one explanation for every option, in order.`);
 if(!lesson.quickCheck||typeof lesson.quickCheck.question!=='string'||!lesson.quickCheck.question.trim()||typeof lesson.quickCheck.answer!=='string'||!lesson.quickCheck.answer.trim())throw Error(`${label} needs a recall question and answer.`);
 if(lesson.sourceNote!=null&&typeof lesson.sourceNote!=='string')throw Error(`${label}: sourceNote must be text.`);
 return {questionInPlainEnglish:lesson.questionInPlainEnglish,explanation:lesson.explanation,optionExplanations:[...lesson.optionExplanations],memory:lesson.memory,quickCheck:{question:lesson.quickCheck.question,answer:lesson.quickCheck.answer},...(lesson.sourceNote?{sourceNote:lesson.sourceNote}:{})};
}
export function hasCompleteTeaching(q){try{validateTeaching(q.teaching,q.options.length);return true}catch{return false}}
