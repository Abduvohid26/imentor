import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Monitor, XCircle } from 'lucide-react';
import { useUiText } from '../../i18n/useUiText';
import {
  fetchLiveTeachingStatus,
  type LiveTeachingStatusDto,
} from '../../utils/staffLocationApi';

const POLL_SEC = 20;

/** "Katta ekran" jonli monitoring — hozir qancha o'qituvchi darsda, qancha
 * yo'q. Katta shrift, kam matn — uzoqdan (devorga osilgan monitorda) ham
 * o'qiladigan qilib loyihalangan. Dars jadvali (StaffScheduleSlot) + GPS
 * joylashuv (StaffLocationPing) ni solishtirib backend hisoblab beradi. */
export default function AdminLiveTeachingBoard() {
  const { t } = useUiText();
  const [data, setData] = useState<LiveTeachingStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchLiveTeachingStatus();
      setData(res);
      setUpdatedAt(new Date());
      setError(null);
    } catch {
      setError(t('admin.liveTeachingError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_SEC * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-black/50 gap-3">
        <Loader2 className="animate-spin" size={28} />
        <span className="text-lg">{t('admin.loading')}</span>
      </div>
    );
  }

  const rows = data?.royxat ?? [];
  const present = rows.filter((r) => r.present);
  const absent = rows.filter((r) => !r.present);

  return (
    <div className="w-full space-y-6 px-3 sm:px-6 pb-24 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Monitor size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black/90">{t('admin.liveTeachingTitle')}</h1>
            <p className="text-[13px] text-black/50">
              {updatedAt ? t('admin.liveMapUpdated', { time: updatedAt.toLocaleTimeString() }) : ''}
              {' · '}
              {t('admin.liveMapAutoUpdate', { sec: POLL_SEC })}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[14px] text-rose-800">
          {error}
        </div>
      )}

      {/* Katta raqamlar — uzoqdan o'qiladigan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-slate-900 text-white p-6 sm:p-8 flex flex-col items-center justify-center">
          <span className="text-[15px] font-medium text-white/60 uppercase tracking-wide">
            {t('admin.liveTeachingTotal')}
          </span>
          <span className="text-7xl sm:text-8xl font-black tabular-nums mt-2">{data?.jami ?? 0}</span>
        </div>
        <div className="rounded-3xl bg-emerald-600 text-white p-6 sm:p-8 flex flex-col items-center justify-center">
          <span className="text-[15px] font-medium text-white/80 uppercase tracking-wide flex items-center gap-2">
            <CheckCircle2 size={18} /> {t('admin.liveTeachingPresent')}
          </span>
          <span className="text-7xl sm:text-8xl font-black tabular-nums mt-2">{data?.joyida ?? 0}</span>
        </div>
        <div className="rounded-3xl bg-rose-600 text-white p-6 sm:p-8 flex flex-col items-center justify-center">
          <span className="text-[15px] font-medium text-white/80 uppercase tracking-wide flex items-center gap-2">
            <XCircle size={18} /> {t('admin.liveTeachingAbsent')}
          </span>
          <span className="text-7xl sm:text-8xl font-black tabular-nums mt-2">{data?.joyida_emas ?? 0}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-black/10 bg-white/60 p-12 text-center text-black/40 text-lg">
          {t('admin.liveTeachingNoneNow')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Yo'q bo'lganlar birinchi — e'tibor talab qiladi */}
          <div className="rounded-3xl border border-rose-200 bg-rose-50/40 overflow-hidden">
            <div className="px-5 py-3 bg-rose-100/70 text-rose-900 font-bold text-[15px] flex items-center gap-2">
              <XCircle size={18} /> {t('admin.liveTeachingAbsent')} ({absent.length})
            </div>
            <div className="divide-y divide-rose-100">
              {absent.length === 0 ? (
                <p className="px-5 py-6 text-center text-rose-400 text-[14px]">{t('admin.liveTeachingAllPresent')}</p>
              ) : absent.map((r) => (
                <div key={r.owner_key} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-black/90 text-[16px] truncate">{r.display_name}</p>
                    <p className="text-[13px] text-black/50 truncate">
                      {r.department}{r.department ? ' · ' : ''}{r.building_name} · {r.slot_start}–{r.slot_end}
                    </p>
                  </div>
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-rose-500" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
            <div className="px-5 py-3 bg-emerald-100/70 text-emerald-900 font-bold text-[15px] flex items-center gap-2">
              <CheckCircle2 size={18} /> {t('admin.liveTeachingPresent')} ({present.length})
            </div>
            <div className="divide-y divide-emerald-100">
              {present.length === 0 ? (
                <p className="px-5 py-6 text-center text-emerald-500 text-[14px]">{t('admin.liveTeachingNonePresent')}</p>
              ) : present.map((r) => (
                <div key={r.owner_key} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-black/90 text-[16px] truncate">{r.display_name}</p>
                    <p className="text-[13px] text-black/50 truncate">
                      {r.department}{r.department ? ' · ' : ''}{r.building_name} · {r.slot_start}–{r.slot_end}
                    </p>
                  </div>
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-emerald-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
