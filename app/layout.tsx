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
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
