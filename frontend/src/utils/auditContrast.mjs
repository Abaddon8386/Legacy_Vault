/**
 * WCAG 2.1 Contrast Ratio Calculator and Audit Utility
 * Calculates exact relative luminance, handles alpha compositing over backgrounds,
 * and audits text/background pairs for WCAG AA compliance (4.5:1 normal, 3.0:1 large/UI).
 */

export function parseColor(colorStr) {
  if (!colorStr) return null;
  const str = colorStr.trim().toLowerCase();

  // #rgb or #rgba
  const hex3 = /^#([0-9a-f]{3,4})$/i.exec(str);
  if (hex3) {
    const raw = hex3[1];
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    const a = raw.length === 4 ? parseInt(raw[3] + raw[3], 16) / 255 : 1;
    return { r, g, b, a };
  }

  // #rrggbb or #rrggbbaa
  const hex6 = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(str);
  if (hex6) {
    const raw = hex6[1];
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(str);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  // named common colors
  if (str === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (str === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  return null;
}

export function compositeOver(fg, bg) {
  const fgColor = typeof fg === 'string' ? parseColor(fg) : fg;
  const bgColor = typeof bg === 'string' ? parseColor(bg) : bg;
  if (!fgColor || !bgColor) return null;

  const a = fgColor.a;
  return {
    r: Math.round(fgColor.r * a + bgColor.r * (1 - a)),
    g: Math.round(fgColor.g * a + bgColor.g * (1 - a)),
    b: Math.round(fgColor.b * a + bgColor.b * (1 - a)),
    a: 1,
  };
}

export function toHex(c) {
  const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

export function relativeLuminance(color) {
  const c = typeof color === 'string' ? parseColor(color) : color;
  if (!c) return 0;
  const sRGB = [c.r / 255, c.g / 255, c.b / 255];
  const linear = sRGB.map((val) =>
    val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(fg, bg) {
  const fgEff = compositeOver(fg, bg);
  const bgEff = typeof bg === 'string' ? parseColor(bg) : bg;
  const l1 = relativeLuminance(fgEff);
  const l2 = relativeLuminance(bgEff);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function evaluateContrast(fg, bg, isLargeText = false) {
  const ratio = contrastRatio(fg, bg);
  const required = isLargeText ? 3.0 : 4.5;
  return {
    ratio: Math.round(ratio * 100) / 100,
    passes: ratio >= required,
    required,
  };
}
