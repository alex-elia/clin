/** Remove unpaired UTF-16 high/low surrogates (invalid in JSON / OVH APIs). */
export function stripLoneSurrogates(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i]! + text[i + 1]!;
        i++;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += text[i]!;
  }
  return out;
}

/** Truncate by Unicode code point; never split surrogate pairs. */
export function safeTruncate(text: string, maxChars: number, suffix = "…"): string {
  const codePoints = [...text];
  if (codePoints.length <= maxChars) return text;

  const suffixPoints = [...suffix];
  const keep = Math.max(0, maxChars - suffixPoints.length);
  return codePoints.slice(0, keep).join("") + suffix;
}

/** Strip lone surrogates and null bytes before LLM / JSON payloads. */
export function sanitizeLlmPromptText(text: string): string {
  return stripLoneSurrogates(text).replace(/\0/g, "");
}
