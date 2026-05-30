"use client";



import { useCallback, useEffect, useState, type ReactNode } from "react";

import { OVH_AI_SUGGESTED_MODELS } from "@/lib/llm/ovhDefaults";

import type { LlmProviderProfile } from "@/lib/llm/config";

import type { LlmProvider } from "@/lib/llm/types";



type OllamaListResult =

  | { ok: true; models: string[] }

  | { ok: false; error: string };



type Props = {

  provider: LlmProvider;

  ollama: LlmProviderProfile;

  cloud: LlmProviderProfile;

  apiKeySet: boolean;

  prefilledFromEnvLocal: boolean;

  ollamaModels: string[] | null;

  ollamaListError: string | null;

};



const PROVIDER_OPTIONS: {

  id: LlmProvider;

  label: string;

  short: string;

}[] = [

  { id: "ollama", label: "On this computer", short: "Ollama — private" },

  {
    id: "openai_compatible",
    label: "Cloud service",
    short: "OVH or similar API",
  },

];



export function LlmSettingsFields({

  provider,

  ollama,

  cloud,

  apiKeySet,

  prefilledFromEnvLocal,

  ollamaModels: initialModels,

  ollamaListError: initialError,

}: Props) {

  const [selected, setSelected] = useState<LlmProvider>(provider);

  const [ollamaBase, setOllamaBase] = useState(ollama.baseUrl);

  const [ollamaModels, setOllamaModels] = useState<string[] | null>(

    initialModels,

  );

  const [ollamaListError, setOllamaListError] = useState<string | null>(

    initialError,

  );

  const [ollamaListLoading, setOllamaListLoading] = useState(false);



  const isCloud = selected === "openai_compatible";



  const refreshOllamaModels = useCallback(async (probeBase: string) => {

    const url = probeBase.trim() || "http://127.0.0.1:11434";

    setOllamaListLoading(true);

    try {

      const res = await fetch(

        `/api/llm/ollama-models?baseUrl=${encodeURIComponent(url)}`,

        { cache: "no-store" },

      );

      const data = (await res.json()) as OllamaListResult;

      if (data.ok) {

        setOllamaModels(data.models);

        setOllamaListError(null);

      } else {

        setOllamaModels(null);

        setOllamaListError(data.error);

      }

    } catch (e) {

      setOllamaModels(null);

      setOllamaListError(e instanceof Error ? e.message : String(e));

    } finally {

      setOllamaListLoading(false);

    }

  }, []);



  useEffect(() => {

    if (selected !== "ollama") return;

    void refreshOllamaModels(ollamaBase);

  }, [selected, ollamaBase, refreshOllamaModels]);



  const ollamaFields = (

    <OllamaFields

      ollama={ollama}

      ollamaBase={ollamaBase}

      onOllamaBaseBlur={setOllamaBase}

      models={ollamaModels}

      listError={ollamaListError}

      loading={ollamaListLoading}

      onRefresh={() => void refreshOllamaModels(ollamaBase)}

    />

  );



  const cloudFields = (

    <CloudFields cloud={cloud} apiKeySet={apiKeySet} showPrivacyNote={isCloud} />

  );



  return (

    <div className="space-y-4">

      <p className="text-xs leading-relaxed text-clin-muted">

        Pick where Clin sends writing and analysis requests. Your other choice stays

        saved so you can switch later. Computer = nothing leaves your machine unless

        you use cloud AI elsewhere.

        {prefilledFromEnvLocal ? (

          <> Some fields were pre-filled from your local env file.</>

        ) : null}

      </p>



      <div className="space-y-2">

        <span className="text-sm font-medium text-clin-text">

          Active AI

        </span>

        <div

          className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--clin-border)] bg-[var(--clin-bg)] p-1 sm:max-w-md"

          role="group"

          aria-label="Active AI"

        >

          {PROVIDER_OPTIONS.map((opt) => {

            const active = selected === opt.id;

            return (

              <button

                key={opt.id}

                type="button"

                onClick={() => setSelected(opt.id)}

                className={`rounded-md px-3 py-2.5 text-left text-sm transition-colors ${

                  active

                    ? "bg-[var(--clin-surface)] font-medium text-clin-text shadow-sm ring-1 ring-[var(--clin-accent)]"

                    : "text-clin-muted hover:bg-[var(--clin-surface)]/60"

                }`}

                aria-pressed={active}

              >

                <span className="block">{opt.label}</span>

                <span

                  className={`mt-0.5 block text-xs ${

                    active ? "text-[var(--clin-accent)]" : "text-clin-muted"

                  }`}

                >

                  {opt.short}

                </span>

              </button>

            );

          })}

        </div>

        <input type="hidden" name="llmProvider" value={selected} />

      </div>



      {isCloud ? (

        <>

          <ActiveProviderPanel

            title="Cloud service"

            subtitle="Used for writing and analysis now"

          >

            {cloudFields}

          </ActiveProviderPanel>

          <InactiveProviderDetails

            title="On this computer (Ollama)"

            summary="Saved — switch above to use it"

          >

            {ollamaFields}

          </InactiveProviderDetails>

        </>

      ) : (

        <>

          <ActiveProviderPanel

            title="On this computer (Ollama)"

            subtitle="Private — used for writing and analysis now"

          >

            {ollamaFields}

          </ActiveProviderPanel>

          <InactiveProviderDetails

            title="Cloud service"

            summary="Saved — switch above to use it"

          >

            {cloudFields}

          </InactiveProviderDetails>

        </>

      )}

    </div>

  );

}



