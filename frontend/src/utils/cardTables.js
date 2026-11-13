// FILE PATH: frontend/src/utils/cardTables.js
// Copies each column heading onto the cells under it (data-label) for every <table class="table-cards">, so the phone layout in
// index.css can show "Heading: value" on each card. It also runs for tables inside pop-up windows and when the language changes.
const label = () => {
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
  if (typeof MutationObserver === 'undefined') return;
  let queued = false;
  const run = () => { queued = false; label(); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  label();
}
