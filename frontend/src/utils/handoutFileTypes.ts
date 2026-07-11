/** Tarqatma materiallar: PDF va keng tarqalgan rasm formatlari */

export const HANDOUT_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.svg',
  '.heic',
  '.heif',
] as const;

export const HANDOUT_PDF_EXTENSIONS = ['.pdf'] as const;

export const HANDOUT_ALLOWED_EXTENSIONS = [
  ...HANDOUT_PDF_EXTENSIONS,
  ...HANDOUT_IMAGE_EXTENSIONS,
] as const;

/** `<input accept>` — brauzer fayl tanlovini filtrlash */
export const HANDOUT_FILE_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.svg,.heic,.heif,' +
  'application/pdf,image/*';

const BLOCKED_MIME = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-msdownload',
  'text/html',
  'application/javascript',
]);

function fileExtension(name: string): string {
  const lower = name.toLowerCase().trim();
  const dot = lower.lastIndexOf('.');
  if (dot < 1) return '';
  return lower.slice(dot);
}

export function isAllowedHandoutFile(file: File): boolean {
  const ext = fileExtension(file.name);
  if (!HANDOUT_ALLOWED_EXTENSIONS.includes(ext as (typeof HANDOUT_ALLOWED_EXTENSIONS)[number])) {
    return false;
  }
  const mime = (file.type || '').toLowerCase().split(';')[0].trim();
  if (!mime || mime === 'application/octet-stream') return true;
  if (BLOCKED_MIME.has(mime)) return false;
  if (ext === '.pdf') return mime === 'application/pdf';
  if (mime === 'application/pdf') return false;
  return mime.startsWith('image/');
}

export function handoutFileTypeLabel(): string {
  return 'PDF, JPG, PNG, WEBP, GIF va boshqa rasmlar';
}
