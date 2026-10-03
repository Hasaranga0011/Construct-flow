const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Fix touch targets (w-10 h-10 -> w-11 h-11)
      content = content.replace(/w-10 h-10/g, 'w-11 h-11');
      content = content.replace(/h-10 w-10/g, 'h-11 w-11');
      
      // Fix modals max height
      if (fullPath.endsWith('Modal.tsx')) {
         content = content.replace(/bg-white rounded-(xl|2xl|3xl)[^\"']*\"/g, (match) => {
             if (!match.includes('max-h-[')) {
                 return match.slice(0, -1) + ' max-h-[85vh]"';
             }
             return match;
         });
      }

      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }
}

replaceInDir('./src');
console.log('Finished updating touch targets and modal heights');
