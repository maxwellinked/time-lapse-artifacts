import { resolveSelection } from './native-model.js';

const $ = id => document.getElementById(id);
const tierLabels = {standard: 'Standard', pre_standard: 'Pre-Standard'};
let payload, selected = {record: null, frame: null}, loadVersion = 0, native = false;

function status(text, state = 'ready') {
  $('native-status').textContent = text;
  $('native-status').dataset.state = state;
}

function setSize(value) {
  native = value;
  $('native-viewport').classList.toggle('native', value);
  $('native-fit').setAttribute('aria-pressed', String(!value));
  $('native-pixels').setAttribute('aria-pressed', String(value));
  $('native-viewport').scrollTop = 0;
  $('native-viewport').scrollLeft = 0;
}

function evidenceRow(label, value) {
  const dt = document.createElement('dt'), dd = document.createElement('dd');
  dt.textContent = label; dd.textContent = String(value);
  return [dt, dd];
}

function loadSelectedImage() {
  const {record, frame} = selected, version = ++loadVersion;
  const image = new Image();
  image.id = 'native-image';
  image.hidden = true;
  image.alt = `Full native frame ${frame.index + 1} from ${record.recordId}`;
  image.dataset.recordId = record.recordId;
  image.dataset.frameIndex = String(frame.index);
  image.dataset.pts = String(frame.pts);
  image.width = frame.width; image.height = frame.height;
  $('native-image').replaceWith(image);
  $('native-viewport').setAttribute('aria-busy', 'true');
  $('native-retry').hidden = true;
  status(`Loading native frame ${frame.index + 1} of 21…`, 'loading');
  image.onload = () => {
    if (version !== loadVersion) return;
    if (image.naturalWidth !== frame.width || image.naturalHeight !== frame.height) {
      image.onerror(); return;
    }
    image.hidden = false;
    $('native-viewport').setAttribute('aria-busy', 'false');
    status(`Native frame ${frame.index + 1} of 21 loaded.`, 'ready');
  };
  image.onerror = () => {
    if (version !== loadVersion) return;
    image.hidden = true;
    $('native-viewport').setAttribute('aria-busy', 'false');
    $('native-retry').hidden = false;
    status('The selected native PNG could not load. No previous or substitute frame is displayed. Retry this frame or use its pinned PNG link.', 'error');
  };
  image.src = frame.url;
}

function navigate(recordId, index = 0) {
  const url = new URL(location.href);
  url.search = new URLSearchParams({record: recordId, frame: String(index)});
  history.pushState(null, '', url);
  renderRoute();
}

