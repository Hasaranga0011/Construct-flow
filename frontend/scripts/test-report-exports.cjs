const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};
const { typedSection, reportHtml, reportFilename } = require('../src/components/reports/reportDocument.ts');
(async () => {
 const section = typedSection('Project register', ['Project', 'Budget', 'Quantity'], Array.from({length:81}, (_,i) => [i===80?'FINAL RECORD':`Project ${i}`,i===0?'Not recorded':'Rs. 12,345.50',String(i)]),[2],[1]);
 const report={title:'Project Performance',scope:'Over budget; search: <script>alert(1)</script>',retrievedAt:'2026-10-05T00:00:00Z',exportedAt:'2026-10-05T01:00:00Z',sections:[section,{title:'Empty',headers:['Name'],rows:[]},{title:'Safety',headers:['Name'],rows:[['=SUM(A1:A2)']]}]};
 const html=reportHtml(report);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('FINAL RECORD'));assert(html.includes('No records match these filters.'));
 assert.equal(section.rows.length,81);
 assert.equal(section.rows[0][1],null);assert.equal(section.rows[1][1],12345.5);assert.equal(section.rows[1][2],1);
 assert.equal(section.rows[80][0],'FINAL RECORD');
 assert(html.includes('=SUM(A1:A2)'));assert(html.includes('display:table-header-group'));
 assert.equal(reportFilename(report),'project-performance-2026-10-05');
 console.log('PASS: frontend print document includes all 81 records, typed amounts, missing values, escaped HTML, empty sections and stable filenames. Binary PDF/XLSX generation is covered by backend export tests.');
})().catch(e=>{console.error(e);process.exit(1)});
