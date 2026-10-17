import { loadRecords, RecordsDataError } from "./data-loader.js";
import {
  deriveRecordingSequences,
  extendVisibleCount,
  getRecordingPart,
  sortRecordsForDisplay,
} from "./record-sequences.js";

const DATA_URL = "data/records.json";
const PAGE_SIZE = 18;
const PREVIEW_DIRECTORY = "previews";
const REFERENCE_URL = "data/physical-references.json";
let referenceLookupPromise;
let referenceGeneration = 0;
let filterGeneration = 0;

// Initialize Dynamic Video Preview System
let dynamicPreview;
let previewIntegration;

const state = {
  records: [],
  filtered: [],
  sequenceDetails: new Map(),
  visibleCount: PAGE_SIZE,
  activeRecord: null,
  sourceRevision: null,
};

const elements = {
  appearanceButtons: [...document.querySelectorAll("[data-appearance]")],
  featured: document.querySelector("#featured-recording"),
  featuredDate: document.querySelector("#featured-date"),
  featuredMeta: document.querySelector("#featured-meta"),
  openFeatured: document.querySelector("#open-featured"),
  recordCount: document.querySelector("#record-count"),
  dateCoverage: document.querySelector("#date-coverage"),
  filters: document.querySelector("#filters"),
  grid: document.querySelector("#record-grid"),
  resultCount: document.querySelector("#result-count"),
  showMore: document.querySelector("#show-more"),
  retryPhotoFilter: document.querySelector("#retry-photo-filter"),
  dataError: document.querySelector("#data-error"),
  dataErrorMessage: document.querySelector("#data-error-message"),
  retryData: document.querySelector("#retry-data"),
  cardTemplate: document.querySelector("#record-card-template"),
  dialog: document.querySelector("#record-dialog"),
  dialogRecordId: document.querySelector("#dialog-record-id"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogMetadata: document.querySelector("#dialog-metadata"),
  dialogFilename: document.querySelector("#dialog-filename"),
  dialogHash: document.querySelector("#dialog-hash"),
  dialogSource: document.querySelector("#dialog-source"),
  dialogSourceTop: document.querySelector("#dialog-source-top"),
  dialogPreview: document.querySelector(".dialog-preview"),
  loadFullVideo: document.querySelector("#load-full-video"),
  fullVideo: document.querySelector("#full-video"),
  previousRecord: document.querySelector("#previous-record"),
  nextRecord: document.querySelector("#next-record"),
  referenceStage: document.querySelector("#dialog-reference-stage"),
  referenceStatus: document.querySelector("#dialog-reference-status"),
  referenceRole: document.querySelector("#dialog-reference-role"),
  referenceFull: document.querySelector("#dialog-reference-full"),
  referenceRepresentation: document.querySelector("#dialog-reference-representation"),
  referenceDetails: document.querySelector("#dialog-reference-details"),
  referenceWork: document.querySelector("#dialog-reference-work"),
  referenceEvidence: document.querySelector("#dialog-reference-evidence"),
  additionalReferences: document.querySelector("#dialog-additional-references"),
  referenceManifest: document.querySelector("#dialog-reference-manifest"),
  pairingClarification: document.querySelector("#dialog-pairing-clarification"),
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

function formatDate(date) {
  return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

function formatTime(time) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return "Unknown time";
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function humanizeToken(value) {
  return value
    .split(";")
    .filter(Boolean)
    .map((token) => token.replace(/([a-z])([A-Z])/g, "$1 $2"))
    .join(" + ");
}

function formatDimensions(value) {
  return `${value.replace("x", " × ")} in`;
}

function applyAppearance(appearance) {
  const choice = ["light", "dark", "system"].includes(appearance)
    ? appearance
    : "dark";
  const theme =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : choice;

  document.documentElement.dataset.theme = theme;
  elements.appearanceButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.appearance === choice));
  });
  localStorage.setItem("time-lapse-artifacts-appearance", choice);
}

elements.appearanceButtons.forEach((button) => {
  button.addEventListener("click", () => applyAppearance(button.dataset.appearance));
});

window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (localStorage.getItem("time-lapse-artifacts-appearance") === "system") {
    applyAppearance("system");
  }
});

