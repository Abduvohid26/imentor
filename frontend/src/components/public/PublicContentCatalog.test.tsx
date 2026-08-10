import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PublicCatalogItemSummary } from '../../utils/publicContentCatalogApi';

const fetchAllMock = vi.fn();

vi.mock('../../utils/publicContentCatalogApi', () => ({
  fetchAllPublicCatalogItems: (...args: unknown[]) => fetchAllMock(...args),
  fetchPublicCatalogItemDetail: vi.fn(),
}));

// aiService faqat tip uchun kerak — uning pdf.js worker'i jsdom'da ishlamaydi.
vi.mock('../../services/aiService', () => ({ aiService: {} }));
vi.mock('../../utils/buildCasePdf', () => ({
  downloadCaseAnswerKeyPdf: vi.fn(),
  downloadCaseScenariosPdf: vi.fn(),
}));
vi.mock('../../utils/buildTestPdf', () => ({
  downloadTestAnswerKeyPdf: vi.fn(),
  downloadTestQuestionsPdf: vi.fn(),
}));

const { default: PublicContentCatalog } = await import('./PublicContentCatalog');
const { renderWithProviders } = await import('../../test/renderWithProviders');

function item(over: Partial<PublicCatalogItemSummary> & { id: number }): PublicCatalogItemSummary {
  return {
    kind: 'test',
    topic: 'Mavzu',
    topic_norm: 'mavzu',
    subject_name: 'Anatomiya',
    subject_code: 'fiziologiya__anatomiya',
    department_name: 'Fiziologiya kafedrasi',
    department_code: 'fiziologiya',
    variant_label: 'PI',
    topic_code: 'm1',
    syllabus_id: 1,
    author_display_name: 'Ahmedov A.',
    owner_key: 'a',
    created_at: '2026-01-01T00:00:00Z',
    question_count: 10,
    is_published: true,
    publish_at: '2026-01-01T00:00:00Z',
    ...over,
  } as PublicCatalogItemSummary;
}

const departmentGroup = () => screen.getByRole('group', { name: 'Kafedra' });
const subjectGroup = () => screen.getByRole('group', { name: 'Fan' });

const ROWS: PublicCatalogItemSummary[] = [
  item({ id: 1, topic: 'Yurak anatomiyasi' }),
  item({ id: 2, topic: 'Nerv tizimi', kind: 'case' }),
  item({
    id: 3,
    topic: 'Pemfigus vulgaris',
    subject_name: 'Dermatoveneralogiya',
    subject_code: 'derma__derma',
    department_name: 'Dermatologiya kafedrasi',
    department_code: 'derma',
  }),
];

describe('Ochiq baza — kafedra/fan filtrlari', () => {
  beforeEach(() => {
    fetchAllMock.mockReset();
    fetchAllMock.mockResolvedValue(ROWS);
  });

  it('barcha materiallarni ko\'rsatadi va kafedra tugmalarini sanoq bilan chiqaradi', async () => {
    renderWithProviders(<PublicContentCatalog language="uz" />);

    expect(await screen.findByText('3 ta material')).toBeTruthy();
    const depts = departmentGroup();
    expect(within(depts).getByRole('button', { name: /Fiziologiya kafedrasi/ })).toBeTruthy();
    expect(within(depts).getByRole('button', { name: /Dermatologiya kafedrasi/ })).toBeTruthy();
  });

  it('kafedra tanlansa faqat o\'sha kafedra materiallari qoladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PublicContentCatalog language="uz" />);
    await screen.findByText('3 ta material');

    await user.click(within(departmentGroup()).getByRole('button', { name: /Dermatologiya kafedrasi/ }));

    await waitFor(() => expect(screen.getByText('1 ta material')).toBeTruthy());
    expect(screen.queryByText('Yurak anatomiyasi')).toBeNull();
    expect(screen.getByText('Pemfigus vulgaris')).toBeTruthy();
  });

  it('tur (keys/test) filtri kafedra sanoqlarini ham yangilaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PublicContentCatalog language="uz" />);
    await screen.findByText('3 ta material');

    await user.click(screen.getByRole('button', { name: 'Keys savollar' }));

    await waitFor(() => expect(screen.getByText('1 ta material')).toBeTruthy());
    // Keys faqat Fiziologiyada bor — Dermatologiya tugmasi umuman chiqmasligi kerak.
    expect(within(departmentGroup()).queryByRole('button', { name: /Dermatologiya kafedrasi/ })).toBeNull();
  });

  it('qidiruv mavzu bo\'yicha filtrlaydi va tozalash tugmasi holatni qaytaradi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PublicContentCatalog language="uz" />);
    await screen.findByText('3 ta material');

    await user.type(screen.getByLabelText('Qidiruv'), 'pemfigus');
    await waitFor(() => expect(screen.getByText('1 ta material')).toBeTruthy());

    await user.click(screen.getAllByRole('button', { name: /Filtrlarni tozalash/ })[0]);
    await waitFor(() => expect(screen.getByText('3 ta material')).toBeTruthy());
  });

  it('mos material topilmasa — "yo\'q" emas, tushunarli xabar va chiqish yo\'li beradi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PublicContentCatalog language="uz" />);
    await screen.findByText('3 ta material');

    await user.type(screen.getByLabelText('Qidiruv'), 'bunday mavzu yoq');

    await waitFor(() =>
      expect(screen.getByText('Tanlangan filtrga mos material topilmadi.')).toBeTruthy(),
    );
    expect(screen.queryByText(/Hozircha bazada materiallar yo'q/)).toBeNull();
  });

  it('kafedra almashsa, boshqa kafedraning tanlangan fani tushib qoladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PublicContentCatalog language="uz" />);
    await screen.findByText('3 ta material');

    await user.click(within(subjectGroup()).getByRole('button', { name: /^Anatomiya/ }));
    await waitFor(() => expect(screen.getByText('2 ta material')).toBeTruthy());

    await user.click(within(departmentGroup()).getByRole('button', { name: /Dermatologiya kafedrasi/ }));
    await waitFor(() => expect(screen.getByText('1 ta material')).toBeTruthy());
    expect(screen.getByText('Pemfigus vulgaris')).toBeTruthy();
  });
});
