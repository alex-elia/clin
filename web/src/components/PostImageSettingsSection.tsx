import { saveSdSettingsAction } from "@/app/actions";
import type { SdSettingsPublic } from "@/lib/sdSettings";

type PostImageSettingsSectionProps = {
  sd: SdSettingsPublic;
};

export function PostImageSettingsSection({ sd }: PostImageSettingsSectionProps) {
  return (
    <form action={saveSdSettingsAction} className="clin-card h-full space-y-4 p-6">
      <div>
        <h2 className="clin-section-title">Post images (optional)</h2>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          Clin suggests a prompt from your post, then generates a LinkedIn-friendly
          image. Tries Stability AI first; if credits run out, uses OVH Stable
          Diffusion XL automatically (same fallback as Nemrut AI Audit).
        </p>
      </div>

      {sd.envConfigured ? (
        <ul className="space-y-1 rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          {sd.stabilityConfigured ? (
            <li>Stability SD3 — configured</li>
          ) : null}
          {sd.ovhFallbackConfigured ? (
            <li>OVH SDXL fallback — configured (uses your OVH AI token)</li>
          ) : null}
        </ul>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Setup (pick at least one)</p>
          <ul className="mt-2 list-inside list-disc space-y-2 text-sm">
            <li>
              <strong>Stability</strong> — add{" "}
              <code className="text-xs">STABILITY_API_KEY</code> in{" "}
              <code className="text-xs">web/.env.local</code>
            </li>
            <li>
              <strong>OVH fallback (free)</strong> — add{" "}
              <code className="text-xs">OVH_AI_ENDPOINTS_ACCESS_TOKEN</code> (same
              token as cloud AI in Settings)
            </li>
          </ul>
          <p className="mt-2 text-xs">Restart <code>npm run dev</code> after editing env.</p>
        </div>
      )}

      {sd.envConfigured ? (
        <p className="text-xs text-[var(--clin-muted)]">{sd.envHint}</p>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="sdEnabled"
          defaultChecked={sd.enabled}
          disabled={!sd.envConfigured}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-[var(--clin-text)]">
            Allow “Generate image” on posts
          </span>
          <span className="mt-1 block text-xs text-[var(--clin-muted)]">
            Stability uses paid credits when configured; OVH SDXL is used when
            Stability fails or is not set up.
          </span>
        </span>
      </label>

      <details className="rounded-md border border-[var(--clin-border)] text-xs text-[var(--clin-muted)]">
        <summary className="cursor-pointer px-3 py-2 font-medium text-[var(--clin-text)]">
          Advanced (for IT / developers)
        </summary>
        <dl className="space-y-2 border-t border-[var(--clin-border)] px-3 py-3 font-mono">
          <div>
            <dt>STABILITY_API_KEY</dt>
            <dd
              className={
                sd.stabilityConfigured
                  ? "text-emerald-800 dark:text-emerald-200"
                  : "text-[var(--clin-muted)]"
              }
            >
              {sd.stabilityConfigured ? "set (hidden)" : "not set"}
            </dd>
          </div>
          <div>
            <dt>OVH_AI_ENDPOINTS_ACCESS_TOKEN</dt>
            <dd
              className={
                sd.ovhFallbackConfigured
                  ? "text-emerald-800 dark:text-emerald-200"
                  : "text-[var(--clin-muted)]"
              }
            >
              {sd.ovhFallbackConfigured ? "set (hidden)" : "not set"}
            </dd>
          </div>
          <div>
            <dt>OVH_SDXL_TEXT2IMAGE_URL</dt>
            <dd className="break-all text-[var(--clin-text)]">
              optional override
            </dd>
          </div>
          <div>
            <dt>STABILITY_SD3_URL / MODEL</dt>
            <dd className="break-all text-[var(--clin-text)]">
              {sd.apiUrl} · {sd.model}
            </dd>
          </div>
        </dl>
      </details>

      <button
        type="submit"
        className="clin-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!sd.envConfigured}
      >
        Save image settings
      </button>
    </form>
  );
}
