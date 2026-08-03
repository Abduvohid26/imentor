import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2, MapPin, Plus, Radio, Trash2 } from 'lucide-react';
import { fetchStaffDirectory, type StaffDirectoryEntry } from '../../utils/staffDirectoryApi';
import AdminStaffLiveMapPanel from './AdminStaffLiveMapPanel';
import { useUiText } from '../../i18n/useUiText';
import type { UiTextKey } from '../../i18n/translations';
import {
  bulkReplaceAdminStaffSchedule,
  deleteAdminStaffSchedule,
  getScheduleWeekInfo,
  HttpError,
  listAdminStaffAlerts,
  listAdminStaffPings,
  listAdminStaffSchedule,
  listCampusBuildings,
  patchAdminStaffSchedule,
  type BulkScheduleSlotPayload,
  type CampusBuildingDto,
  type ScheduleWeekInfoDto,
  type StaffLocationAlertDto,
  type StaffLocationPingDto,
  type StaffScheduleSlotDto,
  type WeekPhase,
} from '../../utils/staffLocationApi';

// formatApiError - local if not exported; define here
function formatApiErrorLocal(err: unknown, t: (key: UiTextKey) => string): string {
  if (err instanceof HttpError && err.body && typeof err.body === 'object') {
    const b = err.body as { [key: string]: unknown };
    if (typeof b.detail === 'string') return b.detail;
    if (Array.isArray(b.non_field_errors)) return String(b.non_field_errors[0]);
    const parts: string[] = [];
    for (const [k, v] of Object.entries(b)) {
      parts.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
    if (parts.length) return parts.join('; ');
  }
  if (err instanceof Error) return err.message;
  return t('admin.error.apiGeneric');
}

const PHASE_ORDER: WeekPhase[] = ['every', 'upper', 'lower'];

type Tab = 'schedule' | 'livemap' | 'pings' | 'alerts';
type EditorMode = 'single' | 'alternating';

type IntervalRow = {
  clientId: string;
  start: string;
  end: string;
  buildingId: number | '';
  title: string;
  legacyName?: string;
  legacyLat?: string;
  legacyLng?: string;
};

/** TSX: Record<..., T[]> oxiridagi `>` JSX bilan adashmasin */
type IntervalsByWeekday = { [day: number]: IntervalRow[] };

function newClientId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function newIntervalRow(): IntervalRow {
  return {
    clientId: newClientId(),
    start: '09:00',
    end: '10:30',
    buildingId: '',
    title: '',
  };
}

function emptyIntervals(): IntervalsByWeekday {
  return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, []])) as IntervalsByWeekday;
}

function defaultPhase(s: StaffScheduleSlotDto): WeekPhase {
  return s.week_phase ?? 'every';
}

function scheduleToIntervals(slots: StaffScheduleSlotDto[], phase: WeekPhase): IntervalsByWeekday {
  const r = emptyIntervals();
  for (const s of slots) {
    if (defaultPhase(s) !== phase) continue;
    const bId = s.building?.id;
    const row: IntervalRow = {
      clientId: `s${s.id}`,
      start: String(s.start_time).slice(0, 5),
      end: String(s.end_time).slice(0, 5),
      buildingId: typeof bId === 'number' ? bId : '',
      title: s.title ?? '',
    };
    if (!bId) {
      row.legacyName = s.building_name;
      row.legacyLat = String(s.latitude);
      row.legacyLng = String(s.longitude);
    }
    r[s.weekday].push(row);
  }
  for (let d = 0; d <= 6; d++) {
    r[d].sort((a, b) => a.start.localeCompare(b.start));
  }
  return r;
}

function toHms(t: string): string {
  return t.split(':').length === 2 ? `${t}:00` : t;
}

function validateOwnerKey(v: string, t: (key: UiTextKey) => string): string | null {
  const d = v.replace(/\D/g, '');
  if (d.length !== 12 || !d.startsWith('998')) return t('admin.error.phoneInvalid');
  return null;
}

