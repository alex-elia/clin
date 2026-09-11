import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { EditorialQueueDrain } from "@/components/EditorialQueueDrain";
import { DailyReminderBanner } from "@/components/DailyReminderBanner";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <EditorialQueueDrain />
      <DailyReminderBanner />
      <Nav />
      <div className="flex-1 px-4 py-8 w-full">{children}</div>
      <SiteFooter />
    </div>
  );
}
