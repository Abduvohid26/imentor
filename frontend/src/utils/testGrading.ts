/** Foiz asosida 1–5 lik baho (O'zbekiston o'quv tizimi). */
export function scoreToGrade(score: number, total: number): number {
  if (total <= 0) return 1;
  const pct = (score / total) * 100;
  if (pct >= 86) return 5;
  if (pct >= 71) return 4;
  if (pct >= 56) return 3;
  if (pct >= 41) return 2;
  return 1;
}

export function gradeBadgeClass(grade: number): string {
  switch (grade) {
    case 5:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 4:
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 3:
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 2:
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-rose-100 text-rose-800 border-rose-200';
  }
}
