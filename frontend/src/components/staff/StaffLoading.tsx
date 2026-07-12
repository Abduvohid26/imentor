import { Loader2 } from 'lucide-react';
import { staffCard, STAFF_HEADING } from './staffUi';

type Props = {
  label: string;
  hint?: string;
};

export default function StaffLoading({ label, hint }: Props) {
  return (
    <div className={`${staffCard} py-16 flex flex-col items-center gap-4`}>
      <Loader2 size={36} className="animate-spin text-[#083047]/70" />
      <p className={`text-[15px] font-semibold ${STAFF_HEADING}`}>{label}</p>
      {hint && <p className="text-[13px] text-black/45 max-w-md text-center px-4">{hint}</p>}
    </div>
  );
}
