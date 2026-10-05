import type { jsPDF } from 'jspdf';
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
<header><div class="brand">ConstructAi | Management Reporting</div><h1>${esc(report.title)}</h1><p>Data retrieved: ${esc(report.retrievedAt)}\nExported: ${esc(report.exportedAt)} | Currency: LKR</p><p>${esc(report.scope)}</p></header>
${report.sections.map(section => `<section><h2>${esc(section.title)}</h2>${section.note ? `<p>${esc(section.note)}</p>` : ''}${section.rows.length ? `<table><thead><tr>${section.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr>${row.map((cell, i) => `<td${typeof cell === 'number' ? ' class="number"' : ''}>${esc(display(section, cell, i))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">No records match these filters.</p>'}</section>`).join('')}
<footer>All matching records are included, including rows not displayed on screen. Missing values are not assumed to be zero.</footer></body></html>`;
}

export async function createExcel(report: ReportDocument): Promise<Uint8Array> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ConstructAi'; workbook.created = new Date(report.exportedAt);
  const cover = workbook.addWorksheet('Report information');
  cover.columns = [{ width: 25 }, { width: 100 }];
  cover.addRows([
    ['ConstructAi', report.title], ['Data retrieved (UTC)', report.retrievedAt], ['Exported (UTC)', report.exportedAt],
    ['Currency', 'LKR'], ['Scope and filters', report.scope],
    ['Included records', 'All matching records, including rows beyond the on-screen page.'],
    ['Missing data', 'Blank numeric cells mean not recorded; they do not mean zero.'],
  ]);
  cover.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  cover.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFC2410C' } };
  cover.getRow(5).height = 60;
  report.sections.forEach((section, index) => {
    // Prefix guarantees uniqueness even when titles truncate to the Excel limit.
    const name = `${index + 1} ${section.title}`.replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31);
    const sheet = workbook.addWorksheet(name, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.columns = section.headers.map((header, col) => ({ width: col === 0 ? 34 : Math.min(36, Math.max(20, header.length + 3)) }));
    sheet.mergeCells(1, 1, 1, section.headers.length);
    sheet.getCell(1, 1).value = section.title;
    sheet.getCell(1, 1).font = { size: 16, bold: true, color: { argb: 'FFC2410C' } };
    sheet.mergeCells(2, 1, 2, section.headers.length);
    sheet.getCell(2, 1).value = section.note || report.scope;
    sheet.getCell(2, 1).alignment = { wrapText: true, vertical: 'top' }; sheet.getRow(2).height = 45;
    const header = sheet.getRow(4); header.values = section.headers;
    header.font = { bold: true, color: { argb: 'FF7C2D12' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0E5' } };
    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    sheet.pageSetup.printTitlesRow = '1:4';
    sheet.headerFooter.oddFooter = '&LConstructAi&CPage &P of &N&RCurrency LKR';
    for (const cells of section.rows) {
      // ExcelJS writes strings as strings, never formulas, even if they start with =.
      const row = sheet.addRow(cells);
      row.alignment = { wrapText: true, vertical: 'top' };
      section.currencyColumns?.forEach(col => { row.getCell(col + 1).numFmt = '"Rs. "#,##0.00;[Red]-"Rs. "#,##0.00'; });
      if (row.number % 2) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
    if (section.rows.length) sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + section.rows.length, column: section.headers.length } };
    else sheet.getCell(5, 1).value = 'No records match these filters.';
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function createPdf(report: ReportDocument): Promise<Uint8Array> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: report.title, author: 'ConstructAi', subject: report.scope });
  let y = 29;
  const tableDoc = doc as jsPDF & { lastAutoTable: { finalY: number } };
  const addText = (value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 12 : 9);
    const lines: string[] = doc.splitTextToSize(value, 269);
    for (const line of lines) {
      if (y > 187) { doc.addPage(); y = 29; }
      doc.text(line, 14, y); y += bold ? 6 : 4.5;
    }
    y += 3;
  };
  addText(`Data retrieved: ${report.retrievedAt}\nExported: ${report.exportedAt} | Currency: LKR\n${report.scope}`);
  for (const section of report.sections) {
    if (y > 160) { doc.addPage(); y = 29; }
    addText(section.title, true);
    if (section.note) addText(section.note);
    autoTable(doc, {
      startY: y, margin: { top: 29, bottom: 18, left: 14, right: 14 },
      head: [section.headers], body: section.rows.length ? section.rows.map(row => row.map((cell, col) => display(section, cell, col))) : [[{ content: 'No records match these filters.', colSpan: section.headers.length }]],
      theme: 'striped', showHead: 'everyPage', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = tableDoc.lastAutoTable.finalY + 12;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'bold'); doc.setTextColor(194, 65, 12); doc.setFontSize(10);
    doc.text('ConstructAi | Management Reporting', 14, 12);
    doc.setTextColor(23, 32, 51); doc.setFontSize(12); doc.text(report.title, 14, 20);
    doc.setDrawColor(249, 115, 22); doc.line(14, 23, 283, 23);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Currency LKR | All matching records | Page ${page} of ${pages}`, 14, 201);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
