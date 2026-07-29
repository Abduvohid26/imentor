import { HttpError } from '../api/httpClient';

/** API / AI xatolaridan foydalanuvchiga ko‘rinadigan qisqa matn. */
function formatDrfBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail.trim();
  if (Array.isArray(obj.detail)) {
    const parts = obj.detail.map((x) => String(x)).filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  const fieldMsgs: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'detail') continue;
    if (typeof val === 'string' && val.trim()) fieldMsgs.push(`${key}: ${val.trim()}`);
    else if (Array.isArray(val)) {
      const joined = val.map((x) => String(x)).filter(Boolean).join(' ');
      if (joined) fieldMsgs.push(`${key}: ${joined}`);
    }
  }
  return fieldMsgs.length ? fieldMsgs.join(' ') : null;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpError) {
    const fromBody = formatDrfBody(err.body);
    if (fromBody) return fromBody;
    if (err.status === 503) {
      return 'OpenAI kaliti serverda sozlanmagan. Administrator bilan bog\'laning.';
    }
    if (err.status === 504) {
      return 'AI javob berish vaqti tugadi. Biroz kutib qayta urinib ko\'ring.';
    }
    if (err.status === 502) {
      return 'AI xizmati vaqtincha ishlamayapti. Celery worker va OPENAI kalitini tekshiring.';
    }
    if (err.message?.trim()) return err.message.trim();
  }
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg === 'no-backend-token') return 'Tizimga qayta kiring.';
    if (msg) return msg;
  }
  return fallback;
}
