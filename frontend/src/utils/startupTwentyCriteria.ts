/** Tibbiyot / TA startapi uchun 20 ta barqaror mezon (AI va UI bir xil id). */
export type StartupCriterionDef = { id: string; title: string };

export const STARTUP_TWENTY_CRITERIA: readonly StartupCriterionDef[] = [
  { id: 'c01', title: 'Muammo aniqligi va mijoz segmenti' },
  { id: 'c02', title: 'Yechimning tibbiy / ijtimoiy ta’siri' },
  { id: 'c03', title: 'Innovatsiya va farqlanish' },
  { id: 'c04', title: 'Bozor ehtiyoji va dolzarblik' },
  { id: 'c05', title: 'Raqobat va pozitsiyalash' },
  { id: 'c06', title: 'Monetizatsiya va barqarorlik modeli' },
  { id: 'c07', title: 'Traksiya yoki dalillar (pilot, suhbat, raqam)' },
  { id: 'c08', title: 'Jamoa va asosiy kompetensiyalar' },
  { id: 'c09', title: 'Texnologiya / mahsulot tayyorgarligi' },
  { id: 'c10', title: 'Regulyatorika va tibbiy xavfsizlik' },
  { id: 'c11', title: 'Shaxsiy ma’lumot va maxfiylik' },
  { id: 'c12', title: 'Klinik yoki amaliyot integratsiyasi' },
  { id: 'c13', title: 'Pilot dizayn va KPI' },
  { id: 'c14', title: 'Xavflar va yumshatish rejasi' },
  { id: 'c15', title: 'Grant / moliya manbalari mosligi' },
  { id: 'c16', title: 'Institut / kampus kontekstiga moslik' },
  { id: 'c17', title: 'Pitch va tushunarli komunikatsiya' },
  { id: 'c18', title: 'Yo‘l xaritasi (30/90 kun)' },
  { id: 'c19', title: 'Hujjatlar va jarayon tartibi' },
  { id: 'c20', title: 'Barqaror kengaytirish (masshtab) imkoniyati' },
] as const;

export function criteriaPromptBlock(): string {
  return STARTUP_TWENTY_CRITERIA.map((c) => `${c.id}: ${c.title}`).join('\n');
}
