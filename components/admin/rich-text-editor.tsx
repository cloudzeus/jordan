'use client';

// Μικρός editor μορφοποιημένου κειμένου (Tiptap): έντονα, πλάγια, υπογράμμιση, λίστες, παράθεση, σύνδεσμος.
// Δίνει HTML + απλό κείμενο· ο server ξανακαθαρίζει το HTML (lib/messages.ts → cleanMessageHtml).
// Ο «Βοηθός κειμένου» (🎤 υπαγόρευση, ✨ AI μορφοποίηση) κουμπώνει μόνος του μόνο σε <textarea>· εδώ
// είναι μέσα στη γραμμή εργαλείων, με τα ίδια endpoints, όταν ο χρήστης έχει τον βοηθό (data-text-assist-layer).
import * as React from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { FiBold, FiItalic, FiUnderline, FiList, FiLink, FiCornerUpLeft, FiCornerUpRight } from 'react-icons/fi';
import { LuListOrdered, LuQuote, LuHeading } from 'react-icons/lu';
import { Loader2, Mic, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useVoiceInput } from '@/components/assistant/use-voice-input';
import { cn } from '@/lib/utils';

export type RichValue = { html: string; text: string };

export function RichTextEditor({ id, onChange, placeholder, ariaLabel, className }: {
  id?: string; onChange: (v: RichValue) => void; placeholder?: string; ariaLabel?: string; className?: string;
}) {
  const changeRef = React.useRef(onChange);
  React.useEffect(() => { changeRef.current = onChange; }, [onChange]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [3] }, codeBlock: false, horizontalRule: false, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: 'textbox', 'aria-multiline': 'true', 'aria-label': ariaLabel ?? 'Κείμενο',
        class: 'rte-content min-h-28 max-h-80 overflow-y-auto px-2.5 py-2 text-(length:--fs-12) leading-relaxed outline-hidden',
      },
    },
    onUpdate: ({ editor: e }) => changeRef.current({ html: e.isEmpty ? '' : e.getHTML(), text: e.getText({ blockSeparator: '\n' }).trim() }),
  });

  return (
    <div className={cn('rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring', className)}>
      {editor && <Toolbar editor={editor} label={ariaLabel} />}
      <EditorContent editor={editor} />
    </div>
  );
}

const escHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Απλό κείμενο (από υπαγόρευση/AI) → παράγραφοι· γραμμές «- …» γίνονται λίστα. */
function textToHtml(t: string): string {
  return t.trim().split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li><p>${escHtml(l.replace(/^\s*[-•*]\s+/, ''))}</p></li>`).join('')}</ul>`;
    return `<p>${lines.map(escHtml).join('<br>')}</p>`;
  }).join('');
}

function useAssistAvailable() {
  const [on, setOn] = React.useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- το στρώμα του βοηθού υπάρχει μόνο στον browser
  React.useEffect(() => { setOn(document.documentElement.dataset.textAssistLayer === '1'); }, []);
  return on;
}

