import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Users,
  FolderOpen,
  Save,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useUiText } from '../../i18n/useUiText';
import { buildStartupProfileSnapshot, getCurrentLocalUser } from '../../utils/localStaffAuth';
import {
  listMyStartupApplications,
  submitStartupApplication,
  updateStartupApplication,
  type StartupApplicationDto,
} from '../../utils/startupApplicationApi';
import { evaluateDossierForSubmit } from '../../utils/startupProjectQuality';

const MAX_FILE_BYTES = 380_000;
const MAX_FILES = 8;

export type DossierTeamMember = {
  id: string;
  full_name: string;
  role: string;
  organization: string;
  contact: string;
};

export type DossierAttachment = {
  id: string;
  file_name: string;
  mime_type: string;
  label: string;
  size_bytes: number;
  base64: string;
};

export type SubmissionDossierShape = {
  project_kind?: 'startup' | 'research' | 'hybrid';
  team_members?: DossierTeamMember[];
  applicant_notes?: string;
  vc_one_liner?: string;
  attachments?: DossierAttachment[];
};

function newId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result;
      if (typeof res !== 'string') {
        reject(new Error('read-fail'));
        return;
      }
      const idx = res.indexOf(',');
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    r.onerror = () => reject(r.error ?? new Error('read-fail'));
    r.readAsDataURL(file);
  });
}

