/**
 * Stable identity for deduping LinkedIn profiles from visible URLs.
 */
export function canonicalizeLinkedInUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.endsWith("linkedin.com")) return null;
    const path =
      u.pathname.replace(/\/+$/, "") || u.pathname;
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) {
      const slug = decodeURIComponent(parts[1]).normalize("NFC").toLowerCase();
      return `https://www.linkedin.com/in/${slug}`;
    }
    if (parts[0] === "sales" && parts[1] === "lead" && parts[2]) {
      const slug = decodeURIComponent(parts[2]).normalize("NFC");
      // Sales Navigator lead IDs are not public /in/ vanity slugs — keep separate identity.
      if (/^ACw/i.test(slug) || slug.length > 36) {
        return `https://www.linkedin.com/sales/lead/${slug}`;
      }
      return `https://www.linkedin.com/in/${slug.toLowerCase()}`;
    }
    return `https://www.linkedin.com${path}`;
  } catch {
    return null;
  }
}

export function normalizeCompany(name: string | undefined | null): string | null {
  if (!name?.trim()) return null;
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/g, "");
}
