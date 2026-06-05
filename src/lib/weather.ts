import type { HourlyWeather, TidalEvent, Region } from "@/types";

// Beaufort wind descriptions
function beaufortDescription(kts: number): string {
  if (kts < 1) return "Calm";
  if (kts < 4) return "Light air";
  if (kts < 7) return "Light breeze";
  if (kts < 11) return "Gentle breeze";
  if (kts < 17) return "Moderate breeze";
  if (kts < 22) return "Fresh breeze";
  if (kts < 28) return "Strong breeze";
  if (kts < 34) return "Near gale";
  if (kts < 41) return "Gale";
  if (kts < 48) return "Strong gale";
  if (kts < 56) return "Storm";
  if (kts < 64) return "Violent storm";
  return "Hurricane";
}

function beaufortNumber(kts: number): number {
  if (kts < 1) return 0;
  if (kts < 4) return 1;
  if (kts < 7) return 2;
  if (kts < 11) return 3;
  if (kts < 17) return 4;
  if (kts < 22) return 5;
  if (kts < 28) return 6;
  if (kts < 34) return 7;
  if (kts < 41) return 8;
  if (kts < 48) return 9;
  if (kts < 56) return 10;
  if (kts < 64) return 11;
  return 12;
}

export { beaufortDescription, beaufortNumber };

function compassPoint(degrees: number): string {
  const pts = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return pts[Math.round(degrees / 22.5) % 16];
}

export { compassPoint };

// WMO weather code → human description
function wmoDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 84) return "Snow showers";
  if (code <= 86) return "Heavy snow showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

export { wmoDescription };

interface OpenMeteoMarineResponse {
  hourly: {
    time: string[];
    wave_height?: number[];
    wave_direction?: number[];
    wave_period?: number[];
    wind_wave_height?: number[];
    wind_wave_period?: number[];
    swell_wave_height?: number[];
    swell_wave_direction?: number[];
    swell_wave_period?: number[];
    ocean_current_velocity?: number[];
    ocean_current_direction?: number[];
  };
}

interface OpenMeteoWeatherResponse {
  hourly: {
    time: string[];
    windspeed_10m?: number[];
    winddirection_10m?: number[];
    windgusts_10m?: number[];
    weathercode?: number[];
    visibility?: number[];
  };
}

export async function fetchMarineWeather(region: Region): Promise<HourlyWeather[]> {
  const lat = region.lat;
  const lon = region.lon;

  // Fetch marine data (waves, currents, swell)
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.searchParams.set("latitude", String(lat));
  marineUrl.searchParams.set("longitude", String(lon));
  marineUrl.searchParams.set("hourly", [
    "wave_height",
    "wave_direction",
    "wave_period",
    "wind_wave_height",
    "wind_wave_period",
    "swell_wave_height",
    "swell_wave_direction",
    "swell_wave_period",
    "ocean_current_velocity",
    "ocean_current_direction",
  ].join(","));
  marineUrl.searchParams.set("forecast_days", "7");
  marineUrl.searchParams.set("length_unit", "metric");

  // Fetch atmospheric weather (wind, visibility, weather code)
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(lat));
  weatherUrl.searchParams.set("longitude", String(lon));
  weatherUrl.searchParams.set("hourly", [
    "windspeed_10m",
    "winddirection_10m",
    "windgusts_10m",
    "weathercode",
    "visibility",
  ].join(","));
  weatherUrl.searchParams.set("wind_speed_unit", "kn");
  weatherUrl.searchParams.set("forecast_days", "7");

  const [marineRes, weatherRes] = await Promise.all([
    fetch(marineUrl.toString(), { next: { revalidate: 3600 } }),
    fetch(weatherUrl.toString(), { next: { revalidate: 3600 } }),
  ]);

  if (!marineRes.ok) throw new Error(`Marine API error: ${marineRes.status}`);
  if (!weatherRes.ok) throw new Error(`Weather API error: ${weatherRes.status}`);

  const marine = await marineRes.json() as OpenMeteoMarineResponse;
  const weather = await weatherRes.json() as OpenMeteoWeatherResponse;

  const times = weather.hourly.time;
  const n = times.length;

  const result: HourlyWeather[] = [];
  for (let i = 0; i < n; i++) {
    // Ocean current: convert m/s → knots (1 m/s = 1.944 kn)
    const currentMs = marine.hourly.ocean_current_velocity?.[i] ?? 0;

    result.push({
      time: times[i],
      windSpeed: Math.round((weather.hourly.windspeed_10m?.[i] ?? 0) * 10) / 10,
      windGust: Math.round((weather.hourly.windgusts_10m?.[i] ?? 0) * 10) / 10,
      windDirection: Math.round(weather.hourly.winddirection_10m?.[i] ?? 0),
      waveHeight: Math.round((marine.hourly.wave_height?.[i] ?? 0) * 10) / 10,
      wavePeriod: Math.round(marine.hourly.wave_period?.[i] ?? 0),
      waveDirection: Math.round(marine.hourly.wave_direction?.[i] ?? 0),
      swellHeight: Math.round((marine.hourly.swell_wave_height?.[i] ?? 0) * 10) / 10,
      swellPeriod: Math.round(marine.hourly.swell_wave_period?.[i] ?? 0),
      currentSpeed: Math.round(currentMs * 1.944 * 10) / 10,
      currentDirection: Math.round(marine.hourly.ocean_current_direction?.[i] ?? 0),
      weatherCode: weather.hourly.weathercode?.[i] ?? 0,
      visibility: Math.round((weather.hourly.visibility?.[i] ?? 10000) / 1000 * 10) / 10,
    });
  }

  return result;
}

