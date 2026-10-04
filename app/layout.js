import './globals.css';
import AuthGate from '@/components/AuthGate';

export const metadata = {
  title: 'LHG Wheels — Dispatch',
  description: 'Log deliveries and flag errors. Rewards live in LHG Journey.',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* Checks every page: logged in? allowed to use Wheels? */}
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
