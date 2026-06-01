import {
  saveAutomationForm,
  saveAutopilotForm,
  saveLlmForm,
  saveOutreachSendForm,
  savePaceForm,
} from "@/app/actions";
import { DataSettingsSection } from "@/components/DataSettingsSection";
import { LlmSettingsFields } from "@/components/LlmSettingsFields";
import { LlmCallLogPanel } from "@/components/LlmCallLogPanel";
import { PostImageSettingsSection } from "@/components/PostImageSettingsSection";
import { getAutopilotSettings } from "@/lib/autopilot";
import { getAutomationSettings } from "@/lib/automation";
import { getDataPathInfo, getLastBackupMeta } from "@/lib/dataPaths";
import { getLlmConfigPublic, listOllamaModels } from "@/lib/llm/completeChat";
import { getOutreachSendSettings } from "@/lib/outreachSend";
import { getPaceSettings } from "@/lib/pace";
import { getSdSettingsPublic } from "@/lib/sdSettings";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { EditorialAutopilotSettings } from "@/components/EditorialAutopilotSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const pace = await getPaceSettings();
  const automation = await getAutomationSettings();
  const autopilot = await getAutopilotSettings();
  const llm = await getLlmConfigPublic();
  const ollamaInstalled = await listOllamaModels(llm.ollama.baseUrl);
  const dataPaths = await getDataPathInfo();
  const lastBackup = await getLastBackupMeta();
  const outreachSend = await getOutreachSendSettings();
  const sd = await getSdSettingsPublic();
  const brand = await getOrCreateContentBrandContext();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-12">
      <div className="max-w-3xl">
        <h1 className="clin-page-title">Settings</h1>
        <p className="clin-page-lead">
          Control how fast Clin uses LinkedIn, then how AI helps you write — all
          optional and local-first.
        </p>
      </div>

      <section className="space-y-5">
        <div className="max-w-3xl">
          <h2 className="clin-section-title">LinkedIn pacing &amp; safety</h2>
          <p className="mt-1 text-sm text-[var(--clin-muted)]">
            Limits how quickly the extension opens profiles, captures data, or
            steps through outreach. Nothing here posts for you unless you turn on
            outreach below and choose auto-send.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
        <form action={savePaceForm} className="clin-card space-y-4 p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--clin-text)]">
            Captures &amp; review queue
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field
            name="queueBatchSize"
            label="Review queue batch size"
            description="How many pending reviews to show before “load next batch”."
            defaultValue={pace.queueBatchSize}
            min={1}
            max={25}
          />
          <Field
            name="minSecondsBetweenProfileOpens"
            label="Seconds between opening profiles (dashboard)"
            description="Minimum wait between opening LinkedIn tabs from the review queue. You still click Send yourself."
            defaultValue={pace.minSecondsBetweenProfileOpens}
            min={15}
            max={600}
          />
          <Field
            name="minSecondsBetweenCaptures"
            label="Seconds between captures"
            description="Clin and the extension share this limit so saves are not too bursty."
            defaultValue={pace.minSecondsBetweenCaptures}
            min={20}
            max={600}
          />
          <Field
            name="paceJitterPercent"
            label="Random extra delay (%)"
            description="Adds unpredictable spacing on top of the minimum waits above."
            defaultValue={pace.paceJitterPercent}
            min={0}
            max={100}
          />
          <Field
            name="captureMaxPerHour"
            label="Max captures per hour"
            description="Each profile save or each person on a connections import counts as one."
            defaultValue={pace.captureMaxPerHour}
            min={1}
            max={40}
          />
          </div>
          <button type="submit" className="clin-btn-primary">
            Save capture pacing
          </button>
        </form>

        <form action={saveOutreachSendForm} className="clin-card space-y-4 p-6">
          <h3 className="text-sm font-semibold text-[var(--clin-text)]">
            Campaign outreach (extension)
          </h3>
          <p className="text-sm text-[var(--clin-muted)]">
            Optional runner for ready campaign messages. Account risk is yours —
            start with manual confirm (you paste and click Send on LinkedIn).
          </p>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="outreachEnabled"
              defaultChecked={outreachSend.enabled}
              className="mt-1"
            />
            <span className="font-medium text-[var(--clin-text)]">
              Enable outreach runner in the extension
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[var(--clin-text)]">Send mode</span>
            <select
              name="outreachSendMode"
              defaultValue={outreachSend.sendMode}
              className="mt-1 w-full rounded-md border border-[var(--clin-border)] px-3 py-2"
            >
              <option value="manual_confirm">
                Manual — copy draft, you click Send
              </option>
              <option value="auto">Auto-send (high risk)</option>
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="minSecondsBetweenSends"
            label="Seconds between outreach steps"
            defaultValue={outreachSend.minSecondsBetweenSends}
            min={60}
            max={900}
          />
          <Field
            name="sendMaxPerDay"
            label="Max outreach steps per day"
            defaultValue={outreachSend.sendMaxPerDay}
            min={1}
            max={40}
          />
          <Field
            name="sendJitterPercent"
            label="Outreach jitter (%)"
            description="Random extra delay between outreach steps."
            defaultValue={outreachSend.sendJitterPercent}
            min={0}
            max={100}
          />
          </div>
          <button type="submit" className="clin-btn-primary">
            Save outreach pacing
          </button>
        </form>

        <form action={saveAutomationForm} className="clin-card space-y-4 p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--clin-text)]">
            Background enrich (extension)
          </h3>
          <p className="text-sm text-[var(--clin-muted)]">
            After a people search import, Clin can open each profile in your tab,
            capture full fields, and run AI analysis (if enabled below). Does not
            send messages. Use conservative daily caps on LinkedIn.
          </p>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="automationEnabled"
              defaultChecked={automation.enabled}
              className="mt-1"
            />
            <span className="font-medium text-[var(--clin-text)]">
              Allow background enrich
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="automationAutoEnrichAfterList"
              value="on"
              defaultChecked={automation.autoEnrichAfterList}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-[var(--clin-text)]">
                Auto-open profiles after list capture
              </span>
              <span className="mt-1 block text-xs text-[var(--clin-muted)]">
                When you import a list (Capture or pipeline), continue with profile
                captures without a second click.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="automationAutoCaptureMessaging"
              value="on"
              defaultChecked={automation.autoCaptureMessagingInEnrich}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-[var(--clin-text)]">
                Capture messaging during enrich
              </span>
              <span className="mt-1 block text-xs text-[var(--clin-muted)]">
                After each profile in Import &amp; enrich, try to read the LinkedIn
                thread (overlay or Message link). Improves AI fit and drafts.
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
              <span className="font-medium text-[var(--clin-text)]">
                Allow list import in extension
              </span>
              <span className="mt-1 block text-xs text-[var(--clin-muted)]">
                Required for Import &amp; enrich. Pacing and hourly caps above still apply.
              </span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field
            name="automationMaxPerDay"
            label="Max successful visits per day"
            defaultValue={automation.maxPerDay}
            min={1}
            max={50}
          />
          <Field
            name="automationMinGapSeconds"
            label="Min seconds between profile opens"
            defaultValue={automation.minGapSeconds}
            min={30}
            max={600}
          />
          <Field
            name="automationMaxGapSeconds"
            label="Max seconds between profile opens"
            defaultValue={automation.maxGapSeconds}
            min={60}
            max={900}
          />
          <Field
            name="automationJitterPercent"
            label="Gap jitter (%)"
            defaultValue={automation.jitterPercent}
            min={0}
            max={100}
          />
          </div>
          <button type="submit" className="clin-btn-primary">
            Save enrich settings
          </button>
        </form>
        </div>
      </section>

      <section className="space-y-5">
        <div className="max-w-3xl">
          <h2 className="clin-section-title">AI assistant</h2>
          <p className="mt-1 text-sm text-[var(--clin-muted)]">
            Powers contact insights, branding post coach, outreach drafts, and
            copy suggestions. Choose either a model on your computer (private) or a
            cloud API (faster, sends text to your provider).
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
        <form action={saveLlmForm} className="clin-card space-y-4 p-6 xl:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--clin-text)]">
            Which AI to use
          </h3>
          <LlmSettingsFields
            key={`${llm.provider}-${llm.ollama.baseUrl}-${llm.cloud.baseUrl}-${llm.ollama.model}-${llm.cloud.model}`}
            provider={llm.provider}
            ollama={llm.ollama}
            cloud={llm.cloud}
            apiKeySet={llm.apiKeySet}
            prefilledFromEnvLocal={llm.prefilledFromEnvLocal}
            ollamaModels={ollamaInstalled.ok ? ollamaInstalled.models : null}
            ollamaListError={ollamaInstalled.ok ? null : ollamaInstalled.error}
          />
          <button type="submit" className="clin-btn-primary">
            Save AI settings
          </button>
        </form>

        <form action={saveAutopilotForm} className="clin-card space-y-4 p-6 xl:col-span-1">
          <h3 className="text-sm font-semibold text-[var(--clin-text)]">
            Automatic contact analysis
          </h3>
          <p className="text-sm text-[var(--clin-muted)]">
            After you capture a profile with the extension, Clin can score and
            summarize the contact in the background. Run larger batches from{" "}
            <a href="/autopilot" className="clin-link">
              AI analysis
            </a>
            .
          </p>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="autopilotAnalyzeAfterProfile"
              defaultChecked={autopilot.analyzeAfterProfileCapture}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-[var(--clin-text)]">
                Analyze after profile or messaging capture
              </span>
              <span className="mt-1 block text-xs text-[var(--clin-muted)]">
                Re-scores the contact when new profile or thread data arrives. Requires
                your chosen AI above; capture still finishes first.
              </span>
            </span>
          </label>
          <p className="text-xs font-medium text-[var(--clin-muted)]">
            Campaign autopilot defaults (on Autopilot page you can override per run)
          </p>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="autopilotCampaignDraftOnReachOut"
              defaultChecked={autopilot.campaignDraftOnReachOut}
              className="mt-1"
            />
            <span>Draft outreach when fit is reach out</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="autopilotCampaignTagSkipGhost"
              defaultChecked={autopilot.campaignTagSkipGhost}
              className="mt-1"
            />
            <span>Tag skip as ghost</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="autopilotCampaignTagNurtureWarm"
              defaultChecked={autopilot.campaignTagNurtureWarm}
              className="mt-1"
            />
            <span>Tag nurture as warm</span>
          </label>
          <Field
            name="autopilotBatchDefaultLimit"
            label="Default batch size on Autopilot page"
            defaultValue={autopilot.batchDefaultLimit}
            min={1}
            max={30}
          />
          <button type="submit" className="clin-btn-primary">
            Save analysis options
          </button>
        </form>
        </div>

        <div className="clin-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--clin-text)]">AI FinOps</h3>
            <p className="mt-1 text-sm text-[var(--clin-muted)]">
              Cloud LLM and Tavily spend estimates from your call log — depends on which
              provider you selected above.
            </p>
          </div>
          <a href="/settings/finops" className="clin-btn-primary text-sm">
            Open FinOps dashboard
          </a>
        </div>

        <LlmCallLogPanel />
      </section>

      <EditorialAutopilotSettings brand={brand} />

      <section className="grid gap-5 lg:grid-cols-2">
        <PostImageSettingsSection sd={sd} />

        <div className="space-y-4">
          <div>
            <h2 className="clin-section-title">Your data</h2>
            <p className="mt-1 text-sm text-[var(--clin-muted)]">
              Database location, backups, and import/export. Everything stays on your
              machine unless you use cloud AI.
            </p>
          </div>
          <DataSettingsSection
          dbPath={dataPaths.dbPath}
          dataDirectory={dataPaths.dataDirectory}
          restartNote={dataPaths.restartRequiredNote}
          lastBackupAt={lastBackup.at}
          lastBackupPath={lastBackup.path}
        />
        </div>
      </section>
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
  description?: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-[var(--clin-text)]">{label}</span>
      <input
        name={name}
        type="number"
        required
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="mt-1 clin-input"
      />
      {description ? (
        <span className="block text-xs text-[var(--clin-muted)]">{description}</span>
      ) : null}
    </label>
  );
}
