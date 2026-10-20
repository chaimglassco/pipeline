import type { Metadata } from "next";
import { SharedDashboardWorkspace } from "@/features/dashboard/ui/shared-dashboard-workspace";

export const metadata: Metadata = {
  title: "Weekly PPC Performance",
  description: "Weekly PPC goals, budgets, performance notes, and action plans by product.",
};
export const dynamic = "force-dynamic";

export default function PpcDashboardPage() {
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return <SharedDashboardWorkspace initialToday={todayIso} />;
}
