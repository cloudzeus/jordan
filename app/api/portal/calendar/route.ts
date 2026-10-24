// GET /api/portal/calendar — ημερολόγιο (.ics) του πελάτη: οι εργασίες των έργων του που βλέπει και οι
// ανοιχτές δόσεις, ως ολοήμερα γεγονότα. Ανοίγει σε Google/Apple/Outlook με ένα κλικ.
import { NextResponse } from 'next/server';
import { customerTrdrOf, getPortalUser } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { customerProjectTasks } from '@/lib/project-tasks';
import { customerPayments } from '@/lib/portal-requests';
import { foldLine, icsText } from '@/lib/ics';

export const dynamic = 'force-dynamic';

const ymd = (d: string) => d.replace(/-/g, '');
const plusDay = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export async function GET() {
  const u = await getPortalUser();
  const trdr = customerTrdrOf(u);
  if (trdr == null) return NextResponse.json({ message: 'Μόνο για πελάτες' }, { status: 403 });
  const projects = await prisma.softoneProject.findMany({ where: { trdr }, select: { prjc: true, code: true, name: true } });
  const events: { uid: string; start: string; end: string; title: string; desc: string }[] = [];
  for (const p of projects) {
    const work = await customerProjectTasks(trdr, p.prjc).catch(() => null);
    for (const t of work?.tasks ?? []) {
      if (t.progress >= 100) continue;
      events.push({ uid: `task-${t.id}@atelier`, start: t.start, end: plusDay(t.end), title: `${t.name} — ${p.name}`, desc: `Έργο ${p.code}${t.description ? `\n${t.description}` : ''}` });
    }
  }
  for (const m of await customerPayments(trdr)) {
    if (m.status === 'PAID' || !m.dueDate) continue;
    events.push({ uid: `pay-${m.id}@atelier`, start: m.dueDate, end: plusDay(m.dueDate), title: `Δόση: ${m.title} (${m.amount.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })})`, desc: `${m.contract.ref} · ${m.contract.title}` });
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atelier by Damask//Έργα πελάτη//EL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Atelier — τα έργα μου',
    ...events.flatMap((e) => [
      'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp()}`, `DTSTART;VALUE=DATE:${ymd(e.start)}`, `DTEND;VALUE=DATE:${ymd(e.end)}`,
      `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.desc)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].map(foldLine).join('\r\n');
  return new NextResponse(lines, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="atelier-erga.ics"', 'Cache-Control': 'no-store' } });
}
