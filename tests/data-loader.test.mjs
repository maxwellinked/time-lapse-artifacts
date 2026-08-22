import assert from "node:assert/strict";
import test from "node:test";

import {
  loadRecords,
  RecordsDataError,
  validateRecordsPayload,
} from "../assets/data-loader.js";

const revision = "a".repeat(40);
const record = {
  recordId: "tla-0123456789abcdef",
  filename: "2026-08-10.1201.BallpointPen.Ink.Paper.9x12.mp4",
  date: "2026-08-10",
  time: "12:01",
  tool: "BallpointPen",
  medium: "Ink",
  support: "Paper",
  dimensions: "9x12",
  durationSeconds: 81.566,
  integrityReference: "b".repeat(64),
  videoUrl:
    `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${revision}/` +
    "Standard_Time_Lapses/2026-08-10.1201.BallpointPen.Ink.Paper.9x12.mp4",
};
record.sourceUrl = record.videoUrl;

function payload(records = [record]) {
  return { sourceRevision: revision, records };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const fastOptions = {
  retryDelayMs: 0,
  sleep: async () => {},
  random: () => 0,
};

test("validates a pinned, newest-first payload", () => {
  assert.equal(validateRecordsPayload(payload()).records[0].recordId, record.recordId);
});

test("rejects duplicate record IDs", () => {
  assert.throws(
    () => validateRecordsPayload(payload([record, { ...record }])),
    (error) => error instanceof RecordsDataError && error.code === "invalid_payload",
  );
});

test("rejects media URLs that are not pinned to the declared revision", () => {
  const invalid = { ...record, videoUrl: record.videoUrl.replace(revision, "c".repeat(40)) };
  invalid.sourceUrl = invalid.videoUrl;
  assert.throws(
    () => validateRecordsPayload(payload([invalid])),
    (error) => error instanceof RecordsDataError && error.code === "invalid_payload",
  );
});

test("loads and validates a recording index", async () => {
  const fetchImpl = async () => jsonResponse(payload());
  const result = await loadRecords("data/records.json", { fetchImpl, ...fastOptions });
  assert.equal(result.records.length, 1);
});

test("retries transient HTTP failures and bypasses cache on retry", async () => {
  const caches = [];
  const fetchImpl = async (_url, options) => {
    caches.push(options.cache);
    return caches.length === 1
      ? new Response("Unavailable", { status: 503 })
      : jsonResponse(payload());
  };

  const result = await loadRecords("data/records.json", { fetchImpl, ...fastOptions });
  assert.equal(result.records.length, 1);
  assert.deepEqual(caches, ["default", "reload"]);
});

test("does not retry non-transient HTTP failures", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return new Response("Missing", { status: 404 });
  };

  await assert.rejects(
    loadRecords("data/records.json", { fetchImpl, ...fastOptions }),
    (error) => error instanceof RecordsDataError && error.status === 404,
  );
  assert.equal(attempts, 1);
});

test("retries invalid JSON before reporting the failure", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return new Response("not json", { status: 200 });
  };

  await assert.rejects(
    loadRecords("data/records.json", { fetchImpl, maxAttempts: 2, ...fastOptions }),
    (error) => error instanceof RecordsDataError && error.code === "invalid_json",
  );
  assert.equal(attempts, 2);
});

test("times out stalled attempts", async () => {
  const fetchImpl = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });

  await assert.rejects(
    loadRecords("data/records.json", {
      fetchImpl,
      maxAttempts: 1,
      timeoutMs: 5,
      ...fastOptions,
    }),
    (error) => error instanceof RecordsDataError && error.code === "timeout",
  );
});
