'use client';

// Ρυθμίσεις → Πληρωμές / Viva: τα URL που επικολλώνται στο dashboard του Viva + δοκιμή σύνδεσης.
import * as React from 'react';
import { FiCheckCircle, FiCopy, FiXCircle, FiZap } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export type VivaUrls = { domain: string; webhook: string; success: string; failure: string; successPath: string; failurePath: string; appUrlMissing: boolean };
type TestResult = { env: string; enabled: boolean; oauth: boolean; basic: boolean; missing: string[]; error: string | null };

function UrlRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-[length:var(--fs-11)] font-semibold text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-[length:var(--fs-12)] text-foreground">{value || '—'}</code>
        <button type="button" disabled={!value} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Αντιγράφηκε'))} className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label={`Αντιγραφή: ${label}`}><FiCopy className="size-3.5" aria-hidden /></button>
      </div>
      {hint && <span className="text-[length:var(--fs-11)] leading-tight text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function VivaPanel({ urls, help }: { urls: VivaUrls; help?: React.ReactNode }) {
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<TestResult | null>(null);
  const test = async () => {
    setBusy(true);
    try { setRes(await (await fetch('/api/admin/settings/viva-test', { method: 'POST' })).json()); } catch { toast.error('Αποτυχία δοκιμής'); } finally { setBusy(false); }
  };
  const ok = res && res.oauth && res.basic;
  return (
    <div className="mt-5 space-y-4 border-t border-border pt-4">
      <div>
        <p className="flex items-center gap-2 text-[length:var(--fs-13)] font-semibold text-foreground">URL για το dashboard του Viva {help}</p>
        <p className="text-[length:var(--fs-11)] leading-tight text-muted-foreground">Ίδια για demo και παραγωγή — καταχωρίζονται ξεχωριστά σε κάθε λογαριασμό Viva. Προκύπτουν από το APP_URL του server.</p>
        {urls.appUrlMissing && <p className="mt-1 text-[length:var(--fs-11)] font-medium text-destructive">Δεν έχει οριστεί APP_URL — τα URL δεν είναι σωστά μέχρι να οριστεί στο .env.</p>}
      </div>
      <UrlRow label="Webhook — Transaction Payment Created (1796)" value={urls.webhook} hint="Settings → API Access → Webhooks → Create: URL, Verify (GET επιστρέφει το κλειδί), Active." />
      <UrlRow label="Webhook — Transaction Failed (1798)" value={urls.webhook} hint="Ίδιο URL, δεύτερο webhook με αυτό τον τύπο." />
      <UrlRow label="Webhook — Transaction Reversal Created (1797)" value={urls.webhook} hint="Ίδιο URL — καταγράφει επιστροφές, και όσες γίνονται από το dashboard του Viva." />
      <div className="grid gap-4 sm:grid-cols-3">
        <UrlRow label="Πηγή πληρωμής — Domain" value={urls.domain} />
        <UrlRow label="Success URL" value={urls.successPath} hint={urls.success} />
        <UrlRow label="Failure URL" value={urls.failurePath} hint={urls.failure} />
      </div>
      <p className="text-[length:var(--fs-11)] leading-tight text-muted-foreground">Sales → Online Payments → Websites/Apps → πηγή: Integration method «Redirection», Domain + τα δύο relative paths. Ο κωδικός της πηγής μπαίνει στο «Source code». Οι μέθοδοι πληρωμής (κάρτες, Apple/Google Pay, IRIS…) ενεργοποιούνται στον λογαριασμό Viva.</p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-[length:var(--fs-13)] font-semibold text-foreground">Δοκιμή σύνδεσης Viva</p>
          <p className="text-[length:var(--fs-11)] leading-tight text-muted-foreground">OAuth token (Client ID/secret) και κλειδί webhook (Merchant ID/API key) με τα ΑΠΟΘΗΚΕΥΜΕΝΑ στοιχεία. Δεν δημιουργεί πληρωμή.</p>
        </div>
        <Button type="button" variant="secondary" onClick={test} disabled={busy}><FiZap /> {busy ? 'Δοκιμή…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
      {res && (
        <div className={`rounded-lg border p-3 text-[length:var(--fs-12)] ${ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
          <div className="flex items-center gap-2 font-semibold">
            {ok ? <FiCheckCircle className="size-4 text-emerald-600" aria-hidden /> : <FiXCircle className="size-4 text-destructive" aria-hidden />}
            <span>{res.env === 'production' ? 'Παραγωγή' : 'Demo'} · OAuth {res.oauth ? '✓' : '✗'} · Merchant/API key {res.basic ? '✓' : '✗'}{res.enabled ? '' : ' · τα αιτήματα πληρωμής είναι ΚΛΕΙΣΤΑ'}</span>
          </div>
          {res.missing.length > 0 && <p className="mt-1 text-muted-foreground">Λείπουν: {res.missing.join(', ')}</p>}
          {res.error && <p className="mt-1 text-destructive">{res.error}</p>}
        </div>
      )}
    </div>
  );
}
