import { XLSX_COLUMN_R_IMAGE_BY_NAME } from '@/data/xlsxColumnRImageMap.generated';

function normalizeName(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'")
    .trim();
}

const IMAGE_BY_NAME = {
  ...XLSX_COLUMN_R_IMAGE_BY_NAME,
};

export function getFallbackImageUrlByName(name) {
  const normalized = normalizeName(name);
  return IMAGE_BY_NAME[normalized] || null;
}

export function resolveMemberImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  // Keep full URLs untouched.
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) {
    return url;
  }

  // Project image fallbacks are stored as absolute paths (/family-images/...).
  // Convert them to a URL that respects Vite BASE_URL so they work on:
  // 1) localhost root (/)
  // 2) GitHub Pages subpaths (/repo-name/)
  // 3) file:// offline mode (./family-images/...)
  if (url.startsWith('/')) {
    const cleanPath = url.replace(/^\/+/, '');
    const baseUrl =
      typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
        ? String(import.meta.env.BASE_URL)
        : '/';

    if (baseUrl === './' || baseUrl === '.') {
      return `./${cleanPath}`;
    }

    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${normalizedBase}${cleanPath}`;
  }

  return url;
}

export function applyMemberImageFallbacks(members) {
  if (!Array.isArray(members)) return [];

  return members.map((member) => {
    if (!member || typeof member !== 'object') return member;
    const hasImage = String(member.image_url || '').trim().length > 0;
    if (hasImage) return member;

    const fallbackImageUrl = getFallbackImageUrlByName(member.name);
    if (!fallbackImageUrl) return member;
    return { ...member, image_url: fallbackImageUrl };
  });
}
