'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'LHG Wheels Home' },
  { href: '/people', label: 'Team Roster' },
  { href: '/rewards', label: 'Rewards (reference)' },
];

export default function NavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="text-paper text-2xl leading-none px-1 hover:opacity-70"
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-64 max-w-[80%] bg-depot-900 h-full p-5 flex flex-col gap-1 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <span className="font-display text-paper font-bold text-lg">LHG Wheels</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-depot-100/70 text-2xl leading-none">
                ×
              </button>
            </div>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  pathname === item.href
                    ? 'bg-route text-white'
                    : 'text-depot-100/80 hover:bg-depot-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
