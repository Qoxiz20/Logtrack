import './globals.css';

export const metadata = {
  title: 'LogTrack — Dispatch & Rewards',
  description: 'Log deliveries, flag errors, track driver rewards.',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
