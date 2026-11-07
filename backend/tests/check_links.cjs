const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const appFiles = getFiles('frontend/src/app');
const routes = new Set(appFiles.map(f => {
  let r = '/' + path.relative('frontend/src/app', f).replace(/\\/g, '/').replace(/\.(tsx|ts)$/, '').replace(/\/index$/, '');
  if (r === '') r = '/';
  return r;
}));

console.log('Total app routes found:', routes.size);

const srcFiles = getFiles('frontend/src');
let linksChecked = 0;
let deadLinks = [];

const linkRegex = /(?:router\.(?:push|replace)|href=)["'](\/[^"'?#${}]+)["']/g;

srcFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    let link = match[1];
    linksChecked++;
    let exists = routes.has(link);
    if (!exists) {
      for (const r of routes) {
        const regexStr = '^' + r.replace(/\[[^\]]+\]/g, '[^/]+') + '$';
        if (new RegExp(regexStr).test(link)) {
          exists = true;
          break;
        }
      }
    }
    if (!exists && !link.startsWith('/api') && !link.startsWith('/_') && !link.startsWith('/rest') && !link.startsWith('/auth')) {
      deadLinks.push({ file: path.relative('frontend/src', f), link });
    }
  }
});

console.log('Checked navigation links:', linksChecked);
console.log('Potential unmatched links:', deadLinks.length);
deadLinks.forEach(d => console.log('  ', d.file, '->', d.link));
