import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          background: "linear-gradient(135deg, #00f5d4 0%, #00d2ff 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "8px",
          color: "#0a0e17",
          fontWeight: 900,
          boxShadow: "0 0 8px rgba(0, 245, 212, 0.6)",
        }}
      >
        ▲
      </div>
    ),
    {
      ...size,
    }
  );
}
