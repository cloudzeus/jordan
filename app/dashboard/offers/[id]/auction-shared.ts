/** Κοινοί τύποι/βοηθητικά της σελίδας «δημοπρασίας» κοινού container (client + server). */

export type Level = { level: number; fromPallets: number };
export type Tier = Level & { price: number };
export type MediaItem = { kind: 'IMAGE' | 'VIDEO' | 'PANORAMA'; url: string; thumb: string | null; title: string | null; mime: string };
export type AuctionItem = {
  id: string; mtrl: number; name: string; code: string; load: 'stones' | 'boxes' | 'sacks'; unit: string; perPallet: number;
  prices: number[]; mine: number;
  /** Για το modal προϊόντος. */
  detail: {
    name2: string | null; category: string | null; group: string | null; unitName: string | null;
    attributes: { name: string; value: string; unit: string | null }[];
    media: MediaItem[];
  };
};
export type Activity = { at: string; pallets: number; product: string | null; dropTo: number | null };

export const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
export const num = (n: number, d = 2) => n.toLocaleString('el-GR', { maximumFractionDigits: d });
export const pal = (n: number) => `${num(n)} ${n === 1 ? 'παλέτα' : 'παλέτες'}`;
export const step = (n: number) => Math.round(n * 2) / 2;
export const tierAt = <T extends Level>(tiers: T[], f: number) => tiers.reduce<T | null>((acc, t) => (f + 1e-9 >= t.fromPallets ? t : acc), tiers[0] ?? null);
export const tiersOf = (levels: Level[], prices: number[]): Tier[] => levels.map((l) => ({ ...l, price: prices[l.level - 1] ?? 0 }));

/** «πριν 3 ώρες» — σχετικός χρόνος στα ελληνικά. */
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat('el', { numeric: 'auto' });
  if (s < 60) return 'μόλις τώρα';
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
