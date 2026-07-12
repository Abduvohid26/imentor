import { HttpError } from '../api/httpClient';

/** API / AI xatolaridan foydalanuvchiga ko‘rinadigan qisqa matn. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpError) {
    const body = err.body;
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) return detail.trim();
    }
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
