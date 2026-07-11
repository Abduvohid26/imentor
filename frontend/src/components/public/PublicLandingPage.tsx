import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  BookOpen,
  BriefcaseMedical,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  GraduationCap,
  MapPin,
  Presentation,
  Rocket,
  Shield,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import type { AppLanguage } from '../../i18n/language';
import { languageLabel } from '../../i18n/language';
import { translate } from '../../i18n/translations';
import LoginPage from '../auth/LoginPage';
import RegisterPage from '../auth/RegisterPage';
import DesktopHodimQrLogin from '../auth/DesktopHodimQrLogin';
import MobileMinimalLogin from '../auth/MobileMinimalLogin';
import { isDesktopBrowser } from '../../utils/deviceDetection';
import PublicContentCatalog from './PublicContentCatalog';

type AuthScreen = 'login' | 'register';

type Props = {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  isMobileDevice: boolean;
  desktopStaffLogin: boolean;
  setDesktopStaffLogin: (v: boolean) => void;
};

function t(lang: AppLanguage, key: Parameters<typeof translate>[1]) {
  return translate(lang, key);
}

const ICON_COLORS = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600', ring: 'ring-blue-200' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', ring: 'ring-emerald-200' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600', ring: 'ring-violet-200' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600', ring: 'ring-orange-200' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-600', ring: 'ring-pink-200' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-600', ring: 'ring-cyan-200' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600', ring: 'ring-amber-200' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600', ring: 'ring-indigo-200' },
} as const;

function FeatureCard({
  icon: Icon,
  title,
  desc,
  color,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  color: keyof typeof ICON_COLORS;
  delay: number;
}) {
  const c = ICON_COLORS[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group rounded-2xl bg-white border border-slate-200/80 p-6 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-shadow"
    >
      <div className={`w-11 h-11 rounded-xl ${c.bg} ${c.text} ring-1 ${c.ring} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
        <Icon size={22} strokeWidth={2} />
      </div>
      <h3 className="text-[15px] font-semibold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-[13px] text-slate-500 leading-relaxed">{desc}</p>
    </motion.div>
  );
}

function FloatingChip({ icon: Icon, label, color, style }: { icon: React.ElementType; label: string; color: keyof typeof ICON_COLORS; style?: React.CSSProperties }) {
  const c = ICON_COLORS[color];
  return (
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      style={style}
      className={`inline-flex items-center gap-2 rounded-full bg-white/90 backdrop-blur border border-slate-200/80 shadow-md px-3.5 py-2 text-[12px] font-medium text-slate-700`}
    >
      <span className={`w-6 h-6 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}>
        <Icon size={13} />
      </span>
      {label}
    </motion.div>
  );
}

