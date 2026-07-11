import { HttpError } from '../api/httpClient';

/**
 * Backend xato javobidan foydalanuvchiga ko'rsatiladigan matn ajratadi.
 * `{"detail": "..."}` yoki DRF field xatolari (`{"file": ["..."]}`) qo'llab-quvvatlanadi.
 */
export function backendErrorMessage(err: unknown): string {
  if (err instanceof HttpError && err.body && typeof err.body === 'object') {
    const body = err.body as Record<string, unknown>;
    if (typeof body.detail === 'string') return body.detail;
    for (const value of Object.values(body)) {
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    }
  }
  return '';
}
