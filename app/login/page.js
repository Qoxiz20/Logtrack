'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { phoneToLoginId } from '@/lib/access';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
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
    // People type their phone number; it's turned into their hidden login ID.
    const { error } = await supabase.auth.signInWithPassword({ email: phoneToLoginId(phone), password });
    setLoading(false);
    if (error) {
      setError('Wrong phone number or password. Please try again.');
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="min-h-screen bg-depot-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl text-paper font-bold tracking-tight">LHG Wheels</h1>
          <p className="text-depot-100/70 text-sm mt-1">Dispatch logging</p>
        </div>

        <form onSubmit={handleLogin} className="bg-paper rounded-xl p-6 shadow-xl">
          <label className="block text-sm font-medium text-depot-800 mb-1">Phone number</label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="username"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full mb-4 px-3 py-2 rounded-lg border border-depot-700/20 focus:outline-none focus:ring-2 focus:ring-route"
            placeholder="012-345 6789"
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
          Accounts are created by Admin. Use the same phone number and password as LHG Journey.
        </p>
      </div>
    </div>
  );
}