function renderRoute() {
  loadVersion++;
  $('native-image').hidden = true;
  $('native-image').removeAttribute('src');
  $('native-workspace').hidden = true;
  $('native-viewport').setAttribute('aria-busy', 'false');
  status('Choose a recording to open its 21 native frames.');
  try {
    selected = resolveSelection(payload, location.search);
  } catch (error) {
    selected = {record: null, frame: null};
    status(error.message, 'error');
  }
  const {record, frame} = selected;
  for (const button of $('native-records').children) {
    button.setAttribute('aria-pressed', String(button.dataset.recordId === record?.recordId));
  }
  if (!record) {
    if ($('native-status').dataset.state !== 'error') status('Choose a recording to open its 21 native frames.');
    return;
  }
  $('native-workspace').hidden = false;
  $('native-tier').textContent = `${tierLabels[record.collectionTier] || record.collectionTier} · 21 native frames`;
  $('native-record-id').textContent = record.recordId;
  $('native-filename').textContent = record.filePath;
  $('native-work-state').textContent = record.documentaryState.work_id === null
    ? 'Physical work identity is unassigned in this pinned pack. Capture completeness remains unresolved.'
    : `Work identity in this pinned pack: ${record.documentaryState.work_id}. Capture completeness is a separate documentary field.`;
  const overview = $('native-overview-link');
  overview.hidden = record.collectionTier !== 'standard';
  overview.href = `../#record=${record.recordId}`;
  $('native-strip').replaceChildren(...record.frames.map(item => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = item.normalizedEncodedPosition.toFixed(2);
    button.dataset.frameIndex = String(item.index);
    button.setAttribute('aria-label', `Frame ${item.index + 1}, normalized position ${item.normalizedEncodedPosition.toFixed(2)}`);
    button.setAttribute('aria-pressed', String(item.index === frame.index));
    button.onclick = () => navigate(record.recordId, item.index);
    return button;
  }));
  $('native-previous').disabled = frame.index === 0;
  $('native-next').disabled = frame.index === 20;
  $('native-sample-title').textContent = `Frame ${frame.index + 1} of 21 · position ${frame.normalizedEncodedPosition.toFixed(2)}`;
  $('native-sample-time').textContent = `Encoded ${frame.encodedSeconds.toFixed(6)} s · PTS ${frame.pts} × ${frame.timeBase}`;
  $('native-resolution').textContent = `${frame.width} × ${frame.height} decoded RGB pixels. Full uncropped frame; declared display transform already applied. Fit view may conceal fine marks. Native pixels shows the unscaled PNG.`;
  $('native-png').href = frame.url;
  $('native-proxy').href = record.proxyUrl;
  $('native-source').href = record.sourcePageUrl;
  $('native-manifest').href = `https://huggingface.co/datasets/${payload.derivedRepository}/blob/${payload.derivedRevision}/${payload.manifestPath}`;
  $('native-access-manifest').href = record.accessManifestUrl;
  $('native-evidence').replaceChildren(
    ...evidenceRow('Recording', record.recordId),
    ...evidenceRow('Source revision', record.sourceRevision),
    ...evidenceRow('Source SHA-256', record.sourceSha256),
    ...evidenceRow('Native pack revision', payload.derivedRevision),
    ...evidenceRow('Pack manifest SHA-256', payload.manifestSha256),
    ...evidenceRow('Access manifest SHA-256', record.accessManifestSha256),
    ...evidenceRow('Native PNG SHA-256', frame.sha256),
    ...evidenceRow('Native PNG bytes', frame.sizeBytes),
    ...evidenceRow('Selected PTS', `${frame.pts} × ${frame.timeBase}`),
    ...evidenceRow('Requested target PTS', `${frame.targetPts.numerator}/${frame.targetPts.denominator}`),
  );
  setSize(native);
  loadSelectedImage();
}

$('native-previous').onclick = () => navigate(selected.record.recordId, selected.frame.index - 1);
$('native-next').onclick = () => navigate(selected.record.recordId, selected.frame.index + 1);
$('native-fit').onclick = () => setSize(false);
$('native-pixels').onclick = () => setSize(true);
$('native-retry').onclick = loadSelectedImage;
window.addEventListener('popstate', () => { if (payload) renderRoute(); });

async function initialize() {
  try {
    const response = await fetch('native-data.json?v=4b0870f45eac36c53b1084305934471ee8dd273b');
    if (!response.ok) throw new Error('Native companion index unavailable.');
    payload = await response.json();
    if (payload.schema !== 'native-inspection-projection/v1' || !Array.isArray(payload.records)) {
      throw new Error('Native companion index is invalid.');
    }
    $('native-pack-link').href = `https://huggingface.co/datasets/${payload.derivedRepository}/blob/${payload.derivedRevision}/${payload.profile}/README.md`;
    $('native-pack-link').hidden = false;
    $('native-records').replaceChildren(...payload.records.map(record => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.recordId = record.recordId;
      const title = document.createElement('strong'), label = document.createElement('span'), id = document.createElement('span');
      title.textContent = `${tierLabels[record.collectionTier] || record.collectionTier} recording`;
      label.textContent = record.filePath.split('/').at(-1); id.textContent = record.recordId;
      button.append(title, label, id);
      button.onclick = () => navigate(record.recordId);
      return button;
    }));
    renderRoute();
  } catch {
    payload = null;
    status('The native companion index could not load or be validated. No recording or image has been substituted. Reload the page to retry.', 'error');
  }
}
initialize();
