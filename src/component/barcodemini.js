import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

// Small barcode for table rows; the number is plain text underneath so Print / PDF / Excel get it too
export default function BarcodeMini({ value }) {
  const ref = useRef(null);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: 'EAN13', width: 1, height: 22, displayValue: false, margin: 0 });
      setOk(true);
    } catch {
      setOk(false);                       // not a valid EAN-13 number: show the text only
    }
  }, [value]);
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-gray-400">—</span>;

  async function copy() {
    const text = String(value);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API is blocked on plain-http LAN addresses; fall back to a hidden textarea
      const t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="inline-flex items-center gap-1">
      <div className="inline-flex flex-col items-center leading-none">
        {ok && <svg ref={ref} className="h-[20px] w-[58px]" preserveAspectRatio="none" />}
        <span className="text-[9px] font-mono tracking-tight text-gray-600 mt-0.5">{value}</span>
      </div>
      <button type="button" onClick={copy} title={copied ? 'Copied' : 'Copy barcode'}
        className={`no-print p-0.5 rounded border transition-colors ${copied ? 'text-green-700 border-green-400 bg-green-50' : 'text-slate-500 border-slate-300 hover:text-blue-700 hover:border-blue-400'}`}>
        {copied
          ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
      </button>
    </div>
  );
}
