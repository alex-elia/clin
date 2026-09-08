import type { NetworkHygieneRow } from "@/lib/networkHygieneTypes";

export type RemovalVerdictFilter = "yes" | "maybe" | "all";
export type RemovalView = "bucket" | "signals";

export function filterRemovalSignals(
  rows: NetworkHygieneRow[],
  verdict: RemovalVerdictFilter,
): NetworkHygieneRow[] {
  return rows.filter((row) => {
    if (row.removeVerdict === "no" || row.removeVerdict === "not_applicable") {
      return false;
    }
    if (verdict === "yes") return row.removeVerdict === "yes";
    if (verdict === "maybe") return row.removeVerdict === "maybe";
    return row.removeVerdict === "yes" || row.removeVerdict === "maybe";
  });
}

export function countRemovalSignals(rows: NetworkHygieneRow[]) {
  let yes = 0;
  let maybe = 0;
  let stagedYes = 0;
  let unstagedSignals = 0;

  for (const row of rows) {
    if (row.removeVerdict === "yes") {
      yes += 1;
      if (row.bucket === "review_remove") stagedYes += 1;
      else unstagedSignals += 1;
    } else if (row.removeVerdict === "maybe") {
      maybe += 1;
      if (row.bucket !== "review_remove") unstagedSignals += 1;
    }
  }

  return {
    yes,
    maybe,
    all: yes + maybe,
    stagedYes,
    unstagedSignals,
  };
}

export function filterUnstagedRemovalSignals(
  rows: NetworkHygieneRow[],
  verdict: RemovalVerdictFilter,
): NetworkHygieneRow[] {
  return filterRemovalSignals(rows, verdict).filter(
    (row) => row.bucket !== "review_remove",
  );
}
