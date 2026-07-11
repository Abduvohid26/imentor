import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';

let workerReady = false;

/** pdf.js worker — Vite orqali .js chunk; nginx .mjs MIME muammosidan qochadi */
export function ensurePdfjsWorker(): void {
  if (workerReady || typeof window === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
  workerReady = true;
}

ensurePdfjsWorker();

export { pdfjsLib };
