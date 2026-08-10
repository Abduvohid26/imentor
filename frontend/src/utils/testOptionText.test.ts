import { describe, expect, it } from 'vitest';
import { stripOptionLetterPrefix } from './testOptionText';

describe('stripOptionLetterPrefix', () => {
  it('lotin harf prefiksini olib tashlaydi', () => {
    expect(stripOptionLetterPrefix('A. Papula', 0)).toBe('Papula');
    expect(stripOptionLetterPrefix('B) Vezikula', 1)).toBe('Vezikula');
  });

  it('kirilcha prefiksni ham olib tashlaydi', () => {
    expect(stripOptionLetterPrefix('А. Папула', 0)).toBe('Папула');
    expect(stripOptionLetterPrefix('В. Везикула', 1)).toBe('Везикула');
  });

  it('boshqa harf prefiksiga tegmaydi', () => {
    // 2-variant "C" bo'lishi kerak — "A." bu yerda mazmunning bir qismi.
    expect(stripOptionLetterPrefix('A. Papula', 2)).toBe('A. Papula');
  });

  it('prefiksi yo\'q matnni o\'zgartirmaydi', () => {
    expect(stripOptionLetterPrefix('Papula', 0)).toBe('Papula');
    expect(stripOptionLetterPrefix('ABO tizimi', 0)).toBe('ABO tizimi');
  });

  it('bo\'sh qiymatlarga chidamli', () => {
    expect(stripOptionLetterPrefix('', 0)).toBe('');
    expect(stripOptionLetterPrefix('A.', 0)).toBe('A.');
  });
});
