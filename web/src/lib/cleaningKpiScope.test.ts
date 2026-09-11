import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactExcludedFromCleaningKpis } from "./cleaningKpiScope";
import { chunkIds } from "./sqliteInChunks";

describe("cleaning KPI scope", () => {
  it("excludes dismissed and disconnected, keeps open 2nd-degree", () => {
    assert.equal(
      contactExcludedFromCleaningKpis({
        connectionDegree: "1st",
        cleaningDismissedAt: Date.now(),
      }),
      true,
    );
    assert.equal(
      contactExcludedFromCleaningKpis({
        connectionDegree: "disconnected",
        cleaningDismissedAt: null,
      }),
      true,
    );
    assert.equal(
      contactExcludedFromCleaningKpis({
        connectionDegree: "2nd",
        cleaningDismissedAt: null,
      }),
      false,
    );
    assert.equal(
      contactExcludedFromCleaningKpis({
        connectionDegree: null,
        cleaningDismissedAt: null,
      }),
      false,
    );
  });
});

describe("sqlite IN chunks", () => {
  it("splits large id lists under the bind limit", () => {
    const ids = Array.from({ length: 850 }, (_, i) => String(i));
    const chunks = chunkIds(ids, 400);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 400);
    assert.equal(chunks[1].length, 400);
    assert.equal(chunks[2].length, 50);
  });
});
