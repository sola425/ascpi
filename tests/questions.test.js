import {test} from 'node:test';
import assert from 'node:assert/strict';
import {samples,validateBank} from '../questions.js';
test('all teaching examples are valid and contain explanations',()=>{assert.equal(validateBank(samples).length,12);for(const q of samples){assert.ok(q.explanation.length>50);assert.ok(q.whyOthers);assert.match(q.source,/not from the PDF/);}});
test('rejects invalid answers and duplicate identifiers',()=>{assert.throws(()=>validateBank([{...samples[0],answer:4}]),/answer index/);assert.throws(()=>validateBank([samples[0],samples[0]]),/Duplicate/)});
test('rejects malformed question banks without discarding current data',()=>{for(const input of [[],{},[null],[{...samples[0],options:['one']}],[{...samples[0],explanation:''}]])assert.throws(()=>validateBank(input));});
test('accepts an exported bank and strips unexpected fields',()=>{const result=validateBank({questions:[{...samples[0],unexpected:'ignored'}]});assert.deepEqual(result,[samples[0]]);});
test('rejects special object property names as IDs',()=>{for(const id of ['__proto__','constructor','prototype'])assert.throws(()=>validateBank([{...samples[0],id}]),/reserved ID/)});
