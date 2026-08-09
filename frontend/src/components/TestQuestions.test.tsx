import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

vi.mock('../App', () => import('../test/testContexts'));

import TestQuestions from './TestQuestions';
import { renderWithProviders } from '../test/renderWithProviders';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const fetchSessionMock = vi.fn();
const upsertDraftMock = vi.fn();

vi.mock('../utils/liveTestApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/liveTestApi')>();
  return {
    ...actual,
    fetchLiveTestSessionFromServer: (...args: unknown[]) => fetchSessionMock(...args),
    upsertLiveTestDraftOnServer: (...args: unknown[]) => upsertDraftMock(...args),
    submitLiveTestOnServer: vi.fn(),
    syncLiveTestSessionToServer: vi.fn(),
    fetchLiveTestSubmissionsFromServer: vi.fn(),
    finalizeLiveTestSessionOnServer: vi.fn(),
    createLiveTestSessionOnServer: vi.fn(),
    getLiveTestParticipantKey: () => 'participant-test-key',
  };
});

// Talaba rejimi endi login talab qiladi — testda allaqachon kirgan talaba
// sessiyasini taqlid qilamiz, aks holda test faqat login formasini ko'radi.
vi.mock('../utils/localStaffAuth', () => ({
  getCurrentLocalUser: () => ({ uid: 'stu_1', role: 'student', displayName: 'Talaba Test' }),
  normalizeUserRole: (u: { role?: string } | null) => u?.role || 'hodim',
}));

vi.mock('../services/aiService', () => ({
  aiService: {
    generateTestQuestions: vi.fn(),
  },
}));

describe('TestQuestions student mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    upsertDraftMock.mockResolvedValue(undefined);
    window.history.pushState({}, '', '/?mode=student&sid=sess_demo');
  });

  it('loads student test without exposing answer keys', async () => {
    fetchSessionMock.mockResolvedValue({
      topic: 'Anatomiya testi',
      createdAt: Date.now(),
      isClosed: false,
      questions: [
        {
          question: 'Qaysi organ?',
          options: ['A', 'B', 'C'],
        },
      ],
    });

    renderWithProviders(<TestQuestions />);

    expect(await screen.findByText('Talaba testi')).toBeInTheDocument();
    expect(await screen.findByText('Anatomiya testi')).toBeInTheDocument();
    expect(screen.getByText(/Qaysi organ\?/)).toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
    expect(fetchSessionMock).toHaveBeenCalledWith('sess_demo');
  });

  it('shows not-found error when session is missing', async () => {
    window.history.pushState({}, '', '/?mode=student&sid=sess_missing');
    fetchSessionMock.mockResolvedValue(null);

    renderWithProviders(<TestQuestions />);

    expect(
      await screen.findByText(/Test sessiyasi topilmadi/i),
    ).toBeInTheDocument();
  });

  it('shows closed session state', async () => {
    window.history.pushState({}, '', '/?mode=student&sid=sess_closed');
    fetchSessionMock.mockResolvedValue({
      topic: 'Yopilgan test',
      createdAt: Date.now(),
      isClosed: true,
      questions: [],
    });

    renderWithProviders(<TestQuestions />);

    expect(
      await screen.findByText(/O'qituvchi natijalarni ko'rdi/i),
    ).toBeInTheDocument();
  });
});
