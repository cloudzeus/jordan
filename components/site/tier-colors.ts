/** Χρώμα κλιμακίου τιμής: ζεστό (ακριβό) → πράσινο (φθηνότερο). Όλα ≥ 4.5:1 σε λευκό για τις ετικέτες. */
const TIER_COLORS = ['#B4471B', '#B45309', '#8A6A00', '#4D7C0F', '#15803D', '#0F766E'];

export function tierColor(i: number, n: number) {
  if (n <= 1) return TIER_COLORS[0];
  const k = Math.round((i / (n - 1)) * (TIER_COLORS.length - 1));
  return TIER_COLORS[Math.min(TIER_COLORS.length - 1, k)];
}
