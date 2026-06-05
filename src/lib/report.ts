import type { WeatherData, ForecastRequest, HourlyWeather } from "@/types";
import { beaufortNumber, compassPoint, wmoDescription } from "./weather";
import { generateSailingBrief } from "./brief";

function boatTypeLabel(t: string): string {
  switch (t) {
    case "sailing": return "Sailing Yacht";
    case "motor": return "Motor Yacht";
    case "motorboat": return "Motorboat";
    case "rib": return "RIB / Speedboat";
    default: return t;
  }
}

function boatSizeLabel(s: string): string {
  switch (s) {
    case "micro": return "< 6 m";
    case "small": return "6-9 m";
    case "medium": return "9-14 m";
    case "large": return "14-20 m";
    case "xlarge": return "20-30 m";
    default: return s;
  }
}

// ASCII-only direction — no Unicode arrows that Helvetica can't render
function dirText(deg: number): string {
  return compassPoint(deg);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
  });
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

function groupByDay(hourly: HourlyWeather[]): Map<string, HourlyWeather[]> {
  const map = new Map<string, HourlyWeather[]>();
  for (const h of hourly) {
    const day = h.time.split("T")[0];
    const arr = map.get(day) ?? [];
    arr.push(h);
    map.set(day, arr);
  }
  return map;
}

function pickRepresentativeHours(hours: HourlyWeather[]): HourlyWeather[] {
  const wanted = [6, 9, 12, 15, 18, 21];
  return wanted
    .map((h) => hours.find((w) => new Date(w.time).getUTCHours() === h))
    .filter((h): h is HourlyWeather => h !== undefined);
}

