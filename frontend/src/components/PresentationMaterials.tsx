import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
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
import { buildPresentationPptxFile, type PresentationDeck } from '../utils/buildPresentationPptx';
import { extractPdfTextFromBlob } from '../utils/presentationTopicNorm';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import { isTopicContextComplete, topicContextKey } from '../utils/syllabusTopicContext';
import {
  loadLatestPreparedContent,
  loadPreparedByIdSynced,
  listAllPreparedForKindSynced,
  savePreparedContent,
  type PreparedContentSummary,
} from '../utils/preparedContentStore';
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
  const [deck, setDeck] = useState<PresentationDeck | null>(null);
  const [deckChecked, setDeckChecked] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
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
    let cancelled = false;
    setDeck(null);
    setDeckChecked(false);
    setSlideIdx(0);
    const lookupTitle = (item.title || item.file_name || '').trim();
    if (!lookupTitle) {
      setDeckChecked(true);
      return;
    }
    (async () => {
      const found = await loadLatestPreparedContent<PresentationDeck>('presentation', lookupTitle);
      if (!cancelled) {
        setDeck(found && Array.isArray(found.slides) && found.slides.length ? found : null);
        setDeckChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.title, item.file_name]);

  const slideCount = deck?.slides.length ?? 0;
  const hasPrevSlide = slideIdx > 0;
  const hasNextSlide = slideIdx < slideCount - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (deck) {
        if (e.key === 'ArrowLeft' && hasPrevSlide) setSlideIdx((i) => i - 1);
        if (e.key === 'ArrowRight' && hasNextSlide) setSlideIdx((i) => i + 1);
        return;
      }
      if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onClose, onIndexChange, deck, hasPrevSlide, hasNextSlide]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/92" role="dialog" aria-modal="true">
      <header className="flex items-center justify-between px-4 py-3 text-white shrink-0 gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold truncate">{item.title || item.file_name}</p>
          <p className="text-[12px] text-white/60 truncate">
            {deck
              ? `${t('presentation.slideLabel')} ${slideIdx + 1} / ${slideCount}`
              : `${index + 1} / ${items.length}`}
            {' · '}
            {kindLabel(item.kind)} · {item.author_name}
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
        {deck ? (
          <>
            {hasPrevSlide && (
              <button
                type="button"
                onClick={() => setSlideIdx((i) => i - 1)}
                className="absolute left-2 z-10 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            <div className="w-full h-full max-w-5xl mx-auto flex flex-col gap-4">
              <div className="flex-1 min-h-0 rounded-3xl bg-white/95 backdrop-blur-xl shadow-2xl p-8 sm:p-12 flex flex-col overflow-y-auto">
                <h2 className="text-2xl sm:text-3xl font-bold text-[#083047] mb-6">
                  {deck.slides[slideIdx]?.title}
                </h2>
                <ul className="space-y-2.5 text-[14px] sm:text-[15px] text-black/85">
                  {(deck.slides[slideIdx]?.bullets ?? []).map((b, i) => (
                    <li key={i} className="flex gap-3 leading-snug">
                      <span className="text-orange-500 shrink-0 mt-0.5">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                {deck.slides[slideIdx]?.notes && (
                  <p className="mt-6 pt-3 border-t border-black/10 text-[12px] text-black/45 italic leading-relaxed">
                    {deck.slides[slideIdx]?.notes}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-center gap-1.5 shrink-0">
                {deck.slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSlideIdx(i)}
                    aria-label={`${t('presentation.slideLabel')} ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === slideIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/55'
                    }`}
                  />
                ))}
              </div>
            </div>

            {hasNextSlide && (
              <button
                type="button"
                onClick={() => setSlideIdx((i) => i + 1)}
                className="absolute right-2 z-10 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </>
        ) : (
          <>
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
              {!fileSrc || !deckChecked ? (
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
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white text-[14px] font-semibold hover:bg-blue-500"
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
          </>
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
  const [aiProgress, setAiProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [savedDecks, setSavedDecks] = useState<PreparedContentSummary[]>([]);
  const [historyDeck, setHistoryDeck] = useState<PresentationDeck | null>(null);
  const [historySlideIdx, setHistorySlideIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshDeckHistory = useCallback(() => {
    void listAllPreparedForKindSynced('presentation').then(setSavedDecks);
  }, []);

  const openHistoryDeck = async (summary: PreparedContentSummary) => {
    const deck = await loadPreparedByIdSynced<PresentationDeck>('presentation', summary.id);
    if (!deck) return;
    setHistoryDeck(deck);
    setHistorySlideIdx(0);
  };

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
    setAiProgress('');
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
        // Foydalanuvchi UI'da tanlagan til ustuvor (lekin bilan bir xil qoida).
        language,
        mode: items.length > 0 ? 'enhance' : 'generate',
        sourceFileName: items[0]?.file_name,
        sourceText,
        subjectCode: globalTopic.subjectCode,
        onProgress: (textSoFar) => setAiProgress(textSoFar),
      });
      const file = await buildPresentationPptxFile(deck);
      if (!file.size) {
        throw new Error('empty-pptx');
      }
      await savePreparedContent('presentation', deck.title, deck, {
        subjectName: globalTopic.subjectName,
        subjectCode: globalTopic.subjectCode,
        variantLabel: globalTopic.variantLabel,
        topicCode: globalTopic.id,
      });
      refreshDeckHistory();
      const shortTopic =
        [globalTopic.id, globalTopic.title].filter(Boolean).join(' — ').slice(0, 240) || topicTitle;
      await uploadPresentation({
        topic: shortTopic,
        file,
        title: (deck.title || shortTopic).slice(0, 240),
        context: globalTopic,
      });
      await loadItems();
    } catch (e) {
      const detail = apiErrorMessage(e, t('presentation.errorAiHint'));
      setError(`${t('presentation.errorAi')} ${detail}`);
    } finally {
      setAiLoading(false);
      setAiProgress('');
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

  if (showHistory) {
    return (
      <StaffPageLayout>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setShowHistory(false)} className={staffBtnGhost}>
            <ArrowLeft size={18} />
            {t('lecture.back')}
          </button>
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#083047]">
            <History size={20} />
            {t('lecture.database')}
          </h2>
        </div>
        {savedDecks.length === 0 ? (
          <StaffPanel className="p-10 text-center">
            <Presentation size={40} className="mx-auto text-black/20 mb-4" />
            <p className="text-black/50 font-medium">{t('lecture.noSaved')}</p>
          </StaffPanel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {savedDecks.map((deck) => (
              <button
                key={deck.id}
                type="button"
                onClick={() => void openHistoryDeck(deck)}
                className="ios-glass rounded-2xl border border-white/70 p-5 text-left hover:border-[#083047]/20 transition-all"
              >
                <h3 className="font-bold text-[15px] line-clamp-2 mb-2 text-[#083047]">{deck.topic}</h3>
                <p className="text-[12px] text-black/45">
                  {deck.createdAt ? new Date(deck.createdAt).toLocaleDateString() : t('common.recently')}
                </p>
              </button>
            ))}
          </div>
        )}

        {historyDeck && (
          <div className="fixed inset-0 z-[200] flex flex-col bg-black/92" role="dialog" aria-modal="true">
            <header className="flex items-center justify-between px-4 py-3 text-white shrink-0 gap-2">
              <p className="text-[15px] font-semibold truncate flex-1">{historyDeck.title}</p>
              <button
                type="button"
                onClick={async () => {
                  const file = await buildPresentationPptxFile(historyDeck);
                  const url = URL.createObjectURL(file);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = file.name;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-[13px] font-semibold shrink-0"
              >
                <Download size={16} /> {t('common.download')}
              </button>
              <button
                type="button"
                onClick={() => setHistoryDeck(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0"
              >
                <X size={22} />
              </button>
            </header>
            <div className="flex-1 relative flex items-center justify-center min-h-0 px-2 pb-2">
              {historySlideIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setHistorySlideIdx((i) => i - 1)}
                  className="absolute left-2 z-10 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
                >
                  <ChevronLeft size={28} />
                </button>
              )}
              <div className="w-full h-full max-w-5xl mx-auto flex flex-col gap-4">
                <div className="flex-1 min-h-0 rounded-3xl bg-white/95 backdrop-blur-xl shadow-2xl p-8 sm:p-12 flex flex-col overflow-y-auto">
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#083047] mb-6">
                    {historyDeck.slides[historySlideIdx]?.title}
                  </h2>
                  {historyDeck.slides[historySlideIdx]?.imageUrl && (
                    <img
                      src={historyDeck.slides[historySlideIdx]?.imageUrl}
                      alt=""
                      className="max-h-64 rounded-xl object-contain mb-4 mx-auto"
                    />
                  )}
                  <ul className="space-y-2.5 text-[14px] sm:text-[15px] text-black/85">
                    {(historyDeck.slides[historySlideIdx]?.bullets ?? []).map((b, i) => (
                      <li key={i} className="flex gap-3 leading-snug">
                        <span className="text-orange-500 shrink-0 mt-0.5">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-center gap-1.5 shrink-0">
                  {historyDeck.slides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHistorySlideIdx(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === historySlideIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/55'
                      }`}
                    />
                  ))}
                </div>
              </div>
              {historySlideIdx < historyDeck.slides.length - 1 && (
                <button
                  type="button"
                  onClick={() => setHistorySlideIdx((i) => i + 1)}
                  className="absolute right-2 z-10 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white"
                >
                  <ChevronRight size={28} />
                </button>
              )}
            </div>
          </div>
        )}
      </StaffPageLayout>
    );
  }

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
          <button
            type="button"
            onClick={() => {
              refreshDeckHistory();
              setShowHistory(true);
            }}
            className={staffBtnGhost}
          >
            <History size={16} />
            {t('lecture.databaseShort')}
          </button>
        </div>
      </StaffTopicHeader>

      {error && <StaffErrorAlert message={error} />}

      {aiLoading && (
        <StaffPanel className="p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 text-sky-700">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <p className="text-[13px] font-semibold">{t('presentation.aiGenerating')}</p>
          </div>
          {aiProgress && (
            <p className="text-[11px] text-black/40 font-mono leading-relaxed line-clamp-4 break-all">
              {aiProgress.slice(-600)}
            </p>
          )}
        </StaffPanel>
      )}

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
