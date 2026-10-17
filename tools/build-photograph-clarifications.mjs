import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describeReferenceLink } from "../assets/reference-policy.js";

const ROOT = new URL("../", import.meta.url);
const SITE = "https://maxwellinked.github.io/time-lapse-artifacts/";
export const QUESTIONS = {
  source_variant: ["Qualified source variant", "This file has an inferred export-variant binding. Keep the drawing identification and this file's source qualification separate; the existing evidence is described under photograph links. You may identify the exact existing source or supply a new original to resolve its source qualification."],
  proposed_match: ["Photograph match needs evidence", "A complete supporting chain for this photograph has not been verified here. Check the existing evidence or identify the exact photograph. Private evidence may exist; this listing does not declare the match false."],
  primary_selection: ["Primary photograph not selected", "Review the published candidates before choosing a primary. No candidate is selected here."],
  missing_work: ["Recording-to-work link unresolved", "Establish which physical drawing this recording belongs to before assigning a photograph."],
  missing_photo: ["No published photograph", "The work link is established. No photograph is published in this snapshot. A new photograph is optional."],
  supplemental_only: ["Supplemental photograph only", "The existing photograph retains its supplemental role. A full-sheet photograph is an optional coverage improvement, not an unresolved work identity."],
};

export function clarificationReasons(entry, evidence, revision) {
  const reasons = new Set();
  if (!entry?.workId) return ["missing_work"];
  const photos = [entry.mainImage, ...(entry.additionalReferences ?? [])].filter(Boolean);
  if (!photos.length) reasons.add("missing_photo");
  if (entry.selectionStatus === "selection_unresolved") reasons.add("primary_selection");
  if (photos.length && photos.every((image) => image.view_purpose === "supplemental_documentation")) {
    reasons.add("supplemental_only");
  }
  for (const image of photos) {
    const link = describeReferenceLink(entry, image, evidence, revision);
    const direct = image.work_id === entry.workId &&
      image.relationship_status === "owner_confirmed" && image.evidence_class === "direct_owner_confirmed" &&
      image.authority_class === "owner_direct" && image.derivation_method === "direct_confirmation";
    if (image.source_binding_method === "inferred_same_capture_export_variant") reasons.add("source_variant");
    if (!direct && !link.supportedIndirect) reasons.add("proposed_match");
  }
  return [...reasons];
}

