/** Variant A — sokin klinika: bitta rang palitrasi, hodim sahifalari uchun */

export const STAFF_HEADING = 'text-[#083047]';
export const STAFF_BODY = 'text-black/55';
export const STAFF_MUTED = 'text-black/45';

export const staffCard =
  'ios-glass rounded-2xl border border-white/70 shadow-sm';
export const staffCardLg =
  'ios-glass rounded-[1.5rem] border border-white/70 shadow-sm';

export const staffBtnPrimary =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[14px] font-semibold hover:bg-blue-500 shadow-sm shadow-blue-600/20 disabled:opacity-50 transition-colors';

export const staffBtnSecondary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 bg-white/80 text-[#083047] text-[14px] font-semibold hover:bg-white disabled:opacity-50 transition-colors';

export const staffBtnGhost =
  'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-black/8 bg-white/60 text-[#083047] text-[13px] font-semibold hover:bg-white/90 disabled:opacity-50 transition-colors';

export const staffChip =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-semibold text-slate-700';

export const staffChipAccent =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#083047] text-[11px] font-bold text-white';

export const staffInput =
  'w-full px-4 py-2.5 rounded-xl border border-black/8 bg-white/60 text-[14px] text-[#083047] outline-none focus:ring-2 focus:ring-[#083047]/10 focus:border-[#083047]/20 focus:bg-white';

export const staffLabel =
  'text-[12px] font-semibold text-black/50';

export const staffEyebrow =
  'text-[11px] font-bold uppercase tracking-wide text-[#083047]/70';

/* ─────────────────────────────────────────────────────────────────────────
 * DARS MATERIALI TOKENLARI
 *
 * To'rt bo'lim (Ma'ruza, Taqdimot, Keys, Test) bir xil ko'rinishda bo'lishi
 * uchun material bloklari SHU yerdagi tokenlardan yig'iladi. Ilgari har
 * sahifa o'z ranglarini va o'lchamlarini yozardi (Test — oq `rounded-3xl`
 * kartochkalar, Keys — `ios-glass` panellar), natijada bo'limlar boshqa-boshqa
 * ilovadek ko'rinardi.
 *
 * Rang qoidasi:
 *   KO'K   — manba/adabiyot va tushuntirish (o'qituvchi ishonadigan ma'lumot)
 *   YASHIL — to'g'ri javob
 *   SARIQ  — faqat ogohlantirish (xato emas, lekin e'tibor talab qiladi)
 * ───────────────────────────────────────────────────────────────────────── */

/** Bo'lim ichidagi kichik sarlavha ("TO'G'RI JAVOB TAHLILI", "MANBALAR"). */
export const staffBlockTitle =
  'flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide';

/** Savol/keys raqami — dumaloq ko'k nishon. */
export const staffIndexBadge =
  'w-9 h-9 rounded-full bg-blue-600/10 text-blue-700 flex items-center justify-center font-bold text-[15px] shrink-0 tabular-nums';

/** Savol matni — kartochkadagi eng muhim satr, shuning uchun qalin va kattaroq. */
export const staffQuestionText =
  'text-[16px] sm:text-[17px] font-bold leading-relaxed text-[#083047]';

/** Javob variantlari. */
export const staffOptionCorrect =
  'p-3 rounded-xl border border-emerald-400 bg-emerald-50 text-emerald-900 font-semibold';
export const staffOptionNeutral =
  'p-3 rounded-xl border border-black/8 bg-white/70 text-[#083047]/85';

/** Tushuntirish/yechim bloki — KO'K. */
export const staffExplainBox =
  'rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 sm:p-5 space-y-3';
export const staffExplainTitle = `${staffBlockTitle} text-blue-800`;
export const staffExplainBody =
  'text-[14px] leading-relaxed text-blue-950/85 whitespace-pre-wrap';

/**
 * MANBALAR bloki — HAMISHA KO'K.
 * Ilgari sariq (amber) edi va ogohlantirishlar bilan bir xil rangda bo'lib,
 * o'qituvchi uni "diqqat" belgisi deb o'qirdi. Sariq endi faqat ogohlantirish.
 */
export const staffSourceBox = 'rounded-xl border border-blue-200/80 bg-blue-50/60';
export const staffSourceTitle = `${staffBlockTitle} text-blue-900`;
export const staffSourceItem = 'text-blue-950/85 leading-relaxed';
export const staffSourceLink =
  'font-bold text-blue-700 hover:text-blue-800 hover:underline underline-offset-2 inline-flex items-center gap-1 break-words';
export const staffSourceMeta = 'text-blue-900/60';

export const staffProse =
  // prose-lg ning standart h1 o'lchami uzun tibbiy sarlavhalarda ekranni to'sib
  // qo'yardi — h1 aniq o'lchamga bog'landi.
  // prose-lg ning standart h1 o'lchami uzun tibbiy sarlavhalarda ekranni to'sib
  // qo'yardi — h1 aniq o'lchamga bog'landi.
  //
  // Muhim qo'shimchalar (dars o'qish uchun):
  //  - `prose-strong` — AI qalin qilgan atama/ko'rsatkichlar haqiqatan ajralib
  //    tursin (rang + qalinlik), aks holda oddiy matndan farqi bilinmasdi;
  //  - `prose-a` KO'K — havola/manba butun tizimda bir xil rangda;
  //  - satr oralig'i va ro'yxat oralig'i kattaroq — proyektordan ham o'qiladi.
  'staff-prose prose prose-slate prose-base sm:prose-lg max-w-none text-[#083047] ' +
  'prose-headings:text-[#083047] prose-headings:font-bold ' +
  'prose-h1:text-[22px] sm:prose-h1:text-[26px] prose-h1:leading-snug prose-h1:mt-0 prose-h1:mb-5 ' +
  'prose-h2:text-[18px] sm:prose-h2:text-[20px] prose-h2:mt-8 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-black/5 ' +
  'prose-h3:text-[16px] sm:prose-h3:text-[17px] prose-h3:mt-6 prose-h3:mb-2 ' +
  'prose-p:leading-[1.75] prose-p:text-[#083047]/90 ' +
  'prose-strong:text-[#062435] prose-strong:font-bold ' +
  'prose-li:marker:text-blue-600/70 prose-li:my-1 prose-ul:my-4 prose-ol:my-4 ' +
  'prose-a:text-blue-700 prose-a:font-semibold prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-blue-800 ' +
  'prose-blockquote:border-l-blue-500/50 prose-blockquote:text-[#083047]/80 prose-blockquote:not-italic ' +
  'prose-table:text-[14px] prose-th:text-[#083047] prose-th:font-bold ' +
  'prose-code:text-[#083047] prose-code:bg-black/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none';
