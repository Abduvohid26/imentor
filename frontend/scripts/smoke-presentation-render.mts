/**
 * Oflayn tekshiruv: soxta deck → rasm qidiruvi (real, ochiq manbalar) → PPTX.
 * AI chaqirilmaydi.
 *
 *   npx tsx scripts/smoke-presentation-render.mts [--no-images]
 */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// Node 18'da global File yo'q — brauzerdagi kod uchun polyfill.
if (typeof (globalThis as { File?: unknown }).File === 'undefined') {
  (globalThis as { File?: unknown }).File = class extends Blob {
    name: string;
    constructor(parts: BlobPart[], name: string, opts?: BlobPropertyBag) {
      super(parts, opts);
      this.name = name;
    }
  };
}
import { normalizePresentationContent } from '../src/utils/presentationContentSchema';
import { dedupePresentationBullets, dedupePresentationSlides } from '../src/utils/presentationQa';
import { resolvePresentationImages } from '../src/utils/presentationImages';
import { buildPresentationPptxFile } from '../src/utils/buildPresentationPptx';

const withImages = !process.argv.includes('--no-images');

const bullet = (s: string) => s;

const raw = {
  presentation_title: 'Teri Kasalliklari Haqida Umumiy Tushuncha',
  subject_area: 'Dermatovenerologiya(Stom)',
  author: 'iMentor',
  slides: [
    { slide_type: 'title', title: 'Teri Kasalliklari Haqida Umumiy Tushuncha', subtitle: 'Tasnif, tashxis va davolash', body: {}, image_query: '' },
    { slide_type: 'agenda', title: "Ma'ruza rejasi", body: { bullets: ['Tasnif', 'Toshmalar', 'Tashxis', 'Davolash', 'Profilaktika'] } },
    {
      slide_type: 'content_bullets',
      title: 'Impetigo',
      body: {
        bullets: [
          bullet('Impetigo yuzaki bakterial infeksiya boʻlib, koʻpincha Staphylococcus aureus va Streptococcus pyogenes qoʻzgʻatadi va asosan bolalarda uchraydi.'),
          bullet('Klinik belgisi — asal rangli qobiq bilan qoplangan eroziyalar, koʻpincha ogʻiz va burun atrofida joylashadi.'),
          bullet('Impetigo yuzaki bakterial infeksiya boʻlib, koʻpincha Staphylococcus aureus va Streptococcus pyogenes qoʻzgʻatadi va asosan bolalarda uchraydi.'),
          bullet('Impetigo haqida umumiy tushuncha impetigo kasalligini anglatadi.'),
        ],
      },
      image_query: 'impetigo',
    },
    {
      slide_type: 'content_bullets',
      title: 'Psoriaz',
      body: {
        bullets: [
          bullet('Psoriaz — surunkali immun-vositali kasallik, keratinotsitlar proliferatsiyasi tezlashib, kumushsimon tangachali blyashkalar hosil boʻladi.'),
          bullet('Tirsak, tizza va sochli qism eng koʻp zararlanadigan joylar; Auspitz belgisi tashxisda yordam beradi.'),
        ],
      },
      image_query: 'psoriasis plaque',
    },
    {
      slide_type: 'statistics',
      title: 'Tarqalishi',
      body: { stats: [{ number: '2-3%', label: 'Aholida psoriaz' }, { number: '~70%', label: '30 yoshgacha boshlanishi' }, { number: '10%', label: 'Psoriatik artrit' }] },
      image_query: 'psoriasis epidemiology',
    },
    {
      slide_type: 'comparison_table',
      title: 'Birlamchi va ikkilamchi toshmalar',
      body: {
        comparison_headers: { left: 'Birlamchi toshma', right: 'Ikkilamchi toshma' },
        comparison_rows: [
          { criteria: 'Kelib chiqishi', left: 'Sogʻlom terida', right: 'Birlamchi toshma oʻrnida' },
          { criteria: 'Misol', left: 'Makula, papula, pufakcha', right: 'Qobiq, eroziya, chandiq' },
          { criteria: 'Ahamiyati', left: 'Tashxis asosi', right: 'Kechish bosqichi' },
        ],
      },
      image_query: 'skin lesion morphology',
    },
    {
      slide_type: 'process_flow',
      title: 'Tashxis ketma-ketligi',
      body: {
        process_steps: [
          { step_number: 1, label: 'Anamnez', description: 'Boshlanishi va xavf omillari' },
          { step_number: 2, label: 'Koʻrik', description: 'Toshma morfologiyasi' },
          { step_number: 3, label: 'Dermatoskopiya', description: 'Nozik struktura' },
          { step_number: 4, label: 'Biopsiya', description: 'Shubhali holatlarda' },
        ],
      },
      image_query: 'dermatoscopy',
    },
    {
      slide_type: 'case_study',
      title: 'Klinik holat: 7 yoshli bola',
      body: {
        bullets: [
          bullet('7 yoshli bola ogʻiz atrofidagi asal rangli qobiqlar bilan keldi; harorat normal, umumiy holati qoniqarli.'),
          bullet('Bogʻchada shunday belgilar boʻlgan bola bilan kontakt aniqlandi — yuqumlilikni hisobga olish zarur.'),
        ],
      },
      image_query: 'impetigo child face',
    },
    {
      slide_type: 'content_bullets',
      title: 'Melanoma',
      body: {
        bullets: [
          bullet('Melanoma melanotsitlardan rivojlanadi va erta metastaz berishi bilan xavfli hisoblanadi.'),
          bullet('ABCDE mezoni: assimetriya, chegara notekisligi, rang xilma-xilligi, diametr >6 mm, oʻzgaruvchanlik.'),
        ],
      },
      image_query: 'melanoma ABCDE',
    },
    {
      slide_type: 'content_bullets',
      title: 'Ekzema',
      body: {
        bullets: [
          bullet('Atopik dermatit teri baryeri buzilishi va IgE-vositali sezuvchanlik bilan kechadigan surunkali yalligʻlanish.'),
          bullet('Davolashda emollientlar asos, oʻtkir davrda topik kortikosteroidlar qisqa kurs bilan qoʻllaniladi.'),
        ],
      },
      image_query: 'atopic dermatitis',
    },
    {
      slide_type: 'summary',
      title: 'Xulosa',
      body: {
        bullets: [
          'Tasnif: teri kasalliklari etiologiyaga koʻra guruhlanadi.',
          'Toshma: birlamchi va ikkilamchi elementlarni farqlash tashxis asosi.',
          'Tashxis: anamnez, koʻrik, dermatoskopiya, kerak boʻlsa biopsiya.',
          'Davolash: etiologik va simptomatik yondashuv birga olib boriladi.',
        ],
      },
    },
  ],
};

const t0 = Date.now();
let content = normalizePresentationContent(raw as never, {
  title: raw.presentation_title,
  subject: raw.subject_area,
});
content = dedupePresentationSlides(content);
content = dedupePresentationBullets(content);
console.log('slaydlar:', content.slides.map((s) => s.slide_type).join(', '));

if (withImages) {
  content = await resolvePresentationImages(content);
  const imgs = content.slides.filter((s) => s.imageUrl);
  const uniq = new Set(imgs.map((s) => createHash('md5').update(s.imageUrl || '').digest('hex')));
  console.log(`rasm: ${imgs.length}/${content.slides.length} slaydda, noyob: ${uniq.size}`);
  imgs.forEach((s) => console.log(`  · ${s.title} → ${s.imageCredit}`));
  console.log(`rasm qidiruvi: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const file = await buildPresentationPptxFile(content, {
  meta: { subjectName: raw.subject_area, topicId: 'M1', variantLabel: 'Stom', language: 'uz' },
});
const out = process.env.OUT || '/tmp/smoke-presentation.pptx';
writeFileSync(out, Buffer.from(await file.arrayBuffer()));
console.log(`PPTX: ${out} — ${(file.size / 1024 / 1024).toFixed(2)} MB`);
