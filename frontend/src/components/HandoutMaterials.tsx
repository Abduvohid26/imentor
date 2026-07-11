import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Trash2,
  X,
  ZoomIn,
  BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlobalTopicContext, AppNavigationContext } from '../App';
import { useUiText } from '../i18n/useUiText';
import {
  deleteHandout,
  fetchHandoutsForTopic,
  getHandoutFileBlobUrl,
  resolveHandoutFileUrl,
  type TopicHandoutItem,
} from '../utils/handoutApi';

function HandoutFilePreview({
  item,
  className,
  mode,
  t,
}: {
  item: TopicHandoutItem;
  className?: string;
  mode: 'thumb' | 'full';
  t: (key: string) => string;
}) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let blobUrl = '';
    let cancelled = false;
    setFailed(false);
    setSrc('');

    (async () => {
      try {
        blobUrl = await getHandoutFileBlobUrl(item.id);
        if (!cancelled) setSrc(blobUrl);
      } catch {
        const fallback = resolveHandoutFileUrl(item.file_url);
        if (!cancelled) {
          if (fallback) setSrc(fallback);
          else setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item.id, item.file_url]);

  if (item.kind === 'pdf') {
    return (
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 text-rose-700/80 bg-rose-50/80 ${className ?? ''}`}>
        <FileText size={mode === 'full' ? 56 : 40} />
        <span className="text-[11px] font-bold uppercase tracking-wide">PDF</span>
      </div>
    );
  }

  if (failed || !src) {
    return (
      <div className={`flex items-center justify-center bg-black/5 text-black/30 text-[11px] ${className ?? ''}`}>
        {failed ? t('handout.imageFailed') : t('common.loading')}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={item.title || item.file_name}
      className={className}
      loading="lazy"
    />
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type LightboxProps = {
  items: TopicHandoutItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

function HandoutLightbox({ items, index, onClose, onIndexChange }: LightboxProps) {
  const { t } = useUiText();
  const item = items[index];
  const [fileSrc, setFileSrc] = useState('');
  if (!item) return null;
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    let cancelled = false;
    setFileSrc('');
    (async () => {
      try {
        const blob = await getHandoutFileBlobUrl(item.id);
        if (!cancelled) setFileSrc(blob);
      } catch {
        const fallback = resolveHandoutFileUrl(item.file_url);
        if (!cancelled) setFileSrc(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.file_url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onClose, onIndexChange]);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label={t('handout.viewerLabel')}
    >
      <header className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <div className="min-w-0 flex-1 pr-3">
          <p className="text-[15px] font-semibold truncate">{item.title || item.file_name}</p>
          <p className="text-[12px] text-white/60 truncate">
            {index + 1} / {items.length} · {item.author_name || item.owner_key}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
          aria-label={t('common.close')}
        >
          <X size={22} />
        </button>
      </header>

      <div className="flex-1 relative flex items-center justify-center min-h-0 px-2 pb-2">
        {hasPrev && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            className="absolute left-2 z-10 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
            aria-label={t('common.prev')}
          >
            <ChevronLeft size={28} />
          </button>
        )}

        <div className="w-full h-full max-w-6xl flex items-center justify-center">
          {item.kind === 'pdf' ? (
            fileSrc ? (
              <iframe
                title={item.file_name}
                src={fileSrc}
                className="w-full h-full min-h-[50vh] rounded-lg bg-white"
              />
            ) : (
              <Loader2 className="animate-spin text-white" size={40} />
            )
          ) : fileSrc ? (
            <img
              src={fileSrc}
              alt={item.title || item.file_name}
              className="max-w-full max-h-[calc(100dvh-8rem)] object-contain rounded-lg shadow-2xl"
            />
          ) : (
            <Loader2 className="animate-spin text-white" size={40} />
          )}
        </div>

        {hasNext && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            className="absolute right-2 z-10 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
            aria-label={t('common.next')}
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function HandoutMaterials() {
  const { t } = useUiText();
  const globalTopic = useContext(GlobalTopicContext);
  const { openSyllabus } = useContext(AppNavigationContext);
  const [items, setItems] = useState<TopicHandoutItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const loadHandouts = useCallback(async () => {
    if (!globalTopic?.title) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchHandoutsForTopic(globalTopic);
      setItems(list);
    } catch (e) {
      setItems([]);
      if (e instanceof Error && e.message === 'no-backend-token') {
        setError(t('handout.errorLogin'));
      } else {
        setError(t('handout.errorLoad'));
      }
    } finally {
      setLoading(false);
    }
  }, [globalTopic, t]);

  useEffect(() => {
    void loadHandouts();
  }, [loadHandouts]);

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('handout.confirmDelete'))) return;
    try {
      await deleteHandout(id);
      await loadHandouts();
      setLightboxIndex(null);
    } catch {
      setError(t('handout.errorDelete'));
    }
  };

  if (!globalTopic?.title) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center space-y-4">
        <div className="ios-glass rounded-2xl border border-white/70 p-8">
          <BookOpen size={40} className="mx-auto text-amber-600 mb-4" />
          <h2 className="text-lg font-bold text-[#083047]">{t('handout.noTopicTitle')}</h2>
          <p className="text-[14px] text-black/55 mt-2 leading-relaxed">{t('handout.noTopicHint')}</p>
          <button
            type="button"
            onClick={openSyllabus}
            className="mt-5 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-[14px] font-semibold hover:bg-amber-500"
          >
            {t('common.goToCourses')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-3 sm:px-5 lg:px-6 py-4 sm:py-6 space-y-5 pb-8">
      <div className="ios-glass rounded-[1.5rem] border border-white/70 p-5 sm:p-6 shadow-sm">
        <h2 className="text-xl sm:text-2xl font-bold text-[#083047]">{t('handout.title')}</h2>
        <p className="text-[14px] text-black/55 mt-1">
          {t('handout.selectedTopic')}{' '}
          <span className="font-semibold text-amber-800">
            {globalTopic.id} — {globalTopic.title}
          </span>
        </p>
        <p className="text-[12px] text-black/45 mt-2">{t('handout.uploadHint')}</p>
        <button
          type="button"
          onClick={() => void loadHandouts()}
          disabled={loading}
          className="mt-3 text-[13px] font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('common.refresh')}
        </button>
      </div>

      {error && <p className="text-[13px] text-rose-600 font-medium text-center">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-amber-600" size={36} />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-black/45 py-12 ios-glass rounded-2xl border border-white/60">
          {t('handout.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {items.map((item, idx) => {
            return (
              <motion.div
                key={item.id}
                layout
                className="group relative ios-glass rounded-2xl border border-white/70 overflow-hidden shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className="block w-full aspect-[4/3] bg-black/5 relative"
                >
                  <HandoutFilePreview
                    item={item}
                    mode="thumb"
                    className="absolute inset-0 w-full h-full object-cover"
                    t={t}
                  />
                  <span className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn size={16} />
                  </span>
                </button>
                <div className="p-2.5 space-y-1">
                  <p className="text-[12px] font-semibold text-black/85 line-clamp-2 leading-snug">
                    {item.title || item.file_name}
                  </p>
                  <p className="text-[10px] text-black/45 truncate">{item.author_name}</p>
                  <p className="text-[10px] text-black/35">{formatSize(item.file_size)}</p>
                </div>
                {item.can_delete && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 text-rose-600 shadow opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <p className="text-center text-[12px] text-black/40">{t('handout.totalCount', { count: items.length })}</p>
      )}

      <AnimatePresence>
        {lightboxIndex !== null && items[lightboxIndex] && (
          <HandoutLightbox
            items={items}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onIndexChange={setLightboxIndex}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
