import { loadSelectedFrontIndex, applySelectedFronts } from "./selected-fronts.js?v=photo-selections-2890eef05c0c-1c1c5a299eac";
import { loadRecords } from "./data-loader.js?v=20261025-canonical-metadata";
import { buildDrawingArchive, verifiedDrawingEvidence } from "./drawing-archive-model.js?v=20261029-unlinked-recordings";
import { getPhotographDisplayRotation } from "./photograph-orientation.js?v=20261020-owner-rotation";

const summary = document.querySelector("#archive-summary");
const gallery = document.querySelector("#drawing-grid");
const pending = document.querySelector("#pending-drawings");
const search = document.querySelector("#drawing-search");
const labels = {
  no_published_photograph: "No linked public photograph",
  reference_review: "No confirmed primary photograph",
  display_unavailable: "Small photograph preview unavailable",
};

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function recordingLinks(work) {
  const details = node("details");
  details.append(node("summary", `${work.records.length} linked recording${work.records.length === 1 ? "" : "s"}`));
  const list = node("ul", undefined, "recording-links");
  for (const record of work.records) {
    const item = node("li");
    const link = node("a", record.filename);
    link.href = `./#record=${record.recordId}`;
    item.append(link);
    list.append(item);
  }
  details.append(list);
  return details;
}

function photographLinks(work) {
  const list = node("ul", undefined, "photograph-links");
  const representations = {
    exact_confirmed_source_bytes: "Exact confirmed source bytes",
    owner_confirmed_display_derivative: "Owner-confirmed public display JPEG; limited derivative, not original source bytes",
    inferred_same_capture_export_variant: "Inferred same-capture export variant",
    exact_historical_reference_bytes: "Exact historically bound reference bytes",
    provenance_bound_review_derivative: "Review JPEG; original unavailable; limited representation",
  };
  for (const { photo, description } of work.referenceLinks) {
    const item = node("li");
    const link = node("a", `${description.title} ↗`);
    link.href = photo.fullResolutionUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    const detail = node("small", `${description.detail} Source representation: ${representations[photo.source_binding_method] ?? photo.source_binding_method}. ${photo.inspection_resolution_class.replaceAll("_", " ")}.${description.surfaceScope ? ` Recorded surface scope: ${description.surfaceScope.replaceAll("_", " ")}.` : ""}${description.caution ? ` Source caution: ${description.caution}` : ""}`);
    item.append(link, detail);
    list.append(item);
  }
  return list;
}

function dates(work) {
  const values = [...new Set(work.records.map((record) => record.date))].sort();
  return values.length === 1 ? values[0] : `${values[0]} – ${values.at(-1)}`;
}

function render(works) {
  const query = search.value.trim().toLowerCase();
  const visible = works.filter((work) => `${work.workId} ${work.records.map((r) => `${r.recordId} ${r.filename}`).join(" ")}`.toLowerCase().includes(query));
  const ready = visible.filter((work) => work.selectedFront || work.photograph);
  const awaiting = visible.filter((work) => !work.selectedFront && !work.photograph);
  gallery.replaceChildren();
  pending.replaceChildren();
  document.querySelector("#visible-summary").textContent = `${visible.length} drawing${visible.length === 1 ? "" : "s"} · ${ready.length} with confirmed photographs`;
  document.querySelector("#pending-summary").textContent = `${awaiting.length} drawing${awaiting.length === 1 ? "" : "s"} without a confirmed display photograph`;
  document.querySelector("#empty-gallery").hidden = ready.length > 0;
  for (const work of ready) {
    const card = node("article", undefined, "drawing-card");
    const link = node("a", undefined, "drawing-image-link");
    link.href = work.displayUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.setAttribute("aria-label", `Open small photograph for ${work.workId}`);
    const image = node("img");
    image.alt = `Confirmed reference photograph for drawing ${work.workId}`;
    image.loading = "lazy";
    image.decoding = "async";
    if (!work.selectedFront && getPhotographDisplayRotation(work.photograph) === 90) image.classList.add("owner-rotation-clockwise");
    image.addEventListener("error", () => {
      link.replaceWith(node("p", "Photograph could not load. The recording and reference details remain available.", "image-error"));
    }, { once: true });
    image.src = work.displayUrl;
    link.append(image);
    const caption = node("div", undefined, "drawing-caption");
    if (work.selectedFront) caption.append(node("p", "Owner-confirmed selected front · limited display JPEG. This photograph does not establish a recording endpoint.", "drawing-reference-note"));
    if (work.selectedFront?.downloadUrl) {
      const download = node("a", `${work.selectedFront.downloadLabel} (${work.selectedFront.downloadDimensions}) ↗`, "photograph-download");
      download.href = work.selectedFront.downloadUrl;
      download.target = "_blank"; download.rel = "noreferrer";
      caption.append(download);
    }
    caption.append(node("p", `Documented finish: ${dates(work)}`, "drawing-date"), node("h3", work.workId), photographLinks(work), recordingLinks(work));
    card.append(link, caption);
    gallery.append(card);
  }
  for (const work of awaiting) {
    const row = node("article", undefined, "pending-drawing");
    row.append(node("h3", work.workId), node("p", `${dates(work)} · ${labels[work.status]}`), photographLinks(work), recordingLinks(work));
    pending.append(row);
  }
}

try {
  const [recordData, referenceBytes, previews, evidence] = await Promise.all([
    loadRecords("data/records.json?v=source-refresh-08cff299256b152828b69e261ad9d791dbc2376d"),
    fetch("data/physical-references.json?v=source-refresh-08cff299256b152828b69e261ad9d791dbc2376d").then((response) => { if (!response.ok) throw new Error("Photograph lookup unavailable"); return response.arrayBuffer(); }),
    fetch("reference-previews/manifest.json?v=source-refresh-08cff299256b152828b69e261ad9d791dbc2376d").then((response) => { if (!response.ok) throw new Error("Preview manifest unavailable"); return response.json(); }),
    (async () => {
      const response = await fetch("data/reference-link-evidence.json?v=source-refresh-08cff299256b152828b69e261ad9d791dbc2376d", { signal: AbortSignal.timeout(5000) });
      return response.ok ? response.json() : null;
    })().catch(() => null),
  ]);
  const references = JSON.parse(new TextDecoder().decode(referenceBytes));
  const proof = await verifiedDrawingEvidence(referenceBytes, evidence);
  const selectedFronts = await loadSelectedFrontIndex(recordData, references);
  const works = applySelectedFronts(buildDrawingArchive(recordData, references, previews, proof), selectedFronts);
  const unlinkedCount = recordData.records.length - works.reduce((total, work) => total + work.records.length, 0);
  summary.textContent = `${works.length} registered drawings · ${works.filter((work) => work.selectedFront || work.photograph).length} confirmed photographs` +
    (unlinkedCount ? `. ${unlinkedCount} recordings have no assigned work ID and remain available in the recording browser.` : "");
  const source = document.querySelector("#drawing-source");
  source.href = `https://huggingface.co/datasets/${recordData.sourceRepository}/tree/${recordData.sourceRevision}/Work_Identity`;
  source.textContent = `Source snapshot ${recordData.sourceRevision.slice(0, 8)}`;
  search.disabled = false;
  search.addEventListener("input", () => render(works));
  render(works);
} catch (error) {
  summary.textContent = "The drawing index could not load. Reload to retry, or use the recording browser.";
  console.error("Drawing archive unavailable", error);
}
