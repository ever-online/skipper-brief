"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REGIONS } from "@/lib/regions";
import type { BoatType, BoatSizeRange, ForecastRequest } from "@/types";

const BOAT_TYPES: { id: BoatType; label: string; icon: string; note: string }[] = [
  { id: "sailing", label: "Sailing Yacht", icon: "⛵", note: "Wind, waves & tides — the full brief" },
  { id: "motor", label: "Motor Yacht", icon: "🛥️", note: "Optimised for power vessel routing" },
  { id: "motorboat", label: "Motorboat", icon: "🚤", note: "Sheltered water focus, short range" },
  { id: "rib", label: "RIB / Speedboat", icon: "🏄", note: "Wave & wind limits for small craft" },
];

const BOAT_SIZES: { id: BoatSizeRange; label: string; loa: string; note: string }[] = [
  { id: "micro", label: "Micro", loa: "< 6 m", note: "Dinghy, day sailor, small RIB" },
  { id: "small", label: "Small", loa: "6–9 m", note: "Trailer sailor, coastal cruiser" },
  { id: "medium", label: "Medium", loa: "9–14 m", note: "Blue-water cruiser, day charter" },
  { id: "large", label: "Large", loa: "14–20 m", note: "Offshore cruiser, charter yacht" },
  { id: "xlarge", label: "X-Large", loa: "20–30 m", note: "Superyacht, large motor vessel" },
];

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              i + 1 < step
                ? "bg-cyan-600 text-white"
                : i + 1 === step
                ? "bg-cyan-500 text-white ring-2 ring-cyan-400/30"
                : "bg-slate-800 text-slate-500"
            }`}
          >
            {i + 1 < step ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-12 ${i + 1 < step ? "bg-cyan-600" : "bg-slate-800"}`} />
          )}
        </div>
      ))}
      <span className="ml-3 text-sm text-slate-500">Step {step} of {total}</span>
    </div>
  );
}