function ActiveProviderPanel({

  title,

  subtitle,

  children,

}: {

  title: string;

  subtitle: string;

  children: ReactNode;

}) {

  return (

    <section

      className="space-y-3 rounded-lg border-2 border-[var(--clin-accent)] bg-[var(--clin-surface)] p-4"

      aria-current="true"

    >

      <div className="flex flex-wrap items-start justify-between gap-2">

        <div>

          <h3 className="text-sm font-semibold text-clin-text">{title}</h3>

          <p className="mt-0.5 text-xs text-clin-muted">{subtitle}</p>

        </div>

        <span className="shrink-0 rounded-full bg-[var(--clin-accent)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--clin-accent)]">

          In use

        </span>

      </div>

      {children}

    </section>

  );

}



function InactiveProviderDetails({

  title,

  summary,

  children,

}: {

  title: string;

  summary: string;

  children: ReactNode;

}) {

  return (

    <details className="group rounded-lg border border-[var(--clin-border)] bg-[var(--clin-bg)]/50">

      <summary className="cursor-pointer list-none px-4 py-3 text-sm marker:content-none [&::-webkit-details-marker]:hidden">

        <div className="flex items-center justify-between gap-2">

          <div>

            <span className="font-medium text-clin-muted">{title}</span>

            <span className="mt-0.5 block text-xs text-clin-muted/80">

              {summary}

            </span>

          </div>

          <span className="shrink-0 text-xs text-clin-muted group-open:hidden">

            Edit

          </span>

          <span className="hidden shrink-0 text-xs text-clin-muted group-open:inline">

            Hide

          </span>

        </div>

      </summary>

      <div className="space-y-3 border-t border-[var(--clin-border)] px-4 pb-4 pt-3">

        {children}

      </div>

    </details>

  );

}



function OllamaFields({

  ollama,

  ollamaBase,

  onOllamaBaseBlur,

  models,

  listError,

  loading,

  onRefresh,

}: {

  ollama: LlmProviderProfile;

  ollamaBase: string;

  onOllamaBaseBlur: (v: string) => void;

  models: string[] | null;

  listError: string | null;

  loading: boolean;

  onRefresh: () => void;

}) {

  return (

    <>

      <LlmTextField

        name="ollamaBaseUrl"

        label="Ollama address"

        description="Usually http://127.0.0.1:11434 if Ollama runs on this PC."

        defaultValue={ollama.baseUrl}

        onBlur={onOllamaBaseBlur}

      />

      <OllamaModelField

        model={ollama.model}

        models={models}

        listError={listError}

        loading={loading}

        baseUrl={ollamaBase}

        onRefresh={onRefresh}

      />

    </>

  );

}



