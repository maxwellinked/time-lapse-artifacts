import assert from "node:assert/strict";
import test from "node:test";
import { fitVideo, initRealTimePlayers } from "../assets/real-time-player.js";

// A browser DOM/media boundary is unavailable in Node. Keep this double small:
// network/codec playback is verified separately in the browser, never simulated here.
class Element extends EventTarget {
  constructor(tagName, ownerDocument) {
    super();
    Object.assign(this, { tagName, ownerDocument, children: [], dataset: {}, style: {}, attributes: {},
      className: "", textContent: "", hidden: false, disabled: false, clientWidth: 960 });
    if (tagName === "video") Object.assign(this, { paused: true, currentTime: 0, duration: NaN,
      videoWidth: 0, videoHeight: 0, muted: false, error: null });
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const matches = (node) => selector.startsWith(".") ? node.className.split(" ").includes(selector.slice(1)) : node.tagName === selector;
    return this.children.flatMap((node) => [ ...(matches(node) ? [node] : []), ...node.querySelectorAll(selector) ]);
  }
  click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
  focus() { this.ownerDocument.activeElement = this; }
  play() { this.paused = false; this.dispatchEvent(new Event("play")); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
}

function page(rotations = [90]) {
  const window = new EventTarget();
  window.innerHeight = 900;
  const observers = [];
  window.ResizeObserver = class { constructor(callback) { observers.push(callback); } observe() {} };
  const document = new Element("document", null);
  Object.assign(document, { ownerDocument: document, defaultView: window, baseURI: "https://example.test/", fullscreenEnabled: true,
    createElement: (tag) => new Element(tag, document), fullscreenElement: null });
  document.exitFullscreen = async () => { document.fullscreenElement = null; document.dispatchEvent(new Event("fullscreenchange")); };
  const wrappers = rotations.map((rotation, i) => {
    const wrapper = document.createElement("div");
    wrapper.className = "rt-player";
    wrapper.dataset = { sourceUrl: `https://example.test/original-${i}.MOV`, rotation: String(rotation) };
    wrapper.requestFullscreen = async () => { document.fullscreenElement = wrapper; document.dispatchEvent(new Event("fullscreenchange")); };
    const activate = document.createElement("button");
    activate.className = "rt-player__activate";
    activate.textContent = "Play oriented view";
    const source = document.createElement("a");
    source.className = "rt-player__source";
    source.href = wrapper.dataset.sourceUrl;
    wrapper.append(activate, source);
    document.append(wrapper);
    return wrapper;
  });
  return { document, window, wrappers, resize() { observers.forEach((fn) => fn()); window.dispatchEvent(new Event("resize")); } };
}

for (const rotation of [0, 180]) {
  test(`${rotation} degree display fits the whole landscape frame without cropping`, () => {
    assert.deepEqual(fitVideo(1920, 1080, rotation, 1000, 600), {
      videoWidth: 1000, videoHeight: 562.5, viewportWidth: 1000, viewportHeight: 562.5,
    });
  });
}
for (const rotation of [90, 270]) {
  test(`${rotation} degree display swaps the bounds and stays within the height limit`, () => {
    assert.deepEqual(fitVideo(1920, 1080, rotation, 1000, 600), {
      videoWidth: 600, videoHeight: 337.5, viewportWidth: 337.5, viewportHeight: 600,
    });
    const mobile = fitVideo(1920, 1080, rotation, 320, 600);
    assert.equal(mobile.viewportWidth, 320);
    assert.ok(Math.abs(mobile.viewportHeight - 568.8888888888889) < 1e-9);
  });
}
test("layout rejects unknown rotations and unusable media dimensions", () => {
  for (const rotation of [-90, 45, 360, "90", NaN]) assert.throws(() => fitVideo(1920, 1080, rotation, 1000, 600), RangeError);
  for (const dimensions of [[0, 1080, 1000, 600], [1920, -1, 1000, 600], [1920, 1080, NaN, 600], [1920, 1080, 1000, Infinity]]) {
    assert.throws(() => fitVideo(dimensions[0], dimensions[1], 90, dimensions[2], dimensions[3]), RangeError);
  }
});

test("initialization leaves every original unloaded until its own explicit activation", () => {
  const ui = page([90, 270]);
  initRealTimePlayers(ui.document);
  initRealTimePlayers(ui.document);
  assert.equal(ui.document.querySelectorAll("video").length, 0);
  ui.wrappers[0].querySelector(".rt-player__activate").click();
  const videos = ui.document.querySelectorAll("video");
  assert.equal(videos.length, 1);
  assert.equal(videos[0].src, "https://example.test/original-0.MOV");
  assert.equal(videos[0].controls, false);
  assert.equal(videos[0].playsInline, true);
  assert.equal(ui.wrappers[1].querySelector("video"), null);
  assert.equal(ui.wrappers[0].querySelector(".rt-player__activate").hidden, true);
});

test("missing source URLs and invalid rotations cannot activate an unverified view", () => {
  for (const invalid of [{ sourceUrl: "" }, { sourceUrl: "javascript:alert(1)" }, { rotation: "45" }]) {
    const ui = page();
    Object.assign(ui.wrappers[0].dataset, invalid);
    initRealTimePlayers(ui.document);
    ui.wrappers[0].querySelector(".rt-player__activate").click();
    assert.equal(ui.document.querySelectorAll("video").length, 0);
    assert.match(ui.wrappers[0].querySelector(".rt-player__status").textContent, /unavailable.*original source/i);
  }
});

test("metadata, resize and fullscreen fit only the video, retaining the source timestamp", async () => {
  const ui = page();
  initRealTimePlayers(ui.document);
  const wrapper = ui.wrappers[0];
  wrapper.querySelector(".rt-player__activate").click();
  const video = wrapper.querySelector("video");
  Object.assign(video, { videoWidth: 1920, videoHeight: 1080, duration: 200, currentTime: 73.25 });
  video.dispatchEvent(new Event("loadedmetadata"));
  assert.match(video.style.transform, /rotate\(90deg\)/);
  const controls = wrapper.querySelector(".rt-player__controls");
  assert.equal(controls.style.transform, undefined);
  assert.ok(Number.parseFloat(wrapper.querySelector(".rt-player__viewport").style.height) <= 600);
  wrapper.clientWidth = 320;
  ui.resize();
  assert.ok(Number.parseFloat(wrapper.querySelector(".rt-player__viewport").style.width) <= 320);
  await wrapper.querySelector(".rt-player__fullscreen").click();
  assert.equal(ui.document.fullscreenElement, wrapper);
  assert.equal(video.currentTime, 73.25);
});

test("controls play one recording at a time, seek the original timeline and toggle sound", () => {
  const ui = page([90, 180]);
  initRealTimePlayers(ui.document);
  for (const wrapper of ui.wrappers) wrapper.querySelector(".rt-player__activate").click();
  const [first, second] = ui.document.querySelectorAll("video");
  assert.equal(first.paused, true);
  assert.equal(second.paused, false);
  const wrapper = ui.wrappers[0];
  wrapper.querySelector(".rt-player__play").click();
  assert.equal(first.paused, false);
  assert.equal(second.paused, true);
  first.duration = 120;
  first.dispatchEvent(new Event("loadedmetadata"));
  const seek = wrapper.querySelector(".rt-player__seek");
  assert.equal(seek.disabled, false);
  assert.match(seek.getAttribute("aria-label"), /seek/i);
  seek.value = "45.5";
  seek.dispatchEvent(new Event("input"));
  assert.equal(first.currentTime, 45.5);
  first.dispatchEvent(new Event("timeupdate"));
  assert.match(wrapper.querySelector(".rt-player__time").textContent, /0:45.*2:00/);
  wrapper.querySelector(".rt-player__mute").click();
  assert.equal(first.muted, true);
});

test("an unsupported or failed source keeps a clear original-source fallback available", () => {
  const ui = page();
  initRealTimePlayers(ui.document);
  const wrapper = ui.wrappers[0];
  wrapper.querySelector(".rt-player__activate").click();
  const video = wrapper.querySelector("video");
  video.error = { code: 4 };
  video.dispatchEvent(new Event("error"));
  assert.match(wrapper.querySelector(".rt-player__status").textContent, /browser|format|codec/i);
  assert.match(wrapper.querySelector(".rt-player__status").textContent, /original source/i);
  assert.equal(wrapper.querySelector(".rt-player__source").href, "https://example.test/original-0.MOV");
  assert.equal(wrapper.querySelector(".rt-player__source").hidden, false);
  assert.equal(wrapper.querySelector(".rt-player__play").disabled, true);
});

test("browser playback denial leaves an explicit retry control available", async () => {
  const ui = page();
  const create = ui.document.createElement;
  ui.document.createElement = (tag) => {
    const element = create(tag);
    if (tag === "video") element.play = () => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
    return element;
  };
  initRealTimePlayers(ui.document);
  const wrapper = ui.wrappers[0];
  wrapper.querySelector(".rt-player__activate").click();
  await new Promise(setImmediate);
  assert.match(wrapper.querySelector(".rt-player__status").textContent, /blocked.*press play/i);
  assert.equal(wrapper.querySelector(".rt-player__play").disabled, false);
  assert.equal(wrapper.querySelector(".rt-player__play").textContent, "Play");
});
