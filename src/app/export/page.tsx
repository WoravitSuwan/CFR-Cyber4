import { Suspense } from "react";
import type { Metadata } from "next";
import { ExportCenter } from "@/components/ExportCenter";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "ส่งออก Excel" };

export default function ExportPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
      <ExportCenter />
    </Suspense>
  );
}
