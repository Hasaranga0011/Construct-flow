import { Platform } from 'react-native';
import { createExcel, createPdf, ExportFormat, ReportDocument, reportFilename, reportHtml } from './reportDocument';

function download(bytes: Uint8Array, mime: string, filename: string) {
  const buffer = new Uint8Array(bytes).buffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function printWeb(html: string) {
  const frame = document.createElement('iframe');
  frame.title = 'Printable management report';
  frame.setAttribute('data-report-print', 'true');
  Object.assign(frame.style, { position: 'fixed', width: '1px', height: '1px', right: '0', bottom: '0', border: '0' });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Print preview did not load. Please retry.')), 15000);
      frame.onload = () => { clearTimeout(timeout); resolve(); };
      frame.srcdoc = html; document.body.appendChild(frame);
    });
    await frame.contentDocument?.fonts.ready;
    const target = frame.contentWindow;
    if (!target) throw new Error('Unable to open the print preview.');
    target.addEventListener('afterprint', () => frame.remove(), { once: true });
    target.focus(); target.print();
    // Retain the document while browsers display their print dialog.
    setTimeout(() => frame.remove(), 300000);
  } catch (error) { frame.remove(); throw error; }
}

export async function deliverReport(report: ReportDocument, format: ExportFormat) {
  if (format === 'print') {
    if (Platform.OS === 'web') await printWeb(reportHtml(report));
    else { const Print = await import('expo-print'); await Print.printAsync({ html: reportHtml(report), orientation: Print.Orientation.landscape }); }
    return 'Print dialog opened.';
  }
  if (Platform.OS === 'web') {
    const bytes = format === 'pdf' ? await createPdf(report) : await createExcel(report);
    download(bytes, format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${reportFilename(report)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    return `${format === 'pdf' ? 'PDF' : 'Excel'} download ready.`;
  }
  const Sharing = await import('expo-sharing');
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  let uri: string;
  if (format === 'pdf') {
    const Print = await import('expo-print');
    const result = await Print.printToFileAsync({ html: reportHtml(report), width: 842, height: 595 });
    const { File, Paths } = await import('expo-file-system');
    const cached = new File(Paths.cache, `${reportFilename(report)}.pdf`);
    if (cached.exists) cached.delete();
    new File(result.uri).copy(cached);
    uri = cached.uri;
  } else {
    const { File, Paths } = await import('expo-file-system');
    const file = new File(Paths.cache, `${reportFilename(report)}.xlsx`);
    file.write(await createExcel(report)); uri = file.uri;
  }
  await Sharing.shareAsync(uri, { mimeType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', UTI: format === 'pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: report.title });
  return 'Report is ready to save or share.';
}
