import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { store } from "@/lib/store";
import { generateForecastPdf } from "@/lib/report";
import { getRegion, getDefaultRegion } from "@/lib/regions";
import { fetchMarineWeather, deriveTidalEvents } from "@/lib/weather";
import { fetchShippingNotices } from "@/lib/vaarweg";
import type { WeatherData } from "@/types";

const CACHE_DIR = join(process.cwd(), "data", "pdf-cache");

function cachedPath(sessionId: string) {
  return join(CACHE_DIR, `${sessionId}.pdf`);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const order = store.get(sessionId);

  if (!order || order.status !== "paid") {
    return NextResponse.json({ error: "Not found or not paid" }, { status: 404 });
  }

  const path = cachedPath(sessionId);

  let pdf: Buffer;
  if (existsSync(path)) {
    pdf = readFileSync(path);
  } else {
    try {
      const forecastReq = order.forecastRequest;
      const region = getRegion(forecastReq.regionId ?? "") ?? getDefaultRegion();

      const hourly = await fetchMarineWeather(region);
      const tides = deriveTidalEvents(region, hourly);
      const notices = await fetchShippingNotices(region.country);

      const weatherData: WeatherData = {
        region,
        hourly,
        tides,
        notices,
        generatedAt: new Date().toISOString(),
      };

      pdf = await generateForecastPdf(forecastReq, weatherData);
    } catch (err) {
      console.error("Report generation failed:", err);
      return NextResponse.json({ error: "Report generation failed" }, { status: 502 });
    }
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(path, pdf);
  }

  const date = new Date().toISOString().split("T")[0];
  const regionSlug = order.forecastRequest.regionId ?? "passage";
  const filename = `skipperbrief-${regionSlug}-${date}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
