import { useEffect } from 'react';

// Reveals `.reveal-item` descendants once as they enter view, staggered 60ms among siblings.
// Content stays visible unless JS runs, IntersectionObserver exists and motion is allowed.
export function useScrollReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const items = [...root.querySelectorAll('.reveal-item')];
    items.forEach(el => {
      const sibs = [...el.parentElement.children].filter(c => c.classList.contains('reveal-item'));
      el.style.setProperty('--reveal-i', sibs.indexOf(el));
    });
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { const t = e.target;
        t.classList.add('is-in'); io.unobserve(t);
        // hand transform back to the element's own hover rules once revealed
        t.addEventListener('transitionend', ev => { if (ev.propertyName === 'transform') t.classList.remove('reveal-item', 'is-in'); }); }
    }), { threshold: 0.15 });
    root.classList.add('reveal-ready');
    items.forEach(el => io.observe(el));
    return () => { io.disconnect(); root.classList.remove('reveal-ready'); };
  }, [rootRef]);
}
