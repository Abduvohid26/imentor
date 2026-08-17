import React, { useMemo } from 'react';
import { AlertTriangle, Stethoscope } from 'lucide-react';
import type { CaseAnswerSectionKey } from '../../utils/parseCaseAnswer';
import { parseCaseAnswer } from '../../utils/parseCaseAnswer';
import LinkifiedText from './LinkifiedText';

type Props = {
  text: string;
  /** Manba ro'yxati id prefix — [5] scroll target. */
  refAnchorPrefix?: string;
  /** Matndagi [n] → tashqi manba URL (PubMed, Wikipedia, …). */
  citeUrls?: Record<number, string>;
  className?: string;
};

const SECTION_STYLE: Record<
  CaseAnswerSectionKey,
  { border: string; badge: string; title: string; iconBg: string }
> = {
  a: {
    border: 'border-l-blue-500',
    badge: 'bg-blue-600 text-white',
    title: 'text-blue-900',
    iconBg: 'bg-blue-100 text-blue-800',
  },
  b: {
    border: 'border-l-amber-500',
    badge: 'bg-amber-500 text-white',
    title: 'text-amber-950',
    iconBg: 'bg-amber-100 text-amber-900',
  },
  c: {
    border: 'border-l-indigo-500',
    badge: 'bg-indigo-600 text-white',
    title: 'text-indigo-950',
    iconBg: 'bg-indigo-100 text-indigo-900',
  },
  d: {
    border: 'border-l-emerald-500',
    badge: 'bg-emerald-600 text-white',
    title: 'text-emerald-950',
    iconBg: 'bg-emerald-100 text-emerald-900',
  },
  e: {
    border: 'border-l-rose-500',
    badge: 'bg-rose-600 text-white',
    title: 'text-rose-950',
    iconBg: 'bg-rose-100 text-rose-900',
  },
};

/** Muhim klinik ogohlantirish — qizil/sariq. */
const CRITICAL_RE =
  /\b(kontrendikatsiya|kontrindikatsiya|favqulodda|shoshilinch|xavfli|ogohlantirish|hayotiy\s+ko'?rsatma|contraindication|emergency|urgent|warning|противопоказан\w*|неотложн\w*|опасн\w*)\b/i;

/** Doza / lab qiymat — ko'k urg'u. */
const DOSE_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:mg|мкг|мл|ml|g\/l|mmol\/l|%|mmHg|уд\/мин|beats\/min)\b/i;

function isCriticalToken(token: string): boolean {
  return CRITICAL_RE.test(token);
}

function isDoseToken(token: string): boolean {
  return DOSE_RE.test(token);
}

function renderRichBody(
  body: string,
  refAnchorPrefix?: string,
  citeUrls?: Record<number, string>,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0;

  const tokenRe =
    /\[(\d+)\]|\b(?:kontrendikatsiya|kontrindikatsiya|favqulodda|shoshilinch|xavfli|ogohlantirish|hayotiy\s+ko'?rsatma|contraindication|emergency|urgent|warning|противопоказан\w*|неотложн\w*|опасн\w*)\b|\b\d+(?:[.,]\d+)?\s*(?:mg|мкг|мл|ml|g\/l|mmol\/l|%|mmHg|уд\/мин|beats\/min)\b/gi;

  let last = 0;
  for (const match of body.matchAll(tokenRe)) {
    const start = match.index ?? 0;
    if (start > last) {
      nodes.push(...linkifyChunk(body.slice(last, start), key));
      key += 10;
    }
    const token = match[0];
    const cite = /^\[(\d+)\]$/.exec(token);
    if (cite) {
      const n = cite[1];
      const num = Number(n);
      const externalUrl = citeUrls?.[num]?.trim();
      const anchorHref = refAnchorPrefix ? `#${refAnchorPrefix}-${n}` : undefined;
      nodes.push(
        <a
          key={`c_${key++}`}
          href={externalUrl || anchorHref || undefined}
          target={externalUrl ? '_blank' : undefined}
          rel={externalUrl ? 'noopener noreferrer' : undefined}
          onClick={(e) => {
            if (externalUrl) {
              // Brauzer yangi tabda ochadi (target=_blank); faqat scrollni to'xtatamiz.
              return;
            }
            if (!anchorHref) return;
            e.preventDefault();
            document.getElementById(`${refAnchorPrefix}-${n}`)?.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
            });
          }}
          title={externalUrl ? `Manba [${n}] — ochish` : `Manba [${n}]`}
          className="inline-flex items-center justify-center mx-0.5 px-1.5 min-w-[1.35rem] h-5 rounded-md bg-blue-600 text-white text-[11px] font-bold align-super hover:bg-blue-700 no-underline cursor-pointer"
        >
          {n}
        </a>,
      );
    } else if (isCriticalToken(token)) {
      nodes.push(
        <mark
          key={`k_${key++}`}
          className="bg-rose-100 text-rose-900 font-semibold px-0.5 rounded-sm not-italic"
        >
          {token}
        </mark>,
      );
    } else if (isDoseToken(token)) {
      nodes.push(
        <mark
          key={`d_${key++}`}
          className="bg-blue-100 text-blue-900 font-semibold px-0.5 rounded-sm not-italic"
        >
          {token}
        </mark>,
      );
    } else {
      nodes.push(token);
    }
    last = start + token.length;
  }
  if (last < body.length) {
    nodes.push(...linkifyChunk(body.slice(last), key));
  }
  return nodes;
}

