// One money format for the whole app: whole rupees with international grouping, e.g. 100,000
export const fmtNum = n => Math.round(parseFloat(n) || 0).toLocaleString('en-US');

// Design names must be unique: "Dori Gala", "dori gala" and "Dori  Gala " count as the same design
export const designKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const findDuplicateDesign = (name, existing) => (existing || []).find(d => designKey(d) === designKey(name));

// Party and design names are saved with each word capitalised: "dori gala" -> "Dori Gala".
// Only the first letter of a word changes, so codes like "AMN" stay as typed.
export const titleCase = name => String(name || '').trim().replace(/\s+/g, ' ')
  .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
