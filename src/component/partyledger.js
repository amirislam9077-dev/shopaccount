/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import { fmtNum } from './format';
import { REPORT_START_DATE } from './reportexport';
import { PagedTable } from './pager';
import { API_URL, apiFetch } from '../api';

const API = API_URL;

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

// The API sends dates as UTC timestamps; take the calendar date in local time
const localDate = v => (v ? new Date(v).toLocaleDateString('en-CA') : '');

const Rs = n => 'Rs ' + Math.round(parseFloat(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

// Balance is what the shop owes the party: purchases (credit to party) minus payments
function BalanceText({ value, className = '' }) {
  if (Math.round(value) === 0) return <span className={`text-gray-600 ${className}`}>Rs 0 · Settled</span>;
  return value > 0
    ? <span className={`text-red-600 ${className}`}>{Rs(value)} · Payable</span>
    : <span className={`text-green-700 ${className}`}>{Rs(-value)} · Advance</span>;
}

export default function PartyLedger() {
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [party, setParty]         = useState('');

  useEffect(() => {
    setDateFrom(REPORT_START_DATE);
    setDateTo(todayISO());
    Promise.all([
      apiFetch(`${API}/api/purchases`).then(r => r.json()),
      apiFetch(`${API}/api/payments`).then(r => r.json()),
    ]).then(([purData, payData]) => {
      setPurchases(purData.map(r => ({
        id:     r.id,
        type:   'Purchase',
        date:   localDate(r.purchase_date),
        refNo:  r.purchase_no || '',
        party:  r.party_name,
        phone:  r.phone_no || '',
        details: [r.design_name, r.pieces ? `${parseFloat(r.pieces)} pcs × Rs ${fmtNum(parseFloat(r.wholesale_rate) || 0)}` : '', r.challan_no ? `Challan ${r.challan_no}` : '']
          .filter(Boolean).join(' · '),
        amount: parseFloat(r.purchase_total) || 0,
      })));
      setPayments(payData.map(r => ({
        id:     r.id,
        type:   'Payment',
        date:   localDate(r.payment_date),
        refNo:  r.payment_id || '',
        party:  r.party_name,
        paymentType: r.payment_type || '',
        details: [r.payment_type, r.bank, r.cheque_no ? `Chq ${r.cheque_no}` : '', r.remarks].filter(Boolean).join(' · '),
        amount: parseFloat(r.amount) || 0,
      })));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Ledger parties are suppliers: anyone we bought from, plus anyone paid with a party payment type
  // (expense entries such as salaries or rent are not party accounts)
  const isPartyPayment = p => /payment/i.test(p.paymentType) && !/expense/i.test(p.paymentType);
  const partyPayments  = payments.filter(p => p.party && (purchases.some(x => x.party === p.party) || isPartyPayment(p)));
  const allTxns  = [...purchases, ...partyPayments];
  const parties  = [...new Set(allTxns.map(t => t.party).filter(Boolean))].sort();
  const inRange  = d => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  const sum      = (rows, type) => rows.filter(t => t.type === type).reduce((a, t) => a + t.amount, 0);

  // ── all parties overview ──
  const overview = parties.map(name => {
    const rows = allTxns.filter(t => t.party === name);
    const before = rows.filter(t => dateFrom && t.date < dateFrom);
    const within = rows.filter(t => inRange(t.date));
    const opening = sum(before, 'Purchase') - sum(before, 'Payment');
    const purchased = sum(within, 'Purchase');
    const paid = sum(within, 'Payment');
    const last = within.map(t => t.date).sort().pop() || '';
    return { name, phone: (rows.find(t => t.phone) || {}).phone || '', opening, purchased, paid, closing: opening + purchased - paid, last };
  }).filter(p => p.opening || p.purchased || p.paid).sort((a, b) => b.closing - a.closing);

  // ── one party's ledger ──
  const partyRows = allTxns.filter(t => t.party === party);
  const beforeRows = partyRows.filter(t => dateFrom && t.date < dateFrom);
  const opening = sum(beforeRows, 'Purchase') - sum(beforeRows, 'Payment');
  let running = opening;
  // oldest first; on the same day purchases come before payments
  const ledger = partyRows.filter(t => inRange(t.date))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.id - b.id : a.type === 'Purchase' ? -1 : 1))
    .map(t => {
      running += t.type === 'Purchase' ? t.amount : -t.amount;
      return { ...t, balance: running };
    });
  const periodPurchase = sum(ledger, 'Purchase');
  const periodPaid     = sum(ledger, 'Payment');
  const closing        = opening + periodPurchase - periodPaid;
  const partyPhone     = (partyRows.find(t => t.phone) || {}).phone || '';

  const iCls  = 'w-full px-2.5 py-1.5 border border-slate-400 rounded-md text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lCls  = 'block text-xs font-bold text-gray-700 mb-0.5';
  const th    = 'px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wide bg-gray-100 border-b-2 border-gray-200 whitespace-nowrap';
  const thR   = th.replace('text-left', 'text-right');
  const td    = 'px-3 py-2 text-sm';
  const tdR   = td + ' text-right whitespace-nowrap';

  if (loading) return <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* ── heading + filters ── */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-baseline gap-3 mb-2">
          <h2 className="text-lg font-extrabold text-gray-900">Party Ledger</h2>
          <span className="text-xs text-gray-500">
            {party ? 'Every purchase and payment for this party, with the running balance' : 'What each party has supplied, what they have been paid, and what is still owed'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <label className={lCls}>Party</label>
            <select className={iCls} value={party} onChange={e => setParty(e.target.value)}>
              <option value="">All Parties — balance summary</option>
              {parties.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={lCls}>Date From</label>
            <input type="date" className={iCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className={lCls}>Date To</label>
            <input type="date" className={iCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      {!party ? (
        /* ── all parties: one line each ── */
        <PagedTable><table className="w-full">
          <thead>
            <tr>
              <th className={th}>#</th>
              <th className={th}>Party</th>
              <th className={th}>Phone</th>
              <th className={thR}>Opening</th>
              <th className={thR}>Purchased</th>
              <th className={thR}>Paid</th>
              <th className={thR}>Balance</th>
              <th className={th}>Last Entry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {overview.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">No party entries in this date range</td></tr>
            )}
            {overview.map((p, i) => (
              <tr key={p.name} onClick={() => setParty(p.name)} className="cursor-pointer hover:bg-blue-50" title="Open this party's ledger">
                <td className={td + ' text-gray-400'}>{i + 1}</td>
                <td className={td + ' font-bold text-blue-700 underline-offset-2 hover:underline'}>{p.name}</td>
                <td className={td + ' text-gray-600'}>{p.phone || '—'}</td>
                <td className={tdR + ' text-gray-600'}>{Rs(p.opening)}</td>
                <td className={tdR}>{Rs(p.purchased)}</td>
                <td className={tdR + ' text-green-700'}>{Rs(p.paid)}</td>
                <td className={tdR + ' font-bold'}><BalanceText value={p.closing} /></td>
                <td className={td + ' text-gray-600 whitespace-nowrap'}>{p.last ? isoToDisplay(p.last) : '—'}</td>
              </tr>
            ))}
          </tbody>
          {overview.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                <td className={td} colSpan={3}>TOTAL — {overview.length} parties</td>
                <td className={tdR}>{Rs(overview.reduce((a, p) => a + p.opening, 0))}</td>
                <td className={tdR}>{Rs(overview.reduce((a, p) => a + p.purchased, 0))}</td>
                <td className={tdR + ' text-green-700'}>{Rs(overview.reduce((a, p) => a + p.paid, 0))}</td>
                <td className={tdR}><BalanceText value={overview.reduce((a, p) => a + p.closing, 0)} /></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table></PagedTable>
      ) : (
        <>
          {/* ── party account summary ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
            {[
              ['Opening Balance', <BalanceText value={opening} />, `Before ${dateFrom ? isoToDisplay(dateFrom) : 'start'}`],
              ['Purchased', <span className="text-gray-900">{Rs(periodPurchase)}</span>, `${ledger.filter(t => t.type === 'Purchase').length} purchases`],
              ['Paid', <span className="text-green-700">{Rs(periodPaid)}</span>, `${ledger.filter(t => t.type === 'Payment').length} payments`],
              ['Closing Balance', <BalanceText value={closing} />, partyPhone ? `Phone ${partyPhone}` : `As on ${dateTo ? isoToDisplay(dateTo) : 'today'}`],
            ].map(([label, value, sub]) => (
              <div key={label} className={`rounded-lg border px-3 py-2 ${label === 'Closing Balance' ? 'bg-white border-2 border-blue-300' : 'bg-white border-gray-200'}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                <p className="text-base font-extrabold">{value}</p>
                <p className="text-[11px] text-gray-500 truncate">{sub}</p>
              </div>
            ))}
          </div>

          {/* ── the ledger ── */}
          <PagedTable><table className="w-full">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Entry</th>
                <th className={th}>Ref No</th>
                <th className={th}>Details</th>
                <th className={thR}>Purchase (+)</th>
                <th className={thR}>Payment (−)</th>
                <th className={thR}>Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="bg-gray-50">
                <td className={td + ' text-gray-500 whitespace-nowrap'}>{dateFrom ? isoToDisplay(dateFrom) : ''}</td>
                <td className={td + ' font-semibold text-gray-600'} colSpan={3}>Opening Balance</td>
                <td className={tdR}></td>
                <td className={tdR}></td>
                <td className={tdR + ' font-bold'}><BalanceText value={opening} /></td>
              </tr>
              {ledger.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-sm">No entries for {party} in this date range</td></tr>
              )}
              {ledger.map(t => (
                <tr key={t.type + t.id} className="hover:bg-blue-50">
                  <td className={td + ' whitespace-nowrap text-gray-700'}>{isoToDisplay(t.date)}</td>
                  <td className={td}>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${t.type === 'Purchase' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{t.type}</span>
                  </td>
                  <td className={td + ' font-mono text-xs text-gray-600'}>{t.refNo}</td>
                  <td className={td + ' text-gray-700'}>{t.details || '—'}</td>
                  <td className={tdR + ' font-semibold text-gray-900'}>{t.type === 'Purchase' ? Rs(t.amount) : ''}</td>
                  <td className={tdR + ' font-semibold text-green-700'}>{t.type === 'Payment' ? Rs(t.amount) : ''}</td>
                  <td className={tdR + ' font-bold'}><BalanceText value={t.balance} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                <td className={td} colSpan={4}>Closing Balance — {dateTo ? isoToDisplay(dateTo) : ''}</td>
                <td className={tdR}>{Rs(periodPurchase)}</td>
                <td className={tdR + ' text-green-700'}>{Rs(periodPaid)}</td>
                <td className={tdR}><BalanceText value={closing} /></td>
              </tr>
            </tfoot>
          </table></PagedTable>
          <div className="no-print px-4 py-2 border-t border-gray-200">
            <button onClick={() => setParty('')} className="text-sm font-semibold text-blue-700 hover:underline">← Back to all parties</button>
          </div>
        </>
      )}
    </div>
  );
}
