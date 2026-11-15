import { Platform, Linking } from 'react-native';
import { getApiUrl } from '../lib/apiUrl';
import { getFreshAccessToken } from '../services/api';
import { toast } from '../lib/toast';

export type BoqTemplateKind = 'blank' | 'sample';

/**
 * Download a BOQ Excel template (.xlsx) from the backend.
 * - `blank`: headers-only workbook (`ConstructFlow_Blank_BOQ_Template.xlsx`)
 * - `sample`: populated sample workbook (`ConstructAI_BOQ_Template.xlsx`)
 */
export async function downloadBoqTemplateXlsx(kind: BoqTemplateKind): Promise<boolean> {
  const filename =
    kind === 'sample'
      ? 'ConstructAI_BOQ_Template.xlsx'
      : 'ConstructFlow_Blank_BOQ_Template.xlsx';

  const url = `${getApiUrl()}/projects/boq-template?format=xlsx&kind=${kind}`;

  try {
    const token = await getFreshAccessToken().catch(() => undefined);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Download failed (${res.status})`);
      }

      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      toast.success(`Downloaded ${filename}`);
      return true;
    }

    await Linking.openURL(url);
    return true;
  } catch (err: any) {
    // Fallback to direct anchor link download on web if fetch encountered a CORS/network blocker
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } catch {
        // ignore fallback error
      }
    }
    toast.error(err?.message || `Failed to download ${filename}`);
    return false;
  }
}
