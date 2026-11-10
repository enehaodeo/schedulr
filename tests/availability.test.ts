import { describe, expect, it } from 'vitest';
import { mergeRanges } from '../src/features/availability/windows';

const r = (start_min: number, end_min: number) => ({ start_min, end_min });

describe('mergeRanges', () => {
  it('merges ranges that touch end to start', () => {
    expect(mergeRanges([r(600, 720), r(480, 600)])).toEqual([r(480, 720)]);
  });
  it('merges overlapping and contained ranges', () => {
    expect(mergeRanges([r(480, 600), r(540, 660), r(500, 520)])).toEqual([r(480, 660)]);
  });
  it('keeps separate ranges apart and sorted', () => {
    expect(mergeRanges([r(900, 960), r(480, 600)])).toEqual([r(480, 600), r(900, 960)]);
  });
  it('drops empty markers', () => {
    expect(mergeRanges([r(0, 0), r(0, 60)])).toEqual([r(0, 60)]);
  });
  it('does not mutate the input', () => {
    const input = [r(480, 600), r(600, 720)];
    mergeRanges(input);
    expect(input).toEqual([r(480, 600), r(600, 720)]);
  });
});
