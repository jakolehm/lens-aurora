const RGB = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/;
/** Aurora draws light on dark: a light theme's background would hide it, so it keeps its own then. */
const DARK_ENOUGH = 0.35;

const luminance = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** The background Lens paints behind the element, if it is dark. */
export function themeBackground(element: HTMLElement): number | undefined {
  for (let at: HTMLElement | null = element; at !== null; at = at.parentElement) {
    const match = RGB.exec(getComputedStyle(at).backgroundColor);
    if (match === null || match[4] === "0") continue;
    const [r, g, b] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
    return luminance(r, g, b) <= DARK_ENOUGH ? (r << 16) | (g << 8) | b : undefined;
  }
  return undefined;
}
