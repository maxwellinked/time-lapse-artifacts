const DATA_URL = "data/records.json";
const PAGE_SIZE = 18;

const state = {
  records: [],
  filtered: [],
  visibleCount: PAGE_SIZE,
  activeRecord: null,
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
  dataError: document.querySelector("#data-error"),
  cardTemplate: document.querySelector("#record-card-template"),
  dialog: document.querySelector("#record-dialog"),
  dialogRecordId: document.querySelector("#dialog-record-id"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogMetadata: document.querySelector("#dialog-metadata"),
  dialogFilename: document.querySelector("#dialog-filename"),
  dialogHash: document.querySelector("#dialog-hash"),
  dialogSource: document.querySelector("#dialog-source"),
  dialogSourceTop: document.querySelector("#dialog-source-top"),
  dialogPoster: document.querySelector(".dialog-poster"),
  loadFullVideo: document.querySelector("#load-full-video"),
  fullVideo: document.querySelector("#full-video"),
  previousRecord: document.querySelector("#previous-record"),
  nextRecord: document.querySelector("#next-record"),
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

const thumbnailQueue = [];
let activeThumbnails = 0;
const MAX_ACTIVE_THUMBNAILS = 2;

const thumbnailObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      thumbnailObserver.unobserve(entry.target);
      queueThumbnail(entry.target, false);
    });
  },
  { rootMargin: "280px 0px" },
);

function prepareThumbnail(shell, record, immediate = false) {
  const video = shell.querySelector("video");
  if (!video) return;

  shell.classList.toggle("landscape", record.orientation === "landscape");
  shell.classList.remove("is-ready", "is-error");
  shell.classList.add("is-loading");
  shell.dataset.videoUrl = record.videoUrl;
  video.removeAttribute("src");
  video.load();

  if (immediate) queueThumbnail(shell, true);
  else thumbnailObserver.observe(shell);
}

function queueThumbnail(shell, priority) {
  if (!shell.isConnected || shell.dataset.queued === "true") return;
  shell.dataset.queued = "true";
  if (priority) thumbnailQueue.unshift(shell);
  else thumbnailQueue.push(shell);
  processThumbnailQueue();
}

function processThumbnailQueue() {
  while (activeThumbnails < MAX_ACTIVE_THUMBNAILS && thumbnailQueue.length) {
    const shell = thumbnailQueue.shift();
    if (!shell?.isConnected) continue;
    loadThumbnail(shell);
  }
}

function loadThumbnail(shell) {
  const video = shell.querySelector("video");
  const source = shell.dataset.videoUrl;
  if (!video || !source) return finishThumbnail(shell, false);

  activeThumbnails += 1;
  let finished = false;
  let timeoutId;

  const finish = (success) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);
    video.removeEventListener("loadedmetadata", onMetadata);
    video.removeEventListener("seeked", onSeeked);
    video.removeEventListener("error", onError);
    finishThumbnail(shell, success);
  };

  const onMetadata = () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      finish(false);
      return;
    }
    const target = Math.max(0.1, Math.min(video.duration - 0.15, video.duration * 0.88));
    try {
      video.currentTime = target;
    } catch {
      finish(false);
    }
  };

  const onSeeked = () => finish(true);
  const onError = () => finish(false);

  video.addEventListener("loadedmetadata", onMetadata, { once: true });
  video.addEventListener("seeked", onSeeked, { once: true });
  video.addEventListener("error", onError, { once: true });
  video.preload = "metadata";
  video.src = source;
  video.load();
  timeoutId = window.setTimeout(() => finish(false), 24000);
}

function finishThumbnail(shell, success) {
  shell.classList.remove("is-loading");
  shell.classList.toggle("is-ready", success);
  shell.classList.toggle("is-error", !success);
  const status = shell.querySelector(".thumb-fallback small");
  if (status && !success) status.textContent = "Preview unavailable";
  delete shell.dataset.queued;
  activeThumbnails = Math.max(0, activeThumbnails - 1);
  processThumbnailQueue();
}

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
  fillSelect(
    "year",
    [...new Set(state.records.map((record) => record.date.slice(0, 4)))].sort(),
    (value) => value,
  );
  fillSelect("tool", valuesFromRecords("tool", true));
  fillSelect("medium", valuesFromRecords("medium", true));
  fillSelect("support", valuesFromRecords("support", true));
  fillSelect("dimensions", valuesFromRecords("dimensions"), formatDimensions);
}

