/**
 * Yon-ta'sirli import: shu faylni import qilishning o'zi polifillarni
 * o'rnatadi. ES modullar import tartibida baholanadi, shuning uchun buni
 * pdf.js'dan OLDIN import qilish yetarli (top-level `await` kerak emas —
 * u build'da klassik worker uchun muammo tug'dirishi mumkin edi).
 */
import { installUint8ArrayPolyfills } from './uint8ArrayPolyfill';

installUint8ArrayPolyfills();
