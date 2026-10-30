import {attachPhotographDownloads, PHOTOGRAPH_DOWNLOADS_SHA256} from "../assets/photograph-downloads.js";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {buildSelectedFrontIndex, SELECTED_FRONTS_SHA256, LEGACY_REFERENCE_SHA256, PHOTO_SELECTION_REGISTRY_SHA256} from "../assets/selected-fronts.js";
const hash = value => createHash("sha256").update(value).digest("hex");

export function validateRegistryDownloads(manifest, registry) {
  const selected = new Map(registry.selections.map(row => [row.work_id, row]));
  if (!Array.isArray(manifest.rows) || manifest.rows.length !== selected.size) throw new Error("Photo registry download coverage differs");
  const seen = new Set();
  for (const row of manifest.rows) {
    const source = selected.get(row.work_id);
    if (!source || seen.has(row.work_id)) throw new Error("Photo registry download work differs");
    const d = source.download;
    const expected = {path:d.path,sha256:d.sha256,width_px:d.width_px,height_px:d.height_px,
      size_bytes:d.size_bytes,resolution_class:d.resolution_class,media_revision:d.media_revision,
      work_id:source.work_id,source_sha256:source.source_photograph_sha256,display_sha256:source.display.sha256,
      representation:d.representation ?? null,source_filename:d.source_filename ?? null};
    if (Object.keys(row).length !== Object.keys(expected).length || Object.keys(expected).some(key => row[key] !== expected[key])) {
      throw new Error("Photo registry download representation differs");
    }
    seen.add(row.work_id);
  }
}

export function validateRegistrySelections(projection, registry) {
  const source = new Map(registry.selections.map(row => [row.work_id, row]));
  if (source.size !== registry.selections.length || source.size !== projection.selections.length) {
    throw new Error("Photo registry work population differs");
  }
  const seen = new Set();
  for (const row of projection.selections) {
    const expected = source.get(row.work_id);
    if (!expected || seen.has(row.work_id) || row.photo_role !== expected.photo_role ||
        row.source_photograph_sha256 !== expected.source_photograph_sha256 ||
        row.display.output_display_sha256 !== expected.display.sha256 ||
        !row.download || Object.keys(row.download).length !== Object.keys(expected.download).length ||
        Object.keys(expected.download).some(key => row.download[key] !== expected.download[key])) {
      throw new Error("Photo registry source/display selection differs");
    }
    seen.add(row.work_id);
  }
  const unselected = new Set(registry.unselected_work_ids ?? []);
  if (projection.unselected_work_ids.length !== unselected.size || projection.unselected_work_ids.some(id => !unselected.has(id))) throw new Error('Photo registry unselected coverage differs');
}

export function validateSelectedFrontAssets(root) {
  const bytes = readFileSync(join(root,"data/selected-fronts.json"));
  if (hash(bytes)!==SELECTED_FRONTS_SHA256) throw new Error("Selected-front projection is not the validated candidate");
  const sourceBytes = readFileSync(join(root,"data/source-photo-selections.json"));
  if (hash(sourceBytes)!==PHOTO_SELECTION_REGISTRY_SHA256) throw new Error("Retained source photo registry hash differs");
  const projection = JSON.parse(bytes);
  validateRegistrySelections(projection, JSON.parse(sourceBytes));
  const referenceBytes = readFileSync(join(root,"data/physical-references.json"));
  if (hash(referenceBytes)!==LEGACY_REFERENCE_SHA256) throw new Error("Historical reference evidence changed; regenerate the selection integration explicitly");
  const records=JSON.parse(readFileSync(join(root,"data/records.json")));
  const index=buildSelectedFrontIndex(projection,records,JSON.parse(referenceBytes));
  const downloads = readFileSync(join(root,"data/photograph-downloads.json"));
  if (hash(downloads) !== PHOTOGRAPH_DOWNLOADS_SHA256) throw new Error("Photograph download manifest changed without validation");
  validateRegistryDownloads(JSON.parse(downloads),JSON.parse(sourceBytes));
  attachPhotographDownloads(index,JSON.parse(downloads));
  for (const display of Object.values(index.byWork)) {
    const raw=readFileSync(join(root,display.displayUrl));
    if (!raw.length || raw.length>524288 || hash(raw)!==display.displaySha256) throw new Error(`Selected-front bytes differ: ${display.workId}`);
  }
  return {works:Object.keys(index.byWork).length,recordings:Object.keys(index.byRecord).length};
}
