import {attachPhotographDownloads, PHOTOGRAPH_DOWNLOADS_SHA256} from "../assets/photograph-downloads.js";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {buildSelectedFrontIndex, SELECTED_FRONTS_SHA256, LEGACY_REFERENCE_SHA256} from "../assets/selected-fronts.js";
const hash = value => createHash("sha256").update(value).digest("hex");
export function validateSelectedFrontAssets(root) {
  const bytes = readFileSync(join(root,"data/selected-fronts.json"));
  if (hash(bytes)!==SELECTED_FRONTS_SHA256) throw new Error("Selected-front projection is not the validated candidate");
  const referenceBytes = readFileSync(join(root,"data/physical-references.json"));
  if (hash(referenceBytes)!==LEGACY_REFERENCE_SHA256) throw new Error("Historical reference evidence changed; regenerate the selection integration explicitly");
  const records=JSON.parse(readFileSync(join(root,"data/records.json")));
  const index=buildSelectedFrontIndex(JSON.parse(bytes),records,JSON.parse(referenceBytes));
  const downloads = readFileSync(join(root,"data/photograph-downloads.json"));
  if (hash(downloads) !== PHOTOGRAPH_DOWNLOADS_SHA256) throw new Error("Photograph download manifest changed without validation");
  attachPhotographDownloads(index,JSON.parse(downloads));
  for (const display of Object.values(index.byWork)) {
    const raw=readFileSync(join(root,display.displayUrl));
    if (!raw.length || raw.length>524288 || hash(raw)!==display.displaySha256) throw new Error(`Selected-front bytes differ: ${display.workId}`);
  }
  return {works:Object.keys(index.byWork).length,recordings:Object.keys(index.byRecord).length};
}
