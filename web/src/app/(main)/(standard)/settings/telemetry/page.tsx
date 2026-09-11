import { TelemetryDashboard } from "@/components/TelemetryDashboard";

export const dynamic = "force-dynamic";

export default function TelemetryPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <TelemetryDashboard />
    </div>
  );
}