function linkifyChunk(chunk: string, baseKey: number): React.ReactNode[] {
  if (!chunk) return [];
  // URL bo'lsa LinkifiedText uslubida; oddiy matn — fragment.
  const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let k = baseKey;
  for (const match of chunk.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(chunk.slice(last, start));
    let href = match[0];
    let trailing = '';
    const punct = /[.,;:!?]+$/.exec(href);
    if (punct) {
      trailing = punct[0];
      href = href.slice(0, punct.index);
    }
    parts.push(
      <a
        key={`u_${k++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-blue-700 underline underline-offset-2 break-all hover:text-blue-800"
      >
        {href}
      </a>,
    );
    if (trailing) parts.push(trailing);
    last = start + match[0].length;
  }
  if (last < chunk.length) parts.push(chunk.slice(last));
  return parts.length ? parts : [chunk];
}

/**
 * Keys YECHIM — a–e bo'limlari alohida kartochka, [n] manba nishoni ko'k,
 * ogohlantirish so'zlari qizil, doza/lab qiymatlari ko'k urg'u.
 */

/** Adabiyotlar matnidan [n] … https://… juftliklarini yig'adi. */
export function extractCiteUrlsFromBibliography(bibliography: string): Record<number, string> {
  const out: Record<number, string> = {};
  if (!bibliography.trim()) return out;
  for (const line of bibliography.split('\n')) {
    const m = line.match(/\[(\d+)\]/);
    if (!m) continue;
    const urlMatch = line.match(/https?:\/\/[^\s<>"')\]]+/);
    if (!urlMatch) continue;
    let href = urlMatch[0];
    const punct = /[.,;:!?]+$/.exec(href);
    if (punct) href = href.slice(0, punct.index);
    out[Number(m[1])] = href;
  }
  return out;
}

export default function CaseAnswerView({
  text,
  refAnchorPrefix = 'case-ref',
  citeUrls: citeUrlsProp,
  className = '',
}: Props) {
  const parsed = useMemo(() => parseCaseAnswer(text), [text]);
  const citeUrls = useMemo(() => {
    const fromBib = extractCiteUrlsFromBibliography(parsed.bibliography);
    return { ...fromBib, ...(citeUrlsProp || {}) };
  }, [parsed.bibliography, citeUrlsProp]);

  if (!parsed.sections.length) {
    return (
      <div className={className}>
        <LinkifiedText
          text={parsed.leftover || text}
          className="text-[14px] leading-relaxed text-blue-950/85 whitespace-pre-wrap"
        />
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {parsed.leftover ? (
        <p className="text-[14px] leading-relaxed text-blue-950/80 whitespace-pre-wrap">
          {parsed.leftover}
        </p>
      ) : null}

      {parsed.sections.map((section) => {
        const style = SECTION_STYLE[section.key];
        return (
          <section
            key={section.key}
            className={`rounded-xl border border-black/5 bg-white/80 border-l-4 ${style.border} overflow-hidden`}
          >
            <header className={`flex items-start gap-2.5 px-3.5 py-2.5 ${style.iconBg}`}>
              <span
                className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-bold uppercase ${style.badge}`}
              >
                {section.key}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h5 className={`text-[13px] sm:text-[14px] font-bold leading-snug ${style.title}`}>
                  {section.title}
                </h5>
              </div>
              {section.key === 'e' ? (
                <AlertTriangle size={14} className="shrink-0 text-rose-600 mt-1 opacity-80" />
              ) : (
                <Stethoscope size={14} className={`shrink-0 mt-1 opacity-60 ${style.title}`} />
              )}
            </header>
            <div className="px-3.5 py-3 text-[14px] leading-[1.7] text-[#083047]/90 whitespace-pre-wrap">
              {renderRichBody(section.body, refAnchorPrefix, citeUrls)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
