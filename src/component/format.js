import { useEffect, useState } from 'react';

// One money format for the whole app: whole rupees with international grouping, e.g. 100,000
export const fmtNum = n => Math.round(parseFloat(n) || 0).toLocaleString('en-US');

// Design names must be unique: "Dori Gala", "dori gala" and "Dori  Gala " count as the same design
export const designKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const findDuplicateDesign = (name, existing) => (existing || []).find(d => designKey(d) === designKey(name));

// Party and design names are saved with each word capitalised: "dori gala" -> "Dori Gala".
// Only the first letter of a word changes, so codes like "AMN" stay as typed.
export const titleCase = name => String(name || '').trim().replace(/\s+/g, ' ')
  .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Entry time: saved as the shop's own clock ("23:16:05"), shown as "11:16 PM".
// Entries saved before times were kept have none, so they show the date alone.
export const nowTime = () => {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
};
export const timeToDisplay = time => {
  if (!time) return '';
  const [h, m] = String(time).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const withTime = (dateText, time) => (time ? `${dateText} ${timeToDisplay(time)}` : dateText);
// Time beside the date on a data entry form: a new entry shows the clock and is stamped when saved
export function useClock() {
  const [clock, setClock] = useState(nowTime);
  useEffect(() => {
    const timer = setInterval(() => setClock(nowTime()), 15000);
    return () => clearInterval(timer);
  }, []);
  return clock;
}

// Stock is kept per supplier + design. A sale's party is the customer, so its supplier comes from
// what it sold: the purchase with its barcode, then its design code, then the design's only supplier.
// purchases: [{ party, design, designCode, barcode }]. Returns sale => supplier name, or '' when unknown.
export function supplierFinder(purchases) {
  const add = (map, key, party) => {
    if (!key || !party) return;
    if (!map.has(key)) map.set(key, new Map());
    map.get(key).set(designKey(party), party);
  };
  const byBarcode = new Map(), byCode = new Map(), byDesign = new Map();
  purchases.forEach(p => {
    add(byBarcode, designKey(p.barcode), p.party);
    add(byCode, designKey(p.designCode), p.party);
    add(byDesign, designKey(p.design), p.party);
  });
  const only = (map, key) => {
    const parties = map.get(key);
    return parties && parties.size === 1 ? [...parties.values()][0] : '';
  };
  return sale => only(byBarcode, designKey(sale.barcode)) || only(byCode, designKey(sale.designCode)) || only(byDesign, designKey(sale.design));
}
