import type { Metadata, Viewport } from "next";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: SUBJECT_CONFIG.appName,
  description: `MCQ-only local qbank for ${SUBJECT_CONFIG.subjectName} revision.`,
  applicationName: SUBJECT_CONFIG.appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SUBJECT_CONFIG.appName,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f8ab0" },
    { media: "(prefers-color-scheme: dark)", color: "#0f8ab0" },
  ],
};

const themeInitScript = `
(function(){
  try {
    var mode = localStorage.getItem('cah-theme');
    if (mode === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
