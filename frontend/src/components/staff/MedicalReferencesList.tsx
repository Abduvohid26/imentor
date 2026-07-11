import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import type { MedicalReference } from '../../utils/medicalReferences';
import { useUiText } from '../../i18n/useUiText';

type Props = {
  references: MedicalReference[];
  title?: string;
  compact?: boolean;
  className?: string;
};

export default function MedicalReferencesList({
  references,
  title,
  compact = false,
  className = '',
}: Props) {
  const { t } = useUiText();
  if (!references?.length) return null;
  
  const displayTitle = title ?? t('staff.medical.referencesTitle');

  return (
    <div
      className={`rounded-xl border border-amber-200/80 bg-amber-50/60 ${compact ? 'p-3' : 'p-5'} ${className}`}
    >
      <h4
        className={`font-bold text-amber-900 flex items-center gap-2 ${compact ? 'text-[11px] mb-2' : 'text-[13px] mb-3'}`}
      >
        <BookOpen size={compact ? 14 : 16} />
        {displayTitle}
      </h4>
      <ol className={`space-y-2 list-decimal list-inside ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
        {references.map((ref, idx) => (
          <li key={`${ref.url}-${idx}`} className="text-amber-950/90 leading-relaxed">
            <a
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-700 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              {ref.title}
              <ExternalLink size={12} className="shrink-0 opacity-70" />
            </a>
            <span className="text-amber-900/70">
              {ref.authors ? ` — ${ref.authors}` : ''}
              {ref.year ? ` (${ref.year})` : ''}
              {ref.publisher ? `. ${ref.publisher}` : ''}
            </span>
            {ref.note ? (
              <span className="block text-amber-800/60 mt-0.5 not-italic">{ref.note}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