applyAppearance(localStorage.getItem("time-lapse-artifacts-appearance") ?? "dark");

const previewQueue = [];
let activePreviewLoads = 0;
const MAX_ACTIVE_PREVIEW_LOADS = 2;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const previewObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const shell = entry.target;
      shell.dataset.inView = String(entry.isIntersecting);
      if (entry.isIntersecting) queuePreview(shell, false);
      else pausePreview(shell);
    });
  },
  { rootMargin: "0px 0px 80px", threshold: 0.15 },
);

function preparePreview(shell, record, immediate = false) {
  const video = shell.querySelector("video");
  if (!video) return;

  shell.classList.toggle("landscape", record.orientation === "landscape");
  shell.classList.remove("is-ready", "is-error");
  shell.classList.add("is-loading");
  shell.dataset.previewGeneration = String(Number(shell.dataset.previewGeneration ?? 0) + 1);
  shell.dataset.previewUrl = `${PREVIEW_DIRECTORY}/${record.recordId}.mp4`;
  shell.dataset.recordId = record.recordId;
  shell.dataset.inView = String(immediate);
  delete shell.dataset.previewReady;
  delete shell.dataset.queued;
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.loop = true;
  video.preload = immediate ? "metadata" : "none";

  const status = shell.querySelector(".preview-fallback small, .load-state");
  if (status) status.textContent = "Loading live preview";

  previewObserver.observe(shell);
  if (immediate) queuePreview(shell, true);
}

function queuePreview(shell, priority) {
  if (!shell.isConnected) return;
  if (shell.dataset.previewReady === "true") {
    playPreview(shell);
    return;
  }
  if (shell.dataset.queued === "true") return;
  shell.dataset.queued = "true";
  if (priority) previewQueue.unshift(shell);
  else previewQueue.push(shell);
  processPreviewQueue();
}

function processPreviewQueue() {
  while (activePreviewLoads < MAX_ACTIVE_PREVIEW_LOADS && previewQueue.length) {
    const shell = previewQueue.shift();
    if (!shell?.isConnected) continue;
    loadPreview(shell);
  }
}

async function loadPreview(shell) {
  const video = shell.querySelector("video");
  const source = shell.dataset.previewUrl;
  if (!video || !source) return finishPreview(shell, false);

  activePreviewLoads += 1;
  const generation = shell.dataset.previewGeneration;
  let finished = false;
  let timeoutId;

  const finish = (success) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);
    video.removeEventListener("canplay", onCanPlay);
    video.removeEventListener("error", onError);
    if (shell.dataset.previewGeneration !== generation) {
      activePreviewLoads = Math.max(0, activePreviewLoads - 1);
      processPreviewQueue();
      return;
    }
    finishPreview(shell, success);
  };

  const onCanPlay = () => finish(true);
  const onError = () => finish(false);

  // Try dynamic preview generation if available
  if (dynamicPreview && shell.dataset.recordId) {
    try {
      const record = state.records.find(r => r.recordId === shell.dataset.recordId);
      if (record && record.videoUrl) {
        const preview = await dynamicPreview.generatePreview(
          shell.dataset.recordId,
          record.videoUrl,
          {
            startTime: Math.max(0, (record.durationSeconds || 30) - 5),
            duration: 3000
          }
        );
        dynamicPreview.loadPreviewInElement(shell, preview);
        finish(true);
        return;
      }
    } catch (error) {
      console.warn("Dynamic preview generation failed, falling back to standard preview", error);
    }
  }

  // Fall back to standard preview loading
  video.addEventListener("canplay", onCanPlay, { once: true });
  video.addEventListener("error", onError, { once: true });
  video.preload = "auto";
  video.src = source;
  video.load();
  timeoutId = window.setTimeout(() => finish(false), 15000);
}

function finishPreview(shell, success) {
  shell.classList.remove("is-loading");
  shell.classList.toggle("is-ready", success);
  shell.classList.toggle("is-error", !success);
  shell.dataset.previewReady = String(success);
  const status = shell.querySelector(".preview-fallback small, .load-state");
  if (status && !success) status.textContent = "Preview unavailable";
  delete shell.dataset.queued;
  activePreviewLoads = Math.max(0, activePreviewLoads - 1);
  if (success) playPreview(shell);
  processPreviewQueue();
}

