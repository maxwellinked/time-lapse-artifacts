import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPhotographDisplayRotation } from "../assets/photograph-orientation.js";
import { getDisplayReference } from "../assets/reference-policy.js";

test("only the four exact owner-identified photographs receive an additional clockwise quarter-turn", () => {
  const lookup = JSON.parse(readFileSync(new URL("../data/physical-references.json", import.meta.url)));
  const before = JSON.stringify(lookup);
  const photographs = new Map(Object.values(lookup.records).map(getDisplayReference).filter(Boolean).map((image) => [image.sha256, image]));
  const approved = [...photographs.values()].filter((image) => getPhotographDisplayRotation(image) === 90);
  assert.deepEqual(approved.map((image) => image.work_id).sort(), [
    "tlaw-27d91c3c3ca5d9e3", "tlaw-a77d16972149f232", "tlaw-3c632c55f324b287", "tlaw-ed372076fbc9d7c6",
  ].sort());
  for (const image of approved) {
    assert.equal(getPhotographDisplayRotation({ ...image, sha256: "0".repeat(64) }), 0);
    assert.equal(getPhotographDisplayRotation({ ...image, work_id: "tlaw-0000000000000000" }), 0);
  }
  for (const image of [null, {}, { work_id: "toString", sha256: "other" }]) assert.equal(getPhotographDisplayRotation(image), 0);
  assert.equal(photographs.size - approved.length, 74);
  assert.equal(JSON.stringify(lookup), before);
});
