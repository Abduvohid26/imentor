import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
  Stethoscope,
  Loader2,
  AlertCircle,
  FileText,
  RefreshCw,
  KeyRound,
  Tags,
} from 'lucide-react';
import { motion } from 'motion/react';
import { aiService, CaseStudySession } from '../services/aiService';
import { AppLanguageContext, GlobalTopicContext } from '../App';
import { useUiText } from '../i18n/useUiText';
import { getCurrentLocalUser, normalizeUserRole } from '../utils/localStaffAuth';
import { appendCaseStudyToLibrary } from '../utils/staffContentLibrary';
import {
  listPreparedForTopic,
  loadLatestPreparedContent,
  loadPreparedById,
  savePreparedContent,
  type PreparedContentSummary,
} from '../utils/preparedContentStore';
import { buildPreparedContentMeta } from '../utils/preparedContentMeta';
import ContentTopicToolbar from './staff/ContentTopicToolbar';
import { messageFromAiError } from '../utils/aiErrors';
import MedicalReferencesList from './staff/MedicalReferencesList';
import { parseKeywordsInput } from '../utils/generationVariety';
import { downloadCaseAnswerKeyPdf, downloadCaseScenariosPdf } from '../utils/buildCasePdf';
import { caseFocusBadgeClass, caseFocusLabel } from '../utils/caseFocusLabels';