export default function PublicLandingPage({
  language,
  setLanguage,
  isMobileDevice,
  desktopStaffLogin,
  setDesktopStaffLogin,
}: Props) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const { scrollY } = useScroll();
  const headerBg = useTransform(scrollY, [0, 60], [0, 1]);
  const headerBackground = useTransform(headerBg, (v) => `rgba(255,255,255,${v * 0.92})`);

  const openAuth = useCallback((screen: AuthScreen = 'login') => {
    setAuthScreen(screen);
    setAuthOpen(true);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('library') === '1' || window.location.hash === '#public-catalog') {
      setCatalogExpanded(true);
      setTimeout(() => scrollTo('public-catalog'), 400);
    }
  }, []);

  const features = [
    { icon: FileText, titleKey: 'publicLanding.featureLecture' as const, descKey: 'publicLanding.featureLectureDesc' as const, color: 'blue' as const },
    { icon: BriefcaseMedical, titleKey: 'publicLanding.featureCases' as const, descKey: 'publicLanding.featureCasesDesc' as const, color: 'emerald' as const },
    { icon: ClipboardList, titleKey: 'publicLanding.featureTests' as const, descKey: 'publicLanding.featureTestsDesc' as const, color: 'violet' as const },
    { icon: Presentation, titleKey: 'publicLanding.featurePresentation' as const, descKey: 'publicLanding.featurePresentationDesc' as const, color: 'orange' as const },
    { icon: Rocket, titleKey: 'publicLanding.featureStartup' as const, descKey: 'publicLanding.featureStartupDesc' as const, color: 'pink' as const },
    { icon: MapPin, titleKey: 'publicLanding.gpsTitle' as const, descKey: 'publicLanding.gpsDesc' as const, color: 'amber' as const },
  ];

  const steps = [
    { num: '1', titleKey: 'publicLanding.step1Title' as const, descKey: 'publicLanding.step1Desc' as const, color: 'blue' as const },
    { num: '2', titleKey: 'publicLanding.step2Title' as const, descKey: 'publicLanding.step2Desc' as const, color: 'emerald' as const },
    { num: '3', titleKey: 'publicLanding.step3Title' as const, descKey: 'publicLanding.step3Desc' as const, color: 'violet' as const },
  ];

  const roles = [
    { icon: Shield, titleKey: 'publicLanding.roleAdmin' as const, descKey: 'publicLanding.roleAdminDesc' as const, color: 'indigo' as const },
    { icon: GraduationCap, titleKey: 'publicLanding.roleHodim' as const, descKey: 'publicLanding.roleHodimDesc' as const, color: 'emerald' as const },
    { icon: Rocket, titleKey: 'publicLanding.roleStartuper' as const, descKey: 'publicLanding.roleStartuperDesc' as const, color: 'amber' as const },
  ];

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#f8fafc] text-slate-900 selection:bg-blue-200/60">
      {/* Soft animated background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="landing-blob landing-blob-1" />
        <div className="landing-blob landing-blob-2" />
        <div className="landing-blob landing-blob-3" />
        <div className="landing-dot-grid absolute inset-0 opacity-[0.35]" />
      </div>

      {/* Header */}
      <motion.header
        style={{ backgroundColor: headerBackground }}
        className="fixed top-0 inset-x-0 z-50 border-b border-slate-200/0 backdrop-blur-xl [&:not(:first-child)]:border-slate-200/60"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5">
            <img src="/imentor-logo.png" alt="iMentor" className="h-9 w-9 rounded-xl object-cover shadow-sm ring-1 ring-slate-200/80" />
            <span className="font-semibold text-[16px] text-slate-900 tracking-tight">iMentor</span>
          </button>

          <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium text-slate-500">
            {(['features', 'how-it-works', 'public-catalog'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id === 'public-catalog' ? 'public-catalog-section' : id)}
                className="hover:text-slate-900 transition-colors"
              >
                {id === 'features' && t(language, 'publicLanding.navFeatures')}
                {id === 'how-it-works' && t(language, 'publicLanding.navHowItWorks')}
                {id === 'public-catalog' && t(language, 'publicLanding.navCatalog')}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as AppLanguage)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm"
              aria-label={t(language, 'shell.languageAria')}
            >
              <option value="uz">{languageLabel('uz')}</option>
              <option value="ru">{languageLabel('ru')}</option>
              <option value="en">{languageLabel('en')}</option>
            </select>
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
            >
              {t(language, 'publicLanding.login')}
            </button>
          </div>
        </div>
      </motion.header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-28 pb-16 lg:pt-36 lg:pb-24">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200/80 shadow-sm px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-8"
            >
              <Sparkles size={13} className="text-amber-500" />
              {t(language, 'publicLanding.badge')}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-[2.25rem] sm:text-5xl lg:text-[3.25rem] font-bold leading-[1.12] tracking-tight text-slate-900"
            >
              {t(language, 'publicLanding.heroTitle')}
              <br />
              <span className="landing-accent-text">{t(language, 'publicLanding.heroTitleAccent')}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-[16px] sm:text-[17px] text-slate-500 leading-relaxed max-w-2xl mx-auto"
            >
              {t(language, 'publicLanding.heroSubtitle')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-9 flex flex-wrap items-center justify-center gap-3"
            >
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="landing-cta-primary inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/20"
              >
                {t(language, 'publicLanding.getStarted')}
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollTo('public-catalog-section')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-7 py-3.5 text-[14px] font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:shadow transition-all"
              >
                <BookOpen size={16} className="text-blue-500" />
                {t(language, 'publicLanding.openCatalog')}
              </button>
            </motion.div>
          </div>

          {/* Floating chips — desktop only */}
          <div className="hidden lg:block relative h-32 mt-12 max-w-3xl mx-auto">
            <div className="absolute left-[5%] top-2">
              <FloatingChip icon={BookOpen} label={translate(language, 'welcome.featureSyllabus')} color="blue" />
            </div>
            <div className="absolute right-[8%] top-0">
              <FloatingChip icon={BriefcaseMedical} label={t(language, 'publicLanding.featureCases')} color="emerald" style={{ animationDelay: '1s' }} />
            </div>
            <div className="absolute left-[25%] bottom-0">
              <FloatingChip icon={ClipboardList} label={t(language, 'publicLanding.featureTests')} color="violet" style={{ animationDelay: '2s' }} />
            </div>
            <div className="absolute right-[20%] bottom-2">
              <FloatingChip icon={Zap} label="DeepSeek AI" color="amber" style={{ animationDelay: '0.5s' }} />
            </div>
          </div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto"
          >
            {[
              { v: '8+', l: t(language, 'publicLanding.statModules'), c: 'text-blue-600' },
              { v: '3', l: t(language, 'publicLanding.statLanguages'), c: 'text-emerald-600' },
              { v: 'AI', l: t(language, 'publicLanding.statAi'), c: 'text-violet-600' },
              { v: 'FJSTI', l: t(language, 'publicLanding.statInstitute'), c: 'text-orange-600' },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-white/80 backdrop-blur border border-slate-200/70 px-4 py-3 text-center shadow-sm">
                <p className={`text-xl font-bold ${s.c}`}>{s.v}</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{s.l}</p>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Institute trust */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left rounded-2xl bg-white border border-slate-200/80 px-6 py-4 shadow-sm"
          >
            <img src="/imentor-logo.png" alt="" className="h-10 w-10 rounded-xl ring-1 ring-slate-200/80" />
            <div>
              <p className="text-[13px] font-semibold text-slate-800">{t(language, 'publicLanding.trustedBy')}</p>
              <p className="text-[12px] text-slate-500">{t(language, 'publicLanding.brandSubtitle')}</p>
            </div>
          </motion.div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-5xl px-4 sm:px-6 py-16 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {t(language, 'publicLanding.featuresTitle')}
            </h2>
            <p className="text-[15px] text-slate-500 mt-3 max-w-xl mx-auto">{t(language, 'publicLanding.featuresSubtitle')}</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <FeatureCard
                key={f.titleKey}
                icon={f.icon}
                title={t(language, f.titleKey)}
                desc={t(language, f.descKey)}
                color={f.color}
                delay={i * 0.07}
              />
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-5xl px-4 sm:px-6 py-16 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{t(language, 'publicLanding.howTitle')}</h2>
            <p className="text-[15px] text-slate-500 mt-3">{t(language, 'publicLanding.howSubtitle')}</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((step, i) => {
              const c = ICON_COLORS[step.color];
              return (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="relative rounded-2xl bg-white border border-slate-200/80 p-6 shadow-sm"
                >
                  <div className={`w-10 h-10 rounded-full ${c.bg} ${c.text} font-bold text-[15px] flex items-center justify-center mb-4 ring-2 ${c.ring}`}>
                    {step.num}
                  </div>
                  <h3 className="text-[15px] font-semibold text-slate-900 mb-2">{t(language, step.titleKey)}</h3>
                  <p className="text-[13px] text-slate-500 leading-relaxed">{t(language, step.descKey)}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Roles */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{t(language, 'publicLanding.rolesTitle')}</h2>
            <p className="text-[15px] text-slate-500 mt-3">{t(language, 'publicLanding.rolesSubtitle')}</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {roles.map((role, i) => {
              const c = ICON_COLORS[role.color];
              return (
                <motion.div
                  key={role.titleKey}
                  initial={{ opacity: 0, scale: 0.96 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -3 }}
                  className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>
                    <role.icon size={18} />
                  </div>
                  <h3 className="text-[14px] font-semibold text-slate-900 mb-1">{t(language, role.titleKey)}</h3>
                  <p className="text-[12px] text-slate-500 leading-relaxed">{t(language, role.descKey)}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Compact catalog */}
        <section id="public-catalog-section" className="mx-auto max-w-5xl px-4 sm:px-6 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden"
          >
            <div className="px-5 sm:px-7 pt-6 pb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-slate-100">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 mb-1.5 flex items-center gap-1">
                  <BookOpen size={12} /> {t(language, 'publicLanding.featureNoLogin')}
                </p>
                <h2 className="text-xl font-bold text-slate-900">{t(language, 'publicLanding.catalogSectionTitle')}</h2>
                <p className="text-[13px] text-slate-500 mt-1">{t(language, 'publicLanding.catalogSectionSubtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCatalogExpanded((v) => !v);
                  if (!catalogExpanded) setTimeout(() => scrollTo('public-catalog'), 100);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
              >
                {catalogExpanded ? (
                  <><ChevronUp size={15} /> {t(language, 'publicLanding.collapseCatalog')}</>
                ) : (
                  <><ChevronDown size={15} /> {t(language, 'publicLanding.expandCatalog')}</>
                )}
              </button>
            </div>
            <div className="px-5 sm:px-7 py-5">
              <PublicContentCatalog
                language={language}
                embedded
                compact={!catalogExpanded}
                expanded={catalogExpanded}
                onExpandChange={setCatalogExpanded}
                previewLimit={6}
              />
            </div>
          </motion.div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="landing-cta-band rounded-3xl px-8 py-14 sm:px-12 text-center"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{t(language, 'publicLanding.ctaTitle')}</h2>
            <p className="text-[15px] text-slate-600 mt-3 max-w-lg mx-auto">{t(language, 'publicLanding.ctaSubtitle')}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="landing-cta-primary inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[14px] font-semibold text-white shadow-lg"
              >
                {t(language, 'publicLanding.getStarted')} <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => openAuth('register')}
                className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-7 py-3.5 text-[14px] font-semibold text-slate-700 shadow-sm hover:shadow transition-all"
              >
                <Users size={16} className="text-emerald-500" />
                {t(language, 'publicLanding.staffAccess')}
              </button>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-200/80 bg-white">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <img src="/imentor-logo.png" alt="" className="h-8 w-8 rounded-lg" />
              <p className="text-[12px] text-slate-500">{t(language, 'welcome.footerInstitute')}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 text-[12px] text-slate-400">
              <span>{t(language, 'footer.copyright')}</span>
              <a href="https://fjsti.uz" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                {t(language, 'footer.developer')}
              </a>
            </div>
          </div>
        </footer>
      </main>

      {/* Auth modal */}
      <AnimatePresence>
        {authOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/30 backdrop-blur-sm p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: 32, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 32, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full sm:max-w-[520px] max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200/80"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur px-5 py-4">
                <p className="font-semibold text-slate-900">{t(language, 'publicLanding.authPanelTitle')}</p>
                <button type="button" onClick={() => setAuthOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 sm:p-6">
                {isMobileDevice ? (
                  authScreen === 'login' ? (
                    <MobileMinimalLogin onSwitchToRegister={() => setAuthScreen('register')} />
                  ) : (
                    <RegisterPage onSwitchToLogin={() => setAuthScreen('login')} />
                  )
                ) : isDesktopBrowser() && !desktopStaffLogin ? (
                  <DesktopHodimQrLogin onOtherRoles={() => setDesktopStaffLogin(true)} />
                ) : authScreen === 'login' ? (
                  <LoginPage
                    onSwitchToRegister={() => setAuthScreen('register')}
                    onBackToQr={isDesktopBrowser() ? () => setDesktopStaffLogin(false) : undefined}
                  />
                ) : (
                  <RegisterPage
                    onSwitchToLogin={() => setAuthScreen('login')}
                    onBackToQr={
                      isDesktopBrowser()
                        ? () => {
                            setAuthScreen('login');
                            setDesktopStaffLogin(false);
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
