import { NextResponse } from 'next/server';
import { PaymentError } from '@/lib/viva-payments';
import { VivaError } from '@/lib/viva';

export function paymentErrorResponse(e: unknown) {
  if (e instanceof PaymentError) return NextResponse.json({ error: 'payment_error', message: e.message }, { status: e.status });
  if (e instanceof VivaError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  throw e;
}
