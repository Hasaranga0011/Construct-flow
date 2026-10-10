const fs=require('fs');let s=fs.readFileSync('.validation-web/check-populated.cjs','utf8');const start=s.indexOf('for(const file of'),end=s.indexOf('await page.close();',start);s=s.slice(0,start)+`
await page.goto('http://localhost:8083/admin/dashboard',{waitUntil:'domcontentloaded',timeout:120000});await page.getByLabel('Open notifications',{exact:true}).first().waitFor();
for(const [width,height] of [[320,568],[844,390],[768,1024],[1440,900]]) {
 await page.setViewportSize({width,height});await page.waitForTimeout(250);
 if(width<1024){await page.getByLabel('Open navigation menu',{exact:true}).click();await page.waitForTimeout(400);await page.getByLabel('Close navigation menu',{exact:true}).click({position:{x:width-10,y:50}});await page.waitForTimeout(400);}
 await page.getByText('+ New Project',{exact:true}).click();await page.getByPlaceholder('e.g. Marina Tower').waitFor();
 const modal=page.getByRole('dialog');
 const issues=await modal.evaluate(el=>[...el.querySelectorAll('input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1)}).map(e=>e.placeholder));if(issues.length)throw Error('Modal input overflow '+width+': '+issues);
 await page.getByText('Create Project',{exact:true}).scrollIntoViewIfNeeded();const box=await page.getByText('Create Project',{exact:true}).boundingBox();if(box.y<0||box.y+box.height>height)throw Error('Submit unreachable '+width);
 await page.screenshot({path:'.validation-web/project-modal-'+width+'.png'});await page.getByText('Cancel',{exact:true}).click();console.log('PASS modal and navigation',width,height);
}
`+s.slice(end);fs.writeFileSync('.validation-web/check-modals.cjs',s);