// Strip markdown formatting to plain text safe for pdfkit/Helvetica
function stripMarkdown(line: string): string {
  return line
    .replace(/\*\*/g, "")   // bold
    .replace(/\*/g, "")     // italic
    .replace(/`/g, "")      // code
    .replace(/---/g, "")    // horizontal rules
    .trim();
}

export async function generateForecastPdf(
  req: ForecastRequest,
  data: WeatherData
): Promise<Buffer> {
  const brief = await generateSailingBrief(req, data);
  return renderPdf(req, data, brief);
}

function renderPdf(req: ForecastRequest, data: WeatherData, brief: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    import("pdfkit").then(({ default: PDFDocument }) => {
      const doc = new PDFDocument({ margin: 50, size: "A4", info: {
        Title: `SkipperBrief - ${data.region.name}`,
        Author: "SkipperBrief by Quantoz",
        Subject: "Marine Weather Forecast",
      }});

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const NAVY  = "#0F2A4A";
      const TEAL  = "#0E7C86";
      const LIGHT = "#E8F4F8";
      const WARN  = "#D4700A";
      const DANGER = "#C0392B";
      const GREY  = "#6B7280";
      const WHITE = "#FFFFFF";
      const W = 495; // 595 - 2*50 margins

      // ── COVER ──────────────────────────────────────────────────────────────────
      doc.rect(0, 0, 595, 95).fill(NAVY);
      // "SkipperBrief" — no emoji, plain text only
      doc.fillColor(WHITE).fontSize(30).font("Helvetica-Bold")
        .text("SkipperBrief", 50, 25);
      doc.fontSize(11).font("Helvetica").fillColor("#93C5FD")
        .text("Marine Weather Forecast  |  Powered by Quantoz EURD", 50, 62);

      // Region box
      doc.rect(50, 110, W, 78).fill(LIGHT);
      const routeLabel = req.regionId
        ? data.region.name + (data.region.nameDutch ? ` (${data.region.nameDutch})` : "")
        : `${req.startLocation ?? "?"} to ${req.endLocation ?? "?"}`;
      doc.fillColor(NAVY).fontSize(17).font("Helvetica-Bold")
        .text(routeLabel, 65, 123, { width: W - 30 });
      doc.fontSize(9).font("Helvetica").fillColor(GREY)
        .text(data.region.description, 65, 148, { width: W - 30 });

      // Vessel / meta row
      const mY = 205;
      doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("Vessel", 50, mY);
      doc.fillColor(GREY).font("Helvetica")
        .text(`${boatTypeLabel(req.boatType)}  |  ${boatSizeLabel(req.boatSize)}`, 50, mY + 14);

      doc.fillColor(NAVY).font("Helvetica-Bold").text("Generated", 240, mY);
      doc.fillColor(GREY).font("Helvetica").text(formatTime(data.generatedAt), 240, mY + 14);

      doc.fillColor(NAVY).font("Helvetica-Bold").text("Coverage", 430, mY);
      doc.fillColor(GREY).font("Helvetica").text("7 days / hourly", 430, mY + 14);

      doc.moveTo(50, 240).lineTo(545, 240).strokeColor(NAVY).lineWidth(1.5).stroke();

      // ── SAILING BRIEF ──────────────────────────────────────────────────────────
      doc.fillColor(NAVY).fontSize(14).font("Helvetica-Bold").text("Sailing Brief", 50, 252);

      let yPos = 274;

      for (const rawLine of brief.split("\n")) {
        // Skip pure horizontal rules
        if (/^-{3,}$/.test(rawLine.trim())) { yPos += 4; continue; }

        const line = rawLine;

        // Check for page overflow — leave 60px margin at bottom
        if (yPos > 760) {
          doc.addPage();
          yPos = 50;
        }

        if (line.startsWith("## ")) {
          const text = stripMarkdown(line.replace(/^## /, ""));
          doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold")
            .text(text, 50, yPos, { width: W });
          yPos = doc.y + 5;

        } else if (line.startsWith("### ")) {
          const text = stripMarkdown(line.replace(/^### /, ""));
          doc.fillColor(TEAL).fontSize(11).font("Helvetica-Bold")
            .text(text, 50, yPos, { width: W });
          yPos = doc.y + 4;

        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          const text = stripMarkdown(line.replace(/^[-*] /, ""));
          doc.fillColor("#374151").fontSize(9.5).font("Helvetica")
            .text("  •  " + text, 55, yPos, { width: W - 10 });
          yPos = doc.y + 3;

        } else if (line.trim() === "") {
          yPos += 5;

        } else {
          const text = stripMarkdown(line);
          if (text === "") { yPos += 3; continue; }
          doc.fillColor("#374151").fontSize(9.5).font("Helvetica")
            .text(text, 50, yPos, { width: W });
          yPos = doc.y + 3;
        }
      }

      // ── WIND & WAVE TABLE ──────────────────────────────────────────────────────
      doc.addPage();
      doc.rect(0, 0, 595, 48).fill(NAVY);
      doc.fillColor(WHITE).fontSize(15).font("Helvetica-Bold")
        .text("Wind & Wave Forecast", 50, 16);

      const dayMap = groupByDay(data.hourly);
      const days = [...dayMap.entries()].slice(0, 3);
      let tableY = 62;

      const cols  = ["Time",  "Wind",   "Dir",  "Bft", "Gusts",  "Waves",       "Swell",       "Weather"];
      const colW  = [52,       58,       42,     30,    55,        68,            68,             72];

      for (const [day, hours] of days) {
        if (tableY > 690) { doc.addPage(); tableY = 50; }

        // Day banner
        doc.rect(50, tableY, W, 20).fill(TEAL);
        doc.fillColor(WHITE).fontSize(10).font("Helvetica-Bold")
          .text(formatDate(day + "T12:00:00"), 55, tableY + 5);
        tableY += 20;

        // Column header row
        doc.rect(50, tableY, W, 16).fill("#E5E7EB");
        let cx = 50;
        for (let i = 0; i < cols.length; i++) {
          doc.fillColor(NAVY).fontSize(7.5).font("Helvetica-Bold")
            .text(cols[i], cx + 3, tableY + 4, { width: colW[i], lineBreak: false });
          cx += colW[i];
        }
        tableY += 16;

        const repHours = pickRepresentativeHours(hours);
        let rowAlt = false;
        for (const h of repHours) {
          if (tableY > 760) { doc.addPage(); tableY = 50; }

          const bf = beaufortNumber(h.windSpeed);
          const bg = bf >= 8 ? "#FEE2E2" : bf >= 6 ? "#FEF3C7" : rowAlt ? "#F9FAFB" : WHITE;
          doc.rect(50, tableY, W, 15).fill(bg);
          rowAlt = !rowAlt;

          const cells = [
            formatHour(h.time),
            `${h.windSpeed.toFixed(0)} kts`,
            dirText(h.windDirection),
            String(bf),
            `${h.windGust.toFixed(0)} kts`,
            `${h.waveHeight.toFixed(1)}m / ${h.wavePeriod}s`,
            `${h.swellHeight.toFixed(1)}m / ${h.swellPeriod}s`,
            wmoDescription(h.weatherCode).slice(0, 14),
          ];

          const textCol = bf >= 8 ? DANGER : bf >= 6 ? WARN : "#111827";
          cx = 50;
          for (let i = 0; i < cells.length; i++) {
            doc.fillColor(textCol).fontSize(7.5).font("Helvetica")
              .text(cells[i], cx + 3, tableY + 4, { width: colW[i], lineBreak: false });
            cx += colW[i];
          }
          tableY += 15;
        }
        tableY += 8;
      }

      // Colour key
      if (tableY < 720) {
        tableY += 4;
        doc.rect(50, tableY, W, 22).fill("#F3F4F6");
        doc.fillColor(GREY).fontSize(7.5).font("Helvetica")
          .text("Colour key:  White = Bft 0-5 (moderate or less)  |  Yellow = Bft 6-7 (fresh to near gale)  |  Red = Bft 8+ (gale or worse)", 55, tableY + 7);
      }

      // ── TIDAL INFORMATION ──────────────────────────────────────────────────────
      if (data.tides.length > 0) {
        doc.addPage();
        doc.rect(0, 0, 595, 48).fill(NAVY);
        doc.fillColor(WHITE).fontSize(15).font("Helvetica-Bold").text("Tidal Information", 50, 16);

        doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold")
          .text("Tidal Events - Next 7 Days", 50, 62);
        doc.fillColor(GREY).fontSize(8.5).font("Helvetica")
          .text(`Region: ${data.region.name}  |  Tidal importance: ${data.region.tidalImportance.toUpperCase()}`, 50, 78);

        let tideY = 96;

        // Header row
        const tideCols  = ["Date / Time (CET)", "Type",       "Height (m)"];
        const tideColW  = [190,                   170,          130];
        let tcx = 50;
        for (let i = 0; i < tideCols.length; i++) {
          doc.rect(tcx, tideY, tideColW[i], 17).fill(TEAL);
          doc.fillColor(WHITE).fontSize(8.5).font("Helvetica-Bold")
            .text(tideCols[i], tcx + 5, tideY + 5, { width: tideColW[i] - 5, lineBreak: false });
          tcx += tideColW[i];
        }
        tideY += 17;

        let tideAlt = false;
        for (const event of data.tides.slice(0, 42)) {
          if (tideY > 760) { doc.addPage(); tideY = 50; }

          const bg = event.type === "high" ? "#DBEAFE" : tideAlt ? "#F9FAFB" : WHITE;
          tcx = 50;
          for (const w of tideColW) { doc.rect(tcx, tideY, w, 15).fill(bg); tcx += w; }
          tideAlt = !tideAlt;

          // ASCII HW / LW labels — no Unicode arrows
          const typeLabel = event.type === "high" ? "HW  High Water" : "LW  Low Water";
          doc.fillColor("#111827").fontSize(8.5).font("Helvetica")
            .text(formatTime(event.time), 55, tideY + 4, { width: 185, lineBreak: false })
            .text(typeLabel,              215, tideY + 4, { width: 165, lineBreak: false })
            .text(event.heightM.toFixed(2) + " m", 375, tideY + 4, { width: 125, lineBreak: false });
          tideY += 15;
        }

        tideY += 10;
        if (tideY > 720) { doc.addPage(); tideY = 50; }
        doc.rect(50, tideY, W, 36).fill("#FEF3C7");
        doc.fillColor(WARN).fontSize(8.5).font("Helvetica-Bold")
          .text("Important:", 56, tideY + 7);
        doc.fillColor("#92400E").fontSize(8).font("Helvetica")
          .text("Heights are approximate (simplified harmonic model). Always verify with official tide tables (Rijkswaterstaat Getijdenboek, UK Admiralty) before departure.", 56, tideY + 19, { width: W - 16 });

      } else {
        // non-tidal note inline on wave page
        if (tableY < 700) {
          doc.fillColor(TEAL).fontSize(9).font("Helvetica-Bold")
            .text("Tidal Information", 50, tableY + 18);
          doc.fillColor(GREY).fontSize(9).font("Helvetica")
            .text("This area has negligible tidal range. No tidal planning required.", 50, tableY + 32);
        }
      }

      // ── CURRENTS ───────────────────────────────────────────────────────────────
      const hasCurrents = data.hourly.some((h) => h.currentSpeed > 0.05);
      if (hasCurrents) {
        doc.addPage();
        doc.rect(0, 0, 595, 48).fill(NAVY);
        doc.fillColor(WHITE).fontSize(15).font("Helvetica-Bold").text("Ocean Currents", 50, 16);

        const curCols  = ["Date / Time",  "Speed (kts)", "Direction", "Wind (Bft)",    "Wave Ht"];
        const curColW  = [120,             90,             85,          120,             80];

        let curY = 62;
        let ccx = 50;
        doc.rect(50, curY, W, 17).fill(TEAL);
        for (let i = 0; i < curCols.length; i++) {
          doc.fillColor(WHITE).fontSize(8).font("Helvetica-Bold")
            .text(curCols[i], ccx + 3, curY + 5, { width: curColW[i], lineBreak: false });
          ccx += curColW[i];
        }
        curY += 17;

        let curAlt = false;
        const sixHourly = data.hourly.filter((_, i) => i % 6 === 0).slice(0, 28);
        for (const h of sixHourly) {
          if (curY > 760) { doc.addPage(); curY = 50; }
          doc.rect(50, curY, W, 15).fill(curAlt ? "#F9FAFB" : WHITE);
          curAlt = !curAlt;

          const cells2 = [
            formatTime(h.time),
            `${h.currentSpeed.toFixed(1)}`,
            dirText(h.currentDirection),
            `${h.windSpeed.toFixed(0)} kts  Bft ${beaufortNumber(h.windSpeed)}`,
            `${h.waveHeight.toFixed(1)} m`,
          ];

          ccx = 50;
          for (let i = 0; i < cells2.length; i++) {
            doc.fillColor("#374151").fontSize(7.5).font("Helvetica")
              .text(cells2[i], ccx + 3, curY + 4, { width: curColW[i], lineBreak: false });
            ccx += curColW[i];
          }
          curY += 15;
        }
      }

      // ── SHIPPING NOTICES ───────────────────────────────────────────────────────
      doc.addPage();
      doc.rect(0, 0, 595, 48).fill(NAVY);
      doc.fillColor(WHITE).fontSize(15).font("Helvetica-Bold")
        .text("Shipping & Waterway Notices", 50, 16);

      let notY = 62;
      for (const notice of data.notices) {
        // Measure the description height first
        const descLines = Math.ceil(notice.description.length / 90) + 1;
        const boxH = Math.max(70, 44 + descLines * 13);

        if (notY + boxH > 760) { doc.addPage(); notY = 50; }

        const bgCol   = notice.severity === "danger"  ? "#FEE2E2"
                      : notice.severity === "warning" ? "#FEF3C7"
                      : LIGHT;
        const barCol  = notice.severity === "danger"  ? DANGER
                      : notice.severity === "warning" ? WARN
                      : TEAL;

        doc.rect(50, notY, W, boxH).fill(bgCol);
        doc.rect(50, notY, 5, boxH).fill(barCol);

        doc.fillColor(barCol).fontSize(7.5).font("Helvetica-Bold")
          .text(notice.severity.toUpperCase(), 62, notY + 7, { lineBreak: false });
        doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold")
          .text(notice.title, 62, notY + 19, { width: W - 20 });
        doc.fillColor(GREY).fontSize(8.5).font("Helvetica")
          .text(notice.description, 62, notY + 34, { width: W - 20 });
        doc.fillColor(GREY).fontSize(8)
          .text(`Area: ${notice.area}  |  ${new Date(notice.published).toLocaleDateString("en-GB")}`,
            62, notY + boxH - 14, { lineBreak: false });

        notY += boxH + 8;
      }

      // ── DISCLAIMER ─────────────────────────────────────────────────────────────
      doc.addPage();
      doc.rect(0, 0, 595, 48).fill(NAVY);
      doc.fillColor(WHITE).fontSize(15).font("Helvetica-Bold").text("Disclaimer & Sources", 50, 16);

      const disclaimerLines = [
        "SkipperBrief is a decision-support tool, not an official marine forecast service.",
        "",
        "Weather data: Open-Meteo (openmeteo.com) using ECMWF, DWD and NOAA model output.",
        "Tidal heights are approximated (simplified harmonic model). Verify before passage:",
        "  Netherlands: Rijkswaterstaat Getijdenboek - rijkswaterstaat.nl",
        "  UK: UK Hydrographic Office Admiralty Tide Tables - ukho.gov.uk",
        "  Germany: BSH Gezeitenkalender - bsh.de",
        "",
        "Shipping notices: Rijkswaterstaat Vaarweginformatie (vaarweginformatie.nl).",
        "Always monitor VHF Channel 16 and contact the relevant Coastguard for navigational warnings.",
        "",
        "The master is solely responsible for the safety of the vessel and crew at all times.",
        "This report does not substitute for proper seamanship, up-to-date charts, or official sources.",
        "",
        "AI briefing generated by Anthropic Claude. Data generated at: " + formatTime(data.generatedAt),
        "Payment processed via Quantoz EURD (x402 protocol) - quantozpay.com",
        "Report by SkipperBrief - skipperbrief.com",
      ];

      let dY = 65;
      for (const l of disclaimerLines) {
        if (l === "") { dY += 6; continue; }
        doc.fillColor(GREY).fontSize(9).font("Helvetica")
          .text(l, 50, dY, { width: W });
        dY = doc.y + 2;
      }

      doc.end();
    }).catch(reject);
  });
}
