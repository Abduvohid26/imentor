import { BookOpen, ExternalLink } from 'lucide-react';
import type { MedicalReference } from '../../utils/medicalReferences';
import { useUiText } from '../../i18n/useUiText';
import {
  staffSourceBox,
  staffSourceItem,
  staffSourceLink,
  staffSourceMeta,
  staffSourceTitle,
} from './staffUi';

type Props = {
  references: MedicalReference[];
  title?: string;
  compact?: boolean;
  className?: string;
  /** [n] iqtiboslar scroll qiladigan id prefix (masalan case-ref → case-ref-5). */
  anchorPrefix?: string;
};

/**
 * MANBALAR ro'yxati — to'rt bo'lim uchun yagona ko'rinish.
 *
 * Rang HAMISHA KO'K. Ilgari blok sariq (amber) edi: bu rang tizimning qolgan
 * qismida "ogohlantirish" ma'nosini bildirgani uchun manbalar xato yoki
 * shubhali ma'lumotdek ko'rinardi.
 */
export default function MedicalReferencesList({
  references,
  title,
  compact = false,
  className = '',
  anchorPrefix,
}: Props) {
  const { t } = useUiText();
  if (!references?.length) return null;

  const displayTitle = title ?? t('staff.medical.referencesTitle');
  const useCiteIndex = references.some((r) => typeof r.citeIndex === 'number');

  return (
    <div className={`${staffSourceBox} ${compact ? 'p-3' : 'p-5'} ${className}`}>
      <h4 className={`${staffSourceTitle} ${compact ? 'text-[11px] mb-2' : 'mb-3'}`}>
        <BookOpen size={compact ? 14 : 16} className="shrink-0" />
        {displayTitle}
      </h4>
      <ol
        className={`space-y-2 ${useCiteIndex ? 'list-none' : 'list-decimal list-inside'} ${compact ? 'text-[12px]' : 'text-[13.5px]'}`}
      >
        {references.map((ref, idx) => {
          const cite = ref.citeIndex ?? idx + 1;
          const anchorId = anchorPrefix ? `${anchorPrefix}-${cite}` : undefined;
          return (
            <li
              key={`${ref.url || ref.title}-${idx}`}
              id={anchorId}
              className={`${staffSourceItem} ${useCiteIndex ? 'flex gap-2' : ''} scroll-mt-20`}
            >
              {useCiteIndex ? (
                ref.url ? (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center justify-center px-1.5 h-5 min-w-[1.5rem] rounded-md bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 no-underline"
                    title={`Manba [${cite}]`}
                  >
                    {cite}
                  </a>
                ) : (
                  <span className="shrink-0 inline-flex items-center justify-center px-1.5 h-5 min-w-[1.5rem] rounded-md bg-blue-600 text-white text-[11px] font-bold">
                    {cite}
                  </span>
                )
              ) : null}
              <span className="min-w-0">
                {ref.url ? (
                  <a href={ref.url} target="_blank" rel="noopener noreferrer" className={staffSourceLink}>
                    {ref.title}
                    <ExternalLink size={12} className="shrink-0 opacity-70" />
                  </a>
                ) : (
                  <span className="font-bold text-blue-900">{ref.title}</span>
                )}
                <span className={staffSourceMeta}>
                  {ref.pages ? ` — ${ref.pages}-bet` : ''}
                  {ref.authors ? ` — ${ref.authors}` : ''}
                  {ref.year ? ` (${ref.year})` : ''}
                  {ref.publisher ? `. ${ref.publisher}` : ''}
                </span>
                {ref.note ? (
                  <span className="block text-blue-900/55 mt-0.5 not-italic">{ref.note}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
