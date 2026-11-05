import React, { useEffect, useRef, useState } from 'react';

// Popup in the top corner that closes by itself, so the next entry can start without
// clicking OK: green when a data entry is saved, red when a save is refused.

const SHOW_MS = { success: 3500, error: 6000 };

let show = () => {};
export const showSuccess = (title, message = '') => show({ kind: 'success', title, message, key: Date.now() });
export const showError = (title, message = '') => show({ kind: 'error', title, message, key: Date.now() });

export default function Toaster() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    show = next => {
      clearTimeout(timer.current);
      setToast(next);
      timer.current = setTimeout(() => setToast(null), SHOW_MS[next.kind]);
    };
    return () => {
      show = () => {};
      clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;
  const isError = toast.kind === 'error';
  return (
    <div key={toast.key} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}
      className="toast-card no-print fixed top-4 right-4 z-[70] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isError ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isError ? 'M12 8v5m0 3.5v.01' : 'M5 13l4 4L19 7'} /></svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">{toast.title}</p>
          {toast.message && <p className="text-xs text-gray-600 mt-0.5 break-words">{toast.message}</p>}
        </div>
        <button type="button" onClick={() => setToast(null)} aria-label="Close" className="shrink-0 text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className={`toast-bar h-1 ${isError ? 'bg-red-500' : 'bg-green-500'}`} style={{ animationDuration: `${SHOW_MS[toast.kind]}ms` }} />
    </div>
  );
}
