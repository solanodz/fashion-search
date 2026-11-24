/**
 * A photo's colours as a small histogram, to compare two product photos by
 * colour alone. CLIP's image vectors weigh shape over colour, so the colour
 * of a new product is voted by the neighbours whose colours look most like
 * the photo's (ADR 0015). Model-free: pixels in, numbers out.
 */

/** Photos are shrunk to this size first: colour needs no detail. */
export const HISTOGRAM_WIDTH = 30;
export const HISTOGRAM_HEIGHT = 40;

/** Hue × saturation × value bins for coloured pixels. */
const HUES = 12;
const SATURATIONS = 2;
const VALUES = 3;
/** Value bins for greys (black to light grey). */
const GREYS = 5;
const COLOURED = HUES * SATURATIONS * VALUES;

export const HISTOGRAM_BINS = COLOURED + GREYS;

/** Brighter than this in every channel: the white studio background. */
const BACKGROUND = 0.92;
/** Below this saturation, or this dark, a pixel counts as grey. */
const GREY_SATURATION = 0.18;
const GREY_VALUE = 0.12;
/** Pixels near the centre count more; the product is usually there. */
const CENTRE_SPREAD = 0.18;

/**
 * Share of the photo's (non-background, centre-weighted) pixels in each
 * colour bin. Sums to 1, or is all zeros for a blank photo.
 */
export function colourHistogram(
  data: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
): Float32Array {
  const histogram = new Float32Array(HISTOGRAM_BINS);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const r = data[offset] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (min > BACKGROUND) continue;
      const delta = max - min;
      const saturation = max === 0 ? 0 : delta / max;
      const cx = (x + 0.5) / width - 0.5;
      const cy = (y + 0.5) / height - 0.5;
      const weight = Math.exp(-(cx * cx + cy * cy) / CENTRE_SPREAD);
      if (saturation < GREY_SATURATION || max < GREY_VALUE) {
        histogram[COLOURED + Math.min(GREYS - 1, Math.floor(max * GREYS))] +=
          weight;
        continue;
      }
      // Hue as a position on the colour wheel, 0 to 6.
      const hue =
        max === r
          ? ((g - b) / delta + 6) % 6
          : max === g
            ? (b - r) / delta + 2
            : (r - g) / delta + 4;
      const hueBin = Math.min(HUES - 1, Math.floor((hue / 6) * HUES));
      const saturationBin = saturation < 0.5 ? 0 : 1;
      const valueBin = Math.min(VALUES - 1, Math.floor(max * VALUES));
      histogram[(hueBin * SATURATIONS + saturationBin) * VALUES + valueBin] +=
        weight;
    }
  }
  let total = 0;
  for (const value of histogram) total += value;
  if (total > 0) {
    for (let i = 0; i < histogram.length; i++) histogram[i] /= total;
  }
  return histogram;
}

/** Histogram intersection: 1 for the same colours, 0 for none in common. */
export function histogramSimilarity(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): number {
  let shared = 0;
  for (let i = 0; i < a.length; i++) shared += Math.min(a[i], b[i]);
  return shared;
}
