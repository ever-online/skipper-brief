export type BoatType = "sailing" | "motor" | "motorboat" | "rib";

export type BoatSizeRange =
  | "micro"    // < 6m
  | "small"    // 6–9m
  | "medium"   // 9–14m
  | "large"    // 14–20m
  | "xlarge";  // 20–30m

export interface Region {
  id: string;
  name: string;
  nameDutch?: string;
  lat: number;
  lon: number;
  zoom: number;
  description: string;
  tidalImportance: "high" | "medium" | "low";
  country: string[];
}

export interface ForecastRequest {
  boatType: BoatType;
  boatSize: BoatSizeRange;
  regionId?: string;
  startLocation?: string;
  endLocation?: string;
  startLat?: number;
  startLon?: number;
  endLat?: number;
  endLon?: number;
}

export interface HourlyWeather {
  time: string;
  windSpeed: number;      // knots
  windGust: number;       // knots
  windDirection: number;  // degrees
  waveHeight: number;     // meters
  wavePeriod: number;     // seconds
  waveDirection: number;  // degrees
  swellHeight: number;    // meters
  swellPeriod: number;    // seconds
  currentSpeed: number;   // knots
  currentDirection: number; // degrees
  weatherCode: number;
  visibility: number;     // km
}

export interface TidalEvent {
  time: string;
  type: "high" | "low";
  heightM: number;
}

export interface ShippingNotice {
  title: string;
  description: string;
  area: string;
  published: string;
  severity: "info" | "warning" | "danger";
}

export interface WeatherData {
  region: Region;
  hourly: HourlyWeather[];
  tides: TidalEvent[];
  notices: ShippingNotice[];
  generatedAt: string;
}

export type OrderStatus = "pending" | "paid" | "failed" | "expired";

export interface OrderRecord {
  id: string;
  forecastRequest: ForecastRequest;
  status: OrderStatus;
  eurdPaymentRequestCode: string;
  qrCodeString: string;
  shareableLink: string;
  amount: number;
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
  downloadToken?: string;
  lastCheckedAt?: string;
}

export interface EurdWebhookPayload {
  paymentRequestCode: string;
  status: string;
  amount?: number;
}
