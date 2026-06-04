/** ESLint on staged web TS/TSX only (runs from web/ so Next config resolves). */
function eslintWeb(filenames) {
  if (!filenames.length) return [];
  const quoted = filenames.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(" ");
  return `node scripts/lint-staged-eslint.mjs ${quoted}`;
}

/** @type {import('lint-staged').Configuration} */
export default {
  "web/**/*.{ts,tsx}": eslintWeb,
};
