import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-open-sans"
});

export const metadata: Metadata = {
  title: "Dubai Autodrome Events",
  description: "Recurring event registration and check-in platform for Dubai Autodrome."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${openSans.variable} min-h-screen bg-mesh-gradient text-ink antialiased`}>
        <div className="app-shell">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
