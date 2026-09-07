/** Default content width for Home, Outreach, Branding, Settings, etc. */
export default function StandardSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto w-full max-w-7xl">{children}</div>;
}
