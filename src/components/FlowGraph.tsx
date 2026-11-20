"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { bankColor } from "@/lib/banks";
import { maskAccount, type Account, type FlowResult } from "@/lib/flow";
import { fmtMoney } from "@/lib/client";
import { cx } from "./ui";

const W = 232;
const H = 84;
const GAP_X = 120;
const GAP_Y = 18;
const PAD = 24;
const HEAD = 36;

const ROLE = {
  source: { label: "ต้นทาง", cls: "bg-danger-soft text-danger" },
  mule: { label: "บัญชีทอด", cls: "bg-warn-soft text-warn" },
  sink: { label: "ปลายทาง", cls: "bg-accent-soft text-accent" },
} as const;

export function FlowGraph({ flow, mask }: { flow: FlowResult; mask: boolean }) {
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    const byLevel = new Map<number, Account[]>();
    for (const a of flow.accounts.values()) {
      if (!byLevel.has(a.level)) byLevel.set(a.level, []);
      byLevel.get(a.level)!.push(a);
    }
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const preds = new Map<string, string[]>();
    for (const e of flow.edges) {
      if (!preds.has(e.to)) preds.set(e.to, []);
      preds.get(e.to)!.push(e.from);
    }
    const pos = new Map<string, { x: number; y: number; idx: number }>();
    const rootOrder = new Map(flow.roots.map((r, i) => [r, i]));
    let maxRows = 0;
    for (const lv of levels) {
      const list = byLevel.get(lv)!;
      const score = (a: Account) => {
        const ps = (preds.get(a.key) ?? []).map((p) => pos.get(p)?.idx).filter((x): x is number => x !== undefined);
        if (lv === 0) return rootOrder.get(a.key) ?? 1e6;
        return ps.length ? ps.reduce((s, x) => s + x, 0) / ps.length : 1e6;
      };
      list.sort((a, b) => score(a) - score(b) || b.inAmount - a.inAmount || b.outAmount - a.outAmount);
      list.forEach((a, i) => pos.set(a.key, { x: PAD + lv * (W + GAP_X), y: HEAD + PAD + i * (H + GAP_Y), idx: i }));
      maxRows = Math.max(maxRows, list.length);
    }
    const maxLevel = levels.length ? levels[levels.length - 1] : 0;
    const width = PAD * 2 + (maxLevel + 1) * W + maxLevel * GAP_X;
    const height = HEAD + PAD * 2 + maxRows * H + Math.max(0, maxRows - 1) * GAP_Y;
    const maxAmt = Math.max(1, ...flow.edges.map((e) => e.amount));
    return { pos, width, height, levels, maxAmt };
  }, [flow]);

  const connected = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    for (const e of flow.edges) {
      if (e.from === hover) s.add(e.to);
      if (e.to === hover) s.add(e.from);
    }
    return s;
  }, [hover, flow.edges]);

  if (!flow.accounts.size) return null;

  return (
    <div className="scroll-thin relative overflow-auto rounded-2xl border border-line bg-surface-2" style={{ maxHeight: 640 }}>
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        {/* หัวคอลัมน์ */}
        {layout.levels.map((lv) => (
          <div
            key={lv}
            className="absolute top-3 text-center text-[11.5px] font-semibold tracking-wide text-ink-2 uppercase"
            style={{ left: PAD + lv * (W + GAP_X), width: W }}
          >
            {lv === 0 ? "บัญชีต้นทาง" : `ชั้นที่ ${lv}`}
          </div>
        ))}
        <svg className="absolute inset-0" width={layout.width} height={layout.height}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-3)" />
            </marker>
          </defs>
          {flow.edges.map((e) => {
            const a = layout.pos.get(e.from);
            const b = layout.pos.get(e.to);
            if (!a || !b) return null;
            const fromAcc = flow.accounts.get(e.from)!;
            const color = bankColor(fromAcc.bankCode, fromAcc.bank);
            const x1 = a.x + W;
            const y1 = a.y + H / 2;
            const x2 = b.x;
            const y2 = b.y + H / 2;
            const forward = x2 > x1;
            const d = forward
              ? `M ${x1} ${y1} C ${x1 + GAP_X / 2} ${y1}, ${x2 - GAP_X / 2} ${y2}, ${x2 - 2} ${y2}`
              : `M ${a.x + W / 2} ${a.y + H} C ${a.x + W / 2} ${a.y + H + 60}, ${b.x + W / 2} ${b.y + H + 60}, ${b.x + W / 2} ${b.y + H + 2}`;
            const sw = 1.5 + 7 * Math.sqrt(e.amount / layout.maxAmt);
            const dim = connected && !(connected.has(e.from) && connected.has(e.to) && (e.from === hover || e.to === hover));
            const mx = forward ? (x1 + x2) / 2 : (a.x + b.x + W) / 2;
            const my = forward ? (y1 + y2) / 2 : Math.max(a.y, b.y) + H + 45;
            return (
              <g key={`${e.from}-${e.to}`} style={{ opacity: dim ? 0.12 : 1, transition: "opacity .2s" }}>
                <path d={d} fill="none" stroke={color} strokeOpacity={0.28} strokeWidth={sw} strokeLinecap="round" />
                <path d={d} fill="none" stroke={color} strokeWidth={1.4} className="flow-edge" markerEnd="url(#arrow)" />
                <g transform={`translate(${mx}, ${my})`}>
                  <rect x={-46} y={-11} width={92} height={22} rx={11} fill="var(--surface)" stroke="var(--border)" />
                  <text textAnchor="middle" dy="4" fontSize="11" fontWeight={600} fill="var(--text)">
                    ฿{fmtMoney(e.amount, 0)}
                    {e.count > 1 ? ` ×${e.count}` : ""}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
        {[...flow.accounts.values()].map((a) => {
          const p = layout.pos.get(a.key)!;
          const color = bankColor(a.bankCode, a.bank);
          const dim = connected && !connected.has(a.key);
          return (
            <div
              key={a.key}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
              className={cx(
                "absolute flex flex-col justify-between overflow-hidden rounded-xl border bg-surface p-2.5 pl-3.5 shadow-sm transition-all duration-200",
                hover === a.key ? "z-10 border-primary shadow-lg" : "border-line",
                dim && "opacity-35",
              )}
              style={{ left: p.x, top: p.y, width: W, height: H }}
              title={[a.bank, a.accountNo, a.name, a.idNo].filter(Boolean).join(" · ")}
            >
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
              <div className="flex items-center gap-2">
                <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: color }}>
                  {a.bank}
                </span>
                <span className="truncate font-mono text-[12.5px] font-semibold text-ink">{maskAccount(a.accountNo, mask) || "—"}</span>
                <span className={cx("ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ROLE[a.role].cls)}>{ROLE[a.role].label}</span>
              </div>
              <div className="truncate text-[12px] text-ink-2">{a.name || "ไม่ทราบชื่อบัญชี"}</div>
              <div className="flex items-center gap-3 text-[11px]">
                {a.inCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-ok">
                    <ArrowDownLeft className="size-3" />฿{fmtMoney(a.inAmount, 0)}
                  </span>
                )}
                {a.outCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-danger">
                    <ArrowUpRight className="size-3" />฿{fmtMoney(a.outAmount, 0)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
