import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { EditorialQueueDrain } from "@/components/EditorialQueueDrain";

export const dynamic = "force-dynamic";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <EditorialQueueDrain />
      <Nav />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</div>
      <SiteFooter />
    </div>
  );
}
