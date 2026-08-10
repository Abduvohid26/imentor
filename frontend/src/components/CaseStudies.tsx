import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { pushAppNotification } from '../utils/notifications';
import {
  Stethoscope,
  Loader2,
  FileText,
  RefreshCw,
  KeyRound,
  Tags,
  ShieldCheck,
  Pill,
  Search,
  Eye,
  EyeOff,
} from 'lucide-react';
import { motion } from 'motion/react';
import { aiService, CaseStudySession } from '../services/aiService';
import { AppLanguageContext, GlobalTopicContext } from '../App';
import { useUiText } from '../i18n/useUiText';
import { getCurrentLocalUser, normalizeUserRole } from '../utils/localStaffAuth';
import { appendCaseStudyToLibrary } from '../utils/staffContentLibrary';
import {
  listPreparedForTopicSynced,
  loadLatestPreparedContent,
  loadPreparedByIdSynced,
  savePreparedContent,
  type PreparedContentSummary,
} from '../utils/preparedContentStore';
import { buildPreparedContentMeta } from '../utils/preparedContentMeta';
import ContentTopicToolbar, { StaffToolbarButton } from './staff/ContentTopicToolbar';
import { useLocalizedTopic } from '../i18n/useLocalizedTopic';
import StaffPageLayout from './staff/StaffPageLayout';
import StaffErrorAlert from './staff/StaffErrorAlert';
import StaffLoading from './staff/StaffLoading';
import StaffPanel from './staff/StaffPanel';
import { isTopicContextComplete } from '../utils/syllabusTopicContext';
import LinkifiedText from './staff/LinkifiedText';
import { staffInput, staffLabel, staffBtnSecondary, STAFF_HEADING } from './staff/staffUi';
import { messageFromAiError } from '../utils/aiErrors';
import { parseKeywordsInput } from '../utils/generationVariety';
import { downloadCaseAnswerKeyPdf, downloadCaseScenariosPdf } from '../utils/buildCasePdf';
import {
  caseFocusAccentBorderClass,
  caseFocusBadgeClass,
  caseFocusIconBgClass,
  caseFocusLabel,
} from '../utils/caseFocusLabels';
import type { CaseStudyFocus } from '../utils/generationVariety';

