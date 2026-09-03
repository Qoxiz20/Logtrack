'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import NavDrawer from '@/components/NavDrawer';

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function monthRange(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}
// "Aug 1" style, matching the report format requested
function formatMonthDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DeliveryAccuracyPage() {
  const router = useRouter();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [reportText, setReportText] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonth]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    setCopied(false);

    const { start, end } = monthRange(yearMonth);

    // All trips this month, per driver — used as the denominator for the accuracy %
    const { data: logs } = await supabase
      .from('dispatch_logs')
      .select('id, driver_name, log_date')
      .gte('log_date', start)
      .lte('log_date', end);

    // Logistics-department errors, joined back to driver + date, filtered to this month
    // client-side (filtering on a joined table's column isn't reliable via the query itself).
    // DO-0 is the "joker card" placeholder — exempt from every tracking system, this one included.
    const { data: allErrs } = await supabase
      .from('status_errors')
      .select('invoice_number, error_type, dispatch_log_id, dispatch_logs ( driver_name, log_date )')
      .eq('department', 'Logistics')
      .neq('invoice_number', 'DO-0');
    const errs = (allErrs || []).filter(
      (e) => e.dispatch_logs && e.dispatch_logs.log_date >= start && e.dispatch_logs.log_date <= end
    );

    const monthLabel = new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const tripsByDriver = {};
    (logs || []).forEach((l) => {
      tripsByDriver[l.driver_name] = (tripsByDriver[l.driver_name] || 0) + 1;
    });

    // Errors grouped by driver, then by date
    const byDriver = {};
    (errs || []).filter((e) => e.dispatch_logs).forEach((e) => {
      const driver = e.dispatch_logs.driver_name;
      const date = e.dispatch_logs.log_date;
      if (!byDriver[driver]) byDriver[driver] = {};
      if (!byDriver[driver][date]) byDriver[driver][date] = [];
      byDriver[driver][date].push({ invoice: e.invoice_number, type: e.error_type });
    });

    let text = `DELIVERY ACCURACY — ${monthLabel.toUpperCase()}\n${'='.repeat(40)}\n\n`;

    const drivers = Object.keys(tripsByDriver).sort();
    if (drivers.length === 0) {
      text += 'No dispatch logs found for this month.\n';
    }

    drivers.forEach((driver) => {
      const days = byDriver[driver] ? Object.keys(byDriver[driver]).sort() : [];
      let totalErrors = 0;

      text += `TEAM ${driver.toUpperCase()}\n`;
      if (days.length === 0) {
        text += `No logistics errors this month.\n`;
      } else {
        days.forEach((date) => {
          const problems = byDriver[driver][date];
          totalErrors += problems.length;
          text += `${formatMonthDay(date)} Team ${driver} - ${problems.length} problem${problems.length > 1 ? 's' : ''}\n`;
          problems.forEach((p, idx) => {
            text += `Problem ${idx + 1}: ${p.invoice}, ${p.type}\n`;
          });
        });
      }

      const trips = tripsByDriver[driver] || 0;
      const pct = trips > 0 ? ((totalErrors / trips) * 100).toFixed(1) : '0.0';
      text += `Monthly summary: Team ${driver} total ${totalErrors} logistics errors in ${monthLabel} (${totalErrors} errors / ${trips} trips = ${pct}%)\n`;
      text += `${'-'.repeat(40)}\n\n`;
    });

    setReportText(text);
    setLoading(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Could not copy automatically — please select the text and copy manually.');
    }
  }

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="bg-depot-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NavDrawer />
          <h1 className="font-display text-xl text-paper font-bold">Delivery Accuracy</h1>
        </div>
        <Link href="/rewards" className="text-depot-100/70 text-sm hover:text-paper">← Reward System</Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <section className="bg-white rounded-xl p-4 shadow-sm border border-depot-700/10 flex items-center justify-between">
          <p className="text-xs text-depot-700/60">Logistics-department errors, by team, with a monthly accuracy summary.</p>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input w-auto" />
        </section>

        {loading ? (
          <p className="text-depot-700">Loading…</p>
        ) : (
          <section className="bg-white rounded-xl p-4 shadow-sm border border-depot-700/10">
            <div className="flex justify-end mb-2">
              <button onClick={handleCopy} className="bg-route text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
            <textarea
              readOnly
              value={reportText}
              rows={20}
              className="w-full text-xs font-mono p-3 rounded-lg border border-depot-700/15 bg-depot-100 text-depot-900"
            />
          </section>
        )}
      </main>

      <style jsx global>{`
        .input {
          padding: 0.55rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid rgba(43, 58, 74, 0.15);
          font-size: 0.9rem;
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 2px #3E7CB1;
        }
      `}</style>
    </div>
  );
}