function playPreview(shell) {
  const video = shell.querySelector("video");
  if (
    !video ||
    shell.dataset.previewReady !== "true" ||
    shell.dataset.inView !== "true" ||
    reducedMotion.matches
  ) {
    return;
  }
  video.play().catch(() => {
    // The loaded frame remains visible if autoplay is unavailable.
  });
}

function pausePreview(shell) {
  shell.querySelector("video")?.pause();
}

reducedMotion.addEventListener("change", () => {
  document.querySelectorAll(".preview-shell").forEach((shell) => {
    if (reducedMotion.matches) pausePreview(shell);
    else playPreview(shell);
  });
});

function valuesFromRecords(field, split = false) {
  const values = state.records.flatMap((record) => {
    const value = record[field];
    return split ? value.split(";") : [value];
  });
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fillSelect(name, values, labeler = humanizeToken) {
  const select = elements.filters.elements[name];
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.append(option);
  });
}

function populateFilters() {
  for (const name of ["year", "tool", "dimensions"]) {
    const select = elements.filters.elements[name];
    select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
  }
  fillSelect(
    "year",
    [...new Set(state.records.map((record) => record.date.slice(0, 4)))].sort(),
    (value) => value,
  );
  fillSelect("tool", valuesFromRecords("tool", true));
  fillSelect("dimensions", valuesFromRecords("dimensions"), formatDimensions);
}

function recordMatches(record, field, expected) {
  if (!expected) return true;
  if (field === "tool") {
    return record[field].split(";").includes(expected);
  }
  return record[field] === expected;
}

async function applyFilters() {
  if (!state.sourceRevision) return;
  const generation = ++filterGeneration;
  const formData = new FormData(elements.filters);
  const query = String(formData.get("search") ?? "").trim().toLowerCase();
  const year = String(formData.get("year") ?? "");
  const order = String(formData.get("order") ?? "desc");
  const withPhotograph = formData.get("photograph") === "with";
  let photoLookup = null;
  let photoFilterFailed = false;
  elements.retryPhotoFilter.hidden = true;

  if (withPhotograph) {
    elements.grid.setAttribute("aria-busy", "true");
    elements.showMore.disabled = true;
    elements.resultCount.textContent = "Loading photograph availability… Previous results remain below.";
    try {
      photoLookup = await loadReferenceLookup();
    } catch {
      if (generation !== filterGeneration) return;
      // Preserve browsing when the optional lookup is unavailable.
      elements.filters.elements.photograph.value = "";
      photoFilterFailed = true;
    }
    if (generation !== filterGeneration) return;
  }
  elements.grid.removeAttribute("aria-busy");
  elements.showMore.disabled = false;

  state.filtered = state.records.filter((record) => {
    const searchable = [
      record.recordId,
      record.filename,
      record.date,
      record.time,
      record.tool,
      record.medium,
      record.support,
      record.dimensions,
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!query || searchable.includes(query)) &&
      (!year || record.date.startsWith(year)) &&
      (!photoLookup || Boolean(photoLookup.records[record.recordId].mainImage)) &&
      recordMatches(record, "tool", String(formData.get("tool") ?? "")) &&
      recordMatches(record, "dimensions", String(formData.get("dimensions") ?? ""))
    );
  });

  state.filtered = sortRecordsForDisplay(state.filtered, order, state.sequenceDetails);

  state.visibleCount = PAGE_SIZE;
  renderRecords();
  if (photoFilterFailed) {
    elements.resultCount.textContent += " Photograph filter unavailable; showing all matching recordings.";
    elements.retryPhotoFilter.hidden = false;
  }
}

