import React from 'react';
import { BookOpen, Check, FlaskConical, Loader2, X } from 'lucide-react';
import type { SyllabusTopic } from '../../services/aiService';
import type { AppLanguage } from '../../i18n/language';
import { instructionLanguageBadge } from '../../utils/syllabusInstructionLanguage';
import { countTopicsByType } from '../../utils/syllabusVariant';
import type { SyllabusVariant as VariantRow } from '../../utils/syllabusVariant';
import { useUiText } from '../../i18n/useUiText';

export type SyllabusUploadPreviewData = {
  subjectName: string;
  description: string;
  instructionLanguage: AppLanguage;
  variants: Array<VariantRow & { editableLabel: string }>;
};

type Props = {
  data: SyllabusUploadPreviewData;
  saving: boolean;
  onChange: (data: SyllabusUploadPreviewData) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function SyllabusUploadPreview({
  data,
  saving,
  onChange,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useUiText();

  const totalLectures = data.variants.reduce(
    (n, v) => n + countTopicsByType(v.topics).lectures,
    0,
  );
  const totalPracticals = data.variants.reduce(
    (n, v) => n + countTopicsByType(v.topics).practicals,
    0,
  );
  const totalTopics = data.variants.reduce((n, v) => n + v.topics.length, 0);

  const updateVariantLabel = (index: number, label: string) => {
    const variants = data.variants.map((v, i) =>
      i === index ? { ...v, label: label.trim() || v.label, editableLabel: label } : v,
    );
    onChange({ ...data, variants });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50">
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-hidden bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{t('admin.previewTitle')}</h3>
            <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{t('admin.previewSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-[12px] font-semibold text-slate-600">{t('admin.subjectName')}</span>
            <input
              value={data.subjectName}
              onChange={(e) => onChange({ ...data, subjectName: e.target.value })}
              className="w-full h-11 px-3 rounded-xl border border-slate-200"
              disabled={saving}
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <StatCard label={t('admin.previewTotal')} value={String(totalTopics)} />
            <StatCard label={t('admin.previewLecture')} value={String(totalLectures)} icon={<BookOpen size={14} />} />
            <StatCard label={t('admin.previewPractical')} value={String(totalPracticals)} icon={<FlaskConical size={14} />} />
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[11px] text-indigo-900 leading-relaxed">
            {t('admin.previewInfo')}
          </div>

          {data.variants.map((variant, index) => {
            const counts = countTopicsByType(variant.topics);
            return (
              <div
                key={`${variant.file_name}-${index}`}
                className="rounded-2xl border border-slate-200 overflow-hidden"
              >
                <div className="bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 flex-1 min-w-[140px]">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{t('admin.previewVariant')}</span>
                    <input
                      value={variant.editableLabel}
                      onChange={(e) => updateVariantLabel(index, e.target.value)}
                      className="h-8 px-2 rounded-lg border border-slate-200 text-[12px] font-semibold flex-1 min-w-0"
                      disabled={saving}
                    />
                  </label>
                  <span className="text-[10px] text-slate-500 truncate max-w-[180px]">{variant.file_name}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200">
                    {instructionLanguageBadge(data.instructionLanguage)}
                  </span>
                </div>
                <div className="px-3 py-2 text-[11px] text-slate-600 border-b border-slate-100">
                  {t('admin.previewTopicsLine', {
                    total: variant.topics.length,
                    lectures: counts.lectures,
                    practicals: counts.practicals,
                  })}
                </div>
                <ul className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                  {variant.topics.slice(0, 24).map((topic) => (
                    <TopicPreviewRow key={`${variant.label}-${topic.id}`} topic={topic} />
                  ))}
                  {variant.topics.length > 24 && (
                    <li className="px-3 py-2 text-[11px] text-slate-400 italic">
                      {t('admin.previewMore', { count: variant.topics.length - 24 })}
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-700"
          >
            {t('admin.previewCancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || !data.subjectName.trim() || totalTopics === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {t('admin.previewSave')}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
      <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function TopicPreviewRow({ topic }: { topic: SyllabusTopic }) {
  const isLecture = topic.type === 'lecture';
  return (
    <li className="px-3 py-1.5 flex items-start gap-2 text-[11px]">
      <span
        className={`shrink-0 font-bold px-1.5 py-0.5 rounded ${
          isLecture ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
        }`}
      >
        {topic.id}
      </span>
      <span className="text-slate-700 leading-snug">{topic.title}</span>
    </li>
  );
}
