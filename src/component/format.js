// One money format for the whole app: whole rupees with international grouping, e.g. 100,000
export const fmtNum = n => Math.round(parseFloat(n) || 0).toLocaleString('en-US');
