import { describe, expect, it } from 'vitest';

import { stripUnfilledSourceTemplate } from '../utils/sourceTemplate';

/**
 * AI ba'zan manba shablonini TO'LDIRMASDAN qoldiradi — natijada talaba
 * izohda "(Manba: kitob nomi, sahifa-bet)" degan foydasiz matnni ko'radi.
 * Haqiqiy manba endi strukturali `references` orqali keladi (server RAG
 * uchun qaysi darslikni ishlatganini aniq biladi), shu sabab shablon
 * qoldiqlari matndan olib tashlanadi.
 */
describe('stripUnfilledSourceTemplate', () => {
  it("to'ldirilmagan o'zbekcha shablonni olib tashlaydi", () => {
    expect(
      stripUnfilledSourceTemplate(
        'Pyridoxine birinchi qator vosita hisoblanadi (Manba: kitob nomi, sahifa-bet).',
      ),
    ).toBe('Pyridoxine birinchi qator vosita hisoblanadi.');
  });

  it("qavs ichidagi shablon o'zgaruvchilarini ham tanidi", () => {
    expect(
      stripUnfilledSourceTemplate('Bosim ortadi (Manba: {kitob nomi}, {sahifa}-bet).'),
    ).toBe('Bosim ortadi.');
  });

  it('rus va ingliz shablonlarini ham olib tashlaydi', () => {
    expect(stripUnfilledSourceTemplate('Текст (Источник: название книги, стр).')).toBe('Текст.');
    expect(stripUnfilledSourceTemplate('Text (Source: book name, page).')).toBe('Text.');
  });

  it("HAQIQIY manbani saqlab qoladi", () => {
    const real = 'Bosim ortadi (Manba: Guyton, 114-bet).';
    expect(stripUnfilledSourceTemplate(real)).toBe(real);
  });

  it("bir nechta shablonni va ortiqcha bo'shliqni tozalaydi", () => {
    expect(
      stripUnfilledSourceTemplate(
        'Birinchi (Manba: kitob nomi, sahifa-bet). Ikkinchi (Manba: kitob nomi, sahifa-bet).',
      ),
    ).toBe('Birinchi. Ikkinchi.');
  });

  it("bo'sh va noto'g'ri kirishda yiqilmaydi", () => {
    expect(stripUnfilledSourceTemplate('')).toBe('');
    expect(stripUnfilledSourceTemplate(undefined as unknown as string)).toBe('');
  });
});
