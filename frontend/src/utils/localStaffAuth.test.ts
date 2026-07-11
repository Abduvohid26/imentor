import { describe, expect, it } from 'vitest';

import { isValidPhoneDigits, normalizePhoneDigits } from './localStaffAuth';

describe('localStaffAuth phone helpers', () => {
  it('normalizes uzbek phone digits', () => {
    expect(normalizePhoneDigits('+998 90 111 22 33')).toBe('998901112233');
    expect(normalizePhoneDigits('998901112233')).toBe('998901112233');
  });

  it('validates phone length', () => {
    expect(isValidPhoneDigits('998901112233')).toBe(true);
    expect(isValidPhoneDigits('12345')).toBe(false);
  });
});
