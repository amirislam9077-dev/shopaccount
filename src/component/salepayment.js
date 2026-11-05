import React, { useState } from 'react';
import { money, saleBillHtml } from './salebill';

// Save & Print asks how the customer is paying first: Cash or Credit Card, and for
// cash how much was given and how much goes back. The bill preview follows along.

// The exact bill, then the next round amounts a customer usually hands over
function quickAmounts(payable) {
  return [...new Set([payable, ...[500, 1000, 5000].map(step => Math.ceil(payable / step) * step)])];
}

export default function SalePaymentDialog({ bill, onCancel, onConfirm }) {
  // The bill shows whole rupees, so the whole-rupee total is what the customer pays
  const payable = Math.round(parseFloat(bill.total) || 0);
  const [method, setMethod] = useState('Cash');
  const [received, setReceived] = useState(String(payable));
  const [saving, setSaving] = useState(false);

  const isCash = method === 'Cash';
  const receivedRs = isCash ? parseFloat(received) || 0 : payable;
  const change = receivedRs - payable;
  const short = change < 0;
  const payment = { method, received: receivedRs, change };

  async function submit(event) {
    event.preventDefault();
    if (short || saving) return;
    setSaving(true);
    await onConfirm(payment);
    setSaving(false);
  }

  const methodBtn = (value, label) => (
    <button type="button" onClick={() => setMethod(value)} aria-pressed={method === value}
      className={`flex-1 py-2 text-sm font-bold rounded-md border transition-colors ${method === value ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-full overflow-auto grid grid-cols-1 md:grid-cols-2">
        <div className="p-5 space-y-4">
          <h3 className="text-lg font-extrabold text-gray-900">Payment</h3>

          <div className="flex justify-between items-center px-3 py-2 bg-slate-800 rounded-lg text-white">
            <span className="text-sm font-bold">Bill Total</span>
            <span className="text-xl font-extrabold">{money(payable)}</span>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">Paying by</p>
            <div className="flex gap-2">
              {methodBtn('Cash', 'Cash')}
              {methodBtn('Credit Card', 'Credit Card')}
            </div>
          </div>

          {isCash && (
            <>
              <div>
                <label htmlFor="sale-cash-received" className="block text-xs font-semibold text-gray-700 mb-1">Customer gave (Rs)</label>
                <input id="sale-cash-received" type="number" min="0" step="1" autoFocus value={received}
                  onChange={e => setReceived(e.target.value)} onFocus={e => e.target.select()}
                  className="w-full px-3 py-2 text-lg font-bold border border-gray-300 rounded-md" />
                <div className="flex flex-wrap gap-2 mt-2">
                  {quickAmounts(payable).map(amount => (
                    <button type="button" key={amount} onClick={() => setReceived(String(amount))}
                      className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors ${receivedRs === amount ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                      {money(amount)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`flex justify-between items-center px-3 py-2 rounded-lg ${short ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
                <span className="text-sm font-bold">{short ? 'Still to pay' : 'Give back'}</span>
                <span className="text-xl font-extrabold">{money(Math.abs(change))}</span>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onCancel} disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={short || saving}
              className="form-save flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-md shadow hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm & Print'}
            </button>
          </div>
        </div>

        <div className="p-5 bg-gray-100 flex flex-col items-center">
          <p className="text-xs font-semibold text-gray-600 mb-2">Bill preview (80mm receipt)</p>
          <iframe title="Bill preview" srcDoc={saleBillHtml({ ...bill, payment })}
            className="bg-white shadow border-0" style={{ width: '304px', height: '460px' }} />
        </div>
      </form>
    </div>
  );
}
