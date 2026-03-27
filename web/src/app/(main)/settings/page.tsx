import {
  saveAutomationForm,
  saveOllamaForm,
  savePaceForm,
} from "@/app/actions";
import { getAutomationSettings } from "@/lib/automation";
import { getOllamaSettings } from "@/lib/ollamaSettings";
import { getPaceSettings } from "@/lib/pace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const pace = await getPaceSettings();
  const automation = await getAutomationSettings();
  const ollama = await getOllamaSettings();

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pacing</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          These settings encourage a{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            low-risk, human-paced
          </strong>{" "}
          workflow: small batches, gaps between profile opens, and throttled
          captures. They do{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            not
          </strong>{" "}
          automate LinkedIn (no auto-clicks, no scripted messages).
        </p>
      </div>

      <form action={savePaceForm} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <Field
          name="queueBatchSize"
          label="Queue batch size"
          description="How many pending reviews to show before “load next batch”."
          defaultValue={pace.queueBatchSize}
          min={1}
          max={25}
        />
        <Field
          name="minSecondsBetweenProfileOpens"
          label="Seconds between opening profiles (dashboard)"
          description="Minimum wait between opening LinkedIn tabs from this queue. You still click; Clin only enforces spacing locally."
          defaultValue={pace.minSecondsBetweenProfileOpens}
          min={15}
          max={600}
        />
        <Field
          name="minSecondsBetweenCaptures"
          label="Seconds between captures (API + extension)"
          description="Server rejects ingest if the last capture was too recent. The extension reads the same limits from the API."
          defaultValue={pace.minSecondsBetweenCaptures}
          min={20}
          max={600}
        />
        <Field
          name="paceJitterPercent"
          label="Spacing jitter (%)"
          description="Adds a random 0–N% extra delay on top of each minimum wait (captures and dashboard profile opens), so intervals are less perfectly regular."
          defaultValue={pace.paceJitterPercent}
          min={0}
          max={100}
        />
        <Field
          name="captureMaxPerHour"
          label="Max capture rows per rolling hour"
          description="Each profile save or each person on a connections import counts as one row. Raise this if you import long lists page by page."
          defaultValue={pace.captureMaxPerHour}
          min={1}
          max={40}
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save pacing
        </button>
      </form>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Hygiene automation
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Optional extension workflow: pick the next contact from your local DB,
          open their profile in your active LinkedIn tab, capture visible fields,
          and log the visit. Caps and random gaps apply on top of normal capture
          pacing. This still does{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            not
          </strong>{" "}
          send messages or click remove. Use at your own risk — LinkedIn may
          restrict accounts for unusual activity.
        </p>
      </div>

      <form
        action={saveAutomationForm}
        className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="automationEnabled"
            defaultChecked={automation.enabled}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              Allow hygiene runner
            </span>
            <span className="mt-1 block text-xs text-zinc-500">
              When off, the extension cannot fetch /api/automation/next.
            </span>
          </span>
        </label>
        <Field
          name="automationMaxPerDay"
          label="Max successful visits per local day"
          description="Counts captures that finished (ok) or explicit skips. Failed attempts do not consume this budget."
          defaultValue={automation.maxPerDay}
          min={1}
          max={50}
        />
        <Field
          name="automationMinGapSeconds"
          label="Hygiene: min seconds between profile opens"
          description="Random wait before navigating to the next profile (lower bound)."
          defaultValue={automation.minGapSeconds}
          min={30}
          max={600}
        />
        <Field
          name="automationMaxGapSeconds"
          label="Hygiene: max seconds between profile opens"
          description="Upper bound for the random gap; must be ≥ min."
          defaultValue={automation.maxGapSeconds}
          min={60}
          max={900}
        />
        <Field
          name="automationJitterPercent"
          label="Hygiene spacing jitter (%)"
          description="Extra random delay on top of each picked interval (same idea as capture jitter)."
          defaultValue={automation.jitterPercent}
          min={0}
          max={100}
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save hygiene automation
        </button>
      </form>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">Ollama (local LLM)</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Contact analysis on each person&apos;s page calls{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            POST /api/chat
          </code>{" "}
          on your machine. Pull a model first, e.g.{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            ollama pull qwen2.5:8b
          </code>{" "}
          or{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            ollama pull deepseek-r1:8b
          </code>
          . Override with env{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            OLLAMA_BASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            OLLAMA_MODEL
          </code>{" "}
          if you prefer.
        </p>
      </div>

      <form
        action={saveOllamaForm}
        className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <OllamaField
          name="ollamaBaseUrl"
          label="Ollama base URL"
          description="Usually http://127.0.0.1:11434"
          defaultValue={ollama.baseUrl}
        />
        <OllamaField
          name="ollamaModel"
          label="Model name"
          description="Must match `ollama list` (e.g. qwen2.5:8b, deepseek-r1:8b)."
          defaultValue={ollama.model}
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save Ollama settings
        </button>
      </form>
    </div>
  );
}

function OllamaField({
  name,
  label,
  description,
  defaultValue,
}: {
  name: string;
  label: string;
  description: string;
  defaultValue: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-zinc-900 dark:text-zinc-100">
        {label}
      </span>
      <input
        name={name}
        type="text"
        required
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <span className="block text-xs text-zinc-500">{description}</span>
    </label>
  );
}

function Field({
  name,
  label,
  description,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  description: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-zinc-900 dark:text-zinc-100">
        {label}
      </span>
      <input
        name={name}
        type="number"
        required
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <span className="block text-xs text-zinc-500">{description}</span>
    </label>
  );
}
