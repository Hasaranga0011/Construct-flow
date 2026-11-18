/* Real pinned Leaflet scripts; all map tiles are intercepted, never downloaded. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const html = require('./build-map-frame.cjs')();
const parentOrigin = 'http://localhost:8082';
const frameOrigin = 'http://127.0.0.1:8000';
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim());
const csp = `default-src 'none'; script-src https://unpkg.com ${inline.map(s=>"'sha256-"+crypto.createHash('sha256').update(s).digest('base64')+"'").join(' ')}; style-src https://unpkg.com 'unsafe-inline'; img-src data: https://tile.openstreetmap.org https://server.arcgisonline.com; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${parentOrigin}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg==','base64');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const failedTiles of [false,true]){
   const page=await browser.newPage({viewport:{width:390,height:600}});let requests=[];const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='unpkg.com')return route.continue();
    if(['tile.openstreetmap.org','server.arcgisonline.com'].includes(url.hostname)){
     requests.push({host:url.hostname,referer:route.request().headers().referer});
     return route.fulfill({status:failedTiles?403:200,contentType:'image/png',body:failedTiles?'Blocked fixture':png});
    }
    if(url.origin===frameOrigin)return route.fulfill({contentType:'text/html',body:html,headers:{'Referrer-Policy':'origin','Content-Security-Policy':csp}});
    if(url.origin===parentOrigin)return route.fulfill({contentType:'text/html',body:`<iframe id="map" title="Map" src="${frameOrigin}/api/maps/frame" sandbox="allow-scripts allow-same-origin" style="width:340px;height:300px"></iframe><script>window.messages=[];window.addEventListener('message',e=>{if(e.source!==document.getElementById('map').contentWindow||e.origin!=='${frameOrigin}')return;messages.push(JSON.parse(e.data));if(messages.at(-1).type==='mapFrameReady')e.source.postMessage(JSON.stringify({type:'initialize',config:{center:{lat:6.9271,lng:79.8612},zoom:13,interactive:true,markers:[]}}),'${frameOrigin}');});</script>`});
    return route.abort();
   });
   await page.goto(parentOrigin+'/admin/dashboard#private-fixture-token');
   await page.waitForFunction(()=>window.messages.some(m=>m.type==='mapLoaded'),null,{timeout:45000});
   const frame=page.frame({url:frameOrigin+'/api/maps/frame'});assert(frame);
   await frame.waitForFunction(()=>document.querySelectorAll('img.leaflet-tile').length>0);
   await page.waitForTimeout(500);
   assert(requests.length>0);assert(requests.every(r=>r.referer===frameOrigin+'/'),'Tile referrers identify only the API frame origin');
   assert(await frame.evaluate(()=>{try{void parent.localStorage;return false;}catch{return true;}}),'Frame cannot read frontend session storage');
   await frame.locator('#map').click({position:{x:120,y:100}});
   await page.waitForFunction(()=>window.messages.some(m=>m.type==='locationSelect'));
   const pin=await page.evaluate(()=>window.messages.find(m=>m.type==='locationSelect'));assert(Number.isFinite(pin.lat)&&Number.isFinite(pin.lng));
   if(failedTiles){assert.equal(await frame.locator('#tile-error').isVisible(),true);console.log('PASS blocked tiles show a readable notice and manual map pinning still works');}
   else {assert.equal(await frame.locator('#tile-error').isVisible(),false);assert(await frame.locator('img.leaflet-tile').first().evaluate(img=>img.complete&&img.naturalWidth>0));console.log('PASS isolated map sends an origin-only Referer, loads tiles, selects a location and cannot access frontend storage');}
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