function renderRecords() {
  elements.grid.replaceChildren();
  state.visibleCount = extendVisibleCount(
    state.filtered,
    state.visibleCount,
    state.sequenceDetails,
  );
  const visible = state.filtered.slice(0, state.visibleCount);
  const fragment = document.createDocumentFragment();
  const previews = [];

  visible.forEach((record) => {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const button = card.querySelector(".record-open");
    const preview = card.querySelector(".record-preview");
    const recordingPart = getRecordingPart(record.filename);

    button.setAttribute(
      "aria-label",
      `Open recording${recordingPart ? ` part ${recordingPart.number}` : ""} from ${formatDate(
        record.date,
      )} at ${formatTime(record.time)}`,
    );
    card.querySelector(".preview-fallback strong").textContent = record.date.slice(0, 4);
    card.querySelector(".record-id").textContent = record.recordId;
    if (recordingPart) {
      const partLabel = card.querySelector(".record-part");
      partLabel.textContent = recordingPart.label;
      partLabel.hidden = false;
    }
    card.querySelector(".record-date").textContent = formatDate(record.date);
    card.querySelector(".record-facts").textContent = [
      formatTime(record.time),
      humanizeToken(record.tool),
      formatDimensions(record.dimensions),
      formatDuration(record.durationSeconds),
    ].join(" · ");
    button.addEventListener("click", () => openRecord(record));
    fragment.append(card);
    previews.push([preview, record]);
  });

  elements.grid.append(fragment);
  previews.forEach(([preview, record]) => preparePreview(preview, record));
  elements.resultCount.textContent = `${state.filtered.length.toLocaleString()} recording${
    state.filtered.length === 1 ? "" : "s"
  }`;
  elements.showMore.hidden = state.visibleCount >= state.filtered.length;
}

function renderFeatured() {
  const record = state.records[0];
  const shell = elements.featured.querySelector(".preview-shell");
  elements.featuredDate.textContent = formatDate(record.date);
  elements.featuredMeta.textContent = `${formatTime(record.time)} · ${humanizeToken(
    record.tool,
  )} · ${formatDimensions(record.dimensions)} · ${formatDuration(record.durationSeconds)}`;
  elements.openFeatured.addEventListener("click", () => openRecord(record));
  preparePreview(shell, record, true);
}

function metadataRow(term, description) {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = description;
  wrapper.append(dt, dd);
  return wrapper;
}

function referenceRole(image) {
  if (image.view_purpose === "supplemental_documentation") return "Supplemental documentation only";
  if (image.inspection_resolution_class === "limited_resolution_full_drawing_reference") return "Full-drawing reference · limited resolution";
  if (image.inspection_resolution_class === "native_full_resolution_inspection") return "Full-drawing reference · native resolution";
  throw new Error("Unknown photograph resolution");
}

function referencePresentation(image, additional = false) {
  const sources = {
    exact_confirmed_source_bytes: "Source representation: exact confirmed source bytes.",
    inferred_same_capture_export_variant: additional
      ? "Source representation: inferred same capture export variant."
      : "Source representation: inferred same-capture export variant.",
    exact_historical_reference_bytes: "Source representation: exact historically bound reference bytes.",
    provenance_bound_review_derivative: "Source representation: provenance-bound review JPEG; original unavailable; limited representation.",
  };
  const source = sources[image.source_binding_method];
  if (!source) throw new Error("Unknown photograph source representation");
  return image.relationship_status === "proposed"
    ? `Linked through recording and registered work (proposed relationship). ${source}`
    : source;
}

