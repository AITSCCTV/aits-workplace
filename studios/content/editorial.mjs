// Slot prefixes are part of the ingestion ID, which survives the existing API contract.
export function editorialStyle(draft) {
  if (/^edu_\d{8}$/.test(draft.id || '')) return 'EDUCATIONAL';
  if (/^marketing_\d{8}$/.test(draft.id || '')) return 'MARKETING';
  return 'LEGACY';
}
export function matchesEditorialFilter(draft, filter) {
  return filter === 'ALL' || editorialStyle(draft) === filter || draft.status === filter;
}
