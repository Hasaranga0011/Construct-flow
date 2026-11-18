// One canonical map implementation for the native WebView and isolated web frame.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function buildMapFrame() {
  // Frontend-only native build workers do not package the separate API service.
  if (!fs.existsSync(path.join(__dirname, '../../backend'))) return null;
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(__dirname, '../src/components/common/mapHtml.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {} }; vm.runInNewContext(compiled, context);
  const html = context.exports.generateLeafletHtml({ deferred: true, interactive: false });
  const target = path.join(__dirname, '../../backend/static/constructflow-map.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) fs.writeFileSync(target, html, 'utf8');
  return html;
}
module.exports = buildMapFrame;
if (require.main === module) { buildMapFrame(); console.log('Map frame asset generated.'); }
