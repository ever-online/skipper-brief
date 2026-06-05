import Anthropic from "@anthropic-ai/sdk";
import type { WeatherData, ForecastRequest, HourlyWeather } from "@/types";
import { beaufortNumber, beaufortDescription, compassPoint, wmoDescription } from "./weather";

function boatTypeLabel(t: string): string {
  switch (t) {
    case "sailing": return "sailing yacht";
    case "motor": return "motor yacht";
    case "motorboat": return "motorboat";
    case "rib": return "RIB / speedboat";
    default: return t;
  }
}

function boatSizeLabel(s: string): string {
  switch (s) {
    case "micro": return "under 6 m";
    case "small": return "6–9 m";
    case "medium": return "9–14 m";
    case "large": return "14–20 m";
    case "xlarge": return "20–30 m";
    default: return s;
  }
}

function summariseDay(hours: HourlyWeather[]): string {
  const winds = hours.map((h) => h.windSpeed);
  const gusts = hours.map((h) => h.windGust);
  const waves = hours.map((h) => h.waveHeight);
  const avgWind = winds.reduce((a, b) => a + b, 0) / winds.length;
  const maxWind = Math.max(...winds);
  const maxGust = Math.max(...gusts);
  const maxWave = Math.max(...waves);
  const directions = hours.map((h) => compassPoint(h.windDirection));
  const dominantDir = directions.sort((a, b) =>
    directions.filter((d) => d === b).length - directions.filter((d) => d === a).length
  )[0];
  const bf = beaufortNumber(avgWind);
  const bfDesc = beaufortDescription(avgWind);
  const code = hours[Math.floor(hours.length / 2)]?.weatherCode ?? 0;

  return (
    `${wmoDescription(code)}, wind ${dominantDir} avg ${avgWind.toFixed(0)} kts (Bft ${bf}, ${bfDesc}), ` +
    `gusts to ${maxGust.toFixed(0)} kts, max ${maxWind.toFixed(0)} kts. ` +
    `Waves up to ${maxWave.toFixed(1)} m.`
  );
}

function buildPrompt(req: ForecastRequest, data: WeatherData, today: string): string {
  // Group hours by day (first 3 days)
  const hoursByDay: Map<string, HourlyWeather[]> = new Map();
  for (const h of data.hourly) {
    const day = h.time.split("T")[0];
    const arr = hoursByDay.get(day) ?? [];
    arr.push(h);
    hoursByDay.set(day, arr);
  }
  const days = [...hoursByDay.entries()].slice(0, 5);

  const location = req.regionId
    ? data.region.name
    : `${req.startLocation ?? "start"} → ${req.endLocation ?? "destination"}`;

  const daySummaries = days
    .map(([day, hours], i) => {
      const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : day;
      return `  ${label} (${day}): ${summariseDay(hours)}`;
    })
    .join("\n");

  const tidalNote = data.tides.length > 0
    ? `Tidal events (next 3 days): ${data.tides.slice(0, 12).map((t) =>
        `${t.type.toUpperCase()} ${new Date(t.time).toLocaleDateString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })} ${t.heightM}m`
      ).join(" | ")}`
    : "Area has negligible tidal range.";

  const noticeNote = data.notices.slice(0, 3).map((n) => `- [${n.severity.toUpperCase()}] ${n.title}: ${n.description}`).join("\n");

  return `You are a professional marine meteorologist and passage-planning expert based in the Netherlands. Write a concise, practical sailing briefing for the following trip:

**Vessel:** ${boatTypeLabel(req.boatType)}, ${boatSizeLabel(req.boatSize)}
**Area/Route:** ${location}
**Date:** ${today}

**Raw forecast data:**
${daySummaries}

**Tidal information:**
${tidalNote}

**Shipping/waterway notices:**
${noticeNote || "None on record."}

Write the briefing in the following structure (use markdown headers):

## Executive Summary
3–4 sentences. Is it safe to go? What is the dominant weather feature? Any go/no-go recommendation for each day?

## Day-by-Day Forecast

### Day 1 — [date]
### Day 2 — [date]
### Day 3 — [date]

For each day include: wind direction and force (Beaufort + knots range), sea state, visibility, any hazards. Tailor advice to the boat type and size.

## Tidal Briefing
Key tidal considerations for this area. When are the critical windows for this route/region?

## Passage Advice
2–3 bullet points of specific practical advice (departure timing, waypoints to avoid, VHF channels to monitor, etc.).

## Extended Outlook (Day 4–7)
2–3 sentences on the broader pattern.

Tone: authoritative, safety-first, like a KNMI or Met Office marine briefing. Be specific and numerical. No preamble. Under 700 words total.`;
}

export async function generateSailingBrief(
  req: ForecastRequest,
  data: WeatherData
): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const prompt = buildPrompt(req, data, today);

  const anthropic = new Anthropic();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: "You are an expert marine meteorologist. Respond in clean markdown. Be precise and practical.",
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text from Claude");
  return block.text;
}
