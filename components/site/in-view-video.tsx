'use client';

import { useEffect, useRef } from 'react';

type Source = { src: string; type: string };

/**
 * Βίντεο που κατεβαίνει και παίζει μόνο όταν φαίνεται στην οθόνη και σταματά όταν φύγει.
 * Χωρίς autoplay στο φόρτωμα: η αρχική δεν κατεβάζει MB που ο επισκέπτης ίσως δεν δει.
 * Με «λιγότερη κίνηση» στο σύστημα δεν ξεκινά μόνο του· δείχνει controls.
 */
export function InViewVideo({ sources, poster, className, label }: { sources: Source[]; poster: string; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.controls = true;
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <video ref={ref} className={className} poster={poster} muted loop playsInline preload="none" aria-label={label}>
      {sources.map((s) => (
        <source key={s.src} src={s.src} type={s.type} />
      ))}
    </video>
  );
}
