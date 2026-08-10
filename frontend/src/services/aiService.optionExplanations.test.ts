import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `enrichTestSession` har variantga izoh (`optionExplanations`) biriktirishini
 * va bu izohlar tarjimalarga ham yetib borishini tekshiradi — test ekranida
 * "nega to'g'ri / nega xato" aynan shu maydondan chiqadi.
 */

const openaiJson = vi.fn();

vi.mock('./openaiClient', () => ({
  openaiJson: (...args: unknown[]) => openaiJson(...args),
  openaiJsonStream: vi.fn(),
  chatCompletion: vi.fn(),
  assertOpenAiApiKey: vi.fn(),
  OPENAI_CHAT: 'gpt-test',
  OPENAI_FAST: 'gpt-test-fast',
  OPENAI_VISION: 'gpt-test-vision',
}));

// Kitob manbalari backendga so'rov yuboradi — bu testda ahamiyatsiz.
vi.mock('../utils/backendAuth', () => ({
  ensureBackendAccessToken: vi.fn(async () => ''),
  getBackendAccessToken: vi.fn(() => ''),
}));

const { aiService } = await import('./aiService');

const baseSession = () => ({
  topic: 'Pemfigus',
  primaryLanguage: 'uz' as const,
  questions: [
    {
      question: '45 yoshli bemorda intraepidermal akantoliz aniqlandi. Tashxis?',
      options: ['Pemfigus vulgaris', 'Pemfigus foliaceus', 'Dyuring', 'Kontakt dermatit', 'Psoriaz'],
      correctOptionIndex: 0,
      explanation: 'Intraepidermal akantoliz pemfigus vulgarisga xosdir.',
    },
  ],
  references: [],
});

describe('enrichTestSession — variant izohlari', () => {
  beforeEach(() => {
    openaiJson.mockReset();
  });

  it('har variantga izoh qo\'shadi', async () => {
    openaiJson.mockImplementation(async (opts: { model: string }) => {
      if (opts.model === 'gpt-test-fast') {
        return {
          items: [
            {
              id: 0,
              optionExplanations: ['To\'g\'ri', 'Yuzaki akantoliz', 'Subepidermal', 'Allergik', 'Papula'],
            },
          ],
        };
      }
      throw new Error('tarjima bu testda kerak emas');
    });

    const out = await aiService.enrichTestSession(baseSession(), 'uz');
    expect(out.questions[0].optionExplanations).toEqual([
      'To\'g\'ri',
      'Yuzaki akantoliz',
      'Subepidermal',
      'Allergik',
      'Papula',
    ]);
  });

  it('izohlar tarjimadan OLDIN qo\'shiladi — tarjimaga ham tushadi', async () => {
    const translateInputs: string[] = [];
    openaiJson.mockImplementation(async (opts: { model: string; user: string; system: string }) => {
      if (opts.model === 'gpt-test-fast' && opts.system.includes('optionExplanations uzunligi')) {
        return {
          items: [{ id: 0, optionExplanations: ['a', 'b', 'c', 'd', 'e'] }],
        };
      }
      translateInputs.push(opts.user);
      throw new Error('tarjima kerak emas');
    });

    await aiService.enrichTestSession(baseSession(), 'uz');
    expect(translateInputs.length).toBeGreaterThan(0);
    // Tarjimaga yuborilgan manbada izohlar allaqachon bo'lishi shart.
    expect(translateInputs.every((u) => u.includes('optionExplanations'))).toBe(true);
  });

  it('AI kam izoh qaytarsa — kelgani qoladi, qolgani bo\'sh bilan to\'ldiriladi', async () => {
    openaiJson.mockImplementation(async (opts: { model: string }) => {
      if (opts.model === 'gpt-test-fast') {
        return { items: [{ id: 0, optionExplanations: ['faqat bitta'] }] };
      }
      throw new Error('tarjima kerak emas');
    });

    const out = await aiService.enrichTestSession(baseSession(), 'uz');
    expect(out.questions[0].optionExplanations).toEqual(['faqat bitta', '', '', '', '']);
  });

  it('model {items} o\'rniga sof massiv qaytarsa ham qabul qilinadi', async () => {
    openaiJson.mockImplementation(async (opts: { model: string }) => {
      if (opts.model === 'gpt-test-fast') {
        return [{ optionExplanations: ['a', 'b', 'c', 'd', 'e'] }];
      }
      throw new Error('tarjima kerak emas');
    });

    const out = await aiService.enrichTestSession(baseSession(), 'uz');
    expect(out.questions[0].optionExplanations).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('id yo\'q bo\'lsa — bo\'lakdagi tartib bo\'yicha biriktiriladi', async () => {
    openaiJson.mockImplementation(async (opts: { model: string }) => {
      if (opts.model === 'gpt-test-fast') {
        return { questions: [{ optionExplanations: ['x', 'y', 'z', 'w', 'v'] }] };
      }
      throw new Error('tarjima kerak emas');
    });

    const out = await aiService.enrichTestSession(baseSession(), 'uz');
    expect(out.questions[0].optionExplanations).toEqual(['x', 'y', 'z', 'w', 'v']);
  });
});
