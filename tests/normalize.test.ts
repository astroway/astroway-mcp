import { describe, it, expect } from 'vitest';
import { normalizeTimes } from '../src/normalize';

describe('normalizeTimes', () => {
  it('pads HH:mm to HH:mm:ss on time fields', () => {
    expect(normalizeTimes({ date: '1990-05-15', time: '14:30' })).toEqual({
      date: '1990-05-15',
      time: '14:30:00',
    });
  });

  it('leaves HH:mm:ss untouched', () => {
    expect(normalizeTimes({ time: '14:30:00' })).toEqual({ time: '14:30:00' });
  });

  it('handles transit/target/after time variants', () => {
    expect(normalizeTimes({ transitTime: '09:05', targetTime: '12:00', afterTime: '23:59' })).toEqual({
      transitTime: '09:05:00',
      targetTime: '12:00:00',
      afterTime: '23:59:00',
    });
  });

  it('handles two-chart underscore keys', () => {
    expect(normalizeTimes({ chart1_time: '06:15', chart2_time: '18:45:30' })).toEqual({
      chart1_time: '06:15:00',
      chart2_time: '18:45:30',
    });
  });

  it('recurses into nested natal and member arrays', () => {
    expect(
      normalizeTimes({
        natal: { time: '07:07' },
        members: [{ time: '01:02' }, { time: '03:04:05' }],
      }),
    ).toEqual({
      natal: { time: '07:07:00' },
      members: [{ time: '01:02:00' }, { time: '03:04:05' }],
    });
  });

  it('does not touch non-time fields that look like times', () => {
    expect(normalizeTimes({ date: '12:30', label: '14:00' })).toEqual({
      date: '12:30',
      label: '14:00',
    });
  });

  it('ignores non-matching time strings', () => {
    expect(normalizeTimes({ time: 'noon' })).toEqual({ time: 'noon' });
  });
});