const CASE_FOCUS_ICONS: Record<CaseStudyFocus, typeof ShieldCheck> = {
  profilaktika: ShieldCheck,
  davolash: Pill,
  tashxis: Search,
};

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
    void listPreparedForTopicSynced('case', globalTopic ?? topic).then(setVersions);
  }, [topic, globalTopic]);

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
    const lookup = globalTopic ?? topic;
    // Sahifa TOZA ochiladi — avval yaratilgan keys avtomatik ochilmaydi.
    // Shu mavzuda saqlangani bo'lsa, tepadagi banner orqali Bazadan ochiladi.
    (async () => {
      const list = await listPreparedForTopicSynced('case', lookup);
      if (!mounted) return;
      setVersions(list);
      setCaseSession(null);
      setActiveVersionId(null);
    })();
    return () => {
      mounted = false;
    };
  }, [topic, globalTopic, applySession]);

  const handleSelectVersion = async (id: string) => {
    const data = await loadPreparedByIdSynced<CaseStudySession>('case', id);
    if (data) applySession(data, id);
  };

  const parsedKeywords = useMemo(() => parseKeywordsInput(keywords), [keywords]);
  // Ma'ruza va Taqdimot bilan bir xil: kontent INTERFEYS tilida yaratiladi
  // (ilgari sillabusning o'qitish tili olinardi va bo'limlar mos kelmasdi).
  const contentLanguage = language;

  const handleGenerate = async (currentTopic: string = topic) => {
    if (!currentTopic.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await aiService.generateCaseStudy(currentTopic, contentLanguage, parsedKeywords, globalTopic?.subjectCode);
      // Avval ekranga chiqaramiz: generatsiya bir necha daqiqa vaqt va pul
      // oladi, saqlash yiqilsa ham natija foydalanuvchida qolishi kerak.
      applySession(data, null);
      try {
        await savePreparedContent('case', currentTopic, data, buildPreparedContentMeta(globalTopic));
        pushAppNotification({ title: t('common.doneTitle'), body: t('case.readyToast'), level: 'success' });
        const list = await listPreparedForTopicSynced('case', globalTopic ?? currentTopic);
        setVersions(list);
        applySession(data, list[0]?.id ?? null);
      } catch (saveErr) {
        console.error('Case save failed', saveErr);
        setError(t('common.saveFailedKeepWork'));
      }
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

  const staffTopic = useLocalizedTopic(
    globalTopic && isTopicContextComplete(globalTopic) ? globalTopic : null,
  );

  return (
    <StaffPageLayout spacious className="print:p-0 print:max-w-none print:m-0">
      <ContentTopicToolbar
        moduleLabel={t('case.create')}
        topic={staffTopic}
        topicValue={topic}
        onTopicChange={setTopic}
        topicLabel={t('case.topicLabel')}
        topicPlaceholder={t('case.topicPlaceholder')}
        createLabel={t('case.create')}
        loading={loading}
        onCreate={() => void handleGenerate(topic)}
        lockTopicFromSyllabus={Boolean(staffTopic)}
        versions={versions}
        activeVersionId={activeVersionId}
        onSelectVersion={(id) => void handleSelectVersion(id)}
        versionsTitle={t('case.savedVersions')}
        extra={
          <div className="space-y-2">
            <label className={`flex items-center gap-2 ${staffLabel}`}>
              <Tags size={14} />
              {t('case.keywordsLabel')}
              <span className="text-black/35">({t('case.keywordsOptional')})</span>
            </label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={t('case.keywordsPlaceholder')}
              disabled={loading}
              className={staffInput}
            />
            <p className="text-[11px] text-black/45">{t('case.keywordsHint')}</p>
          </div>
        }
      />

      {error && <StaffErrorAlert message={error} />}
      {loading && <StaffLoading label={t('case.generating')} />}

      {!loading && !caseSession && topic.trim() && (
        <StaffPanel className="p-10 text-center print:hidden">
          <Stethoscope strokeWidth={2} size={32} className="mx-auto text-[#083047]/50 mb-4" />
          <p className="text-[14px] text-black/55 max-w-md mx-auto">
            {t('case.noSavedHint', { action: t('case.create') })}
          </p>
        </StaffPanel>
      )}

      {!loading && caseSession && (
        <div className="space-y-5 print:hidden">
          <StaffPanel className="p-4 flex flex-wrap items-center justify-between gap-3">
            {/* Sarlavha interfeys tilida — sessiyada asl (o'zbekcha) matn turadi. */}
            <p className={`text-[14px] font-semibold ${STAFF_HEADING}`}>
              {staffTopic && staffTopic.title && caseSession.topic === globalTopic?.title
                ? staffTopic.title
                : caseSession.topic}
            </p>
            <div className="flex flex-wrap gap-2">
              <StaffToolbarButton onClick={() => void handleGenerate(topic)} disabled={loading}>
                <RefreshCw size={16} />
                {t('case.regenerate')}
              </StaffToolbarButton>
              <StaffToolbarButton onClick={() => void handleDownloadCasesPdf()} disabled={downloadingCasesPdf}>
                {downloadingCasesPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {t('case.downloadCasesPdf')}
              </StaffToolbarButton>
              <StaffToolbarButton onClick={() => void handleDownloadKeyPdf()} disabled={downloadingKeyPdf}>
                {downloadingKeyPdf ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                {t('case.downloadKeyPdf')}
              </StaffToolbarButton>
            </div>
          </StaffPanel>

          {caseSession.keywords && caseSession.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {caseSession.keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-[#083047] text-[12px] font-semibold"
                >
                  <Tags size={12} /> {kw}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 print:hidden">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#083047]/50">
              {t('case.viewLabel')}
            </p>
            <div className="h-px flex-1 bg-black/5" />
          </div>

          <div className="space-y-4">
            {caseSession.questions.map((q, i) => {
              const FocusIcon = q.focus ? CASE_FOCUS_ICONS[q.focus] : Stethoscope;
              const revealed = revealedAnswers[i];
              return (
                <StaffPanel
                  key={i}
                  large
                  className={`overflow-hidden border-l-4 ${caseFocusAccentBorderClass(q.focus)} print:shadow-none print:border print:break-inside-avoid`}
                >
                  <div className="p-5 sm:p-7 flex items-start gap-4">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${caseFocusIconBgClass(q.focus)}`}
                    >
                      <FocusIcon size={20} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-black/35">
                          {t('case.questionLabel')} {i + 1}
                        </span>
                        {q.focus && (
                          <span
                            className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wide ${caseFocusBadgeClass(q.focus)}`}
                          >
                            {caseFocusLabel(q.focus, language)}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-black/90 text-[15px] leading-relaxed whitespace-pre-wrap">
                        {q.scenario}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 sm:px-7 pb-5 sm:pb-7 pl-[76px] sm:pl-[84px] print:hidden">
                    <button
                      type="button"
                      onClick={() => handleRevealAnswer(i)}
                      className={staffBtnSecondary}
                    >
                      {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                      {revealed ? t('case.hideAnswer') : t('case.revealAnswer')}
                    </button>

                    {revealed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-4 rounded-2xl p-5 bg-black/[0.025] border border-black/6"
                      >
                        <h4 className={`text-[11px] font-bold uppercase tracking-wide mb-2 ${STAFF_HEADING}`}>
                          {t('case.answerLabel')}
                        </h4>
                        <LinkifiedText text={q.answer} className="text-[14px] text-black/75 leading-relaxed whitespace-pre-wrap" />
                      </motion.div>
                    )}
                  </div>

                  {/* Print: har doim javobni ko'rsatish */}
                  <div className="hidden print:block px-7 pb-7 pl-[84px]">
                    <h4 className={`text-[11px] font-bold uppercase tracking-wide mb-2 ${STAFF_HEADING}`}>
                      {t('case.answerLabel')}
                    </h4>
                    <LinkifiedText text={q.answer} className="text-[14px] text-black/75 leading-relaxed whitespace-pre-wrap" />
                  </div>
                </StaffPanel>
              );
            })}
          </div>
        </div>
      )}
    </StaffPageLayout>
  );
}
