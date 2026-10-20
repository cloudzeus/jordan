import { cn } from '@/lib/utils';
import { STAGE_LABEL, STATUS_LABEL, type ContractStatus } from '@/lib/contracts/core';

const TONE: Record<ContractStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  SENT: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
  ACCEPTED: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200',
  ACTIVE: 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200',
};

export function StatusBadge({ stage, status, className }: { stage: string; status: ContractStatus; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded px-1.5 text-(length:--fs-10) font-semibold uppercase tracking-wide', TONE[status] ?? TONE.DRAFT, className)}>
      {STAGE_LABEL[stage] ?? stage} · {STATUS_LABEL[status] ?? status}
    </span>
  );
}
