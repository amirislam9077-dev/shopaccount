import React, { useLayoutEffect, useRef, useState } from 'react';

export const PAGE_SIZE = 15;

// Rows off the current page are hidden with CSS rather than removed, so Print / PDF / Excel
// still get every row (see .page-hidden in index.css).
export const pageCls = (index, page) =>
  index >= (page - 1) * PAGE_SIZE && index < page * PAGE_SIZE ? '' : 'page-hidden';

export default function Pager({ total, page, onPage, unit = 'rows' }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) {
    return total > 0 ? <div className="no-print px-4 py-1.5 text-xs text-gray-500 border-t border-gray-200 bg-white">{total} {unit}</div> : null;
  }
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  // first, last, and two either side of the current page
  const shown = [...new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2])]
    .filter(p => p >= 1 && p <= pages).sort((a, b) => a - b);
  const btn = 'min-w-[28px] h-7 px-2 text-xs font-semibold rounded border transition-colors';

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 border-t border-gray-200 bg-white">
      <span className="text-xs text-gray-500">Showing <b className="text-gray-800">{from}–{to}</b> of <b className="text-gray-800">{total}</b> {unit}</span>
      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onPage(page - 1)}
          className={`${btn} border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40`}>‹ Prev</button>
        {shown.map((p, i) => (
          <React.Fragment key={p}>
            {i > 0 && p - shown[i - 1] > 1 && <span className="px-1 text-xs text-gray-400">…</span>}
            <button onClick={() => onPage(p)}
              className={`${btn} ${p === page ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}>{p}</button>
          </React.Fragment>
        ))}
        <button disabled={page === pages} onClick={() => onPage(page + 1)}
          className={`${btn} border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40`}>Next ›</button>
      </div>
    </div>
  );
}

// Wrap any report <table> to show it 15 rows at a time. Works on the rendered rows, so a report
// doesn't need to change how it builds them. A row whose first cell starts with "↳" belongs to
// the row above (grouped tabs), so a group is never split across pages.
export function PagedTable({ children }) {
  const ref = useRef(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // runs after every render: React may have re-rendered rows and reset their className.
  // State is only set when it actually changes, so this settles after one extra pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const table = ref.current && ref.current.querySelector('table');
    const rows = table ? [...table.tBodies].flatMap(b => [...b.rows]) : [];
    let unit = -1;
    const units = rows.map(r => {
      const first = (r.cells[0] ? r.cells[0].textContent : '').trim();
      if (unit < 0 || !first.startsWith('↳')) unit++;
      return unit;
    });
    // a single full-width "No data found" row is not data
    const count = rows.length === 1 && rows[0].cells.length === 1 ? 0 : unit + 1;
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    const p = Math.min(page, pages);
    rows.forEach((r, i) => r.classList.toggle('page-hidden', pageCls(units[i], p) !== ''));
    if (count !== total) setTotal(count);
    if (p !== page) setPage(p);
  });

  return (
    <div ref={ref} className="overflow-x-auto">
      {children}
      {total > PAGE_SIZE && <Pager total={total} page={page} onPage={setPage} />}
    </div>
  );
}
