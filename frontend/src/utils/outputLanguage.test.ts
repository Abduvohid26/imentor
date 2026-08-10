import { describe, expect, it } from 'vitest';
import { looksLikeUzbekText, outputLanguageLooksWrong } from './outputLanguage';

const UZ_CYRILLIC =
  'Беморнинг исми Лайло, 28 ёшда, аёл. У маркетинг бўйича мутахассис бўлиб, катта ' +
  'компанияда ишлайди. Лайло клиникага терисидаги ўзгаришлар билан мурожаат қилди.';
const REAL_RUSSIAN =
  'Пациентка Лайло, 28 лет, обратилась в клинику с жалобами на сухость кожи и зуд. ' +
  'Работает специалистом по маркетингу в крупной компании, семейный анамнез не отягощён.';
const UZ_LATIN =
  'Bemor Laylo, 28 yoshli ayol, terisidagi o\'zgarishlar bilan murojaat qildi. ' +
  'Ushbu holatda qaysi birlamchi morfologik element aniqlanadi deb hisoblanadi?';

describe('looksLikeUzbekText', () => {
  it('kirilda yozilgan o\'zbek matnini taniydi', () => {
    expect(looksLikeUzbekText(UZ_CYRILLIC)).toBe(true);
  });

  it('lotin o\'zbek matnini taniydi', () => {
    expect(looksLikeUzbekText(UZ_LATIN)).toBe(true);
  });

  it('haqiqiy rus matnini o\'zbek deb belgilamaydi', () => {
    expect(looksLikeUzbekText(REAL_RUSSIAN)).toBe(false);
  });
});

describe('outputLanguageLooksWrong', () => {
  it('ru so\'ralganda kirilcha o\'zbekni rad etadi', () => {
    expect(outputLanguageLooksWrong(UZ_CYRILLIC, 'ru')).toBe(true);
  });

  it('ru so\'ralganda haqiqiy rus matnini qabul qiladi', () => {
    expect(outputLanguageLooksWrong(REAL_RUSSIAN, 'ru')).toBe(false);
  });

  it('ru so\'ralganda lotin matnini rad etadi', () => {
    expect(outputLanguageLooksWrong(UZ_LATIN, 'ru')).toBe(true);
  });

  it('uz so\'ralganda lotin matnini qabul, kirilni rad etadi', () => {
    expect(outputLanguageLooksWrong(UZ_LATIN, 'uz')).toBe(false);
    expect(outputLanguageLooksWrong(UZ_CYRILLIC, 'uz')).toBe(true);
  });

  it('en so\'ralganda kiril matnini rad etadi', () => {
    expect(outputLanguageLooksWrong(REAL_RUSSIAN, 'en')).toBe(true);
    expect(
      outputLanguageLooksWrong(
        'A 28-year-old female patient presented to the clinic with dry skin and itching.',
        'en',
      ),
    ).toBe(false);
  });

  it('juda qisqa matnni tekshirmaydi', () => {
    expect(outputLanguageLooksWrong('Ok', 'ru')).toBe(false);
  });
});
