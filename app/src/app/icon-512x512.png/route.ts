import { ImageResponse } from "next/og";
import { createElement } from "react";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(160deg, rgb(15, 138, 176) 0%, rgb(21, 94, 117) 65%, rgb(15, 23, 42) 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        },
      },
      createElement("div", { style: { fontSize: 142, fontWeight: 800, lineHeight: 1 } }, "CAH"),
      createElement("div", { style: { fontSize: 72, letterSpacing: 3, marginTop: 16 } }, "QBank"),
    ),
    { width: 512, height: 512 },
  );
}
