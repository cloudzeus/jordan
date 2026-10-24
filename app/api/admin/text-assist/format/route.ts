import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireTextAssistApi } from '@/lib/text-assist/access';
import { formatRequest } from '@/lib/text-assist/core';
import { formatFieldText } from '@/lib/text-assist/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { text, surrounding?, field: { label, placeholder, name, section, page, path, hint, siblings[] } } → { text }
// AI μορφοποίηση του κειμένου ενός πεδίου φόρμας, με βάση το πού γράφεται. Τίποτα δεν αποθηκεύεται.
export async function POST(req: Request) {
  const u = await requireTextAssistApi();
  if (u instanceof NextResponse) return u;
  try {
    const input = formatRequest.parse(await req.json().catch(() => null));
    if (!input.text.trim()) return NextResponse.json({ error: 'empty', message: 'Δεν υπάρχει κείμενο για μορφοποίηση' }, { status: 400 });
    const { text } = await formatFieldText(input, { userId: u.id });
    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: 'invalid', message: e.issues[0]?.message ?? 'Άκυρο αίτημα' }, { status: 400 });
    console.error('text-assist format failed', e);
    return NextResponse.json({ error: 'ai_failed', message: 'Η AI μορφοποίηση απέτυχε — δοκιμάστε ξανά' }, { status: 502 });
  }
}
