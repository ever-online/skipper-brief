"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import type { OrderStatus, ForecastRequest } from "@/types";
import { REGIONS } from "@/lib/regions";

interface StatusResponse {
  status: OrderStatus;
  forecastRequest: ForecastRequest;
  amount: number;
  paidAt?: string;
  downloadToken?: string;
}

interface SessionResponse {
  forecastRequest?: ForecastRequest;
  amount?: number;
  status?: OrderStatus;
  qrCodeString?: string;
  shareableLink?: string;
  error?: string;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, string> = {
    pending: "bg-amber-950 text-amber-300 border-amber-700",
    paid: "bg-emerald-950 text-emerald-300 border-emerald-700",
    failed: "bg-red-950 text-red-300 border-red-700",
    expired: "bg-slate-800 text-slate-400 border-slate-700",
  };
  const labels: Record<OrderStatus, string> = {
    pending: "Awaiting payment",
    paid: "Payment confirmed",
    failed: "Payment failed",
    expired: "Payment expired",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {status === "paid" && <span>✓</span>}
      {status === "pending" && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
      {labels[status]}
    </span>
  );
}

export default function CheckoutPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [qr, setQr] = useState<{ qrCodeString: string; shareableLink: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const statusRef = useRef<OrderStatus | null>(null);

  useEffect(() => {
    fetch(`/api/session/${sessionId}`)
      .then((r) => r.json())
      .then((d: SessionResponse) => {
        if (d.error) setError(d.error);
        else setQr({ qrCodeString: d.qrCodeString ?? "", shareableLink: d.shareableLink ?? "" });
      })
      .catch(() => setError("Failed to load payment details"));
  }, [sessionId]);

  const poll = useCallback(() => {
    fetch(`/api/status/${sessionId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: StatusResponse | null) => {
        if (d) {
          statusRef.current = d.status;
          setData(d);
        }
      })
      .catch(() => {/* silent */});
  }, [sessionId]);

  useEffect(() => {
    poll();
    const interval = setInterval(() => {
      const s = statusRef.current;
      if (s === "paid" || s === "failed" || s === "expired") clearInterval(interval);
      else poll();
    }, 5000);
    return () => clearInterval(interval);
  }, [poll]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/download/${sessionId}`);
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        alert(err.error ?? "Download failed — please try again");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const regionSlug = data?.forecastRequest?.regionId ?? "passage";
      a.download = `skipperbrief-${regionSlug}-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadStarted(true);
    } catch {
      alert("Download failed — please try again");
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error}</p>
        <a href="/" className="text-cyan-400 text-sm hover:underline">← Back to SkipperBrief</a>
      </div>
    );
  }

  const req = data?.forecastRequest;
  const region = req?.regionId ? REGIONS.find((r) => r.id === req.regionId) : null;
  const routeLabel = region?.name ?? (req?.startLocation ? `${req.startLocation} → ${req.endLocation || "destination"}` : "Loading…");

  return (
    <div className="max-w-lg mx-auto">
      <a href="/" className="text-slate-500 text-sm hover:text-slate-300 transition-colors mb-8 inline-block">
        ← Back to SkipperBrief
      </a>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-xl font-bold text-white">Sailing Forecast Brief</h1>
          {data && <StatusBadge status={data.status} />}
        </div>

        <p className="text-cyan-400 font-bold mb-1">{routeLabel}</p>
        <p className="text-slate-500 text-sm mb-6">
          {data?.amount != null ? `€${data.amount.toFixed(2)} EURD` : "—"}
        </p>

        {(!data || data.status === "pending") && (
          <div>
            {qr?.shareableLink ? (
              <div className="flex flex-col items-center">
                <p className="text-slate-400 text-sm mb-4 text-center">
                  Scan with the <strong className="text-white">EURD Wallet</strong> app to pay
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=224x224&data=${encodeURIComponent(qr.shareableLink)}&bgcolor=0F172A&color=ffffff&qzone=1`}
                  alt="EURD payment QR code"
                  className="w-56 h-56 rounded-xl border border-slate-700"
                />
                <a
                  href={qr.shareableLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 text-sm text-cyan-400 hover:underline"
                >
                  Open payment page →
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <p className="text-slate-600 text-xs text-center mt-6 animate-pulse">
              Waiting for payment confirmation…
            </p>
          </div>
        )}

        {data?.status === "paid" && (
          <div>
            <p className="text-slate-400 text-sm mt-2 mb-6">
              Payment confirmed. Your SkipperBrief is being compiled — wind, waves, tides, currents and an AI-written passage briefing. This takes 10–30 seconds.
            </p>

            {!downloadStarted ? (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 disabled:cursor-wait text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {downloading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating report…
                  </>
                ) : (
                  <>📄 Download PDF Report</>
                )}
              </button>
            ) : (
              <div className="text-center">
                <p className="text-emerald-400 text-sm mb-4">✓ Report downloaded!</p>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="text-slate-400 text-sm hover:text-white underline"
                >
                  Download again
                </button>
                <div className="mt-4">
                  <a href="/" className="text-cyan-400 text-sm hover:underline">← Get another brief</a>
                </div>
              </div>
            )}
          </div>
        )}

        {(data?.status === "failed" || data?.status === "expired") && (
          <div>
            <p className="text-slate-400 text-sm mt-4 mb-6">
              The payment {data.status}. Please try again.
            </p>
            <a
              href="/"
              className="block w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl text-center transition-colors"
            >
              ← Start again
            </a>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-600">
            Payment secured by Quantoz · MiCA-compliant EURD stablecoin
          </p>
        </div>
      </div>
    </div>
  );
}
