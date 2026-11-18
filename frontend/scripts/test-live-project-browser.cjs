/* Real Supabase QA accounts; read-only browser checks. No fixture traffic. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const dotenv = require('dotenv');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const state = JSON.parse(fs.readFileSync(path.join(root,'.validation-db/live-ui-state.json'),'utf8'));
const config = dotenv.parse(fs.readFileSync(path.join(root,'frontend/.env')));
const base = process.env.LIVE_UI_URL || 'http://127.0.0.1:8082';
const sb = config.EXPO_PUBLIC_SUPABASE_URL;
const key = config.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const storageKey = 'sb-' + new URL(sb).hostname.split('.')[0] + '-auth-token';
const pid = state.project.id;
const routes = {
  super_admin:process.env.LIVE_UI_MAP_ONLY?['/admin/dashboard']:[`/admin/projects/${pid}`,`/admin/projects/${pid}/boq`,`/admin/payroll/${state.accounts.worker.id}`],
  pm:[`/pm/projects/${pid}`,`/pm/projects/${pid}/boq`,`/pm/projects/${pid}/commercial`,`/pm/projects/${pid}/documents`,`/pm/projects/${pid}/issues`,`/pm/projects/${pid}/milestones`,`/pm/payroll?project=${pid}`],
  site_manager:['/site-manager/materials','/site-manager/attendance','/site-manager/reports'],
  supplier:['/supplier/orders/'+state.order_id],
  client:['/client/dashboard',`/client/project/${pid}/boq`,'/client/financials','/client/documents','/client/invoices','/client/messages/'+pid],
  worker:['/worker/payroll','/worker/attendance'],
};
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const results=[];
  try {
    for(const [role,pages] of Object.entries(routes)) {
      if(process.env.LIVE_UI_MAP_ONLY&&role!=='super_admin')continue;
      if(process.env.LIVE_UI_ORDERS_ONLY&&!['super_admin','pm'].includes(role))continue;
      if(process.env.LIVE_UI_ROLES&&!process.env.LIVE_UI_ROLES.split(',').includes(role))continue;
      const account=state.accounts[role];
      const response=await fetch(sb+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
      if(!response.ok)throw new Error('QA authentication failed: '+role+' '+response.status);
      const session=await response.json();
      const context=await browser.newContext({viewport:{width:390,height:844}});
      await context.addInitScript(({key,session})=>{if(window.top===window)localStorage.setItem(key,JSON.stringify(session));},{key:storageKey,session});
      const page=await context.newPage();
      let errors=[],failed=[],blocked=[];
      let tileRequests=[];
      let directGeoapifyRequests=0;
      let injectedFrameFailure=false;
      page.on('request',request=>{if(new URL(request.url()).hostname==='api.geoapify.com')directGeoapifyRequests++;});
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',response=>{if(process.env.LIVE_UI_RECOVER_MAP&&response.status()===503&&new URL(response.url()).pathname.endsWith('/maps/frame'))return;if(response.status()>=400&& /\/rest\/v1\/|:8000\/api\//.test(response.url()))failed.push({path:new URL(response.url()).pathname,status:response.status()});});
      await page.route('**/*',async route=>{
        const request=route.request();
        const url=new URL(request.url());
        if(process.env.LIVE_UI_RECOVER_MAP&&!injectedFrameFailure&&url.pathname.endsWith('/maps/frame')){injectedFrameFailure=true;return route.fulfill({status:503,body:'Map temporarily unavailable',contentType:'text/html'});}
        if(process.env.LIVE_UI_EARLY_SEARCH&&url.hostname==='unpkg.com'&&url.pathname.endsWith('/leaflet.js'))await new Promise(resolve=>setTimeout(resolve,15000));
        if(process.env.LIVE_UI_GOOGLE_MAP&&url.pathname.endsWith('/maps/config'))return route.fulfill({json:{provider:'google'},headers:{'access-control-allow-origin':new URL(base).origin}});
        if(process.env.LIVE_UI_GOOGLE_MAP&&url.pathname.endsWith('/maps/frame')&&url.searchParams.get('provider')==='google'){
          const fixture=JSON.parse(fs.readFileSync(path.join(root,'.validation-ui/current/google-map-fixture.json'),'utf8'));
          return route.fulfill({body:fixture.html,headers:fixture.headers});
        }
        if(process.env.LIVE_UI_GOOGLE_MAP&&url.hostname==='maps.googleapis.com'&&url.pathname==='/maps/api/js')return route.fulfill({body:require('./google-maps-fixture.cjs'),contentType:'application/javascript'});
        if(['tile.openstreetmap.org','server.arcgisonline.com'].includes(url.hostname)){
          tileRequests.push({referer:request.headers().referer});
          return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg==','base64')});
        }
        if(process.env.LIVE_UI_MAP_ONLY&&!process.env.LIVE_UI_GEOAPIFY_REAL&&url.pathname.endsWith('/projects/reverse-geocode'))return route.fulfill({json:{display_name:'QA selected map address'},headers:{'access-control-allow-origin':new URL(base).origin,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,OPTIONS'}});
        if(process.env.LIVE_UI_MAP_SEARCH&&/\/projects\/(geocode|location-suggestions)$/.test(url.pathname))return route.fulfill({json:url.searchParams.get('q')==='No listed place'?[]:[{lat:7.2,lon:79.8,display_name:'Negombo, Sri Lanka',match_type:'partial',source:'QA fixture'},{lat:7.21,lon:79.81,display_name:'QA Negombo Office, Negombo, Sri Lanka',match_type:'full',source:'QA fixture'}],headers:{'access-control-allow-origin':new URL(base).origin,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,OPTIONS'}});
        if(!['GET','HEAD','OPTIONS'].includes(request.method())&&!request.url().includes('/auth/v1/')){
          blocked.push(new URL(request.url()).pathname);return route.abort();
        }
        return route.continue();
      });
      const dashboardPortal = {super_admin:'admin',pm:'pm',site_manager:'site-manager',supplier:'supplier',client:'client',worker:'worker'};
      const selectedPages=process.env.LIVE_UI_NOTIFICATIONS_ONLY?[`/${dashboardPortal[role]}/notifications`]:process.env.LIVE_UI_ORDERS_ONLY?[`/${dashboardPortal[role]}/materials/orders?project_id=${pid}`]:process.env.LIVE_UI_DASHBOARDS_ONLY?[`/${dashboardPortal[role]}/dashboard`]:pages;
      for(const route of selectedPages){
        if(process.env.LIVE_UI_BOQ_ONLY&&!route.endsWith('/boq'))continue;
        if(process.env.LIVE_UI_ROUTE&&route!==process.env.LIVE_UI_ROUTE)continue;
        errors=[];failed=[];blocked=[];
        await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:120000});
        await page.getByLabel('Open notifications',{exact:true}).first().waitFor({timeout:45000});
        if(route.endsWith('/boq'))await page.getByText(/^BOQ baseline:/).first().waitFor({timeout:45000});
        await page.waitForTimeout(2200);
        const portalTitles = { super_admin: 'Admin', pm: 'Project Manager', site_manager: 'Site Manager', supplier: 'Supplier', client: 'Client', worker: 'Worker' };
        assert((await page.title()).endsWith(` | ${portalTitles[role]} | ConstructAi`), `Missing portal page title: ${route}`);
        if (route.endsWith('/boq')) assert.equal(await page.title(), `Project BOQ | ${portalTitles[role]} | ConstructAi`);
        if(process.env.LIVE_UI_NOTIFICATIONS_ONLY){
          await page.getByText('All Notifications',{exact:true}).waitFor();
          assert.equal(await page.getByText('Unmatched Route',{exact:true}).count(),0);
          for(const width of [320,390,768,1440]){
            await page.setViewportSize({width,height:1000});
            await page.waitForTimeout(300);
            const search=page.getByPlaceholder('Search notifications...');
            await search.fill('QA notification search');
            const bounds=await search.boundingBox();
            assert(bounds&&bounds.x>=-1&&bounds.x+bounds.width<=width+1,`Notification search clips at ${width}`);
            await page.getByLabel('Toggle unread notifications').click();
            await search.fill('');
          }
        }
        if(process.env.LIVE_UI_ORDERS_ONLY){
          await page.getByLabel('Search purchase orders',{exact:true}).fill('QA (supplier), "quote"');
          await page.getByText('No purchase orders found.',{exact:true}).waitFor();
          await page.getByRole('button',{name:'Clear order search',exact:true}).click();
          await page.waitForTimeout(1500);
          assert.equal(await page.getByText('Unable to load purchase orders.',{exact:true}).count(),0);
        }
        if(process.env.LIVE_UI_DASHBOARDS_ONLY){
          for(const width of [320,768,1440]){
            await page.setViewportSize({width,height:1000});
            await page.waitForTimeout(700);
            const intro=page.getByLabel(/ overview$/).first();
            await intro.waitFor();
            const bounds=await intro.boundingBox();
            assert(bounds&&bounds.x>=-1&&bounds.x+bounds.width<=width+1,`Dashboard introduction clips at ${width}: ${role}`);
            assert(bounds.height<230,`Dashboard introduction wastes space at ${width}: ${role}`);
            const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
            assert(!overflow,`Dashboard overflows at ${width}: ${role}`);
            await page.screenshot({path:path.join(root,`.validation-ui/current/dashboard-${role}-${width}.png`)});
          }
        }
        if(process.env.LIVE_UI_MAP_ONLY){
          for(const width of process.env.LIVE_UI_GEOAPIFY_REAL||process.env.LIVE_UI_MISSING_PLACES||process.env.LIVE_UI_TYPO_SEARCH||process.env.LIVE_UI_EARLY_SEARCH||process.env.LIVE_UI_RECOVER_MAP?[390]:[320,390,1440]){
            await page.setViewportSize({width,height:1000});tileRequests=[];
            const navigation=page.waitForEvent('framenavigated',{predicate:frame=>frame.url().includes('/api/maps/frame')&&(!process.env.LIVE_UI_GOOGLE_MAP||frame.url().includes('provider=google')),timeout:15000}).catch(()=>null);
            await page.getByText('+ New Project',{exact:true}).click();await page.getByText('Create New Project',{exact:true}).waitFor();
            const frame=await navigation;
            const mapFrame=frame||page.frames().find(frame=>frame.url().includes('/api/maps/frame'));assert(mapFrame);
            if(process.env.LIVE_UI_RECOVER_MAP){
              const search=page.getByRole('textbox',{name:'Search site location',exact:true});
              await search.fill('7.210123, 79.810456');
              await page.getByRole('button',{name:'Search site location',exact:true}).click();
              await page.getByRole('button',{name:'Reload map',exact:true}).click();
              const recovered=page.frames().find(frame=>frame.url().includes('/api/maps/frame'));
              await page.waitForTimeout(500);
              const readyFrame=page.frames().find(frame=>frame.url().includes('/api/maps/frame'))||recovered;
              assert(readyFrame);
              await readyFrame.waitForFunction(()=>typeof map!=='undefined'&&currentMarker&&map.getZoom()===18&&Math.abs(currentMarker.getLatLng().lat-7.210123)<.000001,null,{timeout:45000,polling:100});
              assert.equal(await page.locator('input[placeholder="Exact address will appear here"]').inputValue(),'Lat: 7.210123, Lng: 79.810456');
              await page.getByText('Cancel',{exact:true}).last().click();
              console.log('PASS failed map reload recovers the latest selected coordinate pin and zoom without refreshing the app');
              continue;
            }
            if(process.env.LIVE_UI_EARLY_SEARCH){
              const results=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/projects/location-suggestions')&&new URL(response.url()).searchParams.get('q')==='Negombo');
              await page.getByRole('textbox',{name:'Search site location',exact:true}).fill('Negombo');
              const rows=await (await results).json();
              const city=rows.find(row=>row.result_type==='city');assert(city);
              await page.getByRole('button',{name:`Select location: ${city.display_name}`,exact:true}).click();
              await page.getByText(/This result covers an area or street/).waitFor();
              await mapFrame.waitForFunction(()=>typeof map!=='undefined'&&!!map,null,{timeout:45000,polling:100});
              await mapFrame.waitForFunction(({lat,lon})=>map.getZoom()===13&&Math.abs(map.getCenter().lat-lat)<.001&&Math.abs(map.getCenter().lng-lon)<.001,{lat:city.lat,lon:city.lon},{timeout:5000,polling:100});
              assert.equal(await mapFrame.evaluate(()=>currentMarker===null),true);
              await page.getByText('Cancel',{exact:true}).last().click();
              console.log('PASS selecting an area before the delayed map loads preserves the requested center and zoom');
              continue;
            }
            await page.locator('iframe[title="ConstructFlow Interactive Map"]').scrollIntoViewIfNeeded();
            if(process.env.LIVE_UI_GOOGLE_MAP){
              await mapFrame.getByRole('textbox',{name:'Search Google Maps places',exact:true}).waitFor({timeout:30000});
              await mapFrame.getByRole('textbox',{name:'Search Google Maps places',exact:true}).fill('QA Construction');
              await mapFrame.getByRole('button',{name:'QA Construction Office, Negombo',exact:true}).click();
              await page.waitForFunction(()=>document.querySelector('input[placeholder="Exact address will appear here"]')?.value==='QA Construction Office, 408 QA Road, Negombo, Sri Lanka');
              const state=await mapFrame.evaluate(()=>window.__googleState);
              assert.deepEqual(state.options,{includedRegionCodes:['lk']});
              assert.deepEqual(state.fields,['location','formattedAddress','displayName']);
              assert.deepEqual(state.pin,{lat:7.21,lng:79.81});
              assert.equal(await mapFrame.evaluate(()=>{try{window.parent.localStorage.getItem('anything');return false;}catch{return true;}}),true);
              await mapFrame.locator('#map').click({position:{x:100,y:100}});
              await page.waitForFunction(()=>document.querySelector('input[placeholder="Exact address will appear here"]')?.value==='QA Google pinned site, Negombo');
              const bounds=await page.locator('iframe[title="ConstructFlow Interactive Map"]').boundingBox();
              assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1);
              assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
              await page.screenshot({path:path.join(root,`.validation-ui/current/project-google-map-${width}.png`)});
              await page.getByText('Cancel',{exact:true}).last().click();
              console.log('PASS Google widget fixture search, Place Details, exact pin/address, storage isolation and manual pin at',width);
              continue;
            }
            try {await mapFrame.waitForFunction(()=>typeof map!=='undefined'&&!!map,null,{timeout:45000,polling:100});}
            catch(error){
              await page.screenshot({path:path.join(root,`.validation-ui/current/project-map-${width}-loading.png`)});
              console.error('MAP STATE',JSON.stringify({frames:page.frames().map(frame=>frame.url()),state:await mapFrame.evaluate(()=>({L:typeof L,map:typeof map,ready:document.readyState,text:document.body.innerText.slice(0,1000)})),failed}));throw error;
            }
            if(process.env.LIVE_UI_TYPO_SEARCH){
              const search=page.getByRole('textbox',{name:'Search site location',exact:true});
              await search.fill('7.210123, 79.810456');
              await page.getByRole('button',{name:'Search site location',exact:true}).click();
              await page.waitForFunction(()=>document.querySelector('input[placeholder="Exact address will appear here"]')?.value==='Lat: 7.210123, Lng: 79.810456');
              const predictions=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/projects/location-suggestions')&&new URL(response.url()).searchParams.get('q')==='shrangila');
              if(process.env.LIVE_UI_SLOW_TYPING){await search.fill('');await search.pressSequentially('shrangila',{delay:550});}
              else await search.fill('shrangila');
              const predictionRows=await (await predictions).json();
              const colombo=predictionRows.find(row=>row.name==='Shangri-La Hotel Colombo');
              assert(colombo,'Screenshot typo must produce Shangri-La Colombo as a selectable result');
              assert(predictionRows.some(row=>/Hambantota/i.test(row.display_name)),'Keep different branches separate');
              assert.equal(await page.locator('input[placeholder="Exact address will appear here"]').inputValue(),'Lat: 7.210123, Lng: 79.810456');
              await page.getByRole('button',{name:/^Select location: Shangri-La Hotel Colombo/}).click();
              await page.waitForFunction(()=>document.querySelector('input[placeholder="Exact address will appear here"]')?.value.startsWith('Shangri-La Hotel Colombo'));
              await mapFrame.waitForFunction(({lat,lon})=>currentMarker&&Math.abs(currentMarker.getLatLng().lat-lat)<.000001&&Math.abs(currentMarker.getLatLng().lng-lon)<.000001,{lat:colombo.lat,lon:colombo.lon},{polling:100});
              await page.screenshot({path:path.join(root,'.validation-ui/current/shrangila-search-browser.png')});
              await page.getByText('Cancel',{exact:true}).last().click();
              console.log('PASS real shrangila autocomplete lists Colombo/Hambantota branches, preserves the previous site until selection and updates the selected hotel pin/address without saving');
              continue;
            }
            if(process.env.LIVE_UI_MISSING_PLACES){
              const search=page.getByRole('textbox',{name:'Search site location',exact:true});
              await search.fill('Think Path');
              await page.getByRole('button',{name:'Search site location',exact:true}).click();
              await page.getByText('No matching place is listed. Try the street address and city, or pin the exact site on the map.',{exact:true}).waitFor();
              await page.getByRole('link',{name:'Find place in Google Maps',exact:true}).waitFor();
              assert.equal(await page.getByRole('button',{name:/^Select location: Path/}).count(),0);
              assert.equal(await mapFrame.evaluate(()=>currentMarker===null),true);
              await search.fill('7.210123, 79.810456');
              await page.getByRole('button',{name:'Search site location',exact:true}).click();
              await page.waitForFunction(()=>document.querySelector('input[placeholder="Exact address will appear here"]')?.value==='Lat: 7.210123, Lng: 79.810456');
              await page.getByText('Cancel',{exact:true}).last().click();
              console.log('PASS missing Think Path does not show unrelated Path results or commit a fake pin; Google Maps fallback is available; exact-coordinate entry works');
              continue;
            }
            if(process.env.LIVE_UI_GEOAPIFY_REAL){
              const search=page.getByRole('textbox',{name:'Search site location',exact:true});
              await search.fill('Negombo');
              await page.getByRole('button',{name:/^Select location: Negombo/}).first().click();
              await page.getByText(/This result covers an area or street/).waitFor();
              assert.equal(await page.locator('input[placeholder="Exact address will appear here"]').inputValue(),'');
              assert.equal(await mapFrame.evaluate(()=>currentMarker===null),true,'City center must not become the project site');
              await mapFrame.waitForFunction(()=>Math.abs(map.getCenter().lat-7.2094282)<.001,null,{polling:100});
              await mapFrame.locator('#map').click({position:{x:100,y:100}});
              await page.waitForFunction(()=>!!document.querySelector('input[placeholder="Exact address will appear here"]')?.value&& !document.querySelector('input[placeholder="Exact address will appear here"]').value.startsWith('Lat:'));
              await search.fill('7.210123, 79.810456');
              await page.getByRole('button',{name:'Search site location',exact:true}).click();
              await page.waitForFunction(()=>document.querySelector('input[placeholder="Exact address will appear here"]')?.value==='Lat: 7.210123, Lng: 79.810456');
              await mapFrame.waitForFunction(()=>currentMarker&&Math.abs(currentMarker.getLatLng().lat-7.210123)<.000001,null,{polling:100});
              const pin=await mapFrame.evaluate(()=>({lat:currentMarker.getLatLng().lat,lng:currentMarker.getLatLng().lng}));
              assert(Math.abs(pin.lng-79.810456)<.000001);
              const hotelResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/projects/geocode')&&new URL(response.url()).searchParams.get('q')==='Jetwing Blue, Negombo');
              await search.fill('Jetwing Blue, Negombo');
              await page.getByRole('button',{name:'Search site location',exact:true}).click();
              const hotelRows=await (await hotelResponse).json();
              const hotel=hotelRows.find(row=>row.name==='Jetwing Blue'&&row.match_type==='full');
              assert(hotel,'Full named-business match should rank ahead of partial matches');
              await page.getByRole('button',{name:/^Select location: Jetwing Blue/}).first().click();
              await page.waitForFunction(()=>document.querySelector('input[placeholder="Exact address will appear here"]')?.value.includes('Jetwing Blue'));
              await mapFrame.waitForFunction(({lat,lon})=>currentMarker&&Math.abs(currentMarker.getLatLng().lat-lat)<.000001&&Math.abs(currentMarker.getLatLng().lng-lon)<.000001,{lat:hotel.lat,lon:hotel.lon},{polling:100});
              await page.getByRole('link',{name:'Powered by Geoapify',exact:true}).waitFor();
              assert.equal(directGeoapifyRequests,0,'Provider key requests must stay on the backend');
              await page.screenshot({path:path.join(root,'.validation-ui/current/geoapify-real-browser.png')});
              await page.getByText('Cancel',{exact:true}).last().click();
              console.log('PASS real city preview without a false site pin; manual address; exact coordinates; Jetwing Blue named-business pin/address; no provider-key traffic or project save');
              continue;
            }
            await mapFrame.locator('#map').click({position:{x:100,y:100}});
            await page.waitForFunction(()=>document.querySelector('input[placeholder="Exact address will appear here"]')?.value==='QA selected map address');
            if(process.env.LIVE_UI_MAP_SEARCH){
              const search=page.getByRole('textbox',{name:'Search site location',exact:true});
              await search.fill('QA Negombo Office');
              await page.getByText('Choose a location',{exact:true}).waitFor();
              assert.equal(await page.locator('input[placeholder="Exact address will appear here"]').inputValue(),'QA selected map address');
              assert.equal(await page.getByRole('button',{name:/^Select location:/}).count(),2);
              await page.getByText(/Partial match · verify the site pin/).waitFor();
              if(width===390){await search.press('ArrowDown');await search.press('ArrowDown');await search.press('Enter');}
              else await page.getByRole('button',{name:'Select location: QA Negombo Office, Negombo, Sri Lanka',exact:true}).click();
              assert.equal(await page.locator('input[placeholder="Exact address will appear here"]').inputValue(),'QA Negombo Office, Negombo, Sri Lanka');
              await search.fill('No listed place');
              await page.getByRole('button',{name:'Search site location',exact:true}).click();
              await page.getByText('No matching place is listed. Try the street address and city, or pin the exact site on the map.',{exact:true}).waitFor();
              assert.equal(await page.locator('input[placeholder="Exact address will appear here"]').inputValue(),'QA Negombo Office, Negombo, Sri Lanka');
              console.log('PASS explicit map result selection, partial labels, empty-state and preserved site address at',width);
            }
            const bounds=await page.locator('iframe[title="ConstructFlow Interactive Map"]').boundingBox();
            await page.screenshot({path:path.join(root,`.validation-ui/current/project-map-${width}.png`)});
            assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1,JSON.stringify({width,bounds}));
            assert(tileRequests.length&&tileRequests.every(row=>row.referer===new URL(mapFrame.url()).origin+'/'));
            await page.getByText('Cancel',{exact:true}).last().click();
            console.log('PASS live project map at',width,'px selects the address with correct tile identification; no project saved');
          }
          if(process.env.LIVE_UI_GOOGLE_MAP){
            await page.goto(base+'/admin/projects/create',{waitUntil:'domcontentloaded'});
            const googlePageMap=page.frameLocator('iframe[title="ConstructFlow Interactive Map"]');
            await googlePageMap.getByRole('textbox',{name:'Search Google Maps places',exact:true}).fill('QA Construction');
            await googlePageMap.getByRole('button',{name:'QA Construction Office, Negombo',exact:true}).click();
            await page.waitForFunction(()=>document.querySelector('input[placeholder="e.g. 123 Galle Rd, Colombo"]')?.value==='QA Construction Office, 408 QA Road, Negombo, Sri Lanka');
            assert.equal(await page.locator('input[placeholder="e.g. Colombo 03"]').inputValue(),'QA Construction Office');
            console.log('PASS full project creation page receives the selected Google place address without saving');
          }
          if(process.env.LIVE_UI_MAP_SEARCH){
            await page.goto(base+'/admin/projects/create',{waitUntil:'domcontentloaded'});
            await page.getByRole('textbox',{name:'Search site location',exact:true}).fill('QA Negombo Office');
            await page.getByRole('button',{name:'Select location: QA Negombo Office, Negombo, Sri Lanka',exact:true}).click();
            await page.waitForFunction(()=>document.querySelector('input[placeholder="e.g. 123 Galle Rd, Colombo"]')?.value==='QA Negombo Office, Negombo, Sri Lanka');
            assert.equal(await page.locator('input[placeholder="e.g. Colombo 03"]').inputValue(),'QA Negombo Office');
            console.log('PASS shared typing search and selected pin address on full project-create page without saving');
          }
        }
        if(route.includes('/payroll'))await page.getByText(/4,156\.25|4156\.25/).first().waitFor({timeout:30000}).catch(()=>{});
        const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,renderError:/Uncaught Error|Unmatched Route|Log 1 of/.test(document.body.innerText),text:document.body.innerText.slice(0,16000)}));
        const result={role,route,errors:[...errors],failed:[...failed],blocked:[...blocked],overflow:geometry.overflow,renderError:geometry.renderError};
        if(route.endsWith('/commercial'))result.hasVerifiedPayment=geometry.text.includes('QA synthetic foundation payment')&&geometry.text.includes('Paid');
        if(route.includes('/payroll'))result.hasQaPayroll=geometry.text.includes('4,156.25')||geometry.text.includes('4156.25');
        if(role==='worker'&&route==='/worker/payroll')result.hasRecordedSummary=/recorded payslip/i.test(geometry.text);
        if(route.endsWith('/boq')){
          result.hasBoq=geometry.text.includes('BOQ baseline:')&&geometry.text.includes('CF QA Cement');
          result.boqRoleAccess=role==='client'?await page.getByRole('button',{name:'Edit BOQ baseline',exact:true}).count()===0:await page.getByRole('button',{name:'Edit BOQ baseline',exact:true}).count()===1;
        }
        results.push(result);
        fs.writeFileSync(path.join(root,process.env.LIVE_UI_OUTPUT||'.validation-ui/live-browser-results.json'),JSON.stringify(results,null,2));
        console.log('CHECKED',role,route);
      }
      await context.close();
    }
  } finally {await browser.close();fs.writeFileSync(path.join(root,process.env.LIVE_UI_OUTPUT||'.validation-ui/live-browser-results.json'),JSON.stringify(results,null,2));}
  const failures=results.filter(row=>row.errors.length||row.failed.length||row.blocked.length||row.overflow||row.renderError||row.hasVerifiedPayment===false||row.hasQaPayroll===false||row.hasRecordedSummary===false||row.hasBoq===false||row.boqRoleAccess===false);
  console.log('LIVE RESULT',results.length,'pages;',failures.length,'failures');
  if(failures.length){console.log(JSON.stringify(failures,null,2));process.exitCode=1;}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
