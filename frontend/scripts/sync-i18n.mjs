/**
 * Sync missing i18n keys (en-only -> uz/ru) and fix known English leftovers.
 * Run: node scripts/sync-i18n.mjs
 */
import fs from 'fs';
import path from 'path';

const file = path.join('src', 'i18n', 'translations.ts');
let src = fs.readFileSync(file, 'utf8');

function parseLang(lang) {
  const marker = `\n  ${lang}: {`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`Lang ${lang} not found`);
  const nextMarkers = ['\n  ru: {', '\n  en: {', '\n} as const'];
  let end = src.length;
  for (const nm of nextMarkers) {
    const p = src.indexOf(nm, start + marker.length);
    if (p > start && p < end) end = p;
  }
  const block = src.slice(start, end);
  const out = {};
  const re = /'((?:\\'|[^'])*)':\s*'((?:\\'|[^'])*)'/g;
  let m;
  while ((m = re.exec(block))) {
    out[m[1].replace(/\\'/g, "'")] = m[2].replace(/\\'/g, "'");
  }
  return out;
}

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatEntry(key, value) {
  return `    '${esc(key)}': '${esc(value)}',`;
}

/** Map en-only keys to existing uz/ru keys */
const alias = {
  'admin.session': 'admin.sessionId',
  'admin.name': 'admin.fullName',
  'admin.lastActive': 'admin.lastActivity',
  'admin.editStaffTitle': 'admin.editStaff',
  'admin.newStaffTitle': 'admin.newStaff',
  'admin.passwordLeaveEmpty': 'admin.passwordEmpty',
  'admin.startuper.student': 'admin.student',
  'admin.startuper.employee': 'admin.employee',
  'admin.startuper.group': 'admin.studyGroup',
  'admin.startuper.jobTitle': 'admin.jobTitle',
  'admin.startuper.typeLabel': 'admin.participantKind',
  'admin.code': 'admin.buildingCode',
  'admin.latLng': 'admin.coordinates',
  'admin.inactive': 'admin.disabled',
  'admin.shortCode': 'admin.buildingCodeLabel',
  'admin.sortOrder': 'admin.order',
  'admin.syllabusSubtitle': 'admin.syllabusDescription',
  'admin.selectExisting': 'admin.addToExisting',
  'admin.newCourse': 'admin.newSubject',
  'admin.courseName': 'admin.subjectName',
  'admin.courseNamePlaceholder': 'admin.subjectNamePlaceholder',
  'admin.shortDescription': 'admin.descriptionLabel',
  'admin.shortDescriptionPlaceholder': 'admin.descriptionPlaceholder',
  'admin.uploadHint': 'admin.uploadInstructions',
  'admin.analyzingProgress': 'admin.progress',
  'admin.previewWillOpen': 'admin.analysisComplete',
  'admin.noCourses': 'admin.noSubjectsYet',
  'admin.uploadPrompt': 'admin.uploadSyllabus',
  'admin.directions': 'admin.tracks',
  'admin.noDocument': 'admin.noDocumentUploaded',
  'admin.addDocumentToThis': 'admin.addDocumentToSubject',
  'admin.confirmDeleteCase': 'admin.deleteCaseConfirm',
  'admin.answerComplex': 'admin.answer',
  'admin.error.password': 'admin.error.passwordMin',
  'admin.error.groupRequired': 'admin.error.startuperGroupRequired',
  'admin.error.jobTitleRequired': 'admin.error.startuperJobRequired',
  'admin.error.lastAdmin': 'admin.error.lastAdminRole',
  'admin.error.phoneExists': 'admin.error.phoneAlreadyExists',
  'admin.error.buildingCoords': 'admin.error.buildingCoordsInvalid',
  'admin.error.buildingNew': 'admin.error.buildingNewRequired',
  'admin.noApplications': 'admin.noApplicationsYet',
  'admin.owner': 'admin.ownerKey',
  'admin.research': 'admin.researchProject',
  'admin.startup': 'admin.startupProject',
  'admin.dossierNotes': 'admin.comment',
  'admin.teamMembers': 'admin.teamMember',
  'admin.scheduleTab': 'admin.schedule',
  'admin.liveMapTab': 'admin.liveMap',
  'admin.pingsTab': 'admin.pings',
  'admin.alertsTab': 'admin.alerts',
  'admin.liveMapButton': 'admin.allStaffLiveMap',
  'admin.liveMapSubtitle': 'admin.liveMapDescription',
  'admin.alternatingHint': 'admin.alternatingWeeks',
  'admin.weekPhase.every': 'admin.everyWeek',
  'admin.weekPhase.upper': 'admin.upperWeek',
  'admin.weekPhase.lower': 'admin.lowerWeek',
  'admin.day': 'admin.weekday',
  'admin.noSlots': 'admin.noSlotsYet',
  'admin.selectStaffToCreate': 'admin.selectStaffToSchedule',
  'admin.legacyRadiusLabel': 'admin.legacyRadius',
  'admin.modeLabel': 'admin.scheduleMode',
  'admin.modeSingle': 'admin.singleMode',
  'admin.modeAlternating': 'admin.alternatingMode',
  'admin.addInterval': 'admin.addTimeSlot',
  'admin.noIntervalYet': 'admin.noSlotsForDay',
  'admin.legacyLat': 'admin.lat',
  'admin.legacyLng': 'admin.lng',
  'admin.mapDataTime': 'admin.liveMapUpdated',
  'admin.autoRefresh': 'admin.liveMapAutoUpdate',
  'admin.mapInstructions': 'admin.liveMapHelp',
  'admin.selectedStaffNoGps': 'admin.liveMapNoData',
  'admin.staffList': 'admin.liveMapStaffList',
  'admin.oldGps': 'admin.liveMapOldGps',
  'admin.noGpsYet': 'admin.liveMapNoGps',
  'admin.pingTime': 'admin.recorded',
  'admin.pingAccuracy': 'admin.accuracy',
  'admin.noPings': 'admin.noPingsYet',
  'admin.alertBuilding': 'admin.building',
  'admin.alertMessage': 'admin.comment',
  'admin.noAlerts': 'admin.noAlertsYet',
  'admin.mapPopup.distanceToBuilding': 'admin.mapPopup.distanceM',
  'admin.mapPopup.oldGpsNotice': 'admin.mapPopup.staleGps',
  'admin.syllabusPreview.title': 'admin.previewTitle',
  'admin.syllabusPreview.subtitle': 'admin.previewSubtitle',
  'admin.syllabusPreview.totalTopics': 'admin.previewTotal',
  'admin.syllabusPreview.lectures': 'admin.previewLecture',
  'admin.syllabusPreview.practicals': 'admin.previewPractical',
  'admin.syllabusPreview.glossary': 'admin.previewInfo',
  'admin.syllabusPreview.direction': 'admin.previewVariant',
  'admin.syllabusPreview.moreTopics': 'admin.previewMore',
  'admin.syllabusPreview.cancelButton': 'admin.previewCancel',
  'admin.syllabusPreview.saveButton': 'admin.previewSave',
  'startup.scientificResearch': 'startup.researchProject',
  'startup.projectTypeNote': 'startup.typeInstructions',
  'startup.noProjects': 'startup.noProjectsYet',
  'startup.noProjectsHint': 'startup.noProjectsHelp',
  'startup.scientificLayer': 'startup.scientificLayerTitle',
  'startup.projectAbout': 'startup.projectDescription',
  'startup.projectAboutHint': 'startup.projectDescriptionHelp',
  'startup.projectAboutPlaceholder': 'startup.projectDescriptionPlaceholder',
  'startup.characterCount': 'startup.charactersCount',
  'startup.shortSummary': 'startup.briefDescription',
  'startup.shortSummaryPlaceholder': 'startup.briefDescriptionPlaceholder',
  'startup.stage1Hint': 'startup.stage1Instructions',
  'startup.stage1Button': 'startup.stage1Analysis',
  'startup.printButton': 'startup.printPdf',
  'startup.deleteButton': 'startup.deleteProject',
  'startup.adminSubmitNote': 'startup.submitInstructions',
  'startup.disclaimerNote': 'startup.aiDisclaimer',
  'startup.stage2to4.title': 'startup.discoveryStageTitle',
  'startup.stage2to4.subtitle': 'startup.discoveryStageDescription',
  'startup.stage2Button': 'startup.stage2Questions',
  'startup.stage3Button': 'startup.stage3Criteria',
  'startup.stage4Button': 'startup.stage4Word',
  'startup.stage2ButtonDisabledHint': 'startup.stage2DisabledHint',
  'startup.stage3ButtonDisabledHint': 'startup.stage3DisabledHint',
  'startup.stage4ButtonDisabledHint': 'startup.stage4DisabledHint',
  'startup.stageNotYetOpen': 'startup.stage1Required',
  'startup.evaluationTitle': 'startup.evaluationResult',
  'startup.evaluationWordNote': 'startup.wordRestricted',
  'startup.criterionLabel': 'startup.criterion',
  'startup.criterionComment': 'startup.evaluationComment',
  'startup.coachChatTitle': 'startup.coachTitle',
  'startup.coachChatSubtitle': 'startup.coachSubtitle',
  'startup.coachEmptyWithAnalysis': 'startup.coachReady',
  'startup.coachEmptyNoAnalysis': 'startup.coachNoAnalysis',
  'startup.coachThinking': 'startup.coachTyping',
  'startup.coachPromptPlaceholder': 'startup.coachPlaceholder',
  'startup.coachSendButton': 'startup.coachSend',
  'startup.newProjectDialog.title.startup': 'startup.newStartupTitle',
  'startup.newProjectDialog.title.research': 'startup.newProjectTitle',
  'startup.newProjectDialog.subtitle': 'startup.newProjectInstructions',
  'startup.newProjectDialog.nameLabel': 'startup.newProjectName',
  'startup.newProjectDialog.namePlaceholder': 'startup.newProjectNamePlaceholder',
  'startup.newProjectDialog.nameHint': 'startup.newProjectNameHelp',
  'startup.newProjectDialog.aboutLabel': 'startup.newProjectAbout',
  'startup.newProjectDialog.aboutPlaceholder': 'startup.newProjectAboutPlaceholder',
  'startup.newProjectDialog.characterCount': 'startup.newProjectCharCount',
  'startup.newProjectDialog.cancelButton': 'startup.newProjectCancel',
  'startup.newProjectDialog.createButton': 'startup.newProjectCreateButton',
  'startup.dossierGate.canSubmit': 'startup.dossierReadyToSubmit',
  'startup.dossierGate.cannotSubmit': 'startup.dossierCannotSubmit',
  'startup.dossierGate.recommendation': 'startup.dossierRecommendations',
  'startup.dossierProjectTypeLabel': 'startup.dossierProjectKind',
  'startup.dossierProjectType.startup': 'startup.dossierStartup',
  'startup.dossierProjectType.research': 'startup.dossierResearch',
  'startup.dossierProjectType.hybrid': 'startup.dossierHybrid',
  'startup.dossierElevatorPitch': 'startup.dossierOneLiner',
  'startup.dossierElevatorPitchPlaceholder': 'startup.dossierOneLinerPlaceholder',
  'startup.dossierTeamLabel': 'startup.dossierTeam',
  'startup.dossierNoTeamYet': 'startup.dossierNoTeam',
  'startup.dossierTeamFullName': 'startup.dossierFullName',
  'startup.dossierTeamRole': 'startup.dossierRole',
  'startup.dossierTeamOrganization': 'startup.dossierOrganization',
  'startup.dossierTeamContact': 'startup.dossierContact',
  'startup.dossierFilesLabel': 'startup.dossierDocuments',
  'startup.dossierFilesHint': 'startup.dossierOptional',
  'startup.dossierRemoveFile': 'startup.dossierRemove',
  'startup.dossierNotesLabel': 'startup.dossierNotes',
  'startup.dossierSaveButton': 'startup.dossierSave',
  'startup.dossierSubmitButton': 'startup.dossierSubmit',
  'startup.dossierRefreshNote': 'startup.dossierDisclaimer',
};

/** Keys needing explicit translation (no alias or alias target missing) */
const explicit = {
  uz: {
    'admin.startuper': 'Startuper',
    'admin.caseLabel': 'Keys',
    'admin.shortCodePlaceholder': 'K1',
    'admin.noTopics': 'Mavzusiz',
    'admin.toggle': 'Almashtirish',
    'admin.currentWeek': 'ISO hafta: {week}',
    'admin.syllabusPreview.lectureCount': '{count} ta ma\'ruza',
    'admin.syllabusPreview.practicalCount': '{count} ta amaliy',
    'startup.dossierFileSize': '{size} KB',
  },
  ru: {
    'admin.startuper': 'Стартапер',
    'admin.caseLabel': 'Кейс',
    'admin.shortCodePlaceholder': 'K1',
    'admin.noTopics': 'Без тем',
    'admin.toggle': 'Переключить',
    'admin.currentWeek': 'ISO неделя: {week}',
    'admin.syllabusPreview.lectureCount': '{count} лекций',
    'admin.syllabusPreview.practicalCount': '{count} практических',
    'startup.dossierFileSize': '{size} KB',
  },
};

/** Fix English leftovers in uz/ru blocks */
const fixes = {
  uz: {
    'role.hodim': 'Yordamchi professor',
    'nav.admin-dashboard': 'Boshqaruv paneli',
    'admin.dashboardTitle': 'Boshqaruv paneli',
    'error.title': 'Nimadir noto\'g\'ri ketdi',
    'publicLanding.badge': 'AI tibbiy ta\'lim platformasi',
    'welcome.tagline': 'AI tibbiy ta\'lim platformasi',
    'publicLanding.roleAdmin': 'Administrator',
    'syllabus.errorLogin': 'Tizimga qayta kiring (yordamchi professor hisobi kerak).',
    'syllabus.errorRole': 'Bu bo\'lim faqat «Yordamchi professor» roli uchun. Shu rol bilan kiring.',
    'auth.register.hodimOption': 'Yordamchi professor (ta\'lim modullari)',
    'common.goToSyllabus': 'Fan rejasi bo\'limiga o\'tish',
    'admin.coordinates': 'kenglik / uzunlik',
    'admin.lat': 'Kenglik',
    'admin.lng': 'Uzunlik',
    'admin.pitch': 'Qisqa taqdimot (pitch)',
    'lecture.print': 'Saqlash / chop etish',
    'analytics.newChat': 'Yangi chat',
    'welcome.featureSyllabus': 'Fan rejasi asosida mavzu tanlash',
    'welcome.featurePresentation': 'Mavzu bo\'yicha taqdimot yuklash va ko\'rish',
    'welcome.featureCases': 'Klinik holat va test generatori',
    'welcome.featureLanguages': 'O\'zbek / Русский / English',
    'welcome.paragraph3': 'iMentor ko\'p tilli muhitni qo\'llab-quvvatlaydi (O\'zbek, Rus, Ingliz).',
    'publicLanding.heroSubtitle': 'iMentor — o\'qituvchilar uchun ma\'ruza, test, klinik holat va taqdimot yaratish; talabalar uchun jonli test; startap innovatsiyasi — barchasi bitta ekotizimda.',
    'publicLanding.featurePresentationDesc': 'PDF/PPT yuklash, AI slayd matni va mavzuga bog\'langan tarqatma materiallar.',
  },
  ru: {
    'role.hodim': 'Ассистент профессора',
    'publicLanding.badge': 'AI-платформа медицинского образования',
    'welcome.tagline': 'AI-платформа медицинского образования',
    'syllabus.errorLogin': 'Войдите снова (нужен аккаунт ассистента профессора).',
    'syllabus.errorRole': 'Этот раздел только для роли «Ассистент профессора».',
    'auth.register.hodimOption': 'Ассистент профессора (учебные модули)',
    'admin.coordinates': 'широта / долгота',
    'admin.lat': 'Широта',
    'admin.lng': 'Долгота',
    'admin.pitch': 'Краткая презентация (pitch)',
  },
};

function applyFixes(lang) {
  const { start, end } = langBlockBounds(lang);
  let block = src.slice(start, end);
  for (const [key, value] of Object.entries(fixes[lang] || {})) {
    const pattern = new RegExp(`('${key.replace(/\./g, '\\.')}':\\s*)'(?:\\\\'|[^'])*'`);
    const next = block.replace(pattern, `$1'${esc(value)}'`);
    if (next === block) console.warn(`Fix not applied for ${lang}.${key}`);
    block = next;
  }
  src = src.slice(0, start) + block + src.slice(end);
}

const uz = parseLang('uz');
const ru = parseLang('ru');
const en = parseLang('en');

applyFixes('uz');
applyFixes('ru');

// Re-parse after fixes
const uz2 = parseLang('uz');
const ru2 = parseLang('ru');

function buildMissing(lang, table) {
  const lines = [];
  const explicitLang = explicit[lang] || {};
  for (const key of Object.keys(en)) {
    if (key in table) continue;
    let value = explicitLang[key];
    if (!value && alias[key] && table[alias[key]]) {
      value = table[alias[key]];
    }
    if (!value) {
      console.warn(`No translation for ${lang}.${key}`);
      value = en[key];
    }
    lines.push(formatEntry(key, value));
    table[key] = value;
  }
  return lines;
}

const uzMissing = buildMissing('uz', uz2);
const ruMissing = buildMissing('ru', ru2);

function langBlockBounds(lang) {
  const marker = `\n  ${lang}: {`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`Lang ${lang} not found`);
  const nextLang = lang === 'uz' ? 'ru' : lang === 'ru' ? 'en' : null;
  if (!nextLang) return { start, end: src.length };
  const closePattern = `\n  },\n  ${nextLang}: {`;
  const closePatternCrlf = `\r\n  },\r\n  ${nextLang}: {`;
  let closeIdx = src.indexOf(closePatternCrlf, start);
  let closeLen = closePatternCrlf.length;
  if (closeIdx < 0) {
    closeIdx = src.indexOf(closePattern, start);
    closeLen = closePattern.length;
  }
  if (closeIdx < 0) throw new Error(`Close for ${lang} not found`);
  return { start, end: closeIdx, closeLen };
}

function insertBeforeLangClose(lang, entries) {
  if (!entries.length) return;
  const { end } = langBlockBounds(lang);
  const block = `\r\n    /* synced keys */\r\n${entries.join('\r\n')}\r\n`;
  src = src.slice(0, end) + block + src.slice(end);
}

insertBeforeLangClose('uz', uzMissing);
insertBeforeLangClose('ru', ruMissing);

// Improve translate() fallback
src = src.replace(
  "let text: string = table[key] ?? UI_TEXT.uz[key] ?? key;",
  "let text: string = table[key] ?? UI_TEXT.uz[key] ?? UI_TEXT.en[key] ?? key;",
);

fs.writeFileSync(file, src, 'utf8');

const finalUz = Object.keys(parseLang('uz')).length;
const finalRu = Object.keys(parseLang('ru')).length;
const finalEn = Object.keys(parseLang('en')).length;
console.log(`Done. Keys: uz=${finalUz}, ru=${finalRu}, en=${finalEn}`);
