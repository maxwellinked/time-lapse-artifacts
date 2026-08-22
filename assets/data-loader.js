const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 200;

const RECORD_ID_PATTERN = /^tla-[a-f0-9]{16}$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const INTEGRITY_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const CANONICAL_SOURCE_ROOT =
  "https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/";

export class RecordsDataError extends Error {
  constructor(message, { code, retryable = false, status = null, cause } = {}) {
    super(message, { cause });
    this.name = "RecordsDataError";
    this.code = code ?? "unknown";
    this.retryable = retryable;
    this.status = status;
  }
}

function invalidPayload(message) {
  throw new RecordsDataError(message, { code: "invalid_payload" });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function validateRecordsPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    invalidPayload("The recording index must be a JSON object.");
  }
  if (!REVISION_PATTERN.test(payload.sourceRevision ?? "")) {
    invalidPayload("The recording index has an invalid source revision.");
  }
  if (!Array.isArray(payload.records) || payload.records.length === 0) {
    invalidPayload("The recording index does not contain any records.");
  }

  const expectedSourcePrefix =
    `${CANONICAL_SOURCE_ROOT}${payload.sourceRevision}/Standard_Time_Lapses/`;
  const recordIds = new Set();
  let previousDate = null;

  payload.records.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      invalidPayload(`Record ${index + 1} must be an object.`);
    }
    if (!RECORD_ID_PATTERN.test(record.recordId ?? "")) {
      invalidPayload(`Record ${index + 1} has an invalid record ID.`);
    }
    if (recordIds.has(record.recordId)) {
      invalidPayload(`Record ID ${record.recordId} appears more than once.`);
    }
    recordIds.add(record.recordId);

    for (const field of ["filename", "tool", "medium", "support", "dimensions"]) {
      if (!isNonEmptyString(record[field])) {
        invalidPayload(`Record ${record.recordId} has an invalid ${field}.`);
      }
    }
    if (!DATE_PATTERN.test(record.date ?? "")) {
      invalidPayload(`Record ${record.recordId} has an invalid date.`);
    }
    if (record.time !== null && record.time !== "" && !TIME_PATTERN.test(record.time ?? "")) {
      invalidPayload(`Record ${record.recordId} has an invalid time.`);
    }
    if (!Number.isFinite(record.durationSeconds) || record.durationSeconds < 0) {
      invalidPayload(`Record ${record.recordId} has an invalid duration.`);
    }
    if (!INTEGRITY_PATTERN.test(record.integrityReference ?? "")) {
      invalidPayload(`Record ${record.recordId} has an invalid integrity reference.`);
    }
    if (
      !isNonEmptyString(record.videoUrl) ||
      !record.videoUrl.startsWith(expectedSourcePrefix) ||
      !record.videoUrl.endsWith(".mp4") ||
      record.sourceUrl !== record.videoUrl
    ) {
      invalidPayload(`Record ${record.recordId} is not pinned to the declared source revision.`);
    }
    if (previousDate !== null && record.date > previousDate) {
      invalidPayload("The recording index must be ordered newest first.");
    }
    previousDate = record.date;
  });

  return payload;
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(attempt, baseDelayMs, random) {
  const jitter = 0.75 + random() * 0.5;
  return Math.round(baseDelayMs * 2 ** attempt * jitter);
}

function wait(delayMs) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

function normalizeRequestError(error, { timedOut, externallyAborted }) {
  if (error instanceof RecordsDataError) return error;
  if (timedOut) {
    return new RecordsDataError("The recording index request timed out.", {
      code: "timeout",
      retryable: true,
      cause: error,
    });
  }
  if (externallyAborted) {
    return new RecordsDataError("The recording index request was cancelled.", {
      code: "aborted",
      cause: error,
    });
  }
  return new RecordsDataError("The recording index request failed.", {
    code: "network",
    retryable: true,
    cause: error,
  });
}

export async function loadRecords(
  url,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    sleep = wait,
    random = Math.random,
    signal,
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("maxAttempts must be a positive integer.");
  }

  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new RecordsDataError("The recording index request was cancelled.", {
        code: "aborted",
      });
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortFromSignal = () => controller.abort(signal.reason);
    signal?.addEventListener("abort", abortFromSignal, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(url, {
        cache: attempt === 0 ? "default" : "reload",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new RecordsDataError(`The recording index returned HTTP ${response.status}.`, {
          code: "http",
          retryable: retryableStatus(response.status),
          status: response.status,
        });
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new RecordsDataError("The recording index returned invalid JSON.", {
          code: "invalid_json",
          retryable: true,
          cause: error,
        });
      }
      return validateRecordsPayload(payload);
    } catch (error) {
      lastError = normalizeRequestError(error, {
        timedOut,
        externallyAborted: signal?.aborted ?? false,
      });
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromSignal);
    }

    if (!lastError.retryable || attempt === maxAttempts - 1) throw lastError;
    await sleep(retryDelay(attempt, retryDelayMs, random));
  }

  throw lastError;
}