// Derive approximate tidal events from wave height patterns
// For regions with real tidal importance, we use a simplified harmonic model
// based on the region's approximate tidal range and M2 period (12h 25min)
export function deriveTidalEvents(region: Region, hourly: HourlyWeather[]): TidalEvent[] {
  const events: TidalEvent[] = [];

  // Tidal ranges (metres, approximate) by region
  const tidalRanges: Record<string, { mean: number; range: number }> = {
    "dutch-north-sea":    { mean: 0.8, range: 1.8 },
    "wadden-sea":         { mean: 1.0, range: 2.2 },
    "ijsselmeer":         { mean: 0.0, range: 0.0 },
    "english-channel":    { mean: 2.5, range: 5.0 },
    "north-sea-central":  { mean: 0.5, range: 1.2 },
    "skagerrak-kattegat": { mean: 0.3, range: 0.6 },
    "baltic-west":        { mean: 0.1, range: 0.2 },
    "irish-sea":          { mean: 2.0, range: 4.5 },
    "bay-of-biscay":      { mean: 2.0, range: 4.0 },
    "mediterranean-west": { mean: 0.1, range: 0.3 },
  };

  const tidal = tidalRanges[region.id] ?? { mean: 0.5, range: 1.0 };

  if (tidal.range < 0.2) {
    // Non-tidal water — no tidal events
    return [];
  }

  const startTime = new Date(hourly[0]?.time ?? new Date().toISOString());
  const M2_PERIOD_MS = 12 * 60 * 60 * 1000 + 25 * 60 * 1000; // 12h 25min

  // Arbitrary phase offset (0 = high tide at t=0)
  // Use a deterministic offset based on region lat/lon
  const phaseOffset = ((region.lat + region.lon) * 3.7) % (2 * Math.PI);

  // Generate events for 7 days
  const totalMs = 7 * 24 * 60 * 60 * 1000;
  let t = 0;
  let lastType: "high" | "low" | null = null;

  while (t <= totalMs) {
    const phase = (2 * Math.PI * t) / M2_PERIOD_MS + phaseOffset;
    const height = tidal.mean + (tidal.range / 2) * Math.cos(phase);

    // Find extrema: check if derivative changes sign
    const phase2 = (2 * Math.PI * (t + 30 * 60 * 1000)) / M2_PERIOD_MS + phaseOffset;
    const height2 = tidal.mean + (tidal.range / 2) * Math.cos(phase2);

    const isHigh = height > height2 && (lastType !== "high");
    const isLow = height < height2 && (lastType !== "low");

    if (isHigh) {
      const eventTime = new Date(startTime.getTime() + t);
      events.push({
        time: eventTime.toISOString(),
        type: "high",
        heightM: Math.round(height * 100) / 100,
      });
      lastType = "high";
      t += M2_PERIOD_MS / 2 - 60 * 60 * 1000;
    } else if (isLow) {
      const eventTime = new Date(startTime.getTime() + t);
      events.push({
        time: eventTime.toISOString(),
        type: "low",
        heightM: Math.round(height * 100) / 100,
      });
      lastType = "low";
      t += M2_PERIOD_MS / 2 - 60 * 60 * 1000;
    } else {
      t += 30 * 60 * 1000; // step 30 min
    }
  }

  return events;
}
