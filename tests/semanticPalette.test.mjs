import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const palettes = {
  royal: ['ccd9ff', 'a6bbf8', '839ef0', '6183e9', '4169e1'],
  danger: ['ffcccc', 'ffa6a6', 'ff8080', 'ff5a5a', 'e62e2e'],
  success: ['cbf4dd', '9aeabe', '6ddfa0', '43d585', '1eca6b'],
  warning: ['fdffe0', 'ffffc1', 'fffaa3', 'fff184', 'ffe565'],
  info: ['e6dcfa', 'cdbaf4', 'b699ef', '9f79ea', '895be4'],
};
const shadeWeights = [[600, 0.8], [700, 0.6], [800, 0.4], [900, 0.2], [950, 0.1]];

function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6});`, 'i'));
  assert.ok(match, `missing color token --${name}`);
  return match[1].toLowerCase();
}

function mixWithBackground(base, weight, background) {
  const channels = value => value.match(/../g).map(channel => parseInt(channel, 16));
  return channels(base).map((channel, index) =>
    Math.round(channel * weight + channels(background)[index] * (1 - weight))
      .toString(16).padStart(2, '0'))
    .join('');
}

test('semantic shade ramps interpolate toward the root background', () => {
  const background = token('neutral-950');
  assert.equal(background, '1b1d21');
  assert.match(css, /--background-color:\s*var\(--neutral-950\);/);

  for (const [palette, tintsAndBase] of Object.entries(palettes)) {
    for (const [index, shade] of [100, 200, 300, 400, 500].entries()) {
      assert.equal(token(`${palette}-${shade}`), tintsAndBase[index],
        `${palette}-${shade} tint/base must remain unchanged`);
    }

    const base = token(`${palette}-500`);
    for (const [shade, weight] of shadeWeights) {
      assert.equal(token(`${palette}-${shade}`), mixWithBackground(base, weight, background),
        `${palette}-${shade} must use ${weight * 100}% base mixed with the root background`);
    }
  }
});
