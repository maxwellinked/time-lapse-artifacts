import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const SOURCE_REPOSITORY = 'maxwellinked/time-lapse-artifacts';
export const DERIVED_REPOSITORY = 'maxwellinked/time-lapse-artifacts-derived';
export const NOTE_PATH = 'docs/notes/drawing-process-2026-11-13';
export const DERIVED_PATH = 'Drawing_Process/2026-11-13/';
const ROOT = new URL('../', import.meta.url);
const INPUT_NAMES = ['presentation.html','derivatives.json','manifest.json'];
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^(?!0{40}$)[a-f0-9]{40}$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const require = (value, message) => {if (!value) throw new Error(message);};
const safePath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') &&
  !value.includes('\\') && !value.includes(':') && value.split('/').every(p => p && p !== '.' && p !== '..');

export function buildDrawingProcessPage({receipt,files}) {
  require(receipt?.schema === 'drawing-process-browser-source/v1' &&
    receipt.sourceRepository === SOURCE_REPOSITORY && receipt.derivedRepository === DERIVED_REPOSITORY &&
    receipt.notePath === NOTE_PATH, 'Unsupported drawing-process source receipt');
  require(REVISION.test(receipt.sourceRevision) && REVISION.test(receipt.derivedRevision), 'Immutable source and derived revisions are required');
  require(Object.keys(receipt.inputs || {}).sort().join('|') === [...INPUT_NAMES].sort().join('|'), 'Unexpected retained input set');
  for (const name of INPUT_NAMES) {
    const binding = receipt.inputs[name], bytes = files[name];
    require(Buffer.isBuffer(bytes) && binding?.bytes === bytes.length && HASH.test(binding.sha256) &&
      sha256(bytes) === binding.sha256, `Input binding differs: ${name}`);
  }
  const note = JSON.parse(files['manifest.json']);
  require(Array.isArray(note.files) && note.files.length > 0, 'Missing authoritative note manifest');
  const noteFiles = new Map();
  for (const entry of note.files) {
    require(safePath(entry.path) && !noteFiles.has(entry.path) && HASH.test(entry.sha256) &&
      Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, 'Invalid or duplicate note manifest path');
    noteFiles.set(entry.path,entry);
  }
  for (const name of ['presentation.html','derivatives.json']) {
    const entry = noteFiles.get(name), binding = receipt.inputs[name];
    require(entry?.bytes === binding.bytes && entry.sha256 === binding.sha256, `Authoritative note manifest does not bind ${name}`);
  }
  const derivatives = JSON.parse(files['derivatives.json']);
  require(derivatives.repository === DERIVED_REPOSITORY && derivatives.revision === receipt.derivedRevision,
    'Source derivative declaration differs from derived revision');
  require(Array.isArray(derivatives.files) && derivatives.files.length > 0, 'Missing declared derivatives');
  const media = new Map(), ids = new Set();
  for (const item of derivatives.files) {
    require(typeof item.derivative_id === 'string' && item.derivative_id && !ids.has(item.derivative_id), 'Missing or duplicate derivative identity');
    require(safePath(item.path) && item.path.startsWith(DERIVED_PATH), 'Unsafe derivative path');
    require(!media.has(item.path) && HASH.test(item.sha256) && Number.isSafeInteger(item.bytes) && item.bytes > 0,
      'Invalid or duplicate derivative binding');
    ids.add(item.derivative_id); media.set(item.path,item);
  }
  const template = files['presentation.html'].toString('utf8');
  require(template.includes('__SOURCE_REVISION__') && template.includes('__DERIVED_REVISION__'), 'Template lacks source revision tokens');
  require(!/(?:file:\/\/|\b[A-Z]:[\\/]|\/workspace\/|private working draft|noindex)/i.test(template), 'Private path or draft marker in public template');
  require(!/__[A-Z_]+__/.test(template.replaceAll('__SOURCE_REVISION__','').replaceAll('__DERIVED_REVISION__','')), 'Unknown template token');
  const sourcePrefix = `https://huggingface.co/datasets/${SOURCE_REPOSITORY}/`;
  const derivedPrefix = `https://huggingface.co/datasets/${DERIVED_REPOSITORY}/resolve/__DERIVED_REVISION__/`;
  const sourcePrefixes = ['resolve','blob'].map(kind => `${sourcePrefix}${kind}/__SOURCE_REVISION__/${NOTE_PATH}/`);
  const ordinary = new Set([sourcePrefix.slice(0,-1),'https://creativecommons.org/licenses/by-nc/4.0/',
    'https://maxwellinked.github.io/time-lapse-artifacts/drawing-process.html']);
  for (const [,url] of template.matchAll(/(?:href|src|poster)="([^"]+)"/g)) {
    if (url.startsWith('#') || url === './' || ordinary.has(url)) continue;
    if (url.startsWith(derivedPrefix)) {
      require(media.has(url.slice(derivedPrefix.length)), `Undeclared derivative URL: ${url}`);
      continue;
    }
    const prefix = sourcePrefixes.find(p=>url.startsWith(p));
    if (prefix) {
      const path = url.slice(prefix.length);
      require(path === 'manifest.json' || noteFiles.has(path), `Undeclared source URL: ${url}`);
      continue;
    }
    throw new Error(`Unpinned or unsupported template URL: ${url}`);
  }
  return template.replaceAll('__SOURCE_REVISION__',receipt.sourceRevision)
    .replaceAll('__DERIVED_REVISION__',receipt.derivedRevision);
}

