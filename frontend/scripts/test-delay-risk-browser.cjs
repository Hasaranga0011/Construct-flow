const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const python=path.resolve(__dirname,'../../.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const generated=require('node:child_process').spawnSync(python,[path.resolve(__dirname,'../../backend/tests/make_delay_fixture.py')],{encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr);
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8096';
const evidence=JSON.parse(fs.readFileSync('../.validation-ui/current/delay-fixture.json','utf8'));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const pageFor=require('./workflow-browser-fixture.cjs')({browser,seen:[],preview});try{
 for(const [portal,path] of [['admin','dashboard'],['pm','dashboard'],['admin','insights']]){
  const {page,context}=await pageFor(portal);page.setDefaultNavigationTimeout(120000);let fail=false;
  await page.route('https://api.fixture.invalid/api/ai/insights*',r=>r.fulfill({headers:{'access-control-allow-origin':'*'},status:fail?503:200,json:fail?{detail:'Fixture unavailable'}:evidence}));
  await page.goto(`${preview}/${portal}/${path}`);
  const cards=page.getByTestId('delay-risk-assessment');await cards.first().waitFor();assert.equal(await cards.count(),4);
  assert(await page.getByText('25.5%',{exact:true}).count());assert(await page.getByText('Insufficient data',{exact:true}).count());
  if(path==='dashboard')await page.getByRole('button',{name:'Show score breakdown',exact:true}).first().click();
  await page.getByText(/Contribution/).first().waitFor();
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${portal}/${path} width ${width}`);}
  if(path==='insights'){
   await cards.first().screenshot({path:'../.validation-ui/current/delay-risk-breakdown-desktop.png'});
   await page.setViewportSize({width:390,height:1000});await cards.first().screenshot({path:'../.validation-ui/current/delay-risk-breakdown-mobile.png'});
  }
  if(path==='dashboard'){
   fail=true;await page.reload();await page.getByRole('button',{name:'Retry risk assessment',exact:true}).waitFor();assert.equal(await cards.count(),0);
   fail=false;await page.getByRole('button',{name:'Retry risk assessment',exact:true}).click();await cards.first().waitFor();
  }
  console.log(`PASS ${portal}/${path}: differentiated scores, missing evidence, breakdown, four widths and retry without fabricated fallback`);await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
