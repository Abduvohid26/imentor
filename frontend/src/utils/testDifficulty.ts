/** O‘qituvchi testdagi qiyinlik. Default — o‘rta. */
export type TestDifficulty = 'easy' | 'medium' | 'hard';

export const DEFAULT_TEST_DIFFICULTY: TestDifficulty = 'medium';

export function isTestDifficulty(value: unknown): value is TestDifficulty {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

export function testDifficultyTemperature(level: TestDifficulty): number {
  if (level === 'easy') return 0.25;
  if (level === 'hard') return 0.4;
  return 0.35;
}

const QUALITY_RULES = [
  'SAVOL SIFATI — xato tuzilmasin:',
  'Har savolda ANIQ bitta to\'g\'ri javob; ikkinchi variant ham to\'g\'ri bo\'lishi mumkin emas.',
  'Stem bitta narsani so\'rasin (tashxis YOKI dori YOKI keyingi qadam — aralashtirmang).',
  '5 ta variant bir xil turda bo\'lsin (hammasi tashxis, yoki hammasi dori, yoki hammasi tekshiruv).',
  '"Hammasi to\'g\'ri", "hech biri", "A va B" kabi variantlar TAQIQLANADI.',
  'To\'g\'ri javob stemdagi belgilardan mantiqan kelib chiqsin.',
  'O\'ylab topilgan raqam, doza, foiz YOZILMASIN — kitobda aniq yozilmagan bo\'lsa, umumiy qoida yozing.',
  'Distraktorlar mavzuga yaqin, lekin USHBU stem uchun aniq xato.',
  'Kitob parchasi berilgan bo\'lsa — faktlar FAQAT undan.',
].join(' ');

const LEVEL_RULES: Record<TestDifficulty, string> = {
  easy:
    'DARAJASI: OSON. Qisqa savol: ta\'rif, tipik belgi, birinchi qator dori nomi, klassifikatsiya. ' +
    'Klinik ssenariy bo\'lsa — 1 qisqa gap va bitta aniq belgi. ' +
    'Murakkab differensial, tuzoq "eng yaxshi keyingi qadam" YO\'Q. ' +
    'Talaba darsdagi asosiy faktni tanlasin.',
  medium:
    'DARAJASI: O\'RTA (standart). 1–2 gaplik oddiy klinik vignette. ' +
    'Tipik holat: bitta asosiy belgi to\'g\'ri javobni ko\'rsatsin. ' +
    'Qo\'llash: tashxis yoki birinchi qator davolash. Ikki qavatli tuzoq bo\'lmasin.',
  hard:
    'DARAJASI: QIYIN. 2–3 gaplik vignette: asosiy belgi + chalg\'ituvchi topilma, ' +
    'lekin to\'g\'ri javob BARIBIR bitta va aniq. ' +
    'Differensial, kontrendikatsiya yoki keyingi eng to\'g\'ri qadam. ' +
    'Ikki mantiqiy javob qoldirmang — trap distractor aniq xato bo\'lsin.',
};

export function buildTestDifficultyPrompt(level: TestDifficulty): string {
  return `${LEVEL_RULES[level]} ${QUALITY_RULES}`;
}

export function testStemInstruction(level: TestDifficulty): string {
  if (level === 'easy') return 'Qisqa aniq savol (ixtiyoriy 1 gaplik oddiy holat), 5 ta variant.';
  if (level === 'hard') return 'Klinik vignette 2–3 gap, 5 ta variant. To\'g\'ri javob bitta va shubhasiz bo\'lsin.';
  return 'Klinik vignette 1–2 gap, 5 ta variant.';
}

export function testExplanationInstruction(level: TestDifficulty): string {
  if (level === 'easy') {
    return (
      'explanation — 3-5 to\'liq gap: to\'g\'ri javob nima va nega; asosiy fakt/ta\'rif; ' +
      'distraktor nima uchun xato. Yo\'q ssenariyni o\'ylab topib yozmang.'
    );
  }
  return (
    'explanation — KAMIDA 5, KO\'PI BILAN 7 to\'liq gap (120-170 so\'z): ' +
    '(a) vignettadagi qaysi belgi/tahlil hal qiluvchi va nega; ' +
    '(b) klinik fikrlash: yetakchi sindrom va qaysi belgi boshqa tashxislarni kesib tashlashi; ' +
    '(c) patofiziologiya (mexanizm); ' +
    '(d) tasdiqlovchi tekshiruv va undan kutiladigan aniq natija; ' +
    '(e) keyingi qadam yoki tanlangan dori/usul nima qilishi. ' +
    'Bir-ikki gaplik yoki savolni takrorlaydigan izoh XATO hisoblanadi. ' +
    'Har gapda aniq atama, mexanizm yoki ko\'rsatkich bo\'lsin; "muhim ahamiyatga ega", ' +
    '"e\'tibor berish kerak" kabi bo\'sh (safsata) gaplar TAQIQLANADI.'
  );
}
