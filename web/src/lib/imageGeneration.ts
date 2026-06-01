/**
 * Post image generation: Stability SD3 first, OVH SDXL fallback (Nemrut AI Audit pattern).
 */

export type ImageGenerationProvider = "stability" | "ovh";

/** After this kind of Stability failure, use OVH SDXL when configured. */
export function stabilityErrorImpliesOvhFallback(
  error: string | undefined,
  httpStatus?: number,
): boolean {
  if (httpStatus === 402 || httpStatus === 429) return true;
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes("credit") ||
    e.includes("quota") ||
    e.includes("insufficient") ||
    e.includes("payment_required") ||
    e.includes("payment") ||
    e.includes("billing") ||
    e.includes("balance") ||
    e.includes('"payment')
  );
}

export function formatImageProviderLabel(provider: ImageGenerationProvider): string {
  return provider === "stability"
    ? "Stability AI"
    : "OVH Stable Diffusion XL (free cloud)";
}
