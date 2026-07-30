/**
 * AI yozgan "manba" matnini tozalash.
 *
 * Muammo: darslik konteksti berilganda modeldan gap oxiriga
 * "(Manba: {kitob nomi}, {sahifa}-bet)" qo'shish so'ralardi. Model ko'pincha
 * shablonni TO'LDIRMASDAN, aynan shu ko'rinishda yozib yuborardi — talaba
 * natijada foydasiz matn ko'rardi.
 *
 * Haqiqiy manba endi strukturali `references` orqali keladi: server RAG uchun
 * qaysi darslikning qaysi betlarini modelga berganini aniq biladi, shuning
 * uchun uni AI'dan so'rash umuman shart emas.
 */
const UNFILLED_SOURCE_RE =
  /\s*\((?:Manba|Источник|Source)\s*:\s*(?:kitob nomi|nomi|\{[^)]*\}|название книги|book name)[^)]*\)/gi;

/** To'ldirilmagan manba shablonini olib tashlaydi; haqiqiy manbani saqlaydi. */
export function stripUnfilledSourceTemplate(text: string): string {
  return (text || '')
    .replace(UNFILLED_SOURCE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}
