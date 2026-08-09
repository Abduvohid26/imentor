import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Building2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Languages,
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
import { fetchAcademicCatalog } from '../../utils/academicCatalogApi';
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
import SyllabusTranslationsEditor from './SyllabusTranslationsEditor';

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
  sort_order?: number;
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

function softDeptKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAcademicDepartment(
  catalogName: string,
  catalogCode: string | null | undefined,
  academic: DepartmentRow[],
): DepartmentRow | null {
  const kn = softDeptKey(catalogName);
  const kc = softDeptKey(catalogCode || '');
  return (
    academic.find((d) => softDeptKey(d.name) === kn || (kc && softDeptKey(d.code) === kc)) ||
    academic.find(
      (d) =>
        softDeptKey(d.name).includes(kn) ||
        kn.includes(softDeptKey(d.name)) ||
        (kc && (softDeptKey(d.code).includes(kc) || kc.includes(softDeptKey(d.code)))),
    ) ||
    null
  );
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

  /** Shu page ichida ochilgan kafedra (alohida sahifa emas). */
  const [openDeptId, setOpenDeptId] = useState<number | null>(null);
  /** OnlineTest academic-catalog tartibi (28) — asosiy ro'yxat. */
  const [catalogOrder, setCatalogOrder] = useState<{ name: string; code: string }[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  /** Nomlar tarjimasini tahrirlash oynasi (sifat nazorati). */
  const [translatingRow, setTranslatingRow] = useState<CourseSyllabusRow | null>(null);
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

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const [syllabi, stats, catalog] = await Promise.all([
        fetchAdminCourseSyllabuses(),
        fetchAdminSyllabusCatalogStats().catch(() => null),
        fetchAcademicCatalog().catch(() => null),
      ]);
      setList(syllabi);
      setDepartments(
        (stats?.by_department || []).map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code || d.name,
          subjects_count: d.subjects_count,
          sort_order: d.sort_order ?? 0,
        })),
      );
      const kafedralar = catalog?.kafedralar || [];
      setCatalogOrder(
        kafedralar.length > 0
          ? kafedralar.map((k) => ({ name: k.name, code: (k.code || '').trim() }))
          : null,
      );
    } catch (err) {
      setList([]);
      setDepartments([]);
      setCatalogOrder(null);
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

  const fansForDept = useCallback(
    (dept: DepartmentRow) => {
      if (dept.id <= 0) return [];
      return list.filter(
        (row) =>
          row.department === dept.id ||
          row.department_code === dept.code ||
          (!row.department && !row.department_code && dept.code === '__none__'),
      );
    },
    [list],
  );

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    // API (academic-catalog) 28 kafedra — asosiy manba; DB id uchun AcademicDepartment ga moslashtiramiz.
    let base: DepartmentRow[];
    if (catalogOrder && catalogOrder.length > 0) {
      const used = new Set<number>();
      base = [];
      for (const [idx, k] of catalogOrder.entries()) {
        const hit = matchAcademicDepartment(k.name, k.code, departments);
        if (hit && !used.has(hit.id)) {
          used.add(hit.id);
          base.push({
            ...hit,
            name: k.name || hit.name,
            code: k.code || hit.code,
            sort_order: idx,
          });
        } else if (!hit) {
          // Katalogda bor, lekin DB da hali yo'q — ko'rsatamiz (id=0 upload uchun yopiq).
          base.push({
            id: -idx - 1,
            name: k.name,
            code: k.code || k.name,
            subjects_count: 0,
            sort_order: idx,
          });
        }
      }
    } else {
      base = [...departments].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'uz'),
      );
    }
    const withCounts = base.map((d) => {
      const rows = d.id > 0 ? fansForDept(d) : [];
      const topics = rows.reduce((sum, r) => sum + totalTopicCount(resolveSyllabusVariants(r)), 0);
      return { ...d, fanCount: rows.length || (d.id > 0 ? d.subjects_count : 0), topicCount: topics };
    });
    if (!q) return withCounts;
    return withCounts.filter(
      (d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q),
    );
  }, [departments, fansForDept, search, catalogOrder]);

  const selectedDept = useMemo(() => {
    if (openDeptId == null) return null;
    return filteredDepartments.find((d) => d.id === openDeptId) || null;
  }, [filteredDepartments, openDeptId]);

  const deptFans = useMemo(
    () => (selectedDept ? fansForDept(selectedDept) : []),
    [fansForDept, selectedDept],
  );

  const createFan = async () => {
    if (!selectedDept || selectedDept.id <= 0) {
      setError(t('admin.error.catalogSaveFailed'));
      return;
    }
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

  const startUploadForDepartment = async (files: FileList | File[]) => {
    if (!selectedDept || selectedDept.id <= 0) {
      setError(t('admin.error.catalogSaveFailed'));
      return;
    }
    const uploadFiles = filterSyllabusUploadFiles(files);
    if (!uploadFiles.length) {
      setError(t('admin.error.filesRequired'));
      return;
    }
    const result = await extractVariantsFromFiles(uploadFiles, 'uz');
    if (!result) return;

    // 1 yoki ko'p PDF — bitta tugma; har variant/fayl fan sifatida saqlanadi.
    const subjectGuess =
      uploadFiles.length === 1
        ? uploadFiles[0].name.replace(/\.(pdf|docx?)$/i, '').trim()
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

    setUploading(true);
    setError(null);
    try {
      if (previewMode === 'create') {
        // Har bir PDF = alohida fan; fan nomi = fayl nomi.
        for (const v of variants) {
          const nameFromFile = (v.file_name || '').replace(/\.(pdf|docx?)$/i, '').trim();
          const subjectName = nameFromFile || v.label || t('admin.newSubject');
          await createAdminCourseSyllabus({
            subject_name: subjectName,
            description: preview.description.trim(),
            instruction_language: preview.instructionLanguage,
            department_id: selectedDept.id,
            variants: [v],
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

  const deleteErrorMessage = (err: unknown): string => {
    if (err instanceof HttpError) {
      const detail =
        err.body && typeof err.body === 'object' && 'detail' in err.body
          ? String((err.body as { detail: unknown }).detail)
          : '';
      if (detail && detail !== '[object Object]') return detail;
      if (err.status === 401) return t('admin.error.reloginRequired');
      if (err.status === 403) return t('admin.error.adminRequiredShort');
    }
    return t('admin.error.deleteFailedGeneric');
  };

  const handleDelete = async (row: CourseSyllabusRow) => {
    if (!window.confirm(t('admin.confirmDeleteCourse', { name: row.subject_name }))) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await deleteAdminCourseSyllabus(row.id);
      setExpandedId((id) => (id === row.id ? null : id));
      setDraftTopicsByFan((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(deleteErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAllInDept = async () => {
    if (!selectedDept || selectedDept.id <= 0) return;
    const fans = fansForDept(selectedDept);
    if (!fans.length) return;
    if (!window.confirm(t('admin.confirmDeleteAllCourses', { count: fans.length, name: selectedDept.name }))) {
      return;
    }
    setDeletingAll(true);
    setError(null);
    try {
      const failures: string[] = [];
      for (const row of fans) {
        try {
          await deleteAdminCourseSyllabus(row.id);
        } catch (err) {
          failures.push(`${row.subject_name}: ${deleteErrorMessage(err)}`);
        }
      }
      setExpandedId(null);
      setDraftTopicsByFan({});
      await load();
      if (failures.length) {
        setError(failures.slice(0, 3).join(' · '));
      }
    } finally {
      setDeletingAll(false);
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

  const busy = uploading || creatingFan || deletingAll || deletingId != null;

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
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <BookOpen size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 truncate">{t('admin.syllabusTitle')}</h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">{t('admin.syllabusDescription')}</p>
          </div>
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept={SYLLABUS_UPLOAD_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) void startUploadForDepartment(files);
            e.target.value = '';
          }}
        />

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

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.syllabusSearchPlaceholder')}
            className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 bg-white text-[14px]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      ) : filteredDepartments.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400 text-[14px]">{t('admin.noResults')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDepartments.map((dept) => {
            const isOpen = openDeptId === dept.id;
            const fans = isOpen ? fansForDept(dept) : [];
            return (
              <div
                key={dept.id}
                className={`rounded-xl border bg-white overflow-hidden ${
                  isOpen ? 'border-indigo-200 shadow-sm' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = isOpen ? null : dept.id;
                    setOpenDeptId(next);
                    setExpandedId(null);
                    setShowNewFanForm(false);
                    setError(null);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-indigo-50/30 transition"
                >
                  <span className="flex items-center gap-2 font-bold text-slate-800 min-w-0">
                    <Building2 size={16} className="text-slate-500 shrink-0" />
                    <span className="truncate">{dept.name}</span>
                    {isOpen ? (
                      <ChevronUp size={16} className="text-indigo-500 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    )}
                  </span>
                  <span className="text-[12px] text-slate-500 shrink-0">
                    {t('admin.fanCount', { count: dept.fanCount })}
                    {' · '}
                    {t('admin.topicsCountLabel', { count: dept.topicCount })}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-3 sm:px-4 py-3 space-y-3">
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
                        onClick={() => uploadInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-[13px] font-semibold text-indigo-800"
                      >
                        <Upload size={16} /> {t('admin.uploadSyllabusCombined')}
                      </button>
                      {fans.length > 0 ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeleteAllInDept()}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-[13px] font-semibold text-rose-700"
                        >
                          {deletingAll ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                          {t('admin.deleteAllCourses')}
                        </button>
                      ) : null}
                    </div>
                    {error && openDeptId === dept.id ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
                        {error}
                      </div>
                    ) : null}

                    {showNewFanForm && (
                      <div className="rounded-2xl border border-indigo-100 bg-white p-4 space-y-3">
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

                    {fans.length === 0 ? (
                      <p className="text-center text-slate-500 text-[13px] py-6">{t('admin.emptyDepartmentFans')}</p>
                    ) : (
                      <ul className="space-y-3">
          {fans.map((row) => {
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
                      {t('admin.subjectStats', { topics: topicTotal })}
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
                    onClick={() => setTranslatingRow(row)}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                    title={t('admin.editTranslations')}
                  >
                    <Languages size={16} />
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
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDelete(row);
                    }}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-50"
                    title={t('admin.delete')}
                  >
                    {deletingId === row.id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Trash2 size={18} />
                    )}
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
                              <span className="text-[12px] text-slate-700 truncate flex-1 min-w-0">
                                {v.file_name}
                              </span>
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

      {translatingRow && (
        <SyllabusTranslationsEditor
          row={translatingRow}
          onClose={() => setTranslatingRow(null)}
          onSaved={() => void load()}
        />
      )}
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
