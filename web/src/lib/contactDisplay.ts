/**
 * Human-readable labels for contacts that may be URL stubs (no name captured yet).
 */

type PickerContact = {
  id: string;
  fullName: string | null;
  headline: string | null;
  company: string | null;
  linkedinUrlCanonical: string | null;
};

function linkedinVanityFromCanonical(canonical: string | null | undefined): string | null {
  if (!canonical?.trim()) return null;
  try {
    const u = new URL(canonical.trim());
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) {
      return decodeURIComponent(parts[1]);
    }
    return null;
  } catch {
    return null;
  }
}

/** Short, stable suffix when we have no name (not the full UUID in the UI). */
function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

/**
 * Label for &lt;select&gt; options: prefer name/headline, then LinkedIn /in/handle,
 * then a short id token — never the full UUID as the only text.
 */
export function contactPickerLabel(c: PickerContact): string {
  const name = (c.fullName || c.headline)?.trim();
  if (name) {
    const co = c.company?.trim();
    const suffix = co ? ` · ${co.slice(0, 40)}` : "";
    return `${name.slice(0, 80)}${suffix}`;
  }
  const vanity = linkedinVanityFromCanonical(c.linkedinUrlCanonical ?? undefined);
  if (vanity) {
    const co = c.company?.trim();
    const suffix = co ? ` · ${co.slice(0, 40)}` : "";
    return `in/${vanity.slice(0, 72)} (LinkedIn)${suffix}`;
  }
  return `Unnamed · …${shortId(c.id)}`;
}
