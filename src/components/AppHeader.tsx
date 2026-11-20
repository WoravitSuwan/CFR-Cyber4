"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileSpreadsheet, LayoutDashboard, LogOut, Workflow } from "lucide-react";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "นำเข้า & คดี", icon: LayoutDashboard },
  { href: "/export", label: "ส่งออก Excel", icon: FileSpreadsheet },
];

export function AppHeader({ auth }: { auth: boolean }) {
  const path = usePathname();
  const router = useRouter();
  if (path === "/login") return null;
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-[color-mix(in_srgb,var(--bg)_78%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-teal-500 text-white shadow-lg shadow-indigo-500/25">
            <Workflow className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight text-ink">CFR Money Trail</span>
            <span className="hidden text-[11.5px] text-ink-2 sm:block">ระบบวิเคราะห์และส่งออกเส้นทางการเงิน</span>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" || path.startsWith("/cases") : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] font-medium transition-colors",
                  active ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          {auth && (
            <button
              className="ml-1 flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] text-ink-2 hover:bg-surface-3 hover:text-ink"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
              }}
              title="ออกจากระบบ"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
