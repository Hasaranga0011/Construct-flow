/* Native scanner component state/handler regression, with mocked OS modules.
 * This does not exercise a physical camera or an installed native runtime. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
function scanner(permission,onScan){
 const slots=[];let cursor=0,closed=false;
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
  useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
 const filename=path.resolve(__dirname,'../src/components/worker/QRScanner.tsx');
 const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
 const component=new Module(filename,module);
 component.require=name=>{
  if(name==='react')return {__esModule:true,default:React,...React};
  if(name==='react-native')return {...Object.fromEntries(['View','Text','Pressable','ActivityIndicator','ScrollView','TextInput'].map(n=>[n,n])),Platform:{OS:'android'},StyleSheet:{absoluteFillObject:{}},useWindowDimensions:()=>({width:320,height:640})};
  if(name==='expo-camera')return {CameraView:'CameraView',useCameraPermissions:()=>[permission,async()=>permission]};
  if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:24,bottom:16})};
  if(name==='@expo/vector-icons/Ionicons')return 'Ionicons';
  if(name==='@/components/common/ContentScrollView')return {ContentScrollView:'ScrollView'};
  throw Error('Unexpected native test dependency: '+name);
 };
 component._compile(compiled,filename);
 return {render:()=>{cursor=0;return component.exports.QRScanner({onScan,onClose:()=>{closed=true;}});},closed:()=>closed};
}
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...(tree.props?.children||[]).flat(Infinity).flatMap(nodes)];}
function text(tree){return typeof tree==='string'?tree:(tree?.props?.children||[]).flat(Infinity).map(text).join('');}
function button(tree,label){return nodes(tree).find(n=>n.type==='Pressable'&&text(n).toLowerCase()===label.toLowerCase());}
(async()=>{
 const calls=[];let finish;
 const denied=scanner({granted:false},code=>{calls.push(code);return new Promise(resolve=>{finish=resolve;});});
 let tree=denied.render();assert(text(tree).includes('Camera Permission Required'));
 button(tree,'Enter Code Manually').props.onPress();tree=denied.render();
 assert.equal(nodes(tree).filter(n=>n.type==='CameraView').length,0);
 let input=nodes(tree).find(n=>n.type==='TextInput');assert(input,'Manual input must be reachable when permission is denied');
 input.props.onChangeText('  worker-identity  ');tree=denied.render();
 const submit=button(tree,'Submit worker code').props.onPress;
 const first=submit();await submit();assert.deepEqual(calls,['worker-identity']);finish();await first;
 assert(text(denied.render()).includes('Camera Permission Required'));
 console.log('PASS denied camera allows manual entry; trimmed worker identity submits once under concurrent taps');
 const failed=scanner({granted:true},async()=>{throw Error('Worker is not assigned to this site');});
 tree=failed.render();nodes(tree).find(n=>n.type==='CameraView').props.onMountError({message:'Camera hardware unavailable'});
 tree=failed.render();button(tree,'Enter code manually').props.onPress();tree=failed.render();
 nodes(tree).find(n=>n.type==='TextInput').props.onChangeText('worker-identity');
 await button(failed.render(),'Submit worker code').props.onPress();tree=failed.render();
 assert(text(tree).includes('Worker is not assigned to this site'));
 assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'worker-identity');
 button(tree,'Close scanner').props.onPress();assert(failed.closed());
 console.log('PASS camera failure allows manual retry; assignment errors remain visible and scanner closes');
})().catch(error=>{console.error(error);process.exitCode=1;});
