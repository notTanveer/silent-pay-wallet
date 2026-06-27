export function formatBlockHeight(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '--';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
