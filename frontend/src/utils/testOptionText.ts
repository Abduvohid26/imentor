/**
 * Variant matnidan takroriy harf prefiksini olib tashlaydi.
 *
 * Interfeys variant harfini o'zi qo'yadi ("A) ..."), lekin AI ba'zan matn
 * ichiga ham yozadi — natijada "A) A. Papula" ko'rinadi. Rus tiliga
 * tarjimada prefiks kirilcha bo'lib qolishi ham mumkin ("А. Папула").
 */

/** Lotin va kirilcha ko'rinishdagi variant harflari (A/А, B/В/Б, C/С, D/Д, E/Е). */
const OPTION_LETTERS: string[][] = [
  ['A', 'А'],
  ['B', 'В', 'Б'],
  ['C', 'С'],
  ['D', 'Д'],
  ['E', 'Е'],
  ['F', 'Ф'],
];

/**
 * @param text  variant matni
 * @param index 0-based variant tartibi; berilsa faqat SHU harf prefiksi
 *              olib tashlanadi (mazmunli "A. Papula" nomlarini buzmaslik uchun).
 */
export function stripOptionLetterPrefix(text: string, index?: number): string {
  const raw = (text ?? '').trim();
  if (!raw) return raw;

  const letters =
    index != null
      ? OPTION_LETTERS[index] ?? []
      : OPTION_LETTERS.flat();
  if (letters.length === 0) return raw;

  const escaped = letters.join('|');
  // "A.", "A)", "A -", "A:" va shu kabilar — orqasidan bo'shliq bilan.
  const re = new RegExp(`^(?:${escaped})\\s*[.):\\-–—]\\s+`, 'i');
  const stripped = raw.replace(re, '').trim();
  // Butun matn faqat prefiksdan iborat bo'lsa, asl matnni qaytaramiz.
  return stripped || raw;
}
