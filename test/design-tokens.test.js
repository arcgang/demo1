'use strict';

// Acceptance tests: the shared, accessible design-token module.
//
// `src/design-tokens.js` is the single source of truth for the demo's visual
// tokens. No frontend exists yet, so this module establishes the foundation
// that downstream components must consume instead of hard-coding ad-hoc colors.
// It mirrors the frozen-enum / single-source-of-truth pattern of the existing
// vocabulary modules (`requirement.js`, `status.js`, `reason-codes.js`).
//
// It exports:
//
//   PALETTE               frozen map of token name -> hex color string. Every
//                         value is a valid #rgb / #rrggbb hex color.
//
//   CONTRAST_LEVEL        frozen vocabulary of the WCAG 2.1 AA use cases that
//                         carry a minimum contrast requirement:
//                           NORMAL_TEXT   (>= 4.5:1)
//                           LARGE_TEXT    (>= 3:1)
//                           UI_COMPONENT  (>= 3:1, essential UI / graphics)
//   CONTRAST_LEVEL_VALUES frozen array of the level values
//   MINIMUM_RATIO         frozen map level -> required numeric ratio
//                           { NORMAL_TEXT: 4.5, LARGE_TEXT: 3, UI_COMPONENT: 3 }
//
//   CONTRAST_PAIRS        the machine-checkable contrast table: a frozen array
//                         of frozen entries
//                           { name, foreground, background, level, minimumRatio }
//                         where foreground/background are palette hex values,
//                         level is a CONTRAST_LEVEL, and minimumRatio equals
//                         MINIMUM_RATIO[level]. Downstream components consume
//                         these validated pairs rather than ad-hoc colors.
//
//   FOCUS_OUTLINE         frozen focus-outline style { color, width, style,
//                         offset }. The outline color is itself a validated
//                         UI_COMPONENT pair in CONTRAST_PAIRS.
//
//   relativeLuminance(hex)      -> WCAG relative luminance in [0, 1]
//   contrastRatio(a, b)         -> WCAG contrast ratio in [1, 21]
//   meetsMinimumRatio(ratio, level) -> boolean (ratio >= MINIMUM_RATIO[level])
//   auditContrastTable()        -> [{ name, level, minimumRatio, ratio, passes }]
//                                  one result per CONTRAST_PAIRS entry
//
// Acceptance: every documented pair passes its required ratio, verified by an
// automated contrast check.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const tokens = require('../src/design-tokens.js');
const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// Independent WCAG 2.1 reference implementation.
//
// The acceptance check must be genuinely independent of the module under test:
// we recompute the contrast ratio ourselves and confirm both that the module
// agrees with us and that every documented pair clears its required minimum.
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function hexToRgb(hex) {
  assert.match(hex, HEX_COLOR, `"${hex}" must be a valid #rgb / #rrggbb hex color`);
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function channelToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function refLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function refContrast(a, b) {
  const la = refLuminance(a);
  const lb = refLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const EPSILON = 1e-9;

// ---------------------------------------------------------------------------
// PALETTE
// ---------------------------------------------------------------------------

test('exports a non-empty PALETTE object of token -> hex color', () => {
  assert.equal(typeof tokens.PALETTE, 'object');
  assert.notEqual(tokens.PALETTE, null);
  assert.ok(Object.keys(tokens.PALETTE).length > 0, 'PALETTE must define at least one color');
});

test('every PALETTE value is a valid hex color', () => {
  for (const [name, value] of Object.entries(tokens.PALETTE)) {
    assert.equal(typeof value, 'string', `PALETTE.${name} must be a string`);
    assert.match(value, HEX_COLOR, `PALETTE.${name} ("${value}") must be a valid hex color`);
  }
});

test('PALETTE is frozen and cannot be mutated', () => {
  assert.equal(Object.isFrozen(tokens.PALETTE), true);
  assert.throws(() => {
    'use strict';
    tokens.PALETTE.__injected = '#000000';
  });
  assert.equal(tokens.PALETTE.__injected, undefined);
});

// ---------------------------------------------------------------------------
// CONTRAST_LEVEL vocabulary + MINIMUM_RATIO mapping
// ---------------------------------------------------------------------------

test('exports the CONTRAST_LEVEL vocabulary: NORMAL_TEXT / LARGE_TEXT / UI_COMPONENT', () => {
  assert.deepEqual(tokens.CONTRAST_LEVEL, {
    NORMAL_TEXT: 'NORMAL_TEXT',
    LARGE_TEXT: 'LARGE_TEXT',
    UI_COMPONENT: 'UI_COMPONENT',
  });
});

test('CONTRAST_LEVEL is frozen and cannot gain new members', () => {
  assert.equal(Object.isFrozen(tokens.CONTRAST_LEVEL), true);
  assert.throws(() => {
    'use strict';
    tokens.CONTRAST_LEVEL.GRAPHIC = 'GRAPHIC';
  });
  assert.equal(tokens.CONTRAST_LEVEL.GRAPHIC, undefined);
});

test('exports CONTRAST_LEVEL_VALUES as a frozen array of the level values', () => {
  assert.ok(Array.isArray(tokens.CONTRAST_LEVEL_VALUES));
  assert.deepEqual([...tokens.CONTRAST_LEVEL_VALUES], Object.values(tokens.CONTRAST_LEVEL));
  assert.equal(Object.isFrozen(tokens.CONTRAST_LEVEL_VALUES), true);
});

test('MINIMUM_RATIO encodes the WCAG 2.1 AA minimums per level', () => {
  assert.equal(typeof tokens.MINIMUM_RATIO, 'object');
  assert.equal(tokens.MINIMUM_RATIO.NORMAL_TEXT, 4.5);
  assert.equal(tokens.MINIMUM_RATIO.LARGE_TEXT, 3);
  assert.equal(tokens.MINIMUM_RATIO.UI_COMPONENT, 3);
});

test('MINIMUM_RATIO is frozen and defines a ratio for every level', () => {
  assert.equal(Object.isFrozen(tokens.MINIMUM_RATIO), true);
  for (const level of tokens.CONTRAST_LEVEL_VALUES) {
    assert.equal(
      typeof tokens.MINIMUM_RATIO[level],
      'number',
      `MINIMUM_RATIO must define a numeric ratio for ${level}`,
    );
  }
});

// ---------------------------------------------------------------------------
// contrast math helpers
// ---------------------------------------------------------------------------

test('relativeLuminance is exported and returns the WCAG luminance in [0, 1]', () => {
  assert.equal(typeof tokens.relativeLuminance, 'function');
  assert.ok(Math.abs(tokens.relativeLuminance('#000000') - 0) < EPSILON, 'black luminance is 0');
  assert.ok(Math.abs(tokens.relativeLuminance('#ffffff') - 1) < EPSILON, 'white luminance is 1');
});

test('contrastRatio is exported and matches the canonical WCAG extremes', () => {
  assert.equal(typeof tokens.contrastRatio, 'function');
  // Black on white is the maximum possible ratio, 21:1.
  assert.ok(Math.abs(tokens.contrastRatio('#000000', '#ffffff') - 21) < 1e-6);
  // A color against itself is the minimum, 1:1.
  assert.ok(Math.abs(tokens.contrastRatio('#123456', '#123456') - 1) < 1e-6);
});

test('contrastRatio is symmetric', () => {
  assert.ok(
    Math.abs(tokens.contrastRatio('#000000', '#ffffff') - tokens.contrastRatio('#ffffff', '#000000')) < EPSILON,
  );
});

test('contrastRatio agrees with the independent reference implementation', () => {
  const samples = [
    ['#000000', '#ffffff'],
    ['#767676', '#ffffff'],
    ['#ffffff', '#005a9c'],
    ['#1a1a1a', '#e0e0e0'],
  ];
  for (const [a, b] of samples) {
    assert.ok(
      Math.abs(tokens.contrastRatio(a, b) - refContrast(a, b)) < 1e-6,
      `contrastRatio(${a}, ${b}) must match the WCAG reference`,
    );
  }
});

test('meetsMinimumRatio compares a ratio against the level minimum', () => {
  assert.equal(typeof tokens.meetsMinimumRatio, 'function');
  assert.equal(tokens.meetsMinimumRatio(4.5, tokens.CONTRAST_LEVEL.NORMAL_TEXT), true);
  assert.equal(tokens.meetsMinimumRatio(4.49, tokens.CONTRAST_LEVEL.NORMAL_TEXT), false);
  assert.equal(tokens.meetsMinimumRatio(3, tokens.CONTRAST_LEVEL.UI_COMPONENT), true);
  assert.equal(tokens.meetsMinimumRatio(2.99, tokens.CONTRAST_LEVEL.LARGE_TEXT), false);
});

// ---------------------------------------------------------------------------
// CONTRAST_PAIRS: the machine-checkable contrast table
// ---------------------------------------------------------------------------

test('exports CONTRAST_PAIRS as a non-empty frozen array', () => {
  assert.ok(Array.isArray(tokens.CONTRAST_PAIRS));
  assert.ok(tokens.CONTRAST_PAIRS.length > 0, 'the contrast table must document at least one pair');
  assert.equal(Object.isFrozen(tokens.CONTRAST_PAIRS), true);
});

test('every contrast pair is a frozen, well-formed entry', () => {
  const names = new Set();
  for (const pair of tokens.CONTRAST_PAIRS) {
    assert.ok(pair && typeof pair === 'object', 'each pair must be an object');
    assert.equal(Object.isFrozen(pair), true, 'each pair must be frozen');

    assert.equal(typeof pair.name, 'string');
    assert.ok(pair.name.trim().length > 0, 'each pair needs a non-empty name');
    assert.ok(!names.has(pair.name), `pair name "${pair.name}" must be unique`);
    names.add(pair.name);

    assert.match(pair.foreground, HEX_COLOR, `${pair.name}: foreground must be a hex color`);
    assert.match(pair.background, HEX_COLOR, `${pair.name}: background must be a hex color`);

    assert.ok(
      tokens.CONTRAST_LEVEL_VALUES.includes(pair.level),
      `${pair.name}: level (${pair.level}) must be a valid CONTRAST_LEVEL`,
    );
    assert.equal(
      pair.minimumRatio,
      tokens.MINIMUM_RATIO[pair.level],
      `${pair.name}: minimumRatio must equal MINIMUM_RATIO[${pair.level}]`,
    );
  }
});

test('contrast pairs consume PALETTE colors, not ad-hoc values', () => {
  const paletteColors = new Set(Object.values(tokens.PALETTE).map((c) => c.toLowerCase()));
  for (const pair of tokens.CONTRAST_PAIRS) {
    assert.ok(
      paletteColors.has(pair.foreground.toLowerCase()),
      `${pair.name}: foreground ${pair.foreground} must be a PALETTE color`,
    );
    assert.ok(
      paletteColors.has(pair.background.toLowerCase()),
      `${pair.name}: background ${pair.background} must be a PALETTE color`,
    );
  }
});

test('the table documents text and control pairs', () => {
  const levels = tokens.CONTRAST_PAIRS.map((p) => p.level);
  assert.ok(levels.includes(tokens.CONTRAST_LEVEL.NORMAL_TEXT), 'must document a normal-text pair');
  assert.ok(levels.includes(tokens.CONTRAST_LEVEL.UI_COMPONENT), 'must document a UI/control pair');
});

// ---------------------------------------------------------------------------
// The core acceptance check: every documented pair passes its required ratio
// ---------------------------------------------------------------------------

test('every documented pair meets or exceeds its required ratio (independent check)', () => {
  for (const pair of tokens.CONTRAST_PAIRS) {
    const ratio = refContrast(pair.foreground, pair.background);
    assert.ok(
      ratio >= pair.minimumRatio - 1e-9,
      `${pair.name}: contrast ${ratio.toFixed(2)}:1 must be >= required ${pair.minimumRatio}:1 ` +
        `(${pair.foreground} on ${pair.background}, ${pair.level})`,
    );
  }
});

test('auditContrastTable reports a passing result for every documented pair', () => {
  assert.equal(typeof tokens.auditContrastTable, 'function');
  const results = tokens.auditContrastTable();

  assert.ok(Array.isArray(results));
  assert.equal(
    results.length,
    tokens.CONTRAST_PAIRS.length,
    'audit must return one result per documented pair',
  );

  const byName = new Map(results.map((r) => [r.name, r]));
  for (const pair of tokens.CONTRAST_PAIRS) {
    const result = byName.get(pair.name);
    assert.ok(result, `audit must include a result for "${pair.name}"`);

    assert.equal(result.level, pair.level);
    assert.equal(result.minimumRatio, pair.minimumRatio);
    assert.equal(typeof result.ratio, 'number');

    // The audit's computed ratio must match the independent reference...
    assert.ok(
      Math.abs(result.ratio - refContrast(pair.foreground, pair.background)) < 1e-6,
      `${pair.name}: audited ratio must match the WCAG reference`,
    );
    // ...and the pair must be reported as passing.
    assert.equal(result.passes, true, `${pair.name}: audit must report the pair as passing`);
    assert.ok(result.ratio >= result.minimumRatio - 1e-9);
  }
});

// ---------------------------------------------------------------------------
// FOCUS_OUTLINE
// ---------------------------------------------------------------------------

test('exports a frozen FOCUS_OUTLINE style with color, width, style and offset', () => {
  assert.equal(typeof tokens.FOCUS_OUTLINE, 'object');
  assert.notEqual(tokens.FOCUS_OUTLINE, null);
  assert.equal(Object.isFrozen(tokens.FOCUS_OUTLINE), true);

  assert.match(tokens.FOCUS_OUTLINE.color, HEX_COLOR, 'focus outline color must be a hex color');
  assert.ok('width' in tokens.FOCUS_OUTLINE, 'focus outline must define a width');
  assert.ok('style' in tokens.FOCUS_OUTLINE, 'focus outline must define a style');
  assert.ok('offset' in tokens.FOCUS_OUTLINE, 'focus outline must define an offset');
});

test('the focus outline color is a validated UI_COMPONENT pair in the contrast table', () => {
  const focusColor = tokens.FOCUS_OUTLINE.color.toLowerCase();
  const focusPairs = tokens.CONTRAST_PAIRS.filter(
    (p) => p.level === tokens.CONTRAST_LEVEL.UI_COMPONENT && p.foreground.toLowerCase() === focusColor,
  );
  assert.ok(
    focusPairs.length > 0,
    'the focus outline color must appear as a validated UI_COMPONENT pair (>= 3:1)',
  );
  for (const pair of focusPairs) {
    const ratio = refContrast(pair.foreground, pair.background);
    assert.ok(
      ratio >= 3 - 1e-9,
      `focus outline pair "${pair.name}" must clear 3:1 (got ${ratio.toFixed(2)}:1)`,
    );
  }
});

// ---------------------------------------------------------------------------
// Single import surface: re-exported from src/index.js
// ---------------------------------------------------------------------------

test('src/index.js re-exports the design tokens', () => {
  assert.equal(typeof model.PALETTE, 'object');
  assert.deepEqual(model.PALETTE, tokens.PALETTE);
  assert.deepEqual(model.CONTRAST_LEVEL, tokens.CONTRAST_LEVEL);
  assert.deepEqual([...model.CONTRAST_PAIRS], [...tokens.CONTRAST_PAIRS]);
  assert.deepEqual(model.FOCUS_OUTLINE, tokens.FOCUS_OUTLINE);

  assert.equal(typeof model.contrastRatio, 'function');
  assert.equal(model.contrastRatio, tokens.contrastRatio);
  assert.equal(typeof model.auditContrastTable, 'function');
  assert.equal(model.auditContrastTable, tokens.auditContrastTable);
});
