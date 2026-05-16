import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090b",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ width: "90px", height: "16px", backgroundColor: "#38BDF8", borderRadius: "4px" }} />
          <div style={{ width: "63px", height: "16px", backgroundColor: "#7DD3FC", borderRadius: "4px" }} />
          <div style={{ width: "40px", height: "16px", backgroundColor: "white", borderRadius: "4px" }} />
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
