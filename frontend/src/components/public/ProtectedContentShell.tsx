import React, { useCallback, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { AppLanguage } from '../../i18n/language';
import { translate } from '../../i18n/translations';

type Props = {
  language: AppLanguage;
  documentId?: string;
  verificationCode?: string;
  children: React.ReactNode;
  className?: string;
};

export default function ProtectedContentShell({
  language,
  documentId,
  verificationCode,
  children,
  className,
}: Props) {
  const blockInteraction = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'C', 'x', 'X', 's', 'S', 'p', 'P', 'a', 'A'].includes(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return (
    <div
      className={`relative overflow-hidden select-none print:hidden ${className ?? ''}`}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      onCopy={blockInteraction}
      onCut={blockInteraction}
      onContextMenu={blockInteraction}
      onDragStart={blockInteraction}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.045]"
        style={{
          backgroundImage:
            'url(/imentor-logo.png), repeating-linear-gradient(-32deg, transparent, transparent 120px, rgba(8,48,71,0.03) 120px, rgba(8,48,71,0.03) 121px)',
          backgroundSize: '140px 140px, auto',
          backgroundRepeat: 'repeat, repeat',
          backgroundPosition: 'center 40px, 0 0',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex flex-wrap content-start gap-x-16 gap-y-10 p-6 opacity-[0.035] rotate-[-18deg] scale-110 origin-center"
      >
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.2em] text-[#083047]"
          >
            FJSTI · iMentor · {documentId || 'IM-OPEN'}
          </span>
        ))}
      </div>

      <div className="relative z-10 px-1 sm:px-2 py-1">{children}</div>

      {(documentId || verificationCode) && (
        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5 text-[11px] text-emerald-900">
          <ShieldCheck size={14} className="shrink-0 text-emerald-700" />
          <span className="font-semibold">{translate(language, 'publicCatalog.verifiedDocument')}</span>
          {documentId && (
            <span className="rounded-md bg-white/80 px-2 py-0.5 font-mono text-[10px] border border-emerald-200">
              {documentId}
            </span>
          )}
          {verificationCode && (
            <span className="text-emerald-800/80">
              {translate(language, 'publicCatalog.verificationCode')}:{' '}
              <span className="font-mono font-bold">{verificationCode}</span>
            </span>
          )}
        </div>
      )}

      <p className="relative z-10 mt-2 text-[10px] text-black/35 text-center">
        {translate(language, 'publicCatalog.noCopyNotice')}
      </p>
    </div>
  );
}
