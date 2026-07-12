import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  FileText,
  ToggleLeft,
  ToggleRight,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { HttpError } from '../../api/httpClient';
import { aiService, syllabusExtractionErrorMessage } from '../../services/aiService';
import { clearBackendAuthTokens } from '../../utils/backendAuth';
import {
  createAdminCourseSyllabus,
  deleteAdminCourseSyllabus,
  fetchAdminCourseSyllabuses,
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

/**
 * Variant (yo'nalish) belgilarini noyob qiladi: bir nechta PDF nomidan bir xil
 * belgi chiqsa (masalan ikkalasi ham "XT"), takrorlanganiga "XT 2", "XT 3" beriladi.
 * Foydalanuvchi preview'da istagan nomga tahrirlashi mumkin.
 */
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
    if (err.status === 403) {
      return t('admin.error.adminRequired');
    }
    if (err.status === 401) {
      return t('admin.error.reloginRequired');
    }
  }
  return t('admin.error.subjectsLoadFailed');
}

export default function AdminSyllabusCatalog() {
  const { t, language } = useUiText();
  const [list, setList] = useState<CourseSyllabusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<SyllabusUploadPreviewData | null>(null);

  // Yangi fan yaratish — hujjatsiz, faqat nom+tavsif
  const [showNewFanForm, setShowNewFanForm] = useState(false);
  const [newFanName, setNewFanName] = useState('');
  const [newFanDescription, setNewFanDescription] = useState('');
  const [newFanFiles, setNewFanFiles] = useState<File[]>([]);
  const [creatingFan, setCreatingFan] = useState(false);
  // Preview qaysi rejimda ochilgan: yangi fan yaratish yoki mavjudiga qo'shish
  const [previewMode, setPreviewMode] = useState<'create' | 'append'>('append');

  // Qaysi fan qatorida hujjat yuklash oynasi ochiq
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      setList(await fetchAdminCourseSyllabuses());
    } catch (err) {
      setList([]);
      setListError(listLoadErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetNewFanForm = () => {
    setNewFanName('');
    setNewFanDescription('');
    setNewFanFiles([]);
    setShowNewFanForm(false);
  };

  /**
   * PDF(lar)dan AI orqali mavzularni ajratib variantlar yig'adi.
   * Bitta fayl xato bo'lsa — qolganlarini davom ettiradi; kamida bitta muvaffaqiyat kerak.
   */
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

  const createFan = async () => {
    const name = newFanName.trim();
    if (!name) {
      setError(t('admin.error.enterSubjectName'));
      return;
    }

    // PDF(lar) tanlangan bo'lsa: AI tahlil → preview (create rejimi) → tasdiqda yaratiladi
    if (newFanFiles.length) {
      const result = await extractVariantsFromFiles(newFanFiles, 'uz');
      if (!result) return;
      setPreviewMode('create');
      setUploadTargetId(null);
      setPreview({
        subjectName: name,
        description: newFanDescription.trim(),
        instructionLanguage: result.language,
        variants: result.variants.map((v) => ({ ...v, editableLabel: v.label })),
      });
      return;
    }

    // PDFsiz: nom bilan bo'sh fan yaratish (keyin hujjat qo'shiladi)
    setCreatingFan(true);
    setError(null);
    try {
      await createAdminCourseSyllabus({
        subject_name: name,
        description: newFanDescription.trim(),
        sort_order: list.length,
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

  const processFiles = async (files: FileList | File[]) => {
    const target = list.find((r) => r.id === uploadTargetId);
    if (!target) return;

    const uploadFiles = filterSyllabusUploadFiles(files);
    if (!uploadFiles.length) {
      setError(t('admin.error.filesRequired'));
      return;
    }

    const result = await extractVariantsFromFiles(uploadFiles, resolveSyllabusInstructionLanguage(target));
    if (!result) return;

    setPreviewMode('append');
    setPreview({
      subjectName: target.subject_name,
      description: target.description || '',
      instructionLanguage: result.language,
      variants: result.variants.map((v) => ({ ...v, editableLabel: v.label })),
    });
  };

  const savePreview = async () => {
    if (!preview) return;

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
        const subjectName = preview.subjectName.trim();
        if (!subjectName) {
          setError(t('admin.error.enterSubjectName'));
          return;
        }
        await createAdminCourseSyllabus({
          subject_name: subjectName,
          description: preview.description.trim(),
          instruction_language: preview.instructionLanguage,
          variants,
          sort_order: list.length,
        });
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

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await processFiles(files);
    e.target.value = '';
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
      await load();
    } catch {
      setError(t('admin.error.deleteFailedGeneric'));
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

  const toggleExpand = (row: CourseSyllabusRow) => {
    const next = expandedId === row.id ? null : row.id;
    setExpandedId(next);
    if (next === null) {
      setUploadTargetId(null);
    }
  };

  const busy = uploading;

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
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
              <BookOpen size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{t('admin.syllabusTitle')}</h2>
              <p className="text-[13px] text-slate-500 leading-relaxed">{t('admin.syllabusDescription')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowNewFanForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold shadow-md"
          >
            <Plus size={18} /> {t('admin.newSubject')}
          </button>
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

        {showNewFanForm && (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[12px] font-semibold text-slate-600">{t('admin.subjectName')}</span>
                <input
                  value={newFanName}
                  onChange={(e) => setNewFanName(e.target.value)}
                  placeholder={t('admin.subjectNamePlaceholder')}
                  disabled={creatingFan || uploading}
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
                  disabled={creatingFan || uploading}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white"
                />
              </label>
            </div>
            <div className="space-y-2">
              <span className="text-[12px] font-semibold text-slate-600">
                {t('admin.syllabusDocumentsTitle')}
              </span>
              {newFanFiles.length > 0 && (
                <ul className="space-y-1">
                  {newFanFiles.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-3 py-1.5"
                    >
                      <FileText size={14} className="text-slate-500 shrink-0" />
                      <span className="text-[12px] text-slate-700 truncate flex-1">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setNewFanFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        disabled={uploading}
                        className="p-1 text-rose-400 hover:text-rose-600 disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label
                className={`flex flex-col items-center justify-center gap-1.5 w-full py-4 rounded-xl border-2 border-dashed cursor-pointer transition ${
                  uploading ? 'border-slate-200 bg-slate-50' : 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="animate-spin text-indigo-600" size={18} />
                    <span className="text-[12px] font-semibold text-indigo-700 text-center px-4">
                      {progress
                        ? t('admin.progress', {
                            current: progress.current,
                            total: progress.total,
                            fileName: progress.fileName,
                          })
                        : t('admin.analyzing')}
                    </span>
                  </>
                ) : (
                  <>
                    <FolderOpen size={20} className="text-indigo-600" />
                    <span className="text-[12px] font-semibold text-indigo-800">{t('admin.uploadDocuments')}</span>
                  </>
                )}
                <input
                  type="file"
                  accept={SYLLABUS_UPLOAD_ACCEPT}
                  multiple
                  className="hidden"
                  disabled={uploading || creatingFan}
                  onChange={(e) => {
                    const picked = filterSyllabusUploadFiles(e.target.files || []);
                    if (picked.length) {
                      setNewFanFiles((prev) => [...prev, ...picked]);
                      setError(null);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void createFan()}
                disabled={creatingFan || uploading || !newFanName.trim()}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold disabled:opacity-40"
              >
                {creatingFan || uploading ? <Loader2 className="animate-spin inline" size={16} /> : t('admin.create')}
              </button>
              <button
                type="button"
                onClick={resetNewFanForm}
                disabled={uploading}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-700 disabled:opacity-40"
              >
                {t('admin.cancel')}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-[13px] text-rose-600 font-medium">{error}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-slate-500">{t('admin.noSubjectsYet')}</p>
          <p className="text-[13px] text-slate-400">{t('admin.uploadSyllabus')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((row) => {
            const variants = resolveSyllabusVariants(row);
            const open = expandedId === row.id;
            const topicTotal = totalTopicCount(variants);
            const uploaderOpen = uploadTargetId === row.id;
            return (
              <li key={row.id} className="ios-glass rounded-2xl border border-white/70 overflow-hidden">
                <div className="p-4 flex flex-wrap items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <FileText size={20} className="text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
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
                    onClick={() => toggleExpand(row)}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                    title={t('admin.directionsTitle')}
                  >
                    {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(row)}
                    className="flex items-center gap-1 text-[12px] font-semibold text-slate-600"
                  >
                    {row.is_active ? <ToggleRight className="text-emerald-600" size={22} /> : <ToggleLeft size={22} />}
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
                    <div className="space-y-2">
                      <p className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5">
                        <FileText size={14} />
                        {t('admin.syllabusDocumentsTitle')}
                      </p>

                      {variants.length === 0 ? (
                        <p className="text-[12px] text-amber-700 py-1">
                          {t('admin.noDocumentUploaded')}
                        </p>
                      ) : (
                        variants.map((v) => {
                          const counts = countTopicsByType(v.topics);
                          return (
                            <div
                              key={`${row.id}-${v.label}-${v.file_name}`}
                              className="flex items-center gap-3 rounded-xl bg-white border border-slate-100 px-3 py-2"
                            >
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
                          );
                        })
                      )}

                      {uploaderOpen ? (
                        <label
                          className={`flex flex-col items-center justify-center gap-1.5 w-full py-4 rounded-xl border-2 border-dashed cursor-pointer transition ${
                            uploading ? 'border-slate-200 bg-slate-50' : 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50'
                          }`}
                        >
                          {uploading ? (
                            <>
                              <Loader2 className="animate-spin text-indigo-600" size={18} />
                              <span className="text-[12px] font-semibold text-indigo-700 text-center px-4">
                                {progress
                                  ? t('admin.progress', {
                                      current: progress.current,
                                      total: progress.total,
                                      fileName: progress.fileName,
                                    })
                                  : t('admin.analyzing')}
                              </span>
                            </>
                          ) : (
                            <>
                              <FolderOpen size={20} className="text-indigo-600" />
                              <span className="text-[12px] font-semibold text-indigo-800">{t('admin.uploadDocuments')}</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept={SYLLABUS_UPLOAD_ACCEPT}
                            multiple
                            className="hidden"
                            disabled={busy}
                            onChange={(e) => void handleDocumentUpload(e)}
                          />
                        </label>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setUploadTargetId(row.id)}
                          className="text-[12px] font-semibold text-indigo-600 hover:underline"
                        >
                          + {t('admin.addDocumentToSubject')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
