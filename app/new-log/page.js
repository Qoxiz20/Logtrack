'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { REWARD_THRESHOLD, REWARD_AMOUNT, ERROR_TYPES, DEPARTMENTS, computeRewardEarned } from '@/lib/reward';
import NavDrawer from '@/components/NavDrawer';
import CrewSelect from '@/components/CrewSelect';

export default function NewLogPage() {
  const router = useRouter();

  // --- Part 1: Header ---
  const [driverName, setDriverName] = useState('');
  const [foreman1, setForeman1] = useState('');
  const [foreman2, setForeman2] = useState('');
  const [loaderName, setLoaderName] = useState(''); // optional; picked from the roster
  const [plateNumber, setPlateNumber] = useState(''); // Amendment 3: free text, optional
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  // Amendment 1: no manual amount field anymore — it's calculated below from To Delivery rows

  // Amendment 2 (people-list dropdowns): fetch the active drivers & foremen once on page load
  const [driversList, setDriversList] = useState([]);
  const [foremenList, setForemenList] = useState([]);
  const [loadersList, setLoadersList] = useState([]);
  const [allPeople, setAllPeople] = useState([]);
  const [crewRules, setCrewRules] = useState([]); // Wheels rules from LHG Journey (who goes in which box) // loader dropdown: regular loaders first, then everyone else

  useEffect(() => {
    async function loadPeople() {
      const { data } = await supabase.from('people').select('id, name, role, department, position, employee_id').eq('active', true).order('name');
      if (data) {
        setDriversList(data.filter((p) => p.role === 'driver'));
        setForemenList(data.filter((p) => p.role === 'foreman'));
        setLoadersList(data.filter((p) => p.role === 'loader'));
        setAllPeople(data);
      const { data: rules } = await supabase.from('app_name_rules').select('slot, department, position').eq('app_key', 'wheels');
      setCrewRules(rules || []);
      }
    }
    loadPeople();
  }, []);

  // --- Part 2: To Delivery ---
  // Amendment 3: "invoice" here stores ONLY the digits the user types; "DO-" is added automatically
  // Amendment: "mode" is 'new' (typed fresh) or 'unresolved' (picked from an outstanding Undelivered DO)
  const [toDelivery, setToDelivery] = useState([{ mode: 'new', invoice: '', customer: '', amount: '', resolvesUndeliveredId: null, resolvesErrorId: null }]);

  // --- Part 3: From Delivery ---
  // Amendment 6: each row is either "cash" (customer, DO#, amount) or "stock" (customer, DO#, description)
  const [fromDelivery, setFromDelivery] = useState([]);

  // --- Part 4: Mission ---
  const [missions, setMissions] = useState([{ task: '', done: false }]);

  // --- Part 5: Status (error flags) ---
  const [errors, setErrors] = useState([]); // starts empty — only add if there IS an error

  // --- Amendment: Undelivered DO — DOs assigned to this driver that never got attempted ---
  const [undelivered, setUndelivered] = useState([]);

  // --- Amendment: Outstanding from Previous Days — now a view-only side drawer,
  // opened via a badge button instead of sitting at the top of the page.
  const [outstandingErrors, setOutstandingErrors] = useState([]);
  const [outstandingUndelivered, setOutstandingUndelivered] = useState([]);
  const [outstandingLoading, setOutstandingLoading] = useState(true);
  const [outstandingOpen, setOutstandingOpen] = useState(false);

  useEffect(() => {
    loadOutstanding();
  }, []);

  // DD-MM-YYYY, since that's the format requested for the Outstanding list
  function formatDMY(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  }

  async function loadOutstanding() {
    setOutstandingLoading(true);
    // DO-0 is a reusable placeholder code — it never counts as an outstanding issue.
    const { data: errs } = await supabase
      .from('status_errors')
      .select('id, invoice_number, error_type, department, description, dispatch_log_id, dispatch_logs ( driver_name, log_date )')
      .eq('resolved', false)
      .neq('invoice_number', 'DO-0');
    const { data: undel } = await supabase
      .from('undelivered_items')
      .select('id, invoice_number, customer, amount, dispatch_log_id, dispatch_logs ( driver_name, log_date )')
      .eq('resolved', false)
      .neq('invoice_number', 'DO-0');

    // Sort oldest-first by the tracker's actual date — the Supabase query above can't
    // order by a joined table's column, so it's sorted here once the data is back.
    const byDate = (a, b) => new Date(a.dispatch_logs?.log_date || 0) - new Date(b.dispatch_logs?.log_date || 0);
    setOutstandingErrors((errs || []).sort(byDate));
    setOutstandingUndelivered((undel || []).sort(byDate));
    setOutstandingLoading(false);
  }

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

    // Anti-abuse: one person can't fill two slots in the same log (the database checks this too).
    const filledSlots = [driverName, foreman1, foreman2, loaderName].filter(Boolean);
    if (new Set(filledSlots).size !== filledSlots.length) {
      setSubmitError('The same person can’t be in two places on one log (driver, foreman or loader).');
      return;
    }

    const incompleteUnresolved = toDelivery.some(
      (r) => r.mode === 'unresolved' && (!r.resolvesUndeliveredId && !r.resolvesErrorId)
    );
    if (incompleteUnresolved) {
      setSubmitError('One of your To Delivery rows is set to "Unresolved DO" but nothing was selected from the dropdown. Please pick an item, or switch that row back to "New".');
      return;
    }
    const missingDetails = toDelivery.some(
      (r) => r.mode === 'unresolved' && (r.resolvesUndeliveredId || r.resolvesErrorId) && (!r.customer || !r.amount)
    );
    if (missingDetails) {
      setSubmitError('One of your "Unresolved DO" rows is missing Customer or Amount — please fill those in before saving.');
      return;
    }

    const cashDOs = fromDelivery.filter((r) => r.type === 'cash' && r.doNumber).map((r) => r.doNumber);
    const duplicateCashDO = cashDOs.find((d, idx) => cashDOs.indexOf(d) !== idx);
    if (duplicateCashDO) {
      setSubmitError(`DO-${duplicateCashDO} has more than one Cash entry — please remove the duplicate before saving.`);
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
        const { error: tdErr } = await supabase.from('to_delivery_items').insert(
          validToDelivery.map((r) => ({
            dispatch_log_id: logId,
            invoice_number: `DO-${r.invoice}`, // amendment 3
            customer: r.customer,
            amount: parseFloat(r.amount),
            resolves_undelivered_id: r.mode === 'unresolved' ? r.resolvesUndeliveredId : null,
            resolves_error_id: r.mode === 'unresolved' ? r.resolvesErrorId : null,
          }))
        );
        if (tdErr) throw new Error('To Delivery: ' + tdErr.message);
      }

      const validFromDelivery = fromDelivery.filter((r) =>
        r.type === 'cash' ? (r.customer && r.doNumber && r.cashAmount) : (r.customer && r.doNumber && r.description)
      );
      if (validFromDelivery.length) {
        const { error: fdErr } = await supabase.from('from_delivery_items').insert(
          validFromDelivery.map((r) => ({
            dispatch_log_id: logId,
            type: r.type,
            customer: r.customer,
            do_number: r.doNumber ? `DO-${r.doNumber}` : null,
            cash_amount: r.type === 'cash' ? r.cashAmount : null,
            description: r.type === 'stock' ? r.description : null,
            collected: false,
          }))
        );
        if (fdErr) throw new Error('From Delivery: ' + fdErr.message);
      }

      const validMissions = missions.filter((r) => r.task);
      if (validMissions.length) {
        const { error: missErr } = await supabase.from('mission_items').insert(
          validMissions.map((r) => ({ dispatch_log_id: logId, task: r.task, done: r.done }))
        );
        if (missErr) throw new Error('Mission: ' + missErr.message);
      }

      if (errors.length) {
        const { error: errErr } = await supabase.from('status_errors').insert(
          errors.map((r) => ({
            dispatch_log_id: logId,
            invoice_number: r.invoice || '',
            error_type: r.errorType,
            department: r.department,
            description: r.description || null, // Amendment 7
            resolved: false,
          }))
        );
        if (errErr) throw new Error('Status: ' + errErr.message);
      }

      const validUndelivered = undelivered.filter((r) => r.invoice && r.customer && r.amount);
      if (validUndelivered.length) {
        const { error: undelErr } = await supabase.from('undelivered_items').insert(
          validUndelivered.map((r) => ({
            dispatch_log_id: logId,
            invoice_number: `DO-${r.invoice}`,
            customer: r.customer,
            amount: parseFloat(r.amount),
            resolved: false,
          }))
        );
        if (undelErr) throw new Error('Undelivered DO: ' + undelErr.message);
      }

      router.push('/dashboard');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Amendment: typing a DO number in "New" mode auto-switches to "Unresolved DO" and links
  // it, if that exact number matches an outstanding error or undelivered item. Removes the
  // need to remember the toggle exists at all — only an EXACT match ever triggers this,
  // so partial typing never fires it early.
  async function handleNewInvoiceChange(i, digits) {
    updateRow(setToDelivery)(i, 'invoice', digits);
    const full = `DO-${digits}`;

    const matchedUndelivered = outstandingUndelivered.find((u) => u.invoice_number === full);
    if (matchedUndelivered) {
      updateRow(setToDelivery)(i, 'mode', 'unresolved');
      updateRow(setToDelivery)(i, 'customer', matchedUndelivered.customer);
      updateRow(setToDelivery)(i, 'amount', String(matchedUndelivered.amount));
      updateRow(setToDelivery)(i, 'resolvesUndeliveredId', matchedUndelivered.id);
      updateRow(setToDelivery)(i, 'resolvesErrorId', null);
      return;
    }

    const matchedError = outstandingErrors.find((er) => er.invoice_number === full);
    if (matchedError) {
      updateRow(setToDelivery)(i, 'mode', 'unresolved');
      updateRow(setToDelivery)(i, 'resolvesErrorId', matchedError.id);
      updateRow(setToDelivery)(i, 'resolvesUndeliveredId', null);
      // Amendment 2: this DO's amount already counted once on its original day — force RM0
      // so re-delivering it can't inflate today's total a second time.
      updateRow(setToDelivery)(i, 'amount', '0');
      const { data: match } = await supabase
        .from('to_delivery_items')
        .select('customer')
        .eq('dispatch_log_id', matchedError.dispatch_log_id)
        .eq('invoice_number', matchedError.invoice_number)
        .maybeSingle();
      updateRow(setToDelivery)(i, 'customer', match?.customer || '');
    }
  }

  return (
    <div className="min-h-screen bg-paper pb-24">
      <header className="bg-depot-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NavDrawer />
          <h1 className="font-display text-xl text-paper font-bold">New Dispatch Log</h1>
        </div>
        {!outstandingLoading && (outstandingErrors.length + outstandingUndelivered.length > 0) && (
          <button
            onClick={() => setOutstandingOpen(true)}
            className="bg-flag text-white text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
          >
            ⚠ Outstanding ({outstandingErrors.length + outstandingUndelivered.length})
          </button>
        )}
      </header>

      {/* Amendment: Outstanding from Previous Days — now a view-only slide-in panel from the side.
          No resolve buttons here anymore; an Undelivered DO can only be resolved by actually
          re-delivering it (see the "Unresolved DO" option in the To Delivery section below). */}
      {outstandingOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setOutstandingOpen(false)} />
          <div className="w-80 max-w-[85%] bg-white h-full p-5 overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-depot-900">Outstanding from Previous Days</h2>
              <button onClick={() => setOutstandingOpen(false)} className="text-depot-700/50 text-2xl leading-none">×</button>
            </div>
            {outstandingErrors.length === 0 && outstandingUndelivered.length === 0 && (
              <p className="text-sm text-depot-700/40">Nothing outstanding.</p>
            )}
            {outstandingErrors.map((err) => (
              <div key={err.id} className="py-2 border-b border-depot-700/10 last:border-0">
                <p className="text-sm font-medium text-depot-900">
                  {err.dispatch_logs?.driver_name} — {formatDMY(err.dispatch_logs?.log_date)}
                </p>
                <p className="text-xs text-depot-700/70">{err.invoice_number} — {err.error_type} ({err.department})</p>
              </div>
            ))}
            {outstandingUndelivered.map((item) => (
              <div key={item.id} className="py-2 border-b border-depot-700/10 last:border-0">
                <p className="text-sm font-medium text-depot-900">
                  {item.dispatch_logs?.driver_name} — {formatDMY(item.dispatch_logs?.log_date)}
                </p>
                <p className="text-xs text-depot-700/70">Undelivered: {item.invoice_number} — {item.customer} — RM {Number(item.amount).toLocaleString()}</p>
              </div>
            ))}
            <p className="text-xs text-depot-700/40 mt-4">
              To resolve an undelivered DO, re-deliver it below using "Unresolved DO" in To Delivery, then mark this new tracker COMPLETE.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* PART 1: HEADER */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <h2 className="font-display font-semibold text-depot-900 mb-4">Dispatch Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Driver">
              <CrewSelect slot="driver" value={driverName} onChange={setDriverName} people={allPeople} rules={crewRules} taken={[foreman1, foreman2, loaderName]} placeholder="Select driver" />
            </Field>
            <Field label="Foreman 1">
              <CrewSelect slot="foreman" value={foreman1} onChange={setForeman1} people={allPeople} rules={crewRules} taken={[driverName, foreman2, loaderName]} placeholder="Select foreman 1" />
            </Field>
            <Field label="Foreman 2">
              <CrewSelect slot="foreman" value={foreman2} onChange={setForeman2} people={allPeople} rules={crewRules} taken={[driverName, foreman1, loaderName]} placeholder="Select foreman 2" />
            </Field>
            <Field label="Loader (optional)">
              <CrewSelect slot="loader" value={loaderName} onChange={setLoaderName} people={allPeople} rules={crewRules} taken={[driverName, foreman1, foreman2]} placeholder="Select loader" />
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
            <div key={i} className="mb-3 pb-3 border-b border-depot-700/5 last:border-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => updateRow(setToDelivery)(i, 'mode', 'new')}
                    className={`text-xs font-medium py-1.5 rounded-lg border ${row.mode === 'new' ? 'bg-route text-white border-route' : 'text-depot-700 border-depot-700/15'}`}>
                    New
                  </button>
                  <button type="button" onClick={() => updateRow(setToDelivery)(i, 'mode', 'unresolved')}
                    className={`text-xs font-medium py-1.5 rounded-lg border ${row.mode === 'unresolved' ? 'bg-flag text-white border-flag' : 'text-depot-700 border-depot-700/15'}`}>
                    Unresolved DO
                  </button>
                </div>
                {toDelivery.length > 1 && (
                  <button type="button" onClick={() => removeRow(setToDelivery)(i)} className="text-depot-700/40 hover:text-flag text-lg px-1">×</button>
                )}
              </div>

              {row.mode === 'new' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <InvoiceInput value={row.invoice} onChange={(v) => handleNewInvoiceChange(i, v)} />
                  <input value={row.customer} onChange={(e) => updateRow(setToDelivery)(i, 'customer', e.target.value)}
                    className="input" placeholder="Customer" />
                  <input type="number" step="0.01" value={row.amount} onChange={(e) => updateRow(setToDelivery)(i, 'amount', e.target.value)}
                    className="input" placeholder="Amount (RM)" />
                </div>
              ) : (
                <div>
                  {(outstandingUndelivered.length + outstandingErrors.length) === 0 ? (
                    <p className="text-xs text-depot-700/50 italic">
                      Nothing outstanding to redeliver. If you expect one here, try refreshing the page.
                    </p>
                  ) : (
                    <select
                      value={row.resolvesUndeliveredId ? `undelivered:${row.resolvesUndeliveredId}` : row.resolvesErrorId ? `error:${row.resolvesErrorId}` : ''}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [kind, optId] = val.split(':');

                        if (kind === 'undelivered') {
                          const picked = outstandingUndelivered.find((u) => u.id === optId);
                          if (!picked) return;
                          updateRow(setToDelivery)(i, 'invoice', picked.invoice_number.replace(/^DO-/, ''));
                          updateRow(setToDelivery)(i, 'customer', picked.customer);
                          updateRow(setToDelivery)(i, 'amount', String(picked.amount));
                          updateRow(setToDelivery)(i, 'resolvesUndeliveredId', picked.id);
                          updateRow(setToDelivery)(i, 'resolvesErrorId', null);
                        } else {
                          const picked = outstandingErrors.find((er) => er.id === optId);
                          if (!picked) return;
                          updateRow(setToDelivery)(i, 'invoice', picked.invoice_number.replace(/^DO-/, ''));
                          updateRow(setToDelivery)(i, 'resolvesErrorId', picked.id);
                          updateRow(setToDelivery)(i, 'resolvesUndeliveredId', null);
                          // Amendment 2: this DO's amount already counted once on its original
                          // day — force RM0 so re-delivering it can't inflate today's total again.
                          updateRow(setToDelivery)(i, 'amount', '0');
                          // Errors don't store Customer themselves — look up the matching
                          // invoice on that original tracker to auto-fill it.
                          const { data: match } = await supabase
                            .from('to_delivery_items')
                            .select('customer')
                            .eq('dispatch_log_id', picked.dispatch_log_id)
                            .eq('invoice_number', picked.invoice_number)
                            .maybeSingle();
                          updateRow(setToDelivery)(i, 'customer', match?.customer || '');
                        }
                      }}
                      className="input"
                    >
                      <option value="">Select an unresolved error or undelivered DO</option>
                      {outstandingUndelivered.map((u) => (
                        <option key={`undelivered:${u.id}`} value={`undelivered:${u.id}`}>
                          Undelivered: {u.invoice_number} — {u.customer} — RM {Number(u.amount).toLocaleString()} ({u.dispatch_logs?.driver_name}, {formatDMY(u.dispatch_logs?.log_date)})
                        </option>
                      ))}
                      {outstandingErrors.map((er) => (
                        <option key={`error:${er.id}`} value={`error:${er.id}`}>
                          Error: {er.invoice_number} — {er.error_type} ({er.department}) ({er.dispatch_logs?.driver_name}, {formatDMY(er.dispatch_logs?.log_date)})
                        </option>
                      ))}
                    </select>
                  )}
                  {(row.resolvesUndeliveredId || row.resolvesErrorId) && (
                    <div className="mt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={row.customer} onChange={(e) => updateRow(setToDelivery)(i, 'customer', e.target.value)}
                          className="input" placeholder="Customer" />
                        {row.resolvesErrorId ? (
                          <div className="input bg-depot-100 text-depot-700/60 flex items-center">RM 0 (doesn't count toward bonus)</div>
                        ) : (
                          <input type="number" step="0.01" value={row.amount} onChange={(e) => updateRow(setToDelivery)(i, 'amount', e.target.value)}
                            className="input" placeholder="Amount (RM)" />
                        )}
                      </div>
                      {!row.customer && (
                        <p className="text-xs text-flag mt-1">
                          Couldn't auto-fill Customer for this one — please type it in above.
                        </p>
                      )}
                      {row.resolvesUndeliveredId && !row.amount && (
                        <p className="text-xs text-flag mt-1">
                          Couldn't auto-fill Amount for this one — please type it in above.
                        </p>
                      )}
                      <p className="text-xs text-depot-700/60 mt-1">
                        Re-delivering: DO-{row.invoice}. Mark this tracker COMPLETE to resolve it.
                        {row.resolvesErrorId && " This DO's amount already counted once on its original day, so it's set to RM0 here to prevent counting it twice toward the bonus."}
                      </p>
                    </div>
                  )}
                  {!row.resolvesUndeliveredId && !row.resolvesErrorId && outstandingUndelivered.length + outstandingErrors.length > 0 && (
                    <p className="text-xs text-flag mt-1.5">
                      Nothing selected yet — this row won't be saved until you pick one above.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          <AddButton onClick={() => addRow(setToDelivery)({ mode: 'new', invoice: '', customer: '', amount: '', resolvesUndeliveredId: null, resolvesErrorId: null })} label="Add invoice row" />
        </section>

        {/* Amendment: UNDELIVERED DO */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          <h2 className="font-display font-semibold text-depot-900 mb-1">Undelivered DO</h2>
          <p className="text-xs text-depot-700/60 mb-3">DOs assigned to this driver that never even got delivered, if known now.</p>
          {undelivered.map((row, i) => (
            <RowGroup key={i} onRemove={() => removeRow(setUndelivered)(i)}>
              <InvoiceInput value={row.invoice} onChange={(v) => updateRow(setUndelivered)(i, 'invoice', v)} />
              <input value={row.customer} onChange={(e) => updateRow(setUndelivered)(i, 'customer', e.target.value)}
                className="input" placeholder="Customer" />
              <input type="number" step="0.01" value={row.amount} onChange={(e) => updateRow(setUndelivered)(i, 'amount', e.target.value)}
                className="input" placeholder="Amount (RM)" />
            </RowGroup>
          ))}
          <AddButton onClick={() => addRow(setUndelivered)({ invoice: '', customer: '', amount: '' })} label="Add undelivered DO" variant="flag" />
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

              {row.type === 'cash' ? (
                (() => {
                  // DO must match what was actually delivered today — sourced from this
                  // tracker's own To Delivery list. A DO already used by another Cash row
                  // is removed from the list so the same DO can't be entered twice.
                  const usedCashDOs = fromDelivery
                    .filter((r, idx) => idx !== i && r.type === 'cash' && !r.doIsOther && r.doNumber)
                    .map((r) => `DO-${r.doNumber}`);
                  const availableDOs = [...new Set(toDelivery.filter((r) => r.invoice).map((r) => `DO-${r.invoice}`))]
                    .filter((d) => !usedCashDOs.includes(d));
                  return (
                    <div className="mb-2">
                      <select
                        value={row.doIsOther ? 'OTHERS' : (row.doNumber ? `DO-${row.doNumber}` : '')}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'OTHERS') {
                            updateRow(setFromDelivery)(i, 'doIsOther', true);
                            updateRow(setFromDelivery)(i, 'doNumber', '');
                          } else {
                            updateRow(setFromDelivery)(i, 'doIsOther', false);
                            updateRow(setFromDelivery)(i, 'doNumber', v ? v.replace(/^DO-/, '') : '');
                          }
                        }}
                        className="input"
                      >
                        <option value="">Select DO</option>
                        {availableDOs.map((d) => <option key={d} value={d}>{d}</option>)}
                        <option value="OTHERS">Others (type manually)</option>
                      </select>
                      {row.doIsOther && (
                        <div className="mt-2">
                          <InvoiceInput value={row.doNumber || ''} onChange={(v) => updateRow(setFromDelivery)(i, 'doNumber', v)} />
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="mb-2">
                  <InvoiceInput value={row.doNumber || ''} onChange={(v) => updateRow(setFromDelivery)(i, 'doNumber', v)} />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={row.customer || ''} onChange={(e) => updateRow(setFromDelivery)(i, 'customer', e.target.value)}
                  className="input" placeholder="Customer" />
                {row.type === 'cash' ? (
                  <input value={row.cashAmount || ''} onChange={(e) => updateRow(setFromDelivery)(i, 'cashAmount', e.target.value)}
                    className="input" placeholder="e.g. RM500 or USD100" />
                ) : (
                  <input value={row.description || ''} onChange={(e) => updateRow(setFromDelivery)(i, 'description', e.target.value)}
                    className="input" placeholder="Describe the stock" />
                )}
              </div>
            </div>
          ))}
          <AddButton onClick={() => addRow(setFromDelivery)({ type: 'stock', customer: '', doNumber: '', doIsOther: false, description: '', cashAmount: '' })} label="Add item" />
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
                <select value={row.invoice} onChange={(e) => updateRow(setErrors)(i, 'invoice', e.target.value)} className="input">
                  <option value="">Which DO?</option>
                  {[...new Set(toDelivery.filter((r) => r.invoice).map((r) => `DO-${r.invoice}`))].map((inv) => (
                    <option key={inv} value={inv}>{inv}</option>
                  ))}
                </select>
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
