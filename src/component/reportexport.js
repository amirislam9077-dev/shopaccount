import React from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Every report's Date From starts here (start of the books), not at the current month
export const REPORT_START_DATE = '2026-01-01';

// Reads the report tables currently on screen (the active tab only) so every report
// can be exported without each one describing its own columns.

function visibleTables(root) {
  if (!root) return [];
  // tables inside entry forms (.no-print) are left out, matching what Print shows
  return [...root.querySelectorAll('table')].filter(t => t.offsetParent !== null && t.rows.length > 1 && !t.closest('.no-print'));
}

// "Rs 1,23,456.50" / "45" -> number, anything else stays text
export function toCell(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(?:Rs\.?\s*)?(-?[\d,]+(?:\.\d+)?)$/);
  return m ? Number(m[1].replace(/,/g, '')) : t;
}

// Table -> rows of cell values, expanding colSpan and dropping Actions / checkbox columns
export function tableToRows(table) {
  // rows marked .no-print (e.g. screen-only page totals) are not exported either
  const grid = [...table.rows].filter(row => !row.classList.contains('no-print')).map(row => {
    const out = [];
    for (const cell of row.cells) {
      out.push(cell.innerText);
      for (let i = 1; i < cell.colSpan; i++) out.push('');
    }
    return out;
  });
  const header = (grid[0] || []).map(h => h.trim().toLowerCase());
  // drop the Actions column, and header-less columns that hold no text (row checkboxes)
  const keep = header.map((h, i) => h !== 'actions' && (h !== '' || grid.slice(1).some(r => (r[i] || '').trim())));
  return grid.map(r => r.filter((_, i) => keep[i]));
}

function fileName(title, ext) {
  return `${title.replace(/[^\w]+/g, '-')}-${new Date().toLocaleDateString('en-CA')}.${ext}`;
}

function exportExcel(title, tables) {
  const wb = XLSX.utils.book_new();
  tables.forEach((table, i) => {
    const rows = tableToRows(table);
    const aoa = [rows[0], ...rows.slice(1).map(r => r.map(toCell))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = rows[0].map((_, c) => ({ wch: Math.min(40, Math.max(8, ...rows.map(r => String(r[c] || '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, tables.length > 1 ? `Sheet ${i + 1}` : title.slice(0, 31));
  });
  XLSX.writeFile(wb, fileName(title, 'xlsx'));
}

function exportPdf(title, tables) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(`Khurram Studio — ${title}`, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, 40, 56);
  let y = 70;
  tables.forEach(table => {
    const rows = tableToRows(table);
    autoTable(doc, {
      head: [rows[0]],
      body: rows.slice(1),
      startY: y,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 40, right: 40 },
    });
    y = doc.lastAutoTable.finalY + 20;
  });
  doc.save(fileName(title, 'pdf'));
}

export default function ReportToolbar({ title, rootRef }) {
  function run(kind) {
    const tables = visibleTables(rootRef.current);
    if (kind === 'print') { window.print(); return; }
    if (!tables.length) { alert('No table data to export on this screen.'); return; }
    if (kind === 'pdf') exportPdf(title, tables);
    else exportExcel(title, tables);
  }

  const btn = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors';
  return (
    <div className="no-print flex flex-wrap items-center justify-end gap-2 mb-2">
      <span className="hidden sm:inline text-xs text-gray-500 mr-1">Export current view:</span>
      <button onClick={() => run('print')} className={btn}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
        Print
      </button>
      <button onClick={() => run('pdf')} className={btn}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
        PDF
      </button>
      <button onClick={() => run('excel')} className={btn}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        Excel
      </button>
    </div>
  );
}
