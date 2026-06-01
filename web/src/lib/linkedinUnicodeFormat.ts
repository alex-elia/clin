/**
 * LinkedIn feed posts do not support HTML/markdown styling.
 * Unicode mathematical alphanumeric symbols mimic bold/italic (see Typegrow-style formatters).
 */

type EmphasisStyle = "bold" | "italic" | "boldItalic";

const RANGES: Record<
  EmphasisStyle,
  { upper: number; lower: number; digit: number }
> = {
  bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  italic: { upper: 0x1d434, lower: 0x1d44e, digit: 0x1d7e2 },
  boldItalic: { upper: 0x1d468, lower: 0x1d482, digit: 0x1d7f6 },
};

function toUnicodeStyle(text: string, style: EmphasisStyle): string {
  const { upper, lower, digit } = RANGES[style];
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0);
      if (code === undefined) return char;
      if (code >= 0x41 && code <= 0x5a) {
        return String.fromCodePoint(upper + (code - 0x41));
      }
      if (code >= 0x61 && code <= 0x7a) {
        return String.fromCodePoint(lower + (code - 0x61));
      }
      if (code >= 0x30 && code <= 0x39) {
        return String.fromCodePoint(digit + (code - 0x30));
      }
      return char;
    })
    .join("");
}

/** Convert `**bold**`, `*italic*`, `***both***` markers to Unicode styled text. */
export function applyLinkedInUnicodeEmphasis(text: string): string {
  let out = text;
  out = out.replace(
    /\*\*\*([^*\n]+)\*\*\*/g,
    (_, inner: string) => toUnicodeStyle(inner, "boldItalic"),
  );
  out = out.replace(
    /\*\*([^*\n]+)\*\*/g,
    (_, inner: string) => toUnicodeStyle(inner, "bold"),
  );
  out = out.replace(
    /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
    (_, inner: string) => toUnicodeStyle(inner, "italic"),
  );
  return out;
}
