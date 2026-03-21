import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </>
  );
}
