'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * Κίνηση του B2B website με GSAP + Lenis (ομαλή κύλιση), δηλωτικά με data-attributes στο server HTML:
 *   data-split            τίτλος: οι γραμμές ανεβαίνουν μέσα από «μάσκα» (SplitText)
 *   data-reveal           fade + άνοδος όταν μπει στην οθόνη · data-stagger → τα παιδιά ένα-ένα
 *   data-parallax="0.1"   ήπιο parallax ΜΟΝΟ σε εικόνες/φόντα (ποτέ σε κείμενο)
 *   data-zoom             η εικόνα «ανασαίνει» (1.08 → 1) καθώς περνά
 *   data-scrub-words      οι λέξεις φωτίζονται μία-μία με την κύλιση
 *   data-count="27"       αριθμός που μετρά ως την τιμή του
 *   data-hscroll          οριζόντια γκαλερί με sticky (ΟΧΙ pin): ο οδηγός [data-track] κινείται πλάγια
 * Κανόνες ομαλότητας: καθόλου pin (μόνο CSS sticky), μόνο transform/opacity, Lenis δίνει τον ρυθμό στο
 * ScrollTrigger, refresh όταν φορτώσουν fonts/εικόνες. Με prefers-reduced-motion: τίποτα δεν κινείται.
 */
export function SiteMotion() {
  const path = usePathname();

  // Ομαλή κύλιση: ΜΙΑ φορά για όλη τη σελίδα.
  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95, smoothWheel: true, anchors: { offset: -80 } });
    lenis.on('scroll', ScrollTrigger.update);
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    return () => { gsap.ticker.remove(raf); lenis.destroy(); delete (window as unknown as { __lenis?: Lenis }).__lenis; };
  }, []);

  React.useLayoutEffect(() => {
    document.documentElement.classList.add('js');
    const mm = gsap.matchMedia();
    const cleanups: (() => void)[] = [];

    mm.add({ reduce: '(prefers-reduced-motion: reduce)', desktop: '(min-width: 1024px)' }, (ctx) => {
      const { reduce, desktop } = ctx.conditions as { reduce: boolean; desktop: boolean };
      const all = (sel: string) => gsap.utils.toArray<HTMLElement>(sel);

      if (reduce) {
        all('[data-split],[data-reveal]').forEach((e) => e.classList.add('is-in'));
        return;
      }

      all('[data-split]').forEach((el) => {
        const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 's-line' });
        el.classList.add('is-in');
        gsap.set(el, { visibility: 'visible' });
        gsap.from(split.lines, {
          yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.08, delay: Number(el.dataset.delay ?? 0),
          scrollTrigger: el.dataset.split === 'now' ? undefined : { trigger: el, start: 'top 88%', once: true },
        });
      });

      all('[data-reveal]').forEach((el) => {
        const kids = el.hasAttribute('data-stagger') ? Array.from(el.children) : [el];
        el.classList.add('is-in');
        gsap.set(el, { visibility: 'visible' });
        gsap.from(kids, {
          y: Math.min(28, Number(el.dataset.reveal || 24)), autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07,
          delay: Number(el.dataset.delay ?? 0), clearProps: 'transform',
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        });
      });

      // Parallax: μικρό εύρος (≤ ±8%), ένα trigger ανά στοιχείο, scrub με λίγη αδράνεια.
      all('[data-parallax]').forEach((el) => {
        const k = Math.min(0.16, Number(el.dataset.parallax || 0.1)) * 50;
        el.style.willChange = 'transform';
        gsap.fromTo(el, { yPercent: -k }, { yPercent: k, ease: 'none', scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: 0.4 } });
      });
      all('[data-zoom]').forEach((el) => {
        el.style.willChange = 'transform';
        gsap.fromTo(el, { scale: 1.08 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: el.parentElement ?? el, start: 'top top', end: 'bottom top', scrub: 0.4 } });
      });

      all('[data-scrub-words]').forEach((el) => {
        const split = SplitText.create(el, { type: 'words' });
        gsap.fromTo(split.words, { opacity: 0.16 }, { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 50%', scrub: 0.4 } });
      });

      all('[data-count]').forEach((el) => {
        const to = Number(el.dataset.count);
        if (!Number.isFinite(to) || to === 0) return;
        const o = { v: 0 };
        gsap.to(o, { v: to, duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true }, onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString('el-GR'); } });
      });

      // Οριζόντια γκαλερί ΧΩΡΙΣ pin: το ύψος της ενότητας = απόσταση κύλισης· το εσωτερικό είναι sticky.
      if (desktop) {
        all('[data-hscroll]').forEach((wrap) => {
          const track = wrap.querySelector<HTMLElement>('[data-track]');
          if (!track) return;
          const dist = () => Math.max(0, track.scrollWidth - window.innerWidth + 48);
          const size = () => { wrap.style.height = `${dist() + window.innerHeight}px`; };
          size();
          ScrollTrigger.addEventListener('refreshInit', size);
          cleanups.push(() => { ScrollTrigger.removeEventListener('refreshInit', size); wrap.style.height = ''; });
          track.style.willChange = 'transform';
          gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: wrap, start: 'top 80px', end: 'bottom bottom', scrub: 0.5, invalidateOnRefresh: true } });
        });
      }
    });

    const refresh = () => ScrollTrigger.refresh();
    const t = setTimeout(refresh, 400);
    document.fonts?.ready.then(refresh).catch(() => null);
    window.addEventListener('load', refresh);
    // Εικόνες που φορτώνουν αργότερα αλλάζουν ύψη → ένα refresh όταν ολοκληρωθούν.
    const imgs = Array.from(document.images).filter((i) => !i.complete);
    let pending = imgs.length;
    const one = () => { if (--pending === 0) refresh(); };
    imgs.forEach((i) => { i.addEventListener('load', one, { once: true }); i.addEventListener('error', one, { once: true }); });

    return () => { clearTimeout(t); window.removeEventListener('load', refresh); cleanups.forEach((f) => f()); mm.revert(); };
  }, [path]);

  return null;
}
