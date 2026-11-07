import { describe, expect, it } from 'vitest';
import { cleanDigits } from '../src/components/NumberInput';
import { toggleTag } from '../src/components/Tags';
import { courseSubject } from '../src/lib/courses';

describe('cleanDigits', () => {
  it('allows the field to be emptied', () => {
    expect(cleanDigits('')).toBe('');
  });

  it('drops leading zeros while typing', () => {
    expect(cleanDigits('01')).toBe('1');
    expect(cleanDigits('007')).toBe('7');
    expect(cleanDigits('10')).toBe('10');
    expect(cleanDigits('0')).toBe('0');
  });

  it('removes non-digits', () => {
    expect(cleanDigits('1a2-.')).toBe('12');
  });

  it('caps at max', () => {
    expect(cleanDigits('75', 59)).toBe('59');
    expect(cleanDigits('59', 59)).toBe('59');
  });
});

describe('toggleTag', () => {
  it('adds a missing tag and keeps typed ones', () => {
    expect(toggleTag('数学 作业', '物理')).toBe('数学, 作业, 物理');
    expect(toggleTag('', '物理')).toBe('物理');
  });

  it('removes a present tag', () => {
    expect(toggleTag('数学, 物理', '数学')).toBe('物理');
  });
});

describe('courseSubject', () => {
  it('strips the level so the subject works as one tag', () => {
    expect(courseSubject('MATH_HL')).toBe('数学');
    expect(courseSubject('BM_SL')).toBe('BM');
    expect(courseSubject('GERMAN')).toBe('德语');
  });
});
