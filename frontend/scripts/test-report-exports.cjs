const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};
const { typedSection, createExcel, createPdf, reportHtml } = require('../src/components/reports/reportDocument.ts');
(async () => {
 const section = typedSection('Project register', ['Project', 'Budget', 'Quantity'], Array.from({length:81}, (_,i) => [i===80?'FINAL RECORD':`Project ${i}`,i===0?'Not recorded':'Rs. 12,345.50',String(i)]),[2],[1]);
 const report={title:'Project Performance',scope:'Over budget; search: <script>alert(1)</script>',retrievedAt:'2026-10-05T00:00:00Z',exportedAt:'2026-10-05T01:00:00Z',sections:[section,{title:'Empty',headers:['Name'],rows:[]},{title:'Safety',headers:['Name'],rows:[['=SUM(A1:A2)']]}]};
 const html=reportHtml(report);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('FINAL RECORD'));assert(html.includes('No records match these filters.'));
 const workbookBytes=await createExcel(report);
 const ExcelJS=require('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(workbookBytes);
 assert.equal(workbook.worksheets.length,4);
 const data=workbook.worksheets[1];assert.equal(data.getCell('B5').value,null);assert.equal(data.getCell('B6').value,12345.5);assert.equal(data.getCell('C6').value,1);assert.equal(data.getCell('A85').value,'FINAL RECORD');
 assert.equal(workbook.worksheets[3].getCell('A5').value,'=SUM(A1:A2)');assert.equal(workbook.worksheets[3].getCell('A5').type,ExcelJS.ValueType.String);
 const pdf=await createPdf(report);const pdfText=Buffer.from(pdf).toString('latin1');assert(pdfText.startsWith('%PDF-'));assert(pdfText.includes('FINAL RECORD'));assert((pdfText.match(/\/Type \/Page\b/g)||[]).length>1);
 const folder=path.resolve(__dirname,'../../.validation-web');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'report-export-test.pdf'),pdf);fs.writeFileSync(path.join(folder,'report-export-test.xlsx'),workbookBytes);
 console.log('PASS: complete 81-row PDF/XLSX, multipage PDF, numeric Excel amounts, missing values, formula-safe strings, escaped print HTML and empty sections.');
})().catch(e=>{console.error(e);process.exit(1)});
