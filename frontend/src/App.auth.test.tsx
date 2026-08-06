import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { getCurrentLocalUserMock, subscribeLocalAuthMock, isPublicStudentTestUrlMock } = vi.hoisted(() => ({
  getCurrentLocalUserMock: vi.fn(),
  subscribeLocalAuthMock: vi.fn(),
  isPublicStudentTestUrlMock: vi.fn(() => false),
}));

vi.mock('motion/react', () => ({
  motion: {
    aside: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <aside {...props}>{children}</aside>
    ),
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('./hooks/useDeviceProfile', () => ({
  useDeviceProfile: () => ({ isMobile: false }),
}));

vi.mock('./hooks/useStaffLocationTracking', () => ({
  useStaffLocationTracking: () => undefined,
}));

vi.mock('./utils/liveTestApi', () => ({
  isPublicStudentTestUrl: () => isPublicStudentTestUrlMock(),
}));

vi.mock('./utils/deviceDetection', () => ({
  isDesktopBrowser: () => true,
}));

vi.mock('./utils/deviceSession', () => ({
  clearDesktopPairedSession: vi.fn(),
  isDesktopPairedSession: () => true,
  shouldHodimUseMobileCompanion: () => false,
}));

vi.mock('./utils/localStaffAuth', () => ({
  getCurrentLocalUser: () => getCurrentLocalUserMock(),
  subscribeLocalAuth: (cb: () => void) => {
    subscribeLocalAuthMock(cb);
    return () => {};
  },
  logoutLocalStaff: vi.fn(),
  touchCurrentUserActivityIfNeeded: vi.fn(),
  normalizeUserRole: (user: { role?: string }) => user?.role || 'hodim',
}));

vi.mock('./utils/backendAuth', () => ({
  clearBackendAuthTokens: vi.fn(),
  getBackendAccessToken: vi.fn().mockResolvedValue(null),
  setUnauthorizedHandler: vi.fn(),
  syncSessionRoleFromServer: vi.fn(),
  syncStaffPhotoFromServer: vi.fn(),
}));

vi.mock('./components/public/PublicLandingPage', () => ({
  default: () => <div data-testid="public-landing">PUBLIC_LANDING</div>,
}));

vi.mock('./components/TestQuestions', () => ({
  default: () => <div data-testid="student-test">STUDENT_TEST</div>,
}));

vi.mock('./components/auth/DesktopHodimQrLogin', () => ({
  default: () => <div data-testid="desktop-qr-login">DESKTOP_QR</div>,
}));

vi.mock('./components/staff/HodimMobileCompanion', () => ({
  default: () => <div data-testid="hodim-mobile">HODIM_MOBILE</div>,
}));

vi.mock('./components/SyllabusView', () => ({
  default: () => <div data-testid="syllabus-view">SYLLABUS</div>,
}));

vi.mock('./components/PresentationBuilder', () => ({ default: () => null }));
vi.mock('./components/CaseStudies', () => ({ default: () => null }));
vi.mock('./components/UserProfile', () => ({ default: () => null }));
vi.mock('./components/LectureNotes', () => ({ default: () => null }));
vi.mock('./components/admin/AdminDashboardHome', () => ({ default: () => null }));
vi.mock('./components/admin/AdminStaffManagement', () => ({ default: () => null }));
vi.mock('./components/admin/AdminCasesLibrary', () => ({ default: () => null }));
vi.mock('./components/admin/AdminTestsLibrary', () => ({ default: () => null }));
vi.mock('./components/admin/AdminStaffLocationConsole', () => ({ default: () => null }));
vi.mock('./components/admin/AdminCampusBuildingsPage', () => ({ default: () => null }));
vi.mock('./components/admin/AdminSyllabusCatalog', () => ({ default: () => null }));
vi.mock('./components/staff/HodimGpsPromptBar', () => ({ default: () => null }));

import App from './App';

describe('App auth shell', () => {
  beforeEach(() => {
    getCurrentLocalUserMock.mockReset();
    subscribeLocalAuthMock.mockReset();
    isPublicStudentTestUrlMock.mockReturnValue(false);
    window.history.pushState({}, '', '/');
  });

  it('renders public landing when user is not signed in', () => {
    getCurrentLocalUserMock.mockReturnValue(null);
    render(<App />);
    expect(screen.getByTestId('public-landing')).toBeInTheDocument();
  });

  it('renders main syllabus shell for signed-in hodim', () => {
    getCurrentLocalUserMock.mockReturnValue({
      uid: 'u1',
      displayName: 'Hodim',
      firstName: 'Hodim',
      lastName: 'User',
      phoneDisplay: '+998 90 111 22 33',
      phoneDigits: '998901112233',
      faculty: '',
      department: '',
      direction: '',
      email: '998901112233@imentor.local',
      password: '',
      role: 'hodim',
      createdAt: Date.now(),
    });

    render(<App />);
    expect(screen.getByTestId('syllabus-view')).toBeInTheDocument();
    expect(screen.queryByTestId('public-landing')).not.toBeInTheDocument();
  });

  it('renders student test fullscreen when mode=student is in URL', () => {
    isPublicStudentTestUrlMock.mockReturnValue(true);

    getCurrentLocalUserMock.mockReturnValue({
      uid: 'u2',
      role: 'hodim',
      phoneDigits: '998901112233',
    });

    render(<App />);
    expect(screen.getByTestId('student-test')).toBeInTheDocument();
    expect(screen.queryByTestId('syllabus-view')).not.toBeInTheDocument();

    isPublicStudentTestUrlMock.mockReturnValue(false);
  });
});
