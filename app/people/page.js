'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import NavDrawer from '@/components/NavDrawer';
import { inBox } from '@/components/CrewSelect';

// Team Roster is READ-ONLY. Everyone is added, changed and removed in LHG Journey;
// this page only shows who Journey is currently offering to Wheels, and in which box.
const BOXES = [
  { slot: 'driver', label: 'Drivers' },
  { slot: 'foreman', label: 'Foremen' },
  { slot: 'loader', label: 'Loaders' },
];

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const { data } = await supabase.from('people').select('id, name, role, department, position, employee_id, active').order('name');
    setPeople(data || []);
    const { data: r } = await supabase.from('app_name_rules').select('slot, department, position').eq('app_key', 'wheels');
    setRules(r || []);
    setLoading(false);
  }

  const linked = people.filter((p) => p.employee_id && p.active);
  const oldEntries = people.filter((p) => !p.employee_id);

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="bg-depot-900 px-6 py-4 flex items-center gap-3">
        <NavDrawer />
        <h1 className="font-display text-xl text-paper font-bold">Team Roster</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <p className="text-depot-700">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-depot-700/70">
              Everyone comes from LHG Journey — people can’t be added or removed here. To add someone, change a
              position, or stop someone appearing, do it in LHG Journey; this list follows automatically. Which
              box a person appears in is decided by the Wheels rules in Journey → Settings.
            </p>

            {BOXES.map(({ slot, label }) => {
              const inThisBox = linked.filter((p) => inBox(p, slot, rules));
              return (
                <section key={slot} className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
                  <h2 className="font-display font-semibold text-depot-900 mb-3">{label}</h2>
                  {inThisBox.length === 0 && (
                    <p className="text-sm text-depot-700/40">Nobody yet — set the {label.toLowerCase()} rule in Journey → Settings.</p>
                  )}
                  {inThisBox.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-depot-700/5 last:border-0">
                      <span>{p.name}</span>
                      <span className="text-xs text-depot-700/60 text-right">{[p.position, p.department].filter(Boolean).join(' · ')}</span>
                    </div>
                  ))}
                </section>
              );
            })}

            {oldEntries.length > 0 && (
              <section className="bg-depot-100/60 rounded-xl p-5 border border-depot-700/10">
                <h2 className="font-display font-semibold text-depot-700 mb-1">Old Wheels-only names — no longer selectable</h2>
                <p className="text-xs text-depot-700/60 mb-3">
                  These were typed in directly in Wheels before everything moved to Journey, so they aren’t linked to
                  anyone. They no longer appear in the dropdowns (old logs keep their names). If one of them still
                  works here, add them in Journey with the same name or nickname and they’ll link automatically.
                </p>
                {oldEntries.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1 text-sm text-depot-700/60">
                    <span>{p.name}</span>
                    <span className="text-xs">{p.role || ''}</span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
