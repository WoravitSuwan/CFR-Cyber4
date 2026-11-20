"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, Workflow } from "lucide-react";
import { Button } from "@/components/ui";

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) {
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "เข้าสู่ระบบไม่สำเร็จ");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card animate-fade-up w-full max-w-sm space-y-5 p-7">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-teal-500 text-white shadow-xl shadow-indigo-500/30">
          <Workflow className="size-7" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">CFR Money Trail</h1>
          <p className="text-[13px] text-ink-2">กรุณาใส่รหัสผ่านเพื่อเข้าใช้งานระบบ</p>
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">รหัสผ่าน</span>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-10 outline-none focus:border-primary focus:bg-surface"
          />
        </div>
      </label>
      {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</div>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        เข้าสู่ระบบ
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[80dvh] items-center justify-center">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
