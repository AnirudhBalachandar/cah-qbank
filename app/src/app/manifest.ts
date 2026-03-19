import type { MetadataRoute } from "next";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SUBJECT_CONFIG.appName,
    short_name: SUBJECT_CONFIG.appName,
    description: `MCQ-only local qbank for ${SUBJECT_CONFIG.subjectName} revision.`,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f9fc",
    theme_color: "#0f8ab0",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
