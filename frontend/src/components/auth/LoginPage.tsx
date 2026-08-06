import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, Phone, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import {
  isValidPhoneDigits,
  ensureDefaultRoleDemosExist,
  logoutLocalStaff,
  normalizePhoneDigits,
  normalizeUserRole,
} from '../../utils/localStaffAuth';
import {
  getBackendAccessToken,
  loginStaffWithBackendFallback,
  loginStudentWithOnlineTest,
  syncSessionRoleFromServer,
} from '../../utils/backendAuth';
import { isDesktopBrowser } from '../../utils/deviceDetection';
import { useUiText } from '../../i18n/useUiText';

interface LoginPageProps {
  onSwitchToRegister: () => void;
  /** Desktop'da "Xodim" tab tanlanganda chaqiriladi — hodim faqat QR orqali
   * kira olgani uchun shu yerda QR ekraniga o'tkaziladi. */
  onWantsHodimQr?: () => void;
}

export default function LoginPage({ onSwitchToRegister, onWantsHodimQr }: LoginPageProps) {
  const { t } = useUiText();
  const [loginMode, setLoginMode] = useState<'staff' | 'student'>('student');
  const [phone, setPhone] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureDefaultRoleDemosExist();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (loginMode === 'student') {
      if (!studentId.trim() || !password) {
        setError(t('test.studentLoginRequired'));
        return;
      }
      setLoading(true);
      try {
        await loginStudentWithOnlineTest(studentId.trim(), password);
        await getBackendAccessToken();
        await syncSessionRoleFromServer();
      } catch (err: unknown) {
        const code = err instanceof Error ? err.message : '';
        setError(
          code === 'forbidden' ? t('test.studentLoginForbidden') : t('test.studentLoginError'),
        );
      } finally {
        setLoading(false);
      }
      return;
    }
    const digits = normalizePhoneDigits(phone);
    if (!isValidPhoneDigits(digits)) {
      setError(t('auth.phoneRequired'));
      return;
    }
    if (isDesktopBrowser()) {
      const digits = normalizePhoneDigits(phone);
      const users = JSON.parse(localStorage.getItem('salomatlik-local-staff-users-v1') || '[]') as { phoneDigits?: string; role?: string }[];
      const found = users.find((u) => u.phoneDigits === digits);
      if (found && (found.role === 'hodim' || !found.role)) {
        setError(t('auth.hodimDesktopQrOnly'));
        return;
      }
    }
    setLoading(true);
    try {
      const u = await loginStaffWithBackendFallback(phone, password);
      if (normalizeUserRole(u) === 'hodim' && isDesktopBrowser()) {
        setError(t('auth.hodimDesktopRestriction'));
        logoutLocalStaff();
        return;
      }
      await getBackendAccessToken();
      await syncSessionRoleFromServer();
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'user-not-found' || code === 'wrong-password') {
        setError(t('auth.wrongCredentialsRegister'));
      } else {
        setError(t('auth.loginError'));
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md"
    >
      <div className="ios-glass rounded-[2rem] border border-white/60 shadow-xl p-8 md:p-10">
        <div className="text-center mb-8">
          <img
            src="/imentor-logo.png"
            alt="iMentor"
            className="mx-auto w-16 h-16 rounded-2xl object-cover border border-white/70 shadow-lg mb-4 bg-white"
          />
          <h1 className="text-2xl font-bold text-black/90 tracking-tight">{t('auth.loginTitle')}</h1>
          <p className="text-[13px] text-black/50 mt-2 font-medium">{t('auth.loginSubtitle')}</p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-black/[0.04] p-1">
          <button
            type="button"
            onClick={() => { setLoginMode('student'); setError(null); }}
            className={`rounded-lg py-2 text-[13px] font-semibold transition ${
              loginMode === 'student' ? 'bg-white text-black/90 shadow-sm' : 'text-black/45'
            }`}
          >
            {t('auth.loginModeStudent')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (isDesktopBrowser() && onWantsHodimQr) {
                onWantsHodimQr();
                return;
              }
              setLoginMode('staff');
              setError(null);
            }}
            className={`rounded-lg py-2 text-[13px] font-semibold transition ${
              loginMode === 'staff' ? 'bg-white text-black/90 shadow-sm' : 'text-black/45'
            }`}
          >
            {t('auth.loginModeStaff')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {loginMode === 'student' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-black/55 uppercase tracking-wide">{t('test.studentLoginId')}</label>
              <input
                type="text"
                autoComplete="username"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white/70 py-3.5 px-4 text-[15px] font-medium text-black/90 outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder={t('test.studentLoginId')}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-black/55 uppercase tracking-wide">{t('auth.phoneLabel')}</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35" size={18} />
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white/70 py-3.5 pl-12 pr-4 text-[15px] font-medium text-black/90 outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="+998 90 123 45 67"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-black/55 uppercase tracking-wide">{t('auth.passwordLabel')}</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35" size={18} />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white/70 py-3.5 pl-12 pr-4 text-[15px] font-medium text-black/90 outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder={t('auth.passwordPlaceholder')}
              />
            </div>
          </div>

          {loginMode === 'staff' ? (
            <p className="text-[11px] text-black/45 leading-relaxed bg-black/[0.03] rounded-xl px-3 py-2 border border-black/5">
              <span className="font-semibold text-black/55">{t('auth.newAccountLabel')}</span> {t('auth.newAccountIntro')}{' '}
              <button type="button" onClick={onSwitchToRegister} className="text-blue-600 font-semibold underline-offset-2 hover:underline">
                {t('auth.registerLink')}
              </button>{' '}
              {t('auth.newAccountRoles', { hodim: t('auth.hodimRole'), startuper: t('auth.startuperRole') })}
            </p>
          ) : (
            <p className="text-[11px] text-black/45 leading-relaxed bg-black/[0.03] rounded-xl px-3 py-2 border border-black/5">
              {t('test.studentLoginHint')}
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-[15px] font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : null}
            {t('auth.submitLogin')}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-black/50">
          {t('auth.noAccount')}{' '}
          <button type="button" onClick={onSwitchToRegister} className="font-semibold text-blue-600 hover:underline">
            {t('auth.registerLink')}
          </button>
        </p>
      </div>
    </motion.div>
  );
}
