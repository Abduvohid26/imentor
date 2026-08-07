import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  User, 
  Mail, 
  Phone, 
  Lock, 
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Camera,
  LogOut,
  Save,
  GraduationCap,
  Pencil,
} from 'lucide-react';
import StaffTeachingSubjectsPicker from './staff/StaffTeachingSubjectsPicker';
import { fetchMyCourseSelections } from '../utils/syllabusApi';
import {
  getCurrentLocalUser,
  logoutLocalStaff,
  subscribeLocalAuth,
  updateCurrentLocalUser,
  normalizeUserRole,
  type LocalStaffUser,
} from '../utils/localStaffAuth';
import {
  clearBackendAuthTokens,
  syncCurrentUserPasswordToBackend,
} from '../utils/backendAuth';
import { roleLabel as translateRoleLabel } from '../i18n/translations';
import { useUiText } from '../i18n/useUiText';
import StaffPageLayout from './staff/StaffPageLayout';
import { staffBtnPrimary, staffBtnSecondary, STAFF_HEADING } from './staff/staffUi';
import { AVATAR_ACCEPT, fileToAvatarBlob } from '../utils/profilePhoto';
import {
  deleteStaffAvatarOnServer,
  resolveProfilePhotoUrl,
  uploadStaffAvatar,
} from '../utils/profilePhotoApi';

