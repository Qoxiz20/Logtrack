'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/dashboard' : '/login');
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <p className="text-depot-700 font-body">Loading LogTrack…</p>
    </div>
  );
}
