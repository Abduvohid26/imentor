import type { ReactNode } from 'react';
import { staffCard, staffCardLg } from './staffUi';

type Props = {
  children: ReactNode;
  className?: string;
  large?: boolean;
};

export default function StaffPanel({ children, className = '', large }: Props) {
  const base = large ? staffCardLg : staffCard;
  return <div className={`${base} ${className}`}>{children}</div>;
}
