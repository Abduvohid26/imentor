/**
 * Sillabus PDF'laridagi "harflar ajralib ketgan" matnni tiklash.
 *
 * Ba'zi PDF'lar (skanerdan OCR qilingan yoki harf oralig'i kengaytirilgan
 * holda saqlangan) matn qatlamida har bir harfni alohida probel bilan
 * yozadi:
 *
 *     "F i z i o l o g i y a   f a n i n i n g"
 *
 * Muhimi: so'zlar orasidagi tanaffus PDF'da KENGROQ bo'ladi va matn
 * qatlamiga 2+ probel bo'lib tushadi, harflar orasidagi tanaffus esa —
 * bitta probel. Shuning uchun probellarni `\s+ -> ' '` bilan siqishdan
 * OLDIN shu farqdan foydalanib asl matnni tiklash mumkin:
 *
 *     "Fiziologiya fanining"
 *
 * Parser matnni normallashtirgandan keyin bu ma'lumot yo'qoladi, shuning
 * uchun bu funksiya hujjatdan matn olingan zahoti chaqirilishi kerak.
 *
 * Backend'dagi ekvivalenti: `app/services/topic_text_repair.py`
 * (bazaga allaqachon tushib bo'lgan yozuvlarni tiklash uchun).
 */

/**
 * Kamida 5 ta 1-3 belgili bo'lak, BITTA probel bilan ajratilgan.
 * So'z chegarasi (2+ probel) bu naqshni uzadi — demak yopishtirish faqat
 * haqiqiy "ajralgan harflar" ketma-ketligi ustida bajariladi.
 */
const TRACKED_RUN = /(?<!\S)((?:\S{1,3} ){4,}\S{1,3})(?!\S)/g;

function shouldGlue(run: string): boolean {
  const tokens = run.split(' ');
  const singles = tokens.filter((t) => t.length === 1).length;
  if (singles < tokens.length * 0.4) return false;
  // Ketma-ketlik asosan HARFLARDAN iborat bo'lishi shart. Bu shart
  // baholash jadvallaridagi qatorlarni ("5 -5 9 E" -> "5-59E") va
  // formula/raqam bloklarini chetlab o'tadi — ular mavzu nomi emas.
  const chars = [...run].filter((ch) => ch.trim() !== '');
  const letters = chars.filter((ch) => /\p{L}/u.test(ch)).length;
  return chars.length > 0 && letters / chars.length >= 0.6;
}

/**
 * Harf-harf ajralib ketgan matnni tiklaydi.
 *
 * Faqat mos keladigan ketma-ketliklar almashtiriladi — matnning qolgan
 * qismiga va probellariga tegilmaydi, shuning uchun normal matn
 * o'zgarishsiz qaytadi.
 */
export function undoLetterTracking(text: string): string {
  if (!text) return text;
  return text.replace(TRACKED_RUN, (run) => {
    if (!shouldGlue(run)) return run;
    // Tinish belgisidan keyin so'z chegarasi tiklanadi — harflar
    // yopishtirilgandan keyingi yagona ishonchli signal shu.
    return run.replace(/ /g, '').replace(/([,.;:!?])(?=[^\s,.;:!?])/g, '$1 ');
  });
}

/**
 * Matn (yoki sarlavha) hali ham harf-harf ajralgan holatdami?
 * Tiklashdan keyin qolgan buzuq yozuvlarni aniqlash uchun ishlatiladi.
 */
export function looksLetterTracked(text: string): boolean {
  const tokens = (text || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 6) return false;
  const singles = tokens.filter((t) => t.length === 1).length;
  return singles / tokens.length >= 0.5;
}
