import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkipperBrief — Sailing Weather Forecast",
  description:
    "Professional sailing forecasts for European waters. Wind, waves, tides and currents. Pay €0.50 with EURD and get your PDF passage plan in seconds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚓</span>
              <div>
                <span className="text-white font-bold text-lg tracking-tight">SkipperBrief</span>
                <span className="text-slate-500 text-xs ml-2 hidden sm:inline">Marine Weather · Passage Planning</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 border border-slate-700 rounded px-2 py-1 hidden sm:inline">
                Powered by EURD · x402
              </span>
              <span className="text-xs font-bold text-cyan-400 border border-cyan-800 rounded px-2 py-1">
                €0.50 / report
              </span>
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">{children}</main>
        <footer className="border-t border-slate-800 mt-20">
          <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <span>SkipperBrief by Quantoz Payments B.V. — MiCA-compliant EURD stablecoin</span>
            <div className="flex gap-4">
              <a href="https://quantozpay.com" className="hover:text-slate-400 transition-colors">quantozpay.com</a>
              <a href="/api/forecast?region=dutch-north-sea" className="hover:text-slate-400 transition-colors font-mono">
                GET /api/forecast
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
