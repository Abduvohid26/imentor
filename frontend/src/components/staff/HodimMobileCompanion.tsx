import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Check, Loader2, LogOut, Monitor, Smartphone } from 'lucide-react';
import {
  confirmDevicePairing,
  parsePairingTokenFromScan,
} from '../../utils/devicePairingApi';
import { getCurrentLocalUser, logoutLocalStaff } from '../../utils/localStaffAuth';
import { clearBackendAuthTokens } from '../../utils/backendAuth';
import { clearDesktopPairedSession } from '../../utils/deviceSession';
import { useStaffLocationTracking } from '../../hooks/useStaffLocationTracking';
import HodimGpsStatusBar from './HodimGpsStatusBar';
import { useUiText } from '../../i18n/useUiText';

const SCANNER_ID = 'hodim-qr-scanner-region';

export default function HodimMobileCompanion() {
  const { t } = useUiText();
  const user = getCurrentLocalUser();
  const [phase, setPhase] = useState<'ready' | 'scanning' | 'linked' | 'error'>('ready');
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useStaffLocationTracking(true, { silent: false });

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
      await s.clear();
    } catch {
      /* ignore */
    }
  }, []);

  const onScanSuccess = useCallback(
    async (decoded: string) => {
      const token = parsePairingTokenFromScan(decoded);
      if (!token || !user || busy) return;
      setBusy(true);
      try {
        await stopScanner();
        await confirmDevicePairing(token, user);
        setPhase('linked');
      } catch {
        setPhase('error');
        await stopScanner();
      } finally {
        setBusy(false);
      }
    },
    [user, busy, stopScanner],
  );

  const startScanner = useCallback(async () => {
    setBusy(true);
    setPhase('scanning');
    await stopScanner();
    try {
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.65, height: Math.min(w, h) * 0.65 }) },
        (text) => void onScanSuccess(text),
        () => {},
      );
    } catch {
      await stopScanner();
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }, [onScanSuccess, stopScanner]);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  const handleLogout = () => {
    void stopScanner();
    clearBackendAuthTokens();
    clearDesktopPairedSession(user?.uid);
    logoutLocalStaff();
  };

  if (!user) return null;

  const PHONE_STEPS = [
    { n: 1, text: t('staff.companion.step1') },
    { n: 2, text: t('staff.companion.step2') },
    { n: 3, text: t('staff.companion.step3') },
  ];

  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-[#0a1628] text-white"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <header className="flex items-center justify-between px-4 py-2 shrink-0">
        <img src="/imentor-logo.png" alt="iMentor" className="w-10 h-10 rounded-xl object-cover" />
        <button
          type="button"
          onClick={handleLogout}
          aria-label={t('staff.companion.logout')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-[13px] font-medium"
        >
          <LogOut size={16} />
          {t('staff.companion.logout')}
        </button>
      </header>

      {phase === 'linked' ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <div className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Check size={52} strokeWidth={2.5} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">{t('staff.companion.linkedTitle')}</h2>
            <p className="text-[15px] text-white/70 leading-relaxed">
              {t('staff.companion.linkedSubtitle')}
            </p>
          </div>
          <div className="w-full max-w-md">
            <HodimGpsStatusBar />
          </div>
        </div>
      ) : (
        <>
          <section className="px-4 pt-2 pb-3 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Monitor size={20} className="text-sky-400 shrink-0" />
              <h1 className="text-[17px] font-bold leading-snug">{t('staff.companion.connectTitle')}</h1>
            </div>
            <ol className="space-y-2.5">
              {PHONE_STEPS.map((s) => (
                <li key={s.n} className="flex gap-3 text-[14px] leading-snug text-white/85">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[12px] font-bold">
                    {s.n}
                  </span>
                  <span className="pt-0.5">{s.text}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex-1 relative mx-4 mb-3 min-h-[220px] rounded-2xl overflow-hidden bg-black/40 border border-white/15">
            <div
              id={SCANNER_ID}
              className={`absolute inset-0 w-full h-full [&_video]:object-cover ${phase === 'scanning' ? '' : 'hidden'}`}
            />

            {phase !== 'scanning' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <Smartphone size={40} className="text-white/30" />
                <p className="text-[13px] text-white/50">{t('staff.companion.scanPrompt')}</p>
              </div>
            )}

            {phase === 'scanning' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="w-[min(65vw,240px)] aspect-square rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
              </div>
            )}
          </div>

          <div className="px-4 shrink-0 space-y-2">
            <HodimGpsStatusBar compact />
            {phase === 'error' && (
              <p className="text-center text-[14px] text-amber-300 font-medium">
                {t('staff.companion.scanError')}
              </p>
            )}

            {phase === 'ready' || phase === 'error' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void startScanner()}
                className="w-full h-14 rounded-2xl bg-sky-600 text-white text-[16px] font-semibold shadow-lg active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={22} className="animate-spin" /> : null}
                {t('staff.companion.scanButton')}
              </button>
            ) : (
              <p className="text-center text-[14px] text-white/70 py-2">
                {t('staff.companion.scanning')}
              </p>
            )}

            {phase === 'scanning' && (
              <button
                type="button"
                onClick={() => {
                  void stopScanner();
                  setPhase('ready');
                }}
                className="w-full py-3 text-[14px] text-white/60 font-medium"
              >
                {t('staff.companion.cancel')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
