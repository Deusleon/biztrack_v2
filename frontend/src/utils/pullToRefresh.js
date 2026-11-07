/**
 * Pull-to-refresh for the installed app. A phone app opened from the home screen has no browser bar and no reload button
 * (iPhones have no reload gesture at all), so dragging the page down from the very top reloads it, like any mobile app.
 * Returns a function that removes the listeners. Only active where the caller turns it on (the installed app, on touch).
 */
export function attachPullToRefresh({ threshold = 90 } = {}) {
  let startY = null;
  let pulled = 0;
  const bar = document.createElement('div');
  Object.assign(bar.style, { position: 'fixed', top: '0', left: '0', right: '0', height: '3px', background: 'var(--color-primary)', transform: 'scaleX(0)', transformOrigin: 'left', transition: 'transform .1s linear', zIndex: '9999', pointerEvents: 'none' });
  document.body.appendChild(bar);

  const atTop = () => (document.scrollingElement?.scrollTop || 0) <= 0 && document.body.style.overflow !== 'hidden';
  const onStart = (e) => { startY = atTop() && e.touches.length === 1 ? e.touches[0].clientY : null; pulled = 0; };
  const onMove = (e) => {
    if (startY === null) return;
    pulled = Math.max(0, e.touches[0].clientY - startY);
    bar.style.transform = `scaleX(${Math.min(1, pulled / threshold)})`;
  };
  const onEnd = () => {
    bar.style.transform = 'scaleX(0)';
    if (startY !== null && pulled >= threshold) window.location.reload();
    startY = null; pulled = 0;
  };
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onEnd);
  return () => {
    document.removeEventListener('touchstart', onStart);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    bar.remove();
  };
}