export default function CaseStudies() {
  const globalTopic = useContext(GlobalTopicContext);
  const { language } = useContext(AppLanguageContext);
  const { t } = useUiText();
  const [topic, setTopic] = useState(globalTopic ? globalTopic.title : '');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadingCasesPdf, setDownloadingCasesPdf] = useState(false);
  const [downloadingKeyPdf, setDownloadingKeyPdf] = useState(false);
  const [caseSession, setCaseSession] = useState<CaseStudySession | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<boolean[]>([]);
  const [versions, setVersions] = useState<PreparedContentSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshVersions = useCallback(() => {
    if (!topic.trim()) {
      setVersions([]);
      return;
    }
    setVersions(listPreparedForTopic('case', topic));
  }, [topic]);

  const applySession = useCallback((data: CaseStudySession, versionId: string | null) => {
    setCaseSession(data);
    setRevealedAnswers(new Array(data.questions.length).fill(false));
    setActiveVersionId(versionId);
    if (data.keywords?.length) {
      setKeywords(data.keywords.join(', '));
    }
  }, []);

  useEffect(() => {
    if (globalTopic) {
      setTopic(globalTopic.title);
    }
  }, [globalTopic]);

  useEffect(() => {
    refreshVersions();
  }, [refreshVersions]);

  useEffect(() => {
    if (!topic.trim()) {
      setCaseSession(null);
      setActiveVersionId(null);
      return;
    }
    let mounted = true;
    (async () => {
      const prepared = await loadLatestPreparedContent<CaseStudySession>('case', topic);
      if (!mounted) return;
      refreshVersions();
      if (!prepared) {
        setCaseSession(null);
        setActiveVersionId(null);
        return;
      }
      const list = listPreparedForTopic('case', topic);
      const latestId = list[0]?.id ?? null;
      applySession(prepared, latestId);
    })();
    return () => {
      mounted = false;
    };
  }, [topic, applySession, refreshVersions]);

  const handleSelectVersion = async (id: string) => {
    const data = loadPreparedById<CaseStudySession>('case', id);
    if (data) applySession(data, id);
  };

  const parsedKeywords = useMemo(() => parseKeywordsInput(keywords), [keywords]);
  const contentLanguage = globalTopic?.instructionLanguage ?? language;

  const handleGenerate = async (currentTopic: string = topic) => {
    if (!currentTopic.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await aiService.generateCaseStudy(currentTopic, contentLanguage, parsedKeywords);
      await savePreparedContent('case', currentTopic, data, buildPreparedContentMeta(globalTopic));
      refreshVersions();
      const list = listPreparedForTopic('case', currentTopic);
      applySession(data, list[0]?.id ?? null);
      try {
        const u = getCurrentLocalUser();
        if (u && normalizeUserRole(u) === 'hodim') {
          appendCaseStudyToLibrary({
            authorUid: u.uid,
            authorName: u.displayName,
            session: data,
          });
        }
      } catch {
        /* bazaga yozish ixtiyoriy */
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(messageFromAiError(err, t('case.errorGenerate'), language));
    } finally {
      setLoading(false);
    }
  };

  const handleRevealAnswer = (qIndex: number) => {
    setRevealedAnswers((prev) => {
      const next = [...prev];
      next[qIndex] = !next[qIndex];
      return next;
    });
  };

  const handleDownloadCasesPdf = async () => {
    if (!caseSession) return;
    setDownloadingCasesPdf(true);
    try {
      await downloadCaseScenariosPdf(caseSession, language);
    } catch (err) {
      console.error('Case PDF error:', err);
      setError(t('case.errorPdf'));
    } finally {
      setDownloadingCasesPdf(false);
    }
  };

  const handleDownloadKeyPdf = async () => {
    if (!caseSession) return;
    setDownloadingKeyPdf(true);
    try {
      await downloadCaseAnswerKeyPdf(caseSession, language);
    } catch (err) {
      console.error('Case key PDF error:', err);
      setError(t('case.errorPdf'));
    } finally {
      setDownloadingKeyPdf(false);
    }
  };

  return (
    <div className="w-full px-3 sm:px-5 lg:px-6 space-y-6 pb-20 print:p-0 print:max-w-none print:m-0">
      <ContentTopicToolbar
        topic={topic}
        onTopicChange={setTopic}
        topicLabel={t('case.topicLabel')}
        topicPlaceholder={t('case.topicPlaceholder')}
        createLabel={t('case.create')}
        loading={loading}
        onCreate={() => void handleGenerate(topic)}
        accent="emerald"
        versions={versions}
        activeVersionId={activeVersionId}
        onSelectVersion={(id) => void handleSelectVersion(id)}
        versionsTitle={t('case.savedVersions')}
      />

      <div className="ios-glass rounded-2xl border border-white/60 p-4 space-y-2 print:hidden">
        <label className="flex items-center gap-2 text-[13px] font-semibold text-black/70">
          <Tags size={16} className="text-emerald-600" />
          {t('case.keywordsLabel')}
          <span className="text-[11px] font-medium text-black/40">({t('case.keywordsOptional')})</span>
        </label>
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={t('case.keywordsPlaceholder')}
          disabled={loading}
          className="w-full px-4 py-3 rounded-xl border border-black/10 bg-white/80 text-[14px] outline-none focus:ring-2 focus:ring-emerald-400/40"
        />
        <p className="text-[11px] text-black/45">{t('case.keywordsHint')}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-600 text-[12px] font-semibold bg-rose-500/10 px-4 py-3 rounded-xl border border-rose-500/20 print:hidden">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading && (
        <div className="ios-glass p-12 rounded-[2rem] flex flex-col items-center gap-4 print:hidden">
          <Loader2 className="animate-spin text-emerald-600" size={36} />
          <p className="text-[14px] font-medium text-black/60">{t('case.generating')}</p>
        </div>
      )}

      {!loading && !caseSession && topic.trim() && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="ios-glass p-10 rounded-[2rem] text-center flex flex-col items-center gap-4 print:hidden"
        >
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-600">
            <Stethoscope strokeWidth={2} size={28} />
          </div>
          <p className="text-[14px] text-black/55 max-w-md">
            {t('case.noSavedHint', { action: t('case.create') })}
          </p>
        </motion.div>
      )}

      {!loading && caseSession && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex items-center justify-between ios-glass p-3 rounded-[1.5rem] shadow-sm print:hidden flex-wrap gap-2">
            <div className="flex items-center gap-2 font-mono text-[12px] font-medium text-black/40">
              {t('case.viewLabel')}: <span className="font-bold text-black/70">{caseSession.topic}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void handleGenerate(topic)}
                disabled={loading}
                className="px-4 py-2 flex items-center gap-2 text-[13px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200"
              >
                <RefreshCw size={16} />
                {t('case.regenerate')}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadCasesPdf()}
                disabled={downloadingCasesPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[13px] font-semibold hover:bg-emerald-100 disabled:opacity-50"
              >
                {downloadingCasesPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {t('case.downloadCasesPdf')}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadKeyPdf()}
                disabled={downloadingKeyPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-[13px] font-semibold hover:bg-blue-100 disabled:opacity-50"
              >
                {downloadingKeyPdf ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                {t('case.downloadKeyPdf')}
              </button>
            </div>
          </div>

          {caseSession.keywords && caseSession.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 print:hidden">
              {caseSession.keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-800 text-[12px] font-semibold border border-emerald-500/20"
                >
                  <Tags size={12} /> {kw}
                </span>
              ))}
            </div>
          )}

          <div
            className="ios-glass rounded-[2rem] overflow-hidden shadow-lg border border-white/60 print:shadow-none print:border-none print:bg-transparent"
          >
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-8 border-b border-white/40 relative overflow-hidden print:bg-none print:border-b-2 print:border-black/10">
              <div className="flex items-center gap-3 mb-4 relative z-10">
                <div className="w-8 h-8 rounded-xl bg-white/60 shadow-sm border border-white flex items-center justify-center text-emerald-600 print:border-emerald-600">
                  <FileText size={16} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-600/70 print:text-black">
                  TIBBIY KEYSLAR TO&apos;PLAMI
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-black/90 relative z-10 leading-tight pr-10">
                {caseSession.topic}
              </h1>
            </div>

            <div className="p-8 space-y-10 bg-white/40 print:bg-transparent">
              {caseSession.references && caseSession.references.length > 0 && (
                <MedicalReferencesList references={caseSession.references} className="print:break-inside-avoid" />
              )}
              <div className="space-y-12">
                {caseSession.questions.map((q, i) => (
                  <div key={i} className="space-y-5 print:break-inside-avoid">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <span className="w-8 h-8 rounded-[10px] bg-emerald-500/10 flex items-center justify-center text-emerald-700 text-[13px] font-bold border border-emerald-500/20">
                          {i + 1}
                        </span>
                        {q.focus && (
                          <span
                            className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wide ${caseFocusBadgeClass(q.focus)}`}
                          >
                            {caseFocusLabel(q.focus, language)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-4 flex-1">
                        <p className="font-medium text-black/90 text-[15px] leading-relaxed pt-1 whitespace-pre-wrap">
                          {q.scenario}
                        </p>
                        <div className="pt-2 print:hidden">
                          <button
                            type="button"
                            onClick={() => handleRevealAnswer(i)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-500 transition-all"
                          >
                            {revealedAnswers[i] ? 'Javobni yashirish' : 'Javobni aniqlash'}
                          </button>
                        </div>
                        {revealedAnswers[i] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-blue-500/5 mt-4 rounded-xl p-5 border border-blue-500/10 border-l-4 border-l-blue-500"
                          >
                            <h4 className="text-[12px] font-bold text-blue-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                              <AlertCircle size={16} />
                              Keys javobi:
                            </h4>
                            <p className="text-[14px] text-blue-900/80 leading-relaxed font-medium whitespace-pre-wrap">{q.answer}</p>
                            {q.references && q.references.length > 0 && (
                              <div className="mt-4">
                                <MedicalReferencesList
                                  references={q.references}
                                  title={t('case.questionReferences')}
                                  compact
                                />
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
