import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import { ToastProvider } from "@/components/ui";
import { authEnabled } from "@/lib/auth";
import "./globals.css";

const thai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono-plex", display: "swap" });

export const metadata: Metadata = {
  title: { default: "CFR Money Trail — ระบบวิเคราะห์เส้นทางการเงิน", template: "%s · CFR Money Trail" },
  description: "นำเข้าข้อมูลเส้นทางเงินจาก CFR (รองรับ ZIP หลายไฟล์) วิเคราะห์ และส่งออกเป็นไฟล์ Excel ตามรูปแบบที่ต้องการ",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${thai.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        <div className="app-backdrop" />
        <ToastProvider>
          <AppHeader auth={authEnabled()} />
          <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-20 sm:px-6 lg:px-8">{children}</main>
          <footer className="mx-auto max-w-[1400px] px-4 pb-8 text-center text-[12px] text-ink-3 sm:px-6">
            CFR Money Trail · ข้อมูลถูกประมวลผลบนเบราว์เซอร์และจัดเก็บในฐานข้อมูล PostgreSQL ของหน่วยงาน
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
