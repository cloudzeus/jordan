/** Μόνο https URL προς δημόσιο host — ποτέ localhost/ιδιωτικές διευθύνσεις (SSRF). */
export function safeUrl(v: string | undefined | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'https:') return null;
    const h = u.hostname;
    if (h === 'localhost' || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/.test(h)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
