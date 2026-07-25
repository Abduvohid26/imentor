import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Presentation,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlobalTopicContext, AppNavigationContext, AppLanguageContext } from '../App';
import { useUiText } from '../i18n/useUiText';
import { aiService } from '../services/aiService';
import { buildPresentationPptxFile } from '../utils/buildPresentationPptx';
import { extractPdfTextFromBlob } from '../utils/presentationTopicNorm';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import { isTopicContextComplete, topicContextKey } from '../utils/syllabusTopicContext';
import {
  deletePresentation,
  fetchPresentationsForTopic,
  getPresentationFileBlobUrl,
  isAllowedPresentationFile,
  resolvePresentationFileUrl,
  uploadPresentation,
  type TopicPresentationItem,
} from '../utils/presentationUploadApi';
import StaffPageLayout from './staff/StaffPageLayout';
import StaffTopicHeader from './staff/StaffTopicHeader';
import StaffEmptyState from './staff/StaffEmptyState';
import StaffErrorAlert from './staff/StaffErrorAlert';
import StaffPanel from './staff/StaffPanel';
import { staffBtnGhost, staffBtnPrimary, staffBtnSecondary } from './staff/staffUi';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: TopicPresentationItem['kind']): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'pptx') return 'PPTX';
  return 'PPT';
}

