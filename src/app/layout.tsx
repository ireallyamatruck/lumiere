import type { Metadata } from 'next';
import './globals.css';
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
  title: 'Lumière — Browse Cinema by Colour',
  description: 'Discover films and series through the colour of their posters.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}