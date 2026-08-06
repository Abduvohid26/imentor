import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../App', () => import('../../test/testContexts'));

import LoginPage from './LoginPage';
import { renderWithProviders } from '../../test/renderWithProviders';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('../../utils/deviceDetection', () => ({
  isDesktopBrowser: () => false,
}));

vi.mock('../../utils/localStaffAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/localStaffAuth')>();
  return {
    ...actual,
    ensureDefaultRoleDemosExist: vi.fn(),
    getDemoRoleLogins: () => [],
    isDemoAuthEnabled: () => false,
  };
});

const loginMock = vi.fn();
const tokenMock = vi.fn();
const syncMock = vi.fn();

vi.mock('../../utils/backendAuth', () => ({
  loginStaffWithBackendFallback: (...args: unknown[]) => loginMock(...args),
  getBackendAccessToken: () => tokenMock(),
  syncSessionRoleFromServer: () => syncMock(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    loginMock.mockResolvedValue({ phoneDigits: '998901112233', role: 'hodim' });
    tokenMock.mockResolvedValue('access-token');
    syncMock.mockResolvedValue(undefined);
  });

  async function switchToStaffLogin(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Xodim' }));
  }

  it('shows phone validation error for incomplete number', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage onSwitchToRegister={() => {}} />);
    await switchToStaffLogin(user);

    await user.type(screen.getByPlaceholderText('+998 90 123 45 67'), '123');
    await user.click(screen.getByRole('button', { name: 'Kirish' }));

    expect(
      screen.getByText("Telefon raqamini to'liq kiriting (masalan: +998 90 111 22 33)."),
    ).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('submits valid credentials and syncs session role', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage onSwitchToRegister={() => {}} />);
    await switchToStaffLogin(user);

    await user.type(screen.getByPlaceholderText('+998 90 123 45 67'), '+998 90 111 22 33');
    await user.type(screen.getByPlaceholderText(/parol/i), 'StrongPass123');
    await user.click(screen.getByRole('button', { name: 'Kirish' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('+998 90 111 22 33', 'StrongPass123');
    });
    expect(tokenMock).toHaveBeenCalled();
    expect(syncMock).toHaveBeenCalled();
  });

  it('shows wrong-credentials message on auth failure', async () => {
    loginMock.mockRejectedValue(new Error('wrong-password'));
    const user = userEvent.setup();
    renderWithProviders(<LoginPage onSwitchToRegister={() => {}} />);
    await switchToStaffLogin(user);

    await user.type(screen.getByPlaceholderText('+998 90 123 45 67'), '+998 90 111 22 33');
    await user.type(screen.getByPlaceholderText(/parol/i), 'bad');
    await user.click(screen.getByRole('button', { name: 'Kirish' }));

    expect(await screen.findByText(/Telefon yoki parol noto'g'ri/i)).toBeInTheDocument();
  });
});
