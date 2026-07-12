import type { ReactNode } from 'react';
import { PAGE_ROOT } from '../../layout/pageContainer';

type Props = {
  children: ReactNode;
  className?: string;
  /** Test/case kabi uzoq sahifalar uchun */
  spacious?: boolean;
};

export default function StaffPageLayout({ children, className = '', spacious }: Props) {
  return (
    <div
      className={`${PAGE_ROOT} py-4 sm:py-6 ${spacious ? 'pb-20' : 'pb-12'} space-y-5 ${className}`}
    >
      {children}
    </div>
  );
}
