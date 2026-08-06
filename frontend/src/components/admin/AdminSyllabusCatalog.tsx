import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
} from 'lucide-react';
import { HttpError } from '../../api/httpClient';
import { aiService, syllabusExtractionErrorMessage, type SyllabusTopic } from '../../services/aiService';
import { clearBackendAuthTokens } from '../../utils/backendAuth';
import {
  createAdminCourseSyllabus,
  deleteAdminCourseSyllabus,
  fetchAdminCourseSyllabuses,
  fetchAdminSyllabusCatalogStats,
  updateAdminCourseSyllabus,
  type CourseSyllabusRow,
} from '../../utils/syllabusApi';
import {
  countTopicsByType,
  parseVariantLabel,
  resolveSyllabusVariants,
  totalTopicCount,
  type SyllabusVariant,
} from '../../utils/syllabusVariant';
import type { AppLanguage } from '../../i18n/language';
import { useUiText } from '../../i18n/useUiText';
import {
  instructionLanguageBadge,
  resolveSyllabusInstructionLanguage,
} from '../../utils/syllabusInstructionLanguage';
import {
  filterSyllabusUploadFiles,
  SYLLABUS_UPLOAD_ACCEPT,
} from '../../utils/syllabusDocumentText';
import SyllabusUploadPreview, {
  type SyllabusUploadPreviewData,
} from './SyllabusUploadPreview';

type UploadProgress = {
  current: number;
  total: number;
  fileName: string;
};

type DepartmentRow = {
  id: number;
  name: string;
  code: string;
  subjects_count: number;
};

function dedupeVariantLabels(variants: SyllabusVariant[]): SyllabusVariant[] {
  const used = new Set<string>();
  return variants.map((v) => {
    const base = (v.label || '').trim() || 'Asosiy';
    let label = base;
    let n = 2;
    while (used.has(label.toLowerCase())) {
      label = `${base} ${n}`;
      n += 1;
    }
    used.add(label.toLowerCase());
    return { ...v, label };
  });
}

function listLoadErrorMessage(err: unknown, t: ReturnType<typeof useUiText>['t']): string {
  if (err instanceof HttpError) {
    if (err.status === 403) return t('admin.error.adminRequired');
    if (err.status === 401) return t('admin.error.reloginRequired');
  }
  return t('admin.error.subjectsLoadFailed');
}

