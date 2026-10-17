/**
 * Project and Role Image Assets & Resolvers
 * Provides high-resolution curated architectural/construction images and fallback resolvers.
 */

export interface ProjectImagePreset {
  id: string;
  title: string;
  category: 'Residential' | 'Commercial' | 'Infrastructure' | 'Institutional' | 'Industrial';
  url: string;
}

export const PROJECT_IMAGE_PRESETS: ProjectImagePreset[] = [
  {
    id: 'villa-luxury',
    title: 'Luxury Villa Contemporary',
    category: 'Residential',
    url: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'residence-modern',
    title: 'Modern Architectural Residence',
    category: 'Residential',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'villa-tropical',
    title: 'Tropical Estate & Villa',
    category: 'Residential',
    url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'villa-hillside',
    title: 'Hillside Modernist Villa',
    category: 'Residential',
    url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'commercial-tower',
    title: 'Commercial High-Rise Tower',
    category: 'Commercial',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'commercial-plaza',
    title: 'Metropolitan Commercial Plaza',
    category: 'Commercial',
    url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'commercial-complex',
    title: 'Modern Retail & Office Complex',
    category: 'Commercial',
    url: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'tower-landmark',
    title: 'Landmark Tower & Observation',
    category: 'Infrastructure',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'urban-center',
    title: 'Urban City Center Project',
    category: 'Infrastructure',
    url: 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'hospitality-resort',
    title: 'Luxury Hotel & Resort',
    category: 'Commercial',
    url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'institutional-campus',
    title: 'Educational Campus & Academy',
    category: 'Institutional',
    url: 'https://images.unsplash.com/photo-1562774053-701939374585?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 'construction-active',
    title: 'Active Structural Engineering',
    category: 'Industrial',
    url: 'https://images.unsplash.com/photo-1541888946425-d0fbb1861593?w=800&auto=format&fit=crop&q=80',
  },
];

/**
 * Returns a high-definition photo for any project.
 * If project.image_url is already present, it is used directly.
 * Otherwise, resolves deterministically by project name keywords or project ID.
 */
export function getProjectImageUrl(project?: {
  id?: string | null;
  name?: string | null;
  image_url?: string | null;
  images?: any;
} | null): string {
  if (project?.image_url && project.image_url.trim().length > 0) {
    return project.image_url;
  }
  if (Array.isArray(project?.images) && project.images.length > 0 && typeof project.images[0] === 'string' && project.images[0].trim().length > 0) {
    return project.images[0];
  }

  const name = (project?.name || '').toLowerCase();

  // Name keyword mapping
  if (name.includes('lotus tower')) {
    return 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80';
  }
  if (name.includes('galle city center') || name.includes('city center')) {
    return 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?w=800&auto=format&fit=crop&q=80';
  }
  if (name.includes('enrich arcane')) {
    return 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&auto=format&fit=crop&q=80';
  }
  if (name.includes('moon plains')) {
    return 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80';
  }
  if (name.includes('hotel') || name.includes('srangila') || name.includes('resort')) {
    return 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80';
  }
  if (name.includes('college') || name.includes('kdu') || name.includes('ati') || name.includes('school')) {
    return 'https://images.unsplash.com/photo-1562774053-701939374585?w=800&auto=format&fit=crop&q=80';
  }

  // Luxury Villas by location
  if (name.includes('villa') || name.includes('house') || name.includes('residential')) {
    if (name.includes('kurunegala')) {
      return 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('colombo')) {
      return 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('gampaha')) {
      return 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('galle')) {
      return 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('negombo')) {
      return 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('kandy')) {
      return 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('nugegoda')) {
      return 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('hambantota')) {
      return 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80';
    }
    return 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&auto=format&fit=crop&q=80';
  }

  // Commercial complexes
  if (name.includes('commercial') || name.includes('complex') || name.includes('plaza') || name.includes('mall')) {
    if (name.includes('colombo')) {
      return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('negombo')) {
      return 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('galle')) {
      return 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('gampaha')) {
      return 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80';
    }
    if (name.includes('kandy')) {
      return 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&auto=format&fit=crop&q=80';
    }
    return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80';
  }

  // Deterministic fallback based on id or name string code
  const hashSource = project?.id || project?.name || 'constructflow';
  let charSum = 0;
  for (let i = 0; i < hashSource.length; i++) {
    charSum += hashSource.charCodeAt(i);
  }
  const presetIndex = charSum % PROJECT_IMAGE_PRESETS.length;
  return PROJECT_IMAGE_PRESETS[presetIndex].url;
}

/**
 * Returns a high-definition role avatar photo.
 */
export const DEFAULT_ROLE_AVATARS: Record<string, string> = {
  admin: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
  super_admin: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
  pm: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80',
  site_manager: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&auto=format&fit=crop&q=80',
  worker: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=400&auto=format&fit=crop&q=80',
  client: 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=400&auto=format&fit=crop&q=80',
  supplier: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=400&auto=format&fit=crop&q=80',
};

export function getRoleAvatarUrl(
  role?: string | null,
  avatarUrl?: string | null,
  fallbackName?: string | null
): string {
  if (avatarUrl && avatarUrl.trim().length > 0) {
    return avatarUrl;
  }
  const normalizedRole = (role || 'worker').toLowerCase().replace(' ', '_');
  if (normalizedRole.includes('admin')) return DEFAULT_ROLE_AVATARS.admin;
  if (normalizedRole.includes('pm') || normalizedRole.includes('project')) return DEFAULT_ROLE_AVATARS.pm;
  if (normalizedRole.includes('site')) return DEFAULT_ROLE_AVATARS.site_manager;
  if (normalizedRole.includes('client')) return DEFAULT_ROLE_AVATARS.client;
  if (normalizedRole.includes('suppl')) return DEFAULT_ROLE_AVATARS.supplier;
  return DEFAULT_ROLE_AVATARS.worker;
}
