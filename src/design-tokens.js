'use strict';

// The shared, accessible design-token module: the single source of truth for
// the demo's visual tokens (color palette, text/control foreground-background
// pairs, focus-outline style). No frontend exists yet, so this establishes the
// foundation downstream components consume instead of hard-coding ad-hoc
// colors. It mirrors the frozen-enum / single-source-of-truth pattern of the
// existing vocabulary modules (`requirement.js`, `status.js`,
// `reason-codes.js`).
//
// Every documented foreground/background pair meets or exceeds the WCAG 2.1 AA
// contrast minimums for its use case (4.5:1 normal text, 3:1 large text and
// essential UI / graphical controls). The CONTRAST_PAIRS table is
// machine-checkable via auditContrastTable() so components consume validated
// pairs rather than eyeballed colors.

// ---------------------------------------------------------------------------
// PALETTE
// ---------------------------------------------------------------------------

// The token -> hex color map. Downstream components reference these tokens by
// name; the CONTRAST_PAIRS table below documents which combinations are safe.
// Colors are chosen around the Vodacom red brand while keeping every consumed
// pairing above its WCAG 2.1 AA minimum.
const PALETTE = Object.freeze({
  // Neutrals.
  white: '#ffffff',
  ink: '#1a1a1a', // primary body text
  textMuted: '#595959', // secondary text, still >= 4.5:1 on white
  surface: '#ffffff', // default page/card background
  surfaceAlt: '#f4f4f4', // subtle alternate background

  // Brand.
  brand: '#e60000', // Vodacom red; UI/graphic use (>= 3:1 on white)
  brandDark: '#c20000', // darker brand red usable as text on white
  onBrand: '#ffffff', // text/icons placed on a brand fill

  // Semantic accents.
  link: '#0b5fff', // interactive text / focus indicator
  success: '#0f7b3f', // positive status text
});

// ---------------------------------------------------------------------------
// CONTRAST_LEVEL vocabulary + MINIMUM_RATIO mapping
// ---------------------------------------------------------------------------

// The WCAG 2.1 AA use cases that carry a minimum contrast requirement.
const CONTRAST_LEVEL = Object.freeze({
  NORMAL_TEXT: 'NORMAL_TEXT', // body text < 18pt / 14pt bold: >= 4.5:1
  LARGE_TEXT: 'LARGE_TEXT', // large text >= 18pt / 14pt bold:   >= 3:1
  UI_COMPONENT: 'UI_COMPONENT', // essential UI / graphical objects:  >= 3:1
});

const CONTRAST_LEVEL_VALUES = Object.freeze(Object.values(CONTRAST_LEVEL));

// The required numeric ratio per level, straight from WCAG 2.1 SC 1.4.3 and
// 1.4.11.
const MINIMUM_RATIO = Object.freeze({
  [CONTRAST_LEVEL.NORMAL_TEXT]: 4.5,
  [CONTRAST_LEVEL.LARGE_TEXT]: 3,
  [CONTRAST_LEVEL.UI_COMPONENT]: 3,
});

