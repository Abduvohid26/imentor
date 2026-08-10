import React, { useState } from 'react';
import { IdCard, Loader2, Lock, Phone } from 'lucide-react';
import { isValidStaffLogin } from '../../utils/localStaffAuth';
import {
  getBackendAccessToken,
  loginStaffWithBackendFallback,
  loginStudentWithOnlineTest,
  syncSessionRoleFromServer,
} from '../../utils/backendAuth';
import { HttpError } from '../../api/httpClient';
import { useUiText } from '../../i18n/useUiText';

type Props = {
  onSwitchToRegister?: () => void;
};

/**
 * Telefon uchun soddalashtirilgan kirish ekrani.
 *
 * Ikki tab: TALABA (standart — foydalanuvchilarning ko'pchiligi shular) va
 * XODIM. Xodim telefon raqami yoki Xodim ID (tabel raqami) bilan kiradi,
 * talaba esa OnlineTest ID'si bilan.
 */
export default function MobileMinimalLogin({ onSwitchToRegister }: Props) {
  const { t } = useUiText();
  const [mode, setMode] = useState<'student' | 'staff'>('student');
  const [staffLogin, setStaffLogin] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: 'student' | 'staff') => {
    setMode(next);
    setError(null);
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'student') {
      if (!studentId.trim() || !password.trim()) {
        setError(t('test.studentLoginRequired'));
        return;
      }
      setLoading(true);
      try {
        await loginStudentWithOnlineTest(studentId.trim(), password);
        await getBackendAccessToken();
        await syncSessionRoleFromServer();
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        setError(
          code === 'forbidden' ? t('test.studentLoginForbidden') : t('test.studentLoginError'),
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!isValidStaffLogin(staffLogin)) {
      setError(t('auth.staffLoginRequired'));
      return;
    }
    if (!password.trim()) {
      setError(t('auth.mobileLogin.passwordRequired'));
      return;
    }
    setLoading(true);
    try {
      await loginStaffWithBackendFallback(staffLogin, password);
      await getBackendAccessToken();
      await syncSessionRoleFromServer();
    } catch (err) {
      if (err instanceof HttpError && (err.status === 0 || err.message.includes('abort'))) {
        setError(t('auth.mobileLogin.connectionError'));
      } else {
        setError(t('auth.mobileLogin.wrongCredentials'));
      }
    } finally {
      setLoading(false);
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 h-11 rounded-xl text-[15px] font-semibold transition ${
      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
    }`;

  return (
    <div
      className="min-h-[100dvh] flex flex-col justify-center px-6 py-10 bg-[#f8fafc]"
      style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-[340px] mx-auto">
        <div className="flex justify-center mb-8">
          <img
            src="/imentor-logo.png"
            alt="iMentor"
            className="w-20 h-20 rounded-[22px] object-cover shadow-lg border border-white"
          />
        </div>

        <div className="mb-5 flex gap-1.5 rounded-2xl bg-slate-200/70 p-1.5">
          <button type="button" onClick={() => switchMode('student')} className={tabClass(mode === 'student')}>
            {t('auth.loginModeStudent')}
          </button>
          <button type="button" onClick={() => switchMode('staff')} className={tabClass(mode === 'staff')}>
            {t('auth.loginModeStaff')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            {mode === 'student' ? (
              <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            ) : (
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            )}
            <input
              type="text"
              inputMode="text"
              autoComplete="username"
              value={mode === 'student' ? studentId : staffLogin}
              onChange={(e) =>
                mode === 'student' ? setStudentId(e.target.value) : setStaffLogin(e.target.value)
              }
              placeholder={mode === 'student' ? t('test.studentLoginId') : t('auth.staffLoginLabel')}
              className="w-full h-14 rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-[17px] text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.mobileLogin.passwordLabel')}
              className="w-full h-14 rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-[17px] text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <p className="text-center text-[13px] leading-relaxed text-slate-500">
            {mode === 'student' ? t('test.studentLoginHint') : t('auth.staffLoginPlaceholder')}
          </p>

          {error && (
            <p className="text-center text-[14px] text-rose-600 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 rounded-2xl bg-sky-600 text-white text-[17px] font-semibold shadow-lg shadow-sky-600/25 active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center"
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : t('auth.mobileLogin.submit')}
          </button>

          {/* Ro'yxatdan o'tish faqat xodim uchun — talaba OnlineTest'dan keladi. */}
          {mode === 'staff' && onSwitchToRegister && (
            <p className="text-center text-[14px] text-slate-500 pt-2">
              {t('auth.mobileLogin.noAccount')}{' '}
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="font-semibold text-sky-700 underline underline-offset-2"
              >
                {t('auth.mobileLogin.register')}
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
