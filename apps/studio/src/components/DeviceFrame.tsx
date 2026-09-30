import React from "react";

export type Device = "phone" | "browser" | "none";

// Chrome around the screen. The screen itself is sized by the caller and
// passed in as children, so geometry math lives in one place (ScreenTour).
export const PHONE_BEZEL = 16;
export const BROWSER_BAR = 44;

export const DeviceFrame: React.FC<{
  device: Device;
  accent: string;
  screenWidth: number;
  screenHeight: number;
  url?: string;
  children: React.ReactNode;
}> = ({ device, accent, screenWidth, screenHeight, url, children }) => {
  if (device === "phone") {
    return (
      <div
        style={{
          padding: PHONE_BEZEL,
          borderRadius: 64,
          background: "linear-gradient(145deg, #2a2f3d, #0c0e14)",
          boxShadow: `0 50px 100px -30px rgba(0,0,0,0.7), 0 0 0 2px #3a4052, 0 0 140px -40px ${accent}66`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: screenWidth,
            height: screenHeight,
            borderRadius: 50,
            overflow: "hidden",
            background: "#000",
          }}
        >
          {children}
          {/* Dynamic-island style notch */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              width: screenWidth * 0.3,
              height: 34,
              marginLeft: -(screenWidth * 0.15),
              borderRadius: 999,
              background: "#000",
            }}
          />
        </div>
      </div>
    );
  }

  if (device === "browser") {
    return (
      <div
        style={{
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: `0 40px 90px -25px rgba(0,0,0,0.7), 0 0 120px -40px ${accent}55`,
          background: "#1a1e29",
        }}
      >
        <div style={{ height: BROWSER_BAR, display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: 999, background: c }} />
          ))}
          <div
            style={{
              flex: 1,
              marginLeft: 16,
              height: 26,
              borderRadius: 8,
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.55)",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {url ?? "app.example.com"}
          </div>
        </div>
        <div style={{ position: "relative", width: screenWidth, height: screenHeight, overflow: "hidden", background: "#000" }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: screenWidth,
        height: screenHeight,
        borderRadius: 28,
        overflow: "hidden",
        border: `1px solid ${accent}44`,
        boxShadow: "0 40px 90px -25px rgba(0,0,0,0.7)",
      }}
    >
      {children}
    </div>
  );
};
