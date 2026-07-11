import React, { useContext, useEffect, useState } from 'react';
import { Files, Loader2 } from 'lucide-react';
import { GlobalTopicContext, AppNavigationContext } from '../../App';
import { useUiText } from '../../i18n/useUiText';
import { fetchHandoutsForTopic, type TopicHandoutItem } from '../../utils/handoutApi';

/** Syllabus mavzusi tanlanganda boshqa modullarda qisqa ko‘rsatkich. */
export default function HandoutTopicBanner() {
  const { t } = useUiText();
  const topic = useContext(GlobalTopicContext);
  const { openHandouts, openSyllabus } = useContext(AppNavigationContext);
  const [items, setItems] = useState<TopicHandoutItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!topic?.title) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await fetchHandoutsForTopic(topic);
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topic]);

  if (!topic) return null;

  return (
    <div className="mx-2 sm:mx-4 mt-2 mb-0 ios-glass rounded-2xl border border-amber-200/60 bg-amber-50/40 px-4 py-3 flex flex-wrap items-center gap-3 print:hidden">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Files size={20} className="text-amber-700 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-amber-950 truncate">
            {topic.subjectName ? `${topic.subjectName} · ` : ''}{topic.id} — {topic.title}
          </p>
          <p className="text-[11px] text-amber-900/70">
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> {t('banner.loading')}
              </span>
            ) : items.length > 0 ? (
              t('banner.materialsCount', { count: items.length })
            ) : (
              t('banner.noMaterials')
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={items.length > 0 ? openHandouts : openSyllabus}
        className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 text-white text-[13px] font-semibold hover:bg-amber-500 shadow-sm"
      >
        {items.length > 0 ? t('banner.view') : t('banner.uploadInSyllabus')}
      </button>
    </div>
  );
}