export default function UserProfile() {
  const { t, language } = useUiText();
  const [user, setUser] = useState<LocalStaffUser | null>(() => getCurrentLocalUser());
  
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editingSubjects, setEditingSubjects] = useState(false);
  const [subjectNames, setSubjectNames] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const isGoogleAuth = false;
  const isHodim = Boolean(user && normalizeUserRole(user) === 'hodim');

  const reloadSubjects = async () => {
    if (!isHodim) return;
    setSubjectsLoading(true);
    try {
      const rows = await fetchMyCourseSelections();
      const seen = new Set<number>();
      const names: string[] = [];
      for (const row of rows) {
        if (seen.has(row.syllabus.id)) continue;
        seen.add(row.syllabus.id);
        names.push(row.syllabus.subject_name);
      }
      setSubjectNames(names);
    } catch {
      setSubjectNames([]);
    } finally {
      setSubjectsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setPhone(user.phoneDisplay);
    }
  }, [user]);

  useEffect(() => subscribeLocalAuth(() => setUser(getCurrentLocalUser())), []);

  useEffect(() => {
    if (!isHodim) return;
    void reloadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on role/user change
  }, [user?.uid, isHodim]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoadingProfile(true);
    setProfileMessage(null);
    try {
      const parts = displayName.trim().split(/\s+/);
      const firstName = parts[0] || user.firstName;
      const lastName = parts.slice(1).join(' ') || user.lastName;
      const updated = updateCurrentLocalUser({
        displayName: displayName.trim(),
        firstName,
        lastName,
        phoneDisplay: phone.trim(),
      });
      setUser(updated);
      setProfileMessage({ text: t('profile.updateSuccess'), type: 'success' });
      
      setTimeout(() => setProfileMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setProfileMessage({ text: t('profile.updateError'), type: 'error' });
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: t('profile.passwordMismatch'), type: 'error' });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({ text: t('profile.passwordTooShort'), type: 'error' });
      return;
    }

    setLoadingPassword(true);
    setPasswordMessage(null);
    
    try {
      await syncCurrentUserPasswordToBackend(currentPassword, newPassword);
      setPasswordMessage({ text: t('profile.passwordSuccess'), type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      console.error(err);
      setPasswordMessage({ text: t('profile.passwordError'), type: 'error' });
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleLogout = async () => {
    clearBackendAuthTokens();
    logoutLocalStaff();
  };

  const handleAvatarFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    setAvatarMessage(null);
    try {
      const blob = await fileToAvatarBlob(file);
      const photoUrl = await uploadStaffAvatar(blob);
      const updated = updateCurrentLocalUser({ photoURL: photoUrl });
      setUser(updated);
      setAvatarMessage({ text: t('profile.avatarSaved'), type: 'success' });
      setTimeout(() => setAvatarMessage(null), 3000);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'invalid-type') {
        setAvatarMessage({ text: t('profile.avatarInvalidType'), type: 'error' });
      } else if (code === 'too-large' || code === 'compress-failed') {
        setAvatarMessage({ text: t('profile.avatarTooLarge'), type: 'error' });
      } else if (code === 'no-backend-token') {
        setAvatarMessage({ text: 'Serverga ulanish yo‘q. Qayta kiring.', type: 'error' });
      } else {
        setAvatarMessage({ text: 'Rasmni yuklab bo‘lmadi.', type: 'error' });
      }
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.photoURL) return;
    setUploadingAvatar(true);
    setAvatarMessage(null);
    try {
      try {
        await deleteStaffAvatarOnServer();
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (code !== 'no-backend-token') throw err;
      }
      const updated = updateCurrentLocalUser({ photoURL: null });
      setUser(updated);
      setAvatarMessage({ text: t('profile.avatarRemoved'), type: 'success' });
      setTimeout(() => setAvatarMessage(null), 3000);
    } catch {
      setAvatarMessage({ text: 'Rasmni o‘chirib bo‘lmadi.', type: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const role = user ? normalizeUserRole(user) : 'hodim';
  const displayRole = translateRoleLabel(language, role);

  return (
    <StaffPageLayout className="flex flex-col h-full">
      {/* Header Profile Section */}
      <div className="ios-glass p-6 sm:p-8 rounded-[2rem] shadow-sm relative w-full border border-white/60">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[150%] bg-[#083047]/5 blur-3xl pointer-events-none rounded-full" />

        <button
          type="button"
          onClick={handleLogout}
          className="absolute top-5 right-5 sm:top-6 sm:right-6 z-20 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-rose-600 bg-white/80 border border-rose-200/70 hover:bg-rose-50 transition-colors shadow-sm"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">{t('profile.logout')}</span>
          <span className="sm:hidden">{t('profile.logoutShort')}</span>
        </button>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10 w-full pt-12 sm:pt-0 md:pr-32">
          {/* Avatar container */}
          <div className="relative shrink-0">
            <input
              ref={avatarInputRef}
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              onChange={(e) => void handleAvatarFile(e.target.files)}
            />
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-[2rem] p-1.5 bg-[#083047]/15 shadow-lg relative">
              <div className="w-full h-full rounded-[1.75rem] overflow-hidden bg-white flex items-center justify-center">
                {user?.photoURL ? (
                  <img key={user.photoURL} src={resolveProfilePhotoUrl(user.photoURL)} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={64} className="text-black/20" />
                )}
              </div>
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-3 -right-3 w-12 h-12 bg-white rounded-2xl shadow-lg border border-black/5 flex items-center justify-center text-blue-600 hover:text-blue-700 hover:scale-105 transition-all disabled:opacity-60"
                aria-label={t('profile.uploadPhotoAria')}
              >
                {uploadingAvatar ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-2">
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {t('profile.uploadPhoto')}
              </button>
              {user?.photoURL && (
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={handleRemoveAvatar}
                  className="text-[12px] font-semibold text-rose-500 hover:text-rose-600 disabled:opacity-50"
                >
                  O‘chirish
                </button>
              )}
            </div>
            {avatarMessage && (
              <p
                className={`mt-2 text-[11px] font-medium ${
                  avatarMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {avatarMessage.text}
              </p>
            )}
          </div>

          <div className="flex-1 text-center md:text-left pt-2 w-full min-w-0">
            <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-black/90 tracking-tight">
                {user?.displayName || t('profile.defaultName')}
              </h1>
              <span className="px-3 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-700 text-[12px] font-semibold rounded-lg">
                {t('common.role')}: {displayRole}
              </span>
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[12px] font-semibold rounded-lg inline-flex items-center gap-1.5">
                <ShieldCheck size={14} /> {t('profile.localMode')}
              </span>
            </div>
            {user?.faculty && (
              <p className="text-[14px] font-medium text-black/55 mb-2">
                <span className="text-black/40">{t('profile.faculty')}</span> {user.faculty}
                <br />
                <span className="text-black/40">{t('profile.department')}</span> {user.department}
                <br />
                <span className="text-black/40">{t('profile.direction')}</span> {user.direction}
              </p>
            )}
            <p className="text-[12px] font-mono text-black/40 break-all">
              {t('profile.systemId')}: {user?.email || '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6 w-full">
         
         {/* Profile Update Form */}
         <div className="space-y-6">
            <div className="ios-glass p-6 sm:p-8 rounded-[2rem] shadow-sm border border-white/60">
                <h3 className="text-xl font-bold text-black/80 flex items-center gap-2 mb-6">
                    <User size={22} className="text-blue-500" /> {t('profile.personalTitle')}
                </h3>
                <form onSubmit={handleUpdateProfile} className="space-y-5">
                    
                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-black/60 px-1">{t('profile.fullName')}</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40"><User size={18} /></span>
                            <input 
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                className="w-full bg-white/60 border border-black/10 rounded-xl py-3 pl-11 pr-4 text-black/80 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white transition-all"
                                placeholder={t('profile.fullNamePlaceholder')}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-black/60 px-1">{t('profile.phoneNumber')}</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40"><Phone size={18} /></span>
                            <input 
                                type="text"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                className="w-full bg-white/60 border border-black/10 rounded-xl py-3 pl-11 pr-4 text-black/80 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white transition-all"
                                placeholder="+998 90 123 45 67"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-black/60 px-1">{t('profile.internalLogin')}</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40"><Mail size={18} /></span>
                            <input 
                                type="email"
                                value={user?.email || ''}
                                disabled
                                className="w-full bg-black/5 border border-black/5 rounded-xl py-3 pl-11 pr-4 text-black/50 font-medium cursor-not-allowed text-xs"
                            />
                        </div>
                        <p className="text-xs text-black/40 px-1 mt-1">{t('profile.internalLoginHint')}</p>
                    </div>

                    {profileMessage && (
                        <div className={`p-3 rounded-xl flex items-center gap-2 text-sm font-medium ${profileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                            {profileMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                            {profileMessage.text}
                        </div>
                    )}

                    <button 
                        type="submit"
                        disabled={loadingProfile}
                        className={`w-full mt-2 ${staffBtnPrimary} py-3.5`}
                    >
                        {loadingProfile ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {t('profile.saveChanges')}
                    </button>
                </form>
            </div>

            {isHodim && (
              <div className="ios-glass p-6 sm:p-8 rounded-[2rem] shadow-sm border border-white/60">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-xl font-bold text-black/80 flex items-center gap-2">
                    <GraduationCap size={22} className="text-blue-500" />
                    {t('teachingSubjects.profileTitle')}
                  </h3>
                  {!editingSubjects && (
                    <button
                      type="button"
                      onClick={() => setEditingSubjects(true)}
                      className={`${staffBtnSecondary} px-3 py-2 text-sm`}
                    >
                      <Pencil size={16} />
                      {t('teachingSubjects.edit')}
                    </button>
                  )}
                </div>
                {editingSubjects ? (
                  <StaffTeachingSubjectsPicker
                    variant="profile"
                    showHeader={false}
                    onSaved={() => {
                      setEditingSubjects(false);
                      void reloadSubjects();
                    }}
                  />
                ) : subjectsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-black/50 py-4">
                    <Loader2 size={18} className="animate-spin" />
                    {t('teachingSubjects.loading')}
                  </div>
                ) : subjectNames.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      {t('syllabus.noAssignedCoursesHint')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setEditingSubjects(true)}
                      className={`${staffBtnPrimary} px-4 py-2.5 text-sm`}
                    >
                      <Pencil size={16} />
                      {t('teachingSubjects.edit')}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-black/45">
                      {t('teachingSubjects.selectedCount', { count: subjectNames.length })}
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {subjectNames.map((name) => (
                        <li
                          key={name}
                          className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-slate-800"
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
         </div>

         {/* Change Password Form */}
         <div className="space-y-6">
            <div className="ios-glass p-6 sm:p-8 rounded-[2rem] shadow-sm border border-white/60 h-full">
                <h3 className="text-xl font-bold text-black/80 flex items-center gap-2 mb-6">
                    <Lock size={22} className="text-violet-500" /> {t('profile.passwordTitle')}
                </h3>
                
                {isGoogleAuth ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center bg-violet-50/50 rounded-2xl border border-violet-100 p-6">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 text-violet-500">
                            <Lock size={32} />
                        </div>
                        <h4 className="font-semibold text-black/80 text-lg mb-2">{t('profile.googleLinkedTitle')}</h4>
                        <p className="text-sm text-black/50">
                            {t('profile.googleLinkedHint')}
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleChangePassword} className="space-y-5">
                    
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-black/60 px-1">{t('profile.currentPassword')}</label>
                            <input 
                                type="password"
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                                required
                                className="w-full bg-white/60 border border-black/10 rounded-xl py-3 px-4 text-black/80 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:bg-white transition-all"
                                placeholder={t('profile.currentPasswordPlaceholder')}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-black/60 px-1">{t('profile.newPassword')}</label>
                            <input 
                                type="password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full bg-white/60 border border-black/10 rounded-xl py-3 px-4 text-black/80 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:bg-white transition-all"
                                placeholder={t('profile.newPasswordPlaceholder')}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-black/60 px-1">{t('profile.confirmPassword')}</label>
                            <input 
                                type="password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full bg-white/60 border border-black/10 rounded-xl py-3 px-4 text-black/80 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:bg-white transition-all"
                                placeholder={t('profile.confirmPasswordPlaceholder')}
                            />
                        </div>

                        {passwordMessage && (
                            <div className={`p-3 rounded-xl flex items-center gap-2 text-sm font-medium ${passwordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                {passwordMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                                {passwordMessage.text}
                            </div>
                        )}

                        <button 
                            type="submit"
                            disabled={loadingPassword}
                            className={`w-full mt-2 ${staffBtnPrimary} py-3.5`}
                        >
                            {loadingPassword ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                            {t('profile.updatePassword')}
                        </button>
                    </form>
                )}
            </div>
         </div>
      </div>
    </StaffPageLayout>
  );
}
