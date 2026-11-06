import { useLayoutEffect } from 'react';

// Positions a CSS-drawn indicator (see .slide-ind in motion.css) at the `.active` child.
// Sets --ind-x/--ind-y/--ind-w on the container; skipped below 900px where CSS hides it.
export function useSlideIndicator(ref, activeKey, vertical) {
  useLayoutEffect(() => {
    const box = ref.current;
    const measure = () => {
      const a = box?.querySelector('.active');
      if (!a || window.innerWidth < 900) return;
      if (vertical) box.style.setProperty('--ind-y', `${a.offsetTop + (a.offsetHeight - 24) / 2}px`);
      else {
        box.style.setProperty('--ind-x', `${a.offsetLeft}px`);
        box.style.setProperty('--ind-y', `${a.offsetTop + a.offsetHeight + 3}px`);
        box.style.setProperty('--ind-w', a.offsetWidth);
      }
      if (box.dataset.ready) box.dataset.moved = '1'; else box.dataset.ready = '1';
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref, activeKey, vertical]);
}
