// Exercise the exported site with clean HTML URLs and a client-router fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const handler = require('serve-handler');
const root = path.resolve(__dirname, '..');
const config = require('../vercel.json');
const output = path.resolve(process.argv[2] || path.join(root, 'dist'));
assert.equal(config.cleanUrls, true);
assert.equal(config.outputDirectory, 'dist');
assert.equal(config.framework, null);
assert(config.rewrites.some(rule => rule.source === '/:path*' && rule.destination === '/'));
assert(fs.existsSync(path.join(output, 'index.html')), 'Export the web app before checking routing');
function files(directory) {
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
}
const routes=files(path.join(root,'src/app')).filter(file=>file.endsWith('.tsx')&&!file.endsWith('_layout.tsx')&&!path.basename(file).startsWith('+')).map(file=>'/'+path.relative(path.join(root,'src/app'),file).replaceAll('\\','/').replace(/\.tsx$/,'').replace(/\/index$/,'').replace(/\[[^\]]+\]/g,'00000000-0000-0000-0000-000000000001'));
const server=http.createServer((request,response)=>{
  // serve-handler applies rewrites before clean URLs; Vercel gives existing files
  // precedence. Model that precedence explicitly rather than masking all routes.
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  const target=path.resolve(output,'.'+pathname);
  const existing=target.startsWith(output+path.sep)&&(fs.existsSync(target)||fs.existsSync(target+'.html'));
  return handler(request,response,{
    public:output,cleanUrls:config.cleanUrls,
    rewrites:existing?[]:[{source:'**',destination:'/index.html'}],
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    for(let offset=0;offset<routes.length;offset+=12)await Promise.all(routes.slice(offset,offset+12).map(async route=>{
      const response=await fetch(origin+route);
      assert.equal(response.status,200,route);
      assert(response.headers.get('content-type').includes('text/html'),route);
      assert((await response.text()).includes('<html'),route);
    }));
    const staticRoute='/admin/insights';
    const response=await fetch(origin+staticRoute);
    assert.equal(await response.text(),fs.readFileSync(path.join(output,staticRoute+'.html'),'utf8'),'Existing route must use its own HTML');
    const assets=files(path.join(output,'_expo')).filter(file=>file.endsWith('.js')||file.endsWith('.css')).slice(0,3);
    for(const asset of assets){
      const response=await fetch(origin+'/'+path.relative(output,asset).replaceAll('\\','/'));
      assert.equal(response.status,200);
      assert(!response.headers.get('content-type').includes('text/html'),'Static assets must not become HTML');
      await response.arrayBuffer();
    }
    console.log(`PASS ${routes.length} exported static/dynamic/auth direct routes and ${assets.length} static assets; local clean-URL/fallback server, not a Vercel deployment`);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
