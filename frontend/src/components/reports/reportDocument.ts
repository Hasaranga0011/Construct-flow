import { money } from './metrics';

export type ExportCell = string | number | null;
export type ExportSection = {
  title: string;
  note?: string;
  headers: string[];
  rows: ExportCell[][];
  currencyColumns?: number[];
};
export type ReportDocument = {
  layout?: 'payslip';
  title: string;
  retrievedAt: string;
  exportedAt: string;
  scope: string;
  sections: ExportSection[];
};
export type ExportFormat = 'print' | 'pdf' | 'excel';

export function reportFilename(report: ReportDocument) {
  return `${report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${report.exportedAt.slice(0, 10)}`;
}
export function typedSection(title: string, headers: string[], rows: string[][], numericColumns: number[] = [], currencyColumns: number[] = [], note?: string): ExportSection {
  return {
    title, headers, currencyColumns, note,
    rows: rows.map(row => row.map((value, index) => {
      if (!numericColumns.includes(index) && !currencyColumns.includes(index)) return value;
      if (value === 'Not recorded') return null;
      const clean = value.replace(/^Rs\.\s*/, '').replace(/,/g, '').trim();
      return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : value;
    })),
  };
}
const display = (section: ExportSection, cell: ExportCell, column: number) =>
  typeof cell === 'number' && section.currencyColumns?.includes(column) ? money(cell) : cell === null ? 'Not recorded' : String(cell);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function reportHtml(report: ReportDocument) {
  const esc = escapeHtml;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(report.title)}</title>
<style>@page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#172033;margin:0}header{border-bottom:3px solid #f97316;padding-bottom:12px;margin-bottom:18px}.brand{color:#c2410c;font-size:15px;font-weight:bold}h1{font-size:23px;margin:8px 0}h2{font-size:15px;margin:18px 0 8px;break-after:avoid}p{line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;color:#475569;margin:6px 0}table{border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:18px}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #dbe1e8;padding:7px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#fff0e5;color:#7c2d12}tbody tr:nth-child(even){background:#f8fafc}.number{text-align:right}.empty{padding:14px;background:#f8fafc}footer{border-top:1px solid #dbe1e8;margin-top:18px;padding-top:10px;color:#64748b}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
${report.layout === 'payslip' ? '<style>@page{size:A4 portrait;margin:18mm}body{font-size:12px}header{padding:20px;background:#f8fafc;border-radius:10px;border-bottom:4px solid #f97316}h1{font-size:26px}th,td{padding:11px;border:0;border-bottom:1px solid #e2e8f0}td:last-child{text-align:right;font-weight:600}section:last-of-type tbody tr:last-child{background:#fff0e5;color:#9a3412;font-size:17px;font-weight:bold}footer{font-size:10px}</style>' : ''}
<header><div class="brand">ConstructAi | ${report.layout === 'payslip' ? 'Salary Statement' : 'Management Reporting'}</div><h1>${esc(report.title)}</h1><p>Data retrieved: ${esc(report.retrievedAt)}\nExported: ${esc(report.exportedAt)} | Currency: LKR</p><p>${esc(report.scope)}</p></header>
${report.sections.map(section => `<section><h2>${esc(section.title)}</h2>${section.note ? `<p>${esc(section.note)}</p>` : ''}${section.rows.length ? `<table><thead><tr>${section.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr>${row.map((cell, i) => `<td${typeof cell === 'number' ? ' class="number"' : ''}>${esc(display(section, cell, i))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">No records match these filters.</p>'}</section>`).join('')}
<footer>${report.layout === 'payslip' ? 'Computer-generated salary statement. Generated status does not confirm payment. Keep this statement for your records.' : 'All matching records are included, including rows not displayed on screen. Missing values are not assumed to be zero.'}</footer></body></html>`;
}


