/* Short, cancellable entrance animations; tab logic always runs immediately. */
(() => {
  'use strict';
  const running = new WeakMap();
  const preference = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: true };
  const active = new Set();
  const revealed = new WeakSet();
  const observed = new WeakSet();
  let observer;

  // One-shot reveals: content stays readable if JS or observer support is absent.
  function reveal(element) {
    if (revealed.has(element)) return;
    revealed.add(element);
    if (preference.matches || typeof element.animate !== 'function') return;
    const animation = element.animate(
      [{ opacity: .5, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' }
    );
    active.add(animation);
    const cleanup = () => active.delete(animation);
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }

  function refresh(root = document) {
    // Only stable navigation labels; never alter live counters, action buttons or map markers.
    for (const link of root.querySelectorAll('.site-header .nav-link, .site-header .nav-dropdown-item, .hero-actions a.btn')) {
      if (link.children.length || link.querySelector('.st25-roll')) continue;
      const text = link.textContent.trim();
      if (!text) continue;
      const label = document.createElement('span');
      label.className = 'st25-roll';
      label.dataset.label = text;
      const original = document.createElement('span');
      original.textContent = text;
      label.appendChild(original);
      link.replaceChildren(label);
    }
    if (preference.matches || !('IntersectionObserver' in window)) return;
    observer ||= new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        reveal(entry.target);
      }
    }, { threshold: .12, rootMargin: '0px 0px -24px 0px' });
    for (const element of root.querySelectorAll('main .hero-title, main .hero-desc, main h1, main h2, main .cards-grid > .card, main .portal-feature, [data-st25-reveal]')) {
      if (observed.has(element) || revealed.has(element) || element.closest('.leaflet-container, [hidden], .modal, .tab-content')) continue;
      observed.add(element);
      observer.observe(element);
    }
  }

  function enter(targets) {
    const items = typeof targets === 'string'
      ? document.querySelectorAll(targets)
      : targets && typeof targets[Symbol.iterator] !== 'function' ? [targets] : targets || [];
    for (const element of items) {
      if (!element) continue;
      running.get(element)?.cancel();
      if (preference.matches || typeof element.animate !== 'function' || !element.style || element.hidden || element.style.display === 'none') continue;
      const animation = element.animate(
        [{ opacity: .25, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
      running.set(element, animation);
      active.add(animation);
      const cleanup = () => {
        active.delete(animation);
        if (running.get(element) === animation) running.delete(element);
      };
      animation.onfinish = cleanup;
      animation.oncancel = cleanup;
    }
  }

  preference.addEventListener?.('change', () => {
    if (preference.matches) {
      for (const animation of active) animation.cancel();
    } else refresh();
  });
  window.addEventListener('pagehide', () => {
    for (const animation of active) animation.cancel();
  });
  window.ST25Motion = Object.freeze({ enter, refresh });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });
  else refresh();
  // App renders its navigation in DOMContentLoaded; this pass runs after those listeners.
  window.addEventListener('load', () => refresh(), { once: true });
})();
