// lib/assistant/markdown.ts — ΚΑΘΑΡΟ. Μικρός, ασφαλής αναλυτής markdown για τις απαντήσεις του Air Jordan.
// Παράγει δομή (όχι HTML) που αποδίδεται με React — κανένα dangerouslySetInnerHTML.
// Υποστηρίζει: παραγράφους, επικεφαλίδες (#…), λίστες (-, *, •, 1.), πίνακες (| a | b |), **έντονα**,
// *πλάγια*, `κώδικα`, [κείμενο](/εσωτερικός-σύνδεσμος ή https://…).

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; v: Inline[] }
  | { t: 'i'; v: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string };

export type Block =
  | { t: 'p'; v: Inline[] }
  | { t: 'h'; v: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

/** Μόνο εσωτερικοί σύνδεσμοι (/admin/…, /wiki/…) ή https — όχι javascript: κ.λπ. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^\/(?!\/)[\w\-/?=&.%#~]*$/.test(h)) return h;
  if (/^https:\/\/[^\s"'<>]+$/i.test(h)) return h;
  return null;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\n]+)\*(?![\w*]))/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[2] != null) out.push({ t: 'b', v: parseInline(m[2]) });
    else if (m[3] != null) out.push({ t: 'code', v: m[3] });
    else if (m[4] != null) {
      const href = safeHref(m[5]);
      out.push(href ? { t: 'link', v: m[4], href } : { t: 'text', v: m[4] });
    } else if (m[6] != null) out.push({ t: 'i', v: parseInline(m[6]) });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => parseInline(c.trim()));

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', v: parseInline(para.join('\n')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { flush(); continue; }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { flush(); blocks.push({ t: 'h', v: parseInline(h[1]) }); continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      flush();
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      const items: Inline[][] = [];
      const itemRe = kind === 'ul' ? /^\s*[-*•]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
      while (i < lines.length) {
        const m = itemRe.exec(lines[i]);
        if (m) { items.push(parseInline(m[1])); i++; continue; }
        // συνέχεια στοιχείου σε εσοχή
        if (/^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].push({ t: 'text', v: ` ${lines[i].trim()}` }); i++; continue; }
        break;
      }
      i--;
      blocks.push(kind === 'ul' ? { t: 'ul', items } : { t: 'ol', items });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
