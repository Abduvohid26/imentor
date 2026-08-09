/**
 * pdf.js worker uchun kirish nuqtasi.
 *
 * Worker ichida `Uint8Array.prototype.toHex()` ishlatiladi (PDF barmoq izini
 * hisoblashda). Eskiroq brauzerlarda bu metod yo'q va worker
 *     "hashOriginal.toHex is not a function"
 * xatosi bilan yiqilardi — natijada o'qituvchi taqdimotni ko'ra olmasdi.
 *
 * Import tartibi muhim: polifil MODULI pdf.js worker'idan oldin turadi,
 * shuning uchun u avval baholanadi va metodlar o'rnatiladi.
 */
import './uint8ArrayPolyfill.install';
import 'pdfjs-dist/build/pdf.worker.mjs';
