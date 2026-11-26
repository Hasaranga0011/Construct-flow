const {chromium}=require('playwright'),assert=require('node:assert/strict');
const preview=process.env.UI_AUDIT_URL||'http://127.0.0.1:8096';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const seen=[];const pageFor=require('./workflow-browser-fixture.cjs')({browser,seen,preview});try{
 const {page,context}=await pageFor('admin');page.setDefaultNavigationTimeout(120000);
 const state={ready:false,reason:'No independently verified training evidence',training_projects:0};
 await page.route('https://api.fixture.invalid/api/ai/insights*',r=>r.fulfill({headers:{'access-control-allow-origin':'*'},json:{
  projects:[{project_id:'fixture',project_name:'Pending model',delay_risk:null,assessment_status:'model_not_ready',method:'verified_ml',recommendation:state.reason,components:[],missing_components:[]}],
  cost_ml_ready:false,model_readiness:{cost:state,delay:state},real_projects_count:0,verified_real_count:0,
  feature_importance:[],project_health:{total:67,completed:13,active:54},model_info:{cost_model:state,delay_model:state},historical_projects:[],market_trends:[],pending_market_trends:[]}}));
 await page.goto(preview+'/admin/insights');await page.getByText('Model readiness',{exact:true}).waitFor();
 assert(await page.getByText('Cost: Not ready',{exact:true}).count());assert(await page.getByText('Delay: Not ready',{exact:true}).count());
 assert(await page.getByText(/67 operational projects/).count());
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(!(await page.locator('body').innerText()).includes('0/30'));}
 await page.getByText('Model readiness',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'../.validation-ui/current/verified-ml-readiness.png'});
 await page.route('https://api.fixture.invalid/api/ai/predict-cost',r=>r.fulfill({headers:{'access-control-allow-origin':'*'},status:503,json:{detail:'Verified cost model is not ready: verified training data is required'}}));
 await page.goto(preview+'/admin/estimator');await page.getByPlaceholder('e.g. 2400',{exact:true}).fill('2400');await page.getByPlaceholder('e.g. 2',{exact:true}).fill('2');
 await page.getByText('Generate Estimate',{exact:true}).click();await page.getByRole('alert').getByText(/Verified cost model is not ready/).waitFor();
 assert(!seen.some(row=>row.path==='/api/estimations'&&row.data?.estimated_cost));
 const body=await page.locator('body').innerText();assert(!body.includes('42%'));
 console.log('PASS verified readiness at four widths: no 0/30 badge, missing models show no fabricated predictions, blocked estimation saves no record');await context.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
