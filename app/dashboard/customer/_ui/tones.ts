import type { Tone } from './bits';
import type { OrderState, ProjectState } from '@/lib/portal-erp-core';
import type { OrderRequestStatus } from '@/lib/order-requests-core';

export const orderTone: Record<OrderState, Tone> = { open: 'warn', partial: 'active', done: 'good', cancelled: 'bad' };
export const projectTone: Record<ProjectState, Tone> = { active: 'active', completed: 'good', inactive: 'neutral' };
export const requestTone: Record<OrderRequestStatus, Tone> = { SUBMITTED: 'warn', IN_REVIEW: 'active', CONFIRMED: 'good', REJECTED: 'bad', CANCELLED: 'neutral' };

/** Πορεία προσφοράς/σύμβασης: στάλθηκε → αποδεκτή → σε εξέλιξη → ολοκληρώθηκε. */
export const contractTone = (s: string): Tone => (s === 'SENT' ? 'warn' : s === 'ACTIVE' || s === 'ACCEPTED' ? 'active' : s === 'COMPLETED' ? 'good' : s === 'CANCELLED' ? 'bad' : 'neutral');
