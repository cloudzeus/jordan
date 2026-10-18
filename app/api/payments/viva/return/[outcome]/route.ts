import { NextResponse } from 'next/server';
import { handleReturn } from '@/lib/viva-payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Επιστροφή από το Smart Checkout — τα URL της πηγής πληρωμής στο Viva:
 *   Success: /api/payments/viva/return/success   ·   Failure: /api/payments/viva/return/failure
 * Το Viva προσθέτει ?t=<TransactionId>&s=<OrderCode>&lang=…. Η κατάσταση ΔΕΝ εμπιστεύεται το URL:
 * η συναλλαγή διαβάζεται από το API (όπως στο webhook) και μετά ο χρήστης πάει στη σελίδα του συνδέσμου.
 */
export async function GET(req: Request, ctx: { params: Promise<{ outcome: string }> }) {
  const { outcome } = await ctx.params;
  const url = new URL(req.url);
  const r = await handleReturn(url.searchParams.get('t'), url.searchParams.get('s'));
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/$/, '');
  const result = outcome === 'success' ? 'success' : 'failure';
  const to = r.token ? `/pay/viva/${r.token}?result=${result}` : r.offerId ? `/dashboard/offers/${r.offerId}` : '/';
  return NextResponse.redirect(`${base}${to}`, 303);
}
