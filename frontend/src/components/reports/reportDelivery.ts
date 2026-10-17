import { Platform } from 'react-native';
import { ExportFormat, ReportDocument, reportFilename, reportHtml } from './reportDocument';

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
  if (format === 'print' || (format === 'pdf' && Platform.OS === 'web')) {
    if (Platform.OS === 'web') {
      await printWeb(reportHtml(report));
      return format === 'print' ? 'Print dialog opened.' : 'Print to PDF dialog opened.';
    }
  }

  if (format === 'pdf') {
    const Print = await import('expo-print');
    const result = await Print.printToFileAsync({ html: reportHtml(report), width: 842, height: 595 });
    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: report.title });
      return 'PDF report ready.';
    }
    return 'PDF generated.';
  }

  // Excel / CSV export:
  const csvLines: string[] = [report.title, `Exported: ${report.exportedAt}`, ''];
  report.sections.forEach((s) => {
    csvLines.push(s.title);
    csvLines.push(s.headers.join(','));
    s.rows.forEach((r) => csvLines.push(r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')));
    csvLines.push('');
  });
  const csvContent = csvLines.join('\n');

  if (Platform.OS === 'web') {
    downloadCsv(csvContent, `${reportFilename(report)}.csv`);
    return 'Report download ready.';
  }

  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, `${reportFilename(report)}.csv`);
  file.write(csvContent);
  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: report.title });
  }
  return 'Report is ready to save or share.';
}

export async function deliverServerExport({
  reportType,
  format,
  queryParams,
  token,
}: {
  reportType: string;
  format: 'pdf' | 'xlsx' | 'csv' | 'zip';
  queryParams: Record<string, string>;
  token?: string;
}): Promise<string> {
  const { getApiUrl } = await import('../../lib/apiUrl');
  const baseUrl = getApiUrl();
  const searchParams = new URLSearchParams({
    report_type: reportType,
    format,
    ...queryParams,
  });

  let authToken = token;
  if (!authToken) {
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase.auth.getSession();
      authToken = data.session?.access_token;
    } catch {
      // Ignore if session unavailable
    }
  }

  const url = `${baseUrl}/reports/export?${searchParams.toString()}`;
  const response = await fetch(url, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });

  if (!response.ok) {
    let errorDetail = 'Report export failed';
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errorDetail;
    } catch {
      errorDetail = `Server returned status ${response.status}`;
    }
    throw new Error(errorDetail);
  }

  const blob = await response.blob();
  const dateStr = new Date().toISOString().split('T')[0];
  const ext = format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : format === 'zip' ? 'zip' : 'pdf';
  const filename = `ConstructFlow_${reportType}_${dateStr}.${ext}`;

  if (Platform.OS === 'web') {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return `${format.toUpperCase()} report downloaded successfully.`;
  }

  // Native (Expo Go / iOS / Android)
  const Sharing = await import('expo-sharing');
  if (!await Sharing.isAvailableAsync()) {
    throw new Error('File sharing is unavailable on this device.');
  }

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.write(bytes);

  const mimeMap = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    zip: 'application/zip',
  };

  await Sharing.shareAsync(file.uri, {
    mimeType: mimeMap[format],
    dialogTitle: `Export ${reportType} report`,
  });

  return `${format.toUpperCase()} report is ready to share.`;
}
