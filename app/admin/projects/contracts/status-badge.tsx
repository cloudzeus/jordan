import { cn } from '@/lib/utils';
import { STAGE_LABEL, STATUS_LABEL, type ContractStatus } from '@/lib/contracts/core';

const TONE: Record<ContractStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SENT: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  ACCEPTED: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  ACTIVE: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  COMPLETED: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

export function StatusBadge({ stage, status, className }: { stage: string; status: ContractStatus; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded px-1.5 text-[length:var(--fs-10)] font-semibold uppercase tracking-wide', TONE[status] ?? TONE.DRAFT, className)}>
      {STAGE_LABEL[stage] ?? stage} · {STATUS_LABEL[status] ?? status}
    </span>
  );
}