// ---------------------------------------------------------------------------
// Contrast math helpers (WCAG 2.1 relative luminance + contrast ratio)
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Parse a #rgb or #rrggbb hex color into its [r, g, b] 8-bit channels.
function hexToRgb(hex) {
  if (typeof hex !== 'string' || !HEX_COLOR.test(hex)) {
    throw new Error(`"${hex}" is not a valid #rgb / #rrggbb hex color`);
  }
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Linearize a single 8-bit sRGB channel per the WCAG transfer function.
function channelToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// The WCAG relative luminance of a color, in [0, 1] (0 = black, 1 = white).
function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

// The WCAG contrast ratio between two colors, in [1, 21]. Symmetric in its
// arguments.
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// Whether a computed ratio clears the minimum required for a given level. A
// tiny epsilon absorbs floating-point noise at the boundary.
function meetsMinimumRatio(ratio, level) {
  const minimum = MINIMUM_RATIO[level];
  if (typeof minimum !== 'number') {
    throw new Error(`unknown contrast level "${level}"`);
  }
  return ratio >= minimum - 1e-9;
}

// ---------------------------------------------------------------------------
// CONTRAST_PAIRS: the machine-checkable contrast table
// ---------------------------------------------------------------------------

// Build a frozen contrast-pair entry, resolving the required ratio from the
// level so the two can never drift apart.
function pair(name, foreground, background, level) {
  return Object.freeze({
    name,
    foreground,
    background,
    level,
    minimumRatio: MINIMUM_RATIO[level],
  });
}

// The validated color combinations downstream components consume. Every
// foreground/background is a PALETTE token value, and every entry clears its
// level's minimum ratio (verified by auditContrastTable() and the acceptance
// tests).
const CONTRAST_PAIRS = Object.freeze([
  // Body and secondary text on the default surfaces.
  pair('body-text-on-surface', PALETTE.ink, PALETTE.surface, CONTRAST_LEVEL.NORMAL_TEXT),
  pair('body-text-on-surface-alt', PALETTE.ink, PALETTE.surfaceAlt, CONTRAST_LEVEL.NORMAL_TEXT),
  pair('muted-text-on-surface', PALETTE.textMuted, PALETTE.surface, CONTRAST_LEVEL.NORMAL_TEXT),
  pair('muted-text-on-surface-alt', PALETTE.textMuted, PALETTE.surfaceAlt, CONTRAST_LEVEL.NORMAL_TEXT),

  // Brand and semantic text.
  pair('brand-text-on-surface', PALETTE.brandDark, PALETTE.surface, CONTRAST_LEVEL.NORMAL_TEXT),
  pair('link-text-on-surface', PALETTE.link, PALETTE.surface, CONTRAST_LEVEL.NORMAL_TEXT),
  pair('success-text-on-surface', PALETTE.success, PALETTE.surface, CONTRAST_LEVEL.NORMAL_TEXT),

  // Text on a brand fill (e.g. primary buttons). At LARGE_TEXT / button sizing.
  pair('text-on-brand-fill', PALETTE.onBrand, PALETTE.brand, CONTRAST_LEVEL.LARGE_TEXT),
  pair('inverse-text-on-ink', PALETTE.white, PALETTE.ink, CONTRAST_LEVEL.NORMAL_TEXT),

  // Essential UI / graphical controls (borders, icons, focus indicator): >= 3:1.
  pair('brand-control-on-surface', PALETTE.brand, PALETTE.surface, CONTRAST_LEVEL.UI_COMPONENT),
  pair('focus-outline-on-surface', PALETTE.link, PALETTE.surface, CONTRAST_LEVEL.UI_COMPONENT),
  pair('focus-outline-on-surface-alt', PALETTE.link, PALETTE.surfaceAlt, CONTRAST_LEVEL.UI_COMPONENT),
]);

// ---------------------------------------------------------------------------
// FOCUS_OUTLINE
// ---------------------------------------------------------------------------

// The shared keyboard-focus indicator. Its color is itself a validated
// UI_COMPONENT pair in CONTRAST_PAIRS (`focus-outline-on-surface`), so the
// outline is guaranteed to be perceivable (>= 3:1) against the page surface.
const FOCUS_OUTLINE = Object.freeze({
  color: PALETTE.link,
  width: '2px',
  style: 'solid',
  offset: '2px',
});

// ---------------------------------------------------------------------------
// Automated contrast check
// ---------------------------------------------------------------------------

// Recompute the contrast ratio for every documented pair and report whether it
// meets its required minimum. Downstream tooling (and the acceptance tests)
// call this to prove the table is valid rather than trusting the hand-authored
// entries.
function auditContrastTable() {
  return CONTRAST_PAIRS.map((entry) => {
    const ratio = contrastRatio(entry.foreground, entry.background);
    return {
      name: entry.name,
      level: entry.level,
      minimumRatio: entry.minimumRatio,
      ratio,
      passes: meetsMinimumRatio(ratio, entry.level),
    };
  });
}

module.exports = {
  PALETTE,
  CONTRAST_LEVEL,
  CONTRAST_LEVEL_VALUES,
  MINIMUM_RATIO,
  CONTRAST_PAIRS,
  FOCUS_OUTLINE,
  relativeLuminance,
  contrastRatio,
  meetsMinimumRatio,
  auditContrastTable,
};
