'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const router = useRouter();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      // Pull logs plus a count of unresolved errors for each, in one go
      const { data, error } = await supabase
        .from('dispatch_logs')
        .select(`
          id, driver_name, header_amount, log_date, to_delivery_total, reward_earned,
          status_errors ( id, resolved )
        `)
        .order('log_date', { ascending: false });

      if (!error) setLogs(data);
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
        <h1 className="font-display text-xl text-paper font-bold">LogTrack</h1>
        <div className="flex gap-3">
          <Link
            href="/new-log"
            className="bg-route text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90"
          >
            + New Dispatch Log
          </Link>
          <button
            onClick={handleLogout}
            className="text-depot-100/70 text-sm px-3 py-2 hover:text-paper"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="font-display text-2xl text-depot-900 mb-4">Dispatch Logs</h2>

        {loading && <p className="text-depot-700">Loading…</p>}
        {!loading && logs.length === 0 && (
          <p className="text-depot-700">No logs yet. Create your first one.</p>
        )}

        <div className="space-y-3">
          {logs.map((log) => {
            const activeErrors = log.status_errors?.filter((e) => !e.resolved).length || 0;
            return (
              <Link
                key={log.id}
                href={`/log/${log.id}`}
                className="bg-white rounded-xl p-4 shadow-sm border border-depot-700/10 flex items-center justify-between hover:border-route/40 hover:shadow-md transition cursor-pointer"
              >
                <div>
                  <p className="font-semibold text-depot-900">{log.driver_name}</p>
                  <p className="text-sm text-depot-700/70">
                    {new Date(log.log_date).toLocaleDateString()} · RM {Number(log.header_amount).toLocaleString()}
                  </p>
                  <p className="text-xs text-depot-700/60 mt-0.5">
                    To Delivery total: RM {Number(log.to_delivery_total).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {log.reward_earned && (
                    <span className="bg-bonus-light text-bonus text-xs font-semibold px-2.5 py-1 rounded-full">
                      RM50 Bonus
                    </span>
                  )}
                  {activeErrors > 0 && (
                    <span className="bg-flag-light text-flag text-xs font-semibold px-2.5 py-1 rounded-full">
                      {activeErrors} active error{activeErrors > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
