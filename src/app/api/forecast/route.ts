// x402-compatible forecast endpoint
// GET /api/forecast?region=dutch-north-sea&boatType=sailing&boatSize=medium
// Returns 402 if no X-PAYMENT header, otherwise generates and returns PDF

import { NextRequest, NextResponse } from "next/server";
import { build402Body, verifyProof } from "@/lib/x402";
import { generateForecastPdf } from "@/lib/report";
import { getRegion, getDefaultRegion } from "@/lib/regions";
import { fetchMarineWeather, deriveTidalEvents } from "@/lib/weather";
import { fetchShippingNotices } from "@/lib/vaarweg";
import type { ForecastRequest, WeatherData } from "@/types";

const REPORT_PRICE = 0.50;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const regionId = searchParams.get("region") ?? "dutch-north-sea";
  const boatType = (searchParams.get("boatType") ?? "sailing") as ForecastRequest["boatType"];
  const boatSize = (searchParams.get("boatSize") ?? "medium") as ForecastRequest["boatSize"];
  const startLocation = searchParams.get("from") ?? undefined;
  const endLocation = searchParams.get("to") ?? undefined;

  const xPayment = req.headers.get("x-payment");

  // No payment → issue 402 challenge
  if (!xPayment) {
    let body: object;
    try {
      body = await build402Body(
        "sailing-forecast",
        REPORT_PRICE,
        `SkipperBrief sailing forecast — ${regionId}`
      );
    } catch (err) {
      console.error("Failed to create 402 challenge:", err);
      return NextResponse.json({ error: "Could not create payment request" }, { status: 503 });
    }
    return NextResponse.json(body, { status: 402 });
  }

  // Verify payment
  const verification = await verifyProof(xPayment, {
    amount: REPORT_PRICE,
    resource: "sailing-forecast",
  });
  if (!verification.ok) {
    return NextResponse.json(
      { x402Version: 2, error: verification.reason },
      { status: 402 }
    );
  }

  // Generate forecast
  try {
    const region = getRegion(regionId) ?? getDefaultRegion();

    const forecastReq: ForecastRequest = {
      boatType,
      boatSize,
      regionId,
      startLocation,
      endLocation,
    };

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

    const pdf = await generateForecastPdf(forecastReq, weatherData);
    const date = new Date().toISOString().split("T")[0];
    const filename = `skipperbrief-${regionId}-${date}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Payment-Receipt": verification.receipt,
      },
    });
  } catch (err) {
    console.error("Forecast generation failed:", err);
    return NextResponse.json({ error: "Forecast generation failed" }, { status: 502 });
  }
}
