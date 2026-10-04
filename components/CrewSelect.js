'use client';

// One crew box (Driver, Foreman 1, Foreman 2 or Loader).
// Who is listed comes from LHG Journey, automatically:
//   - people linked to Journey: by the Wheels rules in Journey -> Settings
//     (today: Driver = Logistics dept, Foreman = Warehouse dept, Loader = position Officer, any dept)
//   - older entries added here in Wheels: by the role they were given here.
// Anyone already in another box on this log is left out, so one person can't fill two slots.
export function inBox(person, slot, rules) {
  if (!person.employee_id) return person.role === slot;
  return rules.some((r) => r.slot === slot && ((r.department && r.department === person.department) || (r.position && r.position === person.position)));
}

export default function CrewSelect({ value, onChange, people, rules = [], slot, taken = [], placeholder, className = 'input' }) {
  const list = people.filter((p) => inBox(p, slot, rules) && (p.name === value || !taken.filter(Boolean).includes(p.name)));
  const known = list.some((p) => p.name === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{placeholder}</option>
      {list.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
      {value && !known && <option value={value}>{value} (old entry)</option>}
    </select>
  );
}
