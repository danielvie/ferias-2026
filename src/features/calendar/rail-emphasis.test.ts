import { expect, test } from 'vitest';
import { markerEmphasis } from './rail-emphasis';

test('only the hovered tick and immediate neighbors change width and color, not thickness', () => {
  expect(markerEmphasis(5, 5)).toEqual({ width: 1, color: 1 });
  expect(markerEmphasis(4, 5)).toEqual({ width: .5, color: .2 });
  expect(markerEmphasis(6, 5)).toEqual({ width: .5, color: .2 });
  for (const index of [0, 1, 2, 3, 7, 8, 9]) {
    expect(markerEmphasis(index, 5)).toEqual({ width: 0, color: 0 });
  }
});

test('no hover resets every tick, and the first/last tick affect only their existing neighbors', () => {
  expect(markerEmphasis(0, null)).toEqual({ width: 0, color: 0 });
  expect(markerEmphasis(1, 0)).toEqual({ width: .5, color: .2 });
  expect(markerEmphasis(12, 13)).toEqual({ width: .5, color: .2 });
  expect(markerEmphasis(11, 13)).toEqual({ width: 0, color: 0 });
});
