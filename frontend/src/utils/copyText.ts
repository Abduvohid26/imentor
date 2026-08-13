/**
 * Matnni buferga nusxalash.
 *
 * `navigator.clipboard` faqat xavfsiz kontekstda (HTTPS yoki localhost)
 * mavjud. Klinika tarmog'idagi oddiy `http://` manzilda u `undefined` bo'ladi
 * va nusxalash indamay ishlamay qo'yardi — foydalanuvchi tugmani bosardi,
 * hech narsa bo'lmasdi. Shu sababli eski `execCommand('copy')` zaxirasi bor.
 *
 * Qaytaradi: nusxalash bajarildimi.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* zaxira usulga o'tamiz */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Ekrandan tashqarida, lekin fokuslanadigan holatda bo'lishi kerak.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
