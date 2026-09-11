import { FinOpsDashboard } from "@/components/FinOpsDashboard";

export const dynamic = "force-dynamic";

export default function FinOpsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <FinOpsDashboard />
    </div>
  );
}
