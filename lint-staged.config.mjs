import path from "node:path";

/** ESLint on staged web TS/TSX only (runs from web/ so Next config resolves). */
function eslintWeb(filenames) {
  const rel = filenames
    .map((f) => path.relative("web", f).split(path.sep).join("/"))
    .filter(Boolean);
  if (!rel.length) return [];
  const quoted = rel.map((f) => `"${f}"`).join(" ");
  return `npm --prefix web exec eslint --fix --max-warnings 0 ${quoted}`;
}

/** @type {import('lint-staged').Configuration} */
export default {
  "web/**/*.{ts,tsx}": eslintWeb,
};