export function collectClarifications(payload, lookup, evidence) {
  const works = new Map();
  for (const record of payload.records) {
    const entry = lookup.records[record.recordId];
    const reasons = clarificationReasons(entry, evidence, payload.sourceRevision);
    // A missing work link must never merge unrelated recordings into one work.
    const key = entry?.workId ?? record.recordId;
    if (!works.has(key)) works.set(key, { key, workId: entry?.workId, reasons: new Set(), records: [], photos: new Map() });
    const work = works.get(key);
    for (const reason of reasons) work.reasons.add(reason);
    work.records.push(record);
    for (const image of [entry?.mainImage, ...(entry?.additionalReferences ?? [])].filter(Boolean)) {
      work.photos.set(image.sha256, { image, ...describeReferenceLink(entry, image, evidence, payload.sourceRevision) });
    }
  }
  return [...works.values()].filter((work) => work.reasons.size).map((work) => ({ ...work, reasons: [...work.reasons], photos: [...work.photos.values()],
    records: work.records.sort((a, b) => b.date.localeCompare(a.date) || a.filename.localeCompare(b.filename)) }))
    .sort((a, b) => b.records[0].date.localeCompare(a.records[0].date) || a.key.localeCompare(b.key));
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export function buildClarificationPage(payload, lookup, evidence) {
  if (evidence.schemaVersion !== 1 || payload.sourceRevision !== lookup.sourceRevision || evidence.sourceRevision !== lookup.sourceRevision) {
    throw new Error("Photograph clarification snapshot mismatch");
  }
  const works = collectClarifications(payload, lookup, evidence);
  for (const work of works) for (const { image } of work.photos) {
    const expected = `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${payload.sourceRevision}/${image.image_path}`;
    if (image.fullResolutionUrl !== expected) throw new Error("Photograph link is not bound to this source snapshot");
  }
  const counts = Object.fromEntries(Object.keys(QUESTIONS).map((key) => [key, works.filter((work) => work.reasons.includes(key)).length]));
  const recordLink = (record) => `<a href="${SITE}#record=${escape(record.recordId)}">${escape(record.filename)}</a> <code>${escape(record.recordId)}</code>`;
  const rows = works.map((work) => `<article id="${escape(work.key)}" data-reasons="${work.reasons.join(" ")}">
  <h2>${escape(work.records[0].date)} · ${escape(work.records[0].tool)} · ${escape(work.records[0].dimensions)} in</h2>
  <p><code>${escape(work.key)}</code> · ${work.records.length} recording${work.records.length === 1 ? "" : "s"}</p>
  ${work.reasons.map((key) => `<p><strong>${escape(QUESTIONS[key][0])}.</strong> ${escape(QUESTIONS[key][1])}</p>`).join("\n  ")}
  <p>${recordLink(work.records[0])}</p>
  ${work.records.length > 1 ? `<details><summary>All ${work.records.length} recording links</summary><ul>${work.records.map((record) => `<li>${recordLink(record)}</li>`).join("")}</ul></details>` : ""}
  ${work.photos.length ? `<details><summary>Existing photograph links and qualifications</summary><ul>${work.photos.map((photo) => `<li><a href="${escape(photo.image.fullResolutionUrl)}">${escape(photo.title)}</a><p>${escape(photo.detail)}</p>${photo.surfaceScope ? `<p>Surface scope: ${escape(photo.surfaceScope)}</p>` : ""}${photo.caution ? `<p>${escape(photo.caution)}</p>` : ""}<code>${escape(photo.image.sha256)}</code></li>`).join("")}</ul></details>` : ""}
</article>`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photograph clarification list · Time-Lapse Artifacts</title>
<style>
:root { color-scheme: light dark; --page: light-dark(#e8e9e7,#111315); --ink: light-dark(#202326,#f0f1ef); --rule: light-dark(#bfc3c6,#363a3e); }
* { box-sizing: border-box; } body { margin:0; background:var(--page); color:var(--ink); font:16px/1.6 system-ui,sans-serif; }
main { max-width:1000px; margin:auto; padding:28px 20px 70px; } h1 { font:400 34px/1.2 Georgia,serif; } h2 { font-size:18px; font-weight:500; }
a { color:inherit; text-decoration:underline; text-underline-offset:3px; } p,li,code { overflow-wrap:anywhere; } code { font-size:13px; }
.controls { display:flex; gap:16px; flex-wrap:wrap; } label { display:grid; flex:1 1 240px; gap:6px; }
input,select { min-height:44px; min-width:0; width:100%; padding:8px; font:inherit; background:var(--page); color:var(--ink); border:1px solid var(--rule); }
article { border-top:1px solid var(--rule); padding:16px 0; scroll-margin-top:16px; } summary { cursor:pointer; padding:8px 0; } li { margin-bottom:14px; } ul { padding-left:22px; }
:focus-visible { outline:2px solid currentColor; outline-offset:4px; } [hidden] { display:none; }
</style></head><body><main>
<a href="${SITE}">← Browse recordings</a>
<h1>Photograph clarification list</h1>
<p>One entry per drawing, with direct links to its recordings. Source-file questions, unverified photograph matches and unresolved primary choices remain distinct. Missing or supplemental-only photographs are coverage gaps; their work links are established.</p>
<p>A listed question does not require a new photograph. Supported indirect links remain qualified references, even when their recorded status is proposed.</p>
<div class="controls"><label>Find a drawing, date, filename or ID<input id="search" type="search" autocomplete="off"></label>
<label>Reason<select id="reason"><option value="">All listed drawings (${works.length})</option>${Object.entries(QUESTIONS).filter(([key]) => counts[key]).map(([key, [label]]) => `<option value="${key}">${escape(label)} (${counts[key]})</option>`).join("")}</select></label></div>
<p id="result-count" aria-live="polite">${works.length} drawings</p>
<section aria-label="Drawings with photograph questions or gaps">${rows}</section>
<p>Source snapshot: <a href="https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/tree/${escape(payload.sourceRevision)}"><code>${escape(payload.sourceRevision)}</code></a>. This list describes that snapshot; archive evidence and primary-image rules are unchanged.</p>
</main><script>
const rows = [...document.querySelectorAll('article[data-reasons]')];
const search = document.getElementById('search'), reason = document.getElementById('reason');
function filterRows() {
  const query = search.value.trim().toLowerCase(); let count = 0;
  for (const row of rows) {
    row.hidden = Boolean((query && !row.textContent.toLowerCase().includes(query)) || (reason.value && !row.dataset.reasons.split(' ').includes(reason.value)));
    if (!row.hidden) count++;
  }
  document.getElementById('result-count').textContent = count + (count === 1 ? ' drawing' : ' drawings');
}
search.addEventListener('input', filterRows); reason.addEventListener('change', filterRows);
</script></body></html>
`.replace(/[ \t]+$/gm, "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (path) => JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));
  const result = buildClarificationPage(read("data/records.json"), read("data/physical-references.json"), read("data/reference-link-evidence.json"));
  const target = new URL("photograph-clarifications.html", ROOT);
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== result) throw new Error("Photograph clarification list is stale; regenerate it");
    console.log("CHECK PASS: photograph clarification list matches its source snapshot");
  } else {
    writeFileSync(target, result);
    console.log(`Wrote ${fileURLToPath(target)}`);
  }
}
