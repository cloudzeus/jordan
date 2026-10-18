import type { Metadata, Viewport } from 'next';
import { ConfirmHost } from '@/components/ui/confirm-dialog';
import { Commissioner, Inter, Manrope, Noto_Serif_Display } from 'next/font/google';
import './globals.css';
import { appUrl } from '@/lib/app-url';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext', 'greek'],
  display: 'swap',
});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

// Δημόσιο website (μόνο κάτω από `.site`): τίτλοι σε Commissioner Light (σχεδιασμένη με σωστά ελληνικά)·
// η κομψή serif ΜΟΝΟ για αριθμούς και το λατινικό λογότυπο (ύφος Porcelanosa).
const siteSans = Commissioner({
  variable: '--font-site',
  subsets: ['latin', 'greek'],
  weight: ['300', '400', '500'],
  display: 'swap',
});
const siteSerif = Noto_Serif_Display({
  variable: '--font-num',
  subsets: ['latin', 'greek'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  // Τελική δημόσια διεύθυνση (lib/app-url.ts): απόλυτα URL για OG/canonical/εικόνες.
  metadataBase: new URL(appUrl()),
  title: { default: 'DGEspa', template: '%s · DGEspa' },
  description: 'DGEspa — διαχείριση και ροές εργασίας ΕΣΠΑ.',
};

export const viewport: Viewport = {
  themeColor: '#2563EB',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el" suppressHydrationWarning className={`${inter.variable} ${manrope.variable} ${siteSans.variable} ${siteSerif.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <ConfirmHost />
        <Toaster
          position="top-right"
          toastOptions={{
            className: '!rounded-xl !border !border-border !bg-card !text-foreground !shadow-pop !text-[length:var(--fs-13)]',
          }}
        />
      </body>
    </html>
  );
}