async function loadReferenceLookup() {
  if (!referenceLookupPromise) {
    referenceLookupPromise = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(REFERENCE_URL, { signal: controller.signal });
        if (!response.ok) throw new Error("Reference lookup unavailable");
        const payload = await response.json();
        const ids = new Set(state.records.map((record) => record.recordId));
        if (payload.sourceRevision !== state.sourceRevision || !payload.records ||
            Object.keys(payload.records).length !== ids.size) throw new Error("Reference snapshot differs from recording index");
        const prefix = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${state.sourceRevision}/Physical_References/Photographs/images/`;
        for (const [id, entry] of Object.entries(payload.records)) {
          if (!ids.has(id) || !entry || !Array.isArray(entry.additionalReferences)) throw new Error("Invalid reference entry");
          const images = [entry.mainImage, ...entry.additionalReferences].filter(Boolean);
          const primary = images.filter((image) => image.view_purpose === "primary_inspection");
          const expectedSelection = primary.length === 1 ? "primary_inspection"
            : !primary.length && images.length === 1 ? "single_supplemental"
              : images.length ? "selection_unresolved"
                : entry.workId ? "missing_public_photo" : "missing_work_link";
          const selected = expectedSelection === "primary_inspection" ? primary[0]
            : expectedSelection === "single_supplemental" ? images[0] : null;
          if (entry.referenceCount !== images.length || entry.primaryReferenceCount !== primary.length ||
              entry.selectionStatus !== expectedSelection || entry.mainImage !== selected ||
              entry.clarification !== (selected ? "Same registered work. The photograph does not establish this recording’s endpoint." : "")) {
            throw new Error("Inconsistent reference selection");
          }
          for (const image of images) {
            const relationship = [image.relationship_status, image.evidence_class,
              image.authority_class, image.derivation_method].join("|");
            const sourceBindings = relationship === "owner_confirmed|direct_owner_confirmed|owner_direct|direct_confirmation"
              ? ["exact_confirmed_source_bytes", "inferred_same_capture_export_variant"]
              : relationship === "proposed|deterministic_transitive_bridge|derived_from_owner_confirmed_edges|transitive_closure"
                ? ["exact_historical_reference_bytes", "provenance_bound_review_derivative"] : [];
            const validRole = image.view_purpose === "primary_inspection"
              ? ["native_full_resolution_inspection", "limited_resolution_full_drawing_reference"].includes(image.inspection_resolution_class)
              : image.view_purpose === "supplemental_documentation" && image.inspection_resolution_class === "supplemental_documentation";
            const validReview = image.source_binding_method !== "provenance_bound_review_derivative" ||
              (image.inspection_resolution_class !== "native_full_resolution_inspection" &&
                image.processing_method === "jpeg_metadata_only_codestream_unchanged");
            if (image.work_id !== entry.workId || image.image_role !== "drawing_reference" ||
                !/^[a-f0-9]{64}$/.test(image.sha256) ||
                !image.fullResolutionUrl?.startsWith(prefix + entry.workId + "/") ||
                !validRole || !validReview || !sourceBindings.includes(image.source_binding_method) ||
                image.processing_spec !== "Physical_References/Photographs/PROCESSING.json" ||
                !["jpeg_metadata_only_codestream_unchanged", "embedded_primary_JPEG_codestream_and_ICC_preserved"].includes(image.processing_method)) {
              throw new Error("Invalid reference relationship or source URL");
            }
          }
        }
        return payload;
      } finally {
        window.clearTimeout(timeout);
      }
    })().catch((error) => {
      referenceLookupPromise = null;
      throw error;
    });
  }
  return referenceLookupPromise;
}

function clearReference() {
  referenceGeneration += 1;
  elements.referenceStage.querySelector("img")?.remove();
  elements.referenceStatus.hidden = false;
  elements.referenceFull.hidden = true;
  elements.referenceFull.removeAttribute("href");
  elements.referenceRepresentation.hidden = true;
  elements.referenceDetails.hidden = true;
  elements.referenceDetails.open = false;
  elements.additionalReferences.replaceChildren();
  elements.pairingClarification.hidden = true;
}

async function renderReference(record) {
  clearReference();
  const generation = referenceGeneration;
  const isCurrent = () => referenceGeneration === generation && state.activeRecord?.recordId === record.recordId;
  elements.referenceRole.textContent = "Loading reference…";
  elements.referenceStatus.textContent = "Loading physical reference…";
  try {
    const payload = await loadReferenceLookup();
    if (!isCurrent()) return;
    const entry = payload.records[record.recordId];
    const image = entry.mainImage;
    if (!image) {
      elements.referenceRole.textContent = entry.selectionStatus === "selection_unresolved" ? "Selection unresolved"
        : entry.selectionStatus === "missing_work_link" ? "Work link unresolved" : "No published photograph";
      elements.referenceStatus.textContent = entry.selectionStatus === "selection_unresolved"
        ? "A primary photograph has not been selected."
        : entry.selectionStatus === "missing_work_link" ? "No established work link is available for this recording."
          : "No published physical reference photograph is linked to this recording.";
    } else {
      const useSource = Math.max(Number(image.width_px), Number(image.height_px)) <= 1024 &&
        Number(image.size_bytes) <= 512 * 1024;
      elements.referenceRole.textContent = referenceRole(image);
      elements.referenceFull.href = image.fullResolutionUrl;
      elements.referenceFull.hidden = false;
      elements.referenceRepresentation.textContent = `${useSource ? "" : "Display-sized preview. "}${referencePresentation(image)}`;
      elements.referenceRepresentation.hidden = false;
      elements.pairingClarification.textContent = entry.clarification;
      elements.pairingClarification.hidden = false;
      const photograph = document.createElement("img");
      photograph.alt = `${useSource ? "Physical reference photograph" : "Display-sized physical reference photograph"} — ${referenceRole(image)}`;
      photograph.decoding = "async";
      photograph.addEventListener("load", () => {
        if (isCurrent()) elements.referenceStatus.hidden = true;
      }, { once: true });
      photograph.addEventListener("error", () => {
        if (!isCurrent()) return;
        photograph.remove();
        elements.referenceStatus.hidden = false;
        elements.referenceStatus.textContent = "The photograph could not load. Try the full-resolution link.";
      }, { once: true });
      elements.referenceStatus.textContent = "Loading photograph…";
      elements.referenceStage.append(photograph);
      photograph.src = useSource ? image.fullResolutionUrl : `reference-previews/${image.sha256}.jpg`;
    }
    if (entry.referenceCount) {
      elements.referenceWork.textContent = `Registered work: ${entry.workId}`;
      elements.referenceEvidence.textContent = image
        ? `Photograph relationship: ${image.relationship_status}. Evidence: ${image.evidence_class}. View: ${image.view_purpose}.`
        : "Photograph selection remains unresolved; no candidate is presented as primary.";
      for (const other of entry.additionalReferences) {
        const paragraph = document.createElement("p");
        const link = document.createElement("a");
        link.href = other.fullResolutionUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = `${referenceRole(other)} ↗`;
        const evidence = document.createElement("small");
        evidence.textContent = referencePresentation(other, true);
        paragraph.append(link, document.createElement("br"), evidence);
        elements.additionalReferences.append(paragraph);
      }
      elements.referenceManifest.href = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/blob/${state.sourceRevision}/Physical_References/Photographs/manifest.csv`;
      elements.referenceDetails.hidden = false;
    }
  } catch {
    if (!isCurrent()) return;
    elements.referenceRole.textContent = "Reference lookup unavailable";
    elements.referenceStatus.textContent = "The reference lookup could not load. Recording playback remains available.";
  }
}

