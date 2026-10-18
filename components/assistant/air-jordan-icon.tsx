import * as React from 'react';

// Εικονίδιο του Air Jordan — ΠΡΩΤΟΤΥΠΟ σχέδιο: παίκτης σε «tuck dunk» (λυγισμένα και τα δύο γόνατα,
// καρφώνει με ΔΥΟ χέρια) πάνω από στεφάνι με δίχτυ. Σκόπιμα ΔΙΑΦΟΡΕΤΙΚΟ από γνωστά λογότυπα (όχι
// σιλουέτα με ανοιχτά «ψαλίδι» πόδια και ένα τεντωμένο χέρι, όχι πρόσωπο/όνομα αθλητή).
// Ύφος: όπως τα Feather icons του μενού (react-icons/fi) — 24×24, γραμμή 2, στρογγυλά άκρα, currentColor.

type Props = React.SVGProps<SVGSVGElement> & { title?: string };

export function AirJordanIcon({ title, ...props }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...props}>
      {title && <title>{title}</title>}
      {/* στεφάνι + δίχτυ */}
      <path d="M14 11.5h8.5" />
      <path d="M15 11.5l1.2 3.5h3.6l1.2-3.5" />
      {/* μπάλα με ραφές */}
      <circle cx="18.5" cy="5.5" r="3.2" />
      <path d="M15.3 5.5h6.4M18.5 2.3c-1.2 1.8-1.2 4.6 0 6.4" strokeWidth={1.25} />
      {/* κεφάλι, κορμός, δύο χέρια στη μπάλα */}
      <circle cx="6.5" cy="4.2" r="1.7" />
      <path d="M7 7 5 13" />
      <path d="M7.3 7.6 14.6 5.4" />
      {/* λυγισμένα πόδια (tuck) */}
      <path d="M5 13 8.6 15.4 7 20" />
      <path d="M5 13 2.6 16.6 4.6 20.6" />
    </svg>
  );
}

/** Πλακίδιο-avatar: διαβάθμιση των χρωμάτων της εφαρμογής (brand blue) με κόκκινη μπάλα (brand red). */
export function AirJordanAvatar({ size = 32, className }: { size?: number; className?: string }) {
  const id = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={`aj-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#1E40AF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#aj-${id})`} />
      <g transform="translate(4 4)" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
        <g stroke="#FFFFFF" opacity="0.6">
          <path d="M14 11.5h8.5" />
          <path d="M15 11.5l1.2 3.5h3.6l1.2-3.5" />
        </g>
        <circle cx="18.5" cy="5.5" r="3.2" fill="#EF4444" stroke="#EF4444" />
        <path d="M15.3 5.5h6.4M18.5 2.3c-1.2 1.8-1.2 4.6 0 6.4" stroke="#7F1D1D" strokeWidth={1.1} />
        <g stroke="#FFFFFF">
          <circle cx="6.5" cy="4.2" r="1.7" fill="#FFFFFF" />
          <path d="M7 7 5 13" />
          <path d="M7.3 7.6 14.6 5.4" />
          <path d="M5 13 8.6 15.4 7 20" />
          <path d="M5 13 2.6 16.6 4.6 20.6" />
        </g>
      </g>
    </svg>
  );
}
