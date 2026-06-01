"use client";

import { useState } from "react";
import {
  saveDataDirectoryForm,
  triggerBackupNow,
} from "@/app/actions";

type Props = {
  dbPath: string;
  dataDirectory: string;
  restartNote: string;
  lastBackupAt: string | null;
  lastBackupPath: string | null;
};

export function DataSettingsSection({
  dbPath,
  dataDirectory,
  restartNote,
  lastBackupAt,
  lastBackupPath,
}: Props) {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  async function onBackup() {
    setBackupStatus("Backing up…");
    const res = await triggerBackupNow();
    setBackupStatus(res.ok ? `Saved: ${res.path}` : res.error ?? "Failed");
  }

  async function onImport(file: File | null) {
    if (!file) return;
    if (
      !window.confirm(
        "This will REPLACE all data in your current database. Continue?",
      )
    ) {
      return;
    }
    setImportStatus("Importing…");
    try {
      const text = await file.text();
      const res = await fetch("/api/data/import?confirm=REPLACE", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const j = await res.json();
      setImportStatus(res.ok ? "Import complete. Restart the dev server." : j.error ?? "Failed");
    } catch (e) {
      setImportStatus(e instanceof Error ? e.message : "Import failed");
    }
  }

  return (
    <section className="clin-card h-full space-y-4 p-6">
      <div>
        <h2 className="text-lg font-medium text-[var(--clin-text)]">Data</h2>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          Database location, backup, and portable export. {restartNote}
        </p>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="font-medium text-[var(--clin-text)]">Current database</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-[var(--clin-muted)]">
            {dbPath}
          </dd>
        </div>
        {lastBackupAt ? (
          <div>
            <dt className="font-medium text-[var(--clin-text)]">Last backup</dt>
            <dd className="mt-0.5 text-[var(--clin-muted)]">
              {new Date(lastBackupAt).toLocaleString()}
              {lastBackupPath ? (
                <span className="block break-all font-mono text-xs">
                  {lastBackupPath}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <form action={saveDataDirectoryForm} className="space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-[var(--clin-text)]">
            Preferred data folder
          </span>
          <input
            name="dbDirectory"
            type="text"
            defaultValue={dataDirectory}
            className="mt-1 w-full rounded-md border border-[var(--clin-border)] px-3 py-2 text-sm"
            placeholder="C:\Users\You\Documents\Clin\data"
          />
          <span className="mt-1 block text-xs text-[var(--clin-muted)]">
            `clin.db` will live in this folder after restart.
          </span>
        </label>
        <button type="submit" className="clin-btn-primary">
          Save folder (restart required)
        </button>
      </form>

      <div className="flex flex-wrap gap-3">
        <a href="/api/data/export" className="clin-btn-primary inline-block">
          Download export
        </a>
        <button type="button" onClick={onBackup} className="clin-btn-primary">
          Backup now
        </button>
      </div>
      {backupStatus ? (
        <p className="text-sm text-[var(--clin-muted)]">{backupStatus}</p>
      ) : null}

      <label className="block text-sm">
        <span className="font-medium text-[var(--clin-text)]">
          Restore from export
        </span>
        <input
          type="file"
          accept="application/json,.json"
          className="mt-2 block w-full text-sm"
          onChange={(e) => onImport(e.target.files?.[0] ?? null)}
        />
      </label>
      {importStatus ? (
        <p className="text-sm text-[var(--clin-muted)]">{importStatus}</p>
      ) : null}
    </section>
  );
}
