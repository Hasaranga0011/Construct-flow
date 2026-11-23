const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/dropdownLayout.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}};vm.runInNewContext(compiled,context);
const {dropdownLayout}=context.exports;
let checks=0;
for(const viewport of [{width:320,height:568},{width:390,height:300,top:90},{width:844,height:260},{width:240,height:320},{width:1440,height:900}]){
 for(const anchor of [{x:16,y:24,width:288,height:48},{x:300,y:530,width:400,height:48},{x:0,y:-90,width:80,height:48},{x:12,y:900,width:220,height:48}]){
  for(const count of [1,5,30]){
   const menu=dropdownLayout(anchor,viewport,count,count>6);
   assert(menu.left>=12);
   assert(menu.left+menu.width<=viewport.width-12);
   assert(menu.top>=(viewport.top||0)+12);
   assert(menu.top+menu.maxHeight<=(viewport.top||0)+viewport.height-12);
   assert(menu.maxHeight<=280&&menu.maxHeight>=0);
   checks++;
  }
 }
}
console.log(`PASS ${checks} dropdown layouts: narrow screens, landscape, keyboard viewport offsets and off-screen anchors`);
const hookSource=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/hooks/useVisibleViewport.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
for(const platform of ['web','ios','android']){
 let state=null,effect;
 const dimensions={width:390,height:844};
 const listeners=new Map();
 const visualViewport={width:390,height:300,offsetTop:80,offsetLeft:0,addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
 const hookContext={exports:{},window:{visualViewport},require:name=>name==='react'?{
  useState:()=>[state,value=>{state=value;}],useEffect:fn=>{effect=fn;},
 }:{Platform:{OS:platform},useWindowDimensions:()=>dimensions}};
 vm.runInNewContext(hookSource,hookContext);
 const render=()=>hookContext.exports.useVisibleViewport();
 assert.equal(render().height,844);
 const cleanup=effect();
 if(platform==='web'){
  assert.equal(render().height,300);assert.equal(render().top,80);
  visualViewport.height=250;listeners.get('resize')();assert.equal(render().height,250);
  visualViewport.offsetTop=120;listeners.get('scroll')();assert.equal(render().top,120);
  cleanup();assert.equal(listeners.size,0);
 }else{
  assert.equal(render().top,0);assert.equal(listeners.size,0);
  dimensions.height=300;assert.equal(render().height,300);
 }
}
console.log('PASS web keyboard resize/scroll subscriptions and cleanup; native window-resize fallback');
