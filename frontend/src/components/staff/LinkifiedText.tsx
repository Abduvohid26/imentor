import React from 'react';

/**
 * Matn ichidagi tashqi havolalarni bosiladigan giperhavolaga aylantiradi.
 *
 * Keys yechimining oxiridagi "FOYDALANILGAN ADABIYOTLAR" ro'yxatida PubMed /
 * DOI / Semantic Scholar manzillari oddiy matn bo'lib turardi — o'qituvchi
 * ularni qo'lda nusxalashi kerak edi.
 */

// Havola oxiridagi tinish belgisi manzilga qo'shilib ketmasin: "(...)." holati.
const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

function trimTrailingPunctuation(url: string): { href: string; trailing: string } {
  const match = /[.,;:!?]+$/.exec(url);
  if (!match) return { href: url, trailing: '' };
  return { href: url.slice(0, match.index), trailing: match[0] };
}

export default function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of (text || '').matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    const { href, trailing } = trimTrailingPunctuation(match[0]);
    parts.push(
      <a
        key={`lnk_${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        /* Havola rangi butun tizimda bir xil ko'k (staffUi `staffSourceLink`). */
        className="font-semibold text-blue-700 underline underline-offset-2 break-all hover:text-blue-800"
      >
        {href}
      </a>,
    );
    if (trailing) parts.push(trailing);
    lastIndex = start + match[0].length;
  }
  if (lastIndex < (text || '').length) parts.push(text.slice(lastIndex));

  return <p className={className}>{parts}</p>;
}
