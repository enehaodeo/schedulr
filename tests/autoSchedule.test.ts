import { describe, expect, it } from 'vitest';
import { autoSchedule, canPlace, freeIntervals } from '../src/features/scheduler/autoSchedule';

const M = 60 * 1000;
const at = (min: number) => min * M;

describe('freeIntervals', () => {
  it('subtracts busy blocks and clips before now', () => {
    const free = freeIntervals([{ start: at(0), end: at(120) }], [{ start: at(30), end: at(60) }], at(10));
    expect(free).toEqual([
      { start: at(10), end: at(30) },
      { start: at(60), end: at(120) },
    ]);
  });
});

describe('autoSchedule', () => {
  const windows = [
    { start: at(0), end: at(60) },
    { start: at(120), end: at(180) },
  ];

  it('places tasks in pool order at the earliest slot', () => {
    const r = autoSchedule(
      [
        { id: 'a', duration_min: 30 },
        { id: 'b', duration_min: 30 },
        { id: 'c', duration_min: 30 },
      ],
      windows,
      [],
      0,
    );
    expect(r).toEqual([
      { id: 'a', start: at(0), end: at(30) },
      { id: 'b', start: at(30), end: at(60) },
      { id: 'c', start: at(120), end: at(150) },
    ]);
  });

  it('skips a task that does not fit and continues with the next', () => {
    const r = autoSchedule(
      [
        { id: 'big', duration_min: 90 },
        { id: 'small', duration_min: 20 },
      ],
      windows,
      [],
      0,
    );
    expect(r).toEqual([{ id: 'small', start: at(0), end: at(20) }]);
  });

  it('respects existing busy blocks and now', () => {
    const r = autoSchedule([{ id: 'a', duration_min: 30 }], windows, [{ start: at(40), end: at(60) }], at(15));
    expect(r).toEqual([{ id: 'a', start: at(120), end: at(150) }]);
  });
});

describe('canPlace', () => {
  const windows = [{ start: at(0), end: at(60) }];
  it('accepts a block inside availability with no clash', () => {
    expect(canPlace({ start: at(10), end: at(20) }, windows, [])).toBe(true);
  });
  it('rejects outside availability', () => {
    expect(canPlace({ start: at(50), end: at(70) }, windows, [])).toBe(false);
  });
  it('rejects overlap', () => {
    expect(canPlace({ start: at(10), end: at(20) }, windows, [{ start: at(15), end: at(25) }])).toBe(false);
  });
});
