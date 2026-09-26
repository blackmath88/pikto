const dot = (cx: number, cy: number, r = 1.5): string => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

export const ICONS = {
  // Stages
  discover: `<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>`,
  build: `<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>`,
  help: `<circle cx="12" cy="12" r="8.5"/><path d="M9.75 9.5a2.25 2.25 0 1 1 3.2 2.05"/>${dot(12, 16.4, 0.9)}`,
  search: `<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>`,
  external: `<path d="M13.5 4.5h6v6M19.5 4.5L11 13"/><path d="M17 14v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1H10"/>`,
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, { size = 18 }: { size?: number } = {}): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}
