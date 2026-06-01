import type { PersonExtract } from "@/lib/linkedinNormalize";
import { sanitizeScrapedFullName } from "@/lib/linkedinNormalize";

/** Same signal as linkedinNormalize — name field polluted with a job title. */
const TITLE_LEAD =
  /^(Chef|Directeur|Directrice|Manager|Ingénieur|Ing\.|Engineer|Engineering|Partner|Partners|Consultant|Consultante|Engagement|Principal|Associate|Associé|Associée|Head|Lead|Senior|Junior|CIO|CTO|CEO|COO|CFO|Officer|President|Vice|VP|Developer|Designer|Analyst|Architect|Specialist|Advisor|Conseil|Professeur|Professor|Research|Product|Project|Programme|Program|Business|Sales|Marketing|Founder|Co-founder|Owner|Director|Investment|Transformation|Cloud|Data|Software|Freelance|Independent|Self-employed|Stagiaire|Intern|Student|PhD|Dr\.|MD|Chief|Executive|Chair|Board|Member|Administrator|Responsable|Coordinateur|Expert|Technique|Commercial|Legal|Finance|HR|Human|Operations|Strategy|Innovation|Digital|IT|ICT|International|Global|Regional|Country|Area)\b/i;

function clean(s: string | undefined | null): string | null {
  if (!s?.trim()) return null;
  return s.replace(/\s+/g, " ").trim();
}

function looksLikeNotificationUi(text: string): boolean {
  return /gérer les notifications|manage notifications/i.test(text);
}

function looksLikeMisplacedTitle(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length > 72) return true;
  if (TITLE_LEAD.test(t)) return true;
  if (/\b(Manager|Director|Engineer|Consultant|Partner)\b/i.test(t) && t.split(/\s+/).length >= 3) {
    return true;
  }
  return false;
}

/**
 * Merge scraped person fields onto an existing contact row.
 * List/connections imports often land title blobs in `fullName`; profile captures should repair that.
 */
export function mergePersonFields(
  existing: {
    fullName?: string | null;
    headline?: string | null;
    company?: string | null;
    location?: string | null;
    connectionDegree?: string | null;
  },
  incoming: PersonExtract & { connectionDegree?: string },
  ctx: { pageType: string },
): PersonExtract & { connectionDegree?: string } {
  const pageType = ctx.pageType;

  const mergeScalar = (
    field: "fullName" | "headline" | "company" | "location" | "connectionDegree",
    ex: string | null,
    inc: string | undefined,
  ): string | null => {
    const incoming = clean(inc ?? undefined);
    if (!incoming) return ex;
    if (!ex) return incoming;

    if (pageType === "profile") {
      if (field === "fullName") {
        if (looksLikeNotificationUi(ex)) return incoming;
        if (looksLikeMisplacedTitle(ex) && !looksLikeMisplacedTitle(incoming)) {
          return incoming;
        }
        const exWords = ex.split(/\s+/).length;
        const inWords = incoming.split(/\s+/).length;
        if (exWords >= 6 && inWords <= 5) return incoming;
        if (ex.length > 55 && incoming.length <= 45 && inWords >= 2) return incoming;
      }
      if (field === "headline" && (ex.length < incoming.length || looksLikeMisplacedTitle(ex))) {
        return incoming;
      }
      if (field === "company" && ex.length < 3) return incoming;
      if (field === "location" && ex.length < 3) return incoming;
    }

    return ex;
  };

  return {
    fullName:
      mergeScalar(
        "fullName",
        clean(existing.fullName),
        incoming.fullName,
      ) ?? undefined,
    headline:
      mergeScalar(
        "headline",
        clean(existing.headline),
        incoming.headline,
      ) ?? undefined,
    company:
      mergeScalar(
        "company",
        clean(existing.company),
        incoming.company,
      ) ?? undefined,
    location:
      mergeScalar(
        "location",
        clean(existing.location),
        incoming.location,
      ) ?? undefined,
    connectionDegree:
      mergeScalar(
        "connectionDegree",
        clean(existing.connectionDegree),
        incoming.connectionDegree,
      ) ?? undefined,
  };
}
