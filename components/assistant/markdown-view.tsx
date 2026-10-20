import * as React from 'react';
import Link from 'next/link';
import { parseMarkdown, type Inline } from '@/lib/assistant/markdown';

function Inl({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text': return <React.Fragment key={i}>{n.v}</React.Fragment>;
          case 'b': return <strong key={i} className="font-semibold text-foreground"><Inl nodes={n.v} /></strong>;
          case 'i': return <em key={i}><Inl nodes={n.v} /></em>;
          case 'code': return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-(length:--fs-12)">{n.v}</code>;
          case 'link': return n.href.startsWith('/')
            ? <Link key={i} href={n.href} className="text-primary underline underline-offset-2">{n.v}</Link>
            : <a key={i} href={n.href} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">{n.v}</a>;
        }
      })}
    </>
  );
}

/** Απάντηση του Air Jordan (markdown → React, χωρίς raw HTML). */
export function MarkdownView({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="space-y-2 text-(length:--fs-14) leading-relaxed text-foreground/90 wrap-anywhere">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p': return <p key={i} className="whitespace-pre-line"><Inl nodes={b.v} /></p>;
          case 'h': return <p key={i} className="font-semibold text-foreground"><Inl nodes={b.v} /></p>;
          case 'ul': return <ul key={i} className="ml-4 list-disc space-y-1 marker:text-primary/60">{b.items.map((it, j) => <li key={j}><Inl nodes={it} /></li>)}</ul>;
          case 'ol': return <ol key={i} className="ml-5 list-decimal space-y-1 marker:text-muted-foreground">{b.items.map((it, j) => <li key={j}><Inl nodes={it} /></li>)}</ol>;
          case 'table': return (
            <div key={i} className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-(length:--fs-12-5)">
                <thead><tr>{b.head.map((c, j) => <th key={j} className="border-b border-border px-2 py-1 text-left font-semibold text-muted-foreground"><Inl nodes={c} /></th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j} className="border-b border-border/60 last:border-0">{r.map((c, k) => <td key={k} className="px-2 py-1 align-top tabular-nums"><Inl nodes={c} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
      })}
    </div>
  );
}
