// ✓ in a comment stays
const icon = (s: string) => s === 'ok' ? '✓' : '✕';
export const label = `done ✓`;
export const mixed = '<b>✕ failed</b>';
export { icon };
