import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { captureSessions } from "@/db/schema";
import { getLatestProfileContextForOutreach } from "@/lib/profileCaptureContext";

export type ContextDepth = "missing" | "thin" | "ok";

export type ContactContextBundle = {
  contactId: string;
  profile_context: string;
  company_intel_context: string;
  context_completeness: {
    profile: ContextDepth;
    posts: ContextDepth;
    company: ContextDepth;
    web: ContextDepth;
  };
  capturedAt: {
    profile: string | null;
    posts: string | null;
    company: string | null;
    company_jobs: string | null;
    web_page: string | null;
  };
};

function profileDepthFromJson(
  json: Record<string, unknown> | null,
): ContextDepth {
  if (!json) return "missing";
  const about =
    typeof json.about === "string" ? json.about.trim() : "";
  const exp = Array.isArray(json.experienceBullets)
    ? json.experienceBullets.filter(
        (x) => typeof x === "string" && x.trim().length > 0,
      ).length
    : 0;
  const edu = Array.isArray(json.educationBullets)
    ? json.educationBullets.filter(
        (x) => typeof x === "string" && x.trim().length > 0,
      ).length
    : 0;
  if (about.length >= 40 || exp >= 1 || edu >= 1) return "ok";
  const hasCard =
    (typeof json.headline === "string" && json.headline.trim().length > 0) ||
    (typeof json.fullName === "string" && json.fullName.trim().length > 0) ||
    (typeof json.company === "string" && json.company.trim().length > 0);
  if (about.length > 0 || exp > 0 || edu > 0 || hasCard) return "thin";
  return "missing";
}

function postsDepthFromJson(
  json: Record<string, unknown> | null,
): ContextDepth {
  if (!json) return "missing";
  const posts = json.profilePosts;
  if (!Array.isArray(posts)) return "missing";
  const withText = posts.filter(
    (p) =>
      p &&
      typeof p === "object" &&
      typeof (p as { text?: string }).text === "string" &&
      (p as { text: string }).text.trim().length >= 8,
  );
  if (withText.length >= 2) return "ok";
  if (withText.length >= 1) return "thin";
  return "missing";
}

async function getLatestCaptureMeta(
  contactId: string,
  pageType: string,
): Promise<{ capturedAt: string | null; json: Record<string, unknown> | null }> {
  const db = getDb();
  const row = await db.query.captureSessions.findFirst({
    where: and(
      eq(captureSessions.contactId, contactId),
      eq(captureSessions.pageType, pageType),
    ),
    orderBy: [desc(captureSessions.capturedAt)],
  });
  if (!row) return { capturedAt: null, json: null };
  const raw = row.extractedJson;
  const json =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  return { capturedAt: row.capturedAt.toISOString(), json };
}

