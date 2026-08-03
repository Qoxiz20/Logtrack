'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { ERROR_TYPES, DEPARTMENTS, computeRewardEarned } from '@/lib/reward';
import NavDrawer from '@/components/NavDrawer';

export default function LogDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Small "add new item" inputs for the editable sections
  const [newFromDelivery, setNewFromDelivery] = useState('');
  const [newMissionTask, setNewMissionTask] = useState('');
  const [newError, setNewError] = useState({ errorType: '', department: '', invoice: '', description: '' });
  // Amendment 6: add more DO after saving
  const [newToDelivery, setNewToDelivery] = useState({ invoice: '', customer: '', amount: '' });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    setIsAdmin(user?.user_metadata?.role === 'admin');

    const { data, error } = await supabase
      .from('dispatch_logs')
      .select(`
        *,
        to_delivery_items ( id, invoice_number, customer, amount, returned ),
        from_delivery_items ( id, description ),
        mission_items ( id, task, done ),
        status_errors ( id, invoice_number, error_type, department, description, resolved )
      `)
      .eq('id', id)
      .single();

    if (error) {
      setLoadError(error.message);
    } else {
      setLog(data);
    }
    setLoading(false);
  }

  // Re-checks whether the log still qualifies for the RM50 bonus, using the shared rule:
  // total > RM15,000, zero unresolved errors, and no Operation/Logistics error at all
  // (even resolved ones from those departments permanently disqualify the bonus).
  async function recheckReward() {
    const { data: freshLog } = await supabase
      .from('dispatch_logs')
      .select('to_delivery_total, status_errors ( department, resolved )')
      .eq('id', id)
      .single();
    const qualifies = computeRewardEarned(freshLog.to_delivery_total, freshLog.status_errors);
    await supabase.from('dispatch_logs').update({ reward_earned: qualifies }).eq('id', id);
  }

  // --- Amendment 1: tick which DO has arrived back ---
  async function toggleReturned(itemId, current) {
    await supabase.from('to_delivery_items').update({ returned: !current }).eq('id', itemId);
    load();
  }

  // --- Amendment 6: add a new DO after saving. No delete option — additions only. ---
  async function addToDelivery() {
    if (!newToDelivery.invoice || !newToDelivery.customer || !newToDelivery.amount) return;
    await supabase.from('to_delivery_items').insert({
      dispatch_log_id: id,
      invoice_number: `DO-${newToDelivery.invoice}`,
      customer: newToDelivery.customer,
      amount: parseFloat(newToDelivery.amount),
      returned: false,
    });

    // Recalculate the running total from every To Delivery row (existing + the new one),
    // then re-check whether this pushes the log over the RM15,000 bonus threshold.
    const { data: items } = await supabase.from('to_delivery_items').select('amount').eq('dispatch_log_id', id);
    const newTotal = items.reduce((sum, r) => sum + Number(r.amount), 0);
    await supabase.from('dispatch_logs').update({ to_delivery_total: newTotal, header_amount: newTotal }).eq('id', id);

    setNewToDelivery({ invoice: '', customer: '', amount: '' });
    await recheckReward();
    load();
  }

  // --- Amendment 2: log what was brought back from delivery ---
  async function addFromDelivery() {
    if (!newFromDelivery.trim()) return;
    await supabase.from('from_delivery_items').insert({ dispatch_log_id: id, description: newFromDelivery.trim() });
    setNewFromDelivery('');
    load();
  }
  async function deleteFromDelivery(itemId) {
    await supabase.from('from_delivery_items').delete().eq('id', itemId);
    load();
  }

  // --- Amendment 3: tick which mission is completed ---
  async function toggleMissionDone(itemId, current) {
    await supabase.from('mission_items').update({ done: !current }).eq('id', itemId);
    load();
  }
  async function addMission() {
    if (!newMissionTask.trim()) return;
    await supabase.from('mission_items').insert({ dispatch_log_id: id, task: newMissionTask.trim(), done: false });
    setNewMissionTask('');
    load();
  }

  // --- Amendment 4: fill in final error status after driver returns ---
  // Amendment 7: description is set once here and not editable afterwards (write-once)
  async function addError() {
    if (!newError.errorType || !newError.department) return;
    await supabase.from('status_errors').insert({
      dispatch_log_id: id,
      invoice_number: newError.invoice ? `DO-${newError.invoice}` : '',
      error_type: newError.errorType,
      department: newError.department,
      description: newError.description || null,
      resolved: false,
    });
    setNewError({ errorType: '', department: '', invoice: '', description: '' });
    await recheckReward();
    load();
  }
  async function toggleResolved(errorId, currentlyResolved) {
    await supabase.from('status_errors').update({ resolved: !currentlyResolved }).eq('id', errorId);
    await recheckReward();
    load();
  }

  // --- Admin-only delete ---
  async function deleteLog() {
    if (!confirm(`Delete this dispatch log for ${log.driver_name}? This cannot be undone.`)) return;
    setDeleting(true);
    const { error } = await supabase.from('dispatch_logs').delete().eq('id', id);
    if (error) {
      alert('Could not delete: ' + error.message);
      setDeleting(false);
    } else {
      router.push('/dashboard');
    }
  }

  if (loading) return <div className="min-h-screen bg-paper flex items-center justify-center text-depot-700">Loading…</div>;
  if (loadError) return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center text-center px-6 gap-2">
      <p className="text-flag font-medium">Could not load this log.</p>
      <p className="text-depot-700/70 text-sm max-w-md">{loadError}</p>
      <Link href="/dashboard" className="text-route text-sm mt-2">← Back to Dashboard</Link>
    </div>
  );
  if (!log) return <div className="min-h-screen bg-paper flex items-center justify-center text-depot-700">Log not found.</div>;

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="bg-depot-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NavDrawer />
          <h1 className="font-display text-xl text-paper font-bold">Dispatch Log</h1>
        </div>
        <Link href="/dashboard" className="text-depot-100/70 text-sm hover:text-paper">← Back to Dashboard</Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-depot-900">{log.driver_name}</h2>
              <p className="text-sm text-depot-700/70">{new Date(log.log_date).toLocaleDateString()}</p>
              {(log.foreman_1 || log.foreman_2) && (
                <p className="text-xs text-depot-700/60 mt-1">
                  Foreman: {[log.foreman_1, log.foreman_2].filter(Boolean).join(' · ')}
                </p>
              )}
              {log.loader_name && (
                <p className="text-xs text-depot-700/60 mt-0.5">Loader: {log.loader_name}</p>
              )}
            </div>
            {log.reward_earned && (
              <span className="bg-bonus-light text-bonus text-xs font-semibold px-2.5 py-1 rounded-full">RM50 Bonus</span>
            )}
          </div>
          <p className="text-sm text-depot-700 mt-3">Total Amount: <strong>RM {Number(log.header_amount).toLocaleString()}</strong></p>
        </section>

        {/* AMENDMENT 1 & 6: To Delivery — tick arrived back, add more DO (no delete) */}
        <DetailSection title="To Delivery — mark arrived back">
          {log.to_delivery_items.length === 0 && <Empty />}
          {log.to_delivery_items.map((item) => (
            <label key={item.id} className="flex items-center justify-between py-1.5 border-b border-depot-700/5 last:border-0 cursor-pointer">
              <span className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={item.returned} onChange={() => toggleReturned(item.id, item.returned)} />
                <span className={item.returned ? 'text-depot-700/50' : ''}>{item.invoice_number} — {item.customer}</span>
              </span>
              <span className="font-medium text-sm">RM {Number(item.amount).toLocaleString()}</span>
            </label>
          ))}
          <p className="text-xs text-depot-700/60 mt-4 mb-2">Add another DO:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <InvoiceInput value={newToDelivery.invoice} onChange={(v) => setNewToDelivery({ ...newToDelivery, invoice: v })} />
            <input value={newToDelivery.customer} onChange={(e) => setNewToDelivery({ ...newToDelivery, customer: e.target.value })}
              className="input" placeholder="Customer" />
            <input type="number" step="0.01" value={newToDelivery.amount} onChange={(e) => setNewToDelivery({ ...newToDelivery, amount: e.target.value })}
              className="input" placeholder="Amount (RM)" />
          </div>
          <button onClick={addToDelivery} className="mt-2 text-route border border-route/30 hover:bg-route-light text-sm font-medium px-3 py-1.5 rounded-lg">
            + Add DO
          </button>
        </DetailSection>

        {/* AMENDMENT 2: From Delivery — editable list */}
        <DetailSection title="From Delivery">
          {log.from_delivery_items.length === 0 && <Empty />}
          {log.from_delivery_items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm py-1.5 border-b border-depot-700/5 last:border-0">
              <span>{item.description}</span>
              <button onClick={() => deleteFromDelivery(item.id)} className="text-depot-700/40 hover:text-flag text-lg px-1">×</button>
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <input value={newFromDelivery} onChange={(e) => setNewFromDelivery(e.target.value)}
              className="input flex-1" placeholder="What was brought back?" />
            <button onClick={addFromDelivery} className="bg-route text-white text-sm font-medium px-3 rounded-lg">Add</button>
          </div>
        </DetailSection>

        {/* AMENDMENT 3: Mission — tick completed, add new */}
        <DetailSection title="Mission">
          {log.mission_items.length === 0 && <Empty />}
          {log.mission_items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-depot-700/5 last:border-0 cursor-pointer">
              <input type="checkbox" checked={item.done} onChange={() => toggleMissionDone(item.id, item.done)} />
              <span className={item.done ? 'line-through text-depot-700/50' : ''}>{item.task}</span>
            </label>
          ))}
          <div className="flex gap-2 mt-3">
            <input value={newMissionTask} onChange={(e) => setNewMissionTask(e.target.value)}
              className="input flex-1" placeholder="Add a mission item" />
            <button onClick={addMission} className="bg-route text-white text-sm font-medium px-3 rounded-lg">Add</button>
          </div>
        </DetailSection>

        {/* AMENDMENT 4 & 7: Status — resolve existing, add new with description */}
        <DetailSection title="Status">
          {log.status_errors.length === 0 && <p className="text-sm text-bonus mb-3">No errors flagged.</p>}
          {log.status_errors.map((err) => (
            <div key={err.id} className="flex items-center justify-between py-2 border-b border-depot-700/5 last:border-0">
              <div className="text-sm">
                <p className="font-medium text-depot-900">{err.invoice_number} — {err.error_type}</p>
                <p className="text-depot-700/60 text-xs">Department: {err.department}</p>
                {err.description && <p className="text-depot-700/50 text-xs mt-0.5 italic">{err.description}</p>}
              </div>
              <button
                onClick={() => toggleResolved(err.id, err.resolved)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${
                  err.resolved ? 'bg-bonus-light text-bonus' : 'bg-flag-light text-flag'
                }`}
              >
                {err.resolved ? 'Resolved' : 'Active — mark resolved'}
              </button>
            </div>
          ))}

          <p className="text-xs text-depot-700/60 mt-4 mb-2">Flag a new error (e.g. found when driver returned):</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select value={newError.errorType} onChange={(e) => setNewError({ ...newError, errorType: e.target.value })} className="input">
              <option value="">What error?</option>
              {ERROR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={newError.department} onChange={(e) => setNewError({ ...newError, department: e.target.value })} className="input">
              <option value="">Which department's fault?</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="flex items-center border border-depot-700/15 rounded-lg overflow-hidden bg-white">
              <span className="bg-depot-100 px-2.5 py-2 text-sm text-depot-700/70 font-semibold">DO-</span>
              <input
                value={newError.invoice}
                onChange={(e) => setNewError({ ...newError, invoice: e.target.value.replace(/[^0-9]/g, '') })}
                className="flex-1 px-2 py-2 text-sm focus:outline-none min-w-0"
                placeholder="06244"
                inputMode="numeric"
              />
            </div>
          </div>
          {/* Amendment 7: description box, written once when the error is flagged */}
          <textarea
            value={newError.description}
            onChange={(e) => setNewError({ ...newError, description: e.target.value })}
            className="input mt-2"
            rows={2}
            placeholder="Describe the special case (optional)"
          />
          <button onClick={addError} className="mt-2 text-flag border border-flag/30 hover:bg-flag-light text-sm font-medium px-3 py-1.5 rounded-lg">
            + Flag this error
          </button>
          <p className="text-xs text-depot-700/50 mt-3">
            Sales/Customer errors still allow the RM50 bonus once resolved. Operation/Logistics errors permanently remove the bonus for this log.
          </p>
        </DetailSection>

        {/* Admin-only delete */}
        {isAdmin && (
          <button
            onClick={deleteLog}
            disabled={deleting}
            className="w-full text-flag border border-flag/30 hover:bg-flag-light font-medium py-2.5 rounded-lg disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete this dispatch log'}
          </button>
        )}

      </main>

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

// Amendment 6: same "DO-" prefixed invoice input pattern as the New Dispatch Log form
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

function DetailSection({ title, children }) {
  return (
    <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
      <h3 className="font-display font-semibold text-depot-900 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-depot-700/40">Nothing recorded.</p>;
}
