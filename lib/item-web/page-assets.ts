import sanitizeHtml from 'sanitize-html';
import { publicHttpsUrl } from './core';

export function decodeHtml(s: string) {
  return s.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '');
}
function attrs(tag: string) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((m) => [m[1].toLowerCase(), decodeHtml(m[3])]));
}
export function pageAssets(html: string, pageUrl: string) {
  const images = new Set<string>();
  const documents = new Map<string, string>();
  const urlOf = (raw: string) => {
    try { const url = new URL(decodeHtml(raw), pageUrl); if (url.protocol === 'http:') url.protocol = 'https:'; return publicHttpsUrl(url.href); } catch { return null; }
  };
  const addImage = (value: unknown) => {
    if (typeof value !== 'string') return;
    const url = urlOf(value);
    if (url) images.add(url);
  };
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    if (['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes((a.property || a.name || '').toLowerCase())) addImage(a.content);
  }
  // Product structured data contains actual product images, not decorative site graphics.
  const visit = (node: unknown, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 10) return;
    if (Array.isArray(node)) { node.forEach((v) => visit(v, depth + 1)); return; }
    const o = node as Record<string, unknown>;
    if ([o['@type']].flat().includes('Product')) {
      for (const image of [o.image].flat()) {
        if (typeof image === 'object' && image) addImage((image as Record<string, unknown>).url ?? (image as Record<string, unknown>).contentUrl);
        else addImage(image);
      }
    }
    Object.values(o).forEach((v) => { if (typeof v === 'object') visit(v, depth + 1); });
  };
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Optional malformed metadata. */ }
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    const src = a['data-src'] || a.src || '';
    if (!/product|thumbnail-image/i.test(`${a.class || ''} ${src}`) || /placeholder|logo|icon|banner/i.test(src)) continue;
    const set = a['data-srcset'] || a.srcset;
    addImage(set ? set.split(',').at(-1)?.trim().split(/\s+/)[0] : src);
  }
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrs(match[1]);
    if (!a.href) continue;
    const url = urlOf(a.href);
    if (url && /\.pdf(?:[?#]|$)/i.test(url)) documents.set(url, decodeHtml(sanitizeHtml(match[2], { allowedTags: [], allowedAttributes: {} })).trim().slice(0, 200) || 'Τεχνικό PDF');
  }
  const withoutNoise = html.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<br\s*\/?\s*>/gi, '\n');
  const text = decodeHtml(sanitizeHtml(withoutNoise, { allowedTags: [], allowedAttributes: {} })).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim().slice(0, 100_000);
  const title = decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || new URL(pageUrl).hostname).trim().slice(0, 200);
  return { images: [...images].slice(0, 12), documents: [...documents].slice(0, 12).map(([url, title]) => ({ url, title })), text, title };
}
