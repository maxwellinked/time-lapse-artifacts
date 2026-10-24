// Independent download projection; selected display images remain unchanged.
export const PHOTOGRAPH_DOWNLOADS_SHA256 = "cc72c9f418534890e6de573866d6b366b4130a9a3f168b09749c91706884f8c5";
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
      downloadUrl: `https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts/resolve/${manifest.media_revision}/${path}?download=true`,
      downloadLabel: LABELS[row.resolution_class],
      downloadSha256: row.sha256,
      downloadDimensions: `${row.width_px} × ${row.height_px}`,
    });
  }
  const byRecord = Object.fromEntries(Object.entries(index.byRecord).map(([id,front]) => [id,byWork[front.workId]]));
  return Object.freeze({...index,byWork:Object.freeze(byWork),byRecord:Object.freeze(byRecord)});
}

export async function loadPhotographDownloads(index, fetcher = globalThis.fetch, crypto = globalThis.crypto) {
  const response = await fetcher('data/photograph-downloads.json', {signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Photograph downloads unavailable');
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if (hash !== PHOTOGRAPH_DOWNLOADS_SHA256) throw new Error('Photograph download manifest hash mismatch');
  return attachPhotographDownloads(index,JSON.parse(new TextDecoder().decode(bytes)));
}
