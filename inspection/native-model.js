/** Exact routes into the bounded, published native-companion projection. */
export function resolveSelection(payload, search) {
  const query = new URLSearchParams(search);
  if (query.getAll('record').length > 1 || query.getAll('frame').length > 1) {
    throw new Error('Invalid ambiguous recording or frame selection.');
  }
  if (!query.has('record')) {
    if (query.has('frame')) throw new Error('Invalid frame selection without a recording.');
    return {record: null, frame: null};
  }
  const id = query.get('record');
  const record = payload.records.find(item => item.recordId === id);
  if (!/^tla-[0-9a-f]{16}$/.test(id) || !record) {
    throw new Error('This recording is unavailable in the native companion pack. Choose a recording below.');
  }
  const value = query.has('frame') ? query.get('frame') : '0';
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Invalid native frame selection.');
  const index = Number(value);
  const frame = record.frames.find(item => item.index === index);
  if (!frame || index > 20) throw new Error('This native frame is unavailable. Choose a recording below.');
  return {record, frame};
}
