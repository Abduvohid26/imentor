import React, { useContext, useEffect, useRef, useState } from 'react';
import { Files, Loader2 } from 'lucide-react';
import { GlobalTopicContext, AppNavigationContext } from '../../App';
import { useUiText } from '../../i18n/useUiText';
import { fetchHandoutsForTopic, type TopicHandoutItem } from '../../utils/handoutApi';
import { topicContextKey } from '../../utils/syllabusTopicContext';

/** Syllabus mavzusi tanlanganda boshqa modullarda qisqa ko‘rsatkich. */
export default function HandoutTopicBanner() {
  const { t } = useUiText();
  const topic = useContext(GlobalTopicContext);
  const { openHandouts } = useContext(AppNavigationContext);
  const [items, setItems] = useState<TopicHandoutItem[]>([]);
  const [loading, setLoading] = useState(false);
  const topicKey = topicContextKey(topic);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!topicKey) {
      setItems([]);
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    (async () => {
      try {
        const list = await fetchHandoutsForTopic(topic!);
        if (seq !== requestSeq.current) return;
        setItems(list);
      } catch {
        if (seq !== requestSeq.current) return;
        setItems([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    })();
  }, [topicKey, topic]);

  if (!topic) return null;

  return (
    <div className="mx-2 sm:mx-4 mt-2 mb-0 ios-glass rounded-2xl border border-white/70 px-4 py-3 flex flex-wrap items-center gap-3 print:hidden">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Files size={20} className="text-[#083047]/70 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#083047] truncate">
            {topic.subjectName ? `${topic.subjectName} · ` : ''}{topic.id} — {topic.title}
          </p>
          <p className="text-[11px] text-black/50">
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> {t('banner.loading')}
              </span>
            ) : items.length > 0 ? (
              t('banner.materialsCount', { count: items.length })
            ) : (
              t('handout.empty')
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={openHandouts}
        className="shrink-0 px-4 py-2 rounded-xl bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-500 shadow-sm"
      >
        {items.length > 0 ? t('banner.view') : t('banner.openHandouts')}
      </button>
    </div>
  );
}
