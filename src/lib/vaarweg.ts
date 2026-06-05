import type { ShippingNotice } from "@/types";

// Rijkswaterstaat publishes shipping notices via their public web portal.
// We fetch the JSON data feed from the vaarweginformatie API.
const DRIPS_URL = "https://www.vaarweginformatie.nl/fdd/main/drips";

interface DripsItem {
  titel?: string;
  omschrijving?: string;
  vaarweg?: string;
  publicatiedatum?: string;
  prioriteit?: string;
  type?: string;
}

function mapSeverity(item: DripsItem): "info" | "warning" | "danger" {
  const prio = (item.prioriteit ?? "").toLowerCase();
  const type = (item.type ?? "").toLowerCase();
  if (prio === "hoog" || type.includes("gevaar") || type.includes("danger")) return "danger";
  if (prio === "medium" || type.includes("waarschuw") || type.includes("warning")) return "warning";
  return "info";
}

export async function fetchShippingNotices(regionCountries: string[]): Promise<ShippingNotice[]> {
  try {
    // Only fetch Dutch notices for NL regions
    if (!regionCountries.includes("NL")) {
      return getFallbackNotices(regionCountries);
    }

    const res = await fetch(DRIPS_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return getFallbackNotices(regionCountries);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return getFallbackNotices(regionCountries);
    }

    const data = await res.json() as DripsItem[] | { items?: DripsItem[] };
    const items = Array.isArray(data) ? data : (data.items ?? []);

    const notices: ShippingNotice[] = items.slice(0, 10).map((item) => ({
      title: item.titel ?? "Shipping notice",
      description: item.omschrijving ?? "",
      area: item.vaarweg ?? "Netherlands",
      published: item.publicatiedatum ?? new Date().toISOString(),
      severity: mapSeverity(item),
    }));

    return notices.length > 0 ? notices : getFallbackNotices(regionCountries);
  } catch {
    return getFallbackNotices(regionCountries);
  }
}

function getFallbackNotices(countries: string[]): ShippingNotice[] {
  const notices: ShippingNotice[] = [];

  if (countries.includes("NL")) {
    notices.push(
      {
        title: "TSS Traffic Separation Scheme Active",
        description: "The Traffic Separation Scheme off the Dutch coast is in full effect. Sailing vessels must not impede vessels following a separation lane. Check NtM for lane boundaries.",
        area: "Noordzee / Dutch coastal waters",
        published: new Date().toISOString(),
        severity: "info",
      },
      {
        title: "Vaarweginformatie.nl — Live notices",
        description: "For up-to-date waterway notices, visit vaarweginformatie.nl or the Waterkaart app. Check before departure.",
        area: "All Dutch waterways",
        published: new Date().toISOString(),
        severity: "info",
      }
    );
  }

  if (countries.includes("GB")) {
    notices.push({
      title: "UK Notices to Mariners",
      description: "Check the latest UK Notices to Mariners (NtM) at gov.uk/government/collections/notices-to-mariners before departure.",
      area: "UK waters",
      published: new Date().toISOString(),
      severity: "info",
    });
  }

  if (countries.includes("DE")) {
    notices.push({
      title: "German Bight Traffic Alerts",
      description: "Check BSH (Bundesamt für Seeschifffahrt und Hydrographie) for current German coastal warnings.",
      area: "German Bight / Deutsche Bucht",
      published: new Date().toISOString(),
      severity: "info",
    });
  }

  notices.push({
    title: "AIS Monitoring Recommended",
    description: "Always monitor VHF Ch 16 and maintain AIS watch throughout your passage. Contact relevant MRCC/Coastguard for the latest navigational warnings.",
    area: "All areas",
    published: new Date().toISOString(),
    severity: "info",
  });

  return notices;
}
