/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import { fmtNum } from './format';
import JsBarcode from 'jsbarcode';
import SaleEntry from './sale';
import PartyLedger from './partyledger';
import StockValue from './stockvalue';
import StockVsPayable from './position';
import PhoneInput, { withContact, lookupPartyInfo } from './phoneinput';
import SectionCard, { sectionIcons, FormHeader, formIcons } from './sectioncard';
import ReportToolbar, { REPORT_START_DATE } from './reportexport';
import BarcodeMini from './barcodemini';
import Pager, { PAGE_SIZE, pageCls, PagedTable } from './pager';
import { API_URL, apiFetch, saveLogin } from '../api';

// ── helpers ──────────────────────────────────────────────────────────────────

function generateId(n) {
  return `Pur-${String(n).padStart(6, '0')}`;
}

function nextIdFromList(products) {
  let max = 0;
  products.forEach(p => {
    const m = String(p.idNo || '').match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return generateId(max + 1);
}

function todayISO() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isoToDisplay(iso) {
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${MONTHS[parseInt(mm,10)-1]}/${yyyy.slice(2)}`;
}

function numberToWords(num) {
  if (num === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function lt1000(n) {
    if (!n) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + lt1000(n % 100) : '');
  }

  function convert(n) {
    if (!n) return 'Zero';
    if (n < 1000) return lt1000(n);
    if (n < 100000) return lt1000(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + lt1000(n % 1000) : '');
    if (n < 10000000) return lt1000(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return lt1000(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = convert(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
  return result + ' Only';
}


// ── SVG icons ─────────────────────────────────────────────────────────────────

const ChevronDown = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronRight = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

// ── sub-components ────────────────────────────────────────────────────────────

function NavItem({ icon, label, children, active, onClick, open: openProp, onToggle }) {
  const [ownOpen, setOwnOpen] = useState(active);
  // Keep the group holding the selected page expanded so the selection is visible
  useEffect(() => { if (active) setOwnOpen(true); }, [active]);
  const open = openProp !== undefined ? openProp : ownOpen;
  const setOpen = onToggle ? () => onToggle() : setOwnOpen;

  if (children) {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className={`w-full flex items-center justify-between px-3 py-1 rounded-lg cursor-pointer transition-all duration-200 text-sm font-medium ${
            active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <div className="flex items-center">
            <span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center mr-3">
              {icon}
            </span>
            {label}
          </div>
          <span className={`transition-transform ${open ? 'rotate-180' : ''}`}><ChevronDown /></span>
        </button>
        {open && (
          <div className="ml-6 mt-1 space-y-0.5 border-l-2 border-slate-700 pl-1">
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-3 py-1 rounded-lg cursor-pointer transition-all duration-200 text-sm font-medium ${
        active ? 'bg-blue-600 text-white font-semibold shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <span className={`w-6 h-6 rounded-lg flex items-center justify-center mr-3 ${active ? 'bg-blue-500' : 'bg-slate-700'}`}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function SubNavItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-3 py-1 rounded-lg cursor-pointer transition-colors text-sm ${
        active ? 'bg-blue-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <ChevronRight />
      <span className="ml-2">{label}</span>
    </button>
  );
}

// ── modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 1000000 -> "1,000,000" (same grouping as fmtNum); keeps a decimal part while it is being typed
function formatGrouped(value) {
  const s = String(value ?? '').replace(/,/g, '');
  if (!s) return '';
  const [int, frac] = s.split('.');
  const grouped = Number(int || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
}

// ── barcode canvas ────────────────────────────────────────────────────────────

function BarcodeCanvas({ value, designCode, saleRate }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && value) {
      JsBarcode(ref.current, value, {
        format: 'EAN13',
        width: 1.5,
        height: 35,
        displayValue: true,
        fontSize: 10,
        margin: 2,
      });
    }
  }, [value]);

  return (
    <div className="inline-flex flex-col items-center border border-gray-200 rounded bg-white p-2 mt-1">
      {designCode && (
        <span className="text-xs font-semibold text-gray-800 mb-1 tracking-wide">{designCode}</span>
      )}
      <canvas ref={ref} />
      {parseFloat(saleRate) > 0 && (
        <span className="text-sm font-bold text-gray-900 mt-1">Rs {fmtNum(Math.round(parseFloat(saleRate)))}</span>
      )}
    </div>
  );
}

// ── purchase data entry form ──────────────────────────────────────────────────

function PurchaseDataEntry({ nextId, onSaved, parties, designs, onAddParty, onDeleteParty, onAddDesign, onDeleteDesign, onRenameParty, onRenameDesign, products }) {
  const [form, setForm] = useState({
    idNo: nextId || generateId(1),
    date: todayISO(),
    partyName: 'Cash',
    challanNo: '',
    pieces: '',
    wholeSaleRate: '',
    saleRate: '',
    designName: '',
    totalRs: '',
    designCode: '',
    barcode: '',
  });

  // Merge parties from props with unique party names from products (purchase table)
  const partiesFromPurchases = [...new Set((products || []).map(p => p.partyName).filter(Boolean))];
  const allParties = [...new Map([...parties, ...partiesFromPurchases.map(name => ({ name }))].map(p => [p.name, p])).values()];

  // Merge designs from props with unique design names from products (purchase table)
  const designsFromPurchases = [...new Set((products || []).map(p => p.designName).filter(Boolean))];
  const allDesigns = [...new Set([...designs, ...designsFromPurchases])];
  const [amountWords, setAmountWords] = useState('Zero Rupees Only');
  useEffect(() => {
    if (nextId) setForm(f => ({ ...f, idNo: nextId }));
  }, [nextId]);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanMsg, setScanMsg]   = useState(null);   // { ok, text }

  // Purchase barcodes are 12 digits; a scanner reading the printed EAN-13 adds a 13th check digit
  function fillFromBarcode(raw) {
    let code = String(raw || '').replace(/\D/g, '');
    if (code.length === 13) code = code.slice(0, 12);
    if (!code) return;
    const match = (products || [])
      .filter(p => String(p.barcode || '') === code)
      .sort((a, b) => b.id - a.id)[0];
    // the scanned number stays in the box as typed; the input selects it so the next scan replaces it
    if (!match) { setScanMsg({ ok: false, text: `No purchase found with barcode ${code}` }); return; }
    handlePartyChange(match.partyName);               // also fills phone, WhatsApp, etc.
    set('designName', match.designName || '');
    set('wholeSaleRate', match.wholeSaleRate || '');
    set('saleRate', match.saleRate || '');
    setScanMsg({ ok: true, text: `Filled from ${match.idNo}: ${match.designName} · ${match.partyName}. Now enter pieces.` });
  }

  // rename = { kind: 'party' | 'design', oldName, value } while the rename popup is open
  const [rename, setRename] = useState(null);
  const [renaming, setRenaming] = useState(false);

  function openRename(kind) {
    const oldName = kind === 'party' ? form.partyName : form.designName;
    if (!oldName) { alert(`Please select a ${kind} to edit`); return; }
    setRename({ kind, oldName, value: oldName });
  }

  // Renames the party / design in the database (all its purchases, and its payments or sales), then reloads
  async function submitRename() {
    const newName = rename.value.trim();
    if (!newName) { alert('Please enter a name'); return; }
    if (newName === rename.oldName) { setRename(null); return; }
    const list = rename.kind === 'party' ? allParties.map(p => p.name) : allDesigns;
    if (list.includes(newName) && !window.confirm(`"${newName}" already exists. Its records will be joined with "${rename.oldName}". Continue?`)) return;
    setRenaming(true);
    try {
      const res = await apiFetch(`${API_URL}/api/rename/${rename.kind}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: rename.oldName, new_name: newName }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Rename failed');
      if (rename.kind === 'party') { onRenameParty && onRenameParty(rename.oldName, newName); set('partyName', newName); }
      else { onRenameDesign && onRenameDesign(rename.oldName, newName); set('designName', newName); }
      if (onSaved) await onSaved();
      setRename(null);
    } catch (err) {
      alert('Could not rename: ' + err.message);
    }
    setRenaming(false);
  }

  const [newParty, setNewParty] = useState({ name: '', contact: '', address: '', facebook: '', instagram: '', whatsapp: '' });
  const [newDesign, setNewDesign] = useState({ name: '', category: '', description: '' });
  const [history, setHistory] = useState({ pieces: [], wholeSaleRate: [], saleRate: [], designName: [] });
  const [showHistory, setShowHistory] = useState({ pieces: false, wholeSaleRate: false, saleRate: false, designName: false });
  const [partyInfo, setPartyInfo] = useState({ contact: '', whatsapp: '', facebook: '', instagram: '', address: '' });

  function buildBarcode(partyName, wholeSaleRate, pieces, saleRate) {
    const p = String(partyName || '').replace(/\s/g, '').toUpperCase().slice(0, 2);
    const wr = String(Math.floor(parseFloat(wholeSaleRate) || 0)).padStart(4, '0');
    const pc = String(parseInt(pieces) || 0).padStart(3, '0');
    const sr = String(Math.floor(parseFloat(saleRate) || 0)).padStart(4, '0');
    const raw = p.split('').map(c => c.charCodeAt(0) - 55).join('') + wr + pc + sr;
    const digits = raw.replace(/\D/g, '').slice(0, 12).padStart(12, '0');
    return digits;
  }

  function buildDesignCode(partyName, wholeSaleRate, designName) {
    const party = (partyName || '').slice(0, 3).toUpperCase();
    const rate = String(Math.floor(parseFloat(wholeSaleRate) || 0)).slice(0, 3);
    const design = (designName || '');
    if (!party && !rate && !design) return '';
    return `${party}-99${rate}-${design}`;
  }

  function set(field, value) {
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === 'pieces' || field === 'wholeSaleRate') {
        const total = (parseFloat(updated.pieces) || 0) * (parseFloat(updated.wholeSaleRate) || 0);
        updated.totalRs = total ? String(Math.round(total * 100) / 100) : '';
        setAmountWords(numberToWords(total));
      }
      if (['partyName', 'wholeSaleRate', 'designName'].includes(field)) {
        updated.designCode = buildDesignCode(updated.partyName, updated.wholeSaleRate, updated.designName);
      }
      if (['partyName', 'wholeSaleRate', 'pieces', 'saleRate'].includes(field)) {
        updated.barcode = buildBarcode(updated.partyName, updated.wholeSaleRate, updated.pieces, updated.saleRate);
      }
      return updated;
    });
  }

  function handlePartyChange(val) {
    if (val === '__add__') { setShowPartyModal(true); return; }
    set('partyName', val);
    setPartyInfo(lookupPartyInfo(val, parties, products));
  }

  function handleDesignChange(val) {
    if (val === '__add__') { setShowDesignModal(true); return; }
    set('designName', val);
  }

  function clearForm() {
    setForm({ idNo: nextId || generateId(1), date: todayISO(), partyName: 'Cash', challanNo: '', pieces: '', wholeSaleRate: '', saleRate: '', designName: '', totalRs: '', designCode: '', barcode: '' });
    setPartyInfo({ contact: '', whatsapp: '', facebook: '', instagram: '', address: '' });
    setAmountWords('Zero Rupees Only');
    setScanCode('');               // otherwise the last scan's message stays next to an empty form
    setScanMsg(null);
  }

  function addToHistory(field, value) {
    if (!value) return;
    setHistory(h => {
      const prev = h[field].filter(v => v !== value);
      return { ...h, [field]: [value, ...prev].slice(0, 5) };
    });
  }

  async function saveProduct() {
    const { idNo, date, partyName, challanNo, pieces, wholeSaleRate, saleRate, designName, totalRs, barcode, designCode } = form;
    if (!idNo || !date || !partyName || !pieces || !wholeSaleRate || !saleRate || !designName || !totalRs) {
      alert('Please fill in all fields');
      return;
    }
    try {
      const res = await apiFetch(`${API_URL}/api/purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_no: idNo,
          purchase_date: date,
          party_name: partyName,
          challan_no: challanNo,
          pieces: parseFloat(pieces),
          wholesale_rate: parseFloat(wholeSaleRate),
          sale_rate: parseFloat(saleRate),
          design_name: designName,
          purchase_total: parseFloat(totalRs),
          barcode: barcode,
          design_code: designCode,
          phone_no: partyInfo.contact || null,
          whatsapp: partyInfo.whatsapp || null,
          facebook_id: partyInfo.facebook || null,
          instagram: partyInfo.instagram || null,
          address: partyInfo.address || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      addToHistory('pieces', pieces);
      addToHistory('wholeSaleRate', wholeSaleRate);
      addToHistory('saleRate', saleRate);
      addToHistory('designName', designName);
      alert('Product saved successfully!');
      if (onSaved) await onSaved();
      clearForm();
    } catch (err) {
      alert('Error saving: ' + err.message);
    }
  }

  function submitNewParty() {
    if (!newParty.name.trim()) { alert('Please enter a party name'); return; }
    const party = { ...newParty, name: newParty.name.trim() };
    onAddParty(party);
    set('partyName', party.name);
    setPartyInfo({ contact: party.contact || '', whatsapp: party.whatsapp || '', facebook: party.facebook || '', instagram: party.instagram || '', address: party.address || '' });
    setShowPartyModal(false);
    setNewParty({ name: '', contact: '', address: '', facebook: '', instagram: '', whatsapp: '' });
    alert(`Party "${party.name}" added successfully!`);
  }

  function submitNewDesign() {
    if (!newDesign.name.trim()) { alert('Please enter a design name'); return; }
    onAddDesign(newDesign.name.trim());
    set('designName', newDesign.name.trim());
    setShowDesignModal(false);
    setNewDesign({ name: '', category: '', description: '' });
    alert(`Design "${newDesign.name}" added successfully!`);
  }

  const inputCls = 'w-full px-2.5 py-1 border border-slate-500 rounded-md bg-slate-100 text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 focus:bg-white transition-shadow';
  const labelCls = 'block text-xs font-bold text-gray-800 mb-0.5';

  return (
    <>
      <div className="purchase-form no-print bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3">
        <FormHeader icon={formIcons.purchase} title="Purchase Data Entry" subtitle="Record a new stock purchase from a party"
          onClear={clearForm} onSave={saveProduct} saveLabel="Save Product" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <div className="lg:col-span-2 space-y-2">
            <SectionCard title="Purchase Details" accent="blue" icon={sectionIcons.sale}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {/* ID Number */}
              <div>
                <label className={labelCls}>Purchase ID Number</label>
                <input className={inputCls} value={form.idNo} onChange={e => set('idNo', e.target.value)} placeholder="Purchase ID Number" />
              </div>

              {/* Date */}
              <div>
                <label className={labelCls}>Date</label>
                <div className="relative">
                  <input
                    readOnly
                    className={inputCls + ' cursor-pointer pr-10'}
                    value={form.date ? isoToDisplay(form.date) : ''}
                    placeholder="dd/mm/yy"
                    onClick={() => document.getElementById('hiddenDatePicker').showPicker()}
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById('hiddenDatePicker').showPicker()}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-blue-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <input
                    id="hiddenDatePicker"
                    type="date"
                    className="absolute opacity-0 pointer-events-none w-0 h-0"
                    value={form.date}
                    onChange={e => set('date', e.target.value)}
                  />
                </div>
              </div>

              {/* Challan No */}
              <div>
                <label className={labelCls}>Challan No</label>
                <input className={inputCls} value={form.challanNo} onChange={e => set('challanNo', e.target.value)} placeholder="Enter Challan No" />
              </div>

              {/* Pieces */}
              <div className="relative">
                <label className={labelCls}>Pieces</label>
                <input type="number" className={inputCls} value={form.pieces}
                  onChange={e => set('pieces', e.target.value)}
                  onFocus={() => setShowHistory(h => ({ ...h, pieces: true }))}
                  onBlur={() => setTimeout(() => setShowHistory(h => ({ ...h, pieces: false })), 150)}
                  placeholder="Enter Pieces" />
                {showHistory.pieces && history.pieces.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 top-full bg-white border border-gray-200 rounded shadow-lg">
                    {history.pieces.map((v, i) => (
                      <div key={i} onClick={() => { set('pieces', v); setShowHistory(h => ({ ...h, pieces: false })); }}
                        className="px-2 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {v}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
              {/* Design Name */}
              <div className="relative lg:col-span-2">
                <label className={labelCls}>Design Name</label>
                <div className="flex items-center gap-1">
                  <div className="relative flex-1">
                    <select className={inputCls + ' appearance-none'} value={form.designName}
                      onChange={e => handleDesignChange(e.target.value)}
                      onFocus={() => setShowHistory(h => ({ ...h, designName: true }))}
                      onBlur={() => setTimeout(() => setShowHistory(h => ({ ...h, designName: false })), 150)}>
                      <option value="">Select Design</option>
                      {allDesigns.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <button type="button" title="Edit design name" onClick={() => openRename('design')}
                    className="p-1 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded border border-slate-300 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button type="button" title="Delete selected design"
                    onClick={() => {
                      if (!form.designName) { alert('Please select a design to delete'); return; }
                      if (window.confirm(`Delete design "${form.designName}"?`)) {
                        onDeleteDesign(form.designName);
                        set('designName', '');
                      }
                    }}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded border border-red-200 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <button type="button" title="Add new design" onClick={() => setShowDesignModal(true)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
                {showHistory.designName && history.designName.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 top-full bg-white border border-gray-200 rounded shadow-lg">
                    {history.designName.map((v, i) => (
                      <div key={i} onClick={() => { set('designName', v); setShowHistory(h => ({ ...h, designName: false })); }}
                        className="px-2 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {v}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Party Name */}
              <div className="lg:col-span-2">
                <label className={labelCls}>Party Name</label>
                <div className="flex items-center gap-1">
                  <div className="relative flex-1">
                    <select className={inputCls + ' appearance-none'} value={form.partyName} onChange={e => handlePartyChange(e.target.value)}>
                      <option value="">Select Party</option>
                      {allParties.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                      <option value="__add__" className="text-blue-600 font-medium">+ Add New Party</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <button type="button" title="Edit party name" onClick={() => openRename('party')}
                    className="p-1 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded border border-slate-300 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button
                    type="button"
                    title="Delete selected party"
                    onClick={() => {
                      if (!form.partyName) { alert('Please select a party to delete'); return; }
                      if (window.confirm(`Delete party "${form.partyName}"?`)) {
                        onDeleteParty(form.partyName);
                        set('partyName', '');
                      }
                    }}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded border border-red-200 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Wholesale Rate */}
              <div className="relative">
                <label className={labelCls}>Wholesale Rate</label>
                <input type="number" className={inputCls} value={form.wholeSaleRate}
                  onChange={e => set('wholeSaleRate', e.target.value)}
                  onFocus={() => setShowHistory(h => ({ ...h, wholeSaleRate: true }))}
                  onBlur={() => setTimeout(() => setShowHistory(h => ({ ...h, wholeSaleRate: false })), 150)}
                  placeholder="Enter Wholesale Rate" step="0.01" />
                {showHistory.wholeSaleRate && history.wholeSaleRate.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 top-full bg-white border border-gray-200 rounded shadow-lg">
                    {history.wholeSaleRate.map((v, i) => (
                      <div key={i} onClick={() => { set('wholeSaleRate', v); setShowHistory(h => ({ ...h, wholeSaleRate: false })); }}
                        className="px-2 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {v}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sale Rate */}
              <div className="relative">
                <label className={labelCls}>Sale Rate</label>
                <input type="number" className={inputCls} value={form.saleRate}
                  onChange={e => set('saleRate', e.target.value)}
                  onFocus={() => setShowHistory(h => ({ ...h, saleRate: true }))}
                  onBlur={() => setTimeout(() => setShowHistory(h => ({ ...h, saleRate: false })), 150)}
                  placeholder="Enter Sale Rate" step="0.01" />
                {showHistory.saleRate && history.saleRate.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 top-full bg-white border border-gray-200 rounded shadow-lg">
                    {history.saleRate.map((v, i) => (
                      <div key={i} onClick={() => { set('saleRate', v); setShowHistory(h => ({ ...h, saleRate: false })); }}
                        className="px-2 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {v}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Design Code (auto-filled) */}
              <div className="sm:col-span-2">
                <label className={labelCls}>Design Code <span className="font-normal text-gray-400">(auto)</span></label>
                <input
                  readOnly
                  className={inputCls + ' bg-gray-50 text-gray-700 cursor-default'}
                  value={form.designCode}
                  placeholder="Auto-filled from Party, Rate & Design"
                />
              </div>
              </div>
            </SectionCard>

            <SectionCard title="Party Information" accent="emerald" highlight icon={sectionIcons.customer}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {/* Phone No */}
              <div>
                <label className={labelCls}><span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  Phone No
                </span></label>
                <PhoneInput className={inputCls} value={partyInfo.contact}
                  onChange={val => setPartyInfo(p => withContact(p, val))} />
              </div>

              {/* WhatsApp */}
              <div>
                <label className={labelCls}><span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.121 1.534 5.857L0 24l6.335-1.511A11.951 11.951 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.741 9.741 0 01-4.964-1.356l-.356-.212-3.693.88.941-3.601-.232-.37A9.712 9.712 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                  WhatsApp
                </span></label>
                <PhoneInput className={inputCls} value={partyInfo.whatsapp}
                  onChange={val => setPartyInfo(p => ({ ...p, whatsapp: val }))} />
              </div>

              {/* Facebook */}
              <div>
                <label className={labelCls}><span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook ID
                </span></label>
                <input className={inputCls} value={partyInfo.facebook} placeholder="Facebook ID or page URL"
                  onChange={e => setPartyInfo(p => ({ ...p, facebook: e.target.value }))} />
              </div>

              {/* Instagram */}
              <div>
                <label className={labelCls}><span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-pink-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  Instagram
                </span></label>
                <input className={inputCls} value={partyInfo.instagram} placeholder="@username"
                  onChange={e => setPartyInfo(p => ({ ...p, instagram: e.target.value }))} />
              </div>

              {/* Address */}
              <div className="sm:col-span-2">
                <label className={labelCls}><span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Address
                </span></label>
                <input className={inputCls} value={partyInfo.address} placeholder="Party address"
                  onChange={e => setPartyInfo(p => ({ ...p, address: e.target.value }))} />
              </div>
              </div>
            </SectionCard>
          </div>

          {/* phones / tablets: barcode scan and total come first; desktop keeps them on the right */}
          <div className="contents lg:block lg:space-y-2">
            <div className="order-first lg:order-none">
            <SectionCard title="Barcode" accent="slate" icon={sectionIcons.barcode}>
              {/* Scan an existing barcode to fill design, party and rates from that earlier purchase */}
              <div className="scan-box no-print mb-2 rounded-lg border-2 border-dashed border-blue-500 bg-blue-50 p-2">
                <label className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-blue-800 mb-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" /></svg>
                  Scan Barcode
                </label>
                <input className="w-full px-2.5 py-1.5 border-2 border-blue-600 rounded-md bg-white text-sm font-bold text-gray-900 placeholder:font-normal placeholder:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={scanCode} inputMode="numeric" placeholder="Scan or type barcode, then Enter"
                  onChange={e => { setScanCode(e.target.value); setScanMsg(null); }}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    fillFromBarcode(scanCode);
                    const box = e.target;
                    setTimeout(() => box.select(), 0);   // keep the number visible, ready to be replaced by the next scan
                  }} />
                {scanMsg && (
                  <p className={`mt-1 text-[11px] font-semibold ${scanMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{scanMsg.text}</p>
                )}
              </div>
              {/* Barcode */}
              <div>
                {!form.barcode && <p className="text-xs text-gray-400 italic">Barcode appears after party and rates are entered</p>}
                {form.barcode && <BarcodeCanvas value={form.barcode} designCode={form.designCode} saleRate={form.saleRate} />}
              </div>
            </SectionCard>
            </div>

            <div className="order-last lg:order-none">
            <SectionCard title="Purchase Total" accent="amber" icon={sectionIcons.bill}>
              {/* Purchase Total */}
              <div>
                <div className="rounded-lg overflow-hidden border-2 border-slate-400 shadow-md">
                  <div className="flex justify-between items-center px-3 py-1.5 bg-white text-xs text-gray-700 border-b border-gray-100">
                    <span className="font-medium">{form.pieces || 0} pcs × Rs {fmtNum(form.wholeSaleRate)}</span>
                    <span className="font-semibold text-gray-800">= Rs {fmtNum((parseFloat(form.pieces) || 0) * (parseFloat(form.wholeSaleRate) || 0))}</span>
                  </div>
                  {/* same dark strip as the Sales "Bill Summary" total; the amount can still be typed over */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-800">
                    <span className="font-bold text-white text-sm tracking-wide whitespace-nowrap">Purchase Total</span>
                    <span className="ml-auto text-xl font-extrabold text-white">Rs</span>
                    <input type="text" inputMode="decimal"
                      className="total-input w-32 min-w-0 bg-transparent text-right text-2xl font-extrabold text-white placeholder:text-slate-400 focus:outline-none focus:bg-slate-700 rounded px-1"
                      value={formatGrouped(form.totalRs)}
                      onChange={e => { const raw = e.target.value.replace(/[^\d.]/g, ''); set('totalRs', raw); setAmountWords(numberToWords(parseFloat(raw) || 0)); }}
                      placeholder="0" />
                  </div>
                </div>
                <div className="text-xs text-gray-500 italic mt-0.5 px-1.5 py-0.5 bg-gray-50 rounded border-l-2 border-blue-400 truncate">
                  {amountWords}
                </div>
              </div>
            </SectionCard>
            </div>
          </div>
        </div>

        {/* Party purchase history table */}
        {form.partyName && products && (() => {
          const rows = products.filter(p => p.partyName === form.partyName);
          if (!rows.length) return null;
          return (
            <div className="mt-3 pt-2 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-700 mb-1">
                Purchase history for <span className="text-blue-600">{form.partyName}</span> ({rows.length} record{rows.length !== 1 ? 's' : ''})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-green-50">
                      {['Pur No','Date','Challan No','Pieces','W/S Rate','Sale Rate','Design Name','Total Rs','Design Code'].map(h => (
                        <th key={h} className="px-2 py-1 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(r => (
                      <tr key={r.id} className="hover:bg-green-50">
                        <td className="px-2 py-1 font-medium text-gray-800 whitespace-nowrap">{r.idNo}</td>
                        <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{isoToDisplay((r.date||'').slice(0,10))}</td>
                        <td className="px-2 py-1 text-gray-600">{r.challanNo}</td>
                        <td className="px-2 py-1 text-gray-700">{r.pieces}</td>
                        <td className="px-2 py-1 text-gray-700">Rs {fmtNum(r.wholeSaleRate)}</td>
                        <td className="px-2 py-1 text-gray-700">Rs {fmtNum(r.saleRate)}</td>
                        <td className="px-2 py-1 text-gray-700">{r.designName}</td>
                        <td className="px-2 py-1 font-semibold text-green-700 whitespace-nowrap">Rs {fmtNum(r.totalRs)}</td>
                        <td className="px-2 py-1 text-gray-500">{r.designCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Rename party / design */}
      {rename && (
        <Modal title={rename.kind === 'party' ? 'Edit Party Name' : 'Edit Design Name'} onClose={() => setRename(null)}>
          <p className="text-xs text-gray-500 mb-1">Current name: <b className="text-gray-800">{rename.oldName}</b></p>
          <input autoFocus className={inputCls} value={rename.value}
            onChange={e => setRename(r => ({ ...r, value: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && submitRename()} />
          <p className="text-[11px] text-gray-500 mt-1">
            {rename.kind === 'party'
              ? 'The name changes on all purchases and payments of this party.'
              : 'The name changes on all purchases and sales of this design. Design codes stay as they are.'}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setRename(null)} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button onClick={submitRename} disabled={renaming} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300">{renaming ? 'Saving...' : 'Save Name'}</button>
          </div>
        </Modal>
      )}

      {/* Add Party Modal */}
      {showPartyModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-800">Add New Party</h3>
              </div>
              <button onClick={() => setShowPartyModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Party Name */}
              <div>
                <label className={labelCls}>Party Name <span className="text-red-500">*</span></label>
                <input className={inputCls} value={newParty.name} onChange={e => setNewParty(p => ({ ...p, name: e.target.value }))} placeholder="Enter party name" />
              </div>

              {/* Phone + WhatsApp side by side */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      Phone No
                    </span>
                  </label>
                  <PhoneInput className={inputCls} value={newParty.contact} onChange={val => setNewParty(p => withContact(p, val))} />
                </div>
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.121 1.534 5.857L0 24l6.335-1.511A11.951 11.951 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.741 9.741 0 01-4.964-1.356l-.356-.212-3.693.88.941-3.601-.232-.37A9.712 9.712 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                      WhatsApp
                    </span>
                  </label>
                  <PhoneInput className={inputCls} value={newParty.whatsapp} onChange={val => setNewParty(p => ({ ...p, whatsapp: val }))} />
                </div>
              </div>

              {/* Facebook */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook ID
                  </span>
                </label>
                <input className={inputCls} value={newParty.facebook} onChange={e => setNewParty(p => ({ ...p, facebook: e.target.value }))} placeholder="Enter Facebook ID or page URL" />
              </div>

              {/* Instagram */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-pink-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    Instagram
                  </span>
                </label>
                <input className={inputCls} value={newParty.instagram} onChange={e => setNewParty(p => ({ ...p, instagram: e.target.value }))} placeholder="@username" />
              </div>

              {/* Address */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Address
                  </span>
                </label>
                <textarea className={inputCls + ' resize-none'} rows={2} value={newParty.address} onChange={e => setNewParty(p => ({ ...p, address: e.target.value }))} placeholder="Enter party address" />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={() => setShowPartyModal(false)} className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button onClick={submitNewParty} className="px-3 py-1.5 text-xs text-white bg-blue-500 rounded hover:bg-blue-600">Add Party</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Design Modal */}
      {showDesignModal && (
        <Modal title="Add New Design" onClose={() => setShowDesignModal(false)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Design Name</label>
              <input className={inputCls} value={newDesign.name} onChange={e => setNewDesign(d => ({ ...d, name: e.target.value }))} placeholder="Enter new design name" />
            </div>
            <div>
              <label className={labelCls}>Design Category</label>
              <select className={inputCls} value={newDesign.category} onChange={e => setNewDesign(d => ({ ...d, category: e.target.value }))}>
                <option value="">Select Category</option>
                {['Floral', 'Geometric', 'Abstract', 'Traditional', 'Modern', 'Classic'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea className={inputCls + ' resize-none'} rows={3} value={newDesign.description} onChange={e => setNewDesign(d => ({ ...d, description: e.target.value }))} placeholder="Enter design description" />
            </div>
          </div>
          <div className="flex items-center justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setShowDesignModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submitNewDesign} className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600">Add Design</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── product table ─────────────────────────────────────────────────────────────

function ProductTable({ products, onDelete, onReload, parties = [], designs = [], onAddParty, onAddDesign }) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddParty, setShowAddParty] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [showAddDesign, setShowAddDesign] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');

  const filtered = products.filter(p =>
    (p.idNo || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.partyName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.designName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.designCode || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openEdit(p) {
    setEditRow(p.id);
    const rawDate = p.date || '';
    const date = rawDate.length > 10 ? rawDate.slice(0, 10) : rawDate;
    setEditForm({ ...p, date });
  }

  function closeEdit() { setEditRow(null); setEditForm({}); }

  function setEditField(field, value) {
    setEditForm(f => {
      const updated = { ...f, [field]: value };
      if (['partyName', 'wholeSaleRate', 'designName', 'pieces', 'saleRate'].includes(field)) {
        const p = String(updated.partyName || '').slice(0, 3).toUpperCase();
        const rate = String(Math.floor(parseFloat(updated.wholeSaleRate) || 0)).slice(0, 3);
        updated.designCode = (p || rate || updated.designName) ? `${p}-99${rate}-${updated.designName || ''}` : '';
        const pp = String(updated.partyName || '').replace(/\s/g, '').toUpperCase().slice(0, 2);
        const wr = String(Math.floor(parseFloat(updated.wholeSaleRate) || 0)).padStart(4, '0');
        const pc = String(parseInt(updated.pieces) || 0).padStart(3, '0');
        const sr = String(Math.floor(parseFloat(updated.saleRate) || 0)).padStart(4, '0');
        const raw = pp.split('').map(c => c.charCodeAt(0) - 55).join('') + wr + pc + sr;
        updated.barcode = raw.replace(/\D/g, '').slice(0, 12).padStart(12, '0');
      }
      if (field === 'pieces' || field === 'wholeSaleRate') {
        const total = (parseFloat(updated.pieces) || 0) * (parseFloat(updated.wholeSaleRate) || 0);
        updated.totalRs = total > 0 ? total.toFixed(2) : updated.totalRs;
      }
      return updated;
    });
  }

  async function saveEdit() {
    try {
      const res = await apiFetch(`${API_URL}/api/purchases/${editRow}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_no: editForm.idNo,
          purchase_date: editForm.date,
          party_name: editForm.partyName,
          challan_no: editForm.challanNo,
          pieces: parseFloat(editForm.pieces) || 0,
          wholesale_rate: parseFloat(editForm.wholeSaleRate) || 0,
          sale_rate: parseFloat(editForm.saleRate) || 0,
          design_name: editForm.designName,
          purchase_total: parseFloat(editForm.totalRs) || 0,
          barcode: editForm.barcode,
          design_code: editForm.designCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      closeEdit();
      onReload();
    } catch (err) {
      alert('Error updating: ' + err.message);
    }
  }

  const iCls = 'w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500';
  const lCls = 'block text-xs font-medium text-gray-600 mb-0.5';

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3 space-y-2 lg:space-y-0">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search purchases" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-56 pl-7 pr-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs bg-white" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-blue-50">
            <tr>
              <th className="px-3 py-2 text-left">
                <input type="checkbox"
                  onChange={e => setSelected(e.target.checked ? paged.map(p => p.id) : [])}
                  checked={paged.length > 0 && paged.every(p => selected.includes(p.id))}
                  className="rounded border-gray-300" />
              </th>
              {['Pur No','Date','Party Name','Challan No','Pieces','W/S Rate','Sale Rate','Design Name','Total Rs','Design Code','Barcode','Actions'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paged.length === 0 && (
              <tr><td colSpan={13} className="px-3 py-6 text-center text-gray-400">No purchases found</td></tr>
            )}
            {/* every row is rendered so Print / PDF / Excel get them all; off-page rows are hidden */}
            {filtered.map((p, i) => (
              <tr key={p.id} className={`hover:bg-gray-50 ${pageCls(i, page)}`}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.includes(p.id)}
                    onChange={() => setSelected(sel => sel.includes(p.id) ? sel.filter(s => s !== p.id) : [...sel, p.id])}
                    className="rounded border-gray-300" />
                </td>
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{p.idNo}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{isoToDisplay((p.date||'').slice(0,10))}</td>
                <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{p.partyName}</td>
                <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{p.challanNo}</td>
                <td className="px-3 py-2 text-gray-900">{p.pieces}</td>
                <td className="px-3 py-2 text-gray-900 whitespace-nowrap">Rs {fmtNum(p.wholeSaleRate)}</td>
                <td className="px-3 py-2 text-gray-900 whitespace-nowrap">Rs {fmtNum(p.saleRate)}</td>
                <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{p.designName}</td>
                <td className="px-3 py-2 font-medium text-green-700 whitespace-nowrap">Rs {fmtNum(p.totalRs)}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.designCode}</td>
                <td className="px-3 py-1"><BarcodeMini value={p.barcode} /></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {/* Edit */}
                    <button onClick={() => openEdit(p)} title="Edit"
                      className="p-1 text-blue-600 hover:text-white hover:bg-blue-500 rounded transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {/* Delete */}
                    <button onClick={() => onDelete(p.id)} title="Delete"
                      className="p-1 text-red-600 hover:text-white hover:bg-red-500 rounded transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              {/* totals for the rows on this page only; screen-only, since exports carry every row */}
              <tr className="no-print bg-blue-50 border-t-2 border-blue-300 text-gray-800">
                <td></td>
                <td colSpan={4} className="px-3 py-2 font-bold whitespace-nowrap">PAGE TOTAL — {paged.length} purchases</td>
                <td className="px-3 py-2 font-bold whitespace-nowrap text-blue-700">{paged.reduce((a, p) => a + (parseFloat(p.pieces) || 0), 0)}</td>
                <td colSpan={3}></td>
                <td className="px-3 py-2 font-bold whitespace-nowrap text-green-700">Rs {Math.round(paged.reduce((a, p) => a + (parseFloat(p.totalRs) || 0), 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-gray-600">
          Showing <span className="font-medium">{filtered.length === 0 ? 0 : (page-1)*PAGE_SIZE+1}</span> to <span className="font-medium">{Math.min(page*PAGE_SIZE, filtered.length)}</span> of <span className="font-medium">{filtered.length}</span> results
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} className="px-2 py-1 text-xs text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Prev</button>
          {Array.from({ length: Math.min(totalPages,3) }, (_,i) => i+1).map(n => (
            <button key={n} onClick={() => setPage(n)} className={`px-2 py-1 text-xs rounded border ${page===n ? 'text-white bg-blue-500 border-blue-500' : 'text-gray-500 bg-white border-gray-300 hover:bg-gray-50'}`}>{n}</button>
          ))}
          {totalPages > 3 && <span className="px-1 text-xs text-gray-500">...</span>}
          {totalPages > 3 && <button onClick={() => setPage(totalPages)} className={`px-2 py-1 text-xs rounded border ${page===totalPages ? 'text-white bg-blue-500 border-blue-500' : 'text-gray-500 bg-white border-gray-300 hover:bg-gray-50'}`}>{totalPages}</button>}
          <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-2 py-1 text-xs text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Next</button>
        </div>
      </div>

      {/* Purchase Summary Footer */}
      <div className="mt-4 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-slate-800 px-4 py-2">
          <h3 className="text-sm font-bold text-white tracking-wide">Purchase Summary Report</h3>
        </div>
        <div className="bg-slate-700 p-4 text-white">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <div className="border-r border-blue-400">
            <p className="text-xs text-blue-200">Total Records</p>
            <p className="text-2xl font-bold">{products.length}</p>
          </div>
          <div className="border-r border-blue-400">
            <p className="text-xs text-blue-200">Total Suit/Pieces</p>
            <p className="text-2xl font-bold">
              {products.reduce((sum, p) => sum + (parseFloat(p.pieces) || 0), 0).toLocaleString()}
            </p>
          </div>
          <div className="border-r border-blue-400">
            <p className="text-xs text-blue-200">Total Purchase</p>
            <p className="text-2xl font-bold">
              Rs {fmtNum(products.reduce((sum, p) => sum + (parseFloat(p.totalRs) || 0), 0))}
            </p>
          </div>
          <div className="border-r border-blue-400">
            <p className="text-xs text-blue-200">Total Party</p>
            <p className="text-2xl font-bold">
              {new Set(products.map(p => p.partyName).filter(Boolean)).size}
            </p>
          </div>
          <div>
            <p className="text-xs text-blue-200">Total Designs</p>
            <p className="text-2xl font-bold">
              {new Set(products.map(p => p.designName).filter(Boolean)).size}
            </p>
          </div>
        </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editRow && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-800">Edit Purchase</h3>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><label className={lCls}>Purchase No</label><input className={iCls} value={editForm.idNo||''} onChange={e => setEditForm(f=>({...f,idNo:e.target.value}))} /></div>
              <div><label className={lCls}>Date (dd/Mon/yy)</label><input className={iCls}
                value={editForm.date ? isoToDisplay(editForm.date.slice(0,10)) : ''}
                onChange={e => {
                  const v = e.target.value;
                  setEditForm(f => ({ ...f, dateDisplay: v }));
                  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
                  if (m) setEditForm(f => ({ ...f, dateDisplay: v, date: `20${m[3]}-${m[2]}-${m[1]}` }));
                }}
                placeholder="dd/mm/yy"
              /></div>
              <div><label className={lCls}>Party Name</label>
                <div className="flex gap-1">
                  <select className={iCls} value={editForm.partyName||''} onChange={e => setEditField('partyName', e.target.value)}>
                    <option value="">Select Party</option>
                    {[...new Set([...parties.map(p=>p.name), ...products.map(p=>p.partyName)].filter(Boolean))].map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <button type="button" title="Add new party" onClick={() => setShowAddParty(v => !v)}
                    className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 whitespace-nowrap">+ New</button>
                </div>
                {showAddParty && (
                  <div className="flex gap-1 mt-1">
                    <input className={iCls} value={newPartyName} onChange={e => setNewPartyName(e.target.value)}
                      placeholder="Type new party name" autoFocus />
                    <button type="button" onClick={() => {
                      const name = newPartyName.trim();
                      if (!name) return;
                      if (onAddParty) onAddParty({ name });
                      setEditField('partyName', name);
                      setNewPartyName('');
                      setShowAddParty(false);
                    }} className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 whitespace-nowrap">Add</button>
                    <button type="button" onClick={() => { setShowAddParty(false); setNewPartyName(''); }}
                      className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 whitespace-nowrap">Cancel</button>
                  </div>
                )}
              </div>
              <div><label className={lCls}>Challan No</label><input className={iCls} value={editForm.challanNo||''} onChange={e => setEditForm(f=>({...f,challanNo:e.target.value}))} /></div>
              <div><label className={lCls}>Pieces</label><input type="number" className={iCls} value={editForm.pieces||''} onChange={e => setEditField('pieces', e.target.value)} /></div>
              <div><label className={lCls}>Wholesale Rate</label><input type="number" className={iCls} value={editForm.wholeSaleRate||''} onChange={e => setEditField('wholeSaleRate', e.target.value)} /></div>
              <div><label className={lCls}>Sale Rate</label><input type="number" className={iCls} value={editForm.saleRate||''} onChange={e => setEditField('saleRate', e.target.value)} /></div>
              <div><label className={lCls}>Design Name</label>
                <div className="flex gap-1">
                  <select className={iCls} value={editForm.designName||''} onChange={e => setEditField('designName', e.target.value)}>
                    <option value="">Select Design</option>
                    {[...new Set([...designs, ...products.map(p=>p.designName)].filter(Boolean))].map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <button type="button" title="Add new design" onClick={() => setShowAddDesign(v => !v)}
                    className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 whitespace-nowrap">+ New</button>
                </div>
                {showAddDesign && (
                  <div className="flex gap-1 mt-1">
                    <input className={iCls} value={newDesignName} onChange={e => setNewDesignName(e.target.value)}
                      placeholder="Type new design name" autoFocus />
                    <button type="button" onClick={() => {
                      const name = newDesignName.trim();
                      if (!name) return;
                      if (onAddDesign) onAddDesign(name);
                      setEditField('designName', name);
                      setNewDesignName('');
                      setShowAddDesign(false);
                    }} className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 whitespace-nowrap">Add</button>
                    <button type="button" onClick={() => { setShowAddDesign(false); setNewDesignName(''); }}
                      className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 whitespace-nowrap">Cancel</button>
                  </div>
                )}
              </div>
              <div><label className={lCls}>Purchase Total Rs</label><input type="number" className={iCls} value={editForm.totalRs||''} onChange={e => setEditForm(f=>({...f,totalRs:e.target.value}))} /></div>
              <div><label className={lCls}>Design Code</label><input className={iCls} value={editForm.designCode||''} onChange={e => setEditForm(f=>({...f,designCode:e.target.value}))} /></div>
              <div className="col-span-2">
                <label className={lCls}>Barcode</label>
                <input className={iCls} value={editForm.barcode||''} onChange={e => setEditForm(f=>({...f,barcode:e.target.value}))} />
                {editForm.barcode && (
                  <div className="mt-2 flex justify-center">
                    <BarcodeCanvas value={editForm.barcode} designCode={editForm.designCode} saleRate={editForm.saleRate} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button onClick={closeEdit} className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button onClick={saveEdit} className="px-3 py-1.5 text-xs text-white bg-blue-500 rounded hover:bg-blue-600">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── payment data entry ────────────────────────────────────────────────────────

const API_PAY = API_URL;

// Sidebar links under Log Out (the shop's website and its admin); they open in a new tab
const ADMIN_PAGE_URL   = 'https://kstu-delta.vercel.app/admin/orders';
const WEBSITE_PAGE_URL = 'https://kstu-delta.vercel.app/';

function generatePaymentId(n) {
  return `PAY-${String(n).padStart(6, '0')}`;
}

function nextPayIdFromList(list) {
  let max = 0;
  list.forEach(p => {
    const m = String(p.payment_id || '').match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return generatePaymentId(max + 1);
}

const DEFAULT_BANKS         = ['HBL', 'MCB', 'UBL', 'Meezan Bank', 'Allied Bank', 'Bank Alfalah', 'Faysal Bank', 'Standard Chartered', 'Cash'];
const DEFAULT_PAYMENT_TYPES = ['Expenses', 'Salary Expenses', 'Rent Expenses', 'KE Expenses', 'Tea Expense', 'Entertainment Expenses', 'Maintenance Expenses', 'Other Exp'];
const DEFAULT_EXPENSE_TYPES     = ['Amir Salary', 'Asif Salary', 'Rent Expenses', 'Maintenance Exp', 'Tea Exp', 'Entertainment Exp', 'KE Exp', 'Cartage'];
const DEFAULT_PARTY_PAY_TYPES   = ['Party Payment', 'Advance Payment', 'Full Payment', 'Partial Payment'];

function PaymentEntry({ parties, mode = 'party' }) {
  const today = todayISO();
  const isExpense = mode === 'expense';

  // these must be initialized before emptyForm
  const [partyPayTypes, setPartyPayTypes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('partyPayTypes')) || DEFAULT_PARTY_PAY_TYPES; }
    catch { return DEFAULT_PARTY_PAY_TYPES; }
  });
  const [paymentTypes, setPaymentTypes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('paymentTypes'));
      if (!saved || saved.includes('Cash') || saved.includes('RTGS') || saved.includes('Asif Salary') || !saved.includes('Expenses')) return DEFAULT_PAYMENT_TYPES;
      return saved;
    } catch { return DEFAULT_PAYMENT_TYPES; }
  });
  const [showPartyPayTypeModal, setShowPartyPayTypeModal] = useState(false);
  const [newPartyPayTypeName, setNewPartyPayTypeName] = useState('');
  const [expenseDescs, setExpenseDescs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('expenseDescs')) || DEFAULT_EXPENSE_TYPES; }
    catch { return DEFAULT_EXPENSE_TYPES; }
  });
  const [showExpenseDescModal, setShowExpenseDescModal] = useState(false);
  const [newExpenseDescName, setNewExpenseDescName] = useState('');
  const [addDescFromSelect, setAddDescFromSelect] = useState(false);

  const emptyForm = () => ({ paymentId: '', date: today, paymentType: isExpense ? 'Expenses' : (partyPayTypes[0] || 'Party Payment'), partyName: isExpense ? 'Expenses' : '', bank: '', chequeNo: '', amount: '', remarks: '' });

  const [form, setForm]           = useState(emptyForm());
  const [payments, setPayments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [editId, setEditId]       = useState(null);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [newParty, setNewParty]   = useState({ name: '', contact: '', whatsapp: '' });
  const [amountWords, setAmountWords] = useState('');
  const [banks, setBanks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('paymentBanks')) || DEFAULT_BANKS; }
    catch { return DEFAULT_BANKS; }
  });
  const [showBankModal, setShowBankModal] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [showManagePartyModal, setShowManagePartyModal] = useState(false);
  const [newPayPartyName, setNewPayPartyName] = useState('');
  const [payParties, setPayParties] = useState(() => {
    try { return JSON.parse(localStorage.getItem('paymentParties')) || []; }
    catch { return []; }
  });
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const [purchaseParties, setPurchaseParties] = useState([]);
  const [purchaseRows, setPurchaseRows] = useState([]);

  // load payments
  const load = () => {
    setLoading(true);
    apiFetch(`${API_PAY}/api/payments`)
      .then(r => r.json())
      .then(data => { setPayments(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // reset form when switching between party/expense mode
  useEffect(() => {
    setEditId(null);
    setForm(f => ({ ...emptyForm(), paymentId: nextPayIdFromList(payments) }));
  }, [mode]);

  // load unique party names from purchase table
  useEffect(() => {
    apiFetch(`${API_URL}/api/purchases`)
      .then(r => r.json())
      .then(data => {
        const names = [...new Set(data.map(r => r.party_name).filter(Boolean))].sort();
        setPurchaseParties(names);
        setPurchaseRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
  }, []);

  // auto next id
  useEffect(() => {
    if (!editId && payments.length >= 0) {
      setForm(f => ({ ...f, paymentId: nextPayIdFromList(payments) }));
    }
  }, [payments, editId]);

  // amount in words
  useEffect(() => {
    const n = parseFloat(form.amount) || 0;
    setAmountWords(n > 0 ? numberToWords(n) : '');
  }, [form.amount]);

  const partyOptions = [...new Set([
    ...purchaseParties,
    ...payParties,
  ].filter(Boolean))].sort();

  async function handleSave() {
    if (!isExpense && !form.partyName) return alert('Party Name is required');
    if (!form.amount || parseFloat(form.amount) <= 0) return alert('Amount is required');
    const paymentId = form.paymentId || nextPayIdFromList(payments);
    setSaving(true);
    const body = {
      payment_id:   paymentId,
      payment_date: form.date,
      payment_type: form.paymentType,
      party_name:   form.partyName,
      bank:         form.bank,
      cheque_no:    form.chequeNo,
      amount:       parseFloat(form.amount) || 0,
      remarks:      form.remarks,
    };
    try {
      if (editId) {
        await apiFetch(`${API_PAY}/api/payments/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await apiFetch(`${API_PAY}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setEditId(null);
      setForm(emptyForm());
      load();
      setSuccessMsg(editId ? 'Payment updated successfully!' : 'Payment Data Entry is saved successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) { alert('Save failed'); }
    setSaving(false);
  }

  function handleEdit(p) {
    setEditId(p.payment_id);
    setForm({
      paymentId:   p.payment_id,
      date:        (p.payment_date || '').slice(0, 10),
      paymentType: p.payment_type || (isExpense ? '' : 'Party Payment'),
      partyName:   p.party_name,
      bank:        p.bank || '',
      chequeNo:    p.cheque_no || '',
      amount:      p.amount,
      remarks:     p.remarks || '',
    });
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this payment?')) return;
    await apiFetch(`${API_PAY}/api/payments/${id}`, { method: 'DELETE' });
    load();
  }

  function handleCancel() {
    setEditId(null);
    setForm({ ...emptyForm(), paymentId: nextPayIdFromList(payments) });
  }

  function submitNewParty() {
    if (!newParty.name.trim()) return;
    const p = { name: newParty.name.trim(), contact: newParty.contact, whatsapp: newParty.whatsapp };
    savePayParties([...payParties, p.name]);
    setForm(f => ({ ...f, partyName: p.name }));
    setNewParty({ name: '', contact: '', whatsapp: '' });
    setShowPartyModal(false);
  }

  function saveBanks(updated) {
    setBanks(updated);
    localStorage.setItem('paymentBanks', JSON.stringify(updated));
  }

  function addBank() {
    const name = newBankName.trim();
    if (!name || banks.includes(name)) return;
    saveBanks([...banks, name]);
    setNewBankName('');
  }

  function deleteBank(name) {
    if (!window.confirm(`Remove "${name}" from bank list?`)) return;
    saveBanks(banks.filter(b => b !== name));
    if (form.bank === name) set('bank', '');
  }

  function savePayParties(updated) {
    setPayParties(updated);
    localStorage.setItem('paymentParties', JSON.stringify(updated));
  }
  function addPayParty() {
    const name = newPayPartyName.trim();
    if (!name || payParties.includes(name)) return;
    savePayParties([...payParties, name]);
    setNewPayPartyName('');
  }
  function deletePayParty(name) {
    savePayParties(payParties.filter(p => p !== name));
    if (form.partyName === name) set('partyName', '');
  }

  function savePartyPayTypes(updated) {
    setPartyPayTypes(updated);
    localStorage.setItem('partyPayTypes', JSON.stringify(updated));
  }
  function addPartyPayType() {
    const name = newPartyPayTypeName.trim();
    if (!name || partyPayTypes.includes(name)) return;
    savePartyPayTypes([...partyPayTypes, name]);
    setNewPartyPayTypeName('');
  }
  function deletePartyPayType(name) {
    savePartyPayTypes(partyPayTypes.filter(t => t !== name));
    if (form.paymentType === name) set('paymentType', partyPayTypes[0] || '');
  }

  function saveExpenseDescs(updated) {
    setExpenseDescs(updated);
    localStorage.setItem('expenseDescs', JSON.stringify(updated));
  }
  function addExpenseDesc() {
    const name = newExpenseDescName.trim();
    if (!name) return;
    if (!expenseDescs.includes(name)) saveExpenseDescs([...expenseDescs, name]);
    setNewExpenseDescName('');
    // Opened via "+ Add New Description": pick the new entry and go straight back to the form
    if (addDescFromSelect) {
      set('remarks', name);
      setAddDescFromSelect(false);
      setShowExpenseDescModal(false);
    }
  }
  function deleteExpenseDesc(name) {
    saveExpenseDescs(expenseDescs.filter(d => d !== name));
    if (form.remarks === name) set('remarks', '');
  }

  function savePaymentTypes(updated) {
    setPaymentTypes(updated);
    localStorage.setItem('paymentTypes', JSON.stringify(updated));
  }

  function addPaymentType() {
    const name = newTypeName.trim();
    if (!name || paymentTypes.includes(name)) return;
    savePaymentTypes([...paymentTypes, name]);
    setNewTypeName('');
  }

  function deletePaymentType(name) {
    if (!window.confirm(`Remove "${name}" from payment types?`)) return;
    savePaymentTypes(paymentTypes.filter(t => t !== name));
    if (form.paymentType === name) set('paymentType', '');
  }

  const iCls = 'w-full px-3 py-1.5 border border-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 focus:bg-white text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:text-slate-500 bg-slate-100';
  const lCls = 'block text-xs font-bold text-gray-800 mb-1';

  // Selected party's account: purchases from them vs payments made to them
  const partySummary = (() => {
    if (isExpense || !form.partyName) return null;
    const rows = purchaseRows.filter(r => r.party_name === form.partyName).sort((a, b) => b.id - a.id);
    const paid = payments.filter(p => p.party_name === form.partyName);
    const totalPurchase = rows.reduce((a, r) => a + (parseFloat(r.purchase_total) || 0), 0);
    const totalPaidParty = paid.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const lastPay = [...paid].sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))[0];
    return {
      phone: (rows.find(r => r.phone_no) || {}).phone_no || '',
      whatsapp: (rows.find(r => r.whatsapp) || {}).whatsapp || '',
      purchases: rows.length,
      totalPurchase, totalPaidParty,
      balance: totalPurchase - totalPaidParty,
      lastPay,
    };
  })();
  const rs = n => 'Rs ' + Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  // Cheque number only applies to a real bank, not to cash ("Cash", "cash in hand") or when no bank is chosen
  const needsCheque = bank => !!bank && !bank.toLowerCase().includes('cash');

  const displayPayments = isExpense
    ? payments.filter(p => p.payment_type !== 'Party Payment')
    : payments.filter(p => p.payment_type === 'Party Payment');
  const totalPaid = displayPayments.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* ── summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-2 sm:px-4 pt-2">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-1.5 flex items-center justify-between">
          <p className="text-xs text-gray-500">{isExpense ? 'Total Expenses' : 'Total Payments'}</p>
          <p className="text-lg font-bold text-gray-800">{displayPayments.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-1.5 flex items-center justify-between">
          <p className="text-xs text-gray-500">{isExpense ? 'Expense Types' : 'Total Parties'}</p>
          <p className="text-lg font-bold text-blue-700">{isExpense ? [...new Set(displayPayments.map(p => p.payment_type).filter(Boolean))].length : [...new Set(displayPayments.map(p => p.party_name))].length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-1.5 flex items-center justify-between">
          <p className="text-xs text-gray-500">Total Amount Paid</p>
          <p className="text-lg font-bold text-green-600">Rs {totalPaid.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      {/* ── form ── */}
      <div className="no-print bg-white rounded-lg border border-gray-200 shadow-sm mx-4 mt-2 mb-2 px-3 py-2">
        <FormHeader icon={formIcons.payment}
          title={editId ? `Edit ${isExpense ? 'Expense' : 'Payment'}` : isExpense ? 'Expenses Data Entry' : 'Party Payment Data Entry'}
          subtitle={isExpense ? 'Record a shop expense' : 'Select a party to see their account, then record the payment'}
          onClear={handleCancel} clearLabel={editId ? 'Cancel Edit' : 'Clear Form'}
          onSave={handleSave} saving={saving}
          saveLabel={editId ? `Update ${isExpense ? 'Expense' : 'Payment'}` : isExpense ? 'Save Expense' : 'Save Payment'} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <div className="lg:col-span-2 space-y-2">
            <SectionCard title={isExpense ? 'Expense Details' : 'Payment Details'} accent="blue" icon={sectionIcons.sale}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
                <div>
                  <label className={lCls}>Payment ID</label>
                  <input className={iCls + ' bg-gray-100 text-gray-500'} value={form.paymentId} readOnly />
                </div>
                <div>
                  <label className={lCls}>Date</label>
                  <div className="relative">
                    <input readOnly className={iCls + ' cursor-pointer !px-2 !pr-7'}
                      value={form.date ? isoToDisplay(form.date) : ''}
                      placeholder="dd/mm/yy"
                      onClick={() => document.getElementById('hiddenPaymentDatePicker').showPicker()}
                    />
                    <button type="button"
                      onClick={() => document.getElementById('hiddenPaymentDatePicker').showPicker()}
                      className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 hover:text-blue-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </button>
                    <input id="hiddenPaymentDatePicker" type="date"
                      className="absolute opacity-0 pointer-events-none w-0 h-0"
                      value={form.date} onChange={e => set('date', e.target.value)} />
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <label className={lCls}>Payment Type</label>
                  {isExpense ? (
                    <div className="flex gap-1">
                      <select className={iCls} value={form.paymentType} onChange={e => set('paymentType', e.target.value)}>
                        <option value="">Select Type</option>
                        {paymentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={() => setShowTypeModal(true)}
                        className="px-2 py-1 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 whitespace-nowrap">⚙</button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <select className={iCls} value={form.paymentType} onChange={e => set('paymentType', e.target.value)}>
                        <option value="">Select Type</option>
                        {partyPayTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={() => setShowPartyPayTypeModal(true)}
                        className="px-2 py-1 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 whitespace-nowrap">⚙</button>
                    </div>
                  )}
                </div>
                {!isExpense ? (
                  <div className="lg:col-span-2">
                    <label className={lCls}>Party Name</label>
                    <div className="flex gap-1">
                      <select className={iCls} value={form.partyName} onChange={e => set('partyName', e.target.value)}>
                        <option value="">Select Party</option>
                        {partyOptions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button onClick={() => setShowManagePartyModal(true)}
                        className="px-2 py-1 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 whitespace-nowrap">⚙</button>
                    </div>
                  </div>
                ) : (
                  <div className="lg:col-span-2">
                    <label className={lCls}>Expense Description</label>
                    <div className="flex gap-1">
                      <select className={iCls} value={form.remarks} onChange={e => {
                        if (e.target.value === '__add__') { setAddDescFromSelect(true); setShowExpenseDescModal(true); return; }
                        set('remarks', e.target.value);
                      }}>
                        <option value="">Select Description</option>
                        {expenseDescs.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="__add__">+ Add New Description</option>
                      </select>
                      <button onClick={() => setShowExpenseDescModal(true)}
                        className="px-2 py-1 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 whitespace-nowrap">⚙</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                <div>
                  <label className={lCls}>Bank</label>
                  <div className="flex gap-1">
                    <select className={iCls} value={form.bank} onChange={e => {
                      const bank = e.target.value;
                      setForm(f => ({ ...f, bank, chequeNo: needsCheque(bank) ? f.chequeNo : '' }));
                    }}>
                      <option value="">Select Bank</option>
                      {banks.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button onClick={() => setShowBankModal(true)}
                      className="px-2 py-1 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 whitespace-nowrap">⚙</button>
                  </div>
                </div>
                <div>
                  <label className={lCls}>Cheque No</label>
                  {needsCheque(form.bank) ? (
                    <input className={iCls} value={form.chequeNo} onChange={e => set('chequeNo', e.target.value)} placeholder="Enter cheque number" />
                  ) : (
                    <input disabled className={iCls + ' bg-gray-200 border-gray-300 cursor-not-allowed'} value=""
                      placeholder={form.bank ? 'Not needed for cash' : 'Select a bank first'} />
                  )}
                </div>
                {!isExpense && (
                  <div>
                    <label className={lCls}>Remarks</label>
                    <input className={iCls} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Notes / remarks..." />
                  </div>
                )}
              </div>
            </SectionCard>

            {!isExpense && (
              <SectionCard title="Party Information" accent="emerald" highlight icon={sectionIcons.customer}>
                {partySummary ? (
                  <>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2 text-sm">
                      <span><span className="font-semibold text-gray-500">Party </span><span className="font-bold text-gray-900">{form.partyName}</span></span>
                      <span><span className="font-semibold text-gray-500">Phone </span><span className="font-bold text-gray-900">{partySummary.phone || '—'}</span></span>
                      <span><span className="font-semibold text-gray-500">WhatsApp </span><span className="font-bold text-gray-900">{partySummary.whatsapp || '—'}</span></span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                      {[
                        ['Purchases', partySummary.purchases, 'text-gray-900'],
                        ['Total Purchase', rs(partySummary.totalPurchase), 'text-gray-900'],
                        ['Total Paid', rs(partySummary.totalPaidParty), 'text-green-700'],
                        ['Balance Due', rs(partySummary.balance), partySummary.balance > 0 ? 'text-red-600' : 'text-green-700'],
                        // date goes in the label so the amount fits on one line
                        [partySummary.lastPay
                          ? `Last Payment · ${isoToDisplay(new Date(partySummary.lastPay.payment_date).toLocaleDateString('en-CA'))}`
                          : 'Last Payment',
                         partySummary.lastPay ? rs(parseFloat(partySummary.lastPay.amount) || 0) : '—', 'text-gray-900'],
                      ].map(([label, value, color], i, all) => (
                        <div key={label} className={`rounded-md px-2 py-1 ${i === all.length - 1 ? 'col-span-2' : ''} ${
                          label === 'Balance Due' && partySummary.balance > 0 ? 'bg-red-50 border-2 border-red-400' : 'bg-white border border-green-100'}`}>
                          <p className={`text-[11px] font-semibold whitespace-nowrap ${label === 'Balance Due' && partySummary.balance > 0 ? 'text-red-700' : 'text-gray-500'}`}>{label}</p>
                          <p className={`text-sm font-bold whitespace-nowrap ${color}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 italic">Select a party above to see their phone, purchases, payments and balance.</p>
                )}
              </SectionCard>
            )}
          </div>

          <div className="space-y-2">
            <SectionCard title={isExpense ? 'Expense Amount' : 'Payment Amount'} accent="amber" icon={sectionIcons.bill}>
              <label className={lCls}>Amount (Rs)</label>
              <input type="number" className={iCls + ' text-2xl font-extrabold text-slate-900 py-2'} value={form.amount}
                onChange={e => set('amount', e.target.value)} placeholder="0.00" min="0" />
              <p className="text-xs text-gray-500 italic mt-1 px-1.5 py-0.5 bg-gray-50 rounded border-l-2 border-slate-400">
                {amountWords || 'Zero Rupees Only'}
              </p>
              {partySummary && (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 text-sm overflow-hidden">
                  <div className="px-2.5 pt-1.5 pb-1 space-y-0.5">
                    <div className="flex justify-between"><span className="text-gray-600">Balance due</span><span className="font-bold text-red-600">{rs(partySummary.balance)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">− This payment</span><span className="font-bold text-green-700">{rs(parseFloat(form.amount) || 0)}</span></div>
                  </div>
                  {/* the number the user cares about most: shown as a solid red (still owed) or green (cleared) strip */}
                  <div className={`flex justify-between items-center px-2.5 py-2 text-white ${partySummary.balance - (parseFloat(form.amount) || 0) > 0 ? 'bg-red-600' : 'bg-green-600'}`}>
                    <span className="font-bold uppercase tracking-wide text-xs">Balance after</span>
                    <span className="text-xl font-extrabold">{rs(partySummary.balance - (parseFloat(form.amount) || 0))}</span>
                  </div>
                </div>
              )}
            </SectionCard>

            {successMsg && (
              <div className="px-4 py-2.5 bg-green-50 border border-green-300 rounded-lg flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-xs font-semibold text-green-700">{successMsg}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── table panel ── */}
      <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : (
            <PagedTable><table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  {['#','Payment ID','Date','Payment Type','Party Name','Bank','Cheque No','Amount','Remarks','Actions'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 bg-gray-100 border-b-2 border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayPayments.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">{isExpense ? 'No expenses found' : 'No payments found'}</td></tr>
                )}
                {displayPayments.map((p, i) => (
                  <tr key={p.payment_id} className={`hover:bg-blue-50 ${editId === p.payment_id ? 'bg-slate-50 ring-1 ring-slate-300' : ''}`}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold text-blue-700">{p.payment_id}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{isoToDisplay((p.payment_date || '').slice(0, 10))}</td>
                    <td className="px-3 py-2">
                      {p.payment_type ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">{p.payment_type}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{p.party_name}</td>
                    <td className="px-3 py-2 text-gray-600">{p.bank || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{p.cheque_no || '—'}</td>
                    <td className="px-3 py-2 font-bold text-green-700">Rs {parseFloat(p.amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{p.remarks || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={() => handleEdit(p)} className="text-blue-600 hover:underline mr-3">Edit</button>
                      <button onClick={() => handleDelete(p.payment_id)} className="text-red-500 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {displayPayments.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 border-t-2 border-gray-300">
                    <td colSpan={7} className="px-3 py-2 font-bold text-gray-700">TOTAL — {displayPayments.length} {isExpense ? 'expenses' : 'payments'}</td>
                    <td className="px-3 py-2 font-bold text-green-700">Rs {totalPaid.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table></PagedTable>
          )}
      </div>

      {/* ── Add New Party modal ── */}
      {showPartyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-xs mx-4 flex flex-col gap-3">
            <h3 className="font-bold text-gray-800 text-sm">Add New Party</h3>
            <div>
              <label className={lCls}>Party Name *</label>
              <input className={iCls} value={newParty.name} onChange={e => setNewParty(p => ({ ...p, name: e.target.value }))} placeholder="Enter party name" />
            </div>
            <div>
              <label className={lCls}>Phone No</label>
              <PhoneInput className={iCls} value={newParty.contact}
                onChange={val => setNewParty(p => withContact(p, val))} />
            </div>
            <div>
              <label className={lCls}>WhatsApp</label>
              <PhoneInput className={iCls} value={newParty.whatsapp} onChange={val => setNewParty(p => ({ ...p, whatsapp: val }))} />
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={submitNewParty} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700">Add Party</button>
              <button onClick={() => setShowPartyModal(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-300">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Expense Descriptions modal ── */}
      {showExpenseDescModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-sm">{addDescFromSelect ? 'Add New Expense Description' : 'Manage Expense Descriptions'}</h3>
              <button onClick={() => { setShowExpenseDescModal(false); setAddDescFromSelect(false); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                className={iCls} autoFocus
                value={newExpenseDescName}
                onChange={e => setNewExpenseDescName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExpenseDesc()}
                placeholder="Enter description..."
              />
              <button onClick={addExpenseDesc}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 whitespace-nowrap">
                Add
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {expenseDescs.map(d => (
                <div key={d} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                  <span className="text-sm text-gray-800">{d}</span>
                  <button onClick={() => deleteExpenseDesc(d)}
                    className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-0.5 rounded hover:bg-red-50">
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => { setShowExpenseDescModal(false); setAddDescFromSelect(false); }}
              className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-300">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Manage Party Payment Types modal ── */}
      {showPartyPayTypeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-sm">Manage Payment Types</h3>
              <button onClick={() => setShowPartyPayTypeModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                className={iCls}
                value={newPartyPayTypeName}
                onChange={e => setNewPartyPayTypeName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPartyPayType()}
                placeholder="Enter payment type..."
              />
              <button onClick={addPartyPayType}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 whitespace-nowrap">
                Add
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {partyPayTypes.map(t => (
                <div key={t} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                  <span className="text-sm text-gray-800">{t}</span>
                  <button onClick={() => deletePartyPayType(t)}
                    className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-0.5 rounded hover:bg-red-50">
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowPartyPayTypeModal(false)}
              className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-300">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Manage Party Names modal ── */}
      {showManagePartyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-sm">Manage Party Names</h3>
              <button onClick={() => setShowManagePartyModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                className={iCls}
                value={newPayPartyName}
                onChange={e => setNewPayPartyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPayParty()}
                placeholder="Enter party name..."
              />
              <button onClick={addPayParty}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 whitespace-nowrap">
                Add
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {payParties.length === 0 && (
                <p className="px-3 py-4 text-xs text-center text-gray-400">No custom parties added yet</p>
              )}
              {payParties.map(p => (
                <div key={p} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                  <span className="text-sm text-gray-800">{p}</span>
                  <button onClick={() => deletePayParty(p)}
                    className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-0.5 rounded hover:bg-red-50">
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowManagePartyModal(false)}
              className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-300">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Manage Banks modal ── */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-sm">Manage Banks</h3>
              <button onClick={() => setShowBankModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            {/* Add new bank */}
            <div className="flex gap-2">
              <input
                className={iCls}
                value={newBankName}
                onChange={e => setNewBankName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addBank()}
                placeholder="Enter bank name..."
              />
              <button onClick={addBank}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 whitespace-nowrap">
                Add
              </button>
            </div>

            {/* Bank list */}
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {banks.length === 0 && (
                <p className="px-3 py-4 text-xs text-center text-gray-400">No banks added yet</p>
              )}
              {banks.map(b => (
                <div key={b} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                  <span className="text-sm text-gray-800">{b}</span>
                  <button onClick={() => deleteBank(b)}
                    className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-0.5 rounded hover:bg-red-50">
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => setShowBankModal(false)}
              className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-300">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Manage Payment Types modal ── */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-sm">Manage Payment Types</h3>
              <button onClick={() => setShowTypeModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            {/* Add new type */}
            <div className="flex gap-2">
              <input
                className={iCls}
                value={newTypeName}
                onChange={e => setNewTypeName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPaymentType()}
                placeholder="Enter payment type..."
              />
              <button onClick={addPaymentType}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 whitespace-nowrap">
                Add
              </button>
            </div>

            {/* Type list */}
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {paymentTypes.length === 0 && (
                <p className="px-3 py-4 text-xs text-center text-gray-400">No payment types added yet</p>
              )}
              {paymentTypes.map(t => (
                <div key={t} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                  <span className="text-sm text-gray-800">{t}</span>
                  <button onClick={() => deletePaymentType(t)}
                    className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-0.5 rounded hover:bg-red-50">
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => setShowTypeModal(false)}
              className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-300">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── purchase report ───────────────────────────────────────────────────────────

function PurchaseReport() {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [partyFilter, setPartyFilter]   = useState('');
  const [designFilter, setDesignFilter] = useState('');
  const [search, setSearch]     = useState('');

  const today        = todayISO();

  useEffect(() => {
    setDateFrom(REPORT_START_DATE);
    setDateTo(today);
    apiFetch(`${API_URL}/api/purchases`)
      .then(r => r.json())
      .then(data => {
        setPurchases(data.map(r => ({
          id:         r.id,
          purchaseNo: r.purchase_no,
          challanNo:  r.challan_no,
          date:       (r.purchase_date || '').slice(0, 10),
          party:      r.party_name,
          design:     r.design_name,
          designCode: r.design_code,
          pieces:     parseFloat(r.pieces)          || 0,
          wsRate:     parseFloat(r.wholesale_rate)  || 0,
          saleRate:   parseFloat(r.sale_rate)       || 0,
          total:      parseFloat(r.purchase_total)  || 0,
          challan:    r.challan_no,
          barcode:    r.barcode,
        })));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const inRange = d => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);

  const filtered = purchases.filter(p =>
    inRange(p.date) &&
    (!partyFilter  || p.party  === partyFilter) &&
    (!designFilter || p.design === designFilter) &&
    (!search || [p.party, p.design, p.designCode, p.purchaseNo, p.challanNo]
      .some(v => (v||'').toLowerCase().includes(search.toLowerCase())))
  );

  const allParties = [...new Set(purchases.map(p => p.party).filter(Boolean))].sort();
  const allDesigns = [...new Set(purchases.map(p => p.design).filter(Boolean))].sort();

  // ── summaries ──
  const allDates = [...new Set(filtered.map(p => p.date).filter(Boolean))].sort().reverse();

  const dateWise = allDates.map(date => {
    const rows  = filtered.filter(p => p.date === date);
    const pcs   = rows.reduce((a, p) => a + p.pieces, 0);
    const amt   = rows.reduce((a, p) => a + p.total,  0);
    const avgRate = pcs > 0 ? amt / pcs : 0;
    return { date, pcs, amt, avgRate, count: rows.length };
  });

  const partyWise = allParties.map(party => {
    const rows = filtered.filter(p => p.party === party);
    const pcs  = rows.reduce((a, p) => a + p.pieces, 0);
    const amt  = rows.reduce((a, p) => a + p.total,  0);
    const avgRate = pcs > 0 ? amt / pcs : 0;
    return { party, pcs, amt, avgRate, count: rows.length };
  }).filter(p => p.count > 0).sort((a, b) => b.amt - a.amt);

  const designWise = allDesigns.map(design => {
    const rows = filtered.filter(p => p.design === design);
    const pcs  = rows.reduce((a, p) => a + p.pieces, 0);
    const amt  = rows.reduce((a, p) => a + p.total,  0);
    const avgRate = pcs > 0 ? amt / pcs : 0;
    const wsRate  = rows[0]?.wsRate   || 0;
    const srRate  = rows[0]?.saleRate || 0;
    const designCode = rows[0]?.designCode || '';
    return { design, designCode, pcs, amt, avgRate, wsRate, srRate, count: rows.length };
  }).filter(d => d.count > 0).sort((a, b) => b.amt - a.amt);

  const totalPcs = filtered.reduce((a, p) => a + p.pieces, 0);
  const totalAmt = filtered.reduce((a, p) => a + p.total,  0);
  const avgRate  = totalPcs > 0 ? totalAmt / totalPcs : 0;

  // Summary for the filtered range
  const fmtRs       = n => 'Rs ' + Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const topParty    = [...partyWise].sort((a, b) => b.amt - a.amt)[0];
  const topDesign   = [...designWise].sort((a, b) => b.pcs - a.pcs)[0];
  const summaryCards = [
    ['Total Parties',  partyWise.length,  'text-blue-700', topParty  && topParty.amt  > 0 ? `Top: ${topParty.party} · ${fmtRs(topParty.amt)}` : ''],
    ['Total Designs',  designWise.length, 'text-blue-700', topDesign && topDesign.pcs > 0 ? `Most bought: ${topDesign.design} · ${topDesign.pcs} pcs` : ''],
    ['Total Pieces',   totalPcs,          'text-blue-700',   `${filtered.length} purchase entries`],
    ['Total Amount',   fmtRs(totalAmt),   'text-red-600',    'Paid at wholesale rate'],
  ];

  const tabs = [
    { id: 'all',    label: 'All Purchases' },
    { id: 'date',   label: 'Date Wise' },
    { id: 'party',  label: 'Party Wise' },
    { id: 'design', label: 'Design Wise' },
  ];

  const iCls = 'px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs';
  const lCls = 'block text-xs font-medium text-gray-600 mb-1';
  const thCls = 'px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap border-b-2 border-gray-200 bg-gray-50';
  const tdCls = 'px-3 py-2 text-xs';

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* ── heading ── */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 tracking-wide">Purchase Report</h2>
      </div>
      {/* ── summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-gray-100">
        {summaryCards.map(([label, value, color, sub]) => (
          <div key={label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-[11px] text-gray-500 truncate">{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── filters ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div>
          <label className={lCls}>Date From</label>
          <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={iCls + ' w-full cursor-pointer pointer-events-none'} value={dateFrom ? isoToDisplay(dateFrom) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        </div>
        <div>
          <label className={lCls}>Date To</label>
          <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={iCls + ' w-full cursor-pointer pointer-events-none'} value={dateTo ? isoToDisplay(dateTo) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        </div>
        <div>
          <label className={lCls}>Party</label>
          <select className={iCls + ' w-full'} value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
            <option value="">All Parties</option>
            {allParties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={lCls}>Design</label>
          <select className={iCls + ' w-full'} value={designFilter} onChange={e => setDesignFilter(e.target.value)}>
            <option value="">All Designs</option>
            {allDesigns.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className={lCls}>Search</label>
          <input className={iCls + ' w-full'} value={search} onChange={e => setSearch(e.target.value)} placeholder="Party / Design / Code..." />
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="flex gap-1 px-2 sm:px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto whitespace-nowrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── tab content ── */}
      <div className="flex-1 overflow-auto">

        {/* ALL PURCHASES */}
        {tab === 'all' && (
          <PagedTable><table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Date','Purchase No','Challan No','Party','Design Name','Design Code','Pieces','W/S Rate','Sale Rate','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400 text-xs">No purchases found</td></tr>
              )}
              {filtered.map((p, i) => (
                <tr key={p.id} className="hover:bg-blue-50">
                  <td className={tdCls + ' text-gray-400'}>{i + 1}</td>
                  <td className={tdCls + ' whitespace-nowrap font-medium text-gray-700'}>{isoToDisplay(p.date)}</td>
                  <td className={tdCls + ' text-blue-700 font-semibold'}>{p.purchaseNo || '—'}</td>
                  <td className={tdCls + ' text-gray-500'}>{p.challanNo || '—'}</td>
                  <td className={tdCls + ' font-medium text-gray-900'}>{p.party}</td>
                  <td className={tdCls + ' text-blue-700 font-medium'}>{p.design}</td>
                  <td className={tdCls + ' text-gray-400'}>{p.designCode}</td>
                  <td className={`${tdCls} font-bold text-blue-700`}>{p.pieces}</td>
                  <td className={tdCls}>Rs {fmtNum(p.wsRate)}</td>
                  <td className={tdCls + ' text-green-700'}>Rs {fmtNum(p.saleRate)}</td>
                  <td className={`${tdCls} font-bold text-red-700`}>Rs {p.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-400">
                  <td colSpan={7} className="px-3 py-2 text-xs font-bold text-gray-700">TOTAL — {filtered.length} entries</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-700">{totalPcs}</td>
                  <td className="px-3 py-2 text-xs font-bold text-gray-600">Rs {fmtNum(avgRate)} avg</td>
                  <td className="px-3 py-2 text-xs font-bold text-gray-500">—</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-700">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table></PagedTable>
        )}

        {/* DATE WISE */}
        {tab === 'date' && (
          <div>
            <PagedTable><table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  {['Date','Entries','Total Pieces','Avg W/S Rate','Total Amount'].map(h => (
                    <th key={h} className={thCls}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dateWise.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-xs">No data in selected range</td></tr>
                )}
                {dateWise.map(d => {
                  const dayRows = filtered.filter(p => p.date === d.date);
                  return (
                    <React.Fragment key={d.date}>
                      {/* Summary row */}
                      <tr className="bg-blue-50 border-b border-blue-100 cursor-pointer hover:bg-blue-100">
                        <td className="px-3 py-2 text-xs font-bold text-gray-800 whitespace-nowrap">{isoToDisplay(d.date)}</td>
                        <td className="px-3 py-2 text-xs text-blue-700 font-semibold">{d.count}</td>
                        <td className="px-3 py-2 text-xs font-bold text-blue-800">{d.pcs}</td>
                        <td className="px-3 py-2 text-xs text-slate-700">Rs {fmtNum(d.avgRate)}</td>
                        <td className="px-3 py-2 text-xs font-bold text-red-700">Rs {d.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                      {/* Detail rows */}
                      {dayRows.map((p, i) => (
                        <tr key={p.id} className="hover:bg-slate-50 bg-white">
                          <td className="px-3 py-1.5 text-xs text-gray-400 pl-8">↳ {p.purchaseNo || p.challanNo || `#${i+1}`}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-700">{p.party}</td>
                          <td className="px-3 py-1.5 text-xs font-medium text-blue-700">{p.design} <span className="text-gray-400">{p.designCode}</span></td>
                          <td className="px-3 py-1.5 text-xs text-blue-700 font-bold">{p.pieces} pcs × Rs {fmtNum(p.wsRate)}</td>
                          <td className="px-3 py-1.5 text-xs font-semibold text-red-700">Rs {p.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {dateWise.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-200 border-t-2 border-gray-400">
                    <td className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-700">{filtered.length} entries</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-800">{totalPcs}</td>
                    <td className="px-3 py-2 text-xs font-bold text-slate-700">Rs {fmtNum(avgRate)} avg</td>
                    <td className="px-3 py-2 text-xs font-bold text-red-700">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  </tr>
                </tfoot>
              )}
            </table></PagedTable>
          </div>
        )}

        {/* PARTY WISE */}
        {tab === 'party' && (
          <PagedTable><table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Party Name','Entries','Total Pieces','Avg W/S Rate','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {partyWise.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-xs">No data found</td></tr>
              )}
              {partyWise.map((p, i) => {
                const partyRows = filtered.filter(r => r.party === p.party);
                return (
                  <React.Fragment key={p.party}>
                    <tr className="bg-blue-50 border-b border-blue-100 hover:bg-blue-100">
                      <td className="px-3 py-2 text-xs text-gray-400 font-semibold">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-bold text-gray-900">{p.party}</td>
                      <td className="px-3 py-2 text-xs text-blue-700 font-semibold">{p.count}</td>
                      <td className="px-3 py-2 text-xs font-bold text-blue-800">{p.pcs}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">Rs {fmtNum(p.avgRate)}</td>
                      <td className="px-3 py-2 text-xs font-bold text-red-700">Rs {p.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                    {partyRows.map((r, j) => (
                      <tr key={r.id} className="hover:bg-slate-50 bg-white">
                        <td className="px-3 py-1.5 text-xs text-gray-300 pl-8">↳</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{isoToDisplay(r.date)} · {r.purchaseNo || r.challanNo || `#${j+1}`}</td>
                        <td className="px-3 py-1.5 text-xs font-medium text-blue-700">{r.design} <span className="text-gray-400">{r.designCode}</span></td>
                        <td className="px-3 py-1.5 text-xs font-bold text-blue-700">{r.pieces}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-600">Rs {fmtNum(r.wsRate)}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-red-700">Rs {r.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {partyWise.length > 0 && (
              <tfoot>
                <tr className="bg-gray-200 border-t-2 border-gray-400">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL — {allParties.filter(p => partyWise.find(pw => pw.party === p)).length} parties</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-700">{filtered.length}</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-800">{totalPcs}</td>
                  <td className="px-3 py-2 text-xs font-bold text-slate-700">Rs {fmtNum(avgRate)} avg</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-700">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table></PagedTable>
        )}

        {/* DESIGN WISE */}
        {tab === 'design' && (
          <PagedTable><table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Design Name','Design Code','Entries','W/S Rate','Sale Rate','Total Pieces','Avg Rate','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {designWise.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400 text-xs">No data found</td></tr>
              )}
              {designWise.map((d, i) => {
                const dRows = filtered.filter(r => r.design === d.design);
                return (
                  <React.Fragment key={d.design}>
                    <tr className="bg-blue-50 border-b border-blue-100 hover:bg-blue-100">
                      <td className="px-3 py-2 text-xs text-gray-400 font-semibold">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-bold text-gray-900">{d.design}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{d.designCode}</td>
                      <td className="px-3 py-2 text-xs text-blue-700 font-semibold">{d.count}</td>
                      <td className="px-3 py-2 text-xs text-slate-700 font-semibold">Rs {fmtNum(d.wsRate)}</td>
                      <td className="px-3 py-2 text-xs text-green-700 font-semibold">Rs {fmtNum(d.srRate)}</td>
                      <td className="px-3 py-2 text-xs font-bold text-blue-800">{d.pcs}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">Rs {fmtNum(d.avgRate)}</td>
                      <td className="px-3 py-2 text-xs font-bold text-red-700">Rs {d.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                    {dRows.map((r, j) => (
                      <tr key={r.id} className="hover:bg-slate-50 bg-white">
                        <td className="px-3 py-1.5 text-xs text-gray-300 pl-8">↳</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{isoToDisplay(r.date)}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-400">{r.purchaseNo || r.challanNo || `#${j+1}`}</td>
                        <td className="px-3 py-1.5 text-xs font-medium text-gray-700">{r.party}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-600">Rs {fmtNum(r.wsRate)}</td>
                        <td className="px-3 py-1.5 text-xs text-green-600">Rs {fmtNum(r.saleRate)}</td>
                        <td className="px-3 py-1.5 text-xs font-bold text-blue-700">{r.pieces}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-400">—</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-red-700">Rs {r.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {designWise.length > 0 && (
              <tfoot>
                <tr className="bg-gray-200 border-t-2 border-gray-400">
                  <td colSpan={6} className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL — {designWise.length} designs</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-800">{totalPcs}</td>
                  <td className="px-3 py-2 text-xs font-bold text-slate-700">Rs {fmtNum(avgRate)} avg</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-700">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table></PagedTable>
        )}

      </div>
    </div>
  );
}

// ── payment report ───────────────────────────────────────────────────────────

function PaymentReport() {
  const [payments, setPayments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('all');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [search, setSearch]       = useState('');

  const today        = todayISO();

  useEffect(() => {
    setDateFrom(REPORT_START_DATE);
    setDateTo(today);
    apiFetch(`${API_URL}/api/payments`)
      .then(r => r.json())
      .then(data => {
        setPayments(data.map(r => ({
          id:          r.id,
          paymentId:   r.payment_id,
          date:        (r.payment_date || '').slice(0, 10),
          party:       r.party_name,
          paymentType: r.payment_type || '',
          bank:        r.bank || '',
          chequeNo:    r.cheque_no || '',
          amount:      parseFloat(r.amount) || 0,
          remarks:     r.remarks || '',
        })));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const inRange = d => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);

  const filtered = payments.filter(p =>
    inRange(p.date) &&
    (!partyFilter || p.party === partyFilter) &&
    (!typeFilter  || p.paymentType === typeFilter) &&
    (!search || [p.party, p.paymentId, p.bank, p.chequeNo, p.remarks]
      .some(v => (v || '').toLowerCase().includes(search.toLowerCase())))
  );

  const allParties = [...new Set(payments.map(p => p.party).filter(Boolean))].sort();
  const allTypes   = [...new Set(payments.map(p => p.paymentType).filter(Boolean))].sort();

  const totalAmt    = filtered.reduce((a, p) => a + p.amount, 0);
  const totalParties = [...new Set(filtered.map(p => p.party))].length;

  // date wise
  const allDates = [...new Set(filtered.map(p => p.date).filter(Boolean))].sort().reverse();
  const dateWise = allDates.map(date => {
    const rows = filtered.filter(p => p.date === date);
    const amt  = rows.reduce((a, p) => a + p.amount, 0);
    return { date, count: rows.length, amt };
  });

  // party wise
  const partyWise = allParties.map(party => {
    const rows = filtered.filter(p => p.party === party);
    const amt  = rows.reduce((a, p) => a + p.amount, 0);
    return { party, count: rows.length, amt };
  }).filter(p => p.count > 0).sort((a, b) => b.amt - a.amt);

  // type wise
  const typeWise = allTypes.map(type => {
    const rows = filtered.filter(p => p.paymentType === type);
    const amt  = rows.reduce((a, p) => a + p.amount, 0);
    return { type, count: rows.length, amt };
  }).filter(t => t.count > 0).sort((a, b) => b.amt - a.amt);

  const tabs = [
    { id: 'all',   label: 'All Payments' },
    { id: 'date',  label: 'Date Wise' },
    { id: 'party', label: 'Party Wise' },
    { id: 'type',  label: 'Type Wise' },
  ];

  const iCls  = 'px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs';
  const lCls  = 'block text-xs font-medium text-gray-600 mb-1';
  const thCls = 'px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap border-b-2 border-gray-200 bg-gray-50';
  const tdCls = 'px-3 py-2 text-xs';

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* ── heading ── */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 tracking-wide">Payment Report</h2>
      </div>
      {/* summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 border-b border-gray-100">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
          <p className="text-xs text-gray-500">Total Payments</p>
          <p className="text-lg font-bold text-gray-800 mt-1">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
          <p className="text-xs text-gray-500">Total Parties</p>
          <p className="text-lg font-bold text-blue-700 mt-1">{totalParties}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
          <p className="text-xs text-gray-500">Total Amount Paid</p>
          <p className="text-lg font-bold text-blue-600 mt-1">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      {/* filters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div>
          <label className={lCls}>Date From</label>
          <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={iCls + ' w-full cursor-pointer pointer-events-none'} value={dateFrom ? isoToDisplay(dateFrom) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        </div>
        <div>
          <label className={lCls}>Date To</label>
          <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={iCls + ' w-full cursor-pointer pointer-events-none'} value={dateTo ? isoToDisplay(dateTo) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        </div>
        <div>
          <label className={lCls}>Party</label>
          <select className={iCls + ' w-full'} value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
            <option value="">All Parties</option>
            {allParties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={lCls}>Payment Type</label>
          <select className={iCls + ' w-full'} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lCls}>Search</label>
          <input className={iCls + ' w-full'} value={search} onChange={e => setSearch(e.target.value)} placeholder="Party / ID / Bank / Cheque..." />
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 px-2 sm:px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto whitespace-nowrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">

        {/* ALL PAYMENTS */}
        {tab === 'all' && (
          <PagedTable><table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Date','Payment ID','Party Name','Payment Type','Bank','Cheque No','Amount','Remarks'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400 text-xs">No payments found</td></tr>
              )}
              {filtered.map((p, i) => (
                <tr key={p.id} className="hover:bg-blue-50">
                  <td className={tdCls + ' text-gray-400'}>{i + 1}</td>
                  <td className={tdCls + ' whitespace-nowrap font-medium text-gray-700'}>{isoToDisplay(p.date)}</td>
                  <td className={tdCls + ' text-blue-700 font-semibold'}>{p.paymentId}</td>
                  <td className={tdCls + ' font-medium text-gray-900'}>{p.party}</td>
                  <td className={tdCls}>
                    {p.paymentType ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">{p.paymentType}</span> : '—'}
                  </td>
                  <td className={tdCls + ' text-gray-600'}>{p.bank || '—'}</td>
                  <td className={tdCls + ' text-gray-600'}>{p.chequeNo || '—'}</td>
                  <td className={tdCls + ' font-bold text-blue-800'}>Rs {p.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  <td className={tdCls + ' text-gray-500'}>{p.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-400">
                  <td colSpan={7} className="px-3 py-2 text-xs font-bold text-gray-700">TOTAL — {filtered.length} payments</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-800">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table></PagedTable>
        )}

        {/* DATE WISE */}
        {tab === 'date' && (
          <PagedTable><table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['Date','Entries','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dateWise.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-400 text-xs">No data in selected range</td></tr>
              )}
              {dateWise.map(d => {
                const dayRows = filtered.filter(p => p.date === d.date);
                return (
                  <React.Fragment key={d.date}>
                    <tr className="bg-blue-50 border-b border-blue-100 hover:bg-blue-100">
                      <td className="px-3 py-2 text-xs font-bold text-gray-800 whitespace-nowrap">{isoToDisplay(d.date)}</td>
                      <td className="px-3 py-2 text-xs text-blue-700 font-semibold">{d.count}</td>
                      <td className="px-3 py-2 text-xs font-bold text-blue-800">Rs {d.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                    {dayRows.map((p, i) => (
                      <tr key={p.id} className="hover:bg-slate-50 bg-white">
                        <td className="px-3 py-1.5 text-xs text-gray-400 pl-8">↳ {p.paymentId}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-700">{p.party} {p.paymentType ? <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">{p.paymentType}</span> : ''}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-blue-800">Rs {p.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {dateWise.length > 0 && (
              <tfoot>
                <tr className="bg-gray-200 border-t-2 border-gray-400">
                  <td className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-700">{filtered.length} entries</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-800">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table></PagedTable>
        )}

        {/* PARTY WISE */}
        {tab === 'party' && (
          <PagedTable><table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Party Name','Entries','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {partyWise.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400 text-xs">No data found</td></tr>
              )}
              {partyWise.map((p, i) => {
                const partyRows = filtered.filter(r => r.party === p.party);
                return (
                  <React.Fragment key={p.party}>
                    <tr className="bg-blue-50 border-b border-blue-100 hover:bg-blue-100">
                      <td className="px-3 py-2 text-xs text-gray-400 font-semibold">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-bold text-gray-900">{p.party}</td>
                      <td className="px-3 py-2 text-xs text-blue-700 font-semibold">{p.count}</td>
                      <td className="px-3 py-2 text-xs font-bold text-blue-800">Rs {p.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                    {partyRows.map((r, j) => (
                      <tr key={r.id} className="hover:bg-slate-50 bg-white">
                        <td className="px-3 py-1.5 text-xs text-gray-300 pl-8">↳</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{isoToDisplay(r.date)} · {r.paymentId}</td>
                        <td className="px-3 py-1.5 text-xs text-blue-600">{r.paymentType || '—'} {r.bank ? `· ${r.bank}` : ''}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-blue-800">Rs {r.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {partyWise.length > 0 && (
              <tfoot>
                <tr className="bg-gray-200 border-t-2 border-gray-400">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL — {partyWise.length} parties</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-700">{filtered.length}</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-800">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table></PagedTable>
        )}

        {/* TYPE WISE */}
        {tab === 'type' && (
          <PagedTable><table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Payment Type','Entries','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {typeWise.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400 text-xs">No data found</td></tr>
              )}
              {typeWise.map((t, i) => {
                const typeRows = filtered.filter(r => r.paymentType === t.type);
                return (
                  <React.Fragment key={t.type}>
                    <tr className="bg-green-50 border-b border-green-100 hover:bg-green-100">
                      <td className="px-3 py-2 text-xs text-gray-400 font-semibold">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-bold text-gray-900">
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{t.type}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-green-700 font-semibold">{t.count}</td>
                      <td className="px-3 py-2 text-xs font-bold text-blue-800">Rs {t.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                    {typeRows.map((r, j) => (
                      <tr key={r.id} className="hover:bg-slate-50 bg-white">
                        <td className="px-3 py-1.5 text-xs text-gray-300 pl-8">↳</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{isoToDisplay(r.date)} · {r.paymentId}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-700">{r.party} {r.bank ? `· ${r.bank}` : ''}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-blue-800">Rs {r.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {typeWise.length > 0 && (
              <tfoot>
                <tr className="bg-gray-200 border-t-2 border-gray-400">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL — {typeWise.length} types</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-700">{filtered.length}</td>
                  <td className="px-3 py-2 text-xs font-bold text-blue-800">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table></PagedTable>
        )}

      </div>
    </div>
  );
}

// ── sale report ───────────────────────────────────────────────────────────────

function SaleReport() {
  const [sales, setSales]       = useState([]);
  const [wsByCode, setWsByCode] = useState({});
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [partyFilter, setPartyFilter]   = useState('');
  const [designFilter, setDesignFilter] = useState('');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  useEffect(() => { setPage(1); }, [tab, dateFrom, dateTo, partyFilter, designFilter, search]);

  const today        = todayISO();

  useEffect(() => {
    setDateFrom(REPORT_START_DATE);
    setDateTo(today);
    apiFetch(`${API_URL}/api/sales`)
      .then(r => r.json())
      .then(data => {
        setSales(data.map(r => ({
          id:         r.id,
          saleId:     r.sale_id,
          date:       (r.sale_date || '').slice(0, 10),
          party:      r.party_name,
          design:     r.design_name,
          designCode: r.design_code,
          pieces:     parseFloat(r.sale_pieces)  || 0,
          saleRate:   parseFloat(r.sale_rate)    || 0,
          discount:   parseFloat(r.discount)     || 0,
          discountRs: parseFloat(r.discount_rs)  || 0,
          total:      parseFloat(r.sale_total)   || 0,
          wsRate:     parseFloat(r.wholesale_rate) || 0,
          barcode:    r.barcode,
        })));
        setLoading(false);
      }).catch(() => setLoading(false));
    // latest purchase wholesale rate per design code, used as cost for sales saved without one
    apiFetch(`${API_URL}/api/purchases`)
      .then(r => r.json())
      .then(data => {
        const map = {};
        [...data].sort((a, b) => a.id - b.id).forEach(p => {
          if (p.design_code && parseFloat(p.wholesale_rate) > 0) map[p.design_code] = parseFloat(p.wholesale_rate);
        });
        setWsByCode(map);
      }).catch(() => {});
  }, []);

  const inRange = d => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);

  const filtered = sales.filter(s =>
    inRange(s.date) &&
    (!partyFilter  || s.party  === partyFilter) &&
    (!designFilter || s.design === designFilter) &&
    (!search || [s.party, s.design, s.designCode, s.saleId]
      .some(v => (v || '').toLowerCase().includes(search.toLowerCase())))
  );

  const allParties = [...new Set(sales.map(s => s.party).filter(Boolean))].sort();
  const allDesigns = [...new Set(sales.map(s => s.design).filter(Boolean))].sort();

  // ── summaries ──
  const allDates = [...new Set(filtered.map(s => s.date).filter(Boolean))].sort().reverse();

  const dateWise = allDates.map(date => {
    const rows     = filtered.filter(s => s.date === date);
    const pcs      = rows.reduce((a, s) => a + s.pieces,     0);
    const amt      = rows.reduce((a, s) => a + s.total,      0);
    const discRs   = rows.reduce((a, s) => a + s.discountRs, 0);
    const avgRate  = pcs > 0 ? amt / pcs : 0;
    return { date, pcs, amt, discRs, avgRate, count: rows.length };
  });

  const partyWise = allParties.map(party => {
    const rows   = filtered.filter(s => s.party === party);
    const pcs    = rows.reduce((a, s) => a + s.pieces,     0);
    const amt    = rows.reduce((a, s) => a + s.total,      0);
    const discRs = rows.reduce((a, s) => a + s.discountRs, 0);
    const avgRate = pcs > 0 ? amt / pcs : 0;
    return { party, pcs, amt, discRs, avgRate, count: rows.length };
  }).filter(p => p.count > 0).sort((a, b) => b.amt - a.amt);

  const designWise = allDesigns.map(design => {
    const rows    = filtered.filter(s => s.design === design);
    const pcs     = rows.reduce((a, s) => a + s.pieces,     0);
    const amt     = rows.reduce((a, s) => a + s.total,      0);
    const discRs  = rows.reduce((a, s) => a + s.discountRs, 0);
    const avgRate = pcs > 0 ? amt / pcs : 0;
    const designCode = rows[0]?.designCode || '';
    return { design, designCode, pcs, amt, discRs, avgRate, count: rows.length };
  }).filter(d => d.count > 0).sort((a, b) => b.amt - a.amt);

  const totalPcs    = filtered.reduce((a, s) => a + s.pieces,     0);
  const totalAmt    = filtered.reduce((a, s) => a + s.total,      0);
  const totalDiscRs = filtered.reduce((a, s) => a + s.discountRs, 0);
  const avgRate     = totalPcs > 0 ? totalAmt / totalPcs : 0;

  // Profit = net sale − cost. Cost per piece is the wholesale rate saved on the sale,
  // or (older sales saved it as 0) the latest purchase wholesale rate for that design code.
  const costRate   = s => s.wsRate > 0 ? s.wsRate : (wsByCode[s.designCode] || 0);
  const costed     = filtered.filter(s => costRate(s) > 0);
  const totalCost  = costed.reduce((a, s) => a + s.pieces * costRate(s), 0);
  const costedSale = costed.reduce((a, s) => a + s.total, 0);
  const profit     = costedSale - totalCost;
  const uncosted   = filtered.length - costed.length;
  const grossSale  = filtered.reduce((a, s) => a + s.pieces * s.saleRate, 0);
  const designProfit = Object.values(costed.reduce((m, s) => {
    const d = m[s.design] || (m[s.design] = { design: s.design, profit: 0 });
    d.profit += s.total - s.pieces * costRate(s);
    return m;
  }, {})).sort((a, b) => b.profit - a.profit)[0];
  const topCustomer = [...partyWise].sort((a, b) => b.amt - a.amt)[0];
  const fmtRs = n => 'Rs ' + Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pct   = (a, b) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—';
  const summaryCards = [
    ['Total Sales',    filtered.length,  'text-gray-800',   `${partyWise.length} customers · ${designWise.length} designs`],
    ['Total Pieces',   totalPcs,         'text-green-700',  totalPcs > 0 ? `Avg ${fmtRs(avgRate)} per piece` : ''],
    ['Gross Sale',     fmtRs(grossSale), 'text-gray-800',   'Before discount'],
    ['Total Discount', fmtRs(totalDiscRs), 'text-red-500',  `${pct(totalDiscRs, grossSale)} of gross sale`],
    ['Net Sale Amount', fmtRs(totalAmt), 'text-green-600',  topCustomer ? `Top: ${topCustomer.party} · ${fmtRs(topCustomer.amt)}` : ''],
    ['Cost of Goods',  fmtRs(totalCost), 'text-slate-600', 'At wholesale (purchase) rate'],
    ['Profit',         fmtRs(profit),    profit >= 0 ? 'text-green-700' : 'text-red-600',
      `${pct(profit, costedSale)} margin on sale${uncosted ? ` · ${uncosted} sale(s) without cost left out` : ''}`],
    ['Most Profitable Design', designProfit ? designProfit.design : '—', 'text-blue-700',
      designProfit ? `${fmtRs(designProfit.profit)} profit` : ''],
  ];

  const tabs = [
    { id: 'all',    label: 'All Sales' },
    { id: 'date',   label: 'Date Wise' },
    { id: 'party',  label: 'Party Wise' },
    { id: 'design', label: 'Design Wise' },
  ];

  const iCls  = 'px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500 text-xs';
  const lCls  = 'block text-xs font-semibold text-gray-700 mb-0.5';
  const thCls = 'px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap border-b-2 border-gray-200 bg-gray-50';
  const tdCls = 'px-3 py-1.5 text-xs';

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* ── heading ── */}
      <div className="flex items-baseline gap-3 px-4 pt-1 pb-2 border-b border-gray-100">
        <h2 className="text-lg font-extrabold text-gray-900">Sale Report</h2>
        <span className="text-xs text-gray-500">{dateFrom ? isoToDisplay(dateFrom) : '…'} – {dateTo ? isoToDisplay(dateTo) : '…'}</span>
      </div>
      {/* ── summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2 border-b border-gray-100">
        {summaryCards.map(([label, value, color, sub]) => (
          <div key={label} className={`rounded-lg border shadow-sm px-3 py-1.5 ${label === 'Profit' ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`text-lg font-bold leading-tight truncate ${color}`}>{value}</p>
            {sub && <p className="text-[11px] text-gray-500 truncate">{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── filters ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
        <div>
          <label className={lCls}>Date From</label>
          <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={iCls + ' w-full cursor-pointer pointer-events-none'} value={dateFrom ? isoToDisplay(dateFrom) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        </div>
        <div>
          <label className={lCls}>Date To</label>
          <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={iCls + ' w-full cursor-pointer pointer-events-none'} value={dateTo ? isoToDisplay(dateTo) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        </div>
        <div>
          <label className={lCls}>Party</label>
          <select className={iCls + ' w-full'} value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
            <option value="">All Parties</option>
            {allParties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={lCls}>Design</label>
          <select className={iCls + ' w-full'} value={designFilter} onChange={e => setDesignFilter(e.target.value)}>
            <option value="">All Designs</option>
            {allDesigns.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className={lCls}>Search</label>
          <input className={iCls + ' w-full'} value={search} onChange={e => setSearch(e.target.value)} placeholder="Party / Design / Sale ID..." />
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="flex gap-1 px-2 sm:px-4 pt-1.5 border-b border-gray-200 bg-white overflow-x-auto whitespace-nowrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${tab === t.id ? 'border-green-500 text-green-600 bg-green-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── tab content ── */}
      <div className="flex-1 overflow-auto">

        {/* ALL SALES */}
        {tab === 'all' && (
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Date','Sale ID','Party','Design Name','Design Code','Pieces','Sale Rate','Discount %','Discount Rs','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400 text-xs">No sales found</td></tr>
              )}
              {filtered.map((s, i) => (
                <tr key={s.id} className={`hover:bg-green-50 ${pageCls(i, page)}`}>
                  <td className={tdCls + ' text-gray-400'}>{i + 1}</td>
                  <td className={tdCls + ' whitespace-nowrap font-medium text-gray-700'}>{isoToDisplay(s.date)}</td>
                  <td className={tdCls + ' text-green-700 font-semibold'}>{s.saleId || '—'}</td>
                  <td className={tdCls + ' font-medium text-gray-900'}>{s.party}</td>
                  <td className={tdCls + ' text-blue-700 font-medium'}>{s.design}</td>
                  <td className={tdCls + ' text-gray-400'}>{s.designCode}</td>
                  <td className={`${tdCls} font-bold text-green-700`}>{s.pieces}</td>
                  <td className={tdCls}>Rs {fmtNum(s.saleRate)}</td>
                  <td className={tdCls + ' text-red-500'}>{s.discount}%</td>
                  <td className={tdCls + ' text-red-600 font-semibold'}>Rs {fmtNum(s.discountRs)}</td>
                  <td className={`${tdCls} font-bold text-green-800`}>Rs {s.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-400">
                  <td colSpan={6} className="px-3 py-2 text-xs font-bold text-gray-700">TOTAL — {filtered.length} entries</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-700">{totalPcs}</td>
                  <td className="px-3 py-2 text-xs font-bold text-gray-500">Rs {fmtNum(avgRate)} avg</td>
                  <td className="px-3 py-2 text-xs font-bold text-gray-500">—</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-600">Rs {totalDiscRs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-800">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* DATE WISE */}
        {tab === 'date' && (
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['Date','Entries','Total Pieces','Avg Sale Rate','Discount Rs','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dateWise.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-xs">No data in selected range</td></tr>
              )}
              {dateWise.map((d, gi) => {
                const dayRows = filtered.filter(s => s.date === d.date);
                return (
                  <React.Fragment key={d.date}>
                    <tr className={`bg-green-50 border-b border-green-100 hover:bg-green-100 ${pageCls(gi, page)}`}>
                      <td className="px-3 py-2 text-xs font-bold text-gray-800 whitespace-nowrap">{isoToDisplay(d.date)}</td>
                      <td className="px-3 py-2 text-xs text-green-700 font-semibold">{d.count}</td>
                      <td className="px-3 py-2 text-xs font-bold text-green-800">{d.pcs}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">Rs {fmtNum(d.avgRate)}</td>
                      <td className="px-3 py-2 text-xs text-red-500 font-semibold">Rs {d.discRs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td className="px-3 py-2 text-xs font-bold text-green-800">Rs {d.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                    {dayRows.map((s, i) => (
                      <tr key={s.id} className={`hover:bg-slate-50 bg-white ${pageCls(gi, page)}`}>
                        <td className="px-3 py-1.5 text-xs text-gray-400 pl-8">↳ {s.saleId || `#${i+1}`}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-700">{s.party}</td>
                        <td className="px-3 py-1.5 text-xs font-medium text-blue-700">{s.design} <span className="text-gray-400">{s.designCode}</span></td>
                        <td className="px-3 py-1.5 text-xs text-green-700 font-bold">{s.pieces} pcs × Rs {fmtNum(s.saleRate)}</td>
                        <td className="px-3 py-1.5 text-xs text-red-500">Rs {fmtNum(s.discountRs)}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-green-800">Rs {s.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {dateWise.length > 0 && (
              <tfoot>
                <tr className="bg-gray-200 border-t-2 border-gray-400">
                  <td className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-700">{filtered.length} entries</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-800">{totalPcs}</td>
                  <td className="px-3 py-2 text-xs font-bold text-gray-600">Rs {fmtNum(avgRate)} avg</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-600">Rs {totalDiscRs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-800">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* PARTY WISE */}
        {tab === 'party' && (
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Party Name','Entries','Total Pieces','Avg Sale Rate','Discount Rs','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {partyWise.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-xs">No data found</td></tr>
              )}
              {partyWise.map((p, i) => {
                const partyRows = filtered.filter(s => s.party === p.party);
                return (
                  <React.Fragment key={p.party}>
                    <tr className={`bg-blue-50 border-b border-blue-100 hover:bg-blue-100 ${pageCls(i, page)}`}>
                      <td className="px-3 py-2 text-xs text-gray-400 font-semibold">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-bold text-gray-900">{p.party}</td>
                      <td className="px-3 py-2 text-xs text-blue-700 font-semibold">{p.count}</td>
                      <td className="px-3 py-2 text-xs font-bold text-green-800">{p.pcs}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">Rs {fmtNum(p.avgRate)}</td>
                      <td className="px-3 py-2 text-xs text-red-500 font-semibold">Rs {p.discRs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td className="px-3 py-2 text-xs font-bold text-green-800">Rs {p.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                    {partyRows.map((s, j) => (
                      <tr key={s.id} className={`hover:bg-slate-50 bg-white ${pageCls(i, page)}`}>
                        <td className="px-3 py-1.5 text-xs text-gray-300 pl-8">↳</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{isoToDisplay(s.date)} · {s.saleId || `#${j+1}`}</td>
                        <td className="px-3 py-1.5 text-xs font-medium text-blue-700">{s.design} <span className="text-gray-400">{s.designCode}</span></td>
                        <td className="px-3 py-1.5 text-xs font-bold text-green-700">{s.pieces}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-600">Rs {fmtNum(s.saleRate)}</td>
                        <td className="px-3 py-1.5 text-xs text-red-500">Rs {fmtNum(s.discountRs)}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-green-800">Rs {s.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {partyWise.length > 0 && (
              <tfoot>
                <tr className="bg-gray-200 border-t-2 border-gray-400">
                  <td colSpan={2} className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL — {partyWise.length} parties</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-700">{filtered.length}</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-800">{totalPcs}</td>
                  <td className="px-3 py-2 text-xs font-bold text-gray-600">Rs {fmtNum(avgRate)} avg</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-600">Rs {totalDiscRs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-800">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* DESIGN WISE */}
        {tab === 'design' && (
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {['#','Design Name','Design Code','Entries','Total Pieces','Avg Sale Rate','Discount Rs','Total Amount'].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {designWise.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-xs">No data found</td></tr>
              )}
              {designWise.map((d, i) => {
                const dRows = filtered.filter(s => s.design === d.design);
                return (
                  <React.Fragment key={d.design}>
                    <tr className={`bg-blue-50 border-b border-blue-100 hover:bg-blue-100 ${pageCls(i, page)}`}>
                      <td className="px-3 py-2 text-xs text-gray-400 font-semibold">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-bold text-gray-900">{d.design}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{d.designCode}</td>
                      <td className="px-3 py-2 text-xs text-blue-700 font-semibold">{d.count}</td>
                      <td className="px-3 py-2 text-xs font-bold text-green-800">{d.pcs}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">Rs {fmtNum(d.avgRate)}</td>
                      <td className="px-3 py-2 text-xs text-red-500 font-semibold">Rs {d.discRs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td className="px-3 py-2 text-xs font-bold text-green-800">Rs {d.amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                    {dRows.map((s, j) => (
                      <tr key={s.id} className={`hover:bg-slate-50 bg-white ${pageCls(i, page)}`}>
                        <td className="px-3 py-1.5 text-xs text-gray-300 pl-8">↳</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{isoToDisplay(s.date)}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-400">{s.saleId || `#${j+1}`}</td>
                        <td className="px-3 py-1.5 text-xs font-medium text-gray-700">{s.party}</td>
                        <td className="px-3 py-1.5 text-xs font-bold text-green-700">{s.pieces}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-600">Rs {fmtNum(s.saleRate)}</td>
                        <td className="px-3 py-1.5 text-xs text-red-500">Rs {fmtNum(s.discountRs)}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-green-800">Rs {s.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            {designWise.length > 0 && (
              <tfoot>
                <tr className="bg-gray-200 border-t-2 border-gray-400">
                  <td colSpan={4} className="px-3 py-2 text-xs font-bold text-gray-700">GRAND TOTAL — {designWise.length} designs</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-800">{totalPcs}</td>
                  <td className="px-3 py-2 text-xs font-bold text-gray-600">Rs {fmtNum(avgRate)} avg</td>
                  <td className="px-3 py-2 text-xs font-bold text-red-600">Rs {totalDiscRs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2 text-xs font-bold text-green-800">Rs {totalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

      </div>
      <Pager page={page} onPage={setPage}
        total={{ all: filtered.length, date: dateWise.length, party: partyWise.length, design: designWise.length }[tab]}
        unit={{ all: 'sales', date: 'dates', party: 'customers', design: 'designs' }[tab]} />
    </div>
  );
}

// ── stock report ─────────────────────────────────────────────────────────────

function StockReport() {
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('stock'); // stock | date | party | design | transactions
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [designFilter, setDesignFilter] = useState('');
  const [search, setSearch] = useState('');

  const today = todayISO();

  useEffect(() => {
    setDateFrom(REPORT_START_DATE);
    setDateTo(today);
    Promise.all([
      apiFetch(`${API_URL}/api/purchases`).then(r => r.json()),
      apiFetch(`${API_URL}/api/sales`).then(r => r.json()),
    ]).then(([purData, salData]) => {
      setPurchases(purData.map(r => ({
        id: r.id,
        purchaseNo: r.purchase_no,
        challanNo: r.challan_no,
        date: (r.purchase_date || '').slice(0, 10),
        party: r.party_name,
        design: r.design_name,
        designCode: r.design_code,
        barcode: r.barcode,
        pieces: parseFloat(r.pieces) || 0,
        wsRate: parseFloat(r.wholesale_rate) || 0,
        saleRate: parseFloat(r.sale_rate) || 0,
        total: parseFloat(r.purchase_total) || 0,
      })));
      setSales(salData.map(r => ({
        id: r.id,
        saleId: r.sale_id,
        date: (r.sale_date || '').slice(0, 10),
        party: r.party_name,
        design: r.design_name,
        designCode: r.design_code,
        pieces: parseFloat(r.sale_pieces) || 0,
        saleRate: parseFloat(r.sale_rate) || 0,
        discount: parseFloat(r.discount) || 0,
        discountRs: parseFloat(r.discount_rs) || 0,
        total: parseFloat(r.sale_total) || 0,
      })));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const inRange = date => (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);

  const filteredPur = purchases.filter(p =>
    inRange(p.date) &&
    (!partyFilter || p.party === partyFilter) &&
    (!designFilter || p.design === designFilter) &&
    (!search || p.design?.toLowerCase().includes(search.toLowerCase()) || p.designCode?.toLowerCase().includes(search.toLowerCase()) || p.party?.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredSal = sales.filter(s =>
    inRange(s.date) &&
    (!partyFilter || s.party === partyFilter) &&
    (!designFilter || s.design === designFilter) &&
    (!search || s.design?.toLowerCase().includes(search.toLowerCase()) || s.designCode?.toLowerCase().includes(search.toLowerCase()) || s.party?.toLowerCase().includes(search.toLowerCase()))
  );

  // All unique designs across both tables
  const allDesigns = [...new Set([...purchases.map(p => p.design), ...sales.map(s => s.design)].filter(Boolean))].sort();
  const allParties = [...new Set([...purchases.map(p => p.party), ...sales.map(s => s.party)].filter(Boolean))].sort();

  // Overall avg purchase rate across ALL purchases (cost basis for profit calc)
  const allPurPcs  = purchases.reduce((a, p) => a + p.pieces, 0);
  const allPurAmt  = purchases.reduce((a, p) => a + p.total, 0);
  const globalAvgPurRate = allPurPcs > 0 ? allPurAmt / allPurPcs : 0;

  // Design-specific avg purchase rate (used as cost basis per sale row)
  const designPurRateMap = {};
  purchases.forEach(p => {
    if (!p.design) return;
    if (!designPurRateMap[p.design]) designPurRateMap[p.design] = { pcs: 0, amt: 0 };
    designPurRateMap[p.design].pcs += p.pieces;
    designPurRateMap[p.design].amt += p.total;
  });
  const getDesignPurRate = (design) => {
    const d = designPurRateMap[design];
    return d && d.pcs > 0 ? d.amt / d.pcs : globalAvgPurRate;
  };

  // Date-wise summary
  const allDates = [...new Set([...filteredPur.map(p => p.date), ...filteredSal.map(s => s.date)].filter(Boolean))].sort().reverse();
  const dateWise = allDates.map(date => {
    const dPur = filteredPur.filter(p => p.date === date);
    const dSal = filteredSal.filter(s => s.date === date);
    const purPcs   = dPur.reduce((a, p) => a + p.pieces, 0);
    const salPcs   = dSal.reduce((a, s) => a + s.pieces, 0);
    const purTotal = dPur.reduce((a, p) => a + p.total, 0);
    const salTotal = dSal.reduce((a, s) => a + s.total, 0);
    const purCount = dPur.length;
    const salCount = dSal.length;
    const avgPurRate = purPcs > 0 ? purTotal / purPcs : 0;
    const avgSalRate = salPcs > 0 ? salTotal / salPcs : 0;
    // profit = sale revenue − cost (each sale × design-specific purchase rate)
    const cost = dSal.reduce((a, s) => a + s.pieces * getDesignPurRate(s.design), 0);
    const profit = salTotal - cost;
    return { date, purPcs, salPcs, purTotal, salTotal, purCount, salCount, avgPurRate, avgSalRate, profit };
  });

  // Party-wise summary
  const partyWise = allParties.filter(party => !partyFilter || party === partyFilter).map(party => {
    const purPcs = filteredPur.filter(p => p.party === party).reduce((a, p) => a + p.pieces, 0);
    const salPcs = filteredSal.filter(s => s.party === party).reduce((a, s) => a + s.pieces, 0);
    const purTotal = filteredPur.filter(p => p.party === party).reduce((a, p) => a + p.total, 0);
    const salTotal = filteredSal.filter(s => s.party === party).reduce((a, s) => a + s.total, 0);
    const discountRs = filteredSal.filter(s => s.party === party).reduce((a, s) => a + s.discountRs, 0);
    const purCount = filteredPur.filter(p => p.party === party).length;
    const salCount = filteredSal.filter(s => s.party === party).length;
    return { party, purPcs, salPcs, purTotal, salTotal, discountRs, purCount, salCount };
  }).filter(p => p.purCount > 0 || p.salCount > 0).sort((a, b) => b.purTotal - a.purTotal);

  // Design-wise summary (filtered)
  const designWise = allDesigns.filter(d => !designFilter || d === designFilter).map(design => {
    const purPcs = filteredPur.filter(p => p.design === design).reduce((a, p) => a + p.pieces, 0);
    const salPcs = filteredSal.filter(s => s.design === design).reduce((a, s) => a + s.pieces, 0);
    const purTotal = filteredPur.filter(p => p.design === design).reduce((a, p) => a + p.total, 0);
    const salTotal = filteredSal.filter(s => s.design === design).reduce((a, s) => a + s.total, 0);
    const discountRs = filteredSal.filter(s => s.design === design).reduce((a, s) => a + s.discountRs, 0);
    // Latest purchase record for this design (highest id = most recent)
    const designPurs = purchases.filter(p => p.design === design).sort((a, b) => b.id - a.id);
    const designCode = designPurs[0]?.designCode || '';
    const latestWsRate = designPurs[0]?.wsRate || 0;
    return { design, designCode, purPcs, salPcs, purTotal, salTotal, discountRs, closing: purPcs - salPcs, latestWsRate };
  }).filter(d => d.purPcs > 0 || d.salPcs > 0).sort((a, b) => b.purTotal - a.purTotal);

  const totalPurPcs = filteredPur.reduce((a, p) => a + p.pieces, 0);
  const totalSalPcs = filteredSal.reduce((a, s) => a + s.pieces, 0);
  const totalPurAmt = filteredPur.reduce((a, p) => a + p.total, 0);
  const totalSalAmt = filteredSal.reduce((a, s) => a + s.total, 0);
  const totalCost   = filteredSal.reduce((a, s) => a + s.pieces * getDesignPurRate(s.design), 0);
  const totalClosing = totalPurPcs - totalSalPcs;
  const totalStockValue = designWise.reduce((a, d) => a + d.closing * d.latestWsRate, 0);

  const iCls = 'px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs';
  const lCls = 'block text-xs font-medium text-gray-600 mb-1';
  const thCls = 'px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap';
  const tdCls = 'px-3 py-2 text-xs text-gray-800 whitespace-nowrap';
  // Profit/Loss per design (filtered)
  const plByDesign = allDesigns.filter(d => !designFilter || d === designFilter).map(design => {
    const dPur = filteredPur.filter(p => p.design === design);
    const dSal = filteredSal.filter(s => s.design === design);
    const purPcs    = dPur.reduce((a, p) => a + p.pieces, 0);
    const salPcs    = dSal.reduce((a, s) => a + s.pieces, 0);
    const purCost   = dPur.reduce((a, p) => a + p.total, 0);
    const salRev    = dSal.reduce((a, s) => a + s.total, 0);
    const grossRev  = dSal.reduce((a, s) => a + s.pieces * s.saleRate, 0);
    const discRs    = dSal.reduce((a, s) => a + s.discountRs, 0);
    const wsRate    = dPur[0]?.wsRate || purchases.find(p => p.design === design)?.wsRate || 0;
    const srRate    = dPur[0]?.saleRate || purchases.find(p => p.design === design)?.saleRate || 0;
    const avgSalRate = salPcs > 0 ? dSal.reduce((a, s) => a + s.pieces * s.saleRate, 0) / salPcs : 0;
    const designCode = dPur[0]?.designCode || purchases.find(p => p.design === design)?.designCode || '';
    const costPerPc  = purPcs > 0 ? purCost / purPcs : 0;
    const profitPerPc = avgSalRate - costPerPc;
    const netProfit  = salRev - (salPcs * costPerPc);
    const margin     = salRev > 0 ? (netProfit / salRev * 100) : 0;
    const closing    = purPcs - salPcs;
    return { design, designCode, purPcs, salPcs, closing, wsRate, srRate, avgSalRate, costPerPc, profitPerPc, purCost, grossRev, discRs, salRev, netProfit, margin };
  }).filter(d => d.purPcs > 0 || d.salPcs > 0).sort((a, b) => b.netProfit - a.netProfit);

  const plTotalPurCost  = plByDesign.reduce((a, d) => a + d.purCost, 0);
  const plTotalSalRev   = plByDesign.reduce((a, d) => a + d.salRev, 0);
  const plTotalDisc     = plByDesign.reduce((a, d) => a + d.discRs, 0);
  const plTotalProfit   = plByDesign.reduce((a, d) => a + d.netProfit, 0);
  const plTotalMargin   = plTotalSalRev > 0 ? (plTotalProfit / plTotalSalRev * 100) : 0;

  const tabs = [
    { id: 'stock', label: 'Stock Ledger' },
    { id: 'date', label: 'Date Wise' },
    { id: 'party', label: 'Party Wise' },
    { id: 'design', label: 'Design Wise' },
    { id: 'transactions', label: 'All Transactions' },
    { id: 'pl', label: 'Profit / Loss' },
  ];

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading stock data...</div>;

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="px-1 pt-2">
        <h2 className="text-lg font-bold text-gray-800">Stock Ledger</h2>
      </div>
      {/* Header Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Purchase Pieces', value: totalPurPcs.toLocaleString(), color: 'blue' },
          { label: 'Sold Pieces', value: totalSalPcs.toLocaleString(), color: 'green' },
          { label: 'Closing Stock', value: totalClosing.toLocaleString(), color: totalClosing >= 0 ? 'purple' : 'red' },
          { label: 'Stock Value', value: `Rs ${totalStockValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: 'orange' },
        ].map(card => (
          <div key={card.label} className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3`}>
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className={`text-lg font-bold mt-1 text-${card.color}-600`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className={lCls}>Date From</label>
            <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={`${iCls} w-full cursor-pointer pointer-events-none`} value={dateFrom ? isoToDisplay(dateFrom) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
          </div>
          <div>
            <label className={lCls}>Date To</label>
            <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={`${iCls} w-full cursor-pointer pointer-events-none`} value={dateTo ? isoToDisplay(dateTo) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
          </div>
          <div>
            <label className={lCls}>Party</label>
            <select className={`${iCls} w-full`} value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
              <option value="">All Parties</option>
              {allParties.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={lCls}>Design</label>
            <select className={`${iCls} w-full`} value={designFilter} onChange={e => setDesignFilter(e.target.value)}>
              <option value="">All Designs</option>
              {allDesigns.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={lCls}>Search</label>
            <input className={`${iCls} w-full`} placeholder="Design / Code / Party..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${tab === t.id ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {/* ── Stock Ledger tab ── */}
          {tab === 'stock' && (() => {
            // Build per-design ledger: merge purchases+sales sorted by date, running balance
            const ledgerDesigns = [...new Set([
              ...filteredPur.map(p => p.design),
              ...filteredSal.map(s => s.design),
            ].filter(Boolean))].sort();

            let grandTotPurPcs = 0, grandTotSalPcs = 0, grandTotPurAmt = 0, grandTotSalAmt = 0;

            return (
              <div className="divide-y divide-gray-300">
                {ledgerDesigns.length === 0 && (
                  <div className="px-3 py-8 text-center text-gray-400 text-xs">No stock data found</div>
                )}
                {ledgerDesigns.map(design => {
                  const dPur = filteredPur.filter(p => p.design === design);
                  const dSal = filteredSal.filter(s => s.design === design);
                  const purInfo = purchases.find(p => p.design === design);
                  const wsRate   = purInfo?.wsRate   || 0;
                  const saleRate = purInfo?.saleRate  || 0;
                  const designCode = purInfo?.designCode || dSal[0]?.designCode || '';

                  // Merge all transactions sorted by date then type (purchase before sale)
                  const txns = [
                    ...dPur.map(p => ({ ...p, _type: 'IN' })),
                    ...dSal.map(s => ({ ...s, _type: 'OUT' })),
                  ].sort((a, b) => {
                    if (a.date < b.date) return -1;
                    if (a.date > b.date) return 1;
                    return a._type === 'IN' ? -1 : 1;
                  });

                  // Running balance
                  let balance = 0;
                  const rows = txns.map(t => {
                    if (t._type === 'IN') balance += t.pieces;
                    else balance -= t.pieces;
                    return { ...t, balance };
                  });

                  const totPurPcs = dPur.reduce((a, p) => a + p.pieces, 0);
                  const totSalPcs = dSal.reduce((a, s) => a + s.pieces, 0);
                  const totPurAmt = dPur.reduce((a, p) => a + p.total, 0);
                  const totSalAmt = dSal.reduce((a, s) => a + s.total, 0);
                  const closing   = totPurPcs - totSalPcs;
                  grandTotPurPcs += totPurPcs;
                  grandTotSalPcs += totSalPcs;
                  grandTotPurAmt += totPurAmt;
                  grandTotSalAmt += totSalAmt;

                  return (
                    <div key={design} className="mb-1">
                      {/* Design header */}
                      <div className="flex items-center gap-3 px-3 py-2 bg-gray-800 text-white">
                        <span className="font-bold text-sm">{design}</span>
                        <span className="text-gray-400 text-xs">{designCode}</span>
                        <span className="ml-2 text-xs bg-blue-700 rounded px-2 py-0.5">W/S Rs {fmtNum(wsRate)}</span>
                        <span className="text-xs bg-green-700 rounded px-2 py-0.5">Sale Rs {fmtNum(saleRate)}</span>
                        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${closing > 0 ? 'bg-blue-600' : 'bg-red-600'}`}>
                          Closing: {closing} pcs
                        </span>
                      </div>
                      {/* Ledger table */}
                      <PagedTable><table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">Date</th>
                            <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">Party</th>
                            <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">Ref No</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-blue-700 bg-blue-50 whitespace-nowrap">IN (Pcs)</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-blue-700 bg-blue-50 whitespace-nowrap">Rate</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-blue-700 bg-blue-50 whitespace-nowrap">IN Amount</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-green-700 bg-green-50 whitespace-nowrap">OUT (Pcs)</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-green-700 bg-green-50 whitespace-nowrap">Rate</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-green-700 bg-green-50 whitespace-nowrap">OUT Amount</th>
                            <th className="px-3 py-1.5 text-center font-semibold text-blue-700 bg-blue-50 whitespace-nowrap">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {rows.map((row, i) => (
                            <tr key={i} className={row._type === 'IN' ? 'bg-blue-50 border-l-4 border-blue-400' : 'bg-green-50 border-l-4 border-green-400'}>
                              <td className={`px-3 py-1.5 font-semibold whitespace-nowrap ${row._type === 'IN' ? 'text-blue-800' : 'text-green-800'}`}>{isoToDisplay(row.date)}</td>
                              <td className={`px-3 py-1.5 whitespace-nowrap font-medium ${row._type === 'IN' ? 'text-blue-700' : 'text-green-700'}`}>{row.party}</td>
                              <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">
                                {row._type === 'IN' ? row.purchaseNo || row.challanNo || '—' : row.saleId || '—'}
                              </td>
                              {/* IN cols */}
                              <td className={`px-3 py-1.5 text-center font-bold ${row._type === 'IN' ? 'text-blue-700 bg-blue-100' : 'text-gray-300 bg-white'}`}>
                                {row._type === 'IN' ? row.pieces : '—'}
                              </td>
                              <td className={`px-3 py-1.5 text-center ${row._type === 'IN' ? 'text-blue-600 bg-blue-100' : 'text-gray-300 bg-white'}`}>
                                {row._type === 'IN' ? `Rs ${fmtNum(row.wsRate)}` : '—'}
                              </td>
                              <td className={`px-3 py-1.5 text-center font-bold ${row._type === 'IN' ? 'text-blue-900 bg-blue-200' : 'text-gray-300 bg-white'}`}>
                                {row._type === 'IN' ? `Rs ${fmtNum(row.total)}` : '—'}
                              </td>
                              {/* OUT cols */}
                              <td className={`px-3 py-1.5 text-center font-bold ${row._type === 'OUT' ? 'text-green-700 bg-green-100' : 'text-gray-300 bg-white'}`}>
                                {row._type === 'OUT' ? row.pieces : '—'}
                              </td>
                              <td className={`px-3 py-1.5 text-center ${row._type === 'OUT' ? 'text-green-600 bg-green-100' : 'text-gray-300 bg-white'}`}>
                                {row._type === 'OUT' ? `Rs ${fmtNum(row.saleRate)}` : '—'}
                              </td>
                              <td className={`px-3 py-1.5 text-center font-bold ${row._type === 'OUT' ? 'text-green-900 bg-green-200' : 'text-gray-300 bg-white'}`}>
                                {row._type === 'OUT' ? `Rs ${fmtNum(row.total)}` : '—'}
                              </td>
                              {/* Running balance */}
                              <td className={`px-3 py-1.5 text-center font-bold bg-blue-50 ${row.balance > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                                {row.balance}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {/* Design subtotal */}
                        <tfoot>
                          <tr className="bg-gray-200 border-t-2 border-gray-400 font-bold text-xs">
                            <td colSpan={3} className="px-3 py-1.5 text-gray-700">
                              Total — {dPur.length} purchase{dPur.length !== 1 ? 's' : ''}, {dSal.length} sale{dSal.length !== 1 ? 's' : ''}
                            </td>
                            <td className="px-3 py-1.5 text-center text-blue-800 bg-blue-100">{totPurPcs}</td>
                            <td className="px-3 py-1.5 text-center text-blue-700 bg-blue-100">—</td>
                            <td className="px-3 py-1.5 text-center text-blue-900 bg-blue-200">Rs {fmtNum(totPurAmt)}</td>
                            <td className="px-3 py-1.5 text-center text-green-800 bg-green-100">{totSalPcs}</td>
                            <td className="px-3 py-1.5 text-center text-green-700 bg-green-100">—</td>
                            <td className="px-3 py-1.5 text-center text-green-900 bg-green-200">Rs {fmtNum(totSalAmt)}</td>
                            <td className={`px-3 py-1.5 text-center bg-blue-100 ${closing > 0 ? 'text-blue-800' : 'text-red-700'}`}>{closing}</td>
                          </tr>
                        </tfoot>
                      </table></PagedTable>
                    </div>
                  );
                })}
                {/* Grand Total */}
                {ledgerDesigns.length > 0 && (
                  <div className="px-3 py-2 bg-gray-900 text-white flex gap-6 text-xs font-bold">
                    <span>GRAND TOTAL</span>
                    <span className="text-blue-300">IN: {grandTotPurPcs} pcs · Rs {fmtNum(grandTotPurAmt)}</span>
                    <span className="text-green-300">OUT: {grandTotSalPcs} pcs · Rs {fmtNum(grandTotSalAmt)}</span>
                    <span className={`${grandTotPurPcs - grandTotSalPcs > 0 ? 'text-blue-300' : 'text-red-400'}`}>
                      CLOSING: {grandTotPurPcs - grandTotSalPcs} pcs
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Date Wise tab ── */}
          {tab === 'date' && (
            <PagedTable><table className="w-full text-[11px]" style={{tableLayout:'fixed'}}>
              <colgroup>
                <col style={{width:'70px'}}/>
                <col style={{width:'68px'}}/>
                <col style={{width:'70px'}}/>
                <col style={{width:'72px'}}/>
                <col style={{width:'90px'}}/>
                <col style={{width:'48px'}}/>
                <col style={{width:'58px'}}/>
                <col style={{width:'68px'}}/>
                <col style={{width:'48px'}}/>
                <col style={{width:'58px'}}/>
                <col style={{width:'54px'}}/>
                <col style={{width:'52px'}}/>
                <col style={{width:'68px'}}/>
                <col style={{width:'58px'}}/>
                <col style={{width:'60px'}}/>
                <col style={{width:'68px'}}/>
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-1 py-1.5 bg-gray-100 border-b-2 border-gray-300 font-semibold text-gray-600 whitespace-nowrap">Date</th>
                  <th className="px-1 py-1.5 bg-gray-100 border-b-2 border-gray-300 font-semibold text-gray-600 whitespace-nowrap">Type</th>
                  <th className="px-1 py-1.5 bg-gray-100 border-b-2 border-gray-300 font-semibold text-gray-600 whitespace-nowrap">Party</th>
                  <th className="px-1 py-1.5 bg-gray-100 border-b-2 border-gray-300 font-semibold text-gray-600 whitespace-nowrap">Design</th>
                  <th className="px-1 py-1.5 bg-gray-100 border-b-2 border-gray-300 font-semibold text-gray-600 whitespace-nowrap">Code</th>
                  <th className="px-1 py-1.5 bg-blue-100 border-b-2 border-blue-300 font-semibold text-blue-700 whitespace-nowrap">P.Pcs</th>
                  <th className="px-1 py-1.5 bg-blue-100 border-b-2 border-blue-300 font-semibold text-blue-700 whitespace-nowrap">P.Rate</th>
                  <th className="px-1 py-1.5 bg-blue-100 border-b-2 border-blue-300 font-semibold text-blue-700 whitespace-nowrap">P.Amt</th>
                  <th className="px-1 py-1.5 bg-green-100 border-b-2 border-green-300 font-semibold text-green-700 whitespace-nowrap">S.Pcs</th>
                  <th className="px-1 py-1.5 bg-green-100 border-b-2 border-green-300 font-semibold text-green-700 whitespace-nowrap">S.Rate</th>
                  <th className="px-1 py-1.5 bg-green-100 border-b-2 border-green-300 font-semibold text-green-700 whitespace-nowrap">Disc%</th>
                  <th className="px-1 py-1.5 bg-green-100 border-b-2 border-green-300 font-semibold text-green-700 whitespace-nowrap">Disc Rs</th>
                  <th className="px-1 py-1.5 bg-green-100 border-b-2 border-green-300 font-semibold text-green-700 whitespace-nowrap">S.Amt</th>
                  <th className="px-1 py-1.5 bg-slate-100 border-b-2 border-slate-300 font-semibold text-slate-700 whitespace-nowrap">P.Rate</th>
                  <th className="px-1 py-1.5 bg-slate-100 border-b-2 border-slate-300 font-semibold text-slate-700 whitespace-nowrap">Cost</th>
                  <th className="px-1 py-1.5 bg-slate-100 border-b-2 border-slate-300 font-bold text-slate-800 whitespace-nowrap">P/L</th>
                </tr>
              </thead>
              <tbody>
                {allDates.length === 0 && (
                  <tr><td colSpan={14} className="px-3 py-8 text-center text-gray-400 text-xs">No data in selected date range</td></tr>
                )}
                {allDates.map(date => {
                  const dayPur = filteredPur.filter(p => p.date === date);
                  const daySal = filteredSal.filter(s => s.date === date);
                  const rows = [
                    ...dayPur.map(p => ({ ...p, _type: 'purchase' })),
                    ...daySal.map(s => ({ ...s, _type: 'sale' })),
                  ];
                  const dayPurTotal = dayPur.reduce((a, p) => a + p.total, 0);
                  const daySalTotal = daySal.reduce((a, s) => a + s.total, 0);
                  const daySalPcs   = daySal.reduce((a, s) => a + s.pieces, 0);
                  const dayCost     = daySal.reduce((a, s) => a + s.pieces * getDesignPurRate(s.design), 0);
                  const dayProfit   = daySalTotal - dayCost;
                  return (
                    <React.Fragment key={date}>
                      {rows.map((row, i) => (
                        <tr key={`${row._type}-${row.id}-${i}`}
                          className={`border-b border-gray-100 hover:bg-gray-50 ${row._type === 'purchase' ? 'bg-blue-50/20' : 'bg-green-50/20'}`}>
                          {i === 0 && (
                            <td rowSpan={rows.length} className="px-1 py-1 font-bold text-gray-800 whitespace-nowrap align-top border-r border-gray-200 bg-gray-50">
                              {isoToDisplay(date)}
                            </td>
                          )}
                          <td className="px-1 py-1">
                            <span className={`px-1 py-0.5 rounded-full font-semibold ${row._type === 'purchase' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                              {row._type === 'purchase' ? 'Pur' : 'Sale'}
                            </span>
                          </td>
                          <td className="px-1 py-1 text-gray-700 truncate">{row.party}</td>
                          <td className="px-1 py-1 font-medium text-gray-900 truncate">{row.design}</td>
                          <td className="px-1 py-1 text-gray-400 truncate">{row.designCode}</td>
                          {/* Purchase cols */}
                          <td className="px-1 py-1 font-bold text-blue-700 bg-blue-50/40 text-center">{row._type === 'purchase' ? row.pieces : '-'}</td>
                          <td className="px-1 py-1 text-blue-700 bg-blue-50/40 text-center">{row._type === 'purchase' ? row.wsRate : '-'}</td>
                          <td className="px-1 py-1 font-semibold text-blue-900 bg-blue-100/50 text-center">{row._type === 'purchase' ? row.total.toFixed(0) : '-'}</td>
                          {/* Sale cols */}
                          <td className="px-1 py-1 font-bold text-green-700 bg-green-50/40 text-center">{row._type === 'sale' ? row.pieces : '-'}</td>
                          <td className="px-1 py-1 text-green-700 bg-green-50/40 text-center">{row._type === 'sale' ? row.saleRate : '-'}</td>
                          <td className="px-1 py-1 text-green-700 bg-green-50/40 text-center">{row._type === 'sale' ? `${row.discount}%` : '-'}</td>
                          <td className="px-1 py-1 text-red-500 bg-green-50/40 text-center">{row._type === 'sale' ? row.discountRs.toFixed(0) : '-'}</td>
                          <td className="px-1 py-1 font-semibold text-green-900 bg-green-100/50 text-center">{row._type === 'sale' ? row.total.toFixed(0) : '-'}</td>
                          {/* Purchase Rate & Cost */}
                          <td className="px-1 py-1 font-semibold text-slate-700 bg-slate-50/60 text-center">
                            {row._type === 'sale' ? getDesignPurRate(row.design).toFixed(0) : row.wsRate}
                          </td>
                          <td className="px-1 py-1 font-semibold text-slate-800 bg-slate-100/60 text-center">
                            {row._type === 'sale'
                              ? (row.pieces * getDesignPurRate(row.design)).toFixed(0)
                              : (row.pieces * row.wsRate).toFixed(0)}
                          </td>
                          {/* Profit — only on last row of the day */}
                          {i === rows.length - 1 ? (
                            <td rowSpan={1} className={`px-1 py-1 font-bold text-center border-l-2 border-l-slate-300 ${dayProfit > 0 ? 'bg-green-50 text-green-700' : dayProfit < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>
                              {dayProfit > 0 ? '+' : ''}{dayProfit.toFixed(0)}
                            </td>
                          ) : (
                            <td className="bg-slate-50/30 border-l-2 border-l-slate-200" />
                          )}
                        </tr>
                      ))}
                      {/* Day subtotal row */}
                      <tr className="bg-gray-100 border-t border-gray-300 border-b-2 border-b-gray-400">
                        <td className="px-1 py-1 font-bold text-gray-600 bg-gray-200 text-[10px]">{isoToDisplay(date)}</td>
                        <td colSpan={4} className="px-1 py-1 text-gray-500 text-[10px]">{dayPur.length}pur·{daySal.length}sal</td>
                        <td className="px-1 py-1 font-bold text-blue-800 bg-blue-100 text-center">{dayPur.reduce((a,p)=>a+p.pieces,0)}</td>
                        <td className="px-1 py-1 text-blue-700 bg-blue-100 text-center">—</td>
                        <td className="px-1 py-1 font-bold text-blue-900 bg-blue-200 text-center">{dayPurTotal.toFixed(0)}</td>
                        <td className="px-1 py-1 font-bold text-green-800 bg-green-100 text-center">{daySalPcs}</td>
                        <td className="px-1 py-1 text-green-700 bg-green-100 text-center">—</td>
                        <td className="px-1 py-1 text-green-700 bg-green-100 text-center">—</td>
                        <td className="px-1 py-1 font-bold text-red-500 bg-green-100 text-center">{daySal.reduce((a,s)=>a+s.discountRs,0).toFixed(0)}</td>
                        <td className="px-1 py-1 font-bold text-green-900 bg-green-200 text-center">{daySalTotal.toFixed(0)}</td>
                        <td className="px-1 py-1 font-bold text-slate-700 bg-slate-100 text-center">—</td>
                        <td className="px-1 py-1 font-bold text-slate-800 bg-slate-200 text-center">{dayCost.toFixed(0)}</td>
                        <td className={`px-1 py-1 font-bold text-center border-l-2 border-l-slate-400 ${dayProfit > 0 ? 'bg-green-100 text-green-800' : dayProfit < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                          {dayProfit > 0 ? '+' : ''}{dayProfit.toFixed(0)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              {allDates.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-500">
                    <td className="px-1 py-1 font-bold text-gray-700 bg-gray-200">TOTAL</td>
                    <td colSpan={4} className="px-1 py-1 text-gray-500 bg-gray-100 text-[10px]">{filteredPur.length}pur·{filteredSal.length}sal</td>
                    <td className="px-1 py-1 font-bold text-blue-800 bg-blue-200 text-center">{totalPurPcs}</td>
                    <td className="px-1 py-1 font-bold text-blue-800 bg-blue-200 text-center">—</td>
                    <td className="px-1 py-1 font-bold text-blue-900 bg-blue-300 text-center">{totalPurAmt.toFixed(0)}</td>
                    <td className="px-1 py-1 font-bold text-green-800 bg-green-200 text-center">{totalSalPcs}</td>
                    <td className="px-1 py-1 font-bold text-green-800 bg-green-200 text-center">—</td>
                    <td className="px-1 py-1 font-bold text-green-800 bg-green-200 text-center">—</td>
                    <td className="px-1 py-1 font-bold text-red-600 bg-green-200 text-center">{filteredSal.reduce((a,s)=>a+s.discountRs,0).toFixed(0)}</td>
                    <td className="px-1 py-1 font-bold text-green-900 bg-green-300 text-center">{totalSalAmt.toFixed(0)}</td>
                    <td className="px-1 py-1 font-bold text-slate-700 bg-slate-200 text-center">—</td>
                    <td className="px-1 py-1 font-bold text-slate-900 bg-slate-300 text-center">{totalCost.toFixed(0)}</td>
                    {(() => { const pl = dateWise.reduce((a,d)=>a+d.profit,0); return (
                      <td className={`px-1 py-1 font-bold text-center border-l-2 border-l-slate-500 ${pl>0?'bg-green-200 text-green-900':pl<0?'bg-red-200 text-red-800':'bg-gray-200 text-gray-600'}`}>
                        {pl>0?'+':''}{pl.toFixed(0)}
                      </td>
                    ); })()}
                  </tr>
                </tfoot>
              )}
            </table></PagedTable>
          )}

          {/* ── Date Wise Profit/Loss summary card ── */}
          {tab === 'date' && allDates.length > 0 && (() => {
            const pl = totalSalAmt - totalCost;
            return (
              <div className={`mt-4 mx-2 rounded-xl border-2 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 ${pl >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${pl >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    {pl >= 0 ? '📈' : '📉'}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Total Profit / Loss</p>
                    <p className={`text-2xl font-bold ${pl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {pl >= 0 ? '+' : ''}Rs {Math.abs(pl).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-xs text-gray-500">Sale Amount</p>
                    <p className="text-sm font-bold text-green-700">Rs {totalSalAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-gray-300 self-center text-lg">−</div>
                  <div>
                    <p className="text-xs text-gray-500">Cost</p>
                    <p className="text-sm font-bold text-slate-700">Rs {totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-gray-300 self-center text-lg">=</div>
                  <div>
                    <p className="text-xs text-gray-500">{pl >= 0 ? 'Profit' : 'Loss'}</p>
                    <p className={`text-sm font-bold ${pl >= 0 ? 'text-green-700' : 'text-red-600'}`}>{pl >= 0 ? '+' : ''}Rs {Math.abs(pl).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Party Wise tab ── */}
          {tab === 'party' && (
            <PagedTable><table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['#', 'Party Name', 'Purchase Entries', 'Purchase Pcs', 'Purchase Amt', 'Sale Entries', 'Sale Pcs', 'Balance Pcs', 'Sale Amt', 'Discount Rs', 'Balance'].map(h => (
                    <th key={h} className={thCls}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {partyWise.length === 0 && (
                  <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400 text-xs">No party data found</td></tr>
                )}
                {partyWise.map((p, i) => (
                  <tr key={p.party} className="hover:bg-blue-50">
                    <td className={tdCls + ' text-gray-400'}>{i + 1}</td>
                    <td className={`${tdCls} font-medium text-gray-900`}>{p.party}</td>
                    <td className={`${tdCls} text-blue-700`}>{p.purCount}</td>
                    <td className={`${tdCls} text-blue-700 font-semibold`}>{p.purPcs}</td>
                    <td className={tdCls}>Rs {fmtNum(p.purTotal)}</td>
                    <td className={`${tdCls} text-green-700`}>{p.salCount}</td>
                    <td className={`${tdCls} text-green-700 font-semibold`}>{p.salPcs}</td>
                    <td className={`${tdCls} font-bold ${p.purPcs - p.salPcs > 0 ? 'text-blue-700' : 'text-red-600'}`}>{p.purPcs - p.salPcs}</td>
                    <td className={tdCls}>Rs {fmtNum(p.salTotal)}</td>
                    <td className="px-3 py-2 text-xs text-red-600 font-semibold">Rs {fmtNum(p.discountRs)}</td>
                    <td className={`${tdCls} font-bold ${p.salTotal - p.purTotal >= 0 ? 'text-green-600' : 'text-slate-600'}`}>
                      Rs {fmtNum((p.salTotal - p.purTotal))}
                    </td>
                  </tr>
                ))}
              </tbody>
              {partyWise.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-xs font-bold text-gray-700">TOTAL</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-700">{partyWise.reduce((a, p) => a + p.purCount, 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-700">{partyWise.reduce((a, p) => a + p.purPcs, 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold">Rs {fmtNum(partyWise.reduce((a, p) => a + p.purTotal, 0))}</td>
                    <td className="px-3 py-2 text-xs font-bold text-green-700">{partyWise.reduce((a, p) => a + p.salCount, 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-green-700">{partyWise.reduce((a, p) => a + p.salPcs, 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-700">{partyWise.reduce((a, p) => a + p.purPcs - p.salPcs, 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold">Rs {fmtNum(partyWise.reduce((a, p) => a + p.salTotal, 0))}</td>
                    <td className="px-3 py-2 text-xs font-bold text-red-600">Rs {fmtNum(partyWise.reduce((a, p) => a + p.discountRs, 0))}</td>
                    <td className="px-3 py-2 text-xs font-bold text-green-600">Rs {fmtNum((partyWise.reduce((a, p) => a + p.salTotal, 0) - partyWise.reduce((a, p) => a + p.purTotal, 0)))}</td>
                  </tr>
                </tfoot>
              )}
            </table></PagedTable>
          )}

          {/* ── Design Wise tab ── */}
          {tab === 'design' && (
            <PagedTable><table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['#', 'Design Name', 'Design Code', 'Purchase Pcs', 'Sale Pcs', 'Closing Stock', 'Purchase Price', 'Stock Value'].map(h => (
                    <th key={h} className={thCls}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {designWise.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-xs">No design data found</td></tr>
                )}
                {designWise.map((d, i) => {
                  const stockValue = d.closing * d.latestWsRate;
                  return (
                    <tr key={d.design} className={`hover:bg-blue-50 ${d.closing <= 0 ? 'bg-red-50' : ''}`}>
                      <td className={tdCls + ' text-gray-400'}>{i + 1}</td>
                      <td className={`${tdCls} font-medium text-gray-900 whitespace-nowrap`}>{d.design}</td>
                      <td className={tdCls + ' text-gray-500 whitespace-nowrap'}>{d.designCode}</td>
                      <td className={`${tdCls} text-blue-700 font-semibold text-center`}>{d.purPcs}</td>
                      <td className={`${tdCls} text-green-700 font-semibold text-center`}>{d.salPcs}</td>
                      <td className={`${tdCls} font-bold text-center ${d.closing > 0 ? 'text-blue-700' : 'text-red-600'}`}>{d.closing}</td>
                      <td className={`${tdCls} text-gray-700 whitespace-nowrap`}>Rs {d.latestWsRate.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td className={`${tdCls} font-bold whitespace-nowrap ${stockValue > 0 ? 'text-slate-600' : 'text-gray-400'}`}>Rs {stockValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  );
                })}
              </tbody>
              {designWise.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-xs font-bold text-gray-700">TOTAL</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-700 text-center">{designWise.reduce((a, d) => a + d.purPcs, 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-green-700 text-center">{designWise.reduce((a, d) => a + d.salPcs, 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-700 text-center">{designWise.reduce((a, d) => a + d.closing, 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-gray-600">—</td>
                    <td className={`px-3 py-2 text-xs font-bold ${totalStockValue >= 0 ? 'text-slate-600' : 'text-red-600'}`}>Rs {totalStockValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  </tr>
                </tfoot>
              )}
            </table></PagedTable>
          )}

          {/* ── All Transactions tab ── */}
          {tab === 'transactions' && (
            <PagedTable><table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date', 'Type', 'Party', 'Design', 'Design Code', 'Pieces', 'Rate', 'Discount', 'Amount'].map(h => (
                    <th key={h} className={thCls}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ...filteredPur.map(p => ({ ...p, type: 'Purchase' })),
                  ...filteredSal.map(s => ({ ...s, type: 'Sale', rate: s.saleRate })),
                ].sort((a, b) => b.date.localeCompare(a.date)).map((row, i) => (
                  <tr key={`${row.type}-${row.id}-${i}`} className={`hover:bg-blue-50 ${row.type === 'Purchase' ? 'bg-blue-50/30' : 'bg-green-50/30'}`}>
                    <td className={`${tdCls} font-medium`}>{isoToDisplay(row.date)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.type === 'Purchase' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {row.type}
                      </span>
                    </td>
                    <td className={tdCls}>{row.party}</td>
                    <td className={`${tdCls} font-medium`}>{row.design}</td>
                    <td className={tdCls + ' text-gray-500'}>{row.designCode}</td>
                    <td className={`${tdCls} font-semibold`}>{row.pieces}</td>
                    <td className={tdCls}>Rs {fmtNum(row.type === 'Purchase' ? row.wsRate : row.saleRate)}</td>
                    <td className={tdCls}>{row.type === 'Sale' ? `${row.discount}%` : '-'}</td>
                    <td className={`${tdCls} font-semibold ${row.type === 'Purchase' ? 'text-blue-700' : 'text-green-700'}`}>Rs {fmtNum(row.total)}</td>
                  </tr>
                ))}
                {filteredPur.length === 0 && filteredSal.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400 text-xs">No transactions found</td></tr>
                )}
              </tbody>
            </table></PagedTable>
          )}

          {/* ── Profit / Loss tab ── */}
          {tab === 'pl' && (
            <div>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-gray-100">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Purchase Cost</p>
                  <p className="text-base font-bold text-blue-700 mt-1">Rs {plTotalPurCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Sale Revenue</p>
                  <p className="text-base font-bold text-green-700 mt-1">Rs {plTotalSalRev.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Discount Given</p>
                  <p className="text-base font-bold text-red-600 mt-1">Rs {plTotalDisc.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className={`border rounded-lg p-3 ${plTotalProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-xs text-gray-500">{plTotalProfit >= 0 ? 'Net Profit' : 'Net Loss'}</p>
                  <p className={`text-base font-bold mt-1 ${plTotalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    Rs {Math.abs(plTotalProfit).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    <span className="text-xs font-normal ml-1">({plTotalMargin.toFixed(1)}%)</span>
                  </p>
                </div>
              </div>

              <PagedTable><table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['#', 'Design Name', 'Code', 'W/S Rate', 'Sale Rate (Pur)', 'Avg Sale Rate', 'Pur Pcs', 'Sold Pcs', 'Closing', 'Purchase Cost', 'Gross Revenue', 'Discount Rs', 'Net Revenue', 'Net Profit', 'Margin %'].map(h => (
                      <th key={h} className={thCls}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {plByDesign.length === 0 && (
                    <tr><td colSpan={15} className="px-3 py-8 text-center text-gray-400 text-xs">No data found</td></tr>
                  )}
                  {plByDesign.map((d, i) => (
                    <tr key={d.design} className={`hover:bg-blue-50 ${d.netProfit < 0 ? 'bg-red-50/40' : ''}`}>
                      <td className={tdCls + ' text-gray-400'}>{i + 1}</td>
                      <td className={`${tdCls} font-semibold text-gray-900`}>{d.design}</td>
                      <td className={tdCls + ' text-gray-400'}>{d.designCode}</td>
                      <td className={tdCls}>Rs {fmtNum(d.wsRate)}</td>
                      <td className={tdCls}>Rs {fmtNum(d.srRate)}</td>
                      <td className={`${tdCls} font-medium text-blue-700`}>Rs {fmtNum(d.avgSalRate)}</td>
                      <td className={`${tdCls} text-blue-700 font-semibold`}>{d.purPcs}</td>
                      <td className={`${tdCls} text-green-700 font-semibold`}>{d.salPcs}</td>
                      <td className={`${tdCls} font-semibold ${d.closing > 0 ? 'text-blue-700' : 'text-red-600'}`}>{d.closing}</td>
                      <td className={`${tdCls} text-blue-700`}>Rs {fmtNum(d.purCost)}</td>
                      <td className={tdCls}>Rs {fmtNum(d.grossRev)}</td>
                      <td className="px-3 py-2 text-xs text-red-500 font-medium">Rs {fmtNum(d.discRs)}</td>
                      <td className={`${tdCls} text-green-700`}>Rs {fmtNum(d.salRev)}</td>
                      <td className={`${tdCls} font-bold text-base ${d.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {d.netProfit >= 0 ? '+' : ''}Rs {fmtNum(d.netProfit)}
                      </td>
                      <td className={`${tdCls} font-semibold ${d.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {d.margin.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                {plByDesign.length > 0 && (
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-xs font-bold text-gray-700">TOTAL</td>
                      <td className="px-3 py-2 text-xs font-bold text-blue-700">{plByDesign.reduce((a, d) => a + d.purPcs, 0)}</td>
                      <td className="px-3 py-2 text-xs font-bold text-green-700">{plByDesign.reduce((a, d) => a + d.salPcs, 0)}</td>
                      <td className="px-3 py-2 text-xs font-bold text-blue-700">{plByDesign.reduce((a, d) => a + d.closing, 0)}</td>
                      <td className="px-3 py-2 text-xs font-bold text-blue-700">Rs {fmtNum(plTotalPurCost)}</td>
                      <td className="px-3 py-2 text-xs font-bold">Rs {fmtNum(plByDesign.reduce((a, d) => a + d.grossRev, 0))}</td>
                      <td className="px-3 py-2 text-xs font-bold text-red-500">Rs {fmtNum(plTotalDisc)}</td>
                      <td className="px-3 py-2 text-xs font-bold text-green-700">Rs {fmtNum(plTotalSalRev)}</td>
                      <td className={`px-3 py-2 text-xs font-bold ${plTotalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {plTotalProfit >= 0 ? '+' : ''}Rs {fmtNum(plTotalProfit)}
                      </td>
                      <td className={`px-3 py-2 text-xs font-bold ${plTotalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {plTotalMargin.toFixed(1)}%
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table></PagedTable>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── profit and loss report ────────────────────────────────────────────────────

function ProfitLossReport() {
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const today = todayISO();
  // API dates are UTC timestamps; use the local calendar date
  const localDate = v => (v ? new Date(v).toLocaleDateString('en-CA') : '');

  useEffect(() => {
    setDateFrom(REPORT_START_DATE);
    setDateTo(today);
    Promise.all([
      apiFetch(`${API_URL}/api/purchases`).then(r => r.json()),
      apiFetch(`${API_URL}/api/sales`).then(r => r.json()),
      apiFetch(`${API_URL}/api/payments`).then(r => r.json()),
    ]).then(([purData, salData, payData]) => {
      setPurchases(purData.map(r => ({
        id: r.id,
        date: localDate(r.purchase_date),
        design: r.design_name,
        designCode: r.design_code,
        pieces: parseFloat(r.pieces) || 0,
        wsRate: parseFloat(r.wholesale_rate) || 0,
        total: parseFloat(r.purchase_total) || 0,
      })));
      setSales(salData.map(r => ({
        id: r.id,
        date: localDate(r.sale_date),
        design: r.design_name,
        designCode: r.design_code,
        pieces: parseFloat(r.sale_pieces) || 0,
        saleRate: parseFloat(r.sale_rate) || 0,
        discountRs: parseFloat(r.discount_rs) || 0,
        total: parseFloat(r.sale_total) || 0,
        wsRate: parseFloat(r.wholesale_rate) || 0,
      })));
      // Payment types like "Party Payment" / "Advance Payment" pay suppliers for stock; they are not expenses
      const isPartyPayment = t => /payment/i.test(t) && !/exp/i.test(t);
      setExpenses((Array.isArray(payData) ? payData : [])
        .filter(r => !isPartyPayment(r.payment_type || ''))
        .map(r => ({
          id: r.id,
          date: localDate(r.payment_date),
          type: r.payment_type || 'Other',
          description: r.remarks || r.party_name || '',
          amount: parseFloat(r.amount) || 0,
        })));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading...</div>;

  const inRange = d => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  const fPur = purchases.filter(p => inRange(p.date));
  const fSal = sales.filter(s => inRange(s.date));
  const fExp = expenses.filter(e => inRange(e.date));

  // Cost of a sold piece: the wholesale rate saved on the sale, else the latest purchase of that design
  // code (same rule as the Sales Report), else the latest purchase of that design name
  const latestRate = key => {
    const map = {};
    [...purchases].sort((a, b) => a.id - b.id).forEach(p => { if (p[key] && p.wsRate > 0) map[p[key]] = p.wsRate; });
    return map;
  };
  const rateByCode = latestRate('designCode');
  const rateByName = latestRate('design');
  const costRate = s => s.wsRate > 0 ? s.wsRate : (rateByCode[s.designCode] || rateByName[s.design] || 0);

  const grossSale   = fSal.reduce((a, s) => a + s.pieces * s.saleRate, 0);
  const discount    = fSal.reduce((a, s) => a + s.discountRs, 0);
  const revenue     = fSal.reduce((a, s) => a + s.total, 0);
  const cogs        = fSal.reduce((a, s) => a + s.pieces * costRate(s), 0);
  const grossProfit = revenue - cogs;
  const totalExp    = fExp.reduce((a, e) => a + e.amount, 0);
  const netProfit   = grossProfit - totalExp;
  const soldPcs     = fSal.reduce((a, s) => a + s.pieces, 0);
  const boughtPcs   = fPur.reduce((a, p) => a + p.pieces, 0);
  const boughtAmt   = fPur.reduce((a, p) => a + p.total, 0);
  const uncosted    = fSal.filter(s => costRate(s) === 0).length;

  const expByType = Object.entries(fExp.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + e.amount; return m; }, {}))
    .sort((a, b) => b[1] - a[1]);

  const designWise = Object.values(fSal.reduce((m, s) => {
    const d = m[s.design] || (m[s.design] = { design: s.design, pcs: 0, revenue: 0, cost: 0 });
    d.pcs += s.pieces; d.revenue += s.total; d.cost += s.pieces * costRate(s);
    return m;
  }, {})).map(d => ({ ...d, profit: d.revenue - d.cost })).sort((a, b) => b.profit - a.profit);

  const monthKey = d => d.slice(0, 7);
  const months = [...new Set([...fSal, ...fExp].map(x => monthKey(x.date)))].sort().reverse();
  const monthWise = months.map(m => {
    const sal = fSal.filter(s => monthKey(s.date) === m);
    const rev = sal.reduce((a, s) => a + s.total, 0);
    const cost = sal.reduce((a, s) => a + s.pieces * costRate(s), 0);
    const exp = fExp.filter(e => monthKey(e.date) === m).reduce((a, e) => a + e.amount, 0);
    return { m, rev, cost, gross: rev - cost, exp, net: rev - cost - exp };
  });
  const monthLabel = m => { const [y, mm] = m.split('-'); return `${MONTHS[parseInt(mm, 10) - 1]} ${y}`; };

  const rs  = n => (n < 0 ? '− ' : '') + 'Rs ' + Math.round(Math.abs(n)).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pct = (a, b) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—';
  const pc  = v => v >= 0 ? 'text-green-700' : 'text-red-600';
  const iCls = 'px-2 py-1 border border-slate-400 rounded text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  const th  = 'px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600 bg-gray-100 border-b border-gray-200 whitespace-nowrap';
  const thR = th.replace('text-left', 'text-right');
  const td  = 'px-2.5 py-1 text-xs text-gray-800 whitespace-nowrap';
  const tdR = td + ' text-right';
  // min-w-0 + overflow-x-auto: on narrow screens a wide table scrolls inside its card instead of being cut off
  const card = 'bg-white rounded-lg border border-gray-200 shadow-sm min-w-0 overflow-x-auto';
  const cardHead = 'px-3 py-1.5 border-b border-gray-200 text-xs font-bold uppercase tracking-wide text-gray-700 bg-gray-50 rounded-t-lg';

  // statement line: label, amount, style
  const Line = ({ label, value, bold, color = 'text-gray-900', indent, bg = '' }) => (
    <tr className={bg}>
      <td className={`px-3 py-1 text-xs ${indent ? 'pl-6 text-gray-600' : ''} ${bold ? 'font-bold text-gray-900' : ''}`}>{label}</td>
      <td className={`px-3 py-1 text-xs text-right whitespace-nowrap ${bold ? 'font-extrabold' : 'font-semibold'} ${color}`}>{value}</td>
    </tr>
  );

  return (
    <div className="space-y-2">
      {/* heading + period */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <h2 className="text-lg font-extrabold text-gray-900">Profit and Loss</h2>
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="date" className={iCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span>to</span>
          <input type="date" className={iCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* key figures */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {[
          ['Net Sale', rs(revenue), 'text-gray-900', `${soldPcs} pcs sold`],
          ['Cost of Goods Sold', rs(cogs), 'text-slate-600', 'Wholesale cost of sold pieces'],
          ['Gross Profit', rs(grossProfit), pc(grossProfit), `${pct(grossProfit, revenue)} of sale`],
          ['Expenses', rs(totalExp), 'text-red-600', `${fExp.length} entries`],
          ['Net Profit / Loss', rs(netProfit), pc(netProfit), `${pct(netProfit, revenue)} of sale`],
          ['Stock Bought', rs(boughtAmt), 'text-blue-700', `${boughtPcs} pcs purchased`],
        ].map(([label, value, color, sub]) => (
          <div key={label} className={`${card} px-3 py-1.5 ${label === 'Net Profit / Loss' ? (netProfit >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300') : ''}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`text-lg font-extrabold leading-tight ${color}`}>{value}</p>
            <p className="text-[11px] text-gray-500 truncate">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* statement */}
        <div className={card}>
          <div className={cardHead}>Profit &amp; Loss Statement</div>
          <table className="w-full">
            <tbody className="divide-y divide-gray-100">
              <Line label="Gross Sale (before discount)" value={rs(grossSale)} />
              <Line label="Less: Discount given" value={rs(-discount)} color="text-red-600" indent />
              <Line label="Net Sale" value={rs(revenue)} bold bg="bg-gray-50" />
              <Line label="Less: Cost of goods sold" value={rs(-cogs)} color="text-red-600" indent />
              <Line label="Gross Profit" value={rs(grossProfit)} bold color={pc(grossProfit)} bg="bg-green-50" />
              {expByType.length === 0 && <Line label="Expenses" value={rs(0)} indent />}
              {expByType.map(([type, amt]) => (
                <Line key={type} label={`Less: ${type}`} value={rs(-amt)} color="text-red-600" indent />
              ))}
              <Line label="Total Expenses" value={rs(-totalExp)} bold color="text-red-600" bg="bg-gray-50" />
              <tr className={netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}>
                <td className="px-3 py-2 text-sm font-extrabold text-gray-900">NET {netProfit >= 0 ? 'PROFIT' : 'LOSS'}</td>
                <td className={`px-3 py-2 text-sm text-right font-extrabold ${pc(netProfit)}`}>{rs(netProfit)}</td>
              </tr>
            </tbody>
          </table>
          {uncosted > 0 && (
            <p className="px-3 py-1 text-[11px] text-slate-700 bg-slate-50 border-t border-slate-200">
              {uncosted} sale(s) have no purchase cost on record, so their cost is counted as 0.
            </p>
          )}
        </div>

        {/* month by month */}
        <div className={card}>
          <div className={cardHead}>Month by Month</div>
          <table className="w-full">
            <thead>
              <tr><th className={th}>Month</th><th className={thR}>Net Sale</th><th className={thR}>Cost</th><th className={thR}>Gross</th><th className={thR}>Expenses</th><th className={thR}>Net</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthWise.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-gray-400">No sales or expenses in this period</td></tr>}
              {monthWise.map(r => (
                <tr key={r.m}>
                  <td className={td + ' font-semibold'}>{monthLabel(r.m)}</td>
                  <td className={tdR}>{rs(r.rev)}</td>
                  <td className={tdR + ' text-slate-600'}>{rs(r.cost)}</td>
                  <td className={tdR + ' ' + pc(r.gross)}>{rs(r.gross)}</td>
                  <td className={tdR + ' text-red-600'}>{rs(r.exp)}</td>
                  <td className={tdR + ' font-bold ' + pc(r.net)}>{rs(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* design by design */}
      <div className={card}>
        <div className={cardHead}>Profit by Design</div>
        <table className="w-full">
          <thead>
            <tr><th className={th}>#</th><th className={th}>Design</th><th className={thR}>Pcs Sold</th><th className={thR}>Net Sale</th><th className={thR}>Cost</th><th className={thR}>Profit</th><th className={thR}>Margin</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {designWise.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-xs text-gray-400">No sales in this period</td></tr>}
            {designWise.map((d, i) => (
              <tr key={d.design}>
                <td className={td + ' text-gray-400'}>{i + 1}</td>
                <td className={td + ' font-semibold text-blue-700'}>{d.design}</td>
                <td className={tdR}>{d.pcs}</td>
                <td className={tdR}>{rs(d.revenue)}</td>
                <td className={tdR + ' text-slate-600'}>{rs(d.cost)}</td>
                <td className={tdR + ' font-bold ' + pc(d.profit)}>{rs(d.profit)}</td>
                <td className={tdR + ' text-gray-600'}>{pct(d.profit, d.revenue)}</td>
              </tr>
            ))}
          </tbody>
          {designWise.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                <td className={td} colSpan={2}>TOTAL — {designWise.length} designs</td>
                <td className={tdR}>{soldPcs}</td>
                <td className={tdR}>{rs(revenue)}</td>
                <td className={tdR + ' text-slate-600'}>{rs(cogs)}</td>
                <td className={tdR + ' ' + pc(grossProfit)}>{rs(grossProfit)}</td>
                <td className={tdR}>{pct(grossProfit, revenue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── summary report form ───────────────────────────────────────────────────────

function SummaryReportForm({ products, parties }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportType, setReportType] = useState('all');
  const [partyFilter, setPartyFilter] = useState('');
  const [sales, setSales] = useState([]);

  const today = todayISO();

  useEffect(() => {
    setDateFrom(REPORT_START_DATE);
    setDateTo(today);
    apiFetch(`${API_URL}/api/sales`)
      .then(r => r.json())
      .then(data => setSales(data.map(r => {
        const pieces = parseFloat(r.sale_pieces) || 0;
        const rate = parseFloat(r.sale_rate) || 0;
        const disc = parseFloat(r.discount) || 0;
        const gross = pieces * rate;
        const discountRs = gross * disc / 100;
        return {
          date: (r.sale_date || '').slice(0, 10),
          party: r.party_name,
          pieces,
          saleRate: rate,
          discount: disc,
          discountRs,
          gross,
          total: parseFloat(r.sale_total) || 0,
          designName: r.design_name,
          designCode: r.design_code,
        };
      })))
      .catch(() => {});
  }, []);

  const filteredProducts = products.filter(p => {
    const dateMatch = (!dateFrom || p.date >= dateFrom) && (!dateTo || p.date <= dateTo);
    const partyMatch = !partyFilter || p.partyName === partyFilter;
    return dateMatch && partyMatch;
  });

  const filteredSales = sales.filter(s => {
    const dateMatch = (!dateFrom || s.date >= dateFrom) && (!dateTo || s.date <= dateTo);
    const partyMatch = !partyFilter || s.party === partyFilter;
    return dateMatch && partyMatch;
  });

  const totals = filteredProducts.reduce((acc, p) => ({
    pieces: acc.pieces + (parseFloat(p.pieces) || 0),
    purchaseTotal: acc.purchaseTotal + (parseFloat(p.totalRs) || 0),
    saleTotal: acc.saleTotal + ((parseFloat(p.pieces) || 0) * (parseFloat(p.saleRate) || 0)),
  }), { pieces: 0, purchaseTotal: 0, saleTotal: 0 });

  const saleTotals = filteredSales.reduce((acc, s) => ({
    saleTotal: acc.saleTotal + (s.total || 0),
    discountRs: acc.discountRs + (s.discountRs || 0),
    grossSale: acc.grossSale + (s.gross || 0),
  }), { saleTotal: 0, discountRs: 0, grossSale: 0 });

  const profit = totals.saleTotal - totals.purchaseTotal;
  const profitPercent = totals.purchaseTotal > 0 ? ((profit / totals.purchaseTotal) * 100).toFixed(2) : 0;

  // Stock Value = closing stock × latest wholesale_rate per design (all-time, not date-filtered)
  const allDesignNames = [...new Set(products.map(p => p.designName).filter(Boolean))];
  const stockValue = allDesignNames.reduce((total, design) => {
    const purRecs = products.filter(p => p.designName === design).sort((a, b) => b.id - a.id);
    const latestWsRate = parseFloat(purRecs[0]?.wholeSaleRate) || 0;
    const totalPurPcs = products.filter(p => p.designName === design).reduce((a, p) => a + (parseFloat(p.pieces) || 0), 0);
    const totalSalPcs = sales.filter(s => s.designName === design).reduce((a, s) => a + (s.pieces || 0), 0);
    const closing = totalPurPcs - totalSalPcs;
    return total + (closing > 0 ? closing * latestWsRate : 0);
  }, 0);

  const partySummary = parties.map(party => {
    const partyProducts = filteredProducts.filter(p => p.partyName === party.name);
    const partySales = filteredSales.filter(s => s.party === party.name);
    const partyTotals = partyProducts.reduce((acc, p) => ({
      pieces: acc.pieces + (parseFloat(p.pieces) || 0),
      amount: acc.amount + (parseFloat(p.totalRs) || 0),
    }), { pieces: 0, amount: 0 });
    const discountRs = partySales.reduce((acc, s) => acc + (s.discountRs || 0), 0);
    return { ...party, ...partyTotals, discountRs, count: partyProducts.length };
  }).filter(p => p.count > 0).sort((a, b) => b.amount - a.amount);

  const designSummary = [...new Set(filteredProducts.map(p => p.designName))].map(design => {
    const designProducts = filteredProducts.filter(p => p.designName === design);
    const designSales = filteredSales.filter(s => s.designName === design);
    const designTotals = designProducts.reduce((acc, p) => ({
      pieces: acc.pieces + (parseFloat(p.pieces) || 0),
      amount: acc.amount + (parseFloat(p.totalRs) || 0),
    }), { pieces: 0, amount: 0 });
    const discountRs = designSales.reduce((acc, s) => acc + (s.discountRs || 0), 0);
    return { name: design, ...designTotals, discountRs, count: designProducts.length };
  }).sort((a, b) => b.amount - a.amount);

  const inputCls = 'w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="space-y-4">
      {/* Filter Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Summary Report Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Date From</label>
            <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={inputCls + ' cursor-pointer pointer-events-none'} value={dateFrom ? isoToDisplay(dateFrom) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
          </div>
          <div>
            <label className={labelCls}>Date To</label>
            <div className="relative cursor-pointer" onClick={e => e.currentTarget.querySelector('input[type=date]').showPicker()}><input readOnly className={inputCls + ' cursor-pointer pointer-events-none'} value={dateTo ? isoToDisplay(dateTo) : ''} placeholder="dd/Mon/yy" /><input type="date" className="absolute opacity-0 w-0 h-0" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
          </div>
          <div>
            <label className={labelCls}>Report Type</label>
            <select className={inputCls} value={reportType} onChange={e => setReportType(e.target.value)}>
              <option value="all">All Summary</option>
              <option value="party">Party Wise</option>
              <option value="design">Design Wise</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Party Filter</label>
            <select className={inputCls} value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
              <option value="">All Parties</option>
              {parties.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total Pieces</p>
              <p className="text-xl font-bold text-gray-800">{totals.pieces.toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Purchase Total</p>
              <p className="text-xl font-bold text-green-700">Rs {fmtNum(totals.purchaseTotal)}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Expected Sale</p>
              <p className="text-xl font-bold text-blue-700">Rs {fmtNum(totals.saleTotal)}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total Discount</p>
              <p className="text-xl font-bold text-red-600">Rs {saleTotals.discountRs.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
              <p className="text-xs text-gray-400 mt-0.5">Gross Rs {saleTotals.grossSale.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M17 17h.01M7 17L17 7M3 12a9 9 0 1018 0 9 9 0 00-18 0z" /></svg>
            </div>
          </div>
        </div>
        <div className={`rounded-lg shadow-sm border p-4 ${profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Expected Profit</p>
              <p className={`text-xl font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                Rs {fmtNum(Math.abs(profit))} ({profitPercent}%)
              </p>
            </div>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <svg className={`w-5 h-5 ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={profit >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} /></svg>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Stock Value</p>
              <p className="text-xl font-bold text-slate-700">Rs {stockValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-gray-400 mt-0.5">Closing × W/Sale Rate</p>
            </div>
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Party Wise Summary */}
      {(reportType === 'all' || reportType === 'party') && partySummary.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Party Wise Summary</h4>
          <div className="overflow-x-auto">
            <PagedTable><table className="w-full text-xs">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Party Name</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Purchases</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Total Pieces</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Total Amount</th>
                  <th className="px-3 py-2 text-right font-semibold text-red-600">Discount Rs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {partySummary.map(p => (
                  <tr key={p.name} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{p.name}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{p.count}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{p.pieces.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-green-700">Rs {fmtNum(p.amount)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600">Rs {(p.discountRs||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  </tr>
                ))}
              </tbody>
            </table></PagedTable>
          </div>
        </div>
      )}

      {/* Design Wise Summary */}
      {(reportType === 'all' || reportType === 'design') && designSummary.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Design Wise Summary</h4>
          <div className="overflow-x-auto">
            <PagedTable><table className="w-full text-xs">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Design Name</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Purchases</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Total Pieces</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Total Amount</th>
                  <th className="px-3 py-2 text-right font-semibold text-red-600">Discount Rs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {designSummary.map(d => (
                  <tr key={d.name} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{d.name}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{d.count}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{d.pieces.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold text-green-700">Rs {fmtNum(d.amount)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600">Rs {(d.discountRs||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  </tr>
                ))}
              </tbody>
            </table></PagedTable>
          </div>
        </div>
      )}

      {/* Footer Summary - Total Record */}
      <div className="bg-slate-800 rounded-lg shadow-lg p-4 text-white">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div className="border-r border-blue-400 last:border-0">
            <p className="text-xs text-blue-200">Total Records</p>
            <p className="text-2xl font-bold">{filteredProducts.length}</p>
          </div>
          <div className="border-r border-blue-400 last:border-0">
            <p className="text-xs text-blue-200">Total Suit/Pieces</p>
            <p className="text-2xl font-bold">{totals.pieces.toLocaleString()}</p>
          </div>
          <div className="border-r border-blue-400 last:border-0">
            <p className="text-xs text-blue-200">Total Purchase</p>
            <p className="text-2xl font-bold">Rs {fmtNum(totals.purchaseTotal)}</p>
          </div>
          <div className="border-r border-blue-400 last:border-0">
            <p className="text-xs text-blue-200">Total Designs</p>
            <p className="text-2xl font-bold">{designSummary.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-200">Stock Value</p>
            <p className="text-2xl font-bold text-slate-300">Rs {stockValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {/* Print Button */}
      <div className="flex justify-end">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Print Report
        </button>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function MainMenu() {
  const [activeView, setActiveView] = useState('purchase-data-entry');
  const mainRef = useRef(null);
  // phones/tablets: the sidebar is a slide-in drawer opened from the header
  const [menuOpen, setMenuOpen] = useState(false);
  const go = view => { setActiveView(view); setMenuOpen(false); };
  // sidebar groups work as an accordion so the menu fits the screen; the open page's group starts open
  const groupOf = v => (['purchase-data-entry', 'sales-data-entry', 'party-payment', 'expenses'].includes(v) ? 'data'
    : ['purchase-report', 'sales-report', 'payment-report'].includes(v) ? 'reports' : null);
  const [openGroup, setOpenGroup] = useState(() => groupOf(activeView));
  useEffect(() => { const g = groupOf(activeView); if (g) setOpenGroup(g); }, [activeView]);
  const viewTitles = {
    'purchase-data-entry': ['Data Entry', 'Purchase Data Entry'],
    'sales-data-entry':    ['Data Entry', 'Sales Data Entry'],
    'party-payment':       ['Data Entry', 'Party Payment'],
    'expenses':            ['Data Entry', 'Expenses'],
    'purchase-report':     ['All Reports', 'Purchase Report'],
    'sales-report':        ['All Reports', 'Sales Report'],
    'payment-report':      ['All Reports', 'Payment Report'],
    'stock-ledger':        ['Reports', 'Stock Ledger'],
    'stock-value':         ['Reports', 'Stock Value'],
    'stock-vs-payable':    ['Reports', 'Stock vs Dues'],
    'party-ledger':        ['Reports', 'Party Ledger'],
    'profit-loss':         ['Reports', 'Profit and Loss'],
    'summary-report':      ['Reports', 'Summary Report'],
  };
  const [products, setProducts] = useState([]);
  const [nextId, setNextId] = useState(generateId(1));
  const [parties, setParties] = useState([
    { name: 'Cash', contact: '', whatsapp: '', facebook: '', instagram: '', address: '' },
  ]);
  const [designs, setDesigns] = useState([]);

  async function loadProducts() {
    try {
      const res = await apiFetch(`${API_URL}/api/purchases`);
      const data = await res.json();
      const mapped = data.map(r => ({
        id: r.id,
        idNo: r.purchase_no,
        date: r.purchase_date,
        partyName: r.party_name,
        challanNo: r.challan_no,
        pieces: r.pieces,
        wholeSaleRate: r.wholesale_rate,
        saleRate: r.sale_rate,
        designName: r.design_name,
        totalRs: r.purchase_total,
        barcode: r.barcode,
        designCode: r.design_code,
        contact: r.phone_no || '',
        whatsapp: r.whatsapp || '',
        facebook: r.facebook_id || '',
        instagram: r.instagram || '',
        address: r.address || '',
      }));
      setProducts(mapped);
      setNextId(nextIdFromList(mapped));
    } catch (err) {
      console.error('Could not load products:', err.message);
    }
  }

  useEffect(() => { loadProducts(); }, []);

  async function deleteProduct(id) {
    if (!window.confirm('Delete this product?')) return;
    try {
      await apiFetch(`${API_URL}/api/purchases/${id}`, { method: 'DELETE' });
      setProducts(ps => ps.filter(p => p.id !== id));
    } catch (err) {
      alert('Error deleting: ' + err.message);
    }
  }

  const navIcons = {
    stockVsPayable: (
      <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
    stockValue: (
      <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    dataEntry: (
      <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    reports: (
      <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
    stockLedger: (
      <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    partyLedger: (
      <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    profitLoss: (
      <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    summary: (
      <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  };

  function renderContent() {
    switch (activeView) {
      case 'purchase-data-entry':
        return (
          <div className="theme-purchase">
            <PurchaseDataEntry nextId={nextId} onSaved={loadProducts} parties={parties} designs={designs} onAddParty={party => setParties(p => [...p, party])} onDeleteParty={name => setParties(p => p.filter(x => x.name !== name))} onAddDesign={name => setDesigns(d => [...d, name])} onDeleteDesign={name => setDesigns(d => d.filter(x => x !== name))} onRenameParty={(o, n) => setParties(p => p.map(x => x.name === o ? { ...x, name: n } : x))} onRenameDesign={(o, n) => setDesigns(d => d.map(x => x === o ? n : x))} products={products} />
            <ProductTable products={products} onDelete={deleteProduct} onReload={loadProducts} parties={parties} designs={designs} onAddParty={party => setParties(p => [...p, party])} onAddDesign={name => setDesigns(d => [...d, name])} />
          </div>
        );
      case 'sales-data-entry': return <SaleEntry parties={parties} designs={designs} purchases={products} onAddParty={party => setParties(p => [...p, party])} onDeleteParty={name => setParties(p => p.filter(x => x.name !== name))} onAddDesign={name => setDesigns(d => [...d, name])} onDeleteDesign={name => setDesigns(d => d.filter(x => x !== name))} />;
      case 'payment-data-entry': return <PaymentEntry parties={parties} mode="party" />;
      case 'party-payment': return <PaymentEntry parties={parties} mode="party" />;
      case 'expenses': return <PaymentEntry parties={parties} mode="expense" />;
      case 'purchase-report': return <PurchaseReport />;
      case 'sales-report': return <SaleReport />;
      case 'payment-report': return <PaymentReport />;
      case 'stock-ledger': return <StockReport />;
      case 'stock-value': return <StockValue />;
      case 'stock-vs-payable': return <StockVsPayable />;
      case 'party-ledger': return <PartyLedger />;
      case 'profit-loss': return <ProfitLossReport />;
      case 'summary-report': return <SummaryReportForm products={products} parties={parties} />;
      default: return null;
    }
  }

  return (
    <div className="app-shell h-screen flex flex-col bg-gray-100 font-sans">
      {/* Top Header */}
      <header className="no-print bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <button onClick={() => setMenuOpen(o => !o)} className="lg:hidden p-1.5 -ml-1 rounded-md text-slate-700 hover:bg-slate-100" aria-label="Open menu">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-lg bg-slate-800 flex items-center justify-center text-white font-bold text-sm">KS</span>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight truncate">Khurram Studio</h1>
            </div>
            {viewTitles[activeView] && (
              <div className="hidden lg:flex items-center gap-2 text-sm">
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{viewTitles[activeView][0]}</span>
                <span className="text-gray-400">›</span>
                <span className="font-semibold text-blue-700">{viewTitles[activeView][1]}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <button className="hidden sm:block text-gray-600 hover:text-gray-800 relative">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-gray-800">Adam Smith</p>
                <p className="text-xs text-gray-600">Admin</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="app-body flex flex-1 min-h-0">
        {/* Sidebar: fixed drawer on small screens, normal column from lg up */}
        {menuOpen && <div className="no-print lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMenuOpen(false)} />}
        <nav className={`no-print fixed inset-y-0 left-0 z-40 w-64 shrink-0 bg-slate-900 shadow-lg flex flex-col overflow-y-auto transition-transform duration-200 lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="px-3 py-2 space-y-0.5 flex-1">
            <NavItem icon={navIcons.dataEntry} label="Data Entry" open={openGroup === 'data'} onToggle={() => setOpenGroup(g => g === 'data' ? null : 'data')} active={['purchase-data-entry','sales-data-entry','party-payment','expenses'].includes(activeView)}>
              <SubNavItem label="Purchase Data Entry" active={activeView === 'purchase-data-entry'} onClick={() => go('purchase-data-entry')} />
              <SubNavItem label="Sales Data Entry" active={activeView === 'sales-data-entry'} onClick={() => go('sales-data-entry')} />
              <SubNavItem label="Party Payment" active={activeView === 'party-payment'} onClick={() => go('party-payment')} />
              <SubNavItem label="Expenses" active={activeView === 'expenses'} onClick={() => go('expenses')} />
            </NavItem>

            <NavItem icon={navIcons.reports} label="All Reports" open={openGroup === 'reports'} onToggle={() => setOpenGroup(g => g === 'reports' ? null : 'reports')} active={['purchase-report','sales-report','payment-report'].includes(activeView)}>
              <SubNavItem label="Purchase Report" active={activeView === 'purchase-report'} onClick={() => go('purchase-report')} />
              <SubNavItem label="Sales Report" active={activeView === 'sales-report'} onClick={() => go('sales-report')} />
              <SubNavItem label="Payment Report" active={activeView === 'payment-report'} onClick={() => go('payment-report')} />
            </NavItem>

            <NavItem icon={navIcons.stockLedger} label="Stock Ledger" active={activeView === 'stock-ledger'} onClick={() => go('stock-ledger')} />
            <NavItem icon={navIcons.stockValue} label="Stock Value" active={activeView === 'stock-value'} onClick={() => go('stock-value')} />
            <NavItem icon={navIcons.stockVsPayable} label="Stock vs Dues" active={activeView === 'stock-vs-payable'} onClick={() => go('stock-vs-payable')} />
            <NavItem icon={navIcons.partyLedger} label="Party Ledger" active={activeView === 'party-ledger'} onClick={() => go('party-ledger')} />
            <NavItem icon={navIcons.profitLoss} label="Profit and Loss" active={activeView === 'profit-loss'} onClick={() => go('profit-loss')} />
            <NavItem icon={navIcons.summary} label="Summary Report" active={activeView === 'summary-report'} onClick={() => go('summary-report')} />
          </div>

          <div className="px-3 py-1.5 border-t border-slate-700">
            <button type="button" onClick={() => { saveLogin(null); window.location.reload(); }} className="w-full flex items-center px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors text-sm font-medium">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Log Out
            </button>
            {[
              ['Go to Admin Page', ADMIN_PAGE_URL, 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z'],
              ['Go to Website Page', WEBSITE_PAGE_URL, 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9'],
            ].map(([label, url, icon]) => (
              <button key={label}
                onClick={() => url ? window.open(url, '_blank', 'noopener') : alert(`The link for "${label}" has not been set yet.`)}
                className="w-full flex items-center px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors text-sm font-medium">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <main ref={mainRef} className="flex-1 min-w-0 p-1.5 sm:p-2 overflow-x-hidden overflow-y-auto">
          {viewTitles[activeView] && <ReportToolbar title={viewTitles[activeView][1]} rootRef={mainRef} />}
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
