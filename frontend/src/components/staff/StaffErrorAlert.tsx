type Props = {
  message: string;
};

export default function StaffErrorAlert({ message }: Props) {
  return (
    <p className="text-[13px] text-rose-700 font-medium text-center px-4 py-3 rounded-xl bg-rose-50 border border-rose-100">
      {message}
    </p>
  );
}
