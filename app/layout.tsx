import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HERLIYAH · Preorder clothing preview",
  description: "A development preview of HERLIYAH's made-to-order clothing store.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
