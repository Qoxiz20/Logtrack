'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Must be set BEFORE signInWithPassword so the session gets stored in the right place
    window.localStorage.setItem('logtrack-remember', remember ? 'true' : 'false');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="min-h-screen bg-depot-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl text-paper font-bold tracking-tight">LogTrack</h1>
          <p className="text-depot-100/70 text-sm mt-1">Dispatch logging & driver rewards</p>
        </div>

        <form onSubmit={handleLogin} className="bg-paper rounded-xl p-6 shadow-xl">
          <label className="block text-sm font-medium text-depot-800 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 px-3 py-2 rounded-lg border border-depot-700/20 focus:outline-none focus:ring-2 focus:ring-route"
            placeholder="you@company.com"
          />

          <label className="block text-sm font-medium text-depot-800 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-4 px-3 py-2 rounded-lg border border-depot-700/20 focus:outline-none focus:ring-2 focus:ring-route"
            placeholder="••••••••"
          />

          <label className="flex items-center gap-2 text-sm text-depot-700 mb-4">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me on this device
          </label>

          {error && <p className="text-flag text-sm mb-3">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-route text-white font-medium py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-depot-100/50 text-xs text-center mt-4">
          Dispatcher accounts are created in Supabase, not self-signup.
        </p>
      </div>
    </div>
  );
}