function formatCompanyIntelBlock(
  company: Record<string, unknown> | null,
  jobs: Record<string, unknown> | null,
  web: Record<string, unknown> | null,
  maxChars = 10_000,
): string {
  const parts: string[] = [];

  if (company) {
    const lines: string[] = [];
    const name = typeof company.name === "string" ? company.name.trim() : "";
    if (name) lines.push(`Company: ${name}`);
    const about =
      typeof company.about === "string" ? company.about.trim() : "";
    if (about) lines.push(`About: ${about.slice(0, 2000)}`);
    const industry =
      typeof company.industry === "string" ? company.industry.trim() : "";
    if (industry) lines.push(`Industry: ${industry}`);
    const size =
      typeof company.sizeLabel === "string" ? company.sizeLabel.trim() : "";
    if (size) lines.push(`Size: ${size}`);
    const website =
      typeof company.websiteUrl === "string" ? company.websiteUrl.trim() : "";
    if (website) lines.push(`Website: ${website}`);
    if (lines.length) parts.push(lines.join("\n"));
  }

  if (jobs) {
    const jobList = jobs.jobs;
    if (Array.isArray(jobList) && jobList.length > 0) {
      const lines: string[] = ["Open roles (LinkedIn jobs tab):"];
      for (let i = 0; i < jobList.length && i < 15; i++) {
        const j = jobList[i];
        if (!j || typeof j !== "object") continue;
        const title =
          typeof (j as { title?: string }).title === "string"
            ? (j as { title: string }).title.trim()
            : "";
        if (!title) continue;
        const loc =
          typeof (j as { location?: string }).location === "string"
            ? (j as { location: string }).location.trim()
            : "";
        const age =
          typeof (j as { ageLabel?: string }).ageLabel === "string"
            ? (j as { ageLabel: string }).ageLabel.trim()
            : "";
        lines.push(
          `${i + 1}. ${title}${loc ? ` — ${loc}` : ""}${age ? ` (${age})` : ""}`,
        );
      }
      if (lines.length > 1) parts.push(lines.join("\n"));
    }
  }

  if (web) {
    const title =
      typeof web.title === "string" ? web.title.trim() : "";
    const excerpt =
      typeof web.excerpt === "string" ? web.excerpt.trim() : "";
    const url =
      typeof web.sourceUrl === "string" ? web.sourceUrl.trim() : "";
    if (excerpt || title) {
      parts.push(
        [
          "Web page (careers / public):",
          url ? `URL: ${url}` : "",
          title ? `Title: ${title}` : "",
          excerpt ? excerpt.slice(0, 3000) : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  let text = parts.join("\n\n");
  if (!text) return "";
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return text;
}

function companyDepth(
  company: Record<string, unknown> | null,
  jobs: Record<string, unknown> | null,
): ContextDepth {
  if (!company && !jobs) return "missing";
  if (jobs) {
    const jobList = jobs.jobs;
    if (Array.isArray(jobList) && jobList.length > 0) return "ok";
  }
  if (company) {
    const about =
      typeof company.about === "string" ? company.about.trim() : "";
    const name = typeof company.name === "string" ? company.name.trim() : "";
    if (about.length >= 40 || name) return "thin";
  }
  return "thin";
}

function webDepth(web: Record<string, unknown> | null): ContextDepth {
  if (!web) return "missing";
  const excerpt =
    typeof web.excerpt === "string" ? web.excerpt.trim() : "";
  if (excerpt.length >= 200) return "ok";
  if (excerpt.length > 0) return "thin";
  return "missing";
}

export async function buildContactContextBundle(
  contactId: string,
): Promise<ContactContextBundle> {
  const [profileMeta, postsMeta, companyMeta, jobsMeta, webMeta, profile_context] =
    await Promise.all([
      getLatestCaptureMeta(contactId, "profile"),
      getLatestCaptureMeta(contactId, "posts"),
      getLatestCaptureMeta(contactId, "company"),
      getLatestCaptureMeta(contactId, "company_jobs"),
      getLatestCaptureMeta(contactId, "web_page"),
      getLatestProfileContextForOutreach(contactId),
    ]);

  const profileDepth = profileMeta.json
    ? profileDepthFromJson(profileMeta.json)
    : profileMeta.capturedAt
      ? "thin"
      : "missing";

  return {
    contactId,
    profile_context,
    company_intel_context: formatCompanyIntelBlock(
      companyMeta.json,
      jobsMeta.json,
      webMeta.json,
    ),
    context_completeness: {
      profile: profileDepth,
      posts: postsDepthFromJson(postsMeta.json),
      company: companyDepth(companyMeta.json, jobsMeta.json),
      web: webDepth(webMeta.json),
    },
    capturedAt: {
      profile: profileMeta.capturedAt,
      posts: postsMeta.capturedAt,
      company: companyMeta.capturedAt,
      company_jobs: jobsMeta.capturedAt,
      web_page: webMeta.capturedAt,
    },
  };
}

/** Labeled JSON for LLM user payloads. */
export function formatContactContextBundleForPrompt(
  bundle: ContactContextBundle,
): Record<string, unknown> {
  return {
    PROFILE_AND_POSTS: bundle.profile_context || null,
    COMPANY_INTEL: bundle.company_intel_context || null,
    context_completeness: bundle.context_completeness,
    captured_at: bundle.capturedAt,
  };
}
