/** Wider layout for Data & cleaning routes (contacts, queue, cleaning, captures, autopilot). */
export default function DataSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto w-full max-w-[90rem]">{children}</div>;
}
