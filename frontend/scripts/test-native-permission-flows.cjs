/* Permission/state branches only. Mocked modules do not prove physical GPS/push delivery. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
function hooks(){const slots=[];let cursor=0;const api={
 createElement:(type,props,...children)=>({type,props:{...props,children}}),
 useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
 useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
 useEffect:()=>{},useCallback:fn=>fn,useMemo:fn=>fn(),useImperativeHandle:()=>{},forwardRef:fn=>props=>fn(props,null)};
 return{api,render:fn=>{cursor=0;return fn();}};
}
function load(relative,mocks){const filename=path.resolve(__dirname,'../src',relative);const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;const mod=new Module(filename,module);mod.require=name=>{if(name in mocks)return mocks[name];throw Error('Unexpected permission-test dependency '+name);};mod._compile(compiled,filename);return mod.exports;}
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...(tree.props?.children||[]).flat(Infinity).flatMap(nodes)];}
(async()=>{
 for(const mode of ['denied','granted','failed']){
  const state=hooks(),alerts=[],selected=[];let positions=0;
  const Location={Accuracy:{Balanced:'balanced'},requestForegroundPermissionsAsync:async()=>({status:mode==='denied'?'denied':'granted'}),getCurrentPositionAsync:async()=>{positions++;if(mode==='failed')throw Error('GPS unavailable');return{coords:{latitude:7.12345678,longitude:81.12345678}};}};
  const map=load('components/common/InteractiveMap.tsx',{'react':{__esModule:true,default:state.api,...state.api},'react-native':{...Object.fromEntries(['View','Text','Pressable','ActivityIndicator'].map(n=>[n,n])),Alert:{alert:(...args)=>alerts.push(args)},StyleSheet:{create:value=>value}},'react-native-webview':{WebView:'WebView'},'@expo/vector-icons/Ionicons':'Icon','expo-location':Location,'./mapHtml':{generateLeafletHtml:()=>'<html></html>'},'@/lib/apiUrl':{getApiUrl:()=> 'https://api.fixture.invalid/api'},'@/hooks/useMapProvider':{useMapConfiguration:()=>({provider:mode==='granted'?'google':'openstreetmap'})}});
  let tree=state.render(()=>map.InteractiveMap({onLocationSelect:value=>selected.push(value)}));
  if(mode==='granted')assert.equal(nodes(tree).find(node=>node.type==='WebView').props.source.uri,'https://api.fixture.invalid/api/maps/frame?provider=google');
  nodes(tree).find(node=>node.type==='WebView').props.onMessage({nativeEvent:{data:JSON.stringify({type:'mapLoaded'})}});
  tree=state.render(()=>map.InteractiveMap({onLocationSelect:value=>selected.push(value)}));
  await nodes(tree).find(node=>node.props.accessibilityLabel==='Use current GPS location').props.onPress();
  if(mode==='denied'){assert.equal(positions,0);assert.equal(selected.length,0);assert.equal(alerts[0][0],'Location Access');}
  if(mode==='granted')assert.deepEqual(selected,[{lat:7.123457,lng:81.123457}]);
  if(mode==='failed'){assert.equal(selected.length,0);assert.equal(alerts[0][0],'GPS Location');}
  console.log('PASS native GPS permission branch:',mode);
 }
 for(const mode of ['web','expo-go','denied','granted','simulator']){
  const state=hooks(),updates=[];let notificationLoads=0,tokenCalls=0;
  const Notifications={setNotificationHandler:()=>{},setNotificationChannelAsync:async()=>{},AndroidImportance:{MAX:5},getPermissionsAsync:async()=>({status:mode==='denied'?'denied':'granted'}),requestPermissionsAsync:async()=>({status:'denied'}),getExpoPushTokenAsync:async()=>{tokenCalls++;return{data:'ExponentPushToken[QA]'};}};
  const constants={executionEnvironment:mode==='expo-go'?'store':'standalone',expoConfig:{extra:{eas:{projectId:'qa-project'}}}};
  const mocks={'react':{__esModule:true,default:state.api,...state.api},'react-native':{Platform:{OS:mode==='web'?'web':'android'}},'expo-device':{isDevice:mode!=='simulator'},'expo-constants':{__esModule:true,default:constants,ExecutionEnvironment:{StoreClient:'store'}},'../lib/supabase':{supabase:{from:()=>({update:payload=>({eq:async(key,value)=>{updates.push({payload,key,value});return{error:null};}})})}}};
  Object.defineProperty(mocks,'expo-notifications',{get:()=>{notificationLoads++;return Notifications;}});
  const hook=load('hooks/usePushNotifications.ts',mocks);
  const result=state.render(()=>hook.usePushNotifications('qa-user'));
  const token=await result.requestToken();
  if(mode==='granted'){assert.equal(token,'ExponentPushToken[QA]');assert.equal(updates.length,1);assert.equal(updates[0].value,'qa-user');}
  else{assert.equal(token,null);assert.equal(updates.length,0);assert.equal(tokenCalls,0);}
  if(mode==='web'||mode==='expo-go')assert.equal(notificationLoads,0);
  console.log('PASS native push registration branch:',mode);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