function Step1Boat({
  boatType, boatSize, onNext, onChange,
}: {
  boatType: BoatType | null;
  boatSize: BoatSizeRange | null;
  onNext: () => void;
  onChange: (type: BoatType | null, size: BoatSizeRange | null) => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Your vessel</h2>
      <p className="text-slate-400 mb-6">We tailor the forecast to your boat type and size.</p>

      <div className="mb-6">
        <label className="block text-sm font-semibold text-slate-300 mb-3">Boat type</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BOAT_TYPES.map((bt) => (
            <button
              key={bt.id}
              onClick={() => onChange(bt.id, boatSize)}
              className={`p-4 rounded-xl border text-left transition-all ${
                boatType === bt.id
                  ? "border-cyan-500 bg-cyan-950/50 ring-1 ring-cyan-500/30"
                  : "border-slate-700 bg-slate-900 hover:border-slate-500"
              }`}
            >
              <div className="text-2xl mb-2">{bt.icon}</div>
              <div className="font-semibold text-sm text-white">{bt.label}</div>
              <div className="text-xs text-slate-500 mt-1">{bt.note}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-semibold text-slate-300 mb-3">Boat size (LOA)</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {BOAT_SIZES.map((bs) => (
            <button
              key={bs.id}
              onClick={() => onChange(boatType, bs.id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                boatSize === bs.id
                  ? "border-cyan-500 bg-cyan-950/50 ring-1 ring-cyan-500/30"
                  : "border-slate-700 bg-slate-900 hover:border-slate-500"
              }`}
            >
              <div className="font-bold text-cyan-400 text-sm">{bs.loa}</div>
              <div className="font-semibold text-sm text-white mt-1">{bs.label}</div>
              <div className="text-xs text-slate-500 mt-1">{bs.note}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!boatType || !boatSize}
        className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all"
      >
        Continue →
      </button>
    </div>
  );
}

type LocationMode = "region" | "route";

function Step2Location({
  regionId, startLocation, endLocation, onNext, onBack, onChange,
}: {
  regionId: string | null;
  startLocation: string;
  endLocation: string;
  onNext: () => void;
  onBack: () => void;
  onChange: (regionId: string | null, start: string, end: string) => void;
}) {
  const [mode, setMode] = useState<LocationMode>(startLocation ? "route" : "region");
  const canContinue = mode === "region" ? !!regionId : startLocation.trim().length > 1;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Where are you sailing?</h2>
      <p className="text-slate-400 mb-6">Pick a sailing area or enter your route.</p>

      <div className="flex gap-2 mb-6 bg-slate-900 p-1 rounded-lg w-fit">
        <button
          onClick={() => setMode("region")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            mode === "region" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          Sailing area
        </button>
        <button
          onClick={() => setMode("route")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            mode === "route" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          From → To
        </button>
      </div>

      {mode === "region" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => onChange(r.id, "", "")}
              className={`p-4 rounded-xl border text-left transition-all ${
                regionId === r.id
                  ? "border-cyan-500 bg-cyan-950/50 ring-1 ring-cyan-500/30"
                  : "border-slate-700 bg-slate-900 hover:border-slate-600"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-white text-sm">{r.name}</div>
                  {r.nameDutch && <div className="text-xs text-slate-500 mt-0.5">{r.nameDutch}</div>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${
                  r.tidalImportance === "high"
                    ? "border-amber-700 text-amber-400"
                    : r.tidalImportance === "medium"
                    ? "border-blue-700 text-blue-400"
                    : "border-slate-700 text-slate-400"
                }`}>
                  {r.tidalImportance === "high" ? "Strong tides" : r.tidalImportance === "medium" ? "Tidal" : "Non-tidal"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2 line-clamp-2">{r.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Departure port / anchorage</label>
            <input
              type="text"
              placeholder="e.g. IJmuiden, Den Helder, Hoek van Holland"
              value={startLocation}
              onChange={(e) => onChange(null, e.target.value, endLocation)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Destination (optional)</label>
            <input
              type="text"
              placeholder="e.g. Terschelling, Harlingen, Hamburg"
              value={endLocation}
              onChange={(e) => onChange(null, startLocation, e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <p className="text-xs text-slate-600">
            We determine the forecast region based on your departure location.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="px-6 py-3 border border-slate-700 hover:border-slate-500 text-slate-300 rounded-xl transition-all">
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!canContinue}
          className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function Step3Pay({ request, onBack }: { request: ForecastRequest; onBack: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const region = REGIONS.find((r) => r.id === request.regionId);
  const routeLabel = region?.name ?? `${request.startLocation} → ${request.endLocation || "destination"}`;
  const boatTypeLabel = BOAT_TYPES.find((b) => b.id === request.boatType)?.label ?? request.boatType;
  const boatSizeObj = BOAT_SIZES.find((b) => b.id === request.boatSize);

  async function handlePay() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await res.json() as { sessionId?: string; error?: string };
      if (!res.ok || !data.sessionId) {
        setError(data.error ?? `Checkout failed (${res.status})`);
        return;
      }
      router.push(`/checkout/${data.sessionId}`);
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Your forecast brief</h2>
      <p className="text-slate-400 mb-6">Review your order and pay €0.50 to receive your PDF report.</p>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Area / Route</div>
            <div className="text-white font-semibold">{routeLabel}</div>
            {region && <div className="text-xs text-slate-500 mt-1">{region.description}</div>}
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Vessel</div>
            <div className="text-white font-semibold">{boatTypeLabel}</div>
            <div className="text-xs text-slate-500 mt-1">{boatSizeObj?.loa} — {boatSizeObj?.note}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Forecast period</div>
            <div className="text-white font-semibold">3 days detailed + 4-day outlook</div>
            <div className="text-xs text-slate-500 mt-1">Hourly wind, waves, tides, currents</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Report includes</div>
            <div className="text-sm text-slate-300 space-y-0.5">
              <div>✓ Wind · direction · Beaufort (kts)</div>
              <div>✓ Waves, swell height &amp; period</div>
              <div>✓ Tidal events (HW/LW times &amp; heights)</div>
              <div>✓ Ocean currents</div>
              <div>✓ Shipping &amp; waterway notices</div>
              <div>✓ AI-written passage briefing</div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-700 mt-6 pt-6 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-3xl font-bold text-white">
              €0.50 <span className="text-sm text-slate-500 font-normal">EURD</span>
            </div>
          </div>
          <div className="text-xs text-slate-600 text-right">
            One-time payment<br />No account required
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="text-xs text-slate-500 mb-2 font-mono font-bold">Agent / MCP access</div>
        <code className="text-xs text-cyan-300 block break-all">
          {`GET /api/forecast?region=${request.regionId ?? "dutch-north-sea"}&boatType=${request.boatType}&boatSize=${request.boatSize}`}
        </code>
        <p className="text-xs text-slate-600 mt-2">
          Claude, ChatGPT or any x402-enabled agent can purchase this report automatically — no human required.
        </p>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 mb-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-slate-700 hover:border-slate-500 text-slate-300 rounded-xl transition-all"
        >
          ← Back
        </button>
        <button
          onClick={handlePay}
          disabled={loading}
          className="flex-1 sm:flex-none px-10 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-lg"
        >
          {loading ? "Creating payment…" : "Pay €0.50 with EURD →"}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [step, setStep] = useState(1);
  const [boatType, setBoatType] = useState<BoatType | null>(null);
  const [boatSize, setBoatSize] = useState<BoatSizeRange | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");

  const forecastRequest: ForecastRequest | null =
    boatType && boatSize
      ? {
          boatType,
          boatSize,
          regionId: regionId ?? undefined,
          startLocation: startLocation || undefined,
          endLocation: endLocation || undefined,
        }
      : null;

  return (
    <div className="max-w-4xl mx-auto">
      {step === 1 && (
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-cyan-950/50 border border-cyan-800/50 rounded-full px-3 py-1 text-xs text-cyan-400 mb-4">
            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
            Live marine weather · European waters
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            Your passage plan,<br />
            <span className="text-cyan-400">in seconds.</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mb-4">
            SkipperBrief delivers a tailored sailing weather report — wind in knots, waves, tides,
            currents and shipping notices — as a professional PDF. Just €0.50, paid with EURD.
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-500">
            <span>⛵ Sailing yachts &amp; motor boats</span>
            <span>🌊 North Sea · Baltic · Mediterranean</span>
            <span>🤖 AI-readable via x402</span>
          </div>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <StepIndicator step={step} total={3} />

        {step === 1 && (
          <Step1Boat
            boatType={boatType}
            boatSize={boatSize}
            onChange={(t, s) => { setBoatType(t); setBoatSize(s); }}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2Location
            regionId={regionId}
            startLocation={startLocation}
            endLocation={endLocation}
            onChange={(r, start, end) => {
              setRegionId(r);
              setStartLocation(start);
              setEndLocation(end);
            }}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && forecastRequest && (
          <Step3Pay request={forecastRequest} onBack={() => setStep(2)} />
        )}
      </div>

      {step === 1 && (
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: "🌬️", title: "Wind & Weather", body: "Hourly wind speed in knots, direction, gusts and Beaufort scale. Colour-coded for safe / caution / danger." },
            { icon: "🌊", title: "Waves & Swell", body: "Wave height, period and direction. Swell data from open ocean. Critical for blue-water passages." },
            { icon: "🌒", title: "Tides & Currents", body: "High/low water times and heights. Ocean current speed and direction. Timed for your departure." },
            { icon: "📡", title: "Shipping Notices", body: "Latest waterway and navigation alerts from Rijkswaterstaat and national coastguards." },
            { icon: "🤖", title: "AI Briefing", body: "A readable passage brief written by Claude — go/no-go, timing advice, hazards. Like a proper marine forecaster." },
            { icon: "⚡", title: "x402 Agent-Ready", body: "Any AI agent with EURD can buy this report with one API call. No login, no friction." },
          ].map((card) => (
            <div key={card.title} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <div className="text-2xl mb-2">{card.icon}</div>
              <div className="font-semibold text-white text-sm mb-1">{card.title}</div>
              <div className="text-xs text-slate-500">{card.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
