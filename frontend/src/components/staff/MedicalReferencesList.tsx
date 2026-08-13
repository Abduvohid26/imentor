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
}: Props) {
  const { t } = useUiText();
  if (!references?.length) return null;

  const displayTitle = title ?? t('staff.medical.referencesTitle');

  return (
    <div className={`${staffSourceBox} ${compact ? 'p-3' : 'p-5'} ${className}`}>
      <h4 className={`${staffSourceTitle} ${compact ? 'text-[11px] mb-2' : 'mb-3'}`}>
        <BookOpen size={compact ? 14 : 16} className="shrink-0" />
        {displayTitle}
      </h4>
      <ol
        className={`space-y-2 list-decimal list-inside ${compact ? 'text-[12px]' : 'text-[13.5px]'}`}
      >
        {references.map((ref, idx) => (
          <li key={`${ref.url || ref.title}-${idx}`} className={staffSourceItem}>
            {ref.url ? (
              <a href={ref.url} target="_blank" rel="noopener noreferrer" className={staffSourceLink}>
                {ref.title}
                <ExternalLink size={12} className="shrink-0 opacity-70" />
              </a>
            ) : (
              /* Darslik manbasi — tashqi havola yo'q, lekin rangi bir xil ko'k. */
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
          </li>
        ))}
      </ol>
    </div>
  );
}