function renderDialog(record) {
  state.activeRecord = record;
  elements.dialogRecordId.textContent = `Standard Time Lapse · ${record.recordId}`;
  elements.dialogTitle.textContent = `${formatDate(record.date)} — ${formatTime(record.time)}`;
  elements.dialogFilename.textContent = record.filename;
  elements.dialogHash.textContent = record.integrityReference;
  elements.dialogSource.href = record.sourceUrl;
  elements.dialogSourceTop.href = record.sourceUrl;
  elements.dialogMetadata.replaceChildren(
    metadataRow("Finish date", record.date),
    metadataRow(
      "Finish time",
      record.time ? `${formatTime(record.time)} (documented local time)` : "Unknown time",
    ),
    metadataRow("Instrument", humanizeToken(record.tool)),
    metadataRow("Medium", humanizeToken(record.medium)),
    metadataRow("Surface", humanizeToken(record.support)),
    metadataRow("Dimensions", formatDimensions(record.dimensions)),
    metadataRow("Duration", formatDuration(record.durationSeconds)),
  );

  resetDialogVideo();
  preparePreview(elements.dialogPreview, record, true);
  renderReference(record);

  const currentIndex = state.filtered.findIndex((item) => item.recordId === record.recordId);
  elements.previousRecord.disabled = currentIndex <= 0;
  elements.nextRecord.disabled = currentIndex < 0 || currentIndex >= state.filtered.length - 1;
  elements.previousRecord.dataset.index = String(currentIndex - 1);
  elements.nextRecord.dataset.index = String(currentIndex + 1);
}

function openRecord(record, updateHash = true) {
  renderDialog(record);
  if (!elements.dialog.open) elements.dialog.showModal();
  if (updateHash) history.replaceState(null, "", `#record=${record.recordId}`);
}

