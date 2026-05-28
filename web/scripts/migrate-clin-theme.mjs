import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

const replacements = [
  [/text-zinc-900 dark:text-zinc-50/g, "text-clin-text"],
  [/text-zinc-900 dark:text-zinc-100/g, "text-clin-text"],
  [/font-medium text-zinc-900 dark:text-zinc-100/g, "clin-field-label"],
  [/font-medium text-zinc-800 dark:text-zinc-200/g, "clin-strong"],
  [/text-zinc-600 dark:text-zinc-400/g, "text-clin-muted"],
  [/text-zinc-700 dark:text-zinc-300/g, "text-clin-muted"],
  [/text-zinc-500 dark:text-zinc-400/g, "text-clin-muted"],
  [/text-zinc-500/g, "text-clin-muted"],
  [/text-zinc-400/g, "text-clin-muted"],
  [/text-blue-600 underline dark:text-blue-400/g, "clin-link"],
  [/text-blue-600 underline/g, "clin-link"],
  [
    /space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950/g,
    "clin-card space-y-4 p-5",
  ],
  [
    /space-y-5 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950/g,
    "clin-card space-y-5 p-5",
  ],
  [
    /rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950/g,
    "clin-card p-5",
  ],
  [
    /rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/g,
    "clin-card",
  ],
  [
    /rounded-lg border border-zinc-200 bg-zinc-50\/50 p-4 dark:border-zinc-800 dark:bg-zinc-900\/40/g,
    "clin-callout",
  ],
  [
    /rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white/g,
    "clin-btn-primary",
  ],
  [
    /rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900/g,
    "clin-btn-primary",
  ],
  [
    /rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white/g,
    "clin-btn-primary",
  ],
  [
    /rounded-md bg-zinc-900 px-3 py-1\.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white/g,
    "clin-btn-primary",
  ],
  [
    /mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100/g,
    "mt-1 clin-input",
  ],
  [
    /mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600/g,
    "mt-1 clin-input font-mono text-xs",
  ],
  [
    /mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600/g,
    "mt-1 clin-input",
  ],
  [
    /rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100/g,
    "clin-input",
  ],
  [
    /rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100/g,
    "clin-input",
  ],
  [
    /rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 enabled:hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:enabled:hover:bg-zinc-800/g,
    "clin-btn-secondary disabled:cursor-not-allowed disabled:opacity-50",
  ],
  [/rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900/g, "clin-code"],
  [/rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-900/g, "clin-code font-mono"],
  [/rounded bg-zinc-100 px-1 dark:bg-zinc-900/g, "clin-code"],
  [
    /break-all rounded bg-zinc-100 px-1 text-\[11px\] dark:bg-zinc-900/g,
    "clin-code break-all text-[11px]",
  ],
  [/block text-xs text-zinc-500/g, "clin-field-hint"],
  [
    /overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800/g,
    "clin-table-wrap",
  ],
  [
    /className="min-w-full text-left text-sm"/g,
    'className="clin-table"',
  ],
  [/bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/g, "text-xs uppercase text-clin-muted"],
  [/divide-y divide-zinc-200 dark:divide-zinc-800/g, ""],
  [/className="bg-white dark:bg-zinc-950"/g, ""],
  [
    /rounded-full bg-zinc-100 px-3 py-1 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200/g,
    "clin-pill",
  ],
  [
    /rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-900/g,
    "clin-pill",
  ],
  [
    /rounded-full bg-zinc-100 px-2\.5 py-1 text-xs dark:bg-zinc-900/g,
    "clin-pill",
  ],
  [
    /rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/g,
    "clin-card p-4",
  ],
  [
    /rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/g,
    "clin-card p-4",
  ],
  [
    /rounded-lg border border-zinc-200 p-4 dark:border-zinc-800/g,
    "clin-card p-4",
  ],
  [/stroke-zinc-200 dark:stroke-zinc-700/g, "stroke-clin-border"],
  [/className="hover:underline"/g, 'className="clin-link"'],
  [/text-sm text-zinc-600 underline dark:text-zinc-400/g, "clin-link text-sm"],
  [/font-medium text-zinc-900 hover:underline dark:text-zinc-50/g, "font-medium text-clin-text clin-link"],
  [
    /rounded-lg border border-zinc-200 bg-zinc-50\/80 p-4 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900\/40 dark:text-zinc-300/g,
    "clin-callout",
  ],
  [/border-t border-zinc-200 pt-3 text-xs text-clin-muted dark:border-zinc-700/g, "border-t border-clin-border pt-3 text-xs text-clin-muted"],
  [
    /rounded-lg border border-zinc-200 bg-zinc-50\/50 p-4 dark:border-zinc-800 dark:bg-zinc-900\/30/g,
    "clin-callout",
  ],
  [
    /mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-clin-muted dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600/g,
    "mt-1 clin-input",
  ],
  [
    /mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-clin-muted dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600/g,
    "mt-1 clin-input font-mono text-xs",
  ],
  [
    /w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100/g,
    "w-full clin-input font-mono text-xs leading-relaxed",
  ],
  [/text-sm leading-relaxed text-zinc-800 dark:text-zinc-200/g, "text-sm leading-relaxed text-clin-text"],
  [/border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900\/60/g, "border-clin-border bg-clin-surface-muted"],
  [
    /rounded-md border border-zinc-300 bg-white px-3 py-1\.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200/g,
    "clin-btn-secondary text-xs px-3 py-1.5",
  ],
  [/border-t border-zinc-200 pt-5 dark:border-zinc-800/g, "border-t border-clin-border pt-5"],
  [/rounded-md bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900\/80/g, "rounded-md bg-clin-surface-muted px-3 py-2 text-xs"],
  [
    /rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900/g,
    "clin-btn-primary disabled:opacity-50",
  ],
  [
    /pre className="mt-2 max-h-80 overflow-auto rounded-md bg-zinc-900 p-3 text-\[11px\] leading-relaxed text-zinc-100"/g,
    'pre className="mt-2 max-h-80 overflow-auto rounded-md bg-clin-navy p-3 text-[11px] leading-relaxed text-white"',
  ],
  [
    /rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300/g,
    "clin-callout text-xs",
  ],
  [
    /\? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-600"/g,
    '? "clin-btn-primary" : "clin-btn-secondary"',
  ],
  [
    /isActive\s*\?\s*"rounded-full border border-zinc-900 bg-zinc-900 px-2\.5 py-1 text-xs font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"\s*:\s*"rounded-full border border-zinc-300 px-2\.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"/g,
    'isActive ? "clin-pill clin-pill-active" : "clin-pill"',
  ],
  [
    /rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/g,
    "clin-input text-sm",
  ],
  [/rounded bg-zinc-900 px-3 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900/g, "clin-btn-primary text-xs px-3 py-1"],
  [/flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800/g, "flex flex-wrap gap-2 border-b border-clin-border pb-3"],
  [
    /rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/g,
    "clin-card p-5",
  ],
  [
    /mt-1 min-h-\[140px\] w-full rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100/g,
    "mt-1 min-h-[140px] w-full clin-input p-3 text-sm",
  ],
  [/rounded-md border border-zinc-300 px-3 py-1\.5 text-xs dark:border-zinc-600/g, "clin-btn-secondary text-xs px-3 py-1.5"],
  [
    /max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200/g,
    "max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-clin-surface-muted p-3 text-sm text-clin-text",
  ],
  [/rounded-md bg-zinc-900 px-3 py-1\.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900/g, "clin-btn-primary text-xs px-3 py-1.5"],
  [/rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900/g, "clin-btn-primary text-xs px-2 py-1 disabled:opacity-50"],
  [/rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600/g, "clin-btn-secondary text-xs px-2 py-1"],
  [/rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-600 dark:text-clin-muted/g, "clin-btn-secondary text-xs px-2 py-1 text-clin-muted"],
  [/rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600/g, "clin-btn-secondary text-sm px-3 py-2"],
  [/text-sm text-zinc-600 underline dark:text-clin-muted/g, "clin-link text-sm"],
  [/text-zinc-600 underline dark:text-clin-muted/g, "clin-link"],
  [/rounded bg-zinc-100 px-2 py-0\.5 dark:bg-zinc-900/g, "clin-pill"],
  [/bg-zinc-50 text-xs uppercase text-clin-muted dark:bg-zinc-900/g, "text-xs uppercase text-clin-muted"],
  [/text-2xl font-semibold tracking-tight(?! text-)/g, "clin-page-title"],
  [/text-2xl font-semibold tracking-tight text-clin-text/g, "clin-page-title"],
  [/text-xl font-semibold tracking-tight/g, "clin-section-title"],
  [/text-lg font-semibold text-clin-text/g, "clin-section-title"],
  [
    /\? "rounded-full border border-zinc-900 bg-zinc-900 px-2\.5 py-1 text-xs font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"\s*:\s*"rounded-full border border-zinc-300 px-2\.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"/g,
    '? "clin-pill clin-pill-active" : "clin-pill"',
  ],
  [
    /rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/g,
    "clin-input text-sm",
  ],
  [
    /w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/g,
    "w-full clin-input text-sm",
  ],
  [
    /mt-1 w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/g,
    "mt-1 w-full max-w-md clin-input text-sm",
  ],
  [
    /mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/g,
    "mt-1 w-full clin-input text-sm",
  ],
  [
    /w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900/g,
    "w-full clin-input font-mono text-xs",
  ],
  [/rounded-md border border-zinc-200 p-3 dark:border-zinc-800/g, "clin-card p-3"],
  [/rounded bg-zinc-100 px-1 dark:bg-zinc-800/g, "clin-code"],
  [
    /rounded-md border border-zinc-300 bg-white px-3 py-1\.5 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900/g,
    "clin-btn-secondary text-sm px-3 py-1.5",
  ],
  [
    /rounded-lg border border-zinc-200 bg-zinc-50\/80 p-4 dark:border-zinc-800 dark:bg-zinc-900\/40/g,
    "clin-callout",
  ],
  [
    /mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200/g,
    "mt-3 clin-callout text-sm text-clin-text",
  ],
  [
    /rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950/g,
    "clin-card p-4 text-sm",
  ],
  [
    /rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900/g,
    "clin-btn-primary text-sm px-3 py-2 disabled:opacity-40",
  ],
  [
    /rounded-md bg-zinc-900 px-3 py-1\.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900/g,
    "clin-btn-primary text-sm px-3 py-1.5",
  ],
  [/ml-2 w-20 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900/g, "ml-2 w-20 clin-input"],
  [/w-24 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900/g, "w-24 clin-input"],
  [
    /rounded-md border border-zinc-400 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-500 dark:text-zinc-300/g,
    "clin-btn-secondary text-xs px-2 py-1",
  ],
  [
    /rounded bg-zinc-100 px-1\.5 py-0\.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300/g,
    "clin-pill text-xs",
  ],
  [/decoration-zinc-400/g, "decoration-clin-muted"],
  [/rounded border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800/g, "rounded border border-clin-border px-3 py-2 text-sm"],
  [/rounded-md border px-3 py-2 dark:border-zinc-800/g, "rounded-md border border-clin-border px-3 py-2"],
  [
    /\? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"/g,
    '? "clin-tab-active"',
  ],
  [/text-sm text-zinc-600 dark:text-zinc-300/g, "text-sm text-clin-muted"],
  [/className="underline"/g, 'className="clin-link"'],
  [/font-medium text-sky-700 underline dark:text-sky-400/g, "clin-link font-medium"],
  [/text-xs font-medium text-sky-700 underline dark:text-sky-400/g, "clin-link text-xs font-medium"],
];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx") && !p.includes("node_modules")) {
      let s = fs.readFileSync(p, "utf8");
      const orig = s;
      for (const [re, rep] of replacements) s = s.replace(re, rep);
      if (s !== orig) {
        fs.writeFileSync(p, s);
        console.info("updated", path.relative(root, p));
      }
    }
  }
}

walk(root);
