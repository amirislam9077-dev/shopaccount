import React, { useCallback, useEffect, useState } from 'react';
import { API_URL, apiFetch } from '../api';

const API = API_URL;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const Rs = n => (n < 0 ? '− ' : '') + 'Rs ' + Math.round(Math.abs(n || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 });
// API dates are UTC timestamps; use the local calendar date
const localDate = v => (v ? new Date(v).toLocaleDateString('en-CA') : '');
const keyOf = name => String(name || '').trim().toLowerCase();
// "Party Payment", "Advance Payment"... pay suppliers; anything with "exp" is a shop expense
const isPartyPayment = t => /payment/i.test(t || '') && !/exp/i.test(t || '');
const todayISO = () => new Date().toLocaleDateString('en-CA');

// Stock on hand and money owed to parties, as on a given date.
// Stock is valued at average purchase cost, and at the design's sale rate (latest purchase).
function positionOn(date, purchases, sales, payments) {
  const designs = {};
  purchases.filter(p => p.date <= date).sort((a, b) => a.id - b.id).forEach(p => {
    const d = designs[p.key] || (designs[p.key] = { key: p.key, name: p.name, bought: 0, cost: 0, sold: 0, saleRate: 0 });
    d.bought += p.pieces; d.cost += p.total;
    if (p.saleRate > 0) d.saleRate = p.saleRate;
  });
  sales.filter(s => s.date <= date).forEach(s => { if (designs[s.key]) designs[s.key].sold += s.pieces; });
  let stockPcs = 0, stockValue = 0;
  const stockRows = [];
  Object.values(designs).forEach(d => {
    const qty = Math.max(0, d.bought - d.sold);
    const rate = d.bought > 0 ? d.cost / d.bought : 0;   // average purchase cost per piece
    stockPcs += qty;
    stockValue += qty * rate;
    if (qty > 0) stockRows.push({ key: d.key, name: d.name, qty, rate, value: qty * rate, saleRate: d.saleRate });
  });
  stockRows.sort((a, b) => b.value - a.value);

  const balances = {};
  purchases.filter(p => p.date <= date).forEach(p => { balances[p.party] = (balances[p.party] || 0) + p.total; });
  payments.filter(p => p.date <= date).forEach(p => { balances[p.party] = (balances[p.party] || 0) - p.amount; });
  const values = Object.values(balances);
  const payable  = values.filter(v => v > 0).reduce((a, v) => a + v, 0);
  const advances = -values.filter(v => v < 0).reduce((a, v) => a + v, 0);

  return { stockPcs, stockValue, stockRows, payable, advances, netPayable: payable - advances, difference: stockValue - (payable - advances), balances };
}

