/**
 * LinkedIn list/profile scrapes often return one text blob in fullName (name+title+company).
 * Split into fullName, headline, company using common FR/EN patterns.
 */

export type PersonExtract = {
  fullName?: string;
  headline?: string;
  company?: string;
  location?: string;
};

function clean(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/\s+/g, " ").trim();
}

/** Title-like fragment starts with these (FR/EN LinkedIn). */
const TITLE_LEAD =
  /^(Chef|Directeur|Directrice|Manager|Ingénieur|Ing\.|Engineer|Engineering|Partner|Partners|Consultant|Consultante|Engagement|Principal|Associate|Associé|Associée|Head|Lead|Senior|Junior|CIO|CTO|CEO|COO|CFO|Officer|President|Vice|VP|Developer|Designer|Analyst|Architect|Specialist|Advisor|Conseil|Professeur|Professor|Research|Product|Project|Programme|Program|Business|Sales|Marketing|Founder|Co-founder|Owner|Director|Investment|Transformation|Cloud|Data|Software|Freelance|Independent|Self-employed|Stagiaire|Intern|Student|PhD|Dr\.|MD|Chief|Executive|Chair|Board|Member|Administrator|Responsable|Coordinateur|Expert|Technique|Commercial|Legal|Finance|HR|Human|Operations|Strategy|Innovation|Digital|IT|ICT|International|Global|Regional|Country|Area)\b/i;

function stripChez(s: string): { rest: string; co?: string } {
  const t = clean(s);
  const idx = t.toLowerCase().lastIndexOf(" chez ");
  if (idx === -1) return { rest: t };
  const co = t.slice(idx + 6).trim();
  const rest = t.slice(0, idx).trim();
  if (!co || !rest) return { rest: t };
  return { rest, co };
}

function stripAtCompany(s: string): { rest: string; co?: string } {
  const t = clean(s);
  const idx = t.toLowerCase().lastIndexOf(" at ");
  if (idx === -1) return { rest: t };
  const co = t.slice(idx + 4).trim();
  const rest = t.slice(0, idx).trim();
  if (!co || !rest || co.split(/\s+/).length > 12) return { rest: t };
  return { rest, co };
}

/**
 * "Partner & Investment Director - Vauban Infrastructure Partners"
 * → role left, company right (last " - " wins).
 */
function splitHeadlineDashCompany(h: string): { headline: string; co?: string } {
  const t = clean(h);
  const idx = t.lastIndexOf(" - ");
  if (idx === -1) return { headline: t };
  const right = t.slice(idx + 3).trim();
  const left = t.slice(0, idx).trim();
  if (!left || !right || right.length > 120) return { headline: t };
  if (right.split(/\s+/).length > 16) return { headline: t };
  if (TITLE_LEAD.test(right)) return { headline: t };
  return { headline: left, co: right };
}

/**
 * Split "Adrien MISITIEngagement Manager" → name + title using a
 * lowercase→uppercase boundary where the right side looks like a job title.
 */
function splitConcatenatedNameTitle(blob: string): { name: string; title?: string } {
  const t = clean(blob);
  if (t.length < 4) return { name: t };

  const cuts: number[] = [];
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i];
    const b = t[i + 1];
    if (/[a-zàâäéèêëïîôùûüç]/.test(a) && /[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜ]/.test(b)) {
      cuts.push(i + 1);
    }
  }
  if (cuts.length === 0) return { name: t };

  for (let j = cuts.length - 1; j >= 0; j--) {
    const idx = cuts[j];
    const left = t.slice(0, idx).trim();
    const right = t.slice(idx).trim();
    if (left.length < 2) continue;
    if (TITLE_LEAD.test(right) || (right.length >= 8 && /[a-zàâäéèêëïîôùûüç]/.test(right)))
      return { name: left, title: right };
  }

  const idx = cuts[cuts.length - 1];
  return { name: t.slice(0, idx).trim(), title: t.slice(idx).trim() };
}

/**
 * Normalize scraped person fields (safe to run on every ingest).
 */
export function normalizeExtractedPersonFields(input: PersonExtract): PersonExtract {
  let name = clean(input.fullName);
  let headline = clean(input.headline);
  let company = clean(input.company);
  const location = input.location;

  if (!name && headline) {
    name = headline;
    headline = "";
  }

  let ch = stripChez(name);
  if (ch.co) {
    name = ch.rest;
    company = company || ch.co;
  } else if (headline) {
    ch = stripChez(headline);
    if (ch.co) {
      headline = ch.rest;
      company = company || ch.co;
    }
  }

  if (!company && name) {
    const at = stripAtCompany(name);
    if (at.co) {
      name = at.rest;
      company = at.co;
    }
  }

  if (!company && name.includes("·")) {
    const parts = name.split("·").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (last.length > 2 && last.length < 120 && last.split(/\s+/).length <= 14) {
        company = last;
        name = parts.slice(0, -1).join(" · ").trim();
      }
    }
  }

  const split = splitConcatenatedNameTitle(name);
  if (split.title) {
    headline = headline || split.title;
    name = split.name;
  }

  if (headline && !company) {
    ch = stripChez(headline);
    if (ch.co) {
      headline = ch.rest;
      company = ch.co;
    }
  }

  if (headline && !company) {
    const at = stripAtCompany(headline);
    if (at.co) {
      headline = at.rest;
      company = at.co;
    }
  }

  if (headline && !company) {
    const sd = splitHeadlineDashCompany(headline);
    headline = sd.headline;
    if (sd.co) company = sd.co;
  }

  if (headline === name) headline = "";

  headline = clean(headline);
  name = clean(name);
  company = clean(company);

  return {
    fullName: name || undefined,
    headline: headline || undefined,
    company: company || undefined,
    location: location ? clean(location) || undefined : undefined,
  };
}