export function loadDrawingProcessInputs(root = ROOT) {
  const folder = new URL('data/drawing-process-source/',root);
  return {receipt:JSON.parse(readFileSync(new URL('source.json',folder))),
    files:Object.fromEntries(INPUT_NAMES.map(name=>[name,readFileSync(new URL(name,folder))]))};
}

async function sync(revision) {
  require(REVISION.test(revision), 'Pass a complete immutable source revision with --revision');
  const fetched = await Promise.all(INPUT_NAMES.map(async name => {
    const url = `https://huggingface.co/datasets/${SOURCE_REPOSITORY}/resolve/${revision}/${NOTE_PATH}/${name}`;
    const response = await fetch(url,{signal:AbortSignal.timeout(30000)});
    require(response.ok, `Source download returned ${response.status}: ${name}`);
    return [name,Buffer.from(await response.arrayBuffer())];
  }));
  const files = Object.fromEntries(fetched);
  const derivatives = JSON.parse(files['derivatives.json']);
  const receipt = {schema:'drawing-process-browser-source/v1',sourceRepository:SOURCE_REPOSITORY,
    sourceRevision:revision,notePath:NOTE_PATH,derivedRepository:DERIVED_REPOSITORY,
    derivedRevision:derivatives.revision,
    scope:'Exact retained source display template and derivative declarations; original payload ingest remains separately qualified by the authoritative note.',
    inputs:Object.fromEntries(fetched.map(([name,bytes])=>[name,{bytes:bytes.length,sha256:sha256(bytes)}]))};
  const html = buildDrawingProcessPage({receipt,files});
  // Validate the full fetched set before replacing any retained source bytes.
  const folder = new URL('data/drawing-process-source/',ROOT);
  mkdirSync(folder,{recursive:true});
  for (const [name,bytes] of fetched) writeFileSync(new URL(name,folder),bytes);
  writeFileSync(new URL('source.json',folder),JSON.stringify(receipt,null,2)+'\n');
  writeFileSync(new URL('drawing-process.html',ROOT),html);
}

async function main() {
  if (process.argv.includes('--sync')) {
    require(!process.argv.includes('--check'),'--sync and --check are separate operations');
    const at = process.argv.indexOf('--revision');
    require(at !== -1,'--sync requires --revision');
    await sync(process.argv[at+1]);
  }
  const inputs = loadDrawingProcessInputs();
  const html = buildDrawingProcessPage(inputs);
  if (process.argv.includes('--check')) {
    require(readFileSync(new URL('drawing-process.html',ROOT),'utf8') === html, 'Stale drawing-process projection');
  } else writeFileSync(new URL('drawing-process.html',ROOT),html);
  console.log(JSON.stringify({status:process.argv.includes('--check')?'verified':'generated',
    sourceRevision:inputs.receipt.sourceRevision,derivedRevision:inputs.receipt.derivedRevision,
    originalMediaDownloaded:false}));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
