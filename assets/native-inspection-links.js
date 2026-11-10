import { NATIVE_INSPECTION_LINKS } from './native-inspection-index.js';

export function nativeInspectionUrl(record) {
  const match = record && NATIVE_INSPECTION_LINKS[record.recordId];
  return match && match.sourceXetHash === record.integrityReference ? match.url : null;
}
