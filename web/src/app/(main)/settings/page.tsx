import { savePaceForm } from "@/app/actions";
import { getPaceSettings } from "@/lib/pace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const pace = await getPaceSettings();

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
          name="captureMaxPerHour"
          label="Max captures per rolling hour"
          description="Hard cap on how many captures the API accepts in any 60-minute window."
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
    </div>
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
