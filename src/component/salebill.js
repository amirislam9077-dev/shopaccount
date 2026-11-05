// Customer's bill for a sale and the voucher for a party payment, made for an 80mm shop
// receipt printer. They print from their own hidden frame, so the app's report print
// rules (A4 landscape, hidden .no-print areas) don't touch them. The page is cut to the
// receipt's height, so no paper is wasted.

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const money = (value, decimals = 0) => {
  const rupees = parseFloat(value) || 0;
  return `Rs ${rupees.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(rupees) ? 0 : decimals, maximumFractionDigits: decimals })}`;
};

const row = (label, value) => (value ? `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>` : '');

const receiptPage = (title, body) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: 80mm 200mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; }
  body { width: 80mm; padding: 4mm; font-family: Arial, sans-serif; font-size: 12px; font-weight: 600; color: #000; }
  h1 { margin: 0; text-align: center; font-size: 18px; letter-spacing: 1px; }
  h2 { margin: 2px 0 8px; text-align: center; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 2px 0; vertical-align: top; }
  th { text-align: left; font-weight: 600; white-space: nowrap; padding-right: 8px; }
  td { text-align: right; overflow-wrap: anywhere; }
  .part { padding: 6px 0; border-top: 1px dashed #000; }
  .total th, .total td { padding-top: 4px; font-size: 16px; font-weight: 800; }
  .words { margin: 4px 0 0; font-size: 10px; }
  .thanks { margin: 0; padding-top: 6px; border-top: 1px dashed #000; text-align: center; }
</style>
<script>
  window.addEventListener('load', function () {
    var style = document.createElement('style');
    style.textContent = '@page { size: 80mm ' + Math.ceil(document.body.offsetHeight + 2) + 'px; margin: 0; }';
    document.head.appendChild(style);
  });
</script>
</head>
<body>
  <h1>Khurram Studio</h1>
  ${body}
</body>
</html>`;

export function saleBillHtml({ saleId, date, customer, phone, address, designName, designCode, pieces, rate, discount, total, amountWords, payment }) {
  const gross = (parseFloat(pieces) || 0) * (parseFloat(rate) || 0);
  const discountRs = gross * (parseFloat(discount) || 0) / 100;
  return receiptPage(`Bill ${saleId}`, `
  <h2>Sale Bill</h2>
  <div class="part"><table>
    ${row('Bill No', saleId)}
    ${row('Date', date)}
    ${row('Customer', customer)}
    ${row('Phone', phone)}
    ${row('Address', address)}
  </table></div>
  <div class="part"><table>
    ${row('Design', designName)}
    ${row('Code', designCode)}
    ${row('Pieces', pieces)}
    ${row('Rate', money(rate))}
  </table></div>
  <div class="part"><table>
    ${row('Amount', money(gross))}
    ${row(`Discount ${parseFloat(discount) || 0}%`, `- ${money(discountRs)}`)}
    <tr class="total"><th>Total</th><td>${esc(money(total))}</td></tr>
  </table>
  <p class="words">${esc(amountWords)}</p></div>
  ${payment ? `<div class="part"><table>
    ${row('Payment', payment.method)}
    ${payment.method === 'Cash' ? row('Received', money(payment.received)) : ''}
    ${payment.method === 'Cash' ? row('Change', money(payment.change)) : ''}
  </table></div>` : ''}
  <p class="thanks">Thank you for shopping with us</p>`);
}

export function paymentVoucherHtml({ paymentId, date, partyName, payMode, bank, chequeNo, amount, amountWords, remarks }) {
  return receiptPage(`Voucher ${paymentId}`, `
  <h2>Payment Voucher</h2>
  <div class="part"><table>
    ${row('Voucher No', paymentId)}
    ${row('Date', date)}
    ${row('Paid to', partyName)}
    ${row('Paid by', payMode)}
    ${payMode === 'Cheque' ? row('Bank', bank) : ''}
    ${payMode === 'Cheque' ? row('Cheque No', chequeNo) : ''}
    ${row('Remarks', remarks)}
  </table></div>
  <div class="part"><table>
    <tr class="total"><th>Amount</th><td>${esc(money(amount, 2))}</td></tr>
  </table>
  <p class="words">${esc(amountWords)}</p></div>`);
}

export function printReceipt(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-9999px;width:80mm;height:10px;border:0';
  frame.onload = () => {
    const page = frame.contentWindow;
    page.onafterprint = () => frame.remove();
    page.focus();
    page.print();
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