function intervalsToPayload(
  rec: IntervalsByWeekday,
  legacyDefaultRadius: number,
  weekdayLabels: { v: number; l: string }[],
  t: (key: UiTextKey, params?: Record<string, string | number>) => string,
): { slots: BulkScheduleSlotPayload[]; error: string | null } {
  const out: BulkScheduleSlotPayload[] = [];
  for (let wd = 0; wd <= 6; wd++) {
    for (const row of rec[wd] ?? []) {
      if (!row.start || !row.end) {
        const day = weekdayLabels.find((w) => w.v === wd)?.l ?? String(wd);
        return { slots: [], error: t('admin.error.timeRequired', { day }) };
      }
      if (row.buildingId !== '') {
        out.push({
          weekday: wd,
          start_time: toHms(row.start),
          end_time: toHms(row.end),
          building_id: row.buildingId as number,
          title: row.title.trim(),
        });
        continue;
      }
      const n = (row.legacyName || '').trim();
      const la = row.legacyLat != null ? parseFloat(row.legacyLat) : NaN;
      const ln = row.legacyLng != null ? parseFloat(row.legacyLng) : NaN;
      if (!n || !Number.isFinite(la) || !Number.isFinite(ln)) {
        const day = weekdayLabels.find((w) => w.v === wd)?.l ?? String(wd);
        return {
          slots: [],
          error: t('admin.error.buildingRequired', { day }),
        };
      }
      out.push({
        weekday: wd,
        start_time: toHms(row.start),
        end_time: toHms(row.end),
        building_name: n,
        latitude: la,
        longitude: ln,
        radius_m: legacyDefaultRadius,
        title: row.title.trim(),
      });
    }
  }
  return { slots: out, error: null };
}

