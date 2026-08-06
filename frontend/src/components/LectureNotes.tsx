import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import {
  FileText,
  Sparkles,
  Loader2,
  History,
  Download,
  ArrowLeft,
  Copy,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import { aiService, LectureNote } from '../services/aiService';
import {
  GlobalTopicContext,
  GlobalLectureContext,
  AppLanguageContext,
  AppNavigationContext,
} from '../App';
import { useUiText } from '../i18n/useUiText';
import { isTopicContextComplete } from '../utils/syllabusTopicContext';
import {
  listAllPreparedForKindSynced,
  loadLatestPreparedContent,
  loadPreparedByIdSynced,
  savePreparedContent,
  type PreparedContentSummary,
} from '../utils/preparedContentStore';
import StaffPageLayout from './staff/StaffPageLayout';
import StaffTopicHeader from './staff/StaffTopicHeader';
import StaffEmptyState from './staff/StaffEmptyState';
import StaffErrorAlert from './staff/StaffErrorAlert';
import StaffLoading from './staff/StaffLoading';
import StaffPanel from './staff/StaffPanel';
import {
  staffBtnGhost,
  staffBtnPrimary,
  staffBtnSecondary,
  staffInput,
  staffLabel,
  staffProse,
  STAFF_HEADING,
} from './staff/staffUi';

export default function LectureNotes() {
  const globalTopic = useContext(GlobalTopicContext);
  const globalLecture = useContext(GlobalLectureContext);
  const { language } = useContext(AppLanguageContext);
  const { openSyllabus } = useContext(AppNavigationContext);
  const { t, locale } = useUiText();
  const topicTypeLabel = (type: 'lecture' | 'practical') =>
    type === 'lecture' ? t('lecture.typeLecture') : t('lecture.typePractical');
  const [topic, setTopic] = useState(globalTopic ? globalTopic.title : '');
  const [description, setDescription] = useState(
    globalTopic ? `${globalTopic.id} - ${topicTypeLabel(globalTopic.type)}` : '',
  );

  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [lectureSession, setLectureSession] = useState<LectureNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [savedLectures, setSavedLectures] = useState<PreparedContentSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const topicFromSyllabus = Boolean(globalTopic && isTopicContextComplete(globalTopic));
  const staffTopic = topicFromSyllabus && globalTopic ? globalTopic : null;

  const refreshHistory = useCallback(() => {
    void listAllPreparedForKindSynced('lecture').then(setSavedLectures);
  }, []);

  useEffect(() => {
    if (globalTopic) {
      setTopic(globalTopic.title);
      setDescription(`${globalTopic.id} - ${topicTypeLabel(globalTopic.type)}`);
    }
  }, [globalTopic]);

  useEffect(() => {
    if (!topic.trim()) {
      setLectureSession(null);
      setEditedContent('');
      globalLecture.setContent('');
      return;
    }
    setLectureSession(null);
    setEditedContent('');
    globalLecture.setContent('');
    let mounted = true;
    (async () => {
      const prepared = await loadLatestPreparedContent<LectureNote>('lecture', topic);
      if (!mounted) return;
      if (!prepared) return;
      setLectureSession(prepared);
      setEditedContent(prepared.content || '');
      globalLecture.setContent(prepared.content || '');
    })();
    return () => {
      mounted = false;
    };
  }, [topic, globalLecture]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setStreamingContent('');
    try {
      // Foydalanuvchi UI'da tanlagan til ustuvor — mavzuning o'z
      // instructionLanguage'idan qat'iy nazar (masalan syllabus fayli "uz"
      // bo'lsa ham, foydalanuvchi "Русский"ni tanlagan bo'lsa shu tilda
      // yaratiladi).
      const contentLanguage = language;
      const data = await aiService.generateLectureNotes(
        topic,
        description,
        contentLanguage,
        globalTopic?.subjectCode,
        (textSoFar) => setStreamingContent(textSoFar),
      );
      setLectureSession(data);
      setEditedContent(data.content);
      globalLecture.setContent(data.content);
      await savePreparedContent('lecture', topic, data);
      refreshHistory();
    } catch (err) {
      console.error('Lecture generation error:', err);
      setError(t('lecture.errorGenerate'));
    } finally {
      setLoading(false);
      setStreamingContent('');
    }
  };

  const loadPastSession = async (summary: PreparedContentSummary) => {
    const session = await loadPreparedByIdSynced<LectureNote>('lecture', summary.id);
    if (!session) return;
    setLectureSession(session);
    setTopic(session.topic);
    setEditedContent(session.content);
    globalLecture.setContent(session.content);
    setShowHistory(false);
  };

  const handleCopy = async () => {
    if (!lectureSession) return;
    try {
      await navigator.clipboard.writeText(lectureSession.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
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
          <h2 className={`text-lg font-bold flex items-center gap-2 ${STAFF_HEADING}`}>
            <History size={20} />
            {t('lecture.database')}
          </h2>
        </div>
        {savedLectures.length === 0 ? (
          <StaffPanel className="p-10 text-center">
            <FileText size={40} className="mx-auto text-black/20 mb-4" />
            <p className="text-black/50 font-medium">{t('lecture.noSaved')}</p>
          </StaffPanel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {savedLectures.map((lecture) => (
              <button
                key={lecture.id}
                type="button"
                onClick={() => loadPastSession(lecture)}
                className="ios-glass rounded-2xl border border-white/70 p-5 text-left hover:border-[#083047]/20 transition-all"
              >
                <h3 className={`font-bold text-[15px] line-clamp-2 mb-2 ${STAFF_HEADING}`}>
                  {lecture.topic}
                </h3>
                <p className="text-[12px] text-black/45">
                  {lecture.createdAt
                    ? new Date(lecture.createdAt).toLocaleDateString(locale)
                    : t('common.recently')}
                </p>
              </button>
            ))}
          </div>
        )}
      </StaffPageLayout>
    );
  }

  if (!topicFromSyllabus && !topic.trim()) {
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
        moduleLabel={t('lecture.generateBadge')}
        topic={staffTopic}
        actions={
          <button
            type="button"
            onClick={() => {
              refreshHistory();
              setShowHistory(true);
            }}
            className={staffBtnGhost}
          >
            <History size={16} />
            {t('lecture.databaseShort')}
          </button>
        }
      >
        {!topicFromSyllabus && (
          <input
            type="text"
            className={staffInput}
            placeholder={t('lecture.topicPlaceholderShort')}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        )}
        <label className="block space-y-1.5">
          <span className={staffLabel}>{t('lecture.contextLabel')}</span>
          <input
            type="text"
            className={staffInput}
            placeholder={t('lecture.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !topic.trim()}
          className={staffBtnPrimary}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {t('lecture.generateButton')}
        </button>
      </StaffTopicHeader>

      {error && <StaffErrorAlert message={error} />}
      {loading && !streamingContent && (
        <StaffLoading label={t('lecture.generating')} hint={t('lecture.generatingHint')} />
      )}

      {loading && streamingContent && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <StaffPanel className="p-4 sm:p-5 flex items-center gap-2 text-sky-700">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <p className="text-[13px] font-semibold">{t('lecture.generating')}</p>
          </StaffPanel>
          <StaffPanel className="p-6 sm:p-8 lg:p-10" large>
            <article className={staffProse}>
              <Markdown>{streamingContent}</Markdown>
            </article>
          </StaffPanel>
        </motion.div>
      )}

      {lectureSession && !loading && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <StaffPanel className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className={`text-[16px] font-bold line-clamp-2 ${STAFF_HEADING}`}>{lectureSession.topic}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIsEditing(!isEditing)} className={staffBtnGhost}>
                <FileText size={15} />
                {isEditing ? t('lecture.view') : t('lecture.edit')}
              </button>
              <button type="button" onClick={handleCopy} className={staffBtnGhost}>
                {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                {copied ? t('lecture.copied') : t('lecture.copy')}
              </button>
              <button type="button" onClick={() => window.print()} className={staffBtnPrimary}>
                <Download size={15} />
                {t('lecture.print')}
              </button>
            </div>
          </StaffPanel>

          <StaffPanel className="p-6 sm:p-8 lg:p-10" large>
            {isEditing ? (
              <div className="space-y-4">
                <textarea
                  value={editedContent}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditedContent(v);
                    globalLecture.setContent(v);
                  }}
                  className={`${staffInput} min-h-[480px] font-sans leading-relaxed`}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      setLectureSession({ ...lectureSession, content: editedContent });
                      globalLecture.setContent(editedContent);
                      await savePreparedContent('lecture', lectureSession.topic, {
                        ...lectureSession,
                        content: editedContent,
                      });
                      refreshHistory();
                      setIsEditing(false);
                    }}
                    className={staffBtnPrimary}
                  >
                    {t('lecture.saveChanges')}
                  </button>
                </div>
              </div>
            ) : (
              <article ref={printRef} className={staffProse}>
                <Markdown>{lectureSession.content}</Markdown>
              </article>
            )}
          </StaffPanel>

          <style>{`
            @media print {
              body * { visibility: hidden; }
              .staff-prose, .staff-prose * { visibility: visible; }
              .staff-prose { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
            }
          `}</style>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setLectureSession(null);
                setEditedContent('');
                setError(null);
              }}
              className={staffBtnSecondary}
            >
              {t('lecture.createNew')}
            </button>
          </div>
        </motion.div>
      )}
    </StaffPageLayout>
  );
}
