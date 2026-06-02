import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TelemetryConsentDialog } from "@/components/TelemetryConsentDialog";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clin — local LinkedIn network intelligence",
  description:
    "Capture, score, and review your LinkedIn network locally. White-and-blue dashboard with optional paced automation.",
  icons: {
    icon: "/brand/Clin_Logo_Small.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4fc3a1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <TelemetryConsentDialog />
      </body>
    </html>
  );
}
