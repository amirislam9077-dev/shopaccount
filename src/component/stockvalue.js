import React, { useEffect, useState } from 'react';
import { PagedTable } from './pager';
import { API_URL, apiFetch } from '../api';

const API = API_URL;

const Rs = n => 'Rs ' + Math.round(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
// Sales get their design code from the customer name, so purchases and sales are matched by design name
const keyOf = name => String(name || '').trim().toLowerCase();

// What is on the shelf right now, per design, and what it is worth
export default function StockValue() {
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/api/purchases`).then(r => r.json()),
      apiFetch(`${API}/api/sales`).then(r => r.json()),
    ]).then(([p, s]) => {
      setPurchases(Array.isArray(p) ? p : []);
      setSales(Array.isArray(s) ? s : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>;

  const designs = {};
  [...purchases].sort((a, b) => a.id - b.id).forEach(p => {
    const k = keyOf(p.design_name);
    if (!k) return;
    const d = designs[k] || (designs[k] = { name: p.design_name.trim(), code: '', bought: 0, cost: 0, sold: 0, saleRate: 0, parties: new Set() });
    const pcs = parseFloat(p.pieces) || 0;
    d.bought += pcs;
    d.cost += parseFloat(p.purchase_total) || pcs * (parseFloat(p.wholesale_rate) || 0);
    d.code = p.design_code || d.code;                       // latest purchase wins
    d.saleRate = parseFloat(p.sale_rate) || d.saleRate;
    if (p.party_name) d.parties.add(p.party_name);
  });
  sales.forEach(s => {
    const d = designs[keyOf(s.design_name)];
    if (d) d.sold += parseFloat(s.sale_pieces) || 0;
  });

  const rows = Object.values(designs).map(d => {
    const avgCost = d.bought > 0 ? d.cost / d.bought : 0;   // weighted average purchase cost per piece
    const inStock = d.bought - d.sold;
    const qty = Math.max(0, inStock);
    return { ...d, avgCost, inStock, costValue: qty * avgCost, saleValue: qty * d.saleRate };
  }).sort((a, b) => b.costValue - a.costValue);

  const q = search.trim().toLowerCase();
  const shown = rows.filter(r =>
    (!inStockOnly || r.inStock > 0) &&
    (!q || [r.name, r.code, ...r.parties].some(v => String(v).toLowerCase().includes(q))));

  const inStockRows = rows.filter(r => r.inStock > 0);
  const totalPcs    = inStockRows.reduce((a, r) => a + r.inStock, 0);
  const totalCost   = inStockRows.reduce((a, r) => a + r.costValue, 0);
  const totalSale   = inStockRows.reduce((a, r) => a + r.saleValue, 0);
  const oversold    = rows.filter(r => r.inStock < 0);

  const th  = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600 bg-gray-100 border-b-2 border-gray-200 whitespace-nowrap';
  const thR = th.replace('text-left', 'text-right');
  const td  = 'px-3 py-1.5 text-xs text-gray-800 whitespace-nowrap';
  const tdR = td + ' text-right';

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-extrabold text-gray-900">Stock Value</h2>
          <span className="text-xs text-gray-500">Pieces still in the shop (bought − sold) and what they are worth</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
        {[
          ['Pieces in Stock', totalPcs, 'text-blue-700', `${inStockRows.length} designs in stock`],
          ['Stock Value (Cost)', Rs(totalCost), 'text-slate-600', 'At average purchase cost'],
          ['Stock Value (Sale Rate)', Rs(totalSale), 'text-green-700', 'If all sell at sale rate'],
          ['Expected Profit on Stock', Rs(totalSale - totalCost), totalSale - totalCost >= 0 ? 'text-green-700' : 'text-red-600',
            totalCost > 0 ? `${(((totalSale - totalCost) / totalCost) * 100).toFixed(1)}% over cost` : ''],
        ].map(([label, value, color, sub]) => (
          <div key={label} className="bg-white rounded-lg border border-gray-200 px-3 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`text-lg font-extrabold leading-tight ${color}`}>{value}</p>
            <p className="text-[11px] text-gray-500 truncate">{sub}</p>
          </div>
        ))}
      </div>

      <div className="no-print flex flex-wrap items-center gap-3 px-4 py-2 border-b border-gray-200">
        <input className="w-full sm:w-64 px-2.5 py-1.5 border border-slate-400 rounded-md text-sm font-semibold text-gray-900 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search design / code / party..." />
        <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 cursor-pointer">
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
          Only designs in stock
        </label>
        {oversold.length > 0 && (
          <span className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1">
            {oversold.length} design(s) show more sold than bought: {oversold.map(r => r.name).join(', ')}
          </span>
        )}
      </div>

      <PagedTable><table className="w-full">
        <thead>
          <tr>
            <th className={th}>#</th>
            <th className={th}>Design</th>
            <th className={th}>Design Code</th>
            <th className={thR}>Bought</th>
            <th className={thR}>Sold</th>
            <th className={thR}>In Stock</th>
            <th className={thR}>Avg Cost / pc</th>
            <th className={thR}>Sale Rate</th>
            <th className={thR}>Value at Cost</th>
            <th className={thR}>Value at Sale Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {shown.length === 0 && (
            <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">No designs found</td></tr>
          )}
          {shown.map((r, i) => (
            <tr key={r.name} className="hover:bg-blue-50">
              <td className={td + ' text-gray-400'}>{i + 1}</td>
              <td className={td + ' font-semibold text-blue-700'}>{r.name}</td>
              <td className={td + ' text-gray-500'}>{r.code}</td>
              <td className={tdR}>{r.bought}</td>
              <td className={tdR}>{r.sold}</td>
              <td className={`${tdR} font-bold ${r.inStock > 0 ? 'text-blue-700' : r.inStock < 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.inStock}</td>
              <td className={tdR}>{Rs(r.avgCost)}</td>
              <td className={tdR}>{Rs(r.saleRate)}</td>
              <td className={tdR + ' font-semibold text-slate-600'}>{Rs(r.costValue)}</td>
              <td className={tdR + ' font-semibold text-green-700'}>{Rs(r.saleValue)}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
              <td className={td} colSpan={3}>TOTAL — {shown.length} designs</td>
              <td className={tdR}>{shown.reduce((a, r) => a + r.bought, 0)}</td>
              <td className={tdR}>{shown.reduce((a, r) => a + r.sold, 0)}</td>
              <td className={tdR + ' text-blue-700'}>{shown.reduce((a, r) => a + Math.max(0, r.inStock), 0)}</td>
              <td colSpan={2}></td>
              <td className={tdR + ' text-slate-600'}>{Rs(shown.reduce((a, r) => a + r.costValue, 0))}</td>
              <td className={tdR + ' text-green-700'}>{Rs(shown.reduce((a, r) => a + r.saleValue, 0))}</td>
            </tr>
          </tfoot>
        )}
      </table></PagedTable>
    </div>
  );
}
