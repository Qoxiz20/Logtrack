'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import NavDrawer from '@/components/NavDrawer';
import { isAdminUser } from '@/lib/access';

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newForemanName, setNewForemanName] = useState('');
  const [newLoaderName, setNewLoaderName] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    setIsAdmin(isAdminUser(user));

    const { data } = await supabase.from('people').select('*').order('name');
    setPeople(data || []);
    setLoading(false);
  }

  async function addPerson(role, name, resetInput) {
    if (!name.trim()) return;
    await supabase.from('people').insert({ name: name.trim(), role, active: true });
    resetInput('');
    load();
  }

  async function toggleActive(person) {
    await supabase.from('people').update({ active: !person.active }).eq('id', person.id);
    load();
  }

  // People linked to LHG Journey are managed there (department decides who is in Wheels).
  const fromJourney = people.filter((p) => p.employee_id && (showInactive || p.active));
  const manual = people.filter((p) => !p.employee_id);
  const drivers = manual.filter((p) => p.role === 'driver' && (showInactive || p.active));
  const foremen = manual.filter((p) => p.role === 'foreman' && (showInactive || p.active));
  const loaders = manual.filter((p) => p.role === 'loader' && (showInactive || p.active));

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
            <label className="flex items-center gap-2 text-sm text-depot-700">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show deactivated people too
            </label>

            <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
              <h2 className="font-display font-semibold text-depot-900">From LHG Journey</h2>
              <p className="text-xs text-depot-700/60 mb-3">Added, changed and removed in LHG Journey; this list follows automatically. Which box someone appears in comes from their department and position (Journey → Settings).</p>
              {fromJourney.length === 0 && <p className="text-sm text-depot-700/40">Nobody linked yet.</p>}
              {fromJourney.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-depot-700/5 last:border-0">
                  <span className={p.active ? '' : 'text-depot-700/40 line-through'}>{p.name}</span>
                  <span className="text-xs text-depot-700/60 text-right">{[p.position, p.department].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
            </section>

            <p className="text-xs text-depot-700/60 pt-2">Older entries added here in Wheels (until everyone is in LHG Journey):</p>

            <PeopleSection title="Drivers" people={drivers} isAdmin={isAdmin} onToggle={toggleActive}>
              {isAdmin && (
                <AddForm
                  value={newDriverName}
                  onChange={setNewDriverName}
                  onAdd={() => addPerson('driver', newDriverName, setNewDriverName)}
                  placeholder="New driver name"
                />
              )}
            </PeopleSection>

            <PeopleSection title="Foremen" people={foremen} isAdmin={isAdmin} onToggle={toggleActive}>
              {isAdmin && (
                <AddForm
                  value={newForemanName}
                  onChange={setNewForemanName}
                  onAdd={() => addPerson('foreman', newForemanName, setNewForemanName)}
                  placeholder="New foreman name"
                />
              )}
            </PeopleSection>

            <PeopleSection title="Loaders" people={loaders} isAdmin={isAdmin} onToggle={toggleActive}>
              {isAdmin && (
                <AddForm
                  value={newLoaderName}
                  onChange={setNewLoaderName}
                  onAdd={() => addPerson('loader', newLoaderName, setNewLoaderName)}
                  placeholder="New loader name"
                />
              )}
            </PeopleSection>

            {!isAdmin && (
              <p className="text-xs text-depot-700/50 text-center">
                Only admin accounts can add or deactivate people.
              </p>
            )}
          </>
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

function PeopleSection({ title, people, isAdmin, onToggle, children }) {
  return (
    <section className="bg-white rounded-xl p-5 shadow-sm border border-depot-700/10">
      <h2 className="font-display font-semibold text-depot-900 mb-3">{title}</h2>
      {people.length === 0 && <p className="text-sm text-depot-700/40 mb-3">Nobody added yet.</p>}
      {people.map((p) => (
        <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-depot-700/5 last:border-0">
          <span className={p.active ? '' : 'text-depot-700/40 line-through'}>{p.name}</span>
          {isAdmin && (
            <button
              onClick={() => onToggle(p)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                p.active ? 'bg-flag-light text-flag' : 'bg-bonus-light text-bonus'
              }`}
            >
              {p.active ? 'Deactivate' : 'Reactivate'}
            </button>
          )}
        </div>
      ))}
      {children}
    </section>
  );
}

function AddForm({ value, onChange, onAdd, placeholder }) {
  return (
    <div className="flex gap-2 mt-3">
      <input value={value} onChange={(e) => onChange(e.target.value)} className="input flex-1" placeholder={placeholder} />
      <button onClick={onAdd} className="bg-route text-white text-sm font-medium px-3 rounded-lg">Add</button>
    </div>
  );
}
