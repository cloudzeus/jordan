import 'server-only';
import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';
import { request } from 'node:https';
import { publicHttpsUrl } from './core';

const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(ip, prefix, 'ipv4');
export const isPublicIPv4 = (address: string) => !blocked.check(address, 'ipv4');

/** Pin the validated IPv4 address at connection time; revalidate every redirect. */
export async function fetchPublic(raw: string, kind: 'html' | 'image' | 'document', redirects = 0): Promise<{ buffer: Buffer; mime: string; url: string }> {
  const safe = publicHttpsUrl(raw);
  if (!safe || redirects > 3) throw new Error('Μη αποδεκτή διεύθυνση πηγής.');
  const url = new URL(safe);
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some((a) => !isPublicIPv4(a.address))) throw new Error('Η πηγή δεν είναι δημόσια.');
  const max = kind === 'document' ? 20 * 1024 * 1024 : kind === 'image' ? 10 * 1024 * 1024 : 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      family: 4, agent: false,
      lookup: (_host, _options, cb) => cb(null, addresses[0].address, 4),
      headers: { 'User-Agent': 'Jordan-ProductResearch/1.0', Accept: kind === 'html' ? 'text/html' : kind === 'document' ? 'text/html, application/pdf' : 'image/*', 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(12000),
    }, (res) => {
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.destroy();
        try {
          void fetchPublic(new URL(res.headers.location, url).href, kind, redirects + 1).then(resolve, reject);
        } catch { reject(new Error('Μη αποδεκτή ανακατεύθυνση πηγής.')); }
        return;
      }
      const mime = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (res.statusCode !== 200 || !(kind === 'document' ? ['text/html', 'application/pdf'].includes(mime) : kind === 'html' ? mime === 'text/html' : /^image\/(jpeg|png|webp|avif|gif)$/.test(mime))) {
        res.destroy(); reject(new Error('Η πηγή δεν επέστρεψε προσβάσιμο αρχείο.')); return;
      }
      if (Number(res.headers['content-length']) > max) { res.destroy(); reject(new Error('Το αρχείο είναι πολύ μεγάλο.')); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > max) { res.destroy(new Error('Το αρχείο είναι πολύ μεγάλο.')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), mime, url: url.href }));
    });
    req.on('error', reject);
    req.end();
  });
}

export function pageImage(html: string, pageUrl: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((m) => [m[1].toLowerCase(), m[3]]));
    if (!['og:image', 'og:image:secure_url', 'twitter:image'].includes((attrs.property || attrs.name || '').toLowerCase()) || !attrs.content) continue;
    try {
      const decoded = attrs.content.replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
      const url = publicHttpsUrl(new URL(decoded, pageUrl).href);
      if (url) return url;
    } catch { /* Try the next metadata image. */ }
  }
  return null;
}
