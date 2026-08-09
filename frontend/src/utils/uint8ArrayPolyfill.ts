/**
 * `Uint8Array` uchun yangi standart metodlar polifili.
 *
 * pdf.js 5.x ichida `Uint8Array.prototype.toHex()`, `.toBase64()` va
 * `Uint8Array.fromBase64()` ishlatiladi — bular juda yangi (Chrome 140+,
 * Safari 18.2+). Eskiroq brauzerlarda PDF ochishga urinilganda pdf.js
 *     "hashOriginal.toHex is not a function"
 * xatosi bilan yiqilardi va o'qituvchi taqdimotni ko'ra olmasdi.
 *
 * Bu fayl yetishmayotgan metodlarnigina qo'shadi — brauzerda allaqachon
 * bo'lsa, hech nimaga tegmaydi.
 */

type Uint8ArrayCtorWithBase64 = typeof Uint8Array & {
  fromBase64?: (s: string) => Uint8Array;
  fromHex?: (s: string) => Uint8Array;
};

type Uint8ArrayProtoExtras = Uint8Array & {
  toHex?: () => string;
  toBase64?: (options?: { alphabet?: 'base64' | 'base64url' }) => string;
};

const HEX = '0123456789abcdef';

export function installUint8ArrayPolyfills(): void {
  const proto = Uint8Array.prototype as Uint8ArrayProtoExtras;
  const ctor = Uint8Array as Uint8ArrayCtorWithBase64;

  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toHex', {
      value: function toHex(this: Uint8Array): string {
        let s = '';
        for (let i = 0; i < this.length; i++) {
          const b = this[i];
          s += HEX[(b >> 4) & 0x0f] + HEX[b & 0x0f];
        }
        return s;
      },
      writable: true,
      configurable: true,
    });
  }

  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toBase64', {
      value: function toBase64(
        this: Uint8Array,
        options?: { alphabet?: 'base64' | 'base64url' },
      ): string {
        let bin = '';
        // Katta massivlarda stack oshib ketmasligi uchun bo'laklab yig'amiz.
        const CHUNK = 0x8000;
        for (let i = 0; i < this.length; i += CHUNK) {
          bin += String.fromCharCode(...this.subarray(i, i + CHUNK));
        }
        const b64 = btoa(bin);
        return options?.alphabet === 'base64url'
          ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          : b64;
      },
      writable: true,
      configurable: true,
    });
  }

  if (typeof ctor.fromBase64 !== 'function') {
    Object.defineProperty(Uint8Array, 'fromBase64', {
      value: function fromBase64(s: string): Uint8Array {
        const norm = s.replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(norm);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      },
      writable: true,
      configurable: true,
    });
  }

  if (typeof ctor.fromHex !== 'function') {
    Object.defineProperty(Uint8Array, 'fromHex', {
      value: function fromHex(s: string): Uint8Array {
        const clean = s.length % 2 ? '0' + s : s;
        const out = new Uint8Array(clean.length / 2);
        for (let i = 0; i < out.length; i++) {
          out[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        return out;
      },
      writable: true,
      configurable: true,
    });
  }
}
