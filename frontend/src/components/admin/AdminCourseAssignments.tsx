import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import {
  assignStaffToCourseSyllabus,
  fetchAdminCourseSyllabuses,
  fetchAllStaffCourseSelections,
  removeStaffCourseSelection,
  type AdminStaffCourseSelectionRow,
  type CourseSyllabusRow,
} from '../../utils/syllabusApi';
import { fetchStaffDirectory, type StaffDirectoryEntry } from '../../utils/staffDirectoryApi';
import { resolveSyllabusVariants } from '../../utils/syllabusVariant';
import { useUiText } from '../../i18n/useUiText';
import SearchableSelect from './SearchableSelect';

type FanBucket = { fanId: number; fanName: string; rows: AdminStaffCourseSelectionRow[] };
type TeacherGroup = {
  ownerKey: string;
  name: string;
  phone: string;
  fans: FanBucket[];
  directionCount: number;
};

export default function AdminCourseAssignments() {
  const { t } = useUiText();
  const [fans, setFans] = useState<CourseSyllabusRow[]>([]);
  const [teachers, setTeachers] = useState<StaffDirectoryEntry[]>([]);
  const [selections, setSelections] = useState<AdminStaffCourseSelectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Biriktirish: o'qituvchi → fan → yo'nalish(lar)
  const [phone, setPhone] = useState('');
  const [fanId, setFanId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Ro'yxat: qidiruv, filtrlar, detail
  const [search, setSearch] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [fanFilter, setFanFilter] = useState('');
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fanRows, staff, sels] = await Promise.all([
        fetchAdminCourseSyllabuses(),
        fetchStaffDirectory(),
        fetchAllStaffCourseSelections(),
      ]);
      setFans(fanRows);
      setTeachers(staff.filter((u) => u.role === 'hodim'));
      setSelections(sels);
    } catch {
      setError(t('admin.error.loadFailed'));
      setFans([]);
      setTeachers([]);
      setSelections([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedFan = useMemo(() => fans.find((f) => String(f.id) === fanId) || null, [fans, fanId]);
  const variants = useMemo(
    () => (selectedFan ? resolveSyllabusVariants(selectedFan) : []),
    [selectedFan],
  );

  useEffect(() => {
    setPicked([]);
  }, [fanId]);

  const alreadyAssigned = useMemo(() => {
    const set = new Set<string>();
    if (!phone || !fanId) return set;
    for (const sel of selections) {
      if (sel.owner_key === phone && String(sel.syllabus.id) === fanId) {
        set.add(sel.variant_label || '');
      }
    }
    return set;
  }, [selections, phone, fanId]);

  // O'qituvchi bo'yicha guruhlash (har o'qituvchi bir marta)
  const teacherGroups = useMemo<TeacherGroup[]>(() => {
    const map = new Map<string, { ownerKey: string; name: string; phone: string; fans: Map<number, FanBucket> }>();
    for (const sel of selections) {
      const key = sel.owner_key;
      if (!map.has(key)) {
        map.set(key, {
          ownerKey: key,
          name: sel.owner_name || sel.owner_phone_display,
          phone: sel.owner_phone_display,
          fans: new Map(),
        });
      }
      const g = map.get(key)!;
      if (!g.fans.has(sel.syllabus.id)) {
        g.fans.set(sel.syllabus.id, { fanId: sel.syllabus.id, fanName: sel.syllabus.subject_name, rows: [] });
      }
      g.fans.get(sel.syllabus.id)!.rows.push(sel);
    }
    return [...map.values()]
      .map((g) => {
        const fanList = [...g.fans.values()].sort((a, b) => a.fanName.localeCompare(b.fanName));
        return {
          ownerKey: g.ownerKey,
          name: g.name,
          phone: g.phone,
          fans: fanList,
          directionCount: fanList.reduce((n, f) => n + f.rows.length, 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selections]);

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teacherGroups.filter((g) => {
      if (teacherFilter && g.ownerKey !== teacherFilter) return false;
      if (fanFilter && !g.fans.some((f) => String(f.fanId) === fanFilter)) return false;
      if (q) {
        const inTeacher = g.name.toLowerCase().includes(q) || g.phone.toLowerCase().includes(q);
        const inFan = g.fans.some((f) => f.fanName.toLowerCase().includes(q));
        if (!inTeacher && !inFan) return false;
      }
      return true;
    });
  }, [teacherGroups, search, teacherFilter, fanFilter]);

  const detailGroup = useMemo(
    () => (detailKey ? teacherGroups.find((g) => g.ownerKey === detailKey) ?? null : null),
    [detailKey, teacherGroups],
  );

  const toggle = (label: string) => {
    setPicked((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  const assign = async () => {
    if (!phone || !fanId) return;
    if (variants.length > 0 && picked.length === 0) {
      setError(t('admin.error.pickSyllabus'));
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      await assignStaffToCourseSyllabus(phone, Number(fanId), picked);
      // Formani to'liq tozalash — keyingi biriktirishga tayyor
      setPicked([]);
      setPhone('');
      setFanId('');
      setSelections(await fetchAllStaffCourseSelections());
    } catch {
      setError(t('admin.error.assignFailed'));
    } finally {
      setAssigning(false);
    }
  };

  const unassign = async (id: number) => {
    try {
      await removeStaffCourseSelection(id);
      setSelections((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError(t('admin.error.unassignFailed'));
    }
  };

  const canAssign =
    Boolean(phone) && Boolean(fanId) && !(variants.length > 0 && picked.length === 0) && !assigning;

  // Detail ochiq bo'lsa-yu o'qituvchida biriktirish qolmasa — ro'yxatga qaytamiz
  useEffect(() => {
    if (detailKey && !loading && !teacherGroups.some((g) => g.ownerKey === detailKey)) {
      setDetailKey(null);
    }
  }, [detailKey, teacherGroups, loading]);

  return (
    <div className="p-3 sm:p-5 lg:p-6 h-full overflow-y-auto w-full space-y-6">
      {/* Sarlavha */}
      <div className="ios-glass rounded-3xl border border-white/70 p-6 shadow-sm flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
            <GraduationCap size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('admin.assignmentsTitle')}</h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">{t('admin.assignmentsSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700"
        >
          <RefreshCw size={16} /> {t('admin.refresh')}
        </button>
      </div>

      {/* Biriktirish: o'qituvchi → fan → yo'nalish(lar) */}
      <div className="ios-glass rounded-2xl border border-white/70 p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[12px] font-semibold text-slate-600">1 · {t('admin.assignedTeachers')}</span>
            <SearchableSelect
              value={phone}
              onChange={setPhone}
              disabled={assigning}
              placeholder={t('admin.selectTeacherPlaceholder')}
              noMatchText={t('admin.noResults')}
              options={teachers.map((tch) => ({
                value: tch.phone_digits,
                label: `${tch.display_name} (${tch.phone_digits})`,
              }))}
            />
          </label>

          <label className="space-y-1">
            <span className="text-[12px] font-semibold text-slate-600">2 · {t('admin.subjectName')}</span>
            <SearchableSelect
              value={fanId}
              onChange={setFanId}
              disabled={assigning}
              placeholder={t('admin.selectSubjectPlaceholder')}
              noMatchText={t('admin.noResults')}
              options={[...fans]
                .sort((a, b) => {
                  const da = (a.department_name || '').localeCompare(b.department_name || '', 'uz');
                  if (da !== 0) return da;
                  return a.subject_name.localeCompare(b.subject_name, 'uz');
                })
                .map((f) => {
                  const tracks = resolveSyllabusVariants(f).length;
                  const dept = (f.department_name || '').trim();
                  const base = dept ? `${f.subject_name} · ${dept}` : f.subject_name;
                  const meta = tracks > 0 ? ` (${tracks})` : '';
                  const inactive = f.is_active ? '' : ` · ${t('admin.toggleInactive')}`;
                  return {
                    value: String(f.id),
                    label: `${base}${meta}${inactive}`,
                    searchText: `${f.subject_name} ${dept} ${f.subject_code || ''} ${f.department_code || ''}`,
                  };
                })}
            />
          </label>
        </div>

        {fanId && (
          <div className="space-y-2">
            <span className="text-[12px] font-semibold text-slate-600">3 · {t('admin.syllabusesLabel')}</span>
            {variants.length === 0 ? (
              <p className="text-[12px] text-amber-700">{t('admin.noSyllabusInSubject')}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {variants.map((v) => {
                  const assignedNow = alreadyAssigned.has(v.label);
                  const checked = picked.includes(v.label);
                  return (
                    <label
                      key={v.label}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition ${
                        checked ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(v.label)}
                        disabled={assigning}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">
                        {v.label}
                      </span>
                      <span className="text-[12px] text-slate-600 truncate flex-1 flex items-center gap-1">
                        <FileText size={12} className="text-slate-400 shrink-0" />
                        {v.file_name}
                      </span>
                      {assignedNow && (
                        <span className="text-[10px] font-semibold text-emerald-600 shrink-0">
                          {t('admin.alreadyAssigned')}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => void assign()}
            disabled={!canAssign}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold disabled:opacity-40"
          >
            {assigning ? <Loader2 className="animate-spin" size={16} /> : <Users size={16} />}
            {t('admin.assign')}
          </button>
          {error && <p className="text-[13px] text-rose-600 font-medium">{error}</p>}
        </div>
      </div>

      {/* Ro'yxat / Detail */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      ) : detailGroup ? (
        <TeacherDetail group={detailGroup} onBack={() => setDetailKey(null)} onUnassign={unassign} t={t} />
      ) : (
        <div className="space-y-3">
          {/* Qidiruv + filtrlar */}
          <div className="ios-glass rounded-2xl border border-white/70 p-3 grid gap-2 sm:grid-cols-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin.searchPlaceholder')}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-[13px]"
              />
            </div>
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px]"
            >
              <option value="">{t('admin.filterAllTeachers')}</option>
              {teachers.map((tch) => (
                <option key={tch.phone_digits} value={tch.phone_digits}>
                  {tch.display_name}
                </option>
              ))}
            </select>
            <select
              value={fanFilter}
              onChange={(e) => setFanFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px]"
            >
              <option value="">{t('admin.filterAllSubjects')}</option>
              {fans.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.subject_name}
                </option>
              ))}
            </select>
          </div>

          {teacherGroups.length === 0 ? (
            <div className="ios-glass rounded-2xl border p-10 text-center text-slate-400 text-[14px]">
              {t('admin.assignmentsEmpty')}
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="ios-glass rounded-2xl border p-10 text-center text-slate-400 text-[14px]">
              {t('admin.noResults')}
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleGroups.map((g) => (
                <li key={g.ownerKey}>
                  <button
                    type="button"
                    onClick={() => setDetailKey(g.ownerKey)}
                    className="w-full ios-glass rounded-2xl border border-white/70 px-4 py-3 flex items-center gap-3 text-left hover:border-indigo-300 transition"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <User size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 truncate">{g.name}</p>
                      <p className="text-[12px] text-slate-500">
                        {g.phone} · {t('admin.subjectsCount', { count: g.fans.length })} ·{' '}
                        {t('admin.directionsCount', { count: g.directionCount })}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TeacherDetail({
  group,
  onBack,
  onUnassign,
  t,
}: {
  group: TeacherGroup;
  onBack: () => void;
  onUnassign: (id: number) => void;
  t: ReturnType<typeof useUiText>['t'];
}) {
  return (
    <div className="space-y-3">
      <div className="ios-glass rounded-2xl border border-white/70 p-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <User size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900 truncate">{group.name}</p>
          <p className="text-[12px] text-slate-500">
            {group.phone} · {t('admin.subjectsCount', { count: group.fans.length })} ·{' '}
            {t('admin.directionsCount', { count: group.directionCount })}
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {group.fans.map((fan) => {
          const fileByLabel = new Map(
            resolveSyllabusVariants(fan.rows[0].syllabus).map((v) => [v.label, v.file_name]),
          );
          return (
            <li key={fan.fanId} className="ios-glass rounded-2xl border border-white/70 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                <GraduationCap size={16} className="text-indigo-600 shrink-0" />
                <span className="font-bold text-slate-900">{fan.fanName}</span>
                <span className="text-[11px] text-slate-400">· {fan.rows.length}</span>
              </div>
              <ul className="divide-y divide-slate-50">
                {fan.rows.map((sel) => {
                  const fileName = sel.variant_label ? fileByLabel.get(sel.variant_label) : '';
                  return (
                    <li key={sel.id} className="flex items-center gap-2 px-4 py-2.5">
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 shrink-0">
                        {sel.variant_label || t('admin.allDirections')}
                      </span>
                      <span className="text-[12px] text-slate-600 truncate flex-1 flex items-center gap-1 min-w-0">
                        {fileName && (
                          <>
                            <FileText size={12} className="text-slate-400 shrink-0" />
                            {fileName}
                          </>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUnassign(sel.id)}
                        className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"
                        title={t('admin.delete')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
