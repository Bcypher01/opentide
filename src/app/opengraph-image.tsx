import { ImageResponse } from "next/og";

// Dynamic Open Graph / Twitter share image (1200×630). Next.js auto-injects the
// resulting URL into both og:image and twitter:image. Built around the
// differentiator — market sessions — using the app's own palette.
export const runtime = "edge";
export const alt = "Opentide — every market, every session. Free forex, crypto and US stocks organized around market sessions.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0A0B0D";
const ACCENT = "#00D4AA";
const MUTED = "#9CA3AF";
const BORDER = "#1F2937";

const SESSIONS = [
  { name: "Sydney", live: false },
  { name: "Tokyo", live: false },
  { name: "London", live: true },
  { name: "New York", live: true },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `radial-gradient(1100px 500px at 78% -10%, rgba(0,212,170,0.18), ${BG} 60%)`,
          color: "#F5F7FA",
          padding: "76px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark + live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: ACCENT,
              boxShadow: `0 0 28px ${ACCENT}`,
            }}
          />
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: 2,
              color: ACCENT,
            }}
          >
            OPENTIDE
          </div>
        </div>

        {/* Headline + sub */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 82, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }}>
            Every market,
            <br />
            every session.
          </div>
          <div style={{ fontSize: 30, color: MUTED, maxWidth: 900, lineHeight: 1.35 }}>
            A live session clock, liquidity overlaps, and an asset-tagged newswire — forex,
            crypto & US stocks on one surface. Free, no keys.
          </div>
        </div>

        {/* Session pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {SESSIONS.map((s) => (
            <div
              key={s.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 24px",
                borderRadius: 999,
                fontSize: 26,
                border: `1px solid ${s.live ? ACCENT : BORDER}`,
                background: s.live ? "rgba(0,212,170,0.12)" : "rgba(255,255,255,0.02)",
                color: s.live ? ACCENT : MUTED,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: s.live ? ACCENT : BORDER,
                }}
              />
              {s.name}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
