import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../App', () => import('../../test/testContexts'));

import MobileMinimalLogin from './MobileMinimalLogin';
import { renderWithProviders } from '../../test/renderWithProviders';

const staffLoginMock = vi.fn();
const studentLoginMock = vi.fn();
const tokenMock = vi.fn();
const syncMock = vi.fn();

vi.mock('../../utils/backendAuth', () => ({
  loginStaffWithBackendFallback: (...args: unknown[]) => staffLoginMock(...args),
  loginStudentWithOnlineTest: (...args: unknown[]) => studentLoginMock(...args),
  getBackendAccessToken: () => tokenMock(),
  syncSessionRoleFromServer: () => syncMock(),
}));

describe('MobileMinimalLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffLoginMock.mockResolvedValue({ phoneDigits: '3442112068', role: 'hodim' });
    studentLoginMock.mockResolvedValue(undefined);
    tokenMock.mockResolvedValue('access-token');
    syncMock.mockResolvedValue(undefined);
  });

  it('talaba tab standart bo\'lib ochiladi', () => {
    renderWithProviders(<MobileMinimalLogin onSwitchToRegister={() => {}} />);
    expect(screen.getByPlaceholderText('Talaba ID')).toBeInTheDocument();
    // Ro'yxatdan o'tish talaba uchun ko'rinmaydi.
    expect(screen.queryByRole('button', { name: /Ro'yxatdan o'tish/ })).toBeNull();
  });

  it('talaba ID bilan kiradi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileMinimalLogin />);

    await user.type(screen.getByPlaceholderText('Talaba ID'), '998901110001');
    await user.type(screen.getByPlaceholderText('Parol'), 'Talaba123');
    await user.click(screen.getByRole('button', { name: 'Kirish' }));

    await waitFor(() => {
      expect(studentLoginMock).toHaveBeenCalledWith('998901110001', 'Talaba123');
    });
    expect(staffLoginMock).not.toHaveBeenCalled();
  });

  it('xodim tabida Xodim ID bilan kiradi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileMinimalLogin onSwitchToRegister={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Xodim' }));
    await user.type(screen.getByPlaceholderText(/Xodim ID/), '3442112068');
    await user.type(screen.getByPlaceholderText('Parol'), 'fjsti123');
    await user.click(screen.getByRole('button', { name: 'Kirish' }));

    await waitFor(() => {
      expect(staffLoginMock).toHaveBeenCalledWith('3442112068', 'fjsti123');
    });
    // Ro'yxatdan o'tish faqat xodim tabida.
    expect(screen.getByRole('button', { name: /Ro'yxatdan o'tish/ })).toBeInTheDocument();
  });

  it('juda qisqa xodim login uchun xato ko\'rsatadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileMinimalLogin />);

    await user.click(screen.getByRole('button', { name: 'Xodim' }));
    await user.type(screen.getByPlaceholderText(/Xodim ID/), '123');
    await user.type(screen.getByPlaceholderText('Parol'), 'fjsti123');
    await user.click(screen.getByRole('button', { name: 'Kirish' }));

    expect(
      screen.getByText("Telefon raqamini to'liq kiriting yoki Xodim ID ni yozing."),
    ).toBeInTheDocument();
    expect(staffLoginMock).not.toHaveBeenCalled();
  });
});
