import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  deriveRecordingSequences,
  extendVisibleCount,
  getRecordingPart,
  sortRecordsForDisplay,
} from "../assets/record-sequences.js";

function record({
  id,
  rowIndex,
  date,
  time = "12:00",
  part = null,
  descriptor = "BallpointPen.Ink.Paper.9x12",
}) {
  return {
    recordId: id,
    rowIndex,
    date,
    time,
    filename: part
      ? `${date}.${time.replace(":", "")}.${descriptor}.Rec${String(part).padStart(2, "0")}.mp4`
      : `${date}.${time.replace(":", "")}.${descriptor}.mp4`,
  };
}

test("reads literal RecNN suffixes without assigning them to a sequence", () => {
  assert.deepEqual(getRecordingPart("2026-08-29.0716.Ink.Paper.Rec01.mp4"), {
    number: 1,
    label: "REC 01",
  });
  assert.deepEqual(getRecordingPart("2026-08-29.0716.Ink.Paper.Rec105.mp4"), {
    number: 105,
    label: "REC 105",
  });
  assert.equal(getRecordingPart("2026-08-29.0716.Ink.Paper.mp4"), null);
});

test("derives only contiguous source-order runs beginning with Rec01", () => {
  const records = [
    record({ id: "orphan", rowIndex: 9, date: "2026-08-19", part: 1 }),
    record({ id: "first", rowIndex: 10, date: "2026-08-22", part: 1 }),
    record({ id: "second", rowIndex: 11, date: "2026-08-22", part: 2 }),
    record({ id: "third", rowIndex: 12, date: "2026-08-23", part: 3 }),
    record({ id: "gapped-first", rowIndex: 20, date: "2026-08-24", part: 1 }),
    record({ id: "gapped-second", rowIndex: 22, date: "2026-08-24", part: 2 }),
    record({ id: "changed-first", rowIndex: 30, date: "2026-08-25", part: 1 }),
    record({
      id: "changed-second",
      rowIndex: 31,
      date: "2026-08-25",
      part: 2,
      descriptor: "BallpointPen.Ink.Paper.12x9",
    }),
  ].reverse();

  const details = deriveRecordingSequences(records);
  const groupId = details.get("first").groupId;

  assert.ok(groupId);
  assert.equal(details.get("second").groupId, groupId);
  assert.equal(details.get("third").groupId, groupId);
  assert.equal(details.get("third").sequencePosition, 3);
  assert.equal(details.get("third").sequenceSize, 3);
  assert.equal(details.get("orphan").groupId, null);
  assert.equal(details.get("gapped-first").groupId, null);
  assert.equal(details.get("gapped-second").groupId, null);
  assert.equal(details.get("changed-first").groupId, null);
  assert.equal(details.get("changed-second").groupId, null);
});

test("sorts groups by date while keeping their recording parts forward", () => {
  const records = [
    record({ id: "newest", rowIndex: 13, date: "2026-08-24" }),
    record({ id: "third", rowIndex: 12, date: "2026-08-23", part: 3 }),
    record({ id: "second", rowIndex: 11, date: "2026-08-22", time: "16:13", part: 2 }),
    record({ id: "first", rowIndex: 10, date: "2026-08-22", time: "01:24", part: 1 }),
    record({ id: "oldest", rowIndex: 9, date: "2026-08-19" }),
  ];
  const details = deriveRecordingSequences(records);

  assert.deepEqual(
    sortRecordsForDisplay(records, "desc", details).map(({ recordId }) => recordId),
    ["newest", "first", "second", "third", "oldest"],
  );
  assert.deepEqual(
    sortRecordsForDisplay(records, "asc", details).map(({ recordId }) => recordId),
    ["oldest", "first", "second", "third", "newest"],
  );
});

test("leaves non-Rec records in ordinary chronological order", () => {
  const records = [
    record({ id: "middle", rowIndex: 2, date: "2026-08-20" }),
    record({ id: "oldest", rowIndex: 1, date: "2026-08-19" }),
    record({ id: "newest", rowIndex: 3, date: "2026-08-21" }),
  ];
  const details = deriveRecordingSequences(records);

  assert.deepEqual(
    sortRecordsForDisplay(records, "desc", details).map(({ recordId }) => recordId),
    ["newest", "middle", "oldest"],
  );
  assert.deepEqual(
    sortRecordsForDisplay(records, "asc", details).map(({ recordId }) => recordId),
    ["oldest", "middle", "newest"],
  );
});

test("extends a page boundary through the end of a recognized sequence", () => {
  const standalone = Array.from({ length: 9 }, (_, index) =>
    record({
      id: `standalone-${index}`,
      rowIndex: index,
      date: "2026-08-29",
      time: `0${index}:00`,
    }),
  );
  const sequence = Array.from({ length: 10 }, (_, index) =>
    record({
      id: `part-${index + 1}`,
      rowIndex: 9 + index,
      date: "2026-08-28",
      part: index + 1,
    }),
  );
  const records = [...standalone, ...sequence];
  const details = deriveRecordingSequences(records);

  assert.equal(extendVisibleCount(records, 18, details), 19);
  assert.equal(extendVisibleCount(records, 9, details), 9);
  assert.equal(extendVisibleCount(records, 19, details), 19);
});

test("keeps the indexed August 22–23 recording run forward without joining August 19", () => {
  const records = JSON.parse(
    readFileSync(new URL("../data/records.json", import.meta.url), "utf8"),
  ).records;
  const details = deriveRecordingSequences(records);
  const orderedIds = sortRecordsForDisplay(records, "desc", details).map(
    ({ recordId }) => recordId,
  );
  const expectedRun = [
    "tla-1b502d1a39e190f8",
    "tla-3366e26036caab29",
    "tla-793ae81230693d67",
  ];
  const runStart = orderedIds.indexOf(expectedRun[0]);

  assert.deepEqual(orderedIds.slice(runStart, runStart + expectedRun.length), expectedRun);
  assert.equal(details.get("tla-3c67bd9f8958b9b7").groupId, null);
});
