import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Amendment 5: "Remember me" at login.
// If checked (default): session is kept in localStorage -> survives closing the browser,
// so you stay logged in next time you open the app.
// If unchecked: session is kept in sessionStorage -> cleared when the tab/browser closes.
// Note: this remembers your SIGNED-IN SESSION, not your raw password — that's the safe
// way to avoid retyping your login every time.
const rememberAwareStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null;
    const remember = window.localStorage.getItem('logtrack-remember') !== 'false';
    return remember ? window.localStorage.getItem(key) : window.sessionStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return;
    const remember = window.localStorage.getItem('logtrack-remember') !== 'false';
    if (remember) {
      window.localStorage.setItem(key, value);
    } else {
      window.sessionStorage.setItem(key, value);
    }
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: rememberAwareStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
