export function siteCoordinates(text: string) {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 5.8 && lat <= 10 && lng >= 79.5 && lng <= 82.1 ? { lat, lng } : null;
}

export function broadLocation(row: { precision?: string; result_type?: string }) {
  return ['area', 'street'].includes(row.precision || '') || ['city','state','country','county','postcode','district','suburb','locality','street'].includes(row.result_type || '');
}

export function googleMapsSearchUrl(text: string) {
  const query = Array.from(text.trim()).slice(0, 120).join('');
  const located = /sri\s+lanka/i.test(query) ? query : `${query}, Sri Lanka`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(located)}`;
}
