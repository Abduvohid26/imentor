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
import { aiService, LectureNote } from '../services/aiService';
import { GlobalTopicContext, GlobalLectureContext, AppLanguageContext } from '../App';
import { useUiText } from '../i18n/useUiText';
import Markdown from 'react-markdown';
import {
  listAllPreparedForKind,
  loadLatestPreparedContent,
  loadPreparedById,
  savePreparedContent,
  type PreparedContentSummary,
} from '../utils/preparedContentStore';

export default function LectureNotes() {
  const globalTopic = useContext(GlobalTopicContext);
  const globalLecture = useContext(GlobalLectureContext);
  const { language } = useContext(AppLanguageContext);
  const { t, locale } = useUiText();
  const topicTypeLabel = (type: 'lecture' | 'practical') =>
    type === 'lecture' ? t('lecture.typeLecture') : t('lecture.typePractical');
  const [topic, setTopic] = useState(globalTopic ? globalTopic.title : '');
  const [description, setDescription] = useState(
    globalTopic ? `${globalTopic.id} - ${topicTypeLabel(globalTopic.type)}` : '',
  );

  const [loading, setLoading] = useState(false);
  const [lectureSession, setLectureSession] = useState<LectureNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  const [savedLectures, setSavedLectures] = useState<PreparedContentSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const refreshHistory = useCallback(() => {
    setSavedLectures(listAllPreparedForKind('lecture'));
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
    try {
      const data = await aiService.generateLectureNotes(topic, description, language);

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
    }
  };

  const loadPastSession = (summary: PreparedContentSummary) => {
    const session = loadPreparedById<LectureNote>('lecture', summary.id);
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

  const handlePrint = () => {
    window.print();
  };

  if (showHistory) {
    return (
      <div className="h-full flex flex-col bg-[#f2f2f7] p-3 sm:p-5 lg:p-6 overflow-y-auto">
        <div className="w-full flex items-center justify-between mb-8">
          <button
            onClick={() => setShowHistory(false)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 transition-colors"
          >
            <ArrowLeft size={20} />
            {t('lecture.back')}
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <History className="text-blue-500" />
            {t('lecture.database')}
          </h2>
        </div>

        {savedLectures.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 text-center w-full">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
              <FileText size={40} />
            </div>
            <p className="text-gray-500 font-medium">{t('lecture.noSaved')}</p>
          </div>
        ) : (
          <div className="grid gap-4 w-full lg:grid-cols-2 xl:grid-cols-3">
            {savedLectures.map((lecture) => (
              <button
                key={lecture.id}
                onClick={() => loadPastSession(lecture)}
                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between hover:border-blue-300 hover:shadow-md transition-all text-left"
              >
                <div>
                  <h3 className="font-bold text-gray-800 text-lg mb-1">{lecture.topic}</h3>
                  <div className="flex items-center gap-4 text-sm font-medium text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <BookOpen size={14} /> {t('lecture.badge')}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                    <span>
                      {lecture.createdAt
                        ? new Date(lecture.createdAt).toLocaleDateString(locale)
                        : t('common.recently')}
                    </span>
                  </div>
                </div>
                <ArrowLeft className="text-gray-400 rotate-180" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#f2f2f7] p-3 sm:p-5 lg:p-6 overflow-y-auto">
      <div className="w-full space-y-8 pb-32">
        <div className="text-center space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full font-semibold text-sm mb-4">
            <FileText size={16} />
            {t('lecture.generateBadge')}
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
            {t('lecture.heroTitle')} <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">
              {t('lecture.heroHighlight')}
            </span>
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto font-medium">
            {t('lecture.heroSubtitleLong')}
          </p>
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white p-4 flex flex-col shadow-xl rounded-2xl border border-gray-100 gap-4 w-full"
        >
          <div className="space-y-3">
            <input
              type="text"
              className="px-5 py-4 w-full outline-none text-gray-800 font-medium placeholder:text-gray-400 bg-gray-50 rounded-xl border border-gray-200 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 transition-all"
              placeholder={t('lecture.topicPlaceholderShort')}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <input
              type="text"
              className="px-5 py-4 w-full outline-none text-gray-800 font-medium placeholder:text-gray-400 bg-gray-50 rounded-xl border border-gray-200 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 transition-all"
              placeholder={t('lecture.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <button
              onClick={handleGenerate}
              disabled={loading || !topic.trim()}
              className="flex-1 bg-gray-900 text-white px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
              {t('lecture.generateButton')}
            </button>
            <button
              onClick={() => {
                refreshHistory();
                setShowHistory(true);
              }}
              className="bg-emerald-50 text-emerald-600 px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
            >
              <History size={20} />
              {t('lecture.databaseShort')}
            </button>
          </div>
        </motion.div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl w-full text-center font-medium">
            {error}
          </div>
        )}

        {loading && (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 border-4 border-emerald-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-emerald-600 rounded-full border-t-transparent animate-spin"></div>
              <FileText size={28} className="absolute inset-0 m-auto text-emerald-600 animate-pulse" />
            </div>
            <p className="text-gray-500 font-medium animate-pulse text-lg">
              {t('lecture.generating')}
            </p>
            <p className="text-gray-400 text-sm mt-2 max-w-md text-center">
              {t('lecture.generatingHint')}
            </p>
          </div>
        )}

        {lectureSession && !loading && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-800 flex-1">{lectureSession.topic}</h2>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-colors ${
                    isEditing
                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <FileText size={18} />
                  <span>{isEditing ? t('lecture.view') : t('lecture.edit')}</span>
                </button>
                <button
                  onClick={handleCopy}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors disabled:opacity-50"
                  title={t('lecture.copyTitle')}
                >
                  {copied ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
                  <span>{copied ? t('lecture.copied') : t('lecture.copy')}</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-semibold transition-colors disabled:opacity-50"
                  title={t('lecture.printTitle')}
                >
                  <Download size={18} />
                  <span>{t('lecture.print')}</span>
                </button>
              </div>
            </div>

            <div ref={printRef} className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-gray-100">
              {isEditing ? (
                <div className="flex flex-col gap-4">
                  <textarea
                    value={editedContent}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditedContent(v);
                      globalLecture.setContent(v);
                    }}
                    className="w-full h-[600px] p-6 text-gray-800 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-300 transition-all font-mono text-sm leading-relaxed"
                  />
                  <div className="flex justify-end">
                    <button
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
                      className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                    >
                      {t('lecture.saveChanges')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-emerald prose-lg max-w-none text-gray-800 prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-xl prose-a:text-emerald-600 hover:prose-a:text-emerald-500 prose-img:rounded-xl">
                  <Markdown>{lectureSession.content}</Markdown>
                </div>
              )}
            </div>

            <style>{`
              @media print {
                body * {
                  visibility: hidden;
                }
                .prose, .prose * {
                  visibility: visible;
                }
                .prose {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                  padding: 20px;
                }
              }
            `}</style>

            <div className="flex justify-center pt-2">
              <button
                onClick={() => {
                  setLectureSession(null);
                  setEditedContent('');
                  setError(null);
                }}
                className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors"
              >
                {t('lecture.createNew')}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
