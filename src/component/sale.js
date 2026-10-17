/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import { fmtNum } from './format';
import JsBarcode from 'jsbarcode';
import PhoneInput, { withContact, lookupPartyInfo } from './phoneinput';
import SectionCard, { sectionIcons, FormHeader, formIcons } from './sectioncard';
import BarcodeMini from './barcodemini';
import { PAGE_SIZE, pageCls } from './pager';
import { API_URL, apiFetch } from '../api';

// ── helpers ───────────────────────────────────────────────────────────────────

function generateSaleId(n) {
  return `Sale-${String(n).padStart(6, '0')}`;
}

function nextSaleIdFromList(sales) {
  let max = 0;
  sales.forEach(s => {
    // Extract from sale_id field, not id field
    const saleId = String(s.sale_id || s.id || '');
    const m = saleId.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return generateSaleId(max + 1);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isoToDisplay(iso) {
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${MONTHS[parseInt(mm,10)-1]}/${yyyy.slice(2)}`;
}

function numberToWords(num) {
  if (num === 0) return 'Zero Rupees Only';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
  const teens = ['Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function lt1000(n) {
    if (!n) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n-10];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' and '+lt1000(n%100) : '');
  }
  function convert(n) {
    if (!n) return 'Zero';
    if (n < 1000) return lt1000(n);
    if (n < 100000) return lt1000(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+lt1000(n%1000) : '');
    if (n < 10000000) return lt1000(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+convert(n%100000) : '');
    return lt1000(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' '+convert(n%10000000) : '');
  }
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = convert(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
  return result + ' Only';
}

const API = API_URL;

function mapRow(r) {
  return {
    dbId: r.id,
    id: r.sale_id,
    date: r.sale_date,
    party: r.party_name,
    pieces: r.sale_pieces,
    saleRate: r.sale_rate,
    discount: r.discount,
    discountRs: r.discount_rs,
    total: r.sale_total,
    designCode: r.design_code,
    designName: r.design_name,
    barcode: r.barcode,
    contact: r.phone_no || '',
    whatsapp: r.whatsapp || '',
    facebook: r.facebook_id || '',
    instagram: r.instagram || '',
    address: r.address || '',
  };
}

// ── barcode canvas ────────────────────────────────────────────────────────────

function BarcodeCanvas({ value, designCode, saleRate }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && value) {
      JsBarcode(ref.current, value, {
        format: 'EAN13', width: 1.5, height: 26,
        displayValue: true, fontSize: 9, margin: 1,
      });
    }
  }, [value]);
  return (
    <div className="inline-flex flex-col items-center border border-gray-200 rounded bg-white px-2 py-1">
      {designCode && <span className="text-xs font-semibold text-gray-800 mb-1 tracking-wide">{designCode}</span>}
      <canvas ref={ref} />
      {parseFloat(saleRate) > 0 && (
        <span className="text-sm font-bold text-gray-900 mt-1">Rs {fmtNum(Math.round(parseFloat(saleRate)))}</span>
      )}
    </div>
  );
}

// "ASI-99120-Bunch Maxi" -> "ASI-99120" when shown next to the design name, to avoid repeating it
function shortDesignCode(code, name) {
  const suffix = `-${name || ''}`;
  return name && code.endsWith(suffix) ? code.slice(0, -suffix.length) : code;
}

// ── sale data entry form ──────────────────────────────────────────────────────

function SaleDataEntry({ nextId, onSaved, sales, designs, purchases, onAddParty, onAddDesign, onDeleteDesign, editSale, onEditDone }) {
  const [form, setForm] = useState({
    saleId: '',
    date: todayISO(),
    partyName: 'Cash',             // walk-in customer unless a name or phone is entered
    salePieces: '',
    barcode: '',
    designCode: '',
    designName: '',
    saleRate: '',
    discount: '10',
    saleTotal: '',
  });
  const [amountWords, setAmountWords] = useState('Zero Rupees Only');
  useEffect(() => {
    if (nextId) setForm(f => ({ ...f, saleId: nextId }));
  }, [nextId]);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showDesignModal, setShowDesignModal] = useState(false);
  const [newParty, setNewParty] = useState({ name: '', contact: '', address: '', facebook: '', instagram: '', whatsapp: '' });
  const [newDesign, setNewDesign] = useState({ name: '', category: '', description: '' });
  const [history, setHistory] = useState({ salePieces: [], saleRate: [], discount: [], designName: [] });
  const [showHistory, setShowHistory] = useState({ salePieces: false, saleRate: false, discount: false, designName: false });
  const [partyInfo, setPartyInfo] = useState({ contact: '', whatsapp: '', facebook: '', instagram: '', address: '' });
  const [showPurchaseData, setShowPurchaseData] = useState(false);
  const [purchaseData, setPurchaseData] = useState([]);
  const [loadingPurchase, setLoadingPurchase] = useState(false);


  // Unique design names from purchases with their latest purchase record for auto-fill
  const designNamesFromPurchases = [...new Map(
    (purchases || []).filter(p => p.designName).map(p => [p.designName, p])
  ).values()].sort((a, b) => (a.designName||'').localeCompare(b.designName||''));

  // Customers come from saved sales; each sale stores the customer's contact details
  const customerRecords = (sales || []).map(s => ({
    id: s.dbId, partyName: s.party,
    contact: s.contact, whatsapp: s.whatsapp, facebook: s.facebook, instagram: s.instagram, address: s.address,
  }));
  const customerNames = [...new Set(['Cash', ...customerRecords.map(c => c.partyName).filter(Boolean)])].sort();

  // Purchases for the currently selected party
  const partyPurchases = form.partyName
    ? (purchases || []).filter(p => p.partyName === form.partyName)
    : [];
  const [showPartyPurchases, setShowPartyPurchases] = useState(false);

  function buildBarcode(partyName, saleRate, salePieces) {
    const p = String(partyName||'').replace(/\s/g,'').toUpperCase().slice(0,2);
    const sr = String(Math.floor(parseFloat(saleRate)||0)).padStart(4,'0');
    const pc = String(parseInt(salePieces)||0).padStart(3,'0');
    const raw = p.split('').map(c => c.charCodeAt(0)-55).join('') + sr + pc + '00000';
    const digits = raw.replace(/\D/g,'').slice(0,12).padStart(12,'0');
    return digits;
  }

  function buildDesignCode(partyName, saleRate, designName) {
    const party = (partyName||'').slice(0,3).toUpperCase();
    const rate = String(Math.floor(parseFloat(saleRate)||0)).slice(0,3);
    const design = (designName||'');
    if (!party && !rate && !design) return '';
    return `${party}-99${rate}-${design}`;
  }

  function set(field, value) {
    console.log(`Setting ${field} to:`, value);
    setForm(f => {
      const updated = { ...f, [field]: value };
      console.log('Updated form:', updated);
      if (['salePieces','saleRate','discount'].includes(field)) {
        const pieces = parseFloat(updated.salePieces) || 0;
        const rate   = parseFloat(updated.saleRate)   || 0;
        const gross  = pieces * rate;
        const disc   = parseFloat(updated.discount)   || 0;
        const total  = gross - (gross * disc / 100);
        updated.saleTotal = (pieces && rate) ? total.toFixed(2) : '';
        setAmountWords(numberToWords(total));
      }
      // An item picked from stock keeps its purchase barcode and design code; they are only
      // generated here (from customer, rate, pieces) when the design has no purchase behind it
      if (field === 'designName') updated.fromPurchase = false;
      if (!updated.fromPurchase) {
        if (['partyName','saleRate','designName'].includes(field)) {
          updated.designCode = buildDesignCode(updated.partyName, updated.saleRate, updated.designName);
        }
        if (['partyName','saleRate','salePieces'].includes(field)) {
          updated.barcode = buildBarcode(updated.partyName, updated.saleRate, updated.salePieces);
        }
      }
      return updated;
    });
  }

  const emptyInfo = { contact: '', whatsapp: '', facebook: '', instagram: '', address: '' };
  const findCustomer = name => customerNames.find(n => n.toLowerCase() === String(name).trim().toLowerCase());

  // Typing a known customer's name fills their saved details; switching to a new name clears them
  function handleCustomerName(val) {
    set('partyName', val);
    setShowPartyPurchases(false);
    const known = findCustomer(val);
    if (known) setPartyInfo(lookupPartyInfo(known, [], customerRecords));
    else if (findCustomer(form.partyName)) setPartyInfo(emptyInfo);
  }

  // Once a full phone number is typed, fill the customer who has that phone/WhatsApp number
  const phoneKey = v => String(v || '').replace(/\D/g, '').slice(-10);
  function findCustomerByPhone(phone) {
    const key = phoneKey(phone);
    if (key.length < 10) return null;
    return [...customerRecords].sort((a, b) => b.id - a.id)
      .find(c => phoneKey(c.contact) === key || phoneKey(c.whatsapp) === key) || null;
  }

  // Saved customers whose phone/WhatsApp contains the digits typed so far (one row per customer, newest details)
  const [showPhoneMatches, setShowPhoneMatches] = useState(false);
  function phoneMatches(phone) {
    const typed = String(phone || '').replace(/^\+92/, '').replace(/\D/g, '');
    if (typed.length < 3) return [];
    const seen = new Set();
    return [...customerRecords].sort((a, b) => b.id - a.id)
      .filter(c => phoneKey(c.contact).includes(typed) || phoneKey(c.whatsapp).includes(typed))
      .filter(c => !seen.has(c.partyName) && seen.add(c.partyName))
      .slice(0, 8)
      .map(c => ({ ...lookupPartyInfo(c.partyName, [], customerRecords), name: c.partyName }));
  }

  function pickCustomer(c) {
    set('partyName', c.name);
    setPartyInfo({ contact: c.contact, whatsapp: c.whatsapp, facebook: c.facebook, instagram: c.instagram, address: c.address });
    setShowPhoneMatches(false);
  }

  function fillCustomerByPhone(phone) {
    const match = findCustomerByPhone(phone);
    if (!match || match.partyName === form.partyName) return;
    set('partyName', match.partyName);
    setPartyInfo({ ...lookupPartyInfo(match.partyName, [], customerRecords), contact: phone });
  }

  function handleDesignChange(val) {
    if (val === '__add__') { setShowDesignModal(true); return; }
    chooseDesign(val);
  }

  // A design picked by hand: fill it from its latest purchase and show that barcode in the scan box too
  function chooseDesign(name) {
    const match = (purchases || []).filter(p => p.designName === name).sort((a, b) => b.id - a.id)[0];
    if (!match) {
      set('designName', name);
      setScanCode(''); setScanMsg(null);
      return;
    }
    applyPurchase(match);
    setScanCode(match.barcode || '');
    setScanMsg(match.barcode ? { ok: true, text: `✓ Barcode of ${match.designName} · party ${match.partyName}` } : null);
  }

  // Editing: the sale picked in the list is loaded into this form; Save then updates it instead of adding
  const [editId, setEditId] = useState(null);
  useEffect(() => {
    if (!editSale) return;
    const s = editSale;
    setEditId(s.dbId);
    setForm({
      saleId: s.id || '',
      date: s.date ? new Date(s.date).toLocaleDateString('en-CA') : todayISO(),   // API date is UTC
      partyName: s.party || 'Cash',
      salePieces: s.pieces ?? '',
      saleRate: s.saleRate ?? '',
      discount: s.discount ?? '0',
      designName: s.designName || '',
      designCode: s.designCode || '',
      barcode: s.barcode || '',
      saleTotal: s.total ?? '',
      fromPurchase: true,                  // keep this sale's own barcode / design code while editing
    });
    setPartyInfo({ contact: s.contact || '', whatsapp: s.whatsapp || '', facebook: s.facebook || '', instagram: s.instagram || '', address: s.address || '' });
    setAmountWords(numberToWords(parseFloat(s.total) || 0));
    setScanCode(s.barcode || '');
    setScanMsg({ ok: true, text: `Editing ${s.id} — change it, then press Update Sale` });
    const main = document.querySelector('main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  }, [editSale]);

  function clearForm() {
    if (editId) { setEditId(null); if (onEditDone) onEditDone(); }
    setForm({ saleId: '', date: todayISO(), partyName: 'Cash', salePieces: '', barcode: '', designCode: '', designName: '', saleRate: '', discount: '10', saleTotal: '' });
    setAmountWords('Zero Rupees Only');
    setPartyInfo({ contact: '', whatsapp: '', facebook: '', instagram: '', address: '' });
    setScanCode('');               // otherwise the last scan's message stays next to an empty form
    setScanMsg(null);
  }

  // Fill design, sale rate, barcode and design code from a purchase, and recompute the total
  function applyPurchase(match) {
    setForm(f => {
      const rate   = parseFloat(match.saleRate) || 0;
      const pieces = parseFloat(f.salePieces)  || 0;
      const gross  = pieces * rate;
      const disc   = parseFloat(f.discount)    || 0;
      const total  = gross - (gross * disc / 100);
      if (pieces && rate) setAmountWords(numberToWords(total));
      return {
        ...f,
        designName: match.designName || '',
        saleRate: match.saleRate || '',
        barcode: match.barcode || '',
        designCode: match.designCode || '',
        fromPurchase: !!match.barcode,
        saleTotal: (pieces && rate) ? total.toFixed(2) : f.saleTotal,
      };
    });
  }

  const [scanCode, setScanCode] = useState('');
  const [scanMsg, setScanMsg]   = useState(null);   // { ok, text }

  // Purchase barcodes are 12 digits; a scanner reading the printed EAN-13 adds a 13th check digit
  function fillFromBarcode(raw) {
    let code = String(raw || '').replace(/\D/g, '');
    if (code.length === 13) code = code.slice(0, 12);
    if (!code) return;
    // 1. a purchase (stock) barcode: design, rate and code; the party here is the supplier
    const match = (purchases || [])
      .filter(p => String(p.barcode || '') === code)
      .sort((a, b) => b.id - a.id)[0];
    if (match) {
      applyPurchase(match);
      setScanMsg({ ok: true, text: `✓ ${match.designName} · party ${match.partyName} · Rs ${fmtNum(match.saleRate)}` });
      return;
    }
    // 2. a barcode printed on an earlier sale: same design again, for the same customer
    const sold = (sales || [])
      .filter(s => String(s.barcode || '') === code)
      .sort((a, b) => b.dbId - a.dbId)[0];
    if (sold) {
      const stock = (purchases || []).filter(p => p.designName === sold.designName).sort((a, b) => b.id - a.id)[0];
      applyPurchase(stock || { designName: sold.designName, saleRate: sold.saleRate, barcode: sold.barcode, designCode: sold.designCode });
      if (sold.party) {
        set('partyName', sold.party);
        setPartyInfo(lookupPartyInfo(sold.party, [], customerRecords));
      }
      setScanMsg({ ok: true, text: `✓ ${sold.designName} · customer ${sold.party} (sale ${sold.id})` });
      return;
    }
    setScanMsg({ ok: false, text: `No purchase or sale found with barcode ${code}` });
  }

  async function fetchPurchaseByDesignCode(designCode) {
    if (!designCode) return;
    setLoadingPurchase(true);
    try {
      const res = await apiFetch(`${API_URL}/api/purchases?design_code=${encodeURIComponent(designCode)}`);
      const data = await res.json();
      const mapped = data.map(r => ({
        id: r.id,
        purchaseNo: r.purchase_no,
        date: r.purchase_date,
        partyName: r.party_name,
        challanNo: r.challan_no,
        pieces: r.pieces,
        wholesaleRate: r.wholesale_rate,
        saleRate: r.sale_rate,
        designName: r.design_name,
        totalRs: r.purchase_total,
        designCode: r.design_code,
        barcode: r.barcode,
      }));
      setPurchaseData(mapped);
      setShowPurchaseData(true);
    } catch (err) {
      console.error('Error fetching purchase data:', err);
      alert('Error fetching purchase data: ' + err.message);
    } finally {
      setLoadingPurchase(false);
    }
  }

  function addToHistory(field, value) {
    if (!value) return;
    setHistory(h => {
      const prev = h[field].filter(v => v !== value);
      return { ...h, [field]: [value, ...prev].slice(0, 5) };
    });
  }

  async function saveSale() {
    console.log('Form data before save:', form);
    const { date, partyName, salePieces, saleRate, designName, saleTotal, designCode, barcode, discount } = form;
    if (!date || !partyName || !salePieces || !saleRate || !designName || !saleTotal) {
      alert('Please fill in all required fields');
      return;
    }
    try {
      // Generate unique sale ID
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      const uniqueSaleId = `Sale-${timestamp}-${random}`;
      
      const wsRate = parseFloat((purchases || []).filter(p => p.designName === designName).sort((a,b) => b.id - a.id)[0]?.wholeSaleRate) || 0;
      const saleData = {
        sale_id: editId ? form.saleId : uniqueSaleId,
        sale_date: date,
        party_name: partyName,
        sale_pieces: salePieces,
        sale_rate: saleRate,
        discount: discount || 0,
        sale_total: saleTotal,
        design_code: designCode,
        design_name: designName,
        barcode: barcode,
        wholesale_rate: wsRate,
        phone_no: partyInfo.contact || null,
        whatsapp: partyInfo.whatsapp || null,
        facebook_id: partyInfo.facebook || null,
        instagram: partyInfo.instagram || null,
        address: partyInfo.address || null,
      };
      console.log('Saving sale data:', saleData);
      
      const res = await apiFetch(editId ? `${API}/api/sales/${editId}` : `${API}/api/sales`, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saleData),
      });
      
      console.log('Response status:', res.status);
      const responseText = await res.text();
      console.log('Response text:', responseText);
      
      if (!res.ok) {
        let err;
        try {
          err = JSON.parse(responseText);
        } catch {
          err = { error: responseText };
        }
        throw new Error(err.error || 'Failed to save');
      }
      
      addToHistory('salePieces', salePieces);
      addToHistory('saleRate', saleRate);
      addToHistory('discount', discount);
      addToHistory('designName', designName);
      alert(editId ? 'Sale updated successfully!' : 'Sale saved successfully!');
      if (onSaved) onSaved();
      clearForm();
    } catch (err) {
      console.error('Save sale error:', err);
      alert('Error saving sale: ' + err.message);
    }
  }

  function submitNewParty() {
    if (!newParty.name.trim()) { alert('Please enter a party name'); return; }
    const partyObj = { ...newParty, name: newParty.name.trim() };
    onAddParty(partyObj);
    set('partyName', partyObj.name);
    setPartyInfo({ contact: partyObj.contact, whatsapp: partyObj.whatsapp, facebook: partyObj.facebook, instagram: partyObj.instagram, address: partyObj.address });
    setShowPartyModal(false);
    setNewParty({ name: '', contact: '', address: '', facebook: '', instagram: '', whatsapp: '' });
    alert(`Party "${partyObj.name}" added successfully!`);
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
  const historyIcon = (
    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <>
      <div className="sale-form no-print bg-white rounded-lg shadow-sm border border-gray-200 p-2.5 mb-3">
        <FormHeader icon={formIcons.sale} title={editId ? `Edit Sale — ${form.saleId}` : 'Sale Data Entry'}
          subtitle={editId ? 'Change the details and press Update Sale, or Cancel Edit to go back' : "Enter sale details, then the customer's phone — saved customers fill in automatically"}
          onClear={clearForm} clearLabel={editId ? 'Cancel Edit' : 'Clear Form'}
          onSave={saveSale} saveLabel={editId ? 'Update Sale' : 'Save Sale'} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <div className="lg:col-span-2 space-y-2">
            <SectionCard title="Sale Details" accent="blue" icon={sectionIcons.sale}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.1fr_2fr_1.6fr] gap-2">
              {/* Sale ID */}
              <div>
                <label className={labelCls}>Sale Number ID</label>
                <input className={inputCls} value={form.saleId} onChange={e => set('saleId', e.target.value)} placeholder="Sale-000001" />
              </div>

              {/* Date */}
              <div>
                <label className={labelCls}>Date</label>
                <div className="relative">
                  <input readOnly className={inputCls + ' cursor-pointer pr-8'}
                    value={form.date ? isoToDisplay(form.date) : ''}
                    placeholder="dd/mm/yy"
                    onClick={() => document.getElementById('saleDatePicker').showPicker()} />
                  <button type="button"
                    onClick={() => document.getElementById('saleDatePicker').showPicker()}
                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 hover:text-blue-500">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <input id="saleDatePicker" type="date"
                    className="absolute opacity-0 pointer-events-none w-0 h-0"
                    value={form.date} onChange={e => set('date', e.target.value)} />
                </div>
              </div>

              {/* Design Name - Dropdown from Purchase Table */}
              <div className="sm:col-span-2 lg:col-span-1">
                <label className={labelCls}>Design Name / Code</label>
                <div className="flex items-center gap-1">
                  <div className="relative flex-1">
                    <select
                      className={inputCls + ' appearance-none'}
                      value={form.designName}
                      onChange={e => {
                        chooseDesign(e.target.value);
                      }}
                    >
                      <option value="">Select Design Name</option>
                      {designNamesFromPurchases.map(p => (
                        <option key={p.designName} value={p.designName}>
                          {p.designName}{p.designCode ? ` — ${shortDesignCode(p.designCode, p.designName)}` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {form.designCode && (
                    <button
                      type="button"
                      onClick={() => fetchPurchaseByDesignCode(form.designCode)}
                      className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded border border-blue-200 transition-colors"
                      title="View Purchase Data"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Design Name */}
              <div className="relative">
                <label className={labelCls}>Design Name</label>
                <div className="flex items-center gap-1">
                  <div className="relative flex-1">
                    <select className={inputCls + ' appearance-none'} value={form.designName}
                      onChange={e => handleDesignChange(e.target.value)}
                      onFocus={() => setShowHistory(h => ({ ...h, designName: true }))}
                      onBlur={() => setTimeout(() => setShowHistory(h => ({ ...h, designName: false })), 150)}>
                      <option value="">Select Design</option>
                      {[...new Set([...designs, ...(purchases||[]).map(p=>p.designName)].filter(Boolean))].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <button type="button" title="Delete selected design"
                    onClick={() => {
                      if (!form.designName) { alert('Please select a design to delete'); return; }
                      if (window.confirm(`Delete design "${form.designName}"?`)) { onDeleteDesign(form.designName); set('designName', ''); }
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
                        {historyIcon}{v}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>

              <div className="mt-2 pt-1.5 border-t border-dashed border-gray-200">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Quantity &amp; price</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {/* Sale Pieces */}
                <div className="relative">
                  <label className={labelCls}>Sale Pieces</label>
                  <input type="number" className={inputCls} value={form.salePieces}
                    onChange={e => set('salePieces', e.target.value)}
                    onFocus={() => setShowHistory(h => ({ ...h, salePieces: true }))}
                    onBlur={() => setTimeout(() => setShowHistory(h => ({ ...h, salePieces: false })), 150)}
                    placeholder="Enter Pieces" />
                  {showHistory.salePieces && history.salePieces.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full bg-white border border-gray-200 rounded shadow-lg">
                      {history.salePieces.map((v, i) => (
                        <div key={i} onClick={() => { set('salePieces', v); setShowHistory(h => ({ ...h, salePieces: false })); }}
                          className="px-2 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                          {historyIcon}{v}
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
                          {historyIcon}{v}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Discount */}
                <div className="relative">
                  <label className={labelCls}>Discount %</label>
                  <input type="number" className={inputCls} value={form.discount}
                    onChange={e => set('discount', e.target.value)}
                    onFocus={e => { e.target.select(); setShowHistory(h => ({ ...h, discount: true })); }}
                    onBlur={() => setTimeout(() => setShowHistory(h => ({ ...h, discount: false })), 150)}
                    placeholder="0" step="0.01" min="0" max="100" />
                  {showHistory.discount && history.discount.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full bg-white border border-gray-200 rounded shadow-lg">
                      {history.discount.map((v, i) => (
                        <div key={i} onClick={() => { set('discount', v); setShowHistory(h => ({ ...h, discount: false })); }}
                          className="px-2 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                          {historyIcon}{v}%
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Customer Information" accent="emerald" highlight icon={sectionIcons.customer}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {/* Customer Phone No */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Customer Phone No
                  </span>
                </label>
                <div className="relative">
                  <PhoneInput className={inputCls}
                    value={partyInfo.contact}
                    onFocus={() => setShowPhoneMatches(true)}
                    onBlur={() => setTimeout(() => setShowPhoneMatches(false), 150)}
                    onChange={val => {
                      setPartyInfo(withContact(partyInfo, val));
                      setShowPhoneMatches(true);
                      fillCustomerByPhone(val);
                    }} />
                  {showPhoneMatches && phoneKey(partyInfo.contact).length < 10 && phoneMatches(partyInfo.contact).length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-56 overflow-y-auto">
                      <div className="px-2 py-1 text-[10px] font-semibold text-gray-500 bg-gray-50 border-b">Saved customers</div>
                      {phoneMatches(partyInfo.contact).map(c => (
                        <div key={c.name} onMouseDown={() => pickCustomer(c)}
                          className="px-2 py-1.5 cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0">
                          <div className="text-xs font-semibold text-gray-800">{c.name}</div>
                          <div className="text-[11px] text-gray-500 font-mono">{c.contact || c.whatsapp}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {phoneKey(partyInfo.contact).length === 10 && (
                  findCustomerByPhone(partyInfo.contact)
                    ? <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">✓ Existing customer — details filled</span>
                    : <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800">+ New customer — enter details below</span>
                )}
              </div>

              {/* Customer Name */}
              <div>
                <label className={labelCls}>Customer Name</label>
                <input className={inputCls} list="customer-names" value={form.partyName}
                  onChange={e => handleCustomerName(e.target.value)} placeholder="Type customer name" />
                <datalist id="customer-names">
                  {customerNames.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>

              {/* Party WhatsApp */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.121 1.534 5.857L0 24l6.335-1.511A11.951 11.951 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.741 9.741 0 01-4.964-1.356l-.356-.212-3.693.88.941-3.601-.232-.37A9.712 9.712 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                    WhatsApp
                  </span>
                </label>
                <PhoneInput className={inputCls}
                  value={partyInfo.whatsapp}
                  onChange={val => {
                    setPartyInfo(p => ({ ...p, whatsapp: val }));
                  }} />
              </div>

              {/* Party Facebook */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook ID
                  </span>
                </label>
                <input className={inputCls}
                  value={partyInfo.facebook} placeholder="Facebook ID or page URL"
                  onChange={e => {
                    const val = e.target.value;
                    setPartyInfo(p => ({ ...p, facebook: val }));
                  }} />
              </div>

              {/* Party Instagram */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-pink-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    Instagram
                  </span>
                </label>
                <input className={inputCls}
                  value={partyInfo.instagram} placeholder="@username"
                  onChange={e => {
                    const val = e.target.value;
                    setPartyInfo(p => ({ ...p, instagram: val }));
                  }} />
              </div>

              {/* Party Address */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Address
                  </span>
                </label>
                <input className={inputCls}
                  value={partyInfo.address} placeholder="Party address"
                  onChange={e => {
                    const val = e.target.value;
                    setPartyInfo(p => ({ ...p, address: val }));
                  }} />
              </div>
              </div>
            </SectionCard>
          </div>

          {/* phones / tablets: barcode scan and total come first; desktop keeps them on the right */}
          <div className="contents lg:block lg:space-y-2">
            <div className="order-first lg:order-none">
            <SectionCard title="Barcode" accent="slate" icon={sectionIcons.barcode}>
              {/* Scan a purchase barcode to fill design, sale rate and barcode */}
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
              {/* Bar Code */}
              <div>
                {!form.barcode && <p className="text-xs text-gray-400 italic">Barcode appears after a design is chosen or scanned</p>}
                {form.barcode && <BarcodeCanvas value={form.barcode} designCode={form.designCode} saleRate={form.saleRate} />}
              </div>
            </SectionCard>
            </div>

            <div className="order-last lg:order-none">
            <SectionCard title="Bill Summary" accent="amber" icon={sectionIcons.bill}>
              {/* Sales Total Breakdown */}
              <div>
                <div className="rounded-lg overflow-hidden border-2 border-slate-400 shadow-md">
                  {/* pieces x rate = gross */}
                  <div className="flex justify-between items-center px-3 py-1 bg-white text-xs text-gray-700 border-b border-gray-100">
                    <span className="font-medium">{form.salePieces||0} pcs × Rs {fmtNum(form.saleRate||0)}</span>
                    <span className="font-semibold text-gray-800">= Rs {((parseFloat(form.salePieces)||0) * (parseFloat(form.saleRate)||0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                  {/* discount row - always shown */}
                  <div className="flex justify-between items-center px-3 py-1 bg-red-50 text-xs text-red-600 border-b border-red-100">
                    <span className="font-medium">− Discount {form.discount||0}%</span>
                    <span className="font-semibold">= Rs {(((parseFloat(form.salePieces)||0) * (parseFloat(form.saleRate)||0)) * (parseFloat(form.discount)||0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                  {/* total row */}
                  <div className="flex justify-between items-center px-3 py-1.5 bg-slate-800">
                    <span className="font-bold text-white text-sm tracking-wide">Sales Total</span>
                    <span className="text-white font-extrabold whitespace-nowrap">
                      <span className="text-xl mr-1.5">Rs</span>
                      <span style={{ fontSize: '24px' }}>{form.saleTotal ? parseFloat(form.saleTotal).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'}</span>
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 italic mt-0.5 px-1.5 py-0.5 bg-gray-50 rounded border-l-2 border-slate-400 truncate">
                  {amountWords}
                </div>
              </div>
            </SectionCard>
            </div>
          </div>
        </div>

        {/* Party Purchase Records Panel */}
        {showPartyPurchases && partyPurchases.length > 0 && (
          <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
            <div className="bg-blue-50 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-blue-800">Purchase Records — {form.partyName}</span>
                <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded-full font-medium">{partyPurchases.length}</span>
                <span className="text-xs text-gray-500">| Total Pieces: <strong className="text-blue-700">{partyPurchases.reduce((s, p) => s + (parseFloat(p.pieces) || 0), 0).toLocaleString()}</strong></span>
                <span className="text-xs text-gray-500">| Total Rs: <strong className="text-green-700">Rs {fmtNum(partyPurchases.reduce((s, p) => s + (parseFloat(p.totalRs) || 0), 0))}</strong></span>
              </div>
              <button onClick={() => setShowPartyPurchases(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['Purchase No','Date','Challan No','Pieces','W/S Rate','Sale Rate','Design Name','Design Code','Total Rs','Barcode'].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left font-semibold text-gray-700 whitespace-nowrap border-b border-gray-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {partyPurchases.map((p, i) => (
                    <tr key={p.id || i} className="hover:bg-blue-50 cursor-pointer" onClick={() => {
                      set('designCode', p.designCode || '');
                      set('designName', p.designName || '');
                      set('saleRate', p.saleRate || '');
                      setShowPartyPurchases(false);
                    }}>
                      <td className="px-3 py-1.5 font-medium text-gray-900 whitespace-nowrap">{p.idNo}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{p.date}</td>
                      <td className="px-3 py-1.5 text-gray-600">{p.challanNo}</td>
                      <td className="px-3 py-1.5 text-gray-700">{p.pieces}</td>
                      <td className="px-3 py-1.5 text-gray-700">Rs {fmtNum(p.wholeSaleRate)}</td>
                      <td className="px-3 py-1.5 text-gray-700">Rs {fmtNum(p.saleRate)}</td>
                      <td className="px-3 py-1.5 text-gray-700">{p.designName}</td>
                      <td className="px-3 py-1.5 text-blue-600 font-medium">{p.designCode}</td>
                      <td className="px-3 py-1.5 font-semibold text-green-700">Rs {fmtNum(p.totalRs)}</td>
                      <td className="px-3 py-1.5 text-gray-400 font-mono text-[10px]">{p.barcode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200">
              <span className="text-[10px] text-gray-400 italic">Click a row to auto-fill Design Code, Design Name and Sale Rate</span>
            </div>
          </div>
        )}

      </div>

      {/* Add Party Modal */}
      {showPartyModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
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
              <div>
                <label className={labelCls}>Party Name <span className="text-red-500">*</span></label>
                <input className={inputCls} value={newParty.name} onChange={e => setNewParty(p => ({ ...p, name: e.target.value }))} placeholder="Enter party name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}><span className="flex items-center gap-1"><svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>Phone No</span></label>
                  <PhoneInput className={inputCls} value={newParty.contact} onChange={val => setNewParty(p => withContact(p, val))} />
                </div>
                <div>
                  <label className={labelCls}><span className="flex items-center gap-1"><svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.121 1.534 5.857L0 24l6.335-1.511A11.951 11.951 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.741 9.741 0 01-4.964-1.356l-.356-.212-3.693.88.941-3.601-.232-.37A9.712 9.712 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>WhatsApp</span></label>
                  <PhoneInput className={inputCls} value={newParty.whatsapp} onChange={val => setNewParty(p => ({ ...p, whatsapp: val }))} />
                </div>
              </div>
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Facebook ID</span></label>
                <input className={inputCls} value={newParty.facebook} onChange={e => setNewParty(p => ({ ...p, facebook: e.target.value }))} placeholder="Enter Facebook ID or page URL" />
              </div>
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><svg className="w-3 h-3 text-pink-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>Instagram</span></label>
                <input className={inputCls} value={newParty.instagram} onChange={e => setNewParty(p => ({ ...p, instagram: e.target.value }))} placeholder="@username" />
              </div>
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Address</span></label>
                <textarea className={inputCls + ' resize-none'} rows={2} value={newParty.address} onChange={e => setNewParty(p => ({ ...p, address: e.target.value }))} placeholder="Enter address" />
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
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800">Add New Design</h3>
              <button onClick={() => setShowDesignModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div><label className={labelCls}>Design Name</label><input className={inputCls} value={newDesign.name} onChange={e => setNewDesign(d => ({ ...d, name: e.target.value }))} placeholder="Enter design name" /></div>
              <div>
                <label className={labelCls}>Category</label>
                <select className={inputCls} value={newDesign.category} onChange={e => setNewDesign(d => ({ ...d, category: e.target.value }))}>
                  <option value="">Select Category</option>
                  {['Floral','Geometric','Abstract','Traditional','Modern','Classic'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Description</label><textarea className={inputCls + ' resize-none'} rows={2} value={newDesign.description} onChange={e => setNewDesign(d => ({ ...d, description: e.target.value }))} placeholder="Enter description" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
              <button onClick={() => setShowDesignModal(false)} className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button onClick={submitNewDesign} className="px-3 py-1.5 text-xs text-white bg-blue-500 rounded hover:bg-blue-600">Add Design</button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Data Modal - Shows purchase records by Design Code */}
      {showPurchaseData && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-blue-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Purchase Data for Design Code</h3>
                  <p className="text-xs text-blue-600 font-medium">{form.designCode}</p>
                </div>
              </div>
              <button onClick={() => setShowPurchaseData(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {loadingPurchase ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-sm text-gray-600">Loading...</span>
                </div>
              ) : purchaseData.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-500">No purchase records found for this design code.</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="mb-4 bg-blue-50 rounded-lg p-3 flex items-center gap-4 text-sm">
                    <span className="text-gray-600">Found <strong className="text-blue-700">{purchaseData.length}</strong> records</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-600">Total Pieces: <strong className="text-blue-700">{purchaseData.reduce((sum, p) => sum + (parseFloat(p.pieces) || 0), 0).toLocaleString()}</strong></span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-600">Total Purchase: <strong className="text-green-700">Rs {fmtNum(purchaseData.reduce((sum, p) => sum + (parseFloat(p.totalRs) || 0), 0))}</strong></span>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Purchase No','Date','Party Name','Challan No','Pieces','W/S Rate','Sale Rate','Design Name','Total Rs','Barcode'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {purchaseData.map(p => (
                          <tr key={p.id} className="hover:bg-blue-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{p.purchaseNo}</td>
                            <td className="px-3 py-2 text-gray-600">{p.date}</td>
                            <td className="px-3 py-2 text-gray-700">{p.partyName}</td>
                            <td className="px-3 py-2 text-gray-600">{p.challanNo}</td>
                            <td className="px-3 py-2 text-gray-700">{p.pieces}</td>
                            <td className="px-3 py-2 text-gray-700">Rs {fmtNum(p.wholesaleRate)}</td>
                            <td className="px-3 py-2 text-gray-700">Rs {fmtNum(p.saleRate)}</td>
                            <td className="px-3 py-2 text-gray-700">{p.designName}</td>
                            <td className="px-3 py-2 font-semibold text-green-700">Rs {fmtNum(p.totalRs)}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">{p.barcode}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end">
              <button onClick={() => setShowPurchaseData(false)} className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── sale table ────────────────────────────────────────────────────────────────

function SaleTable({ sales, onDelete, onUpdate, onEdit, parties = [], designs = [], onAddParty, onAddDesign, purchases = [] }) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddParty, setShowAddParty] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [showAddDesign, setShowAddDesign] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');

  const lCls = 'block text-xs font-medium text-gray-600 mb-0.5';
  const iCls = 'w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs';

  const filtered = sales.filter(s =>
    (s.id || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.party || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.designCode || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  function openEdit(sale) {
    const rawDate = sale.date || '';
    const date = rawDate.length > 10 ? rawDate.slice(0, 10) : rawDate;
    setEditRow(sale.dbId);
    setEditForm({
      sale_id: sale.id,
      sale_date: date,
      party_name: sale.party,
      sale_pieces: sale.pieces,
      sale_rate: sale.saleRate,
      discount: sale.discount,
      sale_total: sale.total,
      design_code: sale.designCode,
      design_name: sale.designName,
      barcode: sale.barcode,
    });
    setShowAddParty(false);
    setShowAddDesign(false);
  }

  function closeEdit() { setEditRow(null); setEditForm({}); }

  async function saveEdit() {
    try {
      const wsRate = parseFloat((purchases || []).filter(p => p.designName === editForm.design_name).sort((a,b) => b.id - a.id)[0]?.wholeSaleRate) || 0;
      const res = await apiFetch(`${API}/api/sales/${editRow}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, wholesale_rate: wsRate }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      onUpdate();
      closeEdit();
    } catch (err) {
      alert('Error updating sale: ' + err.message);
    }
  }

  const allPartyNames = [...new Set([...parties.map(p => p.name), ...sales.map(s => s.party)].filter(Boolean))];
  const allDesignNames = [...new Set([...designs, ...sales.map(s => s.designName)].filter(Boolean))];

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3 space-y-2 lg:space-y-0">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search sales" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-56 pl-7 pr-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs bg-white" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-50">
            <tr>
              <th className="px-3 py-2 text-left">
                <input type="checkbox"
                  onChange={e => setSelected(e.target.checked ? paged.map(s => s.dbId) : [])}
                  checked={paged.length > 0 && paged.every(s => selected.includes(s.dbId))}
                  className="rounded border-gray-300" />
              </th>
              {['Sale ID','Date','Party','Pieces','Sale Rate','Discount %','Discount Rs','Total Rs','Design','Barcode','Actions'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-700 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* every row is rendered so Print / PDF / Excel get them all; off-page rows are hidden */}
            {filtered.map((sale, i) => (
              <tr key={sale.dbId} className={`hover:bg-gray-50 ${pageCls(i, page)}`}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.includes(sale.dbId)}
                    onChange={() => setSelected(sel => sel.includes(sale.dbId) ? sel.filter(s => s !== sale.dbId) : [...sel, sale.dbId])}
                    className="rounded border-gray-300" />
                </td>
                <td className="px-3 py-2 font-medium text-gray-900">{sale.id}</td>
                <td className="px-3 py-2 text-gray-600">{isoToDisplay((sale.date||'').slice(0,10))}</td>
                <td className="px-3 py-2 text-gray-900">{sale.party}</td>
                <td className="px-3 py-2 text-gray-900">{sale.pieces}</td>
                <td className="px-3 py-2 text-gray-900">Rs {fmtNum(sale.saleRate)}</td>
                <td className="px-3 py-2 text-gray-900">{sale.discount}%</td>
                <td className="px-3 py-2 font-medium text-red-600">Rs {fmtNum(parseFloat(sale.discountRs||0))}</td>
                <td className="px-3 py-2 font-medium text-green-700">Rs {fmtNum(sale.total)}</td>
                <td className="px-3 py-1.5"><div className="font-medium text-blue-700 leading-tight">{sale.designName}</div><div className="text-[10px] text-gray-500 leading-tight">{sale.designCode}</div></td>
                <td className="px-3 py-1"><BarcodeMini value={sale.barcode} /></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => (onEdit ? onEdit(sale) : openEdit(sale))} title="Edit"
                      className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => onDelete(sale.dbId)} title="Delete"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors">
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
                <td colSpan={3} className="px-3 py-2 font-bold whitespace-nowrap">PAGE TOTAL — {paged.length} sales</td>
                <td className="px-3 py-2 font-bold whitespace-nowrap text-blue-700">{paged.reduce((a, s) => a + (parseFloat(s.pieces) || 0), 0)}</td>
                <td colSpan={2}></td>
                <td className="px-3 py-2 font-bold whitespace-nowrap text-red-600">Rs {Math.round(paged.reduce((a, s) => a + (parseFloat(s.discountRs) || 0), 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 font-bold whitespace-nowrap text-green-700">Rs {Math.round(paged.reduce((a, s) => a + (parseFloat(s.total) || 0), 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
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

      {/* Edit Sale Modal */}
      {editRow && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-800">Edit Sale</h3>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Sale ID */}
              <div>
                <label className={lCls}>Sale ID</label>
                <input className={iCls} value={editForm.sale_id||''} onChange={e => setEditForm(f => ({...f, sale_id: e.target.value}))} />
              </div>

              {/* Date dd/mm/yy */}
              <div>
                <label className={lCls}>Date (dd/mm/yy)</label>
                <input className={iCls}
                  value={editForm.sale_date ? (d => `${d[2]}/${d[1]}/${d[0].slice(2)}`)(editForm.sale_date.slice(0,10).split('-')) : ''}
                  onChange={e => {
                    const v = e.target.value;
                    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
                    if (m) setEditForm(f => ({...f, sale_date: `20${m[3]}-${m[2]}-${m[1]}`}));
                    else setEditForm(f => ({...f, sale_date: f.sale_date}));
                  }}
                  placeholder="dd/mm/yy"
                />
              </div>

              {/* Party Name */}
              <div>
                <label className={lCls}>Party Name</label>
                <div className="flex gap-1">
                  <select className={iCls} value={editForm.party_name||''} onChange={e => setEditForm(f => ({...f, party_name: e.target.value}))}>
                    <option value="">Select Party</option>
                    {allPartyNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddParty(v => !v)}
                    className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 whitespace-nowrap">+ New</button>
                </div>
                {showAddParty && (
                  <div className="flex gap-1 mt-1">
                    <input className={iCls} value={newPartyName} onChange={e => setNewPartyName(e.target.value)} placeholder="New party name" autoFocus />
                    <button type="button" onClick={() => {
                      const name = newPartyName.trim();
                      if (!name) return;
                      if (onAddParty) onAddParty({ name });
                      setEditForm(f => ({...f, party_name: name}));
                      setNewPartyName(''); setShowAddParty(false);
                    }} className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 whitespace-nowrap">Add</button>
                    <button type="button" onClick={() => { setShowAddParty(false); setNewPartyName(''); }}
                      className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 whitespace-nowrap">Cancel</button>
                  </div>
                )}
              </div>

              {/* Sale Pieces */}
              <div>
                <label className={lCls}>Sale Pieces</label>
                <input type="number" className={iCls} value={editForm.sale_pieces||''} onChange={e => {
                  const pieces = e.target.value;
                  const gross = (parseFloat(pieces)||0) * (parseFloat(editForm.sale_rate)||0);
                  const total = gross - gross * (parseFloat(editForm.discount)||0) / 100;
                  setEditForm(f => ({...f, sale_pieces: pieces, sale_total: total ? total.toFixed(2) : ''}));
                }} />
              </div>

              {/* Sale Rate */}
              <div>
                <label className={lCls}>Sale Rate</label>
                <input type="number" className={iCls} value={editForm.sale_rate||''} onChange={e => {
                  const rate = e.target.value;
                  const gross = (parseFloat(editForm.sale_pieces)||0) * (parseFloat(rate)||0);
                  const total = gross - gross * (parseFloat(editForm.discount)||0) / 100;
                  setEditForm(f => ({...f, sale_rate: rate, sale_total: total ? total.toFixed(2) : ''}));
                }} />
              </div>

              {/* Discount */}
              <div>
                <label className={lCls}>Discount %</label>
                <input type="number" className={iCls} value={editForm.discount||''} onChange={e => {
                  const discount = e.target.value;
                  const gross = (parseFloat(editForm.sale_pieces)||0) * (parseFloat(editForm.sale_rate)||0);
                  const total = gross - gross * (parseFloat(discount)||0) / 100;
                  setEditForm(f => ({...f, discount, sale_total: total ? total.toFixed(2) : ''}));
                }} />
              </div>

              {/* Sale Total */}
              <div>
                <label className={lCls}>Sale Total Rs</label>
                <input type="number" className={iCls} value={editForm.sale_total||''} onChange={e => setEditForm(f => ({...f, sale_total: e.target.value}))}
                  style={{ background: '#f1f5f9', color: '#0f172a', border: '2px solid #94a3b8', fontWeight: '700' }} />
              </div>

              {/* Design Name */}
              <div>
                <label className={lCls}>Design Name</label>
                <div className="flex gap-1">
                  <select className={iCls} value={editForm.design_name||''} onChange={e => setEditForm(f => ({...f, design_name: e.target.value}))}>
                    <option value="">Select Design</option>
                    {allDesignNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddDesign(v => !v)}
                    className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 whitespace-nowrap">+ New</button>
                </div>
                {showAddDesign && (
                  <div className="flex gap-1 mt-1">
                    <input className={iCls} value={newDesignName} onChange={e => setNewDesignName(e.target.value)} placeholder="New design name" autoFocus />
                    <button type="button" onClick={() => {
                      const name = newDesignName.trim();
                      if (!name) return;
                      if (onAddDesign) onAddDesign(name);
                      setEditForm(f => ({...f, design_name: name}));
                      setNewDesignName(''); setShowAddDesign(false);
                    }} className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 whitespace-nowrap">Add</button>
                    <button type="button" onClick={() => { setShowAddDesign(false); setNewDesignName(''); }}
                      className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 whitespace-nowrap">Cancel</button>
                  </div>
                )}
              </div>

              {/* Design Code */}
              <div>
                <label className={lCls}>Design Code</label>
                <input className={iCls} value={editForm.design_code||''} onChange={e => setEditForm(f => ({...f, design_code: e.target.value}))} />
              </div>

              {/* Barcode */}
              <div className="col-span-2 md:col-span-3">
                <label className={lCls}>Barcode</label>
                <input className={iCls} value={editForm.barcode||''} onChange={e => setEditForm(f => ({...f, barcode: e.target.value}))} />
                {editForm.barcode && (
                  <div className="mt-2 flex justify-center">
                    <BarcodeCanvas value={editForm.barcode} designCode={editForm.design_code} saleRate={editForm.sale_rate} />
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

// ── main export ───────────────────────────────────────────────────────────────

export default function SaleEntry({ parties, designs, purchases = [], onAddParty, onDeleteParty, onAddDesign, onDeleteDesign }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editSale, setEditSale] = useState(null);   // sale opened from the list into the entry form
  const nextId = nextSaleIdFromList(sales);

  async function fetchSales() {
    try {
      const res = await apiFetch(`${API}/api/sales`);
      const data = await res.json();
      setSales(data.map(mapRow));
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSales(); }, []);

  async function deleteSale(dbId) {
    if (!window.confirm('Delete this sale?')) return;
    try {
      const res = await apiFetch(`${API}/api/sales/${dbId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete');
      }
      fetchSales();
    } catch (err) {
      alert('Error deleting sale: ' + err.message);
    }
  }

  const totalRecords   = sales.length;
  const totalPieces    = sales.reduce((s, r) => s + (parseFloat(r.pieces) || 0), 0);
  const totalSaleAmt   = sales.reduce((s, r) => s + (parseFloat(r.total)  || 0), 0);
  const totalParties   = new Set(sales.map(r => r.party).filter(Boolean)).size;
  const totalDesigns   = new Set(sales.map(r => r.designName).filter(Boolean)).size;

  return (
    <div className="theme-sale">
      <SaleDataEntry
        nextId={nextId} onSaved={fetchSales}
        sales={sales} designs={designs} purchases={purchases}
        onAddParty={onAddParty}
        onAddDesign={onAddDesign} onDeleteDesign={onDeleteDesign}
        editSale={editSale} onEditDone={() => setEditSale(null)}
      />
      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-2"></div>
          Loading sales...
        </div>
      ) : (
        <SaleTable sales={sales} onDelete={deleteSale} onUpdate={fetchSales}
          onEdit={sale => setEditSale({ ...sale, openedAt: Date.now() })}
          parties={parties} designs={designs} purchases={purchases}
          onAddParty={onAddParty} onAddDesign={onAddDesign} />
      )}

      {/* ── Sale Summary Report ── */}
      <div className="mt-4 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-slate-800 px-4 py-2">
          <h3 className="text-sm font-bold text-white tracking-wide">Sale Summary Report</h3>
        </div>
        <div className="bg-slate-700 grid grid-cols-2 sm:grid-cols-5 divide-x divide-slate-600">
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-blue-200 font-medium">Total Records</p>
            <p className="text-2xl font-bold text-white mt-0.5">{totalRecords}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-blue-200 font-medium">Total Suit/Pieces</p>
            <p className="text-2xl font-bold text-white mt-0.5">{totalPieces.toLocaleString()}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-blue-200 font-medium">Total Sale</p>
            <p className="text-xl font-bold text-white mt-0.5">Rs {totalSaleAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-blue-200 font-medium">Total Party</p>
            <p className="text-2xl font-bold text-white mt-0.5">{totalParties}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-blue-200 font-medium">Total Designs</p>
            <p className="text-2xl font-bold text-white mt-0.5">{totalDesigns}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
