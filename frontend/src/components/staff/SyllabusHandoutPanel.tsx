import { useCallback, useEffect, useState } from 'react';
import { Files, Loader2 } from 'lucide-react';
import type { SyllabusTopicContext } from '../../utils/syllabusTopicContext';
import { fetchHandoutsForTopic } from '../../utils/handoutApi';
import { useUiText } from '../../i18n/useUiText';

type Props = {
  topic: SyllabusTopicContext;
  onOpenHandouts: () => void;
};

export default function SyllabusHandoutPanel({ topic, onOpenHandouts }: Props) {
  const { t } = useUiText();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCount = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchHandoutsForTopic(topic);
      setCount(list.length);
      setError(null);
    } catch (e) {
      setCount(0);
      if (e instanceof Error && e.message === 'no-backend-token') {
        setError(t('staff.syllabus.errorAuth'));
      }
    } finally {
      setLoading(false);
    }
  }, [topic, t]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  // Tarqatma yo'q bo'lsa panelni ko'rsatmaymiz (admin qo'shadi, o'qituvchi ko'radi)
  if (!loading && count === 0 && !error) return null;

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Files size={20} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-amber-950">{t('staff.syllabus.handoutTitle')}</p>
          <p className="text-[12px] text-amber-900/70 leading-snug mt-0.5">
            {t('staff.syllabus.handoutViewHint')}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenHandouts}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 bg-white text-amber-900 text-[13px] font-semibold hover:bg-amber-50"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Files size={16} />}
        {t('staff.syllabus.view')}{count > 0 ? ` (${count})` : ''}
      </button>

      {error && <p className="text-[12px] text-rose-600 font-medium">{error}</p>}
    </div>
  );
}
