import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom'da `Worker` yo'q, pdf.js esa modul import bo'lishi bilan worker
// yaratadi. Testlarda PDF render qilinmaydi — bo'sh stub yetarli, aks holda
// PDF ko'ruvchini import qiladigan har qanday komponent testi yiqiladi.
if (typeof globalThis.Worker === 'undefined') {
  class WorkerStub {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false;
    }
  }
  globalThis.Worker = WorkerStub as unknown as typeof Worker;
}

afterEach(() => {
  cleanup();
});
