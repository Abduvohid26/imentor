import { History } from 'lucide-react';
import { useUiText } from '../../i18n/useUiText';

/**
 * Ingichka eslatma qatori: "Bu mavzuda N ta saqlangan versiya bor — Bazani ochish".
 *
 * To'rt bo'lim (Ma'ruza matni, Taqdimot, Keys, Test) bir xil ishlashi uchun
 * yagona komponent: sahifa TOZA ochiladi (avtomatik oxirgi material
 * ochilmaydi), lekin shu mavzuda avval yaratilgan ish bo'lsa — yo'qolib
 * ketmasligi uchun shu qator ko'rinadi.
 */
export default function SavedWorkBanner({
  count,
  onOpen,
}: {
  count: number;
  /** Tugma faqat shu prop berilganda chiqadi — tepasida "Baza" tugmasi bor
   * bo'limlarda ikkinchi tugma takrorlanmasligi uchun. */
  onOpen?: () => void;
}) {
  const { t } = useUiText();
  if (count <= 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-2.5">
      <p className="text-[13px] text-sky-900/80 min-w-0">
        {t('common.savedWorkBanner', { count: String(count) })}
      </p>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:bg-sky-50"
        >
          <History size={15} />
          {t('common.database')}
        </button>
      )}
    </div>
  );
}
