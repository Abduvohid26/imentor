import { useEffect, useState } from 'react';
import { Loader2, Youtube } from 'lucide-react';
import type { SyllabusTopicContext } from '../../utils/syllabusTopicContext';
import { fetchTopicVideos, type TopicVideo } from '../../utils/topicVideoApi';
import { useUiText } from '../../i18n/useUiText';

export default function TopicVideoPanel({ topic }: { topic: SyllabusTopicContext | null }) {
  const { t } = useUiText();
  const [videos, setVideos] = useState<TopicVideo[]>([]);
  const [loading, setLoading] = useState(false);

  const syllabusId = topic?.syllabusId;
  const variantLabel = topic?.variantLabel;
  const topicCode = topic?.id;

  useEffect(() => {
    if (!syllabusId || !variantLabel || !topicCode) {
      setVideos([]);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchTopicVideos({ syllabusId, variantLabel, topicCode })
      .then((rows) => {
        if (alive) setVideos(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [syllabusId, variantLabel, topicCode]);

  if (!topic || (!loading && videos.length === 0)) return null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-4 space-y-3">
      <p className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5">
        <Youtube size={15} className="text-rose-600" />
        {t('video.panelTitle')}
      </p>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-rose-500" size={22} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {videos.map((v) => (
            <div key={v.id} className="space-y-1">
              <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }}>
                <iframe
                  src={v.embed_url}
                  title={v.title || v.youtube_id}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                />
              </div>
              {v.title && <p className="text-[12px] text-slate-600 truncate">{v.title}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
