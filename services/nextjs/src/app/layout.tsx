import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "../components/TopNav";
import { ThemeProvider } from "../components/ThemeProvider";

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
    <html lang="en" className={`${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme) {
                    document.documentElement.setAttribute('data-theme', theme);
                  } else {
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body style={{ display: 'flex', flexDirection: 'column', height: '100vh', margin: 0 }}>
        <ThemeProvider>
          <TopNav />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
