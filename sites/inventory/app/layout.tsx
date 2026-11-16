import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AITS Inventory — ทดลองคลังอุปกรณ์",
  description: "ต้นแบบส่วนตัว ไม่เชื่อมต่อสต็อกจริง",
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
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
