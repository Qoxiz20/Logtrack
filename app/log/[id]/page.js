'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { ERROR_TYPES, DEPARTMENTS, computeRewardEarned } from '@/lib/reward';
import NavDrawer from '@/components/NavDrawer';
import { isAdminUser, hasPower } from '@/lib/access';
import CrewSelect from '@/components/CrewSelect';

export default function LogDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [canFix, setCanFix] = useState(false);   // power: delete or reopen logs
  const [canCash, setCanCash] = useState(false); // power: confirm cash/cheque collected
  const [deleting, setDeleting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);

  // Amendment 1: header edit (driver/foreman/loader/plate/date), only while not completed
  const [driversList, setDriversList] = useState([]);
  const [allPeople, setAllPeople] = useState([]);
  const [crewRules, setCrewRules] = useState([]); // Wheels rules from LHG Journey (who goes in which box) // for the loader dropdown (regular loaders first, then everyone else)
  const [headerError, setHeaderError] = useState('');
  const [foremenList, setForemenList] = useState([]);
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState(null);

  // Small "add new item" inputs for the editable sections
  // Latest amendment: From Delivery is now Money (Cash or Cheque) or Stocks.
  const [newFromDelivery, setNewFromDelivery] = useState({ type: 'stock', customer: '', doNumber: '', chequeNumber: '', description: '', cashAmount: '' });
  const [newMissionTask, setNewMissionTask] = useState('');
  const [newError, setNewError] = useState({ errorType: '', department: '', invoice: '', description: '' });
  const [newToDelivery, setNewToDelivery] = useState({ invoice: '', customer: '', amount: '' });
  const [newUndelivered, setNewUndelivered] = useState({ invoice: '', customer: '', amount: '' });

  useEffect(() => {
    load();
    loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadPeople() {
    const { data } = await supabase.from('people').select('id, name, role, department, position, employee_id').eq('active', true).order('name');
    if (data) {
      setDriversList(data.filter((p) => p.role === 'driver'));
      setForemenList(data.filter((p) => p.role === 'foreman'));
      setAllPeople(data);
      const { data: rules } = await supabase.from('app_name_rules').select('slot, department, position').eq('app_key', 'wheels');
      setCrewRules(rules || []);
    }
  }

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    setIsAdmin(isAdminUser(user));
    setCanFix(hasPower(user, 'wheels_delete'));
    setCanCash(hasPower(user, 'wheels_cash'));

    const { data, error } = await supabase
      .from('dispatch_logs')
      .select(`
        *,
        to_delivery_items ( id, invoice_number, customer, amount, returned, resolves_undelivered_id, resolves_error_id ),
        from_delivery_items ( id, type, customer, do_number, cheque_number, cash_amount, description, collected ),
        mission_items ( id, task, done ),
        status_errors ( id, invoice_number, error_type, department, description, resolved ),
        undelivered_items ( id, invoice_number, customer, amount, resolved )
      `)
      .eq('id', id)
      .single();

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    setLog(data);
    setLoading(false);
  }

  async function recheckReward() {
    const { data: freshLog } = await supabase
      .from('dispatch_logs')
      .select('to_delivery_total, status_errors ( department, resolved )')
      .eq('id', id)
      .single();
    const qualifies = computeRewardEarned(freshLog.to_delivery_total, freshLog.status_errors);
    await supabase.from('dispatch_logs').update({ reward_earned: qualifies }).eq('id', id);
  }

  // --- Amendment 1: edit header fields, only available while not completed ---
  function startEditHeader() {
    setHeaderForm({
      driver_name: log.driver_name || '',
      foreman_1: log.foreman_1 || '',
      foreman_2: log.foreman_2 || '',
      loader_name: log.loader_name || '',
      plate_number: log.plate_number || '',
      log_date: log.log_date,
    });
    setEditingHeader(true);
  }
  async function saveHeader() {
    setHeaderError('');
    // Anti-abuse: one person can't fill two slots in the same log (the database checks this too).
    const filled = [headerForm.driver_name, headerForm.foreman_1, headerForm.foreman_2, headerForm.loader_name].filter(Boolean);
    if (new Set(filled).size !== filled.length) {
      setHeaderError('The same person can’t be in two places on one log (driver, foreman or loader).');
      return;
    }
    const { error } = await supabase.from('dispatch_logs').update(headerForm).eq('id', id);
    if (error) { setHeaderError('Couldn’t save: ' + error.message); return; }
    setEditingHeader(false);
    load();
  }

  // --- COMPLETE: no more manual button. A log flips to COMPLETE on its own, the moment
  // every Mission item is ticked, every Cash/Cheque entry is Collected, and there's no
  // unresolved Status error or undelivered DO left (checked by a database trigger after
  // each of those actions — this page just reloads afterwards to show the new state).
  // Reopening is the one thing that still needs a person to do it on purpose, and only
  // someone with the "reopen/delete" power (admin always has it) can do it.
  async function reopenLog() {
    if (!canFix) return;
    if (!confirm('Reopen this log for editing? It will go back to "In Progress" until everything is done again.')) return;
    setReopening(true);
    const { error } = await supabase.rpc('wheels_reopen_log', { log_id: id });
    setReopening(false);
    if (error) { alert(error.message); return; }
    load();
  }

  // Fallback for the one case nothing else triggers: a day with no Mission ticks, no
  // Cash/Cheque to collect, no errors — just To Delivery, all ticked back. The database
  // still has the final say (it blocks this the same way it blocks the automatic checks
  // if anything is actually outstanding), so this button can't skip anything either.
  async function markComplete() {
    setMarkingComplete(true);
    const { error } = await supabase.from('dispatch_logs').update({ completed: true }).eq('id', id);
    setMarkingComplete(false);
    if (error) { alert(error.message); return; }
    load();
  }

  // --- Amendment: Undelivered DO — same fields as To Delivery, add-only.
  // No manual resolve here anymore: it can ONLY be resolved by re-delivering it
  // as an "Unresolved DO" on a new tracker's To Delivery section.
  async function addUndelivered() {
    if (!newUndelivered.invoice || !newUndelivered.customer || !newUndelivered.amount) return;
    await supabase.from('undelivered_items').insert({
      dispatch_log_id: id,
      invoice_number: `DO-${newUndelivered.invoice}`,
      customer: newUndelivered.customer,
      amount: parseFloat(newUndelivered.amount),
      resolved: false,
    });
    setNewUndelivered({ invoice: '', customer: '', amount: '' });
    load();
  }

  async function toggleReturned(itemId, current) {
    await supabase.from('to_delivery_items').update({ returned: !current }).eq('id', itemId);
    load();
  }

  async function addToDelivery() {
    if (!newToDelivery.invoice || !newToDelivery.customer || !newToDelivery.amount) return;
    await supabase.from('to_delivery_items').insert({
      dispatch_log_id: id,
      invoice_number: `DO-${newToDelivery.invoice}`,
      customer: newToDelivery.customer,
      amount: parseFloat(newToDelivery.amount),
      returned: false,
    });
    const { data: items } = await supabase.from('to_delivery_items').select('amount').eq('dispatch_log_id', id);
    const newTotal = items.reduce((sum, r) => sum + Number(r.amount), 0);
    await supabase.from('dispatch_logs').update({ to_delivery_total: newTotal, header_amount: newTotal }).eq('id', id);
    setNewToDelivery({ invoice: '', customer: '', amount: '' });
    await recheckReward();
    load();
  }

  // --- Latest amendment: From Delivery is Money (Cash or Cheque) or Stocks, add only, no delete.
  // Cash's DO is picked from this tracker's own To Delivery list, but can be left blank —
  // customers sometimes pay cash for a PREVIOUS day's DO, not necessarily today's.
  // Cheque gets its own Cheque Number instead (free text — one cheque can cover several DOs).
  async function addFromDelivery() {
    const r = newFromDelivery;
    if (r.type === 'cash' && !(r.customer && r.cashAmount)) return;
    if (r.type === 'cheque' && !(r.customer && r.chequeNumber && r.cashAmount)) return;
    if (r.type === 'stock' && !(r.customer && r.doNumber && r.description)) return;
    await supabase.from('from_delivery_items').insert({
      dispatch_log_id: id,
      type: r.type,
      customer: r.customer,
      do_number: r.type === 'stock' ? `DO-${r.doNumber}` : (r.type === 'cash' && r.doNumber ? `DO-${r.doNumber}` : null),
      cheque_number: r.type === 'cheque' ? r.chequeNumber : null,
      cash_amount: r.type === 'cash' || r.type === 'cheque' ? r.cashAmount : null,
      description: r.type === 'stock' ? r.description : null,
      collected: false,
    });
    setNewFromDelivery({ type: 'stock', customer: '', doNumber: '', chequeNumber: '', description: '', cashAmount: '' });
    load();
  }
  // Needs the "confirm cash/cheque collected" power — checked inside the database (migration 14).
  async function toggleCollected(itemId, current) {
    const { error } = await supabase.rpc('wheels_set_collected', { item_id: itemId, val: !current });
    if (error) alert(error.message);
    load();
  }

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

  async function addError() {
    if (!newError.errorType || !newError.department) return;
    await supabase.from('status_errors').insert({
      dispatch_log_id: id,
      invoice_number: newError.invoice || '',
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

  async function deleteLog() {
    if (!confirm(`Delete this dispatch log for ${log.driver_name}? This cannot be undone.`)) return;
    setDeleting(true);
    const { error } = await supabase.rpc('wheels_delete_log', { log_id: id }); // checks the power in the database
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

  const locked = log.completed;

  // What's still outstanding, if anything — shown as a quiet checklist while the log is open.
  // Completion is manual: "Mark As Complete" is clickable only when nothing is outstanding
  // below. The database enforces the same rule independently, so it can't be bypassed.
  const undoneMissions = log.mission_items.filter((m) => !m.done).length;
  const unreturnedToDelivery = log.to_delivery_items.filter((t) => !t.returned).length;
  const uncollectedMoney = log.from_delivery_items.filter((f) => (f.type === 'cash' || f.type === 'cheque') && !f.collected).length;
  const unresolvedErrors = log.status_errors.filter((e) => !e.resolved && e.invoice_number !== 'DO-0').length;
  const unresolvedUndelivered = log.undelivered_items.filter((u) => !u.resolved && u.invoice_number !== 'DO-0').length;
  const outstandingCount = undoneMissions + unreturnedToDelivery + uncollectedMoney + unresolvedErrors + unresolvedUndelivered;

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

        {/* HEADER — Amendment 2: date is now the biggest element */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-2xl font-bold text-depot-900 leading-tight">
                {new Date(log.log_date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-sm text-depot-700/70 mt-0.5">{log.driver_name}</p>
              {(log.foreman_1 || log.foreman_2) && (
                <p className="text-xs text-depot-700/60 mt-1">Foreman: {[log.foreman_1, log.foreman_2].filter(Boolean).join(' · ')}</p>
              )}
              {log.loader_name && <p className="text-xs text-depot-700/60 mt-0.5">Loader: {log.loader_name}</p>}
              {log.plate_number && <p className="text-xs text-depot-700/60 mt-0.5">Plate: {log.plate_number}</p>}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {log.reward_earned && <span className="bg-bonus-light text-bonus text-xs font-semibold px-2.5 py-1 rounded-full">RM50 Bonus</span>}
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${locked ? 'bg-bonus-light text-bonus' : 'bg-depot-100 text-depot-700/70'}`}>
                {locked ? 'COMPLETE' : 'In Progress'}
              </span>
            </div>
          </div>
          <p className="text-sm text-depot-700 mt-3">Total Amount: <strong>RM {Number(log.header_amount).toLocaleString()}</strong></p>

          {/* Amendment 1: header edit, only while not completed */}
          {!locked && !editingHeader && (
            <button onClick={startEditHeader} className="mt-3 text-route border border-route/30 hover:bg-route-light text-sm font-medium px-3 py-1.5 rounded-lg">
              Edit driver / foreman / loader / plate / date
            </button>
          )}
          {!locked && editingHeader && headerForm && (
            <div className="mt-4 pt-4 border-t border-depot-700/10 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CrewSelect slot="driver" value={headerForm.driver_name} onChange={(v) => setHeaderForm({ ...headerForm, driver_name: v })} people={allPeople} rules={crewRules} taken={[headerForm.foreman_1, headerForm.foreman_2, headerForm.loader_name]} placeholder="Select driver" />
              <CrewSelect slot="foreman" value={headerForm.foreman_1} onChange={(v) => setHeaderForm({ ...headerForm, foreman_1: v })} people={allPeople} rules={crewRules} taken={[headerForm.driver_name, headerForm.foreman_2, headerForm.loader_name]} placeholder="Select foreman 1" />
              <CrewSelect slot="foreman" value={headerForm.foreman_2} onChange={(v) => setHeaderForm({ ...headerForm, foreman_2: v })} people={allPeople} rules={crewRules} taken={[headerForm.driver_name, headerForm.foreman_1, headerForm.loader_name]} placeholder="Select foreman 2" />
              <CrewSelect slot="loader" value={headerForm.loader_name} onChange={(v) => setHeaderForm({ ...headerForm, loader_name: v })} people={allPeople} rules={crewRules} taken={[headerForm.driver_name, headerForm.foreman_1, headerForm.foreman_2]} placeholder="No loader" />
              <input value={headerForm.plate_number} onChange={(e) => setHeaderForm({ ...headerForm, plate_number: e.target.value })} className="input" placeholder="Plate number" />
              <input type="date" value={headerForm.log_date} onChange={(e) => setHeaderForm({ ...headerForm, log_date: e.target.value })} className="input" />
              {headerError && <p className="sm:col-span-3 text-flag text-sm">{headerError}</p>}
              <div className="sm:col-span-3 flex gap-2 mt-1">
                <button onClick={saveHeader} className="bg-route text-white text-sm font-medium px-4 py-2 rounded-lg">Save Changes</button>
                <button onClick={() => setEditingHeader(false)} className="text-depot-700/60 text-sm px-3 py-2">Cancel</button>
              </div>
            </div>
          )}
        </section>

        {/* To Delivery */}
        <DetailSection title="To Delivery — mark arrived back">
          {log.to_delivery_items.length === 0 && <Empty />}
          {log.to_delivery_items.map((item) => (
            <label key={item.id} className="flex items-center justify-between py-1.5 border-b border-depot-700/5 last:border-0 cursor-pointer">
              <span className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={item.returned} disabled={locked} onChange={() => toggleReturned(item.id, item.returned)} />
                <span className={item.returned ? 'text-depot-700/50' : ''}>{item.invoice_number} — {item.customer}</span>
              </span>
              <span className="font-medium text-sm">RM {Number(item.amount).toLocaleString()}</span>
            </label>
          ))}
          {!locked && (
            <>
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
            </>
          )}
        </DetailSection>

        {/* Amendment: Undelivered DO — DOs assigned to this driver that never got attempted */}
        <DetailSection title="Undelivered DO">
          <p className="text-xs text-depot-700/60 mb-3">
            DOs assigned to this driver that never even got delivered. Can only be resolved by
            re-delivering it as an "Unresolved DO" on a new tracker's To Delivery section.
          </p>
          {log.undelivered_items.length === 0 && <Empty />}
          {log.undelivered_items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-depot-700/5 last:border-0">
              <div className="text-sm">
                <p className="font-medium text-depot-900">{item.invoice_number} — {item.customer}</p>
                <p className="text-xs text-depot-700/60">RM {Number(item.amount).toLocaleString()}</p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${
                item.resolved ? 'bg-bonus-light text-bonus' : 'bg-flag-light text-flag'
              }`}>
                {item.resolved ? 'Resolved' : (item.invoice_number === 'DO-0' ? 'Not tracked' : 'Pending')}
              </span>
            </div>
          ))}
          {!locked && (
            <>
              <p className="text-xs text-depot-700/60 mt-4 mb-2">Add an undelivered DO:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <InvoiceInput value={newUndelivered.invoice} onChange={(v) => setNewUndelivered({ ...newUndelivered, invoice: v })} />
                <input value={newUndelivered.customer} onChange={(e) => setNewUndelivered({ ...newUndelivered, customer: e.target.value })}
                  className="input" placeholder="Customer" />
                <input type="number" step="0.01" value={newUndelivered.amount} onChange={(e) => setNewUndelivered({ ...newUndelivered, amount: e.target.value })}
                  className="input" placeholder="Amount (RM)" />
              </div>
              <button onClick={addUndelivered} className="mt-2 text-flag border border-flag/30 hover:bg-flag-light text-sm font-medium px-3 py-1.5 rounded-lg">
                + Add Undelivered DO
              </button>
            </>
          )}
        </DetailSection>

        {/* Mission — moved ahead of From Delivery (latest amendment) */}
        <DetailSection title="Mission">
          {log.mission_items.length === 0 && <Empty />}
          {log.mission_items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-depot-700/5 last:border-0 cursor-pointer">
              <input type="checkbox" checked={item.done} disabled={locked} onChange={() => toggleMissionDone(item.id, item.done)} />
              <span className={item.done ? 'line-through text-depot-700/50' : ''}>{item.task}</span>
            </label>
          ))}
          {!locked && (
            <div className="flex gap-2 mt-3">
              <input value={newMissionTask} onChange={(e) => setNewMissionTask(e.target.value)}
                className="input flex-1" placeholder="Add a mission item" />
              <button onClick={addMission} className="bg-route text-white text-sm font-medium px-3 rounded-lg">Add</button>
            </div>
          )}
        </DetailSection>

        {/* From Delivery — Money (Cash/Cheque) or Stocks (latest amendment) */}
        <DetailSection title="From Delivery">
          {log.from_delivery_items.length === 0 && <Empty />}
          {log.from_delivery_items.map((item) => (
            <div key={item.id} className="py-2 border-b border-depot-700/5 last:border-0">
              {item.type === 'cash' || item.type === 'cheque' ? (
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <p className="font-medium text-depot-900">
                      {item.type === 'cash' ? 'Cash' : 'Cheque'} {item.cash_amount} — {item.customer}
                    </p>
                    <p className="text-xs text-depot-700/60">
                      {item.type === 'cash' ? (item.do_number || 'No DO (previous day)') : `Cheque No. ${item.cheque_number}`}
                    </p>
                  </div>
                  {canCash && !locked ? (
                    <button
                      onClick={() => toggleCollected(item.id, item.collected)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${item.collected ? 'bg-bonus-light text-bonus' : 'bg-flag-light text-flag'}`}
                    >
                      {item.collected ? 'Collected' : 'Pending — mark collected'}
                    </button>
                  ) : (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${item.collected ? 'bg-bonus-light text-bonus' : 'bg-flag-light text-flag'}`}>
                      {item.collected ? 'Collected' : 'Pending'}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-sm">
                  <p className="font-medium text-depot-900">{item.customer} — {item.do_number}</p>
                  <p className="text-xs text-depot-700/60">{item.description}</p>
                </div>
              )}
            </div>
          ))}

          {!locked && (
            <div className="mt-4">
              {/* Top level: Money or Stocks */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button type="button"
                  onClick={() => setNewFromDelivery({ ...newFromDelivery, type: newFromDelivery.type === 'stock' ? 'cash' : newFromDelivery.type })}
                  className={`text-sm font-medium py-2 rounded-lg border ${newFromDelivery.type !== 'stock' ? 'bg-bonus text-white border-bonus' : 'text-depot-700 border-depot-700/15'}`}>
                  Money
                </button>
                <button type="button" onClick={() => setNewFromDelivery({ ...newFromDelivery, type: 'stock' })}
                  className={`text-sm font-medium py-2 rounded-lg border ${newFromDelivery.type === 'stock' ? 'bg-route text-white border-route' : 'text-depot-700 border-depot-700/15'}`}>
                  Stocks
                </button>
              </div>

              {/* Second level, only for Money: Cash or Cheque */}
              {newFromDelivery.type !== 'stock' && (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button type="button" onClick={() => setNewFromDelivery({ ...newFromDelivery, type: 'cash' })}
                    className={`text-xs font-medium py-1.5 rounded-lg border ${newFromDelivery.type === 'cash' ? 'bg-bonus text-white border-bonus' : 'text-depot-700 border-depot-700/15'}`}>
                    Cash
                  </button>
                  <button type="button" onClick={() => setNewFromDelivery({ ...newFromDelivery, type: 'cheque' })}
                    className={`text-xs font-medium py-1.5 rounded-lg border ${newFromDelivery.type === 'cheque' ? 'bg-bonus text-white border-bonus' : 'text-depot-700 border-depot-700/15'}`}>
                    Cheque
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={newFromDelivery.customer} onChange={(e) => setNewFromDelivery({ ...newFromDelivery, customer: e.target.value })}
                  className="input" placeholder="Customer" />

                {newFromDelivery.type === 'cash' && (() => {
                  const availableDOs = [...new Set(log.to_delivery_items.filter((r) => r.invoice_number).map((r) => r.invoice_number))];
                  return (
                    <div>
                      <select
                        value={newFromDelivery.doNumber ? `DO-${newFromDelivery.doNumber}` : ''}
                        onChange={(e) => setNewFromDelivery({ ...newFromDelivery, doNumber: e.target.value ? e.target.value.replace(/^DO-/, '') : '' })}
                        className="input"
                      >
                        <option value="">Leave blank if no DO</option>
                        {availableDOs.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  );
                })()}
                {newFromDelivery.type === 'cheque' && (
                  <input value={newFromDelivery.chequeNumber} onChange={(e) => setNewFromDelivery({ ...newFromDelivery, chequeNumber: e.target.value })}
                    className="input" placeholder="Cheque Number" />
                )}
                {newFromDelivery.type === 'stock' && (
                  <InvoiceInput value={newFromDelivery.doNumber || ''} onChange={(v) => setNewFromDelivery({ ...newFromDelivery, doNumber: v })} />
                )}

                {newFromDelivery.type === 'stock' ? (
                  <input value={newFromDelivery.description} onChange={(e) => setNewFromDelivery({ ...newFromDelivery, description: e.target.value })}
                    className="input" placeholder="Describe the stock" />
                ) : (
                  <input value={newFromDelivery.cashAmount} onChange={(e) => setNewFromDelivery({ ...newFromDelivery, cashAmount: e.target.value })}
                    className="input" placeholder="e.g. RM500 or USD100" />
                )}
              </div>
              {newFromDelivery.type === 'cash' && (
                <p className="text-xs text-depot-700/50 mt-1">Leave blank if no DO — e.g. customer is paying cash for a previous day's DO.</p>
              )}
              <button onClick={addFromDelivery} className="mt-2 text-route border border-route/30 hover:bg-route-light text-sm font-medium px-3 py-1.5 rounded-lg">
                + Add
              </button>
            </div>
          )}
        </DetailSection>

        {/* Status */}
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
                disabled={locked}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${
                  err.resolved ? 'bg-bonus-light text-bonus' : 'bg-flag-light text-flag'
                }`}
              >
                {err.resolved ? 'Resolved' : 'Active — mark resolved'}
              </button>
            </div>
          ))}

          {!locked && (
            <>
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
                <select value={newError.invoice} onChange={(e) => setNewError({ ...newError, invoice: e.target.value })} className="input">
                  <option value="">Which DO?</option>
                  {log.to_delivery_items.map((item) => (
                    <option key={item.id} value={item.invoice_number}>{item.invoice_number}</option>
                  ))}
                </select>
              </div>
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
            </>
          )}
        </DetailSection>

        {/* Manual completion only — button unlocks when everything above is cleared. */}
        <section className={`rounded-xl p-4 border ${locked ? 'bg-bonus-light border-bonus/30' : 'bg-depot-100 border-depot-700/10'}`}>
          {!locked ? (
            <div>
              <p className="text-sm font-medium text-depot-700">
                {outstandingCount === 0
                  ? 'Everything is cleared — you can mark this log as complete.'
                  : 'Mark As Complete unlocks once everything below is cleared:'}
              </p>
              {outstandingCount > 0 && (
                <ul className="text-sm text-depot-700/70 mt-1.5 list-disc list-inside">
                  {unreturnedToDelivery > 0 && <li>{unreturnedToDelivery} To Delivery item(s) not yet ticked back</li>}
                  {undoneMissions > 0 && <li>{undoneMissions} Mission item(s) not yet ticked done</li>}
                  {uncollectedMoney > 0 && <li>{uncollectedMoney} Cash/Cheque entry(ies) not yet marked Collected</li>}
                  {unresolvedErrors > 0 && <li>{unresolvedErrors} unresolved Status error(s)</li>}
                  {unresolvedUndelivered > 0 && <li>{unresolvedUndelivered} undelivered DO(s) still pending</li>}
                </ul>
              )}
              <button
                onClick={markComplete}
                disabled={markingComplete || outstandingCount > 0}
                className="mt-3 bg-bonus text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {markingComplete ? 'Marking Complete…' : 'Mark As Complete'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-bonus">
                Marked COMPLETE — no further changes allowed.
              </p>
              {canFix && (
                <button
                  onClick={reopenLog}
                  disabled={reopening}
                  className="text-xs font-semibold border border-bonus/40 text-bonus hover:bg-bonus/10 px-3 py-1.5 rounded-full shrink-0 disabled:opacity-50"
                >
                  {reopening ? 'Reopening…' : 'Reopen for editing'}
                </button>
              )}
            </div>
          )}
        </section>

        {canFix && (
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
