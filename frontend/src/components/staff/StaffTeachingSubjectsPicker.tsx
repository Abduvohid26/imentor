import React, { useCallback, useEffect, useState } from 'react';
import { Check, GraduationCap, Loader2, Save } from 'lucide-react';
import { useUiText } from '../../i18n/useUiText';
import {
  fetchDepartmentCourseSyllabuses,
  fetchMyCourseSelections,
  isSyncUnavailable,
  setMyTeachingSubjects,
  type CourseSyllabusRow,
} from '../../utils/syllabusApi';
import { resolveSyllabusVariants, totalTopicCount } from '../../utils/syllabusVariant';
import {
  instructionLanguageBadge,
  resolveSyllabusInstructionLanguage,
} from '../../utils/syllabusInstructionLanguage';
import { HttpError } from '../../api/httpClient';
import { staffBtnPrimary } from './staffUi';

export type StaffTeachingSubjectsPickerProps = {
  /** Onboarding: to‘liq ekran sarlavhasi; profile: ixchamroq. */
  variant?: 'onboarding' | 'profile';
  initialSelectedIds?: number[];
  onSaved?: (ids: number[]) => void;
  showHeader?: boolean;
};

function errMessage(err: unknown, t: (k: string) => string): string {
  if (err instanceof HttpError) {
    const detail = (err.body as { detail?: string } | null)?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  if (err instanceof Error) {
    if (err.message === 'no-backend-token') return t('teachingSubjects.errorLogin');
    return err.message;
  }
  return t('teachingSubjects.errorSave');
}

export default function StaffTeachingSubjectsPicker({
  variant = 'profile',
  initialSelectedIds,
  onSaved,
  showHeader = true,
}: StaffTeachingSubjectsPickerProps) {
  const { t } = useUiText();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseSyllabusRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialSelectedIds ?? []));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dept, mine] = await Promise.all([
        fetchDepartmentCourseSyllabuses(),
        initialSelectedIds == null ? fetchMyCourseSelections() : Promise.resolve(null),
      ]);
      setCourses(dept);
      if (initialSelectedIds != null) {
        setSelected(new Set(initialSelectedIds));
      } else if (mine) {
        setSelected(new Set(mine.map((s) => s.syllabus.id)));
      }
    } catch (err) {
      if (isSyncUnavailable(err)) {
        setError(t('teachingSubjects.errorRole'));
      } else {
        setError(errMessage(err, t));
      }
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [initialSelectedIds, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) {
      setError(t('teachingSubjects.minOne'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ids = Array.from(selected);
      await setMyTeachingSubjects(ids);
      onSaved?.(ids);
    } catch (err) {
      setError(errMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
        <Loader2 size={36} className="animate-spin text-blue-500" />
        <p className="text-sm font-medium">{t('teachingSubjects.loading')}</p>
      </div>
    );
  }

  const isOnboarding = variant === 'onboarding';

  return (
    <div className={isOnboarding ? 'w-full max-w-3xl mx-auto space-y-6' : 'space-y-4'}>
      {showHeader && (
        <div className="space-y-1">
          <h2
            id={isOnboarding ? 'teaching-subjects-modal-title' : undefined}
            className={`font-bold tracking-tight text-slate-900 flex items-center gap-2 ${
              isOnboarding ? 'text-xl sm:text-2xl' : 'text-xl'
            }`}
          >
            <GraduationCap className="text-[#083047] shrink-0" size={isOnboarding ? 28 : 22} />
            {isOnboarding ? t('teachingSubjects.onboardingTitle') : t('teachingSubjects.profileTitle')}
          </h2>
          <p className={`text-slate-500 ${isOnboarding ? 'text-sm sm:text-base' : 'text-sm'}`}>
            {isOnboarding ? t('teachingSubjects.onboardingHint') : t('teachingSubjects.profileHint')}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {courses.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 space-y-1">
          <p className="text-sm font-semibold text-amber-900">{t('teachingSubjects.emptyDept')}</p>
          <p className="text-xs text-amber-800 leading-relaxed">{t('teachingSubjects.emptyDeptHint')}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {courses.map((syllabus) => {
            const isActive = selected.has(syllabus.id);
            const topics = totalTopicCount(resolveSyllabusVariants(syllabus));
            return (
              <button
                key={syllabus.id}
                type="button"
                onClick={() => toggle(syllabus.id)}
                className={`inline-flex items-center gap-1.5 pl-2.5 pr-2.5 py-1.5 rounded-lg border text-[12px] transition ${
                  isActive
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                {isActive && <Check size={14} className="text-blue-600 shrink-0" />}
                <span className="font-semibold text-slate-900 truncate max-w-[160px] sm:max-w-[220px]">
                  {syllabus.subject_name}
                </span>
                <span className="text-[9px] text-slate-500 shrink-0">
                  {instructionLanguageBadge(resolveSyllabusInstructionLanguage(syllabus))}
                </span>
                <span className="text-[9px] text-slate-400 shrink-0">
                  {topics} {t('syllabus.topics')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className={`flex ${isOnboarding ? 'justify-center' : 'justify-start'} pt-1`}>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || courses.length === 0}
          className={`${staffBtnPrimary} px-6 py-3 disabled:opacity-50`}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {t('teachingSubjects.save')}
        </button>
      </div>
    </div>
  );
}
