import { describe, expect, it } from 'vitest';
import { dedupePresentationBullets, dedupePresentationSlides } from './presentationQa';
import type { ContentSlide, PresentationContent } from './presentationContentSchema';

function slide(partial: Partial<ContentSlide>): ContentSlide {
  return {
    slide_type: 'content_bullets',
    title: '',
    body: {},
    ...partial,
  };
}

function deck(slides: ContentSlide[]): PresentationContent {
  return { presentation_title: 'T', subject_area: 'S', author: 'A', slides };
}

describe('dedupePresentationSlides', () => {
  it('bir xil slaydni bir marta qoldiradi', () => {
    const s = slide({ title: 'Epidermis', body: { bullets: ['Teri qavati haqida batafsil.'] } });
    const out = dedupePresentationSlides(deck([s, { ...s }, slide({ title: 'Dermis', body: { bullets: ['Boshqa.'] } })]));
    expect(out.slides.map((x) => x.title)).toEqual(['Epidermis', 'Dermis']);
  });

  it('tinish belgisi/registr farqiga qaramay takrorni topadi', () => {
    const a = slide({ title: 'Epidermis', body: { bullets: ['Teri qavati.'] } });
    const b = slide({ title: 'EPIDERMIS!', body: { bullets: ['teri  qavati'] } });
    expect(dedupePresentationSlides(deck([a, b])).slides).toHaveLength(1);
  });

  it('xulosa slaydi bitta va oxirida bo\'ladi', () => {
    const out = dedupePresentationSlides(
      deck([
        slide({ slide_type: 'summary', title: 'Xulosa 1', body: { bullets: ['Birinchi.'] } }),
        slide({ title: 'Asosiy qism', body: { bullets: ['Mazmun.'] } }),
        slide({ slide_type: 'summary', title: 'Xulosa 2', body: { bullets: ['Ikkinchi.'] } }),
      ]),
    );
    expect(out.slides.map((s) => s.title)).toEqual(['Asosiy qism', 'Xulosa 2']);
  });

  it('turli slaydlarga tegmaydi', () => {
    const slides = [
      slide({ slide_type: 'title', title: 'Mavzu' }),
      slide({ title: 'A', body: { bullets: ['Bir.'] } }),
      slide({ title: 'B', body: { bullets: ['Ikki.'] } }),
    ];
    expect(dedupePresentationSlides(deck(slides)).slides).toHaveLength(3);
  });
});

describe('dedupePresentationBullets', () => {
  const deck = (slides: PresentationContent['slides']): PresentationContent => ({
    presentation_title: 'T',
    subject_area: 'S',
    author: 'iMentor',
    slides,
  });

  it('ikki slaydda takrorlangan bulletni ikkinchisidan olib tashlaydi', () => {
    const out = dedupePresentationBullets(
      deck([
        {
          slide_type: 'content_bullets',
          title: 'O‘sma teri kasalliklari',
          body: { bullets: ['Quyoshdan himoyalanish teri o‘smalarining oldini olishda muhimdir.', 'Melanoma erta metastaz beradi va tez tarqaladi.'] },
        },
        {
          slide_type: 'content_bullets',
          title: 'Profilaktika',
          body: { bullets: ['Quyoshdan himoyalanish teri o‘smalarining oldini olishda muhimdir.', 'Gigiyena qoidalari infeksiya tarqalishini kamaytiradi.'] },
        },
      ]),
    );
    expect(out.slides[0].body.bullets).toHaveLength(2);
    expect(out.slides[1].body.bullets).toEqual([
      'Gigiyena qoidalari infeksiya tarqalishini kamaytiradi.',
    ]);
  });

  it('sarlavhani qaytaradigan tavtologik bulletni tashlaydi', () => {
    const out = dedupePresentationBullets(
      deck([
        {
          slide_type: 'content_bullets',
          title: 'Profilaktika choralari',
          body: {
            bullets: [
              'Vaksinatsiya ba’zi infeksion teri kasalliklarining oldini olishda samarali hisoblanadi.',
              'Profilaktika choralari profilaktikaga qaratilgan.',
            ],
          },
        },
      ]),
    );
    expect(out.slides[0].body.bullets).toEqual([
      'Vaksinatsiya ba’zi infeksion teri kasalliklarining oldini olishda samarali hisoblanadi.',
    ]);
  });

  it('hamma bullet tushib qolsa, kamida bittasini qoldiradi', () => {
    const out = dedupePresentationBullets(
      deck([
        { slide_type: 'content_bullets', title: 'Tashxis', body: { bullets: ['Tashxis tashxisdir.'] } },
      ]),
    );
    expect(out.slides[0].body.bullets).toHaveLength(1);
  });
});
