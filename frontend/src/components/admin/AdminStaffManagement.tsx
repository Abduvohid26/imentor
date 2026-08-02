import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Plus, Pencil, Trash2, Loader2, AlertCircle, Shield, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { normalizePhoneDigits, type UserRole } from '../../utils/localStaffAuth';
import {
  fetchStaffDirectory,
  removeStaffMember,
  upsertStaffMember,
  type StaffDirectoryEntry,
} from '../../utils/staffDirectoryApi';
import { fetchAcademicCatalog, type AcademicCatalog } from '../../utils/academicCatalogApi';
import { HttpError } from '../../api/httpClient';
import { roleLabel } from '../../i18n/translations';
import { useUiText } from '../../i18n/useUiText';

function formatLastActive(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const emptyForm = {
  phoneDisplay: '+998',
  password: '',
  firstName: '',
  lastName: '',
  faculty: '',
  department: '',
  direction: '',
  role: 'hodim' as UserRole,
  participantKind: 'student' as 'student' | 'employee',
  studyGroup: '',
  jobTitle: '',
};

type SortKey = 'displayName' | 'phoneDisplay' | 'role' | 'faculty' | 'lastActiveAt';
type SortDirection = 'asc' | 'desc';

function loadErrorMessage(err: unknown, t: ReturnType<typeof useUiText>['t']): string {
  if (err instanceof HttpError) {
    if (err.status === 403) return t('admin.error.adminRequired');
    if (err.status === 401) return t('admin.error.reloginRequired');
  }
  return t('admin.error.loadFailed');
}

export default function AdminStaffManagement() {
  const { t, language } = useUiText();
  const [rows, setRows] = useState<StaffDirectoryEntry[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('lastActiveAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<StaffDirectoryEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showAdd, setShowAdd] = useState(false);
  const [catalog, setCatalog] = useState<AcademicCatalog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchStaffDirectory());
    } catch (err) {
      setRows([]);
      setError(loadErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchAcademicCatalog()
      .then(setCatalog)
      .catch(() => setCatalog(null)); // katalog ixtiyoriy — bo'lmasa oddiy matn kiritish davom etadi
  }, []);

  // form.department/direction/studyGroup — mavjud CharField'lar (nom matni sifatida
  // saqlanadi, ID emas). Dropdown'lar shu matnni katalog nomlaridan tanlab to'ldiradi;
  // katalogda mavjud bo'lmagan eski qiymatlar ham (moslik topilmasa) saqlanib qoladi.
  const selectedKafedra = catalog?.kafedralar.find((k) => k.name === form.department) || null;
  const directionOptions = selectedKafedra?.directions ?? catalog?.unassigned_directions ?? [];
  const selectedDirection = directionOptions.find((d) => d.name === form.direction) || null;
  const groupOptions = selectedDirection?.groups ?? [];

  const startEdit = (u: StaffDirectoryEntry) => {
    setEditing(u);
    setForm({
      phoneDisplay: u.phone_display,
      password: '',
      firstName: u.first_name,
      lastName: u.last_name,
      faculty: u.faculty,
      department: u.department,
      direction: u.direction,
      role: (u.role || 'hodim') as UserRole,
      participantKind: (u.participant_kind || 'student') as 'student' | 'employee',
      studyGroup: u.study_group,
      jobTitle: u.job_title,
    });
    setShowAdd(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (form.password.length < 6) {
        setError(t('admin.error.passwordMin'));
        return;
      }
      if (form.role === 'startuper') {
        if (form.participantKind === 'student' && !form.studyGroup.trim()) {
          setError(t('admin.error.startuperGroupRequired'));
          return;
        }
        if (form.participantKind === 'employee' && !form.jobTitle.trim()) {
          setError(t('admin.error.startuperJobRequired'));
          return;
        }
      }
      const phoneDigits = normalizePhoneDigits(form.phoneDisplay.trim());
      await upsertStaffMember({
        phone_digits: phoneDigits,
        password: form.password,
        role: form.role,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        faculty: form.faculty.trim(),
        department: form.department.trim(),
        direction: form.direction.trim(),
        participant_kind: form.role === 'startuper' ? form.participantKind : undefined,
        study_group: form.role === 'startuper' && form.participantKind === 'student' ? form.studyGroup.trim() : undefined,
        job_title: form.role === 'startuper' && form.participantKind === 'employee' ? form.jobTitle.trim() : undefined,
      });
      setForm(emptyForm);
      setShowAdd(false);
      await load();
    } catch (err: unknown) {
      if (err instanceof HttpError && err.status === 400) {
        setError(t('admin.error.phoneAlreadyExists'));
      } else if (err instanceof HttpError && err.status === 403) {
        setError(t('admin.error.forbidden'));
      } else if (err instanceof Error && err.message === 'no-admin-token') {
        setError(t('admin.error.noAdminToken'));
      } else {
        setError(t('admin.error.createFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      if (form.role === 'startuper') {
        if (form.participantKind === 'student' && !form.studyGroup.trim()) {
          setError(t('admin.error.startuperGroupRequired'));
          return;
        }
        if (form.participantKind === 'employee' && !form.jobTitle.trim()) {
          setError(t('admin.error.startuperJobRequired'));
          return;
        }
      }
      await upsertStaffMember({
        phone_digits: normalizePhoneDigits(form.phoneDisplay.trim()),
        password: form.password.trim().length >= 6 ? form.password : undefined,
        role: form.role,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        faculty: form.faculty.trim(),
        department: form.department.trim(),
        direction: form.direction.trim(),
        participant_kind: form.role === 'startuper' ? form.participantKind : undefined,
        study_group: form.role === 'startuper' && form.participantKind === 'student' ? form.studyGroup.trim() : undefined,
        job_title: form.role === 'startuper' && form.participantKind === 'employee' ? form.jobTitle.trim() : undefined,
      });
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (err: unknown) {
      if (err instanceof HttpError && err.status === 403) {
        setError(t('admin.error.forbidden'));
      } else if (err instanceof Error && err.message === 'no-admin-token') {
        setError(t('admin.error.noAdminToken'));
      } else {
        setError(t('admin.error.updateFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: StaffDirectoryEntry) => {
    if (!window.confirm(t('admin.error.confirmDeleteUser', { name: u.display_name }))) return;
    setError(null);
    setSaving(true);
    try {
      await removeStaffMember(u.phone_digits);
      await load();
    } catch (err: unknown) {
      if (err instanceof HttpError && err.status === 400) {
        setError(t('admin.error.cannotDeleteSelf'));
      } else if (err instanceof HttpError && err.status === 403) {
        setError(t('admin.error.lastAdminDelete'));
      } else if (err instanceof Error && err.message === 'no-admin-token') {
        setError(t('admin.error.noAdminToken'));
      } else {
        setError(t('admin.error.deleteFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      let left: string | number = '';
      let right: string | number = '';

      switch (sortKey) {
        case 'displayName':
          left = (a.display_name || '').toLocaleLowerCase();
          right = (b.display_name || '').toLocaleLowerCase();
          break;
        case 'phoneDisplay':
          left = (a.phone_display || '').toLocaleLowerCase();
          right = (b.phone_display || '').toLocaleLowerCase();
          break;
        case 'role':
          left = a.role;
          right = b.role;
          break;
        case 'faculty':
          left = (a.faculty || '').toLocaleLowerCase();
          right = (b.faculty || '').toLocaleLowerCase();
          break;
        case 'lastActiveAt':
          left = a.last_login ? new Date(a.last_login).getTime() : 0;
          right = b.last_login ? new Date(b.last_login).getTime() : 0;
          break;
        default:
          break;
      }

      if (left < right) return sortDirection === 'asc' ? -1 : 1;
      if (left > right) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [rows, sortDirection, sortKey]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const sortLabel = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className="inline-flex items-center gap-1.5 hover:text-black/80 transition-colors"
      title={`${label} ${t('admin.sortBy')}`}
    >
      <span>{label}</span>
      {sortKey !== key && <ArrowUpDown size={13} className="text-black/40" />}
      {sortKey === key && sortDirection === 'asc' && <ArrowUp size={13} className="text-indigo-600" />}
      {sortKey === key && sortDirection === 'desc' && <ArrowDown size={13} className="text-indigo-600" />}
    </button>
  );

  return (
    <div className="w-full space-y-6 pb-16 px-3 sm:px-5 lg:px-6 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-black/90">{t('admin.staffManagementTitle')}</h1>
            <p className="text-[12px] text-black/50">{t('admin.staffManagementSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAdd(true);
            setEditing(null);
            setForm({ ...emptyForm });
            setError(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold shadow-md"
        >
          <Plus size={18} /> {t('admin.addStaff')}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="ios-glass rounded-2xl border border-white/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-black/[0.04] text-black/55 font-semibold">
              <tr>
                <th className="px-4 py-3">{sortLabel('displayName', t('admin.fullName'))}</th>
                <th className="px-4 py-3">{sortLabel('phoneDisplay', t('admin.phone'))}</th>
                <th className="px-4 py-3">{sortLabel('role', t('admin.role'))}</th>
                <th className="px-4 py-3">{sortLabel('faculty', t('admin.faculty'))}</th>
                <th className="px-4 py-3 whitespace-nowrap min-w-[140px]">{sortLabel('lastActiveAt', t('admin.lastActivity'))}</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-black/45">
                    <Loader2 className="animate-spin inline mr-2" size={18} />
                    {t('admin.loading')}
                  </td>
                </tr>
              ) : (
                sortedRows.map((u) => (
                  <tr key={u.phone_digits} className="hover:bg-black/[0.02]">
                    <td className="px-4 py-2.5 font-medium text-black/90">{u.display_name}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{u.phone_display}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/5 text-[11px] font-semibold">
                        {u.role === 'admin' && <Shield size={12} />}
                        {roleLabel(language, u.role || 'hodim')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-black/65 max-w-[180px] truncate">{u.faculty}</td>
                    <td className="px-4 py-2.5 text-black/55 tabular-nums text-[12px] whitespace-nowrap">
                      {formatLastActive(u.last_login)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          className="p-2 rounded-lg hover:bg-black/5 text-indigo-600"
                          title={t('admin.edit')}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(u)}
                          className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-600"
                          title={t('admin.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {(showAdd || editing) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="ios-glass rounded-2xl border border-white/60 p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-black/90">{editing ? t('admin.editStaff') : t('admin.newStaff')}</h2>
            <form onSubmit={editing ? handleUpdate : handleCreate} className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] font-semibold text-black/50">{t('admin.phone')}</span>
                <input
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                  value={form.phoneDisplay}
                  onChange={(e) => setForm((f) => ({ ...f, phoneDisplay: e.target.value }))}
                  required
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] font-semibold text-black/50">
                  {t('admin.password')} {editing && `(${t('admin.passwordEmpty')})`}
                </span>
                <input
                  type="password"
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={!editing}
                  placeholder={editing ? '••••••' : ''}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-black/50">{t('admin.firstName')}</span>
                <input
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-black/50">{t('admin.lastName')}</span>
                <input
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] font-semibold text-black/50">{t('admin.faculty')}</span>
                <input
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                  value={form.faculty}
                  onChange={(e) => setForm((f) => ({ ...f, faculty: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-black/50">{t('admin.department')}</span>
                {catalog ? (
                  <select
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                    value={form.department}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, department: e.target.value, direction: '', studyGroup: '' }))
                    }
                  >
                    <option value="">{t('admin.notSelected')}</option>
                    {form.department && !catalog.kafedralar.some((k) => k.name === form.department) && (
                      <option value={form.department}>{form.department}</option>
                    )}
                    {catalog.kafedralar.map((k) => (
                      <option key={k.id} value={k.name}>{k.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  />
                )}
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-black/50">{t('admin.direction')}</span>
                {catalog ? (
                  <select
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                    value={form.direction}
                    onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value, studyGroup: '' }))}
                  >
                    <option value="">{t('admin.notSelected')}</option>
                    {form.direction && !directionOptions.some((d) => d.name === form.direction) && (
                      <option value={form.direction}>{form.direction}</option>
                    )}
                    {directionOptions.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                    value={form.direction}
                    onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
                  />
                )}
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] font-semibold text-black/50">{t('admin.role')}</span>
                <select
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                >
                  <option value="hodim">{roleLabel(language, 'hodim')}</option>
                  <option value="admin">{roleLabel(language, 'admin')}</option>
                  <option value="startuper">{roleLabel(language, 'startuper')}</option>
                </select>
              </label>
              {form.role === 'startuper' && (
                <>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-semibold text-black/50">{t('admin.participantKind')}</span>
                    <select
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                      value={form.participantKind}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          participantKind: e.target.value as 'student' | 'employee',
                        }))
                      }
                    >
                      <option value="student">{t('admin.student')}</option>
                      <option value="employee">{t('admin.employee')}</option>
                    </select>
                  </label>
                  {form.participantKind === 'student' ? (
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-semibold text-black/50">{t('admin.studyGroup')}</span>
                      {catalog && groupOptions.length > 0 ? (
                        <select
                          className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                          value={form.studyGroup}
                          onChange={(e) => setForm((f) => ({ ...f, studyGroup: e.target.value }))}
                        >
                          <option value="">{t('admin.notSelected')}</option>
                          {form.studyGroup && !groupOptions.some((g) => g.name === form.studyGroup) && (
                            <option value={form.studyGroup}>{form.studyGroup}</option>
                          )}
                          {groupOptions.map((g) => (
                            <option key={g.id} value={g.name}>{g.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                          value={form.studyGroup}
                          onChange={(e) => setForm((f) => ({ ...f, studyGroup: e.target.value }))}
                        />
                      )}
                    </label>
                  ) : (
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-semibold text-black/50">{t('admin.jobTitle')}</span>
                      <input
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
                        value={form.jobTitle}
                        onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                      />
                    </label>
                  )}
                </>
              )}
              <div className="sm:col-span-2 flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
                >
                  {saving ? <Loader2 className="animate-spin inline" /> : editing ? t('admin.save') : t('admin.create')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setShowAdd(false);
                    setForm(emptyForm);
                  }}
                  className="px-6 py-3 rounded-xl border border-black/10 font-semibold"
                >
                  {t('admin.cancel')}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
