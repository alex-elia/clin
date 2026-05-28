import {
  saveAutomationForm,
  saveAutopilotForm,
  saveOllamaForm,
  saveOutreachSendForm,
  savePaceForm,
} from "@/app/actions";
import { DataSettingsSection } from "@/components/DataSettingsSection";
import { getAutopilotSettings } from "@/lib/autopilot";
import { getAutomationSettings } from "@/lib/automation";
import { getDataPathInfo, getLastBackupMeta } from "@/lib/dataPaths";
import { getOllamaSettings, listOllamaModels } from "@/lib/ollamaSettings";
import { getOutreachSendSettings } from "@/lib/outreachSend";
import { getPaceSettings } from "@/lib/pace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const pace = await getPaceSettings();
  const automation = await getAutomationSettings();
  const autopilot = await getAutopilotSettings();
  const ollama = await getOllamaSettings();
  const ollamaInstalled = await listOllamaModels(ollama.baseUrl);
  const dataPaths = await getDataPathInfo();
  const lastBackup = await getLastBackupMeta();
  const outreachSend = await getOutreachSendSettings();

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="clin-page-title">Settings</h1>
        <p className="clin-page-lead">
          Pacing, data safety, and optional LinkedIn automation. Outreach send
          stays off until you enable it below.
        </p>
      </div>

      <DataSettingsSection
        dbPath={dataPaths.dbPath}
        dataDirectory={dataPaths.dataDirectory}
        restartNote={dataPaths.restartRequiredNote}
        lastBackupAt={lastBackup.at}
        lastBackupPath={lastBackup.path}
      />

      <form
        action={saveOutreachSendForm}
        className="clin-card space-y-4 p-5"
      >
        <div>
          <h2 className="text-lg font-medium text-[var(--clin-text)]">
            LinkedIn outreach (opt-in)
          </h2>
          <p className="mt-1 text-sm text-[var(--clin-muted)]">
            Extension can pace through ready campaign messages. Account risk is
            on you — start with manual confirm.
          </p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="outreachEnabled"
            defaultChecked={outreachSend.enabled}
            className="mt-1"
          />
          <span className="font-medium text-[var(--clin-text)]">
            Enable LinkedIn outreach runner
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-[var(--clin-text)]">Send mode</span>
          <select
            name="outreachSendMode"
            defaultValue={outreachSend.sendMode}
            className="mt-1 w-full rounded-md border border-[var(--clin-border)] px-3 py-2"
          >
            <option value="manual_confirm">Manual confirm (paste, you click Send)</option>
            <option value="auto">Auto send (high risk)</option>
          </select>
        </label>
        <Field
          name="minSecondsBetweenSends"
          label="Seconds between sends"
          description="Minimum gap between outreach steps."
          defaultValue={outreachSend.minSecondsBetweenSends}
          min={60}
          max={900}
        />
        <Field
          name="sendMaxPerDay"
          label="Max sends per day"
          description="Rolling cap counted from outreach send log."
          defaultValue={outreachSend.sendMaxPerDay}
          min={1}
          max={40}
        />
        <Field
          name="sendJitterPercent"
          label="Send jitter (%)"
          description="Random extra delay on top of minimum send gap."
          defaultValue={outreachSend.sendJitterPercent}
          min={0}
          max={100}
        />
        <button type="submit" className="clin-btn-primary">
          Save outreach automation
        </button>
      </form>

      <form action={savePaceForm} className="clin-card space-y-4 p-5">
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
          className="clin-btn-primary"
        >
          Save pacing
        </button>
      </form>

      <div>
        <h2 className="clin-section-title">
          Hygiene automation
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-clin-muted">
          Optional extension workflow: pick the next contact from your local DB,
          open their profile in your active LinkedIn tab, capture visible fields,
          and log the visit. Caps and random gaps apply on top of normal capture
          pacing. This still does{" "}
          <strong className="clin-strong">
            not
          </strong>{" "}
          send messages or click remove. Use at your own risk — LinkedIn may
          restrict accounts for unusual activity.
        </p>
      </div>

      <form
        action={saveAutomationForm}
        className="clin-card space-y-4 p-5"
      >
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="automationEnabled"
            defaultChecked={automation.enabled}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-clin-text">
              Allow hygiene runner
            </span>
            <span className="mt-1 block text-xs text-clin-muted">
              When off, the extension cannot fetch /api/automation/next.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="automationConnectionsSprintEnabled"
            value="on"
            defaultChecked={automation.connectionsSprintEnabled}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-clin-text">
              Allow connections list sprint
            </span>
            <span className="mt-1 block text-xs text-clin-muted">
              When off, the extension refuses the side panel{" "}
              <strong className="font-medium">List sprint</strong> (auto-scroll +
              import). Capture pacing and hourly caps still apply from{" "}
              <strong className="font-medium">Pacing</strong> above.
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
          className="clin-btn-primary"
        >
          Save hygiene automation
        </button>
      </form>

      <div>
        <h2 className="clin-section-title">Ollama (local LLM)</h2>
        <p className="mt-2 text-sm leading-relaxed text-clin-muted">
          Contact analysis on each person&apos;s page calls{" "}
          <code className="clin-code">
            POST /api/chat
          </code>{" "}
          on your machine. Pull a model first, e.g.{" "}
          <code className="clin-code">
            ollama pull qwen2.5:8b
          </code>{" "}
          or{" "}
          <code className="clin-code">
            ollama pull deepseek-r1:8b
          </code>
          . Override with env{" "}
          <code className="clin-code">
            OLLAMA_BASE_URL
          </code>{" "}
          and{" "}
          <code className="clin-code">
            OLLAMA_MODEL
          </code>{" "}
          if you prefer.
        </p>
      </div>

      <div>
        <h2 className="clin-section-title">
          Local autopilot (LLM)
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-clin-muted">
          Clin still does not scrape LinkedIn on a timer or scroll lists for you.
          These options only automate{" "}
          <strong className="clin-strong">
            Ollama analysis on your machine
          </strong>{" "}
          after you capture data. Use{" "}
          <a
            href="/autopilot"
            className="clin-link font-medium"
          >
            Autopilot
          </a>{" "}
          to run analysis in batches.
        </p>
      </div>

      <form
        action={saveAutopilotForm}
        className="clin-card space-y-4 p-5"
      >
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="autopilotAnalyzeAfterProfile"
            defaultChecked={autopilot.analyzeAfterProfileCapture}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-clin-text">
              Analyze after each profile capture
            </span>
            <span className="mt-1 block text-xs text-clin-muted">
              When on, a successful extension capture on an{" "}
              <code className="text-xs">/in/…</code> profile (not connections
              list imports) triggers Ollama in the background. Capture still
              returns immediately; analysis may finish seconds later. Requires
              Ollama running and{" "}
              <code className="text-xs">npm run db:repair</code> if LLM columns
              are missing.
            </span>
          </span>
        </label>
        <Field
          name="autopilotBatchDefaultLimit"
          label="Default batch size (Autopilot page & API)"
          description="How many contacts to analyze per batch run (1–30)."
          defaultValue={autopilot.batchDefaultLimit}
          min={1}
          max={30}
        />
        <button
          type="submit"
          className="clin-btn-primary"
        >
          Save autopilot
        </button>
      </form>

      <form
        action={saveOllamaForm}
        className="clin-card space-y-4 p-5"
      >
        <div>
          <h2 className="clin-section-title">Ollama (local AI)</h2>
          {ollamaInstalled.ok ? (
            ollamaInstalled.models.length > 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-clin-muted">
                <span className="clin-strong">
                  Installed on {ollama.baseUrl}:
                </span>{" "}
                <code className="clin-code break-all text-[11px]">
                  {ollamaInstalled.models.join(", ")}
                </code>
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                Ollama is reachable but reports no models. Run e.g.{" "}
                <code className="clin-code">
                  ollama pull qwen2.5:8b
                </code>{" "}
                then refresh this page.
              </p>
            )
          ) : (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              Could not list models at {ollama.baseUrl}: {ollamaInstalled.error}.
              Start Ollama or fix the base URL below.
            </p>
          )}
        </div>
        <OllamaField
          name="ollamaBaseUrl"
          label="Ollama base URL"
          description="Usually http://127.0.0.1:11434"
          defaultValue={ollama.baseUrl}
        />
        <OllamaField
          name="ollamaModel"
          label="Model name"
          description="Must match an entry from the installed list above or `ollama list` exactly (tag matters: qwen2.5:7b ≠ qwen2.5:8b)."
          defaultValue={ollama.model}
        />
        <button
          type="submit"
          className="clin-btn-primary"
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
      <span className="font-medium text-clin-text">
        {label}
      </span>
      <input
        name={name}
        type="text"
        required
        defaultValue={defaultValue}
        className="mt-1 clin-input"
      />
      <span className="block text-xs text-clin-muted">{description}</span>
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
      <span className="font-medium text-clin-text">
        {label}
      </span>
      <input
        name={name}
        type="number"
        required
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="mt-1 clin-input"
      />
      <span className="block text-xs text-clin-muted">{description}</span>
    </label>
  );
}
