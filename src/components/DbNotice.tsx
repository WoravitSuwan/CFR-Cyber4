"use client";

import { Database } from "lucide-react";
import { Card } from "./ui";

export function DbNotice({ message }: { message: string }) {
  return (
    <Card className="border-warn/40 p-6">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-warn-soft text-warn">
          <Database className="size-5" />
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <div className="text-[15px] font-semibold text-ink">ยังเชื่อมต่อฐานข้อมูลไม่ได้</div>
          <p className="text-ink-2">{message}</p>
          <ol className="list-decimal space-y-1 pl-5 text-ink-2">
            <li>
              บน Vercel: ไปที่ <b>Storage → Create Database → Postgres (Neon)</b> แล้วเชื่อมกับโปรเจกต์ ระบบจะตั้งค่า <code className="rounded bg-surface-3 px-1">POSTGRES_URL</code> ให้อัตโนมัติ
            </li>
            <li>
              หรือกำหนด <code className="rounded bg-surface-3 px-1">DATABASE_URL</code> เป็น PostgreSQL connection string ใน Environment Variables แล้ว Redeploy
            </li>
            <li>ตารางจะถูกสร้างให้อัตโนมัติเมื่อเรียกใช้งานครั้งแรก</li>
          </ol>
        </div>
      </div>
    </Card>
  );
}