export default function AdminStaffLocationConsole() {
  const { t, locale } = useUiText();

  const WEEKDAYS = useMemo(
    () => [
      { v: 0, l: t('admin.weekdayMon') },
      { v: 1, l: t('admin.weekdayTue') },
      { v: 2, l: t('admin.weekdayWed') },
      { v: 3, l: t('admin.weekdayThu') },
      { v: 4, l: t('admin.weekdayFri') },
      { v: 5, l: t('admin.weekdaySat') },
      { v: 6, l: t('admin.weekdaySun') },
    ],
    [t],
  );

  const PHASE_LABEL = useMemo(
    (): { [K in WeekPhase]: string } => ({
      every: t('admin.everyWeek'),
      upper: t('admin.upperWeek'),
      lower: t('admin.lowerWeek'),
    }),
    [t],
  );

  const [tab, setTab] = useState<Tab>('schedule');
  /** 12 raqam (998...) yoki bo'sh: barcha hodimlar */
  const [staffOwnerDigits, setStaffOwnerDigits] = useState('');
  const [staffOptions, setStaffOptions] = useState<StaffDirectoryEntry[]>([]);
  const [kafedraFilter, setKafedraFilter] = useState('');
  const [schedule, setSchedule] = useState<StaffScheduleSlotDto[]>([]);
  const [pings, setPings] = useState<StaffLocationPingDto[]>([]);
  const [alerts, setAlerts] = useState<StaffLocationAlertDto[]>([]);
  const [buildings, setBuildings] = useState<CampusBuildingDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weekInfo, setWeekInfo] = useState<ScheduleWeekInfoDto | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('single');
  const [legacyRadius, setLegacyRadius] = useState(100);
  const [intervalsEvery, setIntervalsEvery] = useState<IntervalsByWeekday>(() => emptyIntervals());
  const [intervalsUpper, setIntervalsUpper] = useState<IntervalsByWeekday>(() => emptyIntervals());
  const [intervalsLower, setIntervalsLower] = useState<IntervalsByWeekday>(() => emptyIntervals());
  const [liveMapUpdated, setLiveMapUpdated] = useState<Date | null>(null);

  const LIVE_MAP_POLL_SEC = 5;

  const refreshStaffOptions = useCallback(async () => {
    try {
      const rows = (await fetchStaffDirectory())
        .filter((u) => u.role === 'hodim')
        .sort((a, b) => a.display_name.localeCompare(b.display_name, 'uz'));
      setStaffOptions(rows);
    } catch {
      setStaffOptions([]);
    }
  }, []);

  useEffect(() => {
    void refreshStaffOptions();
  }, [refreshStaffOptions]);

  const ownerFilterApplied = useMemo(() => staffOwnerDigits.replace(/\D/g, ''), [staffOwnerDigits]);
  const editorDigits = ownerFilterApplied;

  // Kafedra bo'yicha filtr — hodimlar soni ko'p bo'lganda (masalan docx'dan
  // import qilingan o'qituvchilar) ro'yxatni qisqartirish uchun. Qo'shimcha
  // API so'rov shart emas — StaffDirectoryEntry.department allaqachon bor.
  const kafedraOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of staffOptions) {
      if (u.department && u.department.trim()) set.add(u.department.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'uz'));
  }, [staffOptions]);

  const filteredStaffOptions = useMemo(
    () => (kafedraFilter ? staffOptions.filter((u) => u.department === kafedraFilter) : staffOptions),
    [staffOptions, kafedraFilter],
  );

  const scheduleGrouped = useMemo(() => {
    const m: { every: StaffScheduleSlotDto[]; upper: StaffScheduleSlotDto[]; lower: StaffScheduleSlotDto[] } = {
      every: [],
      upper: [],
      lower: [],
    };
    for (const r of schedule) {
      const p = defaultPhase(r);
      if (!m[p]) m[p] = [];
      m[p].push(r);
    }
    return m;
  }, [schedule]);

  const hasAlternatingData = useMemo(
    () => schedule.some((s) => defaultPhase(s) === 'upper' || defaultPhase(s) === 'lower'),
    [schedule],
  );

  const showAlternatingHint =
    hasAlternatingData && tab === 'schedule' && ownerFilterApplied.length >= 12;

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const o = ownerFilterApplied.length >= 12 ? ownerFilterApplied : undefined;
      if (tab === 'schedule') {
        const [rows, wi, b] = await Promise.all([
          listAdminStaffSchedule(o),
          getScheduleWeekInfo().catch(() => null),
          listCampusBuildings().catch(() => []),
        ]);
        setSchedule(rows);
        if (wi) setWeekInfo(wi);
        setBuildings(b);
      } else if (tab === 'livemap') {
        const [p, b] = await Promise.all([
          listAdminStaffPings(o, { mode: 'live' }),
          listCampusBuildings().catch(() => []),
        ]);
        setPings(p);
        setBuildings(b);
        setLiveMapUpdated(new Date());
      } else if (tab === 'pings') {
        setPings(await listAdminStaffPings(o));
      } else {
        setAlerts(await listAdminStaffAlerts(o));
      }
    } catch {
      setError(t('admin.error.scheduleLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [tab, ownerFilterApplied, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshLiveMapPings = useCallback(async () => {
    if (tab !== 'livemap') return;
    try {
      const o = ownerFilterApplied.length >= 12 ? ownerFilterApplied : undefined;
      setPings(await listAdminStaffPings(o, { mode: 'live' }));
      setLiveMapUpdated(new Date());
    } catch {
      /* sessiya yoki tarmoq — jim yangilash */
    }
  }, [tab, ownerFilterApplied]);

  useEffect(() => {
    if (tab !== 'livemap') return;
    const id = window.setInterval(() => void refreshLiveMapPings(), LIVE_MAP_POLL_SEC * 1000);
    return () => window.clearInterval(id);
  }, [tab, refreshLiveMapPings]);

  const setIntervals = (which: 'every' | 'upper' | 'lower', fn: (p: IntervalsByWeekday) => IntervalsByWeekday) => {
    if (which === 'every') setIntervalsEvery((p) => fn(p));
    else if (which === 'upper') setIntervalsUpper((p) => fn(p));
    else setIntervalsLower((p) => fn(p));
  };

  const addInterval = (which: 'every' | 'upper' | 'lower', dayIdx: number) => {
    setIntervals(which, (prev) => {
      const next = { ...prev, [dayIdx]: [...(prev[dayIdx] ?? []), newIntervalRow()] };
      return next;
    });
  };

  const removeInterval = (which: 'every' | 'upper' | 'lower', dayIdx: number, clientId: string) => {
    setIntervals(which, (prev) => ({
      ...prev,
      [dayIdx]: (prev[dayIdx] ?? []).filter((r) => r.clientId !== clientId),
    }));
  };

  const patchInterval = (
    which: 'every' | 'upper' | 'lower',
    dayIdx: number,
    clientId: string,
    patch: Partial<IntervalRow>,
  ) => {
    setIntervals(which, (prev) => ({
      ...prev,
      [dayIdx]: (prev[dayIdx] ?? []).map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)),
    }));
  };

  const fillFromSchedule = useCallback(() => {
    const err = validateOwnerKey(staffOwnerDigits, t);
    if (err) {
      setError(err);
      return;
    }
    const digits = editorDigits;
    const mine = schedule.filter((s) => s.owner_key === digits);
    if (mine.length === 0) {
      setError(t('admin.error.noScheduleForStaff'));
      return;
    }
    const hasAlt = mine.some((s) => defaultPhase(s) === 'upper' || defaultPhase(s) === 'lower');
    setEditorMode(hasAlt ? 'alternating' : 'single');
    if (hasAlt) {
      setIntervalsUpper(scheduleToIntervals(mine, 'upper'));
      setIntervalsLower(scheduleToIntervals(mine, 'lower'));
      setIntervalsEvery(emptyIntervals());
    } else {
      setIntervalsEvery(scheduleToIntervals(mine, 'every'));
      setIntervalsUpper(emptyIntervals());
      setIntervalsLower(emptyIntervals());
    }
    setError(null);
  }, [staffOwnerDigits, editorDigits, schedule, t]);

  const copyUpperToLower = () => {
    const copy = emptyIntervals();
    for (let d = 0; d <= 6; d++) {
      copy[d] = (intervalsUpper[d] ?? []).map((r) => ({ ...r, clientId: newClientId() }));
    }
    setIntervalsLower(copy);
  };

  const saveBulk = async (phase: WeekPhase, rec: IntervalsByWeekday) => {
    const err = validateOwnerKey(staffOwnerDigits, t);
    if (err) {
      setError(err);
      return;
    }
    const { slots, error: pe } = intervalsToPayload(rec, legacyRadius, WEEKDAYS, t);
    if (pe) {
      setError(pe);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await bulkReplaceAdminStaffSchedule({
        owner_key: editorDigits,
        week_phase: phase,
        replace_existing: true,
        slots,
      });
      await load();
      setStaffOwnerDigits(editorDigits);
    } catch (e) {
      setError(formatApiErrorLocal(e, t));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: StaffScheduleSlotDto) => {
    try {
      await patchAdminStaffSchedule(row.id, { is_active: !row.is_active });
      await load();
    } catch {
      setError(t('admin.error.updateSlotFailed'));
    }
  };

  const removeSlot = async (id: number) => {
    if (!window.confirm(t('admin.confirmDeleteSlot'))) return;
    try {
      await deleteAdminStaffSchedule(id);
      await load();
    } catch {
      setError(t('admin.error.deleteSlotFailed'));
    }
  };

  const buildingOptions = useMemo(
    () =>
      buildings.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
          {b.short_code ? ` (${b.short_code})` : ''}
        </option>
      )),
    [buildings],
  );

  const renderPhaseCard = (phase: WeekPhase, currentPhase: 'every' | 'upper' | 'lower') => {
    const rec =
      currentPhase === 'every' ? intervalsEvery : currentPhase === 'upper' ? intervalsUpper : intervalsLower;
    const which = currentPhase;
    const showBadge =
      weekInfo && (phase === 'upper' || phase === 'lower') && weekInfo.current_week_phase === phase;

    return (
      <div key={phase} className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[14px] font-bold text-black/85">{PHASE_LABEL[phase]}</h3>
          {showBadge ? (
            <span className="text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-900 px-2 py-0.5">
              {t('admin.thisWeekVariant')}
            </span>
          ) : null}
        </div>
        <div className="space-y-4">
          {WEEKDAYS.map((wd) => {
            const rows = rec[wd.v] ?? [];
            return (
              <div key={wd.v} className="rounded-xl border border-black/10 bg-white/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-black/80">{wd.l}</span>
                  <button
                    type="button"
                    onClick={() => addInterval(which, wd.v)}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-700 px-2.5 py-1 text-[12px] font-semibold border border-blue-100"
                  >
                    <Plus size={14} />
                    {t('admin.addTimeSlot')}
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[12px] text-black/45">{t('admin.noSlotsForDay')}</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <div
                        key={row.clientId}
                        className="flex flex-col lg:flex-row lg:flex-wrap gap-2 p-2 rounded-lg bg-black/[0.02] border border-black/5"
                      >
                        <input
                          type="time"
                          value={row.start}
                          onChange={(e) => patchInterval(which, wd.v, row.clientId, { start: e.target.value })}
                          className="rounded-lg border border-black/10 px-2 py-1 text-[13px] w-[7rem]"
                        />
                        <span className="text-black/35 self-center hidden lg:inline">—</span>
                        <input
                          type="time"
                          value={row.end}
                          onChange={(e) => patchInterval(which, wd.v, row.clientId, { end: e.target.value })}
                          className="rounded-lg border border-black/10 px-2 py-1 text-[13px] w-[7rem]"
                        />
                        <select
                          value={row.buildingId === '' ? '' : String(row.buildingId)}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchInterval(which, wd.v, row.clientId, {
                              buildingId: v === '' ? '' : Number(v),
                              legacyName: undefined,
                              legacyLat: undefined,
                              legacyLng: undefined,
                            });
                          }}
                          className="flex-1 min-w-[160px] rounded-lg border border-black/10 px-2 py-1.5 text-[13px]"
                        >
                          <option value="">{t('admin.selectBuilding')}</option>
                          {buildingOptions}
                        </select>
                        {row.buildingId === '' ? (
                          <div className="flex flex-wrap gap-2 flex-1">
                            <input
                              placeholder={t('admin.legacyBuildingName')}
                              value={row.legacyName ?? ''}
                              onChange={(e) =>
                                patchInterval(which, wd.v, row.clientId, { legacyName: e.target.value })
                              }
                              className="rounded-lg border border-amber-200 bg-amber-50/50 px-2 py-1 text-[12px] min-w-[120px]"
                            />
                            <input
                              placeholder="lat"
                              value={row.legacyLat ?? ''}
                              onChange={(e) =>
                                patchInterval(which, wd.v, row.clientId, { legacyLat: e.target.value })
                              }
                              className="rounded-lg border border-amber-200 px-2 py-1 text-[12px] w-28 font-mono"
                            />
                            <input
                              placeholder="lng"
                              value={row.legacyLng ?? ''}
                              onChange={(e) =>
                                patchInterval(which, wd.v, row.clientId, { legacyLng: e.target.value })
                              }
                              className="rounded-lg border border-amber-200 px-2 py-1 text-[12px] w-28 font-mono"
                            />
                          </div>
                        ) : null}
                        <input
                          placeholder={t('admin.comment')}
                          value={row.title}
                          onChange={(e) => patchInterval(which, wd.v, row.clientId, { title: e.target.value })}
                          className="rounded-lg border border-black/10 px-2 py-1 text-[12px] min-w-[100px] flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeInterval(which, wd.v, row.clientId)}
                          className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 self-start"
                          aria-label={t('common.delete')}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveBulk(phase, rec)}
          className="rounded-xl bg-blue-600 text-white px-5 py-2.5 text-[13px] font-semibold disabled:opacity-50"
        >
          {saving ? t('admin.saving') : t('admin.savePhase', { phase: PHASE_LABEL[phase] })}
        </button>
      </div>
    );
  };

  return (
    <div
      className="w-full space-y-5 px-3 sm:px-5 lg:px-6 pb-24 py-4"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center">
            <MapPin size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-black/90">{t('admin.staffLocationTitle')}</h1>
            <p className="text-[12px] text-black/50">{t('admin.staffLocationSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-black/10 bg-white/90 px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
        >
          {t('admin.refresh')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['schedule', t('admin.schedule')],
            ['livemap', t('admin.liveMap')],
            ['pings', t('admin.pings')],
            ['alerts', t('admin.alerts')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl px-4 py-2 text-[13px] font-semibold ${
              tab === id ? 'bg-blue-600 text-white shadow-md' : 'bg-white/80 border border-black/10 text-black/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {kafedraOptions.length > 1 ? (
          <label className="flex flex-col gap-1 text-[12px] font-medium text-black/60 flex-1 min-w-[200px]">
            {t('admin.filterByKafedra')}
            <select
              value={kafedraFilter}
              onChange={(e) => {
                setKafedraFilter(e.target.value);
                setStaffOwnerDigits('');
              }}
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[14px] text-black/90"
            >
              <option value="">{t('admin.allKafedraOption')}</option>
              {kafedraOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-[12px] font-medium text-black/60 flex-1 min-w-[200px]">
          {t('admin.selectStaff')}
          <select
            value={staffOwnerDigits}
            onChange={(e) => setStaffOwnerDigits(e.target.value)}
            className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[14px] text-black/90"
          >
            <option value="">{t('admin.allStaffOption')}</option>
            {filteredStaffOptions.map((u) => (
              <option key={u.phone_digits} value={u.phone_digits}>
                {u.display_name} · {u.phone_display}
              </option>
            ))}
          </select>
        </label>
        {staffOptions.length === 0 ? (
          <p className="text-[11px] text-amber-800">{t('admin.noStaffInList')}</p>
        ) : null}
      </div>

      {tab !== 'livemap' ? (
        <button
          type="button"
          onClick={() => setTab('livemap')}
          className="group w-full rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/95 to-sky-50/85 px-4 py-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                <Radio className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <div className="text-[14px] font-bold text-black/90">{t('admin.allStaffLiveMap')}</div>
                <div className="text-[12px] text-black/55">
                  {t('admin.liveMapDescription', { pollSec: LIVE_MAP_POLL_SEC })}
                </div>
              </div>
            </div>
            <span className="text-[12px] font-semibold text-emerald-800 group-hover:underline">{t('admin.openMap')}</span>
          </div>
        </button>
      ) : null}

      {tab === 'schedule' && weekInfo ? (
        <div className="ios-glass rounded-2xl border border-sky-200/80 bg-sky-50/50 px-4 py-3 text-[13px] text-black/80 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <strong>{t('admin.isoWeek')}:</strong> {weekInfo.iso_week}
          </span>
          <span>
            <strong>{t('admin.currentPhase')}:</strong> {weekInfo.current_week_phase_label_uz}
          </span>
        </div>
      ) : null}

      {showAlternatingHint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[12px] text-amber-950">
          {t('admin.alternatingWeeks')}
        </div>
      ) : null}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {tab === 'schedule' && buildings.length === 0 && !loading ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-[13px] text-rose-900">
          {t('admin.error.noBuildingsCatalog')}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-black/50 gap-2">
          <Loader2 className="animate-spin" size={20} />
          {t('admin.loading')}
        </div>
      ) : tab === 'schedule' ? (
        <div className="space-y-8">
          <div className="ios-glass rounded-2xl border border-white/60 overflow-hidden">
            <div className="px-3 py-2 bg-black/[0.02] text-[12px] font-semibold text-black/55 flex items-center gap-1">
              <ChevronDown size={14} />
              {t('admin.savedSlots')}
            </div>
            {PHASE_ORDER.map((phase) => {
              const rows = scheduleGrouped[phase] ?? [];
              if (rows.length === 0) return null;
              return (
                <div key={phase} className="border-t border-black/5">
                  <div className="px-3 py-2 text-[12px] font-bold text-black/70 bg-black/[0.03]">{PHASE_LABEL[phase]}</div>
                  <table className="w-full text-left text-[13px]">
                    <thead className="text-black/50">
                      <tr>
                        <th className="px-3 py-2">{t('admin.staffMember')}</th>
                        <th className="px-3 py-2">{t('admin.weekday')}</th>
                        <th className="px-3 py-2">{t('admin.time')}</th>
                        <th className="px-3 py-2">{t('admin.building')}</th>
                        <th className="px-3 py-2">{t('admin.radius')}</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-black/5">
                          <td className="px-3 py-2 font-mono text-[12px]">{r.owner_key}</td>
                          <td className="px-3 py-2">{WEEKDAYS.find((w) => w.v === r.weekday)?.l ?? r.weekday}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {String(r.start_time).slice(0, 5)} — {String(r.end_time).slice(0, 5)}
                          </td>
                          <td className="px-3 py-2">{r.building?.name ?? r.building_name}</td>
                          <td className="px-3 py-2">{r.radius_m} m</td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => void toggleActive(r)}
                              className="text-[12px] font-semibold text-blue-600"
                            >
                              {r.is_active ? t('admin.pause') : t('admin.active')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeSlot(r.id)}
                              className="inline-flex items-center justify-center p-1 rounded-lg text-rose-600"
                              aria-label={t('admin.delete')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {schedule.length === 0 && (
              <div className="px-4 py-8 text-center text-black/45 text-[13px]">{t('admin.noSlotsYet')}</div>
            )}
          </div>

          <div className="ios-glass rounded-2xl border border-white/60 p-4 space-y-4">
            <h2 className="text-[15px] font-bold text-black/90">{t('admin.weeklySchedule')}</h2>
            <p className="text-[12px] text-black/55 leading-relaxed">{t('admin.scheduleInstructions')}</p>

            <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2 text-[12px] text-black/70">
              {staffOwnerDigits.length >= 12 ? (
                t('admin.scheduleFor', { phone: staffOwnerDigits })
              ) : (
                t('admin.selectStaffToSchedule')
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] font-medium text-black/60 sm:col-span-2">
                {t('admin.legacyRadius')}
                <input
                  type="number"
                  min={30}
                  max={50000}
                  value={legacyRadius}
                  onChange={(e) => setLegacyRadius(Number(e.target.value) || 1000)}
                  className="rounded-xl border border-black/10 px-3 py-2 text-[14px] max-w-xs"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[12px] font-medium text-black/60">{t('admin.scheduleMode')}</span>
              <button
                type="button"
                onClick={() => setEditorMode('single')}
                className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${
                  editorMode === 'single' ? 'bg-blue-600 text-white' : 'bg-white border border-black/10'
                }`}
              >
                {t('admin.singleMode')}
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('alternating')}
                className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${
                  editorMode === 'alternating' ? 'bg-blue-600 text-white' : 'bg-white border border-black/10'
                }`}
              >
                {t('admin.alternatingMode')}
              </button>
              <button
                type="button"
                onClick={() => fillFromSchedule()}
                className="rounded-xl border border-black/15 bg-white px-4 py-2 text-[12px] font-semibold text-black/80"
              >
                {t('admin.loadFromFilter')}
              </button>
              {editorMode === 'alternating' ? (
                <button
                  type="button"
                  onClick={copyUpperToLower}
                  className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-[12px] font-semibold text-violet-900"
                >
                  {t('admin.copyUpperToLower')}
                </button>
              ) : null}
            </div>

            {editorMode === 'single' ? renderPhaseCard('every', 'every') : (
              <div className="space-y-10">
                {renderPhaseCard('upper', 'upper')}
                {renderPhaseCard('lower', 'lower')}
              </div>
            )}
          </div>
        </div>
      ) : tab === 'livemap' ? (
        <div className="ios-glass rounded-2xl border border-white/60 p-4 sm:p-5">
          <AdminStaffLiveMapPanel
            pings={pings}
            buildings={buildings}
            lastUpdated={liveMapUpdated}
            pollIntervalSec={LIVE_MAP_POLL_SEC}
            staffDirectory={staffOptions}
            filterOwnerDigits={staffOwnerDigits}
          />
        </div>
      ) : tab === 'pings' ? (
        <div className="ios-glass rounded-2xl border border-white/60 overflow-x-auto">
          <table className="w-full text-left text-[12px] min-w-[640px]">
            <thead className="bg-black/[0.03] text-black/55">
              <tr>
                <th className="px-3 py-2">{t('admin.recorded')}</th>
                <th className="px-3 py-2">{t('admin.staffMember')}</th>
                <th className="px-3 py-2">{t('admin.lat')}</th>
                <th className="px-3 py-2">{t('admin.lng')}</th>
                <th className="px-3 py-2">{t('admin.accuracy')}</th>
              </tr>
            </thead>
            <tbody>
              {pings.map((p) => (
                <tr key={p.id} className="border-t border-black/5">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(p.recorded_at).toLocaleString(locale)}</td>
                  <td className="px-3 py-2 font-mono">{p.owner_key}</td>
                  <td className="px-3 py-2 font-mono">{p.latitude.toFixed(5)}</td>
                  <td className="px-3 py-2 font-mono">{p.longitude.toFixed(5)}</td>
                  <td className="px-3 py-2">{p.accuracy_m != null ? Math.round(p.accuracy_m) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pings.length === 0 && (
            <div className="px-4 py-8 text-center text-black/45 text-[13px]">{t('admin.noPingsYet')}</div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className="ios-glass rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4">
              <div className="flex justify-between gap-2 flex-wrap text-[12px] text-black/50">
                <span className="font-mono">{a.owner_key}</span>
                <span>{new Date(a.created_at).toLocaleString(locale)}</span>
              </div>
              <p className="text-[14px] font-medium text-black/85 mt-2">{a.building_name || t('admin.buildingDefaultName')}</p>
              <p className="text-[13px] text-black/70 mt-1">{a.message}</p>
              <p className="text-[11px] text-black/45 mt-2">
                {t('admin.alertDistance', { distance: a.distance_m, radius: a.radius_m })}
              </p>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="ios-glass rounded-2xl border border-white/60 p-8 text-center text-black/45 text-[13px]">
              {t('admin.noAlertsYet')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
