import React from 'react';

// ── form section card ─────────────────────────────────────────────────────────

// every section uses the same neutral header; 'accent' is kept so callers don't change
const sectionAccents = {
  emerald: { head: 'bg-slate-700', border: 'border-blue-300' },
  blue:    { head: 'bg-slate-700', border: 'border-blue-300' },
  amber:   { head: 'bg-slate-700', border: 'border-blue-300' },
  slate:   { head: 'bg-slate-700', border: 'border-blue-300' },
};

const svgPath = d => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

export const sectionIcons = {
  customer: svgPath('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'),
  sale:     svgPath('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'),
  bill:     svgPath('M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z'),
  barcode:  svgPath('M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12'),
};

// Title row shared by every data-entry form, so Clear / Save sit in the same place with the same look everywhere
export function FormHeader({ icon, title, subtitle, onClear, onSave, saveLabel = 'Save', clearLabel = 'Clear Form', saving = false }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2 pb-1.5 border-b border-gray-200">
      <span className="form-icon w-8 h-8 shrink-0 rounded-lg bg-slate-700 flex items-center justify-center text-white">{icon}</span>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-extrabold text-gray-900 leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="w-full sm:w-auto sm:ml-auto flex gap-2">
        <button onClick={onClear} className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
          {clearLabel}
        </button>
        <button onClick={onSave} disabled={saving} className="form-save flex-1 sm:flex-none px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-md shadow hover:bg-blue-700 disabled:bg-blue-300 transition-colors">
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  );
}

export const formIcons = {
  purchase: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>,
  sale:     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  payment:  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
};

// highlight: thicker coloured border and tinted body, for the section that needs attention
export default function SectionCard({ title, icon, accent = 'slate', highlight = false, children }) {
  const a = sectionAccents[accent];
  return (
    <div className={`section-card rounded-lg bg-white ${highlight ? 'section-highlight ' : ''}${highlight ? `border-2 ${a.border} shadow-md` : 'border border-gray-200 shadow-sm'}`}>
      <div className={`section-head flex items-center gap-2 px-3 py-1.5 rounded-t-md text-sm font-bold uppercase tracking-wide text-white ${a.head}`}>
        {icon}{title}
      </div>
      <div className={`section-body p-2.5 ${highlight ? 'bg-blue-50/40 rounded-b-md' : ''}`}>{children}</div>
    </div>
  );
}
