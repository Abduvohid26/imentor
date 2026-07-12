import React, { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, Users, BriefcaseMedical, ClipboardList, RefreshCw, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { fetchAdminCatalogStats } from '../../utils/contentCatalogApi';
import { fetchStaffDirectory } from '../../utils/staffDirectoryApi';
import { useUiText } from '../../i18n/useUiText';

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Administrator bosh sahifasi: nazorat ko‘rsatkichlari (dars o‘tkazilmaydi).
 * Barcha raqamlar serverdan — brauzer localStorage emas.
 */
export default function AdminDashboardHome() {
  const { t } = useUiText();
  const [loading, setLoading] = useState(true);
  const [staffCount, setStaffCount] = useState(0);
  const [todayLogins, setTodayLogins] = useState(0);
  const [caseCount, setCaseCount] = useState(0);
  const [testCount, setTestCount] = useState(0);
  const [pendingTests, setPendingTests] = useState(0);
  const [subjectsCount, setSubjectsCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staff, caseStats, testStats] = await Promise.all([
        fetchStaffDirectory().catch(() => []),
        fetchAdminCatalogStats({ kind: 'case' }).catch(() => null),
        fetchAdminCatalogStats({ kind: 'test' }).catch(() => null),
      ]);
      setStaffCount(staff.length);
      setTodayLogins(staff.filter((s) => isToday(s.last_login)).length);
      setCaseCount(caseStats?.totals.total_count ?? 0);
      setTestCount(testStats?.totals.total_count ?? 0);
      setPendingTests(testStats?.totals.pending_publish_count ?? 0);
      setSubjectsCount(testStats?.totals.subjects_distinct ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { key: 'registered', label: t('admin.registeredUsers'), value: staffCount, icon: Users, c: 'bg-slate-100 border-slate-200 text-slate-800' },
    { key: 'cases', label: t('admin.caseRecords'), value: caseCount, icon: BriefcaseMedical, c: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
    { key: 'tests', label: t('admin.testRecords'), value: testCount, icon: ClipboardList, c: 'bg-blue-50 border-blue-200 text-blue-900' },
    { key: 'logins', label: t('admin.todayLogins'), value: todayLogins, icon: LogIn, c: 'bg-amber-50 border-amber-200 text-amber-900' },
  ];

  return (
    <div className="w-full space-y-8 pb-16 px-3 sm:px-5 lg:px-6 py-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 text-white flex items-center justify-center shadow-lg">
            <LayoutDashboard size={30} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black/90 tracking-tight">{t('admin.dashboardTitle')}</h1>
            <p className="text-[13px] text-black/50 font-medium">{t('admin.dashboardSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 bg-white/90 text-[13px] font-semibold text-black/70 shadow-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {t('admin.refresh')}
        </button>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.key} className={`rounded-2xl border p-4 ${card.c}`}>
            <div className="flex items-center gap-2 mb-1 opacity-80">
              <card.icon size={16} />
              <span className="text-[10px] font-bold uppercase tracking-wide leading-tight">{card.label}</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {(testCount > 0 || subjectsCount > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700/70">{t('admin.statsSubjects')}</p>
            <p className="text-xl font-bold text-blue-900 tabular-nums mt-1">{subjectsCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800/70">{t('admin.statsPendingPublish')}</p>
            <p className="text-xl font-bold text-amber-900 tabular-nums mt-1">{pendingTests}</p>
          </div>
        </div>
      )}

      <p className="text-[12px] text-black/45 text-center max-w-lg mx-auto">
        {t('admin.dashboardNote', { hodim: t('admin.hodimRole') })}
      </p>
    </div>
  );
}
