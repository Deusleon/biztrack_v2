/**
 * When BizTrack is opened as the installed desktop app, fill the screen's usable area (everything except the taskbar)
 * every time it is launched, instead of reopening at whatever small size it was last closed at.
 * Does nothing in an ordinary browser tab, and nothing on phones (an installed app is already full screen there).
 * Runs once per launch: if the person later shrinks the window on purpose, a page reload will not fight them.
 */
export function fillScreenOnLaunch() {
  try {
    const mq = (q) => window.matchMedia?.(q).matches;
    const installed = mq('(display-mode: standalone)') || mq('(display-mode: window-controls-overlay)') || mq('(display-mode: minimal-ui)');
    if (!installed || !mq('(pointer: fine)')) return;
    if (sessionStorage.getItem('biztrack-window-filled')) return;
    sessionStorage.setItem('biztrack-window-filled', '1');
    const s = window.screen;
    window.moveTo(s.availLeft ?? 0, s.availTop ?? 0);
    window.resizeTo(s.availWidth, s.availHeight);
  } catch { /* a browser that does not allow resizing simply keeps its own size */ }
}
