export const SRI_LANKA_DISTRICTS = [
  'Ampara',
  'Anuradhapura',
  'Badulla',
  'Batticaloa',
  'Colombo',
  'Galle',
  'Gampaha',
  'Hambantota',
  'Jaffna',
  'Kalutara',
  'Kandy',
  'Kegalle',
  'Kilinochchi',
  'Kurunegala',
  'Mannar',
  'Matale',
  'Matara',
  'Monaragala',
  'Mullaitivu',
  'Nuwara Eliya',
  'Polonnaruwa',
  'Puttalam',
  'Ratnapura',
  'Trincomalee',
  'Vavuniya',
] as const;

export type District = (typeof SRI_LANKA_DISTRICTS)[number];

export function isValidDistrict(district: string): boolean {
  if (!district) return false;
  return SRI_LANKA_DISTRICTS.some(
    d => d.toLowerCase() === district.trim().toLowerCase()
  );
}

export function normalizeDistrict(district: string): District | null {
  if (!district) return null;
  const match = SRI_LANKA_DISTRICTS.find(
    d => d.toLowerCase() === district.trim().toLowerCase()
  );
  return match || null;
}

export function filterDistricts(query: string): District[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...SRI_LANKA_DISTRICTS];
  return SRI_LANKA_DISTRICTS.filter(d => d.toLowerCase().includes(q));
}
