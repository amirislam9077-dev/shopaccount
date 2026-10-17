import React from 'react';

export const PK_PREFIX = '+92';

// Digits typed after the +92 prefix (max 10). Accepts pasted full numbers
// like 03001234567 / 923001234567 / +923001234567 and strips their prefix.
function normalizeRest(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length > 10) {
    if (d.startsWith('92')) d = d.slice(2);
    else if (d.startsWith('0')) d = d.slice(1);
  }
  return d.slice(0, 10);
}

function phoneRest(value) {
  const v = String(value || '');
  return v.startsWith(PK_PREFIX) ? normalizeRest(v.slice(PK_PREFIX.length)) : normalizeRest(v);
}

export function toPkPhone(rest) {
  const d = normalizeRest(rest);
  return d ? PK_PREFIX + d : '';
}

// Update phone; WhatsApp follows it unless the user has typed a different WhatsApp number.
export function withContact(prev, contact) {
  const follow = !prev.whatsapp || prev.whatsapp === prev.contact;
  return { ...prev, contact, whatsapp: follow ? contact : prev.whatsapp };
}

// Party contact info where each field comes from the newest record that has it:
// parties added this session first, then purchase records (newest first).
export function lookupPartyInfo(name, parties, purchases) {
  const sources = [
    ...(parties || []).filter(p => p.name === name).reverse(),
    ...(purchases || []).filter(p => p.partyName === name).sort((a, b) => b.id - a.id),
  ];
  const info = {};
  for (const field of ['contact', 'whatsapp', 'facebook', 'instagram', 'address']) {
    info[field] = (sources.find(s => s[field]) || {})[field] || '';
  }
  return info;
}

export default function PhoneInput({ value, onChange, className = '', ...inputProps }) {
  return (
    <div className="flex">
      <span className="inline-flex items-center px-2 border border-r-0 border-slate-500 rounded-l bg-slate-200 text-slate-700 font-semibold text-xs select-none">
        {PK_PREFIX}
      </span>
      <input type="tel" inputMode="numeric" className={`${className} rounded-l-none`}
        value={phoneRest(value)} placeholder="3001234567"
        onChange={e => onChange(toPkPhone(e.target.value))} {...inputProps} />
    </div>
  );
}
