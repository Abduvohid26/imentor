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
import { buildPresentationPptxFile } from '../utils/buildPresentationPptx';
import {
  coercePresentationContent,
  slidePreviewBullets,
  type ContentSlide,
  type PresentationContent,
} from '../utils/presentationContentSchema';
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

const SLIDE_TYPE_LABEL: Record<string, string> = {
  title: 'Title',
  agenda: 'Agenda',
  content_bullets: 'Content',
  two_column: 'Two column',
  image_focus: 'Image',
  comparison_table: 'Comparison',
  statistics: 'Statistics',
  process_flow: 'Process',
  quote: 'Quote',
  case_study: 'Case study',
  summary: 'Summary',
  references: 'References',
};

/** Brauzer preview — slide_type bo‘yicha (faqat bullet emas). */
function DeckSlidePreview({ slide }: { slide: ContentSlide }) {
  const type = slide.slide_type;
  const body = slide.body || {};
  const typeLabel = SLIDE_TYPE_LABEL[type] || type;

  return (
    <div className="flex-1 min-h-0 rounded-3xl bg-white/95 backdrop-blur-xl shadow-2xl p-8 sm:p-12 flex flex-col overflow-y-auto">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-[#0B6E99]/12 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#0B6E99]">
          {typeLabel}
        </span>
        {slide.subtitle ? (
          <span className="text-[12px] text-black/45 truncate">{slide.subtitle}</span>
        ) : null}
      </div>

      {type === 'title' ? (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#083047] leading-tight">{slide.title}</h2>
          {slide.subtitle ? <p className="text-lg text-black/55">{slide.subtitle}</p> : null}
        </div>
      ) : (
        <h2 className="text-2xl sm:text-3xl font-bold text-[#083047] mb-6">{slide.title}</h2>
      )}

      {slide.imageUrl ? (
        <img
          src={slide.imageUrl}
          alt=""
          className="max-h-52 rounded-xl object-contain mb-4 mx-auto"
        />
      ) : null}

      {type === 'statistics' && (body.stats?.length || body.key_stat) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(body.stats?.length ? body.stats : body.key_stat ? [body.key_stat] : []).map((st, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[#0B6E99]/15 bg-[#0B6E99]/5 px-5 py-4"
            >
              <div className="text-3xl font-bold text-[#0B6E99]">{st.number}</div>
              <div className="mt-1 text-[14px] text-black/70 leading-snug">{st.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {type === 'comparison_table' && body.comparison_rows?.length ? (
        <div className="overflow-x-auto rounded-xl border border-black/10">
          <table className="w-full text-left text-[13px] sm:text-[14px]">
            <thead className="bg-[#083047] text-white">
              <tr>
                <th className="px-3 py-2 font-semibold">Mezon</th>
                <th className="px-3 py-2 font-semibold">Chap</th>
                <th className="px-3 py-2 font-semibold">Oʻng</th>
              </tr>
            </thead>
            <tbody>
              {body.comparison_rows.map((row, i) => (
                <tr key={i} className={i % 2 ? 'bg-black/[0.03]' : ''}>
                  <td className="px-3 py-2 font-medium text-[#083047]">{row.criteria}</td>
                  <td className="px-3 py-2 text-black/80">{row.left}</td>
                  <td className="px-3 py-2 text-black/80">{row.right}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {type === 'process_flow' && body.process_steps?.length ? (
        <ol className="space-y-3">
          {body.process_steps.map((step) => (
            <li key={step.step_number} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B6E99] text-[13px] font-bold text-white">
                {step.step_number}
              </span>
              <div>
                <div className="font-semibold text-[#083047]">{step.label}</div>
                {step.description ? (
                  <div className="text-[13px] text-black/65 leading-snug">{step.description}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {type === 'two_column' && body.columns?.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {body.columns.map((col, i) => (
            <div key={i} className="rounded-xl border border-black/10 p-4">
              <h3 className="mb-2 font-bold text-[#083047]">{col.heading}</h3>
              <ul className="space-y-1.5 text-[13px] text-black/80">
                {(col.points || []).map((p, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="text-[#0B6E99]">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {type === 'quote' && body.quote_text ? (
        <blockquote className="border-l-4 border-[#0B6E99] pl-4 text-lg italic text-black/80">
          {body.quote_text}
          {body.quote_author ? (
            <footer className="mt-2 text-[13px] not-italic text-black/50">— {body.quote_author}</footer>
          ) : null}
        </blockquote>
      ) : null}

      {type === 'case_study' ? (
        <div className="mb-3 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800">
          Case study
        </div>
      ) : null}

      {(type === 'agenda' ||
        type === 'content_bullets' ||
        type === 'image_focus' ||
        type === 'case_study' ||
        type === 'summary' ||
        type === 'references' ||
        (!body.stats?.length &&
          !body.comparison_rows?.length &&
          !body.process_steps?.length &&
          !body.columns?.length &&
          !body.quote_text &&
          type !== 'title')) &&
      slidePreviewBullets(slide).length ? (
        <ul className="space-y-2.5 text-[14px] sm:text-[15px] text-black/85">
          {slidePreviewBullets(slide).map((b, i) => (
            <li key={i} className="flex gap-3 leading-snug">
              {type === 'agenda' || type === 'summary' ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0B6E99]/15 text-[12px] font-bold text-[#0B6E99]">
                  {i + 1}
                </span>
              ) : (
                <span className="text-[#0B6E99] shrink-0 mt-0.5">•</span>
              )}
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {slide.speaker_notes && type === 'title' ? (
        <p className="mt-auto pt-6 text-[13px] text-black/45 leading-relaxed">{slide.speaker_notes}</p>
      ) : null}
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
  const [deck, setDeck] = useState<PresentationContent | null>(null);
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
      const found = await loadLatestPreparedContent<unknown>('presentation', lookupTitle);
      if (!cancelled) {
        if (found && typeof found === 'object') {
          const coerced = coercePresentationContent(found, {
            title: lookupTitle,
            subject: '',
          });
          setDeck(coerced.slides.length ? coerced : null);
        } else {
          setDeck(null);
        }
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
              {deck.slides[slideIdx] ? <DeckSlidePreview slide={deck.slides[slideIdx]} /> : null}
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
  const [historyDeck, setHistoryDeck] = useState<PresentationContent | null>(null);
  const [historySlideIdx, setHistorySlideIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshDeckHistory = useCallback(() => {
    void listAllPreparedForKindSynced('presentation').then(setSavedDecks);
  }, []);

  const openHistoryDeck = async (summary: PreparedContentSummary) => {
    const raw = await loadPreparedByIdSynced<unknown>('presentation', summary.id);
    if (!raw) return;
    setHistoryDeck(
      coercePresentationContent(raw, {
        title: summary.topic,
        subject: globalTopic?.subjectName || '',
      }),
    );
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
      // Enhance FAQAT o'qituvchi yuklagan PDF manba bo'lsa.
      // Avvalgi AI PPTX borligi enhance qilmasin — aks holda eski bullet-uslub
      // qayta ishlanib "yangi" taqdimot ham eski ko'rinishda chiqardi.
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
      const useEnhance = Boolean(pdfItem && sourceText.trim());
      const deck = await aiService.generatePresentationDeck({
        topicTitle: globalTopic.title,
        topicId: globalTopic.id,
        topicType: globalTopic.type,
        subjectName: globalTopic.subjectName,
        variantLabel: globalTopic.variantLabel,
        // Foydalanuvchi UI'da tanlagan til ustuvor (lekin bilan bir xil qoida).
        language,
        mode: useEnhance ? 'enhance' : 'generate',
        sourceFileName: useEnhance ? pdfItem?.file_name : undefined,
        sourceText: useEnhance ? sourceText : undefined,
        subjectCode: globalTopic.subjectCode,
        onProgress: (textSoFar) => setAiProgress(textSoFar),
      });
      const file = await buildPresentationPptxFile(deck, {
        meta: {
          subjectName: globalTopic.subjectName,
          topicId: globalTopic.id,
          variantLabel: globalTopic.variantLabel,
        },
      });
      if (!file.size) {
        throw new Error('empty-pptx');
      }
      try {
        await savePreparedContent('presentation', deck.presentation_title, deck, {
          subjectName: globalTopic.subjectName,
          subjectCode: globalTopic.subjectCode,
          variantLabel: globalTopic.variantLabel,
          topicCode: globalTopic.id,
        });
        refreshDeckHistory();
      } catch (histErr) {
        console.warn('Presentation history save skipped:', histErr);
      }
      const shortTopic =
        [globalTopic.id, globalTopic.title].filter(Boolean).join(' — ').slice(0, 240) || topicTitle;
      await uploadPresentation({
        topic: shortTopic,
        file,
        title: (deck.presentation_title || shortTopic).slice(0, 240),
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
              <p className="text-[15px] font-semibold truncate flex-1">
                {historyDeck.presentation_title}
              </p>
              <button
                type="button"
                onClick={async () => {
                  const file = await buildPresentationPptxFile(historyDeck, {
                    meta: {
                      subjectName: globalTopic?.subjectName || historyDeck.subject_area,
                      topicId: globalTopic?.id || 'T',
                      variantLabel: globalTopic?.variantLabel,
                    },
                  });
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
                {historyDeck.slides[historySlideIdx] ? (
                  <DeckSlidePreview slide={historyDeck.slides[historySlideIdx]} />
                ) : null}
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
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <StaffPanel className="p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-600/10 text-sky-700 flex items-center justify-center shrink-0">
                <Sparkles size={20} className="animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-[#083047]">{t('presentation.aiGenerating')}</p>
                {aiProgress ? (
                  <p className="text-[12px] text-sky-700 font-semibold mt-0.5 truncate">{aiProgress}</p>
                ) : null}
              </div>
              <Loader2 size={18} className="animate-spin text-sky-600 shrink-0" />
            </div>
          </StaffPanel>
        </motion.div>
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
