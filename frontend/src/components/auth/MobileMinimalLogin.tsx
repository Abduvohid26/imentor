import React, { useState } from 'react';
import { Loader2, Lock, Phone } from 'lucide-react';
import {
  isValidPhoneDigits,
  normalizePhoneDigits,
} from '../../utils/localStaffAuth';
import { getBackendAccessToken, loginStaffWithBackendFallback } from '../../utils/backendAuth';
import { HttpError } from '../../api/httpClient';
import { useUiText } from '../../i18n/useUiText';

type Props = {
  onSwitchToRegister?: () => void;
};

export default function MobileMinimalLogin({ onSwitchToRegister }: Props) {
  const { t } = useUiText();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = normalizePhoneDigits(phone);
    if (!isValidPhoneDigits(digits)) {
      setError(t('auth.mobileLogin.phoneRequired'));
      return;
    }
    if (!password.trim()) {
      setError(t('auth.mobileLogin.passwordRequired'));
      return;
    }
    setLoading(true);
    try {
      await loginStaffWithBackendFallback(phone, password);
      await getBackendAccessToken();
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

  return (
    <div
      className="min-h-[100dvh] flex flex-col justify-center px-6 py-10 bg-[#f8fafc]"
      style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-[340px] mx-auto">
        <div className="flex justify-center mb-10">
          <img
            src="/imentor-logo.png"
            alt="iMentor"
            className="w-20 h-20 rounded-[22px] object-cover shadow-lg border border-white"
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('auth.mobileLogin.phoneLabel')}
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

          {onSwitchToRegister && (
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
