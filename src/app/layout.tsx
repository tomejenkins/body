import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./app-ux.css";
export const metadata: Metadata = {
  title: { default: "Body · Your training space", template: "%s · Body" },
  description:
    "A considered space for your training, progress, and personal bests.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Body" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#111612" },
  ],
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
