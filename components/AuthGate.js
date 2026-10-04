'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { canUseWheels } from '@/lib/access';

// Wraps every page. Not logged in -> login page. Logged in but not allowed -> "no access".
export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const open = pathname === '/login' || pathname === '/';
  const [state, setState] = useState(open ? 'ok' : 'checking');

  useEffect(() => {
    if (open) { setState('ok'); return; }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { router.replace('/login'); return; }
      setState(canUseWheels(user) ? 'ok' : 'denied');
    })();
    return () => { cancelled = true; };
  }, [pathname, open, router]);

  if (state === 'checking') {
    return <div className="min-h-screen flex items-center justify-center bg-paper"><p className="text-depot-700 font-body">Loading LHG Wheels…</p></div>;
  }
  if (state === 'denied') {
    return (
      <div className="min-h-screen bg-depot-900 flex items-center justify-center px-4">
        <div className="bg-paper rounded-xl p-6 shadow-xl max-w-sm w-full text-center">
          <h1 className="font-display text-xl font-bold text-depot-900">No access to LHG Wheels</h1>
          <p className="text-sm text-depot-700 mt-2">Your login hasn’t been given access to LHG Wheels. If you need it, please ask Liau.</p>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
            className="mt-5 w-full bg-route text-white font-medium py-2.5 rounded-lg"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }
  return children;
}
