import { describe, expect, it } from 'vitest';

import { looksLetterTracked, undoLetterTracking } from './letterTracking';

/**
 * `undoLetterTracking` ATAYLAB probellarni normallashtirmaydi — u faqat
 * ajralgan harflarni yopishtiradi va matnning qolgan qismiga tegmaydi.
 * Ko'p probellarni bitta qilish keyinroq parserda bo'ladi
 * (`syllabusTopicParse.ts`), shuning uchun testlar yakuniy — parserdan
 * chiqadigan — ko'rinishni tekshiradi.
 */
const asParsed = (s: string) => undoLetterTracking(s).replace(/\s+/g, ' ').trim();

describe('undoLetterTracking', () => {
  it('restores letter-spaced words while keeping word boundaries', () => {
    // Haqiqiy PDF'dan olingan namuna: harflar orasida 1 probel, so'zlar
    // orasida 3 probel (pdf.js `" "` elementi + join separatorlari).
    const raw = 'F i z i o l o g i y a   f a n i n i n g   a s o s i y   t u s h u n c h a l a r i .';
    expect(asParsed(raw)).toBe('Fiziologiya fanining asosiy tushunchalari.');
  });

  it('handles Uzbek apostrophes inside a tracked run', () => {
    const raw = "Q o 'z g 'a l u v c h a n   t o 'q i m a l a r";
    expect(asParsed(raw)).toBe("Qo'zg'aluvchan to'qimalar");
  });

  it('repairs a run whose fragments are a mix of 1-3 chars', () => {
    const raw = 'N a f a s o lg a n d a g i, c h iq a r g a n d a g i';
    expect(asParsed(raw)).toBe('Nafasolgandagi, chiqargandagi');
  });

  it('does not glue healthy words next to a tracked run', () => {
    const raw = 'tibbiyot xodimi tayyorlash. b o s q i c h l a r i , t o n l a r i';
    expect(asParsed(raw)).toBe('tibbiyot xodimi tayyorlash. bosqichlari, tonlari');
  });

  it('works line by line', () => {
    const raw = ['M 1', 'N a f a s   o l i s h', 'Oddiy qator'].join('\n');
    expect(undoLetterTracking(raw)).toBe(['M 1', 'Nafas   olish', 'Oddiy qator'].join('\n'));
  });
});

describe('undoLetterTracking — noto\'g\'ri ishga tushmasligi', () => {
  it('leaves normal text untouched', () => {
    const normal = 'Yurak mushagining fiziologik xossalari. Qon aylanishi.';
    expect(undoLetterTracking(normal)).toBe(normal);
  });

  it('keeps sequences of genuine short words intact', () => {
    const normal = 'qon va sut uch xil';
    expect(undoLetterTracking(normal)).toBe(normal);
  });

  it('does not glue short real words such as roman numerals', () => {
    const normal = 'I bob va II bob uchun reja';
    expect(undoLetterTracking(normal)).toBe(normal);
  });

  it('leaves grading-table rows alone (mostly digits and punctuation)', () => {
    const raw = '5 -5 9 E " o ‘rta " - davlat standartlari';
    expect(undoLetterTracking(raw)).toBe(raw);
  });

  it('preserves column whitespace in otherwise healthy titles', () => {
    const raw = "Ampermetrning ishlash prinsipini o'rganish.        18";
    expect(undoLetterTracking(raw)).toBe(raw);
  });
});

describe('looksLetterTracked', () => {
  it('detects damaged titles', () => {
    expect(looksLetterTracked('b o s q i c h l a r i , t o n l a r i')).toBe(true);
  });

  it('accepts healthy titles', () => {
    expect(looksLetterTracked('Nafas olish tizimi fiziologiyasi')).toBe(false);
  });
});
