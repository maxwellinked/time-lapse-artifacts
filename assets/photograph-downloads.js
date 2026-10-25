// Independent download projection; selected display images remain unchanged.
export const PHOTOGRAPH_DOWNLOADS_SHA256 = "b685888eed60d29b72585d9fd241f4cbe52157f2734fba1a9ea454ca3d276f14";
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const PREFIXES = ['Physical_References/Photographs/', 'Physical_References/Selected_Front_Downloads/'];
const LABELS = Object.freeze({
  native_resolution_jpeg: 'Download full-resolution JPEG',
  limited_resolution_jpeg: 'Download available JPEG (limited resolution)',
  available_source_resolution_jpeg: 'Download supplied source-resolution JPEG',
});

export function attachPhotographDownloads(index, manifest) {
  if (!REVISION.test(manifest.media_revision ?? '') || !Array.isArray(manifest.rows) ||
      manifest.rows.length !== Object.keys(index.byWork).length) throw new Error('Invalid photograph download manifest');
  const byWork = Object.create(null);
  for (const row of manifest.rows) {
    const mediaRevision = Object.hasOwn(row, 'media_revision') ? row.media_revision : manifest.media_revision;
    if (!REVISION.test(mediaRevision ?? '')) throw new Error('Invalid photograph media revision');
    const front = index.byWork[row.work_id];
    if (!front || byWork[row.work_id] || row.source_sha256 !== front.sourcePhotographSha256) {
      throw new Error('Photograph download differs from selected source');
    }
    if (row.path === null && row.resolution_class === 'source_not_located') {
      byWork[row.work_id] = front;
      continue;
    }
    if (typeof row.path !== 'string' || !PREFIXES.some(prefix => row.path.startsWith(prefix)) || !row.path.endsWith('.jpg') ||
        !row.path.split('/').every(part => /^[A-Za-z0-9_. -]+$/.test(part) && part !== '.' && part !== '..') ||
        !HASH.test(row.sha256 ?? '') || !LABELS[row.resolution_class] ||
        ![row.width_px,row.height_px,row.size_bytes].every(value => Number.isSafeInteger(value) && value > 0)) {
      throw new Error('Invalid photograph download representation');
    }
    const path = row.path.split('/').map(encodeURIComponent).join('/');
    byWork[row.work_id] = Object.freeze({...front,
      downloadUrl: `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${mediaRevision}/${path}?download=true`,
      downloadLabel: LABELS[row.resolution_class],
      downloadSha256: row.sha256,
      downloadDimensions: `${row.width_px} × ${row.height_px}`,
    });
  }
  const byRecord = Object.fromEntries(Object.entries(index.byRecord).map(([id,front]) => [id,byWork[front.workId]]));
  return Object.freeze({...index,byWork:Object.freeze(byWork),byRecord:Object.freeze(byRecord)});
}

export async function loadPhotographDownloads(index, fetcher = globalThis.fetch, crypto = globalThis.crypto) {
  const response = await fetcher(`data/photograph-downloads.json?v=${PHOTOGRAPH_DOWNLOADS_SHA256}`, {signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Photograph downloads unavailable');
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if (hash !== PHOTOGRAPH_DOWNLOADS_SHA256) throw new Error('Photograph download manifest hash mismatch');
  return attachPhotographDownloads(index,JSON.parse(new TextDecoder().decode(bytes)));
}
