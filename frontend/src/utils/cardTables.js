// FILE PATH: frontend/src/utils/cardTables.js
// Copies each column heading onto the cells under it (data-label) for every <table class="table-cards">, so the phone
// layout in index.css can show "Heading: value" on each card. The phone layout only applies below 768px, so a wide
// screen does none of this work. Bursts of updates (a list arriving, a language change) are labelled once.
const PHONE = '(max-width: 767px)';

const label = () => {
  if (!window.matchMedia(PHONE).matches) return;
  document.querySelectorAll('table.table-cards').forEach((table) => {
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
    if (!heads.length) return;
    table.querySelectorAll('tbody tr, tfoot tr').forEach((tr) => {
      Array.from(tr.children).forEach((td, i) => {
        const text = heads[i] || '';
        if (td.dataset.label !== text) td.dataset.label = text;
      });
    });
  });
};

export function startCardTables() {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  let timer;
  const schedule = () => {
    if (!window.matchMedia(PHONE).matches) return;
    clearTimeout(timer);
    timer = setTimeout(label, 80);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.matchMedia(PHONE).addEventListener?.('change', schedule);
  schedule();
}
