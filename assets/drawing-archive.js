import { loadRecords } from "./data-loader.js";
import { buildDrawingArchive } from "./drawing-archive-model.js";

const summary = document.querySelector("#archive-summary");
const gallery = document.querySelector("#drawing-grid");
const pending = document.querySelector("#pending-drawings");
const search = document.querySelector("#drawing-search");
const labels = {
  no_published_photograph: "No linked public photograph",
  reference_review: "No confirmed primary photograph; see reference details",
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

function dates(work) {
  const values = [...new Set(work.records.map((record) => record.date))].sort();
  return values.length === 1 ? values[0] : `${values[0]} – ${values.at(-1)}`;
}

function render(works) {
  const query = search.value.trim().toLowerCase();
  const visible = works.filter((work) => `${work.workId} ${work.records.map((r) => `${r.recordId} ${r.filename}`).join(" ")}`.toLowerCase().includes(query));
  const ready = visible.filter((work) => work.photograph);
  const awaiting = visible.filter((work) => !work.photograph);
  gallery.replaceChildren();
  pending.replaceChildren();
  document.querySelector("#visible-summary").textContent = `${visible.length} drawings · ${ready.length} with confirmed photographs`;
  document.querySelector("#pending-summary").textContent = `${awaiting.length} drawings without a confirmed display photograph`;
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
    image.addEventListener("error", () => {
      link.replaceWith(node("p", "Photograph could not load. The recording and reference details remain available.", "image-error"));
    }, { once: true });
    image.src = work.displayUrl;
    link.append(image);
    const caption = node("div", undefined, "drawing-caption");
    caption.append(node("p", `Documented finish: ${dates(work)}`, "drawing-date"), node("h3", work.workId), recordingLinks(work));
    card.append(link, caption);
    gallery.append(card);
  }
  for (const work of awaiting) {
    const row = node("article", undefined, "pending-drawing");
    row.append(node("h3", work.workId), node("p", `${dates(work)} · ${labels[work.status]}`), recordingLinks(work));
    pending.append(row);
  }
}

try {
  const [recordData, references, previews] = await Promise.all([
    loadRecords("data/records.json"),
    fetch("data/physical-references.json").then((response) => { if (!response.ok) throw new Error("Photograph lookup unavailable"); return response.json(); }),
    fetch("reference-previews/manifest.json").then((response) => { if (!response.ok) throw new Error("Preview manifest unavailable"); return response.json(); }),
  ]);
  const works = buildDrawingArchive(recordData, references, previews);
  summary.textContent = `${works.length} registered drawings represented in the Standard recording index. ${works.filter((work) => work.photograph).length} have a confirmed photograph available here.`;
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
