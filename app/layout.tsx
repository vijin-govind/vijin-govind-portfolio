import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Inter carries the Helvetica-adjacent neutrality the layout depends on, and
// the variable cut keeps the hero's optical weight right at display sizes.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Vijin Govind — Product Designer",
  description:
    'I design experiences. Sometimes digital, sometimes physical, sometimes cinematic — but always designed with intention. Product Designer in Bangalore, India.',
  openGraph: {
    title: 'Vijin Govind — Product Designer',
    description: 'An interactive portfolio. Pull the cord.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  // The cord is a drag surface; letting the page pinch-zoom under it turns
  // every pull on a touch device into an accidental zoom.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
