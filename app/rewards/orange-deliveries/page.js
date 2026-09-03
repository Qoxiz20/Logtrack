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
function formatMonthDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function OrangeDeliveriesPage() {
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

    // Counted here regardless of whether it was later resolved — this is a historical
    // record of on-time-delivery failures, not a live outstanding-issues list.
    // DO-0 is exempt, same as everywhere else.
    const { data: allUndelivered } = await supabase
      .from('undelivered_items')
      .select('invoice_number, dispatch_log_id, dispatch_logs ( driver_name, log_date )')
      .neq('invoice_number', 'DO-0');
    const undelivered = (allUndelivered || []).filter(
      (u) => u.dispatch_logs && u.dispatch_logs.log_date >= start && u.dispatch_logs.log_date <= end
    );

    const monthLabel = new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const byDriver = {};
    undelivered.forEach((u) => {
      const driver = u.dispatch_logs.driver_name;
      const date = u.dispatch_logs.log_date;
      if (!byDriver[driver]) byDriver[driver] = {};
      byDriver[driver][date] = (byDriver[driver][date] || 0) + 1;
    });

    let text = `ORANGE DELIVERIES — ${monthLabel.toUpperCase()}\n${'='.repeat(40)}\n\n`;

    const drivers = Object.keys(byDriver).sort();
    if (drivers.length === 0) {
      text += 'No undelivered DOs recorded this month.\n';
    }

    drivers.forEach((driver) => {
      const days = Object.keys(byDriver[driver]).sort();
      let total = 0;

      text += `TEAM ${driver.toUpperCase()}\n`;
      days.forEach((date) => {
        const count = byDriver[driver][date];
        total += count;
        text += `${formatMonthDay(date)} - ${count} undelivered DO\n`;
      });

      text += `Monthly summary: Team ${driver} total ${total} undelivered DO in ${monthLabel}\n`;
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
          <h1 className="font-display text-xl text-paper font-bold">Orange Deliveries</h1>
        </div>
        <Link href="/rewards" className="text-depot-100/70 text-sm hover:text-paper">← Reward System</Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <section className="bg-white rounded-xl p-4 shadow-sm border border-depot-700/10 flex items-center justify-between">
          <p className="text-xs text-depot-700/60">Undelivered DOs (failed on-time deliveries), by team, with a monthly total.</p>
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