function recordMatches(record, field, expected) {
  if (!expected) return true;
  if (["tool", "medium", "support"].includes(field)) {
    return record[field].split(";").includes(expected);
  }
  return record[field] === expected;
}

function applyFilters() {
  const formData = new FormData(elements.filters);
  const query = String(formData.get("search") ?? "").trim().toLowerCase();
  const year = String(formData.get("year") ?? "");
  const order = String(formData.get("order") ?? "desc");

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
      recordMatches(record, "tool", String(formData.get("tool") ?? "")) &&
      recordMatches(record, "medium", String(formData.get("medium") ?? "")) &&
      recordMatches(record, "support", String(formData.get("support") ?? "")) &&
      recordMatches(record, "dimensions", String(formData.get("dimensions") ?? ""))
    );
  });

  state.filtered.sort((a, b) => {
    const comparison = `${b.date}T${b.time ?? "00:00"}`.localeCompare(
      `${a.date}T${a.time ?? "00:00"}`,
    );
    return order === "asc" ? -comparison : comparison;
  });

  state.visibleCount = PAGE_SIZE;
  renderRecords();
}

function renderRecords() {
  elements.grid.replaceChildren();
  const visible = state.filtered.slice(0, state.visibleCount);
  const fragment = document.createDocumentFragment();

  visible.forEach((record) => {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const button = card.querySelector(".record-open");
    const thumb = card.querySelector(".record-thumb");

    button.setAttribute(
      "aria-label",
      `Open recording from ${formatDate(record.date)} at ${formatTime(record.time)}`,
    );
    card.querySelector(".thumb-fallback strong").textContent = record.date.slice(0, 4);
    card.querySelector(".record-id").textContent = record.recordId;
    card.querySelector(".record-date").textContent = formatDate(record.date);
    card.querySelector(".record-facts").textContent = [
      formatTime(record.time),
      humanizeToken(record.tool),
      formatDimensions(record.dimensions),
      formatDuration(record.durationSeconds),
    ].join(" · ");
    button.addEventListener("click", () => openRecord(record));
    prepareThumbnail(thumb, record);
    fragment.append(card);
  });

  elements.grid.append(fragment);
  elements.resultCount.textContent = `${state.filtered.length.toLocaleString()} recording${
    state.filtered.length === 1 ? "" : "s"
  }`;
  elements.showMore.hidden = state.visibleCount >= state.filtered.length;
}

function renderFeatured() {
  const record = state.records[0];
  const shell = elements.featured.querySelector(".thumb-shell");
  elements.featuredDate.textContent = formatDate(record.date);
  elements.featuredMeta.textContent = `${formatTime(record.time)} · ${humanizeToken(
    record.tool,
  )} · ${formatDimensions(record.dimensions)} · ${formatDuration(record.durationSeconds)}`;
  elements.openFeatured.addEventListener("click", () => openRecord(record));
  prepareThumbnail(shell, record, true);
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
  prepareThumbnail(elements.dialogPoster, record, true);

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
  elements.dialogPoster.hidden = false;
  elements.loadFullVideo.hidden = false;
}

elements.loadFullVideo.addEventListener("click", async () => {
  if (!state.activeRecord) return;
  elements.dialogPoster.hidden = true;
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

function openHashRecord() {
  const match = location.hash.match(/^#record=(tla-[a-f0-9]+)$/);
  if (!match || !state.records.length) return;
  const record = state.records.find((item) => item.recordId === match[1]);
  if (record) openRecord(record, false);
}

window.addEventListener("hashchange", openHashRecord);

async function initialize() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Data request failed with ${response.status}`);
    const payload = await response.json();
    state.records = payload.records;
    state.filtered = [...state.records];

    elements.recordCount.textContent = state.records.length.toLocaleString();
    const oldest = state.records.at(-1);
    const newest = state.records[0];
    elements.dateCoverage.textContent = `${oldest.date.slice(0, 4)}–${newest.date.slice(0, 4)}`;

    populateFilters();
    renderFeatured();
    renderRecords();
    openHashRecord();
  } catch (error) {
    console.error(error);
    elements.resultCount.textContent = "Recording index unavailable";
    elements.dataError.hidden = false;
  }
}

initialize();
