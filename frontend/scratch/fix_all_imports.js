const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../src');

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const fileDir = path.dirname(filePath);
  
  // We want to replace all imports that start with relative paths to common, lib, services, components
  // and recalculate them.
  const regex = /import\s+({[^}]+}|\w+)\s+from\s+['"]((?:\.\.\/)+)([^'"]+)['"]/g;
  
  let modified = false;
  content = content.replace(regex, (match, imports, dots, rest) => {
    // If the path is trying to reach lib, components, services, context, etc.
    if (rest.startsWith('lib/') || rest.startsWith('components/') || rest.startsWith('services/') || rest.startsWith('context/')) {
      // Calculate how many levels up to 'src'
      // Example: fileDir = src/app/admin/materials
      // path.relative(fileDir, srcDir) => '../../..'
      let relPathToSrc = path.relative(fileDir, srcDir);
      
      // on windows, path.relative uses backslashes
      relPathToSrc = relPathToSrc.replace(/\\\\/g, '/');
      
      // if file is directly in src, relPath is ''
      if (relPathToSrc === '') {
        relPathToSrc = '.';
      }

      const newImportPath = `${relPathToSrc}/${rest}`;
      
      if (`${dots}${rest}` !== newImportPath) {
        modified = true;
        console.log(`Fixing ${filePath}: ${dots}${rest} -> ${newImportPath}`);
        return `import ${imports} from '${newImportPath}'`;
      }
    }
    return match;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      fixImportsInFile(fullPath);
    }
  }
}

walkDir(path.resolve(srcDir, 'app'));
