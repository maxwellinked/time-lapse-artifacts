// Additional clockwise rotation after the browser applies the file's own display
// metadata. No encoded media, intrinsic metadata or source timestamps are changed.
export function fitVideo(width, height, rotation, maxWidth, maxHeight) {
  if (![0, 90, 180, 270].includes(rotation) ||
      ![width, height, maxWidth, maxHeight].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError("A valid quarter-turn and positive, finite dimensions are required.");
  }
  const sideways = rotation === 90 || rotation === 270;
  const scale = Math.min(maxWidth / (sideways ? height : width), maxHeight / (sideways ? width : height));
  const videoWidth = Math.min(width * scale, sideways ? maxHeight : maxWidth);
  const videoHeight = Math.min(height * scale, sideways ? maxWidth : maxHeight);
  return {
    videoWidth,
    videoHeight,
    viewportWidth: sideways ? videoHeight : videoWidth,
    viewportHeight: sideways ? videoWidth : videoHeight,
  };
}

const initialized = new WeakSet();
let playingVideo = null;

function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "–:––";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  return `${hours ? `${hours}:` : ""}${hours ? String(minutes).padStart(2, "0") : minutes}:${String(whole % 60).padStart(2, "0")}`;
}

function initializePlayer(wrapper) {
  const document = wrapper.ownerDocument;
  const window = document.defaultView;
  const activate = wrapper.querySelector(".rt-player__activate");
  if (!activate) return;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = `rt-player__${className}`;
    if (text) node.textContent = text;
    return node;
  };
  const status = make("p", "status");
  status.setAttribute("role", "status");
  wrapper.append(status);
  let source;
  const rotation = Number(wrapper.dataset.rotation);
  try {
    if (!/^(0|90|180|270)$/.test(wrapper.dataset.rotation)) throw new Error("rotation");
    if (!wrapper.dataset.sourceUrl?.trim()) throw new Error("source");
    source = new URL(wrapper.dataset.sourceUrl, document.baseURI);
    if (!/^https?:$/.test(source.protocol)) throw new Error("source");
  } catch {
    activate.disabled = true;
    status.textContent = "This oriented view is unavailable. Use the original source link.";
    return;
  }

  activate.addEventListener("click", () => {
    if (activate.hidden) return;
    activate.hidden = true;
    const viewport = make("div", "viewport");
    const video = make("video", "video");
    video.controls = false;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "Oriented real-time source recording");
    viewport.append(video);
    const controls = make("div", "controls");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Recording playback controls");
    const play = make("button", "play", "Play");
    const seekLabel = make("label", "seek-label", "Seek");
    const seek = make("input", "seek");
    seek.type = "range";
    seek.min = "0";
    seek.max = "0";
    seek.step = "0.1";
    seek.value = "0";
    seek.disabled = true;
    seek.setAttribute("aria-label", "Seek through original recording");
    seekLabel.append(seek);
    const time = make("output", "time", "0:00 / –:––");
    time.setAttribute("aria-live", "off");
    const mute = make("button", "mute", "Mute");
    const fullscreen = make("button", "fullscreen", "Full screen");
    for (const button of [play, mute, fullscreen]) button.type = "button";
    fullscreen.hidden = !document.fullscreenEnabled || typeof wrapper.requestFullscreen !== "function";
    controls.append(play, seekLabel, time, mute, fullscreen);
    wrapper.append(viewport, controls);
    status.textContent = "Loading original source…";
    const bufferingMessage = "Buffering original source…";

    const fit = () => {
      if (!video.videoWidth || !video.videoHeight || !wrapper.clientWidth) return;
      const isFullscreen = document.fullscreenElement === wrapper;
      const maxHeight = isFullscreen ? Math.max(100, window.innerHeight - 180) : Math.max(100, Math.min(600, window.innerHeight * 0.7));
      const size = fitVideo(video.videoWidth, video.videoHeight, rotation, Math.max(1, wrapper.clientWidth - (isFullscreen ? 32 : 0)), maxHeight);
      viewport.style.width = `${size.viewportWidth}px`;
      viewport.style.height = `${size.viewportHeight}px`;
      video.style.width = `${size.videoWidth}px`;
      video.style.height = `${size.videoHeight}px`;
      video.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    };
    const update = () => {
      const duration = video.duration;
      const canSeek = Number.isFinite(duration) && duration > 0;
      seek.disabled = !canSeek || Boolean(video.error);
      seek.max = canSeek ? String(duration) : "0";
      seek.value = String(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      seek.setAttribute("aria-valuetext", `${clock(video.currentTime)} of ${clock(duration)}`);
      time.textContent = `${clock(video.currentTime)} / ${clock(duration)}`;
      play.textContent = video.paused ? "Play" : "Pause";
      mute.textContent = video.muted ? "Unmute" : "Mute";
      mute.setAttribute("aria-pressed", String(video.muted));
    };
    const fail = (message) => {
      video.pause();
      status.textContent = `${message} Use the original source link to open or download the recording.`;
      play.disabled = true;
      seek.disabled = true;
      mute.disabled = true;
    };
    const start = () => {
      if (playingVideo && playingVideo !== video) playingVideo.pause();
      playingVideo = video;
      // A play request stays inside the user's click handler.
      video.play()?.catch((error) => {
        if (error.name === "AbortError") return;
        if (error.name === "NotAllowedError") {
          status.textContent = "Playback was blocked by the browser. Press Play to try again, or use the original source link.";
          update();
        } else fail("This browser could not play the source format or codec.");
      });
    };
    play.addEventListener("click", () => video.paused ? start() : video.pause());
    seek.addEventListener("input", () => {
      const target = Number(seek.value);
      if (Number.isFinite(target) && Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, target));
      update();
    });
    mute.addEventListener("click", () => { video.muted = !video.muted; update(); });
    fullscreen.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === wrapper) await document.exitFullscreen();
        else await wrapper.requestFullscreen();
      } catch {
        status.textContent = "Full screen is unavailable. Playback can continue in this view.";
      }
    });
    document.addEventListener("fullscreenchange", () => {
      fullscreen.textContent = document.fullscreenElement === wrapper ? "Exit full screen" : "Full screen";
      fit();
    });
    video.addEventListener("loadedmetadata", () => { fit(); update(); });
    for (const event of ["durationchange", "timeupdate", "pause", "ended", "volumechange"]) video.addEventListener(event, update);
    video.addEventListener("play", () => {
      if (playingVideo && playingVideo !== video) playingVideo.pause();
      playingVideo = video;
      update();
    });
    const clearPausedBuffering = () => {
      if (video.paused && video.readyState >= 2 && !video.error && status.textContent === bufferingMessage) status.textContent = "";
    };
    for (const event of ["pause", "seeked", "loadeddata", "canplay"]) video.addEventListener(event, clearPausedBuffering);
    video.addEventListener("waiting", () => { status.textContent = bufferingMessage; });
    video.addEventListener("playing", () => { status.textContent = ""; });
    video.addEventListener("error", () => fail(video.error?.code === 2 ? "The original source could not be loaded over the network." : "This browser could not play the source format or codec."));
    if (window.ResizeObserver) new window.ResizeObserver(fit).observe(wrapper);
    window.addEventListener("resize", fit);
    // This is deliberately the first media URL assignment; init never loads media.
    video.src = source.href;
    play.focus();
    start();
  });
}

export function initRealTimePlayers(root = document) {
  for (const wrapper of root.querySelectorAll(".rt-player")) {
    if (initialized.has(wrapper)) continue;
    initialized.add(wrapper);
    initializePlayer(wrapper);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initRealTimePlayers(), { once: true });
  else initRealTimePlayers();
}
