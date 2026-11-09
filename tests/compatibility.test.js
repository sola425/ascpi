import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../compatibility.js', import.meta.url), 'utf8');
const legacy = () => {
  const context = vm.createContext({});
  vm.runInContext('Object.hasOwn=undefined; Array.prototype.at=undefined;', context);
  vm.runInContext(source, context);
  return code => vm.runInContext(code, context);
};

test('legacy WebViews gain safe own-property checks without prototype inheritance', () => {
  const run = legacy();
  assert.equal(run('Object.hasOwn({saved: true}, "saved")'), true);
  assert.equal(run('Object.hasOwn(Object.create({saved:true}), "saved")'), false);
  assert.equal(run('Object.hasOwn({hasOwnProperty:null}, "hasOwnProperty")'), true);
  assert.equal(run('Object.hasOwn("abc", 1)'), true);
  assert.equal(run('Object.hasOwn(Object.create(null), "constructor")'), false);
  assert.throws(() => run('Object.hasOwn(null,"saved")'), {name: 'TypeError'});
});

test('legacy .at supports negative history indices, empty arrays and generic array-likes', () => {
  const run = legacy();
  assert.equal(run('["first","last"].at(-1)'), 'last');
  assert.equal(run('["first","last"].at(-2)'), 'first');
  assert.equal(run('["first","last"].at(-3)'), undefined);
  assert.equal(run('[].at(-1)'), undefined);
  assert.equal(run('["first"].at(Infinity)'), undefined);
  assert.equal(run('["first"].at(NaN)'), 'first');
  assert.equal(run('Array.prototype.at.call({0:"value",length:1},0)'), 'value');
  assert.equal(run('Object.prototype.propertyIsEnumerable.call(Array.prototype,"at")'), false);
  assert.throws(() => run('Array.prototype.at.call(null,0)'), {name: 'TypeError'});
});

test('bootstrap preserves existing native implementations and can run twice', () => {
  const context = vm.createContext({});
  vm.runInContext('var ownBefore=Object.hasOwn; var atBefore=Array.prototype.at;', context);
  vm.runInContext(source, context); vm.runInContext(source, context);
  assert.equal(vm.runInContext('ownBefore===Object.hasOwn && atBefore===Array.prototype.at', context), true);
});

function startupBrowser({ready=false,title='Opening your study space…',modules=true}={}) {
  const handlers={},domHandlers={},elements=[];let reloads=0;
  function node(tag){
    const element={tagName:tag.toUpperCase(),children:[],attributes:{},events:{},textContent:'',setAttribute(name,value){this.attributes[name]=value;},getAttribute(name){return this.attributes[name]??null;},addEventListener(name,callback){this.events[name]=callback;},appendChild(child){this.children.push(child);},removeChild(child){this.children.splice(this.children.indexOf(child),1);},getElementsByTagName(name){return this.children.flatMap(child=>[...(child.tagName===name.toUpperCase()?[child]:[]),...child.getElementsByTagName(name)]);}};
    Object.defineProperty(element,'firstChild',{get(){return this.children[0]||null;}});
    if(tag==='script'&&modules)element.noModule=false;
    if(tag==='a')Object.defineProperty(element,'href',{set(value){const parsed=new URL(value,'https://app.example/study/index.html');this.protocol=parsed.protocol;this.host=parsed.host;this.pathname=parsed.pathname;}});
    elements.push(element);return element;
  }
  const content=node('div'),heading=node('h1'),entry=node('script');heading.textContent=title;content.appendChild(heading);entry.setAttribute('type','module');entry.setAttribute('src','app.js');entry.src='https://app.example/study/app.js';
  const root={labwiseAppReady:ready,location:{reload(){reloads++;}},addEventListener(name,callback){handlers[name]=callback;}};
  const doc={readyState:'complete',createElement:node,getElementById:id=>id==='content'?content:null,getElementsByTagName:name=>name==='script'?[entry]:[],addEventListener(name,callback){domHandlers[name]=callback;}};
  vm.runInNewContext(source,{window:root,document:doc});
  return{root,content,entry,handlers,domHandlers,elements,get reloads(){return reloads;},text(){return elements.filter(element=>content.children.includes(element)||content.children.some(section=>section.children.includes(element))).map(element=>element.textContent).join(' ');}};
}

test('a startup module syntax failure exposes fixed reload help without copying error details',()=>{
  const browser=startupBrowser();browser.handlers.error({target:browser.root,filename:'https://app.example/study/host-game.js',error:{name:'SyntaxError'},message:'PRIVATE password account-token'});
  assert.match(browser.text(),/Update Android System WebView or Chrome/);assert.doesNotMatch(browser.text(),/PRIVATE|password|account-token/);
  assert.equal(browser.content.children[0].id,'labwise-startup-help');
  const reload=browser.elements.find(element=>element.id==='labwise-startup-reload');assert.equal(typeof reload.events.click,'function');reload.events.click();assert.equal(browser.reloads,1);
});

test('healthy boot, handled initialization errors, and foreign resources are never replaced',()=>{
  for(const options of [{ready:true},{title:'Your study space could not load.'},{title:'Make room for a little discovery.'}]){
    const browser=startupBrowser(options),before=browser.content.children[0];browser.handlers.error({target:browser.root,filename:'https://app.example/study/app.js',error:{name:'SyntaxError'}});assert.equal(browser.content.children[0],before);
  }
  const browser=startupBrowser(),before=browser.content.children[0];browser.handlers.error({target:browser.root,filename:'chrome-extension://example/app.js',error:{name:'SyntaxError'}});assert.equal(browser.content.children[0],before);
});

test('browsers without module support receive help even without a script error event',()=>{
  const browser=startupBrowser({modules:false});assert.match(browser.text(),/Update Android System WebView or Chrome/);assert.equal(browser.content.children[0].id,'labwise-startup-help');
});
