'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { REWARD_THRESHOLD, REWARD_AMOUNT, ERROR_TYPES, DEPARTMENTS, computeRewardEarned } from '@/lib/reward';
import NavDrawer from '@/components/NavDrawer';

export default function NewLogPage() {
  const router = useRouter();

  // --- Part 1: Header ---
  const [driverName, setDriverName] = useState('');
  const [foreman1, setForeman1] = useState('');
  const [foreman2, setForeman2] = useState('');
  const [loaderName, setLoaderName] = useState(''); // Amendment 5: free text, optional
  const [plateNumber, setPlateNumber] = useState(''); // Amendment 3: free text, optional
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  // Amendment 1: no manual amount field anymore — it's calculated below from To Delivery rows

  // Amendment 2 (people-list dropdowns): fetch the active drivers & foremen once on page load
  const [driversList, setDriversList] = useState([]);
  const [foremenList, setForemenList] = useState([]);

  useEffect(() => {
    async function loadPeople() {
      const { data } = await supabase.from('people').select('id, name, role').eq('active', true).order('name');
      if (data) {
        setDriversList(data.filter((p) => p.role === 'driver'));
        setForemenList(data.filter((p) => p.role === 'foreman'));
      }
    }
    loadPeople();
  }, []);

  // --- Part 2: To Delivery ---
  // Amendment 3: "invoice" here stores ONLY the digits the user types; "DO-" is added automatically
  const [toDelivery, setToDelivery] = useState([{ invoice: '', customer: '', amount: '' }]);

  // --- Part 3: From Delivery ---
  // Amendment 6: each row is either "cash" (customer, DO#, amount) or "stock" (customer, DO#, description)
  const [fromDelivery, setFromDelivery] = useState([]);

  // --- Part 4: Mission ---
  const [missions, setMissions] = useState([{ task: '', done: false }]);

  // --- Part 5: Status (error flags) ---
  const [errors, setErrors] = useState([]); // starts empty — only add if there IS an error

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // --- Helpers to add/remove rows ---
  const addRow = (setter) => (blank) => setter((rows) => [...rows, blank]);
  const removeRow = (setter) => (index) => setter((rows) => rows.filter((_, i) => i !== index));
  const updateRow = (setter) => (index, field, value) =>
    setter((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  // Amendment 1: the top total is now fully automatic — it's just the sum of To Delivery rows
  const toDeliveryTotal = toDelivery.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
  // Errors added here are always freshly flagged (not yet resolved), so pass resolved: false for each
  const rewardEarned = computeRewardEarned(toDeliveryTotal, errors.map((e) => ({ department: e.department, resolved: false })));

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');

    if (!driverName || !logDate) {
      setSubmitError('Please fill in Driver and Date at the top.');
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data: log, error: logErr } = await supabase
        .from('dispatch_logs')
        .insert({
          driver_name: driverName,
          foreman_1: foreman1,
          foreman_2: foreman2,
          loader_name: loaderName, // Amendment 5
          plate_number: plateNumber, // Amendment 3
          header_amount: toDeliveryTotal, // now auto-calculated, same as the To Delivery total
          log_date: logDate,
          logged_by: session?.user?.id,
          to_delivery_total: toDeliveryTotal,
          reward_earned: rewardEarned,
        })
        .select()
        .single();

      if (logErr) throw logErr;

      const logId = log.id;

      const validToDelivery = toDelivery.filter((r) => r.invoice && r.customer && r.amount);
      if (validToDelivery.length) {
        await supabase.from('to_delivery_items').insert(
          validToDelivery.map((r) => ({
            dispatch_log_id: logId,
            invoice_number: `DO-${r.invoice}`, // amendment 3
            customer: r.customer,
            amount: parseFloat(r.amount),
          }))
        );
      }

      const validFromDelivery = fromDelivery.filter((r) =>
        r.type === 'cash' ? (r.customer && r.doNumber && r.cashAmount) : (r.customer && r.doNumber && r.description)
      );
      if (validFromDelivery.length) {
        await supabase.from('from_delivery_items').insert(
          validFromDelivery.map((r) => ({
            dispatch_log_id: logId,
            type: r.type,
            customer: r.customer,
            do_number: r.doNumber ? `DO-${r.doNumber}` : null,
            cash_amount: r.type === 'cash' ? parseFloat(r.cashAmount) : null,
            description: r.type === 'stock' ? r.description : null,
            collected: false,
          }))
        );
      }

      const validMissions = missions.filter((r) => r.task);
      if (validMissions.length) {
        await supabase.from('mission_items').insert(
          validMissions.map((r) => ({ dispatch_log_id: logId, task: r.task, done: r.done }))
        );
      }

      if (errors.length) {
        await supabase.from('status_errors').insert(
          errors.map((r) => ({
            dispatch_log_id: logId,
            invoice_number: r.invoice ? `DO-${r.invoice}` : '',
            error_type: r.errorType,
            department: r.department,
            description: r.description || null, // Amendment 7
            resolved: false,
          }))
        );
      }

      router.push('/dashboard');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper pb-24">
      <header className="bg-depot-900 px-6 py-4 flex items-center gap-3">
        <NavDrawer />
        <h1 className="font-display text-xl text-paper font-bold">New Dispatch Log</h1>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* PART 1: HEADER */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <h2 className="font-display font-semibold text-depot-900 mb-4">Dispatch Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Driver">
              <select value={driverName} onChange={(e) => setDriverName(e.target.value)} className="input">
                <option value="">Select driver</option>
                {driversList.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Foreman 1">
              <select value={foreman1} onChange={(e) => setForeman1(e.target.value)} className="input">
                <option value="">Select foreman 1</option>
                {foremenList.filter((f) => f.name !== foreman2).map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Foreman 2">
              <select value={foreman2} onChange={(e) => setForeman2(e.target.value)} className="input">
                <option value="">Select foreman 2</option>
                {foremenList.filter((f) => f.name !== foreman1).map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Loader (optional)">
              <input value={loaderName} onChange={(e) => setLoaderName(e.target.value)}
                className="input" placeholder="Loader name" />
            </Field>
            <Field label="Plate Number (optional)">
              <input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)}
                className="input" placeholder="e.g. ABC1234" />
            </Field>
            <Field label="Total Amount (RM) — auto">
              <div className="input bg-depot-100 text-depot-700 font-semibold">
                {toDeliveryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </Field>
            <Field label="Date">
              <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)}
                className="input" />
            </Field>
          </div>
        </section>

        {/* PART 2: TO DELIVERY */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-depot-900">To Delivery</h2>
            <span className="text-sm text-depot-700/70">Total: RM {toDeliveryTotal.toLocaleString()}</span>
          </div>
          {toDelivery.map((row, i) => (
            <RowGroup key={i} onRemove={toDelivery.length > 1 ? () => removeRow(setToDelivery)(i) : null}>
              <InvoiceInput value={row.invoice} onChange={(v) => updateRow(setToDelivery)(i, 'invoice', v)} />
              <input value={row.customer} onChange={(e) => updateRow(setToDelivery)(i, 'customer', e.target.value)}
                className="input" placeholder="Customer" />
              <input type="number" step="0.01" value={row.amount} onChange={(e) => updateRow(setToDelivery)(i, 'amount', e.target.value)}
                className="input" placeholder="Amount (RM)" />
            </RowGroup>
          ))}
          <AddButton onClick={() => addRow(setToDelivery)({ invoice: '', customer: '', amount: '' })} label="Add invoice row" />
        </section>

        {/* PART 3: FROM DELIVERY */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <h2 className="font-display font-semibold text-depot-900 mb-4">From Delivery</h2>
          <p className="text-xs text-depot-700/60 mb-3">What was brought back from deliveries — cash collected, or stock returned.</p>
          {fromDelivery.map((row, i) => (
            <div key={i} className="mb-3 pb-3 border-b border-depot-700/5 last:border-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => updateRow(setFromDelivery)(i, 'type', 'cash')}
                    className={`text-sm font-medium py-2 rounded-lg border ${row.type === 'cash' ? 'bg-bonus text-white border-bonus' : 'text-depot-700 border-depot-700/15'}`}>
                    Cash
                  </button>
                  <button type="button" onClick={() => updateRow(setFromDelivery)(i, 'type', 'stock')}
                    className={`text-sm font-medium py-2 rounded-lg border ${row.type === 'stock' ? 'bg-route text-white border-route' : 'text-depot-700 border-depot-700/15'}`}>
                    Stock
                  </button>
                </div>
                <button type="button" onClick={() => removeRow(setFromDelivery)(i)} className="text-depot-700/40 hover:text-flag text-lg px-1">×</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={row.customer || ''} onChange={(e) => updateRow(setFromDelivery)(i, 'customer', e.target.value)}
                  className="input" placeholder="Customer" />
                <InvoiceInput value={row.doNumber || ''} onChange={(v) => updateRow(setFromDelivery)(i, 'doNumber', v)} />
                {row.type === 'cash' ? (
                  <input type="number" step="0.01" value={row.cashAmount || ''} onChange={(e) => updateRow(setFromDelivery)(i, 'cashAmount', e.target.value)}
                    className="input" placeholder="Cash amount (RM)" />
                ) : (
                  <input value={row.description || ''} onChange={(e) => updateRow(setFromDelivery)(i, 'description', e.target.value)}
                    className="input" placeholder="Describe the stock" />
                )}
              </div>
            </div>
          ))}
          <AddButton onClick={() => addRow(setFromDelivery)({ type: 'stock', customer: '', doNumber: '', description: '', cashAmount: '' })} label="Add item" />
        </section>

        {/* PART 4: MISSION */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <h2 className="font-display font-semibold text-depot-900 mb-4">Mission</h2>
          <p className="text-xs text-depot-700/60 mb-3">Things that need to be done.</p>
          {missions.map((row, i) => (
            <RowGroup key={i} onRemove={missions.length > 1 ? () => removeRow(setMissions)(i) : null}>
              <input value={row.task} onChange={(e) => updateRow(setMissions)(i, 'task', e.target.value)}
                className="input flex-1" placeholder="Task description" />
              <label className="flex items-center gap-1.5 text-sm text-depot-700 whitespace-nowrap">
                <input type="checkbox" checked={row.done} onChange={(e) => updateRow(setMissions)(i, 'done', e.target.checked)} />
                Done
              </label>
            </RowGroup>
          ))}
          <AddButton onClick={() => addRow(setMissions)({ task: '', done: false })} label="Add task" />
        </section>

        {/* PART 5: STATUS (error flags) */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <h2 className="font-display font-semibold text-depot-900 mb-1">Status</h2>
          <p className="text-xs text-depot-700/60 mb-3">
            Flag any error found in the To Delivery section. It stays active until marked resolved.
          </p>
          {errors.map((row, i) => (
            <div key={i} className="mb-3 pb-3 border-b border-depot-700/5 last:border-0">
              <RowGroup onRemove={() => removeRow(setErrors)(i)}>
                <select value={row.errorType} onChange={(e) => updateRow(setErrors)(i, 'errorType', e.target.value)} className="input">
                  <option value="">What error?</option>
                  {ERROR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={row.department} onChange={(e) => updateRow(setErrors)(i, 'department', e.target.value)} className="input">
                  <option value="">Which department's fault?</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <InvoiceInput value={row.invoice} onChange={(v) => updateRow(setErrors)(i, 'invoice', v)} />
              </RowGroup>
              {/* Amendment 7: description box for special cases */}
              <textarea
                value={row.description || ''}
                onChange={(e) => updateRow(setErrors)(i, 'description', e.target.value)}
                className="input mt-2"
                rows={2}
                placeholder="Describe the special case (optional)"
              />
            </div>
          ))}
          <AddButton
            onClick={() => addRow(setErrors)({ errorType: '', department: '', invoice: '', description: '' })}
            label="Flag an error"
            variant="flag"
          />
        </section>

        {/* REWARD PREVIEW */}
        <section className={`rounded-xl p-4 border ${rewardEarned ? 'bg-bonus-light border-bonus/30' : 'bg-depot-100 border-depot-700/10'}`}>
          <p className={`text-sm font-medium ${rewardEarned ? 'text-bonus' : 'text-depot-700/70'}`}>
            {rewardEarned
              ? `This log qualifies for the RM${REWARD_AMOUNT} bonus (To Delivery total exceeds RM${REWARD_THRESHOLD.toLocaleString()}, no active errors).`
              : `Not yet eligible for the RM${REWARD_AMOUNT} bonus. Needs To Delivery total over RM${REWARD_THRESHOLD.toLocaleString()} and zero flagged errors.`}
          </p>
          <p className="text-xs text-depot-700/50 mt-1">
            Note: once resolved, Sales/Customer errors still allow the bonus — but Operation/Logistics errors permanently disqualify this log.
          </p>
        </section>

        {submitError && <p className="text-flag text-sm">{submitError}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-route text-white font-medium py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Dispatch Log'}
        </button>
      </form>

      <style jsx global>{`
        .input {
          padding: 0.55rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid rgba(43, 58, 74, 0.15);
          font-size: 0.9rem;
          width: 100%;
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 2px #3E7CB1;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-depot-700/70 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Amendment 3: "DO-" prefix is fixed and shown; user only types the digits after it
function InvoiceInput({ value, onChange }) {
  return (
    <div className="flex items-center border border-depot-700/15 rounded-lg overflow-hidden bg-white">
      <span className="bg-depot-100 px-2.5 py-2 text-sm text-depot-700/70 font-semibold">DO-</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        className="flex-1 px-2 py-2 text-sm focus:outline-none min-w-0"
        placeholder="06244"
        inputMode="numeric"
      />
    </div>
  );
}

function RowGroup({ children, onRemove }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">{children}</div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-depot-700/40 hover:text-flag text-lg px-1">
          ×
        </button>
      )}
    </div>
  );
}

function AddButton({ onClick, label, variant = 'default' }) {
  const styles = variant === 'flag'
    ? 'text-flag border-flag/30 hover:bg-flag-light'
    : 'text-route border-route/30 hover:bg-route-light';
  return (
    <button type="button" onClick={onClick} className={`text-sm font-medium border rounded-lg px-3 py-1.5 mt-1 ${styles}`}>
      + {label}
    </button>
  );
}
