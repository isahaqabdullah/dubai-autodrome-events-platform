import type { Metadata, Viewport } from "next";
import "./globals.css";

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
      <body className="min-h-screen bg-mesh-gradient text-ink antialiased">
        <div className="relative min-h-screen">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-white/80 to-transparent" />
          {children}
        </div>
      </body>
    </html>
  );
}