export default function StartupDossierSubmit() {
  const { t } = useUiText();
  const [items, setItems] = useState<StartupApplicationDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectKind, setProjectKind] = useState<'startup' | 'research' | 'hybrid'>('hybrid');
  const [vcOneLiner, setVcOneLiner] = useState('');
  const [notes, setNotes] = useState('');
  const [team, setTeam] = useState<DossierTeamMember[]>([]);
  const [attachments, setAttachments] = useState<DossierAttachment[]>([]);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  const dossierGate = useMemo(() => {
    if (!selected || selected.status === 'submitted') return null;
    return evaluateDossierForSubmit({
      application: selected,
      vcOneLiner,
      team,
    });
  }, [selected, vcOneLiner, team]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await listMyStartupApplications();
      setItems(list);
      setSelectedId((prev) => {
        if (list.length === 0) return null;
        if (prev != null && list.some((x) => x.id === prev)) return prev;
        return list[0].id;
      });
    } catch {
      setError(t('startup.error.dossierLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const d = (selected.submission_dossier || {}) as SubmissionDossierShape;
    setProjectKind(d.project_kind ?? 'hybrid');
    setVcOneLiner(typeof d.vc_one_liner === 'string' ? d.vc_one_liner : '');
    setNotes(typeof d.applicant_notes === 'string' ? d.applicant_notes : '');
    if (Array.isArray(d.team_members) && d.team_members.length > 0) {
      setTeam(
        d.team_members.map((m) => ({
          id: m.id || newId(),
          full_name: m.full_name ?? '',
          role: m.role ?? '',
          organization: m.organization ?? '',
          contact: m.contact ?? '',
        }))
      );
    } else {
      setTeam([]);
    }
    if (Array.isArray(d.attachments)) {
      setAttachments(
        d.attachments.map((a) => ({
          id: a.id || newId(),
          file_name: a.file_name,
          mime_type: a.mime_type,
          label: a.label ?? '',
          size_bytes: a.size_bytes,
          base64: a.base64,
        }))
      );
    } else {
      setAttachments([]);
    }
  }, [selected?.id, selected?.updated_at]);

  const buildDossierPayload = (): Record<string, unknown> => ({
    project_kind: projectKind,
    vc_one_liner: vcOneLiner.trim(),
    applicant_notes: notes.trim(),
    team_members: team.map(({ id, full_name, role, organization, contact }) => ({
      id,
      full_name: full_name.trim(),
      role: role.trim(),
      organization: organization.trim(),
      contact: contact.trim(),
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      file_name: a.file_name,
      mime_type: a.mime_type,
      label: a.label,
      size_bytes: a.size_bytes,
      base64: a.base64,
    })),
    dossier_version: 1,
    updated_at_iso: new Date().toISOString(),
  });

  const handleSaveDossier = async () => {
    if (!selected || selected.status === 'submitted') return;
    setSaving(true);
    setError(null);
    try {
      const u = getCurrentLocalUser();
      if (!u) throw new Error('auth');
      const row = await updateStartupApplication(selected.id, {
        submission_dossier: buildDossierPayload(),
        profile_snapshot: buildStartupProfileSnapshot(u),
      });
      setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    } catch {
      setError(t('startup.error.dossierSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitAdmin = async () => {
    if (!selected || selected.status === 'submitted') return;
    setError(null);
    const gate = evaluateDossierForSubmit({
      application: selected,
      vcOneLiner,
      team,
    });
    if (!gate.ok) {
      setError(gate.messages.join('\n'));
      return;
    }
    if (gate.warnings.length > 0) {
      const proceed = window.confirm(t('startup.error.dossierConfirmWarnings', { warnings: gate.warnings.join('\n\n') }));
      if (!proceed) return;
    }
    setSubmitting(true);
    try {
      const u = getCurrentLocalUser();
      if (!u) throw new Error('auth');
      await updateStartupApplication(selected.id, {
        submission_dossier: buildDossierPayload(),
        profile_snapshot: buildStartupProfileSnapshot(u),
      });
      const row = await submitStartupApplication(selected.id);
      setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
    } catch {
      setError(t('startup.error.dossierSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const addTeamRow = () => {
    setTeam((t) => [...t, { id: newId(), full_name: '', role: '', organization: '', contact: '' }]);
  };

  const updateTeam = (id: string, patch: Partial<DossierTeamMember>) => {
    setTeam((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeTeam = (id: string) => setTeam((rows) => rows.filter((r) => r.id !== id));

  const onPickFiles: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setError(null);
    const next = [...attachments];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (next.length >= MAX_FILES) {
        setError(t('startup.error.maxFiles', { max: MAX_FILES }));
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(t('startup.error.fileTooLarge', { name: file.name, maxKb: Math.round(MAX_FILE_BYTES / 1024) }));
        continue;
      }
      try {
        const b64 = await readFileAsBase64(file);
        next.push({
          id: newId(),
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          label: '',
          size_bytes: file.size,
          base64: b64,
        });
      } catch {
        setError(t('startup.error.fileReadFailed', { name: file.name }));
      }
    }
    setAttachments(next);
    e.target.value = '';
  };

  const removeAttachment = (id: string) => setAttachments((a) => a.filter((x) => x.id !== id));

  const dossierBytes = useMemo(() => {
    try {
      return new Blob([JSON.stringify(buildDossierPayload())]).size;
    } catch {
      return 0;
    }
  }, [projectKind, vcOneLiner, notes, team, attachments]);

  const dossierTooLarge = dossierBytes > 4_500_000;

  return (
    <div className="w-full space-y-6 px-3 sm:px-5 lg:px-6 pb-24 py-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <FolderOpen size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-black/90">{t('startup.dossierTitle')}</h1>
            <p className="text-[12px] text-black/50 leading-relaxed max-w-xl">{t('startup.dossierSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-black/10 bg-white/90 px-4 py-2.5 text-[13px] font-semibold text-black/80 shadow-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          {t('startup.dossierRefresh')}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800 whitespace-pre-wrap">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-black/50">
          <Loader2 className="animate-spin" size={20} />
          {t('startup.loading')}
        </div>
      ) : items.length === 0 ? (
        <div className="ios-glass rounded-2xl border border-white/60 p-8 text-center text-[14px] text-black/55">
          {t('startup.dossierNoProjects')}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-semibold text-black/45 uppercase">{t('startup.dossierProject')}</label>
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-[13px] font-medium min-w-[220px]"
            >
              {items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title.slice(0, 56)}
                  {x.status === 'submitted' ? ' ✓' : ''}
                </option>
              ))}
            </select>
            {selected?.status === 'submitted' && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                {t('startup.dossierSubmitted')}
              </span>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="ios-glass rounded-2xl border border-white/60 p-5 sm:p-6 space-y-5"
          >
            {dossierGate && (
              <div
                className={`rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${
                  dossierGate.ok
                    ? 'border-emerald-200 bg-emerald-50/65 text-emerald-950'
                    : 'border-rose-200 bg-rose-50/75 text-rose-950'
                }`}
              >
                <p className="font-bold mb-1">
                  {dossierGate.ok ? t('startup.dossierReadyToSubmit') : t('startup.dossierCannotSubmit')}
                </p>
                {!dossierGate.ok && (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {dossierGate.messages.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
                {dossierGate.ok && dossierGate.warnings.length > 0 && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-amber-950">
                    <p className="font-semibold text-[11px] uppercase tracking-wide mb-1">{t('startup.dossierRecommendations')}</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {dossierGate.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-black/50">{t('startup.dossierProjectKind')}</label>
                <select
                  value={projectKind}
                  onChange={(e) => setProjectKind(e.target.value as 'startup' | 'research' | 'hybrid')}
                  disabled={selected?.status === 'submitted'}
                  className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-[14px] disabled:opacity-60"
                >
                  <option value="startup">{t('startup.dossierStartup')}</option>
                  <option value="research">{t('startup.dossierResearch')}</option>
                  <option value="hybrid">{t('startup.dossierHybrid')}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-black/50">{t('startup.dossierOneLiner')}</label>
                <input
                  value={vcOneLiner}
                  onChange={(e) => setVcOneLiner(e.target.value)}
                  disabled={selected?.status === 'submitted'}
                  placeholder={t('startup.dossierOneLinerPlaceholder')}
                  className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-[14px] disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-black/80">
                  <Users size={16} className="text-indigo-600" />
                  <span className="text-[13px] font-bold">{t('startup.dossierTeam')}</span>
                </div>
                {selected?.status !== 'submitted' && (
                  <button
                    type="button"
                    onClick={addTeamRow}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold px-2.5 py-1.5"
                  >
                    <Plus size={14} /> {t('startup.dossierAddRow')}
                  </button>
                )}
              </div>
              {team.length === 0 && (
                <p className="text-[12px] text-black/45">{t('startup.dossierNoTeam')}</p>
              )}
              <div className="space-y-2">
                {team.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 rounded-xl border border-black/8 bg-white/70 p-3"
                  >
                    <input
                      className="sm:col-span-3 rounded-lg border border-black/10 px-2 py-2 text-[13px]"
                      placeholder={t('startup.dossierFullName')}
                      value={row.full_name}
                      onChange={(e) => updateTeam(row.id, { full_name: e.target.value })}
                      disabled={selected?.status === 'submitted'}
                    />
                    <input
                      className="sm:col-span-3 rounded-lg border border-black/10 px-2 py-2 text-[13px]"
                      placeholder={t('startup.dossierRole')}
                      value={row.role}
                      onChange={(e) => updateTeam(row.id, { role: e.target.value })}
                      disabled={selected?.status === 'submitted'}
                    />
                    <input
                      className="sm:col-span-3 rounded-lg border border-black/10 px-2 py-2 text-[13px]"
                      placeholder={t('startup.dossierOrganization')}
                      value={row.organization}
                      onChange={(e) => updateTeam(row.id, { organization: e.target.value })}
                      disabled={selected?.status === 'submitted'}
                    />
                    <div className="sm:col-span-3 flex gap-1">
                      <input
                        className="flex-1 rounded-lg border border-black/10 px-2 py-2 text-[13px]"
                        placeholder={t('startup.dossierContact')}
                        value={row.contact}
                        onChange={(e) => updateTeam(row.id, { contact: e.target.value })}
                        disabled={selected?.status === 'submitted'}
                      />
                      {selected?.status !== 'submitted' && (
                        <button
                          type="button"
                          onClick={() => removeTeam(row.id)}
                          className="p-2 rounded-lg border border-rose-200 text-rose-600 bg-rose-50"
                          aria-label={t('startup.dossierRemove')}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-black/50 flex items-center gap-2">
                <FileUp size={14} /> {t('startup.dossierDocuments', { size: Math.round(MAX_FILE_BYTES / 1024) })}
              </label>
              {selected?.status !== 'submitted' && (
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                  onChange={onPickFiles}
                  className="block w-full text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-white file:font-semibold"
                />
              )}
              {attachments.length === 0 ? (
                <p className="text-[12px] text-black/45">{t('startup.dossierOptional')}</p>
              ) : (
                <ul className="space-y-2">
                  {attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-[13px]"
                    >
                      <span className="font-medium text-black/85 truncate max-w-[200px]">{a.file_name}</span>
                      <span className="text-[11px] text-black/45">
                        {(a.size_bytes / 1024).toFixed(1)} KB
                      </span>
                      <input
                        className="flex-1 min-w-[120px] rounded-lg border border-black/10 px-2 py-1 text-[12px]"
                        placeholder={t('startup.dossierFileLabel')}
                        value={a.label}
                        onChange={(e) =>
                          setAttachments((prev) =>
                            prev.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x))
                          )
                        }
                        disabled={selected?.status === 'submitted'}
                      />
                      {selected?.status !== 'submitted' && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(a.id)}
                          className="text-rose-600 text-[12px] font-semibold"
                        >
                          {t('startup.dossierRemove')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-black/50">{t('startup.dossierNotes')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={selected?.status === 'submitted'}
                rows={4}
                className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-[14px] resize-y disabled:opacity-60"
                placeholder={t('startup.dossierNotesPlaceholder')}
              />
            </div>

            {dossierTooLarge && (
              <p className="text-[12px] text-rose-700 font-semibold">
                {t('startup.dossierTooLarge', { size: (dossierBytes / 1e6).toFixed(1) })}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={saving || selected?.status === 'submitted' || dossierTooLarge}
                onClick={() => void handleSaveDossier()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {t('startup.dossierSave')}
              </button>
              <button
                type="button"
                disabled={
                  submitting ||
                  selected?.status === 'submitted' ||
                  dossierTooLarge ||
                  (dossierGate != null && !dossierGate.ok)
                }
                onClick={() => void handleSubmitAdmin()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                {t('startup.dossierSubmit')}
              </button>
            </div>

            <p className="text-[11px] text-black/40 leading-relaxed">
              {t('startup.dossierDisclaimer')}
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