function Toolbar({ editor, label }: { editor: Editor; label?: string }) {
  const assist = useAssistAvailable();
  const range = React.useRef<{ from: number; to: number } | null>(null);
  const [formatting, setFormatting] = React.useState(false);
  const voice = useVoiceInput({
    endpoint: '/api/admin/text-assist/transcribe',
    onText: (text) => {
      const at = range.current ?? { from: editor.state.selection.from, to: editor.state.selection.to };
      range.current = null;
      if (editor.isDestroyed) { toast.error('Το πεδίο έκλεισε πριν ολοκληρωθεί η μεταγραφή'); return; }
      const before = editor.state.doc.textBetween(Math.max(0, at.from - 1), at.from);
      editor.chain().focus().insertContentAt(at, `${before && !/\s/.test(before) ? ' ' : ''}${text}`).run();
    },
    onError: (m) => toast.error(m),
  });
  const mic = () => {
    if (voice.state === 'recording') { voice.stop(); return; }
    range.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    void voice.start();
  };
  const format = async () => {
    const { from, to, empty } = editor.state.selection;
    const full = editor.getText({ blockSeparator: '\n\n' });
    const partial = !empty && editor.state.doc.textBetween(from, to, '\n').trim().length > 0;
    const text = partial ? editor.state.doc.textBetween(from, to, '\n') : full;
    if (!text.trim()) { toast.info('Γράψτε ή υπαγορεύστε πρώτα κείμενο'); return; }
    setFormatting(true);
    try {
      const dom = editor.view.dom as HTMLElement;
      const res = await fetch('/api/admin/text-assist/format', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, surrounding: partial ? full.slice(0, 2000) : undefined,
          field: {
            label: label || undefined, path: window.location.pathname,
            page: document.querySelector('main h1')?.textContent?.trim() || document.title || undefined,
            section: dom.closest('[role=dialog]')?.querySelector('h2')?.textContent?.trim() || undefined,
            hint: dom.closest('[data-ai-context]')?.getAttribute('data-ai-context') || undefined,
            siblings: [],
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? 'Η AI μορφοποίηση απέτυχε');
      const out = String(j.text ?? '').trim();
      if (!out) throw new Error('Το AI δεν επέστρεψε κείμενο');
      if (out === text.trim()) { toast.success('Το κείμενο είναι ήδη σωστό'); return; }
      // Μία συναλλαγή → το Ctrl+Z / «Αναίρεση» φέρνει πίσω το αρχικό.
      if (partial) editor.chain().focus().insertContentAt({ from, to }, out).run();
      else editor.chain().focus().setContent(textToHtml(out), { emitUpdate: true }).run();
      toast.success('Μορφοποιήθηκε — «Αναίρεση» για το αρχικό');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setFormatting(false);
    }
  };
  const recording = voice.state === 'recording';
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), h: e.isActive('heading'),
      ul: e.isActive('bulletList'), ol: e.isActive('orderedList'), quote: e.isActive('blockquote'), link: e.isActive('link'),
      undo: e.can().undo(), redo: e.can().redo(),
    }),
  });
  const link = () => {
    if (s.link) { editor.chain().focus().unsetLink().run(); return; }
    const url = window.prompt('Σύνδεσμος (https://…)', 'https://');
    if (url && url !== 'https://') editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  const sep = <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />;
  return (
    <div role="toolbar" aria-label="Μορφοποίηση" className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-0.5">
      <B on={() => editor.chain().focus().toggleBold().run()} label="Έντονα" active={s.bold}><FiBold className="size-3.5" /></B>
      <B on={() => editor.chain().focus().toggleItalic().run()} label="Πλάγια" active={s.italic}><FiItalic className="size-3.5" /></B>
      <B on={() => editor.chain().focus().toggleUnderline().run()} label="Υπογράμμιση" active={s.underline}><FiUnderline className="size-3.5" /></B>
      {sep}
      <B on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="Επικεφαλίδα" active={s.h}><LuHeading className="size-3.5" /></B>
      <B on={() => editor.chain().focus().toggleBulletList().run()} label="Λίστα" active={s.ul}><FiList className="size-3.5" /></B>
      <B on={() => editor.chain().focus().toggleOrderedList().run()} label="Αριθμημένη λίστα" active={s.ol}><LuListOrdered className="size-3.5" /></B>
      <B on={() => editor.chain().focus().toggleBlockquote().run()} label="Παράθεση" active={s.quote}><LuQuote className="size-3.5" /></B>
      <B on={link} label={s.link ? 'Αφαίρεση συνδέσμου' : 'Σύνδεσμος'} active={s.link}><FiLink className="size-3.5" /></B>
      {sep}
      <B on={() => editor.chain().focus().undo().run()} label="Αναίρεση" disabled={!s.undo}><FiCornerUpLeft className="size-3.5" /></B>
      <B on={() => editor.chain().focus().redo().run()} label="Επανάληψη" disabled={!s.redo}><FiCornerUpRight className="size-3.5" /></B>
      {assist && voice.supported && (
        <span className="ml-auto flex items-center gap-0.5">
          <B on={mic} label={recording ? 'Τέλος υπαγόρευσης' : 'Υπαγόρευση'} active={recording} disabled={voice.state === 'transcribing' || formatting}>
            {voice.state === 'transcribing' ? <Loader2 className="size-3.5 animate-spin" /> : recording ? <Square className="size-3 fill-current text-destructive" /> : <Mic className="size-3.5" />}
            {recording && <span className="ml-0.5 text-(length:--fs-11) tabular-nums text-destructive">{voice.seconds}s</span>}
          </B>
          <B on={() => void format()} label="AI μορφοποίηση (όλο ή την επιλογή)" disabled={formatting || voice.state !== 'idle'}>
            {formatting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-violet-600" />}
          </B>
        </span>
      )}
    </div>
  );
}

function B({ on, label, active, disabled, children }: { on: () => void; label: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={on} disabled={disabled} aria-label={label} title={label} aria-pressed={active}
      className={cn('inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-muted text-foreground')}>
      {children}
    </button>
  );
}
