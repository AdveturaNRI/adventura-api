export function computeCostPer(
  spend: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  const s = Number(spend ?? 0);
  if (!Number.isFinite(s) || s <= 0) return null;
  const d = Number(denominator ?? 0);
  if (!Number.isFinite(d) || d <= 0) return null;
  return Number((s / d).toFixed(4));
}