export default function StockVsPayable() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits]     = useState({});   // design key -> sale rate typed but not saved yet
  const [saving, setSaving]   = useState('');

  const load = useCallback(() => {
    return Promise.all(['purchases', 'sales', 'payments'].map(u => apiFetch(`${API}/api/${u}`).then(r => r.json())))
      .then(([pur, sal, pay]) => {
        const purchases = pur.map(r => ({ id: r.id, date: localDate(r.purchase_date), key: keyOf(r.design_name), name: String(r.design_name || '').trim(),
          party: r.party_name, pieces: parseFloat(r.pieces) || 0, total: parseFloat(r.purchase_total) || 0, saleRate: parseFloat(r.sale_rate) || 0 }));
        const sales = sal.map(r => ({ date: localDate(r.sale_date), key: keyOf(r.design_name),
          pieces: parseFloat(r.sale_pieces) || 0, total: parseFloat(r.sale_total) || 0 }));
        const suppliers = new Set(purchases.map(p => p.party));
        const all = pay.map(r => ({ date: localDate(r.payment_date), party: r.party_name, type: r.payment_type || '', amount: parseFloat(r.amount) || 0 }));
        const payments = all.filter(p => p.party && (suppliers.has(p.party) || isPartyPayment(p.type)));
        setData({ purchases, sales, payments });
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveRate(row) {
    const rate = parseFloat(edits[row.key]);
    if (!(rate > 0)) { alert('Please enter a sale rate above 0'); return; }
    if (!window.confirm(`Set sale rate of "${row.name}" to Rs ${rate.toLocaleString('en-US')}?\nThis changes the sale rate on all purchase entries of this design.`)) return;
    setSaving(row.key);
    try {
      const res = await apiFetch(`${API}/api/purchases/sale-rate`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_name: row.name, sale_rate: rate }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Save failed');
      await load();
      setEdits(e => { const n = { ...e }; delete n[row.key]; return n; });
    } catch (err) {
      alert('Could not save: ' + err.message);
    }
    setSaving('');
  }

  if (loading) return <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>;
  if (!data) return <div className="p-12 text-center text-red-500 text-sm">Could not load data from the server.</div>;

  const { purchases, sales, payments } = data;
  const today = todayISO();
  const now = positionOn(today, purchases, sales, payments);
  const partyRows = Object.entries(now.balances).filter(([, v]) => Math.round(v) !== 0).sort((a, b) => b[1] - a[1]);

  // sale-rate view uses any unsaved edits so the totals can be tried out before saving
  const saleRateOf = r => (edits[r.key] !== undefined ? parseFloat(edits[r.key]) || 0 : r.saleRate);
  const stockSaleValue = now.stockRows.reduce((a, r) => a + r.qty * saleRateOf(r), 0);
  const saleDifference = stockSaleValue - now.netPayable;
  const unsaved = Object.keys(edits).length > 0;

  const fmtDate = iso => { const [y, m, d] = iso.split('-'); return `${d}/${MONTHS[parseInt(m, 10) - 1]}/${y.slice(2)}`; };
  const box  = 'flex-1 min-w-full sm:min-w-[200px] rounded-xl border-2 px-4 py-2.5 text-center';
  const sign = 'w-full sm:w-auto text-center text-3xl font-extrabold text-gray-400 self-center leading-none';

  // one "Stock − Dues = Result" line
  const Equation = ({ title, stock, stockNote, result, highlight }) => {
    const up = result >= 0;
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 px-1">{title}</p>
        <div className="flex flex-wrap items-stretch gap-2">
          <div className={`${box} bg-white border-blue-300`}>
            <p className="text-sm font-bold text-gray-600">Stock in Shop</p>
            <p className="text-2xl font-extrabold text-blue-700">{Rs(stock)}</p>
            <p className="text-xs text-gray-500">{stockNote}</p>
          </div>
          <span className={sign}>−</span>
          <div className={`${box} bg-white border-red-300`}>
            <p className="text-sm font-bold text-gray-600">To Pay Parties</p>
            <p className="text-2xl font-extrabold text-red-600">{Rs(now.netPayable)}</p>
            <p className="text-xs text-gray-500">
              {now.advances > 0 ? `Dues ${Rs(now.payable)} − advance given ${Rs(now.advances)}` : 'Total still to pay'}
            </p>
          </div>
          <span className={sign}>=</span>
          <div className={`${box} ${up ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'} ${highlight ? 'ring-2 ring-slate-300' : ''}`}>
            <p className="text-sm font-bold text-gray-600">{up ? 'Profit' : 'Loss'}</p>
            <p className={`text-2xl font-extrabold ${up ? 'text-green-700' : 'text-red-600'}`}>{Rs(Math.abs(result))}</p>
            <p className={`text-xs font-bold ${up ? 'text-green-700' : 'text-red-600'}`}>{up ? '▲ Stock is more than dues' : '▼ Dues are more than stock'}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3 px-1">
        <h2 className="text-lg font-extrabold text-gray-900">Stock vs Dues</h2>
        <span className="text-xs text-gray-500">As on today, {fmtDate(today)}</span>
      </div>

      <Equation title="At cost price (what we paid)" stock={now.stockValue}
        stockNote={`${now.stockPcs} pieces left`} result={now.difference} />
      <Equation title={`At sale price (if all stock is sold)${unsaved ? ' — includes unsaved rates' : ''}`} stock={stockSaleValue}
        stockNote={`${now.stockPcs} pieces × sale rate`} result={saleDifference} highlight={unsaved} />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 items-start">
        {/* where the dues come from */}
        <div className="xl:col-span-2 min-w-0 overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-3 py-1.5 border-b border-gray-200 text-xs font-bold uppercase tracking-wide text-gray-700 bg-gray-50 rounded-t-lg">Each Party</div>
          <table className="w-full">
            <tbody className="divide-y divide-gray-100">
              {partyRows.length === 0 && <tr><td className="px-3 py-4 text-center text-xs text-gray-400">Nothing to pay — all parties are clear</td></tr>}
              {partyRows.map(([party, bal]) => (
                <tr key={party}>
                  <td className="px-3 py-1.5 text-sm font-semibold text-gray-800">{party}</td>
                  <td className={`px-3 py-1.5 text-sm text-right font-bold whitespace-nowrap ${bal > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {Rs(Math.abs(bal))} {bal > 0 ? 'to pay' : 'advance given'}
                  </td>
                </tr>
              ))}
            </tbody>
            {partyRows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300">
                  <td className="px-3 py-1.5 text-sm font-bold">Total to pay</td>
                  <td className="px-3 py-1.5 text-sm text-right font-extrabold text-red-600">{Rs(now.netPayable)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* where the stock value comes from */}
        <div className="xl:col-span-3 min-w-0 overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-3 py-1.5 border-b border-gray-200 text-xs font-bold uppercase tracking-wide text-gray-700 bg-gray-50 rounded-t-lg flex justify-between">
            <span>Stock by Design</span>
            <span className="no-print normal-case font-semibold text-gray-500">Change a sale rate, then press Save</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-gray-500 bg-gray-50">
                <th className="px-3 py-1 text-left">Design</th>
                <th className="px-3 py-1 text-right">Pieces</th>
                <th className="px-3 py-1 text-right">Cost Rate</th>
                <th className="px-3 py-1 text-right">Cost Value</th>
                <th className="px-3 py-1 text-right">Sale Rate</th>
                <th className="px-3 py-1 text-right">Sale Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {now.stockRows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-gray-400">No stock in shop</td></tr>}
              {now.stockRows.map(r => {
                const editing = edits[r.key] !== undefined;
                const sr = saleRateOf(r);
                return (
                  <tr key={r.key} className={editing ? 'bg-slate-50' : ''}>
                    <td className="px-3 py-1 text-sm font-semibold text-blue-700">{r.name}</td>
                    <td className="px-3 py-1 text-sm text-right font-bold text-gray-800">{r.qty}</td>
                    <td className="px-3 py-1 text-sm text-right text-gray-700 whitespace-nowrap">{Rs(r.rate)}</td>
                    <td className="px-3 py-1 text-sm text-right font-semibold text-blue-700 whitespace-nowrap">{Rs(r.value)}</td>
                    <td className="px-3 py-1 text-right whitespace-nowrap">
                      {/* visually hidden on screen (the input shows it) but still read by Print / PDF / Excel */}
                      <span className="sr-only print:not-sr-only text-sm">{Rs(sr)}</span>
                      <span className="no-print inline-flex items-center gap-1">
                        <input type="number" min="0" value={editing ? edits[r.key] : Math.round(r.saleRate)}
                          onChange={e => setEdits(x => ({ ...x, [r.key]: e.target.value }))}
                          className={`w-24 px-2 py-0.5 text-sm text-right font-semibold rounded border ${editing ? 'border-slate-500 bg-white' : 'border-slate-300 bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-blue-500`} />
                        {editing && (
                          <>
                            <button onClick={() => saveRate(r)} disabled={saving === r.key}
                              className="px-2 py-0.5 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-blue-300">
                              {saving === r.key ? '...' : 'Save'}
                            </button>
                            <button onClick={() => setEdits(x => { const n = { ...x }; delete n[r.key]; return n; })}
                              className="px-1.5 py-0.5 text-xs font-bold text-gray-500 hover:text-red-600" title="Undo">✕</button>
                          </>
                        )}
                      </span>
                    </td>
                    <td className={`px-3 py-1 text-sm text-right font-bold whitespace-nowrap ${sr >= r.rate ? 'text-green-700' : 'text-red-600'}`}
                      title={sr < r.rate ? 'Sale rate is below cost' : ''}>{Rs(r.qty * sr)}</td>
                  </tr>
                );
              })}
            </tbody>
            {now.stockRows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300">
                  <td className="px-3 py-1.5 text-sm font-bold">Total stock</td>
                  <td className="px-3 py-1.5 text-sm text-right font-bold">{now.stockPcs}</td>
                  <td></td>
                  <td className="px-3 py-1.5 text-sm text-right font-extrabold text-blue-700 whitespace-nowrap">{Rs(now.stockValue)}</td>
                  <td></td>
                  <td className="px-3 py-1.5 text-sm text-right font-extrabold text-green-700 whitespace-nowrap">{Rs(stockSaleValue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