export default function AdminSyllabusCatalog() {
  const { t, language } = useUiText();
  const [list, setList] = useState<CourseSyllabusRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedDept, setSelectedDept] = useState<DepartmentRow | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [draftTopicsByFan, setDraftTopicsByFan] = useState<Record<number, SyllabusVariant[]>>({});
  const [savingTopicsId, setSavingTopicsId] = useState<number | null>(null);

  const [preview, setPreview] = useState<SyllabusUploadPreviewData | null>(null);
  const [previewMode, setPreviewMode] = useState<'create' | 'append'>('create');
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);

  const [showNewFanForm, setShowNewFanForm] = useState(false);
  const [newFanName, setNewFanName] = useState('');
  const [newFanDescription, setNewFanDescription] = useState('');
  const [creatingFan, setCreatingFan] = useState(false);

  const singleInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const [syllabi, stats] = await Promise.all([
        fetchAdminCourseSyllabuses(),
        fetchAdminSyllabusCatalogStats().catch(() => null),
      ]);
      setList(syllabi);
      setDepartments(
        (stats?.by_department || []).map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code || d.name,
          subjects_count: d.subjects_count,
        })),
      );
    } catch (err) {
      setList([]);
      setDepartments([]);
      setListError(listLoadErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const extractVariantsFromFiles = async (
    files: File[],
    fallbackLanguage: AppLanguage,
  ): Promise<{ variants: SyllabusVariant[]; language: AppLanguage; skipped: string[] } | null> => {
    setUploading(true);
    setError(null);
    const newVariants: SyllabusVariant[] = [];
    const skipped: string[] = [];
    let detectedInstructionLanguage: AppLanguage = fallbackLanguage;
    let lastFileName = '';
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        lastFileName = file.name;
        setProgress({ current: i + 1, total: files.length, fileName: file.name });
        try {
          const extracted = await aiService.extractSyllabusFromDocument(file);
          if (i === 0 && newVariants.length === 0) {
            detectedInstructionLanguage = extracted.instruction_language;
          }
          if (!extracted.topics.length) {
            skipped.push(file.name);
            continue;
          }
          newVariants.push({
            label: parseVariantLabel(file.name),
            file_name: file.name,
            topics: extracted.topics,
          });
        } catch (fileErr) {
          skipped.push(file.name);
          console.warn('Syllabus extract skipped:', file.name, fileErr);
        }
      }

      if (!newVariants.length) {
        throw new Error(`empty:${lastFileName || 'batch'}`);
      }

      if (skipped.length) {
        setError(
          t('admin.error.syllabusPartialSkipped', {
            skipped: skipped.join(', '),
            ok: newVariants.length,
          }),
        );
      }

      return {
        variants: dedupeVariantLabels(newVariants),
        language: detectedInstructionLanguage,
        skipped,
      };
    } catch (err) {
      if (err instanceof HttpError && err.status === 403) {
        setError(t('admin.error.adminRequired'));
      } else {
        setError(syllabusExtractionErrorMessage(err, lastFileName || t('admin.defaultDocumentName'), language));
      }
      return null;
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const resetNewFanForm = () => {
    setNewFanName('');
    setNewFanDescription('');
    setShowNewFanForm(false);
  };

  const deptFans = useMemo(() => {
    if (!selectedDept) return [];
    return list.filter(
      (row) =>
        row.department === selectedDept.id ||
        row.department_code === selectedDept.code ||
        (!row.department && !row.department_code && selectedDept.code === '__none__'),
    );
  }, [list, selectedDept]);

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const withCounts = departments.map((d) => {
      const rows = list.filter((r) => r.department === d.id || r.department_code === d.code);
      const topics = rows.reduce((sum, r) => sum + totalTopicCount(resolveSyllabusVariants(r)), 0);
      return { ...d, fanCount: rows.length || d.subjects_count, topicCount: topics };
    });
    if (!q) return withCounts.sort((a, b) => a.name.localeCompare(b.name));
    return withCounts
      .filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, list, search]);

  const createFan = async () => {
    if (!selectedDept) return;
    const name = newFanName.trim();
    if (!name) {
      setError(t('admin.error.enterSubjectName'));
      return;
    }
    setCreatingFan(true);
    setError(null);
    try {
      await createAdminCourseSyllabus({
        subject_name: name,
        description: newFanDescription.trim(),
        department_id: selectedDept.id,
        sort_order: deptFans.length,
      });
      resetNewFanForm();
      await load();
    } catch (err) {
      if (err instanceof HttpError && err.status === 403) {
        setError(t('admin.error.adminRequiredShort'));
      } else {
        setError(t('admin.error.catalogSaveFailed'));
      }
    } finally {
      setCreatingFan(false);
    }
  };

  const startUploadForDepartment = async (files: FileList | File[], mode: 'single' | 'bulk') => {
    if (!selectedDept) return;
    const uploadFiles = filterSyllabusUploadFiles(files);
    if (!uploadFiles.length) {
      setError(t('admin.error.filesRequired'));
      return;
    }
    if (mode === 'single' && uploadFiles.length > 1) {
      // still allow first file only for single button semantics
    }
    const result = await extractVariantsFromFiles(uploadFiles, 'uz');
    if (!result) return;

    // Har bir variant = alohida fan (bulk da bir nechta PDF → bir nechta fan)
    // Preview da bitta subjectName; bulk uchun birinchi fayl nomi asosida.
    const subjectGuess =
      uploadFiles.length === 1
        ? uploadFiles[0].name.replace(/\.(pdf|docx?)$/i, '').replace(/\([^)]*\)\s*$/, '').trim()
        : t('admin.newSubject');

    setPreviewMode('create');
    setUploadTargetId(null);
    setPreview({
      subjectName: subjectGuess || t('admin.newSubject'),
      description: '',
      instructionLanguage: result.language,
      variants: result.variants.map((v) => ({ ...v, editableLabel: v.label })),
    });
  };

  const processAppendFiles = async (files: FileList | File[], targetId: number) => {
    const target = list.find((r) => r.id === targetId);
    if (!target) return;
    const uploadFiles = filterSyllabusUploadFiles(files);
    if (!uploadFiles.length) {
      setError(t('admin.error.filesRequired'));
      return;
    }
    const result = await extractVariantsFromFiles(uploadFiles, resolveSyllabusInstructionLanguage(target));
    if (!result) return;
    setPreviewMode('append');
    setUploadTargetId(targetId);
    setPreview({
      subjectName: target.subject_name,
      description: target.description || '',
      instructionLanguage: result.language,
      variants: result.variants.map((v) => ({ ...v, editableLabel: v.label })),
    });
  };

  const savePreview = async () => {
    if (!preview || !selectedDept) return;

    const variants: SyllabusVariant[] = preview.variants.map((v) => ({
      label: v.editableLabel.trim() || v.label,
      file_name: v.file_name,
      topics: v.topics,
    }));

    const labels = variants.map((v) => v.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      setError(t('admin.error.duplicateLabels'));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      if (previewMode === 'create') {
        // Bulk: har bir variant alohida fan; single: bitta fan ichida barcha variantlar.
        if (variants.length > 1 && preview.variants.every((v) => v.file_name)) {
          const uniqueFiles = new Set(variants.map((v) => v.file_name));
          if (uniqueFiles.size === variants.length) {
            for (const v of variants) {
              const nameFromFile = v.file_name
                .replace(/\.(pdf|docx?)$/i, '')
                .replace(/\([^)]*\)\s*$/, '')
                .trim();
              await createAdminCourseSyllabus({
                subject_name: nameFromFile || preview.subjectName.trim() || v.label,
                description: preview.description.trim(),
                instruction_language: preview.instructionLanguage,
                department_id: selectedDept.id,
                variants: [v],
                sort_order: deptFans.length,
              });
            }
          } else {
            const subjectName = preview.subjectName.trim();
            if (!subjectName) {
              setError(t('admin.error.enterSubjectName'));
              return;
            }
            await createAdminCourseSyllabus({
              subject_name: subjectName,
              description: preview.description.trim(),
              instruction_language: preview.instructionLanguage,
              department_id: selectedDept.id,
              variants,
              sort_order: deptFans.length,
            });
          }
        } else {
          const subjectName = preview.subjectName.trim();
          if (!subjectName) {
            setError(t('admin.error.enterSubjectName'));
            return;
          }
          await createAdminCourseSyllabus({
            subject_name: subjectName,
            description: preview.description.trim(),
            instruction_language: preview.instructionLanguage,
            department_id: selectedDept.id,
            variants,
            sort_order: deptFans.length,
          });
        }
        resetNewFanForm();
      } else {
        if (uploadTargetId == null) return;
        await updateAdminCourseSyllabus(uploadTargetId, {
          description: preview.description.trim(),
          instruction_language: preview.instructionLanguage,
          variants,
          append_variants: true,
        });
        setUploadTargetId(null);
      }
      setPreview(null);
      await load();
    } catch (err) {
      if (err instanceof HttpError && err.status === 403) {
        setError(t('admin.error.adminRequiredShort'));
      } else {
        setError(t('admin.error.catalogSaveFailed'));
      }
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (row: CourseSyllabusRow) => {
    try {
      await updateAdminCourseSyllabus(row.id, { is_active: !row.is_active });
      await load();
    } catch {
      setError(t('admin.error.updateFailedGeneric'));
    }
  };

  const handleDelete = async (row: CourseSyllabusRow) => {
    if (!window.confirm(t('admin.confirmDeleteCourse', { name: row.subject_name }))) return;
    try {
      await deleteAdminCourseSyllabus(row.id);
      setExpandedId((id) => (id === row.id ? null : id));
      await load();
    } catch (err) {
      if (err instanceof HttpError && (err.status === 409 || err.status === 400)) {
        const detail =
          err.body && typeof err.body === 'object' && 'detail' in err.body
            ? String((err.body as { detail: unknown }).detail)
            : '';
        setError(detail || t('admin.error.deleteFailedGeneric'));
      } else {
        setError(t('admin.error.deleteFailedGeneric'));
      }
    }
  };

  const saveSubjectName = async (row: CourseSyllabusRow) => {
    const name = editingName.trim();
    if (!name || name === row.subject_name) {
      setEditingNameId(null);
      return;
    }
    try {
      await updateAdminCourseSyllabus(row.id, { subject_name: name });
      setEditingNameId(null);
      await load();
    } catch {
      setError(t('admin.error.updateFailedGeneric'));
    }
  };

  const ensureDraftVariants = (row: CourseSyllabusRow) => {
    if (draftTopicsByFan[row.id]) return draftTopicsByFan[row.id];
    return resolveSyllabusVariants(row);
  };

  const updateDraftTopicTitle = (
    row: CourseSyllabusRow,
    variantLabel: string,
    topicKey: string,
    title: string,
  ) => {
    const base = ensureDraftVariants(row);
    const next = base.map((v) => {
      if (v.label !== variantLabel) return v;
      return {
        ...v,
        topics: v.topics.map((topic) =>
          `${topic.type}-${topic.id}` === topicKey ? { ...topic, title } : topic,
        ),
      };
    });
    setDraftTopicsByFan((prev) => ({ ...prev, [row.id]: next }));
  };

  const saveFanTopics = async (row: CourseSyllabusRow) => {
    const variants = draftTopicsByFan[row.id] || resolveSyllabusVariants(row);
    setSavingTopicsId(row.id);
    setError(null);
    try {
      await updateAdminCourseSyllabus(row.id, { variants });
      setDraftTopicsByFan((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch {
      setError(t('admin.error.updateFailedGeneric'));
    } finally {
      setSavingTopicsId(null);
    }
  };

  const removeVariant = async (row: CourseSyllabusRow, label: string) => {
    const variants = resolveSyllabusVariants(row).filter((v) => v.label !== label);
    if (!variants.length) {
      setError(t('admin.error.cannotDeleteLastDirection'));
      return;
    }
    if (!window.confirm(t('admin.confirmDeleteDirection', { label }))) return;
    try {
      await updateAdminCourseSyllabus(row.id, { variants });
      await load();
    } catch {
      setError(t('admin.error.removeDirectionFailed'));
    }
  };

  const busy = uploading || creatingFan;

  return (
    <div className="p-3 sm:p-5 lg:p-6 h-full overflow-y-auto w-full space-y-6">
      {preview && (
        <SyllabusUploadPreview
          data={preview}
          saving={uploading}
          onChange={setPreview}
          onConfirm={() => void savePreview()}
          onCancel={() => setPreview(null)}
        />
      )}

      <div className="ios-glass rounded-3xl border border-white/70 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {selectedDept ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedDept(null);
                  setExpandedId(null);
                  setShowNewFanForm(false);
                  setError(null);
                }}
                className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 hover:bg-slate-200"
                title={t('admin.backToDepartments')}
              >
                <ArrowLeft size={22} />
              </button>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <BookOpen size={24} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900 truncate">
                {selectedDept ? selectedDept.name : t('admin.syllabusTitle')}
              </h2>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                {selectedDept ? t('admin.departmentsListHint') : t('admin.syllabusDescription')}
              </p>
            </div>
          </div>

          {selectedDept && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowNewFanForm((v) => !v)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold"
              >
                <Plus size={16} /> {t('admin.newSubject')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => singleInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700"
              >
                <Upload size={16} /> {t('admin.uploadSyllabusSingle')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => bulkInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-[13px] font-semibold text-indigo-800"
              >
                <Upload size={16} /> {t('admin.uploadSyllabusBulk')}
              </button>
              <input
                ref={singleInputRef}
                type="file"
                accept={SYLLABUS_UPLOAD_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files?.length) void startUploadForDepartment(files, 'single');
                  e.target.value = '';
                }}
              />
              <input
                ref={bulkInputRef}
                type="file"
                accept={SYLLABUS_UPLOAD_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files?.length) void startUploadForDepartment(files, 'bulk');
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>

        {listError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 space-y-2">
            <p>{listError}</p>
            <button
              type="button"
              onClick={() => {
                clearBackendAuthTokens();
                window.location.reload();
              }}
              className="text-[12px] font-semibold text-indigo-700 hover:underline"
            >
              {t('admin.reloginToken')}
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
            {error}
          </div>
        )}

        {progress && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-[13px] text-indigo-900 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} />
            {t('admin.progress', {
              current: progress.current,
              total: progress.total,
              fileName: progress.fileName,
            })}
          </div>
        )}

        {!selectedDept && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.syllabusSearchPlaceholder')}
              className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 bg-white text-[14px]"
            />
          </div>
        )}

        {selectedDept && showNewFanForm && (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[12px] font-semibold text-slate-600">{t('admin.subjectName')}</span>
                <input
                  value={newFanName}
                  onChange={(e) => setNewFanName(e.target.value)}
                  placeholder={t('admin.subjectNamePlaceholder')}
                  disabled={creatingFan}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white"
                  autoFocus
                />
              </label>
              <label className="space-y-1">
                <span className="text-[12px] font-semibold text-slate-600">{t('admin.descriptionLabel')}</span>
                <input
                  value={newFanDescription}
                  onChange={(e) => setNewFanDescription(e.target.value)}
                  placeholder={t('admin.descriptionPlaceholder')}
                  disabled={creatingFan}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={creatingFan || !newFanName.trim()}
                onClick={() => void createFan()}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold disabled:opacity-50"
              >
                {creatingFan ? <Loader2 className="animate-spin inline" size={16} /> : t('admin.create')}
              </button>
              <button
                type="button"
                onClick={resetNewFanForm}
                className="px-4 py-2 rounded-xl border border-slate-200 text-[13px] font-semibold"
              >
                {t('admin.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      ) : !selectedDept ? (
        filteredDepartments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 text-[14px]">{t('admin.noResults')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDepartments.map((dept) => (
              <button
                key={dept.id}
                type="button"
                onClick={() => {
                  setSelectedDept(dept);
                  setSearch('');
                  setError(null);
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 text-left hover:border-indigo-200 hover:bg-indigo-50/30 transition"
              >
                <span className="flex items-center gap-2 font-bold text-slate-800 min-w-0">
                  <Building2 size={16} className="text-slate-500 shrink-0" />
                  <span className="truncate">{dept.name}</span>
                  <ChevronRight size={16} className="text-slate-400 shrink-0" />
                </span>
                <span className="text-[12px] text-slate-500 shrink-0">
                  {t('admin.fanCount', { count: dept.fanCount })}
                  {' · '}
                  {t('admin.topicsCountLabel', { count: dept.topicCount })}
                </span>
              </button>
            ))}
          </div>
        )
      ) : deptFans.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-slate-500">{t('admin.emptyDepartmentFans')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {deptFans.map((row) => {
            const variants = draftTopicsByFan[row.id] || resolveSyllabusVariants(row);
            const open = expandedId === row.id;
            const topicTotal = totalTopicCount(variants);
            const editing = editingNameId === row.id;
            return (
              <li key={row.id} className="ios-glass rounded-2xl border border-white/70 overflow-hidden">
                <div className="p-4 flex flex-wrap items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <FileText size={20} className="text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    {editing ? (
                      <div className="flex gap-2 flex-wrap">
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 min-w-[160px] h-9 px-3 rounded-lg border border-slate-200 text-[14px] font-semibold"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void saveSubjectName(row)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold"
                        >
                          {t('admin.save')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingNameId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold"
                        >
                          {t('admin.cancel')}
                        </button>
                      </div>
                    ) : (
                      <p className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                        {row.subject_name}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                          {instructionLanguageBadge(resolveSyllabusInstructionLanguage(row))}
                        </span>
                        {topicTotal === 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            {t('admin.topicsWithoutData')}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="text-[12px] text-slate-500">
                      {t('admin.subjectStats', {
                        tracks: variants.length,
                        topics: topicTotal,
                      })}
                      {row.description ? ` · ${row.description}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">{row.subject_code}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNameId(row.id);
                      setEditingName(row.subject_name);
                    }}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                    title={t('admin.editSubjectName')}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = open ? null : row.id;
                      setExpandedId(next);
                      if (next !== null && !draftTopicsByFan[row.id]) {
                        setDraftTopicsByFan((prev) => ({
                          ...prev,
                          [row.id]: resolveSyllabusVariants(row),
                        }));
                      }
                    }}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                  >
                    {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(row)}
                    className="flex items-center gap-1 text-[12px] font-semibold text-slate-600"
                  >
                    {row.is_active ? (
                      <ToggleRight className="text-emerald-600" size={22} />
                    ) : (
                      <ToggleLeft size={22} />
                    )}
                    {row.is_active ? t('admin.active') : t('admin.toggleInactive')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(row)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5">
                        <FileText size={14} />
                        {t('admin.syllabusDocumentsTitle')}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setUploadTargetId(row.id);
                          appendInputRef.current?.click();
                        }}
                        className="text-[12px] font-semibold text-indigo-600 hover:underline"
                      >
                        + {t('admin.addDocumentToSubject')}
                      </button>
                    </div>

                    {variants.length === 0 ? (
                      <p className="text-[12px] text-amber-700 py-1">{t('admin.noDocumentUploaded')}</p>
                    ) : (
                      variants.map((v) => {
                        const lectures = v.topics.filter((x) => x.type === 'lecture');
                        const practicals = v.topics.filter((x) => x.type !== 'lecture');
                        const counts = countTopicsByType(v.topics);
                        return (
                          <div
                            key={`${row.id}-${v.label}-${v.file_name}`}
                            className="rounded-xl bg-white border border-slate-100 overflow-hidden"
                          >
                            <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-50">
                              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md shrink-0">
                                {v.label}
                              </span>
                              <span className="text-[12px] text-slate-700 truncate flex-1">{v.file_name}</span>
                              <span className="text-[11px] text-slate-400 shrink-0">
                                {t('admin.topicsBreakdown', {
                                  total: v.topics.length,
                                  lectures: counts.lectures,
                                  practicals: counts.practicals,
                                })}
                              </span>
                              <button
                                type="button"
                                onClick={() => void removeVariant(row, v.label)}
                                className="p-1 text-rose-400 hover:text-rose-600"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="px-3 py-2 space-y-3">
                              {lectures.length > 0 && (
                                <TopicEditGroup
                                  title={t('admin.lecturesSection')}
                                  topics={lectures}
                                  onChange={(key, title) =>
                                    updateDraftTopicTitle(row, v.label, key, title)
                                  }
                                />
                              )}
                              {practicals.length > 0 && (
                                <TopicEditGroup
                                  title={t('admin.practicalsSection')}
                                  topics={practicals}
                                  onChange={(key, title) =>
                                    updateDraftTopicTitle(row, v.label, key, title)
                                  }
                                />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {draftTopicsByFan[row.id] && (
                      <button
                        type="button"
                        disabled={savingTopicsId === row.id}
                        onClick={() => void saveFanTopics(row)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold disabled:opacity-50"
                      >
                        {savingTopicsId === row.id ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : null}
                        {t('admin.saveTopics')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={appendInputRef}
        type="file"
        accept={SYLLABUS_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          const targetId = uploadTargetId;
          if (files?.length && targetId != null) void processAppendFiles(files, targetId);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function TopicEditGroup({
  title,
  topics,
  onChange,
}: {
  title: string;
  topics: SyllabusTopic[];
  onChange: (key: string, title: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      {topics.map((topic) => {
        const key = `${topic.type}-${topic.id}`;
        const isLecture = topic.type === 'lecture';
        return (
          <div key={key} className="flex items-center gap-2">
            <span
              className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isLecture ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
              }`}
            >
              {topic.id}
            </span>
            <input
              value={topic.title}
              onChange={(e) => onChange(key, e.target.value)}
              className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-slate-200 text-[12px]"
            />
          </div>
        );
      })}
    </div>
  );
}
