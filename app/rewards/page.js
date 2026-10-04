'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import NavDrawer from '@/components/NavDrawer';

// Wheels is now a REFERENCE only for rewards: it just says which logs earned the bonus.
// Points, who got what, and totals all live in LHG Journey.

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

export default function RewardsPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { start, end } = monthRange(yearMonth);
      const { data } = await supabase
        .from('dispatch_logs')
        .select('id, driver_name, log_date, reward_earned, completed')
        .gte('log_date', start)
        .lte('log_date', end)
        .order('log_date');
      setLogs(data || []);
      setLoading(false);
    })();
  }, [yearMonth]);

  const monthLabel = new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const yes = logs.filter((l) => l.reward_earned).length;

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="bg-depot-900 px-6 py-4 flex items-center gap-3">
        <NavDrawer />
        <h1 className="font-display text-xl text-paper font-bold">Rewards</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-route-light border border-route/20 rounded-xl p-4 text-sm text-depot-900">
          This page only shows which logs earned the dispatch bonus. <b>For points, who got what, and totals, see LHG Journey.</b>
        </section>

        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-depot-900">{monthLabel}</h2>
            <p className="text-xs text-depot-700/60 mt-0.5">{yes} of {logs.length} log{logs.length === 1 ? '' : 's'} earned the bonus</p>
          </div>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input w-auto" />
        </section>

        <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
          {loading ? (
            <p className="text-depot-700">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-depot-700/40">No logs this month.</p>
          ) : (
            logs.map((l) => (
              <Link key={l.id} href={`/log/${l.id}`} className="flex items-center justify-between py-2 border-b border-depot-700/5 last:border-0">
                <span className="text-sm text-depot-900">
                  <span className="font-medium">{shortDate(l.log_date)}</span>
                  <span className="text-depot-700/60"> · {l.driver_name}</span>
                </span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${l.reward_earned ? 'bg-bonus-light text-bonus' : 'bg-depot-100 text-depot-700/60'}`}>
                  Reward: {l.reward_earned ? 'Yes' : 'No'}
                </span>
              </Link>
            ))
          )}
        </section>

        <section>
          <h3 className="font-display font-semibold text-depot-900 mb-2 text-sm">Reference reports</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Link href="/rewards/delivery-accuracy" className="bg-white rounded-xl p-4 shadow-sm border border-depot-700/10 hover:border-route/40 hover:shadow-md transition text-center">
              <p className="text-sm font-semibold text-depot-900">Delivery Accuracy</p>
              <p className="text-xs text-depot-700/60 mt-1">Logistics errors by team</p>
            </Link>
            <Link href="/rewards/outbound-accuracy" className="bg-white rounded-xl p-4 shadow-sm border border-depot-700/10 hover:border-route/40 hover:shadow-md transition text-center">
              <p className="text-sm font-semibold text-depot-900">Outbound Accuracy</p>
              <p className="text-xs text-depot-700/60 mt-1">Operation errors by loader</p>
            </Link>
            <Link href="/rewards/orange-deliveries" className="bg-white rounded-xl p-4 shadow-sm border border-depot-700/10 hover:border-route/40 hover:shadow-md transition text-center">
              <p className="text-sm font-semibold text-depot-900">Orange Deliveries</p>
              <p className="text-xs text-depot-700/60 mt-1">Undelivered DOs by team</p>
            </Link>
          </div>
        </section>
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
