'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import NavDrawer from '@/components/NavDrawer';

// Amendment 5: LogTrack home is now a list of month folders instead of a flat log list.
export default function Dashboard() {
  const router = useRouter();
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const { data, error } = await supabase
        .from('dispatch_logs')
        .select('id, log_date, completed')
        .order('log_date', { ascending: false });

      if (!error && data) {
        // Group logs by "YYYY-MM" on the client — simplest approach without a database view
        const grouped = {};
        data.forEach((log) => {
          const key = log.log_date.slice(0, 7); // "YYYY-MM"
          if (!grouped[key]) grouped[key] = { total: 0, completed: 0 };
          grouped[key].total += 1;
          if (log.completed) grouped[key].completed += 1;
        });
        const monthList = Object.entries(grouped)
          .map(([key, counts]) => ({ key, ...counts }))
          .sort((a, b) => (a.key < b.key ? 1 : -1)); // newest month first
        setMonths(monthList);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-depot-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NavDrawer />
          <h1 className="font-display text-xl text-paper font-bold">LogTrack</h1>
        </div>
        <div className="flex gap-3">
          <Link
            href="/new-log"
            className="bg-route text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90"
          >
            + New Dispatch Log
          </Link>
          <button onClick={handleLogout} className="text-depot-100/70 text-sm px-3 py-2 hover:text-paper">
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="font-display text-2xl text-depot-900 mb-4">Dispatch Logs by Month</h2>

        {loading && <p className="text-depot-700">Loading…</p>}
        {!loading && months.length === 0 && (
          <p className="text-depot-700">No logs yet. Create your first one.</p>
        )}

        <div className="space-y-3">
          {months.map((m) => {
            const label = new Date(`${m.key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            const allDone = m.completed === m.total;
            return (
              <Link
                key={m.key}
                href={`/dashboard/${m.key}`}
                className="bg-white rounded-xl p-4 shadow-sm border border-depot-700/10 flex items-center justify-between hover:border-route/40 hover:shadow-md transition"
              >
                <div>
                  <p className="font-display font-semibold text-depot-900">{label}</p>
                  <p className="text-xs text-depot-700/60 mt-0.5">{m.total} dispatch log{m.total === 1 ? '' : 's'}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${allDone ? 'bg-bonus-light text-bonus' : 'bg-depot-100 text-depot-700/70'}`}>
                  {allDone ? 'Completed' : `${m.completed}/${m.total} completed`}
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
