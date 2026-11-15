import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

const framesPerSecond = 12;
const frameInterval = 1 / framesPerSecond;
const timestampTolerance = 0.001;
const options = { encoding: "utf8", timeout: 10_000, windowsHide: true, maxBuffer: 64_000 };

export function isCompletePreview(record, path) {
  try {
    const file = statSync(path);
    if (!file.isFile() || file.size === 0) return false;
    if (file.size >= 8_000) return true;
  } catch {
    return false;
  }

  // A source shorter than the half-second sampling floor can encode to
  // fewer than 8 kB. Inspect and decode these outputs before accepting them.
  const sourceDuration = record?.durationSeconds;
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0 || sourceDuration >= 0.5) return false;
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-protocol_whitelist", "file",
    "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,pix_fmt,color_range,width,height,duration,nb_frames,avg_frame_rate",
    "-of", "json", path,
  ], options);
  if (probe.status !== 0 || probe.stderr.trim()) return false;

  let details;
  try {
    details = JSON.parse(probe.stdout);
  } catch {
    return false;
  }
  if (!details.format?.format_name?.split(",").includes("mp4") || details.streams?.length !== 1) return false;
  const [video] = details.streams;
  const frameCount = Number(video.nb_frames);
  const duration = Number(video.duration);
  // FFprobe can report the full-range form of the requested 8-bit 4:2:0 format as yuvj420p.
  const isYuv420 = video.pix_fmt === "yuv420p" || (video.pix_fmt === "yuvj420p" && video.color_range === "pc");
  if (video.codec_type !== "video" || video.codec_name !== "h264" ||
      !isYuv420 ||
      ![video.width, video.height].every((n) => Number.isInteger(n) && n > 0 && n % 2 === 0) ||
      Math.max(video.width, video.height) !== 480 || video.avg_frame_rate !== "12/1" ||
      !Number.isSafeInteger(frameCount) || frameCount < 1 ||
      Math.abs(frameCount / framesPerSecond - sourceDuration) > frameInterval + timestampTolerance ||
      !Number.isFinite(duration) || Math.abs(duration - frameCount / framesPerSecond) > timestampTolerance ||
      !Number.isFinite(Number(details.format.duration)) ||
      Math.abs(Number(details.format.duration) - duration) > timestampTolerance) return false;

  const decode = spawnSync("ffmpeg", [
    "-v", "error", "-xerror", "-nostdin", "-protocol_whitelist", "file",
    "-i", path, "-map", "0:v:0", "-f", "null", "-",
  ], options);
  return decode.status === 0 && !decode.stderr.trim();
}