function CloudFields({

  cloud,

  apiKeySet,

  showPrivacyNote,

}: {

  cloud: LlmProviderProfile;

  apiKeySet: boolean;

  showPrivacyNote: boolean;

}) {

  return (

    <>

      {showPrivacyNote ? (

        <div

          className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"

          role="note"

        >

          Text you send for analysis or drafts goes to your cloud provider over HTTPS.

        </div>

      ) : null}

      <LlmTextField

        name="cloudBaseUrl"

        label="Service URL"

        description="API address from your provider (often ends with /v1)."

        defaultValue={cloud.baseUrl}

      />

      <CloudModelField model={cloud.model} />

      <label className="block space-y-1 text-sm">

        <span className="font-medium text-clin-text">API key</span>

        <input

          name="llmApiKey"

          type="password"

          autoComplete="off"

          placeholder={

            apiKeySet ? "Leave blank to keep saved key" : "Paste access token"

          }

          className="mt-1 clin-input w-full"

        />

      </label>

      {apiKeySet ? (

        <label className="flex items-center gap-2 text-xs text-clin-muted">

          <input type="checkbox" name="clearLlmApiKey" className="rounded" />

          Remove saved API key

        </label>

      ) : null}

    </>

  );

}



function OllamaModelField({

  model,

  models,

  listError,

  loading,

  baseUrl,

  onRefresh,

}: {

  model: string;

  models: string[] | null;

  listError: string | null;

  loading: boolean;

  baseUrl: string;

  onRefresh: () => void;

}) {

  const options = models ?? [];

  const savedNotListed =

    model.trim() && !options.some((m) => m === model.trim());



  if (listError) {

    return (

      <div className="space-y-2">

        <p className="text-xs text-amber-800 dark:text-amber-200">

          Could not list models at {baseUrl}: {listError}

        </p>

        <LlmTextField

          name="ollamaModel"

          label="Model name"

          description="Exact tag from `ollama list`."

          defaultValue={model}

        />

        <button

          type="button"

          onClick={onRefresh}

          className="clin-btn-secondary text-xs"

        >

          Retry listing models

        </button>

      </div>

    );

  }



  if (loading && options.length === 0) {

    return <p className="text-xs text-clin-muted">Loading models…</p>;

  }



  if (options.length === 0) {

    return (

      <div className="space-y-2">

        <p className="text-xs text-amber-800 dark:text-amber-200">

          No models reported. Run e.g.{" "}

          <code className="clin-code">ollama pull qwen2.5:8b</code> then

          refresh.

        </p>

        <LlmTextField

          name="ollamaModel"

          label="Model name"

          defaultValue={model}

        />

        <button

          type="button"

          onClick={onRefresh}

          className="clin-btn-secondary text-xs"

        >

          Refresh model list

        </button>

      </div>

    );

  }



  return (

    <label className="block space-y-1 text-sm">

      <span className="font-medium text-clin-text">Model</span>

      <select

        name="ollamaModel"

        defaultValue={model}

        className="mt-1 clin-input w-full"

        required

      >

        {savedNotListed ? (

          <option value={model}>{model} (saved)</option>

        ) : null}

        {options.map((m) => (

          <option key={m} value={m}>

            {m}

          </option>

        ))}

      </select>

      <span className="block text-xs text-clin-muted">

        {options.length} installed.{" "}

        <button type="button" onClick={onRefresh} className="clin-link font-normal">

          Refresh

        </button>

      </span>

    </label>

  );

}



function CloudModelField({ model }: { model: string }) {

  const suggested: string[] = [...OVH_AI_SUGGESTED_MODELS];

  const savedNotListed = model.trim() && !suggested.includes(model.trim());



  return (

    <label className="block space-y-1 text-sm">

      <span className="font-medium text-clin-text">Model id</span>

      <select

        name="cloudModel"

        defaultValue={model}

        className="mt-1 clin-input w-full"

        required

      >

        {savedNotListed ? (

          <option value={model}>{model} (saved)</option>

        ) : null}

        {suggested.map((m) => (

          <option key={m} value={m}>

            {m}

          </option>

        ))}

      </select>

    </label>

  );

}



function LlmTextField({

  name,

  label,

  description,

  defaultValue,

  onBlur,

}: {

  name: string;

  label: string;

  description?: string;

  defaultValue: string;

  onBlur?: (value: string) => void;

}) {

  return (

    <label className="block space-y-1 text-sm">

      <span className="font-medium text-clin-text">{label}</span>

      <input

        name={name}

        type="text"

        required

        defaultValue={defaultValue}

        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}

        className="mt-1 clin-input w-full"

      />

      {description ? (

        <span className="block text-xs text-clin-muted">{description}</span>

      ) : null}

    </label>

  );

}


