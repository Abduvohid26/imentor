import { describe, expect, it } from 'vitest';
import { inferDirectionCode, matchDirectionCode, resolveSyllabusDirection } from './directionCode';

const ALLOWED = ['DI', 'TPI', 'PI', 'OHI', 'S', 'FT'];

describe('inferDirectionCode', () => {
  it('reads trailing parentheses', () => {
    expect(inferDirectionCode('Akusherlik va ginekologiya. Pediatriya (TPI).xlsx', ALLOWED)).toBe('TPI');
  });

  it('does not treat PI inside TPI as PI', () => {
    expect(inferDirectionCode('Gigiyena 7-s TPI.xlsx', ALLOWED)).toBe('TPI');
  });

  it('reads DI from filename', () => {
    expect(inferDirectionCode('Oftalmologiya DI 10-s.xlsx', ALLOWED)).toBe('DI');
  });

  it('returns empty when unknown', () => {
    expect(inferDirectionCode('Anatomiya.xlsx', ALLOWED)).toBe('');
  });
});

describe('resolveSyllabusDirection', () => {
  it('prefers saved code', () => {
    expect(
      resolveSyllabusDirection(
        { direction_code: 'PI', subject_name: 'Fan (TPI)', file_name: 'x.pdf' },
        ALLOWED,
      ),
    ).toBe('PI');
  });

  it('falls back to subject name', () => {
    expect(
      resolveSyllabusDirection(
        { direction_code: '', subject_name: 'Fan (OHI)', file_name: '' },
        ALLOWED,
      ),
    ).toBe('OHI');
  });
});

describe('matchDirectionCode', () => {
  it('is case-insensitive', () => {
    expect(matchDirectionCode('tpi', ALLOWED)).toBe('TPI');
  });
});
