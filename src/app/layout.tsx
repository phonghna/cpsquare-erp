import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CPSquare ERP",
  description: "Multi-country mobile retail ERP — Taiwan Central Warehouse",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper text-slate-900 antialiased">{children}</body>
    </html>
  );
}
