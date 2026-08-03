'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import NavDrawer from '@/components/NavDrawer';

const BONUS_AMOUNT = 50;

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

export default function RewardsPage() {
  const router = useRouter();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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
    const { start, end } = monthRange(yearMonth);
    const { data } = await supabase
      .from('dispatch_logs')
      .select('id, driver_name, foreman_1, foreman_2, log_date, to_delivery_total')
      .eq('reward_earned', true)
      .gte('log_date', start)
      .lte('log_date', end)
      .order('log_date');
    setLogs(data || []);
    setLoading(false);
  }

  const breakdown = logs.map((log) => {
    const people = [log.driver_name, log.foreman_1, log.foreman_2].filter(Boolean);
    const share = people.length > 0 ? Math.floor(BONUS_AMOUNT / people.length) : 0;
    return { ...log, people, share };
  });

  const totalsByPerson = {};
  breakdown.forEach((row) => {
    row.people.forEach((name) => {
      totalsByPerson[name] = (totalsByPerson[name] || 0) + row.share;
    });
  });
  const personTotals = Object.entries(totalsByPerson)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const monthLabel = new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="bg-depot-900 px-6 py-4 flex items-center gap-3">
        <NavDrawer />
        <h1 className="font-display text-xl text-paper font-bold">Reward System</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-depot-900">{monthLabel}</h2>
            <p className="text-xs text-depot-700/60 mt-0.5">{breakdown.length} bonus-earning log{breakdown.length === 1 ? '' : 's'} this month</p>
          </div>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input w-auto" />
        </section>

        {loading ? (
          <p className="text-depot-700">Loading…</p>
        ) : (
          <>
            <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
              <h3 className="font-display font-semibold text-depot-900 mb-3">Per-Person Total This Month</h3>
              {personTotals.length === 0 && <p className="text-sm text-depot-700/40">No bonuses this month.</p>}
              {personTotals.map((p) => (
                <div key={p.name} className="flex items-center justify-between py-1.5 border-b border-depot-700/5 last:border-0">
                  <span className="text-sm text-depot-900">{p.name}</span>
                  <span className="text-sm font-semibold text-bonus">RM {p.total}</span>
                </div>
              ))}
            </section>

            <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
              <h3 className="font-display font-semibold text-depot-900 mb-3">Breakdown by Dispatch Log</h3>
              {breakdown.length === 0 && <p className="text-sm text-depot-700/40">Nothing to show for this month.</p>}
              {breakdown.map((row) => (
                <div key={row.id} className="py-3 border-b border-depot-700/5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-depot-900">{row.driver_name}</span>
                    <span className="text-xs text-depot-700/60">{new Date(row.log_date).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-depot-700/60 mt-0.5">
                    RM{BONUS_AMOUNT} ÷ {row.people.length} {row.people.length === 1 ? 'person' : 'people'} = RM{row.share} each
                  </p>
                  <p className="text-xs text-depot-700/50 mt-0.5">{row.people.join(' · ')}</p>
                </div>
              ))}
            </section>
          </>
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
