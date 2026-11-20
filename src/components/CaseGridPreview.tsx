"use client";

import { useMemo } from "react";
import type { FlowResult } from "@/lib/flow";
import { buildCaseGrid, levelFill, mergeSpans } from "@/lib/export/grid";
import { fmtDate, fmtTime } from "@/lib/client";

/** พรีวิวไฟล์รูปแบบ 3.case เหมือนเปิดใน Excel */
export function CaseGridPreview({
  flow,
  caseNo,
  mask,
  era,
  merge = false,
  limit = 200,
}: {
  flow: FlowResult;
  caseNo: string;
  mask: boolean;
  era: "BE" | "CE";
  merge?: boolean;
  limit?: number;
}) {
  const grid = useMemo(() => buildCaseGrid(flow, { mask }), [flow, mask]);
  const spans = useMemo(() => (merge ? mergeSpans(flow.chains.slice(0, limit)) : null), [merge, flow, limit]);
  const cols = grid.columns.length;
  const letters = useMemo(
    () =>
      Array.from({ length: cols }, (_, i) => {
        let s = "";
        let n = i + 1;
        while (n > 0) {
          const m = (n - 1) % 26;
          s = String.fromCharCode(65 + m) + s;
          n = Math.floor((n - 1) / 26);
        }
        return s;
      }),
    [cols],
  );

  return (
    <div className="scroll-thin overflow-auto rounded-2xl border border-line bg-white text-slate-900 dark:bg-[#1b2234] dark:text-slate-100" style={{ maxHeight: 560 }}>
      <table className="xl-grid border-collapse" style={{ fontFamily: "Tahoma, var(--font-thai), sans-serif" }}>
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-100 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <th className="w-10" />
            {letters.map((l) => (
              <th key={l} className="font-normal">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bg-slate-100 text-center text-[11px] text-slate-500 dark:bg-slate-800">1</td>
            {Array.from({ length: cols }, (_, i) =>
              i === 3 ? (
                <td key={i} colSpan={Math.min(6, cols - 3)} className="text-center !border-transparent">
                  case {caseNo}
                </td>
              ) : i > 3 && i < 9 ? null : (
                <td key={i} className="!border-transparent" />
              ),
            )}
          </tr>
          <tr>
            <td className="bg-slate-100 text-center text-[11px] text-slate-500 dark:bg-slate-800">2</td>
            <td colSpan={cols} className="!border-transparent" />
          </tr>
          <tr>
            <td className="bg-slate-100 text-center text-[11px] text-slate-500 dark:bg-slate-800">3</td>
            {grid.columns.map((c, i) => (
              <td
                key={i}
                style={c.kind === "bank" || c.kind === "account" ? { background: `#${levelFill(c.level)}`, color: "#0f172a" } : undefined}
              >
                {c.header}
              </td>
            ))}
          </tr>
          {grid.rows.slice(0, limit).map((row, r) => (
            <tr key={r} className={flow.chains[r].linked ? "" : "italic opacity-80"}>
              <td className="bg-slate-100 text-center text-[11px] text-slate-500 not-italic dark:bg-slate-800">{r + 4}</td>
              {row.map((g, i) => {
                if (!g) return <td key={i} className="!border-transparent" />;
                const colored = g.kind === "bank" || g.kind === "account";
                const span = colored && spans ? spans.get(`${r}:${g.level}`) : undefined;
                if (span === 0) return null;
                const v =
                  g.kind === "date"
                    ? g.value
                      ? fmtDate(g.value as string, era)
                      : ""
                    : g.kind === "time"
                      ? g.value
                        ? fmtTime(g.value as string)
                        : ""
                      : g.kind === "amount"
                        ? g.value === null
                          ? ""
                          : (g.value as number).toLocaleString("en-US", { maximumFractionDigits: 2 })
                        : g.value;
                return (
                  <td
                    key={i}
                    rowSpan={span && span > 1 ? span : undefined}
                    className={span && span > 1 ? "text-center align-middle" : g.kind === "amount" || g.kind === "time" || g.kind === "date" ? "text-right" : ""}
                    style={colored ? { background: `#${levelFill(g.level)}`, color: "#0f172a" } : undefined}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {grid.rows.length > limit && (
        <div className="sticky left-0 p-3 text-[12px] text-slate-500">แสดง {limit} จาก {grid.rows.length} แถว (ไฟล์ Excel จะมีครบทุกแถว)</div>
      )}
    </div>
  );
}