function resetDialogVideo() {
  elements.fullVideo.pause();
  elements.fullVideo.removeAttribute("src");
  elements.fullVideo.load();
  elements.fullVideo.hidden = true;
  elements.dialogPreview.hidden = false;
  pausePreview(elements.dialogPreview);
  elements.loadFullVideo.hidden = false;
}

elements.loadFullVideo.addEventListener("click", async () => {
  if (!state.activeRecord) return;
  pausePreview(elements.dialogPreview);
  elements.dialogPreview.hidden = true;
  elements.loadFullVideo.hidden = true;
  elements.fullVideo.hidden = false;
  elements.fullVideo.src = state.activeRecord.videoUrl;
  elements.fullVideo.preload = "metadata";
  elements.fullVideo.load();
  try {
    await elements.fullVideo.play();
  } catch {
    // Native controls remain available when a browser blocks programmatic playback.
  }
});

function navigateDialog(button) {
  const index = Number(button.dataset.index);
  const record = state.filtered[index];
  if (record) openRecord(record);
}

elements.previousRecord.addEventListener("click", () => navigateDialog(elements.previousRecord));
elements.nextRecord.addEventListener("click", () => navigateDialog(elements.nextRecord));

elements.dialog.addEventListener("close", () => {
  if (elements.dialog.open) return;
  clearReference();
  resetDialogVideo();
  state.activeRecord = null;
  if (location.hash.startsWith("#record=")) history.replaceState(null, "", location.pathname);
});

elements.showMore.addEventListener("click", () => {
  state.visibleCount += PAGE_SIZE;
  renderRecords();
});

elements.filters.addEventListener("input", applyFilters);
elements.filters.addEventListener("change", applyFilters);
elements.filters.addEventListener("reset", () => window.setTimeout(applyFilters));
elements.retryPhotoFilter.addEventListener("click", () => {
  elements.filters.elements.photograph.value = "with";
  applyFilters();
});

function openHashRecord() {
  const match = location.hash.match(/^#record=(tla-[a-f0-9]+)$/);
  if (!match || !state.records.length) return;
  const record = state.records.find((item) => item.recordId === match[1]);
  if (record) openRecord(record, false);
}

window.addEventListener("hashchange", openHashRecord);

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (previewIntegration) {
    previewIntegration.cleanup();
  }
  if (dynamicPreview) {
    dynamicPreview.clearCache();
  }
});

async function initialize() {
  elements.retryData.disabled = true;
  elements.dataError.hidden = true;
  elements.resultCount.textContent = "Loading records…";

  try {
    // Initialize Dynamic Preview System
    if (typeof DynamicVideoPreview !== 'undefined') {
      dynamicPreview = new DynamicVideoPreview({
        outputQuality: 'medium',
        previewDuration: 3000,
        frameRate: 24
      });
      previewIntegration = new PreviewShellIntegration(dynamicPreview);
      console.log('Dynamic preview system initialized');
    }

    const payload = await loadRecords(DATA_URL);
    state.records = payload.records;
    state.sourceRevision = payload.sourceRevision;
    state.sequenceDetails = deriveRecordingSequences(state.records);

    elements.recordCount.textContent = state.records.length.toLocaleString();
    const oldest = state.records.at(-1);
    const newest = state.records[0];
    elements.dateCoverage.textContent = `${oldest.date.slice(0, 4)}–${newest.date.slice(0, 4)}`;

    populateFilters();
    renderFeatured();
    applyFilters();
    openHashRecord();
  } catch (error) {
    const code = error instanceof RecordsDataError ? error.code : "unexpected";
    console.error("Recording index initialization failed", {
      code,
      status: error instanceof RecordsDataError ? error.status : null,
      error,
    });
    elements.resultCount.textContent = "Recording index unavailable";
    elements.dataErrorMessage.textContent =
      code === "timeout"
        ? "The recording index took too long to load."
        : code === "invalid_payload" || code === "invalid_json"
          ? "The published recording index could not be validated."
          : navigator.onLine === false
            ? "The recording index is unavailable while this device is offline."
            : "The recording index could not be loaded.";
    elements.dataError.hidden = false;
  } finally {
    elements.retryData.disabled = false;
  }
}

elements.retryData.addEventListener("click", initialize);
initialize();