function PresentationPreview({ item, mode }: { item: TopicPresentationItem; mode: 'thumb' | 'full' }) {
  const iconSize = mode === 'full' ? 56 : 40;
  const colors =
    item.kind === 'pdf'
      ? 'text-rose-700/80 bg-rose-50/80'
      : item.kind === 'pptx'
        ? 'text-orange-700/80 bg-orange-50/80'
        : 'text-amber-700/80 bg-amber-50/80';

  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 ${colors}`}>
      {item.kind === 'pdf' ? <FileText size={iconSize} /> : <Presentation size={iconSize} />}
      <span className="text-[11px] font-bold uppercase tracking-wide">{kindLabel(item.kind)}</span>
    </div>
  );
}

type LightboxProps = {
  items: TopicPresentationItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

function PresentationLightbox({ items, index, onClose, onIndexChange }: LightboxProps) {
  const { t } = useUiText();
  const item = items[index];
  const [fileSrc, setFileSrc] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  if (!item) return null;
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const publicUrl = resolvePresentationFileUrl(item.file_url);

  useEffect(() => {
    let cancelled = false;
    setFileSrc('');
    setDownloadUrl('');
    (async () => {
      try {
        const blob = await getPresentationFileBlobUrl(item.id);
        if (!cancelled) {
          setFileSrc(blob);
          setDownloadUrl(blob);
        }
      } catch {
        if (!cancelled && publicUrl) {
          setFileSrc(publicUrl);
          setDownloadUrl(publicUrl);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.file_url, publicUrl]);

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
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/92" role="dialog" aria-modal="true">
      <header className="flex items-center justify-between px-4 py-3 text-white shrink-0 gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold truncate">{item.title || item.file_name}</p>
          <p className="text-[12px] text-white/60 truncate">
            {index + 1} / {items.length} · {kindLabel(item.kind)} · {item.author_name}
          </p>
        </div>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={item.file_name}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-[13px] font-semibold shrink-0"
          >
            <Download size={16} /> {t('common.download')}
          </a>
        )}
        <button type="button" onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0">
          <X size={22} />
        </button>
      </header>

      <div className="flex-1 relative flex items-center justify-center min-h-0 px-2 pb-2">
        {hasPrev && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            className="absolute left-2 z-10 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
          >
            <ChevronLeft size={28} />
          </button>
        )}

        <div className="w-full h-full max-w-6xl flex items-center justify-center">
          {!fileSrc ? (
            <Loader2 className="animate-spin text-white" size={40} />
          ) : item.kind === 'pdf' ? (
            <iframe
              title={item.file_name}
              src={fileSrc}
              className="w-full h-full min-h-[50vh] rounded-lg bg-white"
            />
          ) : (
            <div className="text-center text-white px-6 space-y-5 max-w-md">
              <div className="relative w-48 h-32 mx-auto rounded-2xl overflow-hidden bg-white/10">
                <PresentationPreview item={item} mode="full" />
              </div>
              <p className="text-[14px] text-white/80 leading-relaxed">{t('presentation.previewDownload')}</p>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={item.file_name}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#083047] text-white text-[14px] font-semibold hover:bg-[#0a4060]"
                >
                  <Download size={18} /> {t('common.download')}
                </a>
              )}
            </div>
          )}
        </div>

        {hasNext && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            className="absolute right-2 z-10 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function PresentationMaterials() {
  const { t } = useUiText();
  const globalTopic = useContext(GlobalTopicContext);
  const { language } = useContext(AppLanguageContext);
  const { openSyllabus } = useContext(AppNavigationContext);
  const [items, setItems] = useState<TopicPresentationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const topicTitle = globalTopic?.title?.trim() ?? '';
  const topicReady = Boolean(globalTopic && topicTitle && isTopicContextComplete(globalTopic));

  const topicKey = topicContextKey(globalTopic);
  const requestSeq = useRef(0);

  const loadItems = useCallback(async () => {
    if (!topicReady || !globalTopic || !topicKey) {
      setItems([]);
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPresentationsForTopic(globalTopic);
      if (seq !== requestSeq.current) return;
      setItems(rows);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setItems([]);
      setError(
        e instanceof Error && e.message === 'no-backend-token'
          ? t('presentation.errorLogin')
          : t('presentation.errorLoad'),
      );
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [topicReady, topicKey, globalTopic, t]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleUpload = async (file: File) => {
    if (!topicReady || !globalTopic) return;
    if (!isAllowedPresentationFile(file)) {
      setError(t('presentation.errorFileType'));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadPresentation({ topic: topicTitle, file, context: globalTopic });
      await loadItems();
    } catch (e) {
      setError(apiErrorMessage(e, t('presentation.errorUpload')));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAiPresentation = async () => {
    if (!topicReady || !globalTopic) return;
    setAiLoading(true);
    setError(null);
    try {
      let sourceText = '';
      const pdfItem = items.find((i) => i.kind === 'pdf');
      if (pdfItem) {
        try {
          const blobUrl = await getPresentationFileBlobUrl(pdfItem.id);
          const res = await fetch(blobUrl);
          sourceText = await extractPdfTextFromBlob(await res.blob());
        } catch {
          /* PDF matn ixtiyoriy */
        }
      }
      const deck = await aiService.generatePresentationDeck({
        topicTitle: globalTopic.title,
        topicId: globalTopic.id,
        topicType: globalTopic.type,
        subjectName: globalTopic.subjectName,
        variantLabel: globalTopic.variantLabel,
        language,
        mode: items.length > 0 ? 'enhance' : 'generate',
        sourceFileName: items[0]?.file_name,
        sourceText,
        subjectCode: globalTopic.subjectCode,
      });
      const file = await buildPresentationPptxFile(deck);
      if (!file.size) {
        throw new Error('empty-pptx');
      }
      await uploadPresentation({
        topic: topicTitle,
        file,
        title: deck.title,
        context: globalTopic,
      });
      await loadItems();
    } catch (e) {
      const detail = apiErrorMessage(e, t('presentation.errorAiHint'));
      setError(`${t('presentation.errorAi')} ${detail}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('presentation.confirmDelete'))) return;
    try {
      await deletePresentation(id);
      await loadItems();
      setLightboxIndex(null);
    } catch {
      setError(t('presentation.errorDelete'));
    }
  };

  if (!topicReady || !globalTopic) {
    return (
      <StaffPageLayout>
        <StaffEmptyState
          icon={BookOpen}
          title={t('presentation.noTopic')}
          hint={t('presentation.noTopicHint')}
          actionLabel={t('common.goToSyllabus')}
          onAction={openSyllabus}
        />
      </StaffPageLayout>
    );
  }

  return (
    <StaffPageLayout>
      <StaffTopicHeader
        moduleLabel={t('presentation.title')}
        topic={globalTopic}
        hint={items.length > 0 ? t('presentation.hintWithUpload') : t('presentation.hintAiGenerate')}
      >
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
          <button
            type="button"
            disabled={uploading || aiLoading}
            onClick={() => fileRef.current?.click()}
            className={`${staffBtnPrimary} disabled:opacity-50`}
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            {uploading ? t('common.loading') : t('presentation.upload')}
          </button>
          <button
            type="button"
            disabled={uploading || aiLoading}
            onClick={() => void handleAiPresentation()}
            className={`${staffBtnSecondary} disabled:opacity-50`}
          >
            {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {aiLoading
              ? t('common.loading')
              : items.length > 0
                ? t('presentation.aiEnhance')
                : t('presentation.aiGenerate')}
          </button>
          <button
            type="button"
            onClick={() => void loadItems()}
            disabled={loading}
            className={`${staffBtnGhost} disabled:opacity-50`}
          >
            {loading ? t('common.loading') : t('common.refresh')}
          </button>
        </div>
      </StaffTopicHeader>

      {error && <StaffErrorAlert message={error} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[#083047]/60" size={36} />
        </div>
      ) : items.length === 0 ? (
        <StaffPanel className="py-12 text-center text-black/45 text-[14px]">
          {t('presentation.empty')}
        </StaffPanel>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {items.map((item, idx) => (
            <motion.div
              key={item.id}
              layout
              className="group relative ios-glass rounded-2xl border border-white/70 overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className="block w-full aspect-video bg-black/5 relative"
              >
                <PresentationPreview item={item} mode="thumb" />
                <span className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn size={16} />
                </span>
              </button>
              <div className="p-3 space-y-1">
                <p className="text-[13px] font-semibold text-black/85 line-clamp-2">{item.title || item.file_name}</p>
                <p className="text-[11px] text-black/45">
                  {kindLabel(item.kind)} · {formatSize(item.file_size)} · {item.author_name}
                </p>
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
          ))}
        </div>
      )}

      <AnimatePresence>
        {lightboxIndex !== null && items[lightboxIndex] && (
          <PresentationLightbox
            items={items}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onIndexChange={setLightboxIndex}
          />
        )}
      </AnimatePresence>
    </StaffPageLayout>
  );
}
