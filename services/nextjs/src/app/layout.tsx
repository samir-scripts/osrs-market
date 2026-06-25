import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "../components/TopNav";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OSRS Market Value Tracker",
  description: "Real-time, box-style Old School RuneScape market value dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable}`}>
      <body style={{ display: 'flex', flexDirection: 'column', height: '100vh', margin: 0 }}>
        <TopNav />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
