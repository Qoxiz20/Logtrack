'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import NavDrawer from '@/components/NavDrawer';

function monthRange(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export default function MonthPage() {
  const router = useRouter();
  const { month } = useParams(); // "YYYY-MM"
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const { start, end } = monthRange(month);
    const { data, error } = await supabase
      .from('dispatch_logs')
      .select(`
        id, driver_name, log_date, to_delivery_total, completed,
        from_delivery_items ( type, cash_amount, customer, collected ),
        status_errors ( invoice_number, error_type, department, resolved ),
        undelivered_items ( invoice_number, customer, amount, resolved )
      `)
      .gte('log_date', start)
      .lte('log_date', end)
      .order('log_date', { ascending: false });

    if (!error) setLogs(data || []);
    setLoading(false);
  }

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="bg-depot-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NavDrawer />
          <h1 className="font-display text-xl text-paper font-bold">{monthLabel}</h1>
        </div>
        <Link href="/dashboard" className="text-depot-100/70 text-sm hover:text-paper">← All Months</Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {loading && <p className="text-depot-700">Loading…</p>}
        {!loading && logs.length === 0 && <p className="text-depot-700">No dispatch logs in this month.</p>}

        {logs.map((log) => {
          const cashEntries = (log.from_delivery_items || []).filter((f) => f.type === 'cash');
          const errors = log.status_errors || [];
          const undeliveredEntries = log.undelivered_items || [];
          const dateLabel = new Date(log.log_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

          return (
            <Link
              key={log.id}
              href={`/log/${log.id}`}
              className="block bg-white rounded-xl p-4 shadow-sm border border-depot-700/10 hover:border-route/40 hover:shadow-md transition"
            >
              {/* Amendment 2: date is now the biggest element, driver name secondary */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-xl font-bold text-depot-900 leading-tight">{dateLabel}</p>
                  <p className="text-sm text-depot-700/70">{log.driver_name}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${log.completed ? 'bg-bonus-light text-bonus' : 'bg-depot-100 text-depot-700/70'}`}>
                  {log.completed ? 'Complete' : 'In Progress'}
                </span>
              </div>

              <p className="text-sm text-depot-700 mt-2">To Delivery: <strong>RM {Number(log.to_delivery_total).toLocaleString()}</strong></p>

              {cashEntries.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {cashEntries.map((c, i) => (
                    <p key={i} className="text-xs text-depot-700/70">
                      Cash {c.cash_amount} from {c.customer} — {c.collected ? 'Collected' : 'Pending'}
                    </p>
                  ))}
                </div>
              )}

              {undeliveredEntries.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {undeliveredEntries.map((u, i) => (
                    <p key={i} className="text-xs text-depot-700/70">
                      Undelivered: {u.invoice_number} — {u.customer} — RM {Number(u.amount).toLocaleString()} — {u.resolved ? 'Resolved' : (u.invoice_number === 'DO-0' ? 'Not tracked' : 'Pending')}
                    </p>
                  ))}
                </div>
              )}

              {errors.length === 0 ? (
                <p className="text-xs mt-1.5 text-bonus font-medium">Status: All good</p>
              ) : (
                <div className="mt-1.5 space-y-0.5">
                  {errors.map((e, i) => (
                    <p key={i} className="text-xs text-depot-700/70">
                      {e.invoice_number} — {e.error_type} ({e.department}) — {e.resolved ? 'Resolved' : 'Active'}
                    </p>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </main>
    </div>
  );
}
