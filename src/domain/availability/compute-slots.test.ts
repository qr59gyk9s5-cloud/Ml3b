import { describe, expect, it } from 'vitest';
import { computeAvailableSlots, type WeeklyRuleInput } from './compute-slots';

const CAIRO = 'Africa/Cairo';

function iso(slots: { startAt: Date; endAt: Date }[]) {
  return slots.map((s) => [s.startAt.toISOString(), s.endAt.toISOString()]);
}

describe('computeAvailableSlots', () => {
  it('generates hourly slots across a simple same-day window', () => {
    // Sunday 2026-08-16, 09:00-12:00 Cairo (UTC+3) = 06:00-09:00 UTC
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 0, startTime: '09:00', endTime: '12:00', isClosed: false },
    ];
    const slots = computeAvailableSlots({
      date: '2026-08-16',
      timeZone: CAIRO,
      slotDurationMinutes: 60,
      rules,
    });

    expect(iso(slots)).toEqual([
      ['2026-08-16T06:00:00.000Z', '2026-08-16T07:00:00.000Z'],
      ['2026-08-16T07:00:00.000Z', '2026-08-16T08:00:00.000Z'],
      ['2026-08-16T08:00:00.000Z', '2026-08-16T09:00:00.000Z'],
    ]);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('produces no slots outside opening hours (no rule covering that day-of-week)', () => {
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', isClosed: false }, // Monday only
    ];
    // 2026-08-16 is a Sunday — no rule for Sunday.
    const slots = computeAvailableSlots({
      date: '2026-08-16',
      timeZone: CAIRO,
      slotDurationMinutes: 60,
      rules,
    });
    expect(slots).toEqual([]);
  });

  it('an explicit isClosed rule produces no slots even if a time range is set', () => {
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 0, startTime: '09:00', endTime: '20:00', isClosed: true },
    ];
    const slots = computeAvailableSlots({
      date: '2026-08-16',
      timeZone: CAIRO,
      slotDurationMinutes: 60,
      rules,
    });
    expect(slots).toEqual([]);
  });

  it('does not generate a trailing partial slot when the window does not divide evenly', () => {
    // 90 minutes open, 60-minute slots -> exactly one slot, no partial second slot.
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 0, startTime: '09:00', endTime: '10:30', isClosed: false },
    ];
    const slots = computeAvailableSlots({
      date: '2026-08-16',
      timeZone: CAIRO,
      slotDurationMinutes: 60,
      rules,
    });
    expect(slots).toHaveLength(1);
  });

  it('supports split hours: two rules on the same day-of-week', () => {
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 0, startTime: '09:00', endTime: '11:00', isClosed: false },
      { dayOfWeek: 0, startTime: '17:00', endTime: '19:00', isClosed: false },
    ];
    const slots = computeAvailableSlots({
      date: '2026-08-16',
      timeZone: CAIRO,
      slotDurationMinutes: 60,
      rules,
    });
    expect(slots).toHaveLength(4);
  });

  describe('midnight crossing', () => {
    // Friday 2026-08-14, 22:00 -> Saturday 2026-08-15 02:00, Cairo time.
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 5, startTime: '22:00', endTime: '02:00', isClosed: false }, // Friday
    ];

    it('a wrapping rule produces slots under the day it *starts* on', () => {
      const slots = computeAvailableSlots({
        date: '2026-08-14', // Friday
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules,
      });
      // 22:00-23:00 and 23:00-00:00 Cairo both start on Friday.
      expect(slots).toHaveLength(2);
      expect(slots[0].startAt.toISOString()).toBe('2026-08-14T19:00:00.000Z'); // 22:00 Cairo
    });

    it('the tail end of a wrapping rule shows up under the *next* day, not duplicated on both', () => {
      const slots = computeAvailableSlots({
        date: '2026-08-15', // Saturday
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules,
      });
      // 00:00-01:00 and 01:00-02:00 Cairo start on Saturday.
      expect(slots).toHaveLength(2);
      expect(slots[0].startAt.toISOString()).toBe('2026-08-14T21:00:00.000Z'); // 00:00 Cairo Sat
      expect(slots[1].endAt.toISOString()).toBe('2026-08-14T23:00:00.000Z'); // 02:00 Cairo Sat
    });

    it('a non-wrapping rule never leaks into the next day', () => {
      const nonWrapping: WeeklyRuleInput[] = [
        { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isClosed: false },
      ];
      const saturdaySlots = computeAvailableSlots({
        date: '2026-08-15',
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules: nonWrapping,
      });
      expect(saturdaySlots).toEqual([]);
    });
  });

  describe('exceptions', () => {
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 0, startTime: '09:00', endTime: '13:00', isClosed: false },
    ];

    it('a closure exception marks overlapping slots unavailable with CLOSED_PERIOD', () => {
      const slots = computeAvailableSlots({
        date: '2026-08-16',
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules,
        exceptions: [
          {
            // 10:00-11:00 Cairo = 07:00-08:00 UTC
            startsAt: new Date('2026-08-16T07:00:00.000Z'),
            endsAt: new Date('2026-08-16T08:00:00.000Z'),
            isClosed: true,
          },
        ],
      });
      const blocked = slots.filter((s) => !s.available);
      expect(blocked).toHaveLength(1);
      expect(blocked[0].reason).toBe('CLOSED_PERIOD');
      expect(blocked[0].startAt.toISOString()).toBe('2026-08-16T07:00:00.000Z');
    });

    it('a closure exception blocks a slot it only partially overlaps', () => {
      const slots = computeAvailableSlots({
        date: '2026-08-16',
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules,
        exceptions: [
          {
            startsAt: new Date('2026-08-16T07:30:00.000Z'), // 10:30 Cairo — mid-slot
            endsAt: new Date('2026-08-16T07:45:00.000Z'),
            isClosed: true,
          },
        ],
      });
      const slot0700 = slots.find((s) => s.startAt.toISOString() === '2026-08-16T07:00:00.000Z');
      expect(slot0700?.available).toBe(false);
    });

    it('a special-hours exception adds availability outside the normal schedule', () => {
      const slots = computeAvailableSlots({
        date: '2026-08-16',
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules,
        exceptions: [
          {
            // 20:00-22:00 Cairo — well after the 09:00-13:00 rule closes
            startsAt: new Date('2026-08-16T17:00:00.000Z'),
            endsAt: new Date('2026-08-16T19:00:00.000Z'),
            isClosed: false,
          },
        ],
      });
      const extra = slots.filter((s) => s.startAt.toISOString() >= '2026-08-16T17:00:00.000Z');
      expect(extra).toHaveLength(2);
      expect(extra.every((s) => s.available)).toBe(true);
    });

    it('an exception outside the requested day does not affect it', () => {
      const slots = computeAvailableSlots({
        date: '2026-08-16',
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules,
        exceptions: [
          {
            startsAt: new Date('2026-08-17T07:00:00.000Z'),
            endsAt: new Date('2026-08-17T08:00:00.000Z'),
            isClosed: true,
          },
        ],
      });
      expect(slots.every((s) => s.available)).toBe(true);
    });
  });

  describe('already-blocked ranges (confirmed bookings, supplied by the caller)', () => {
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 0, startTime: '09:00', endTime: '12:00', isClosed: false },
    ];

    it('marks an overlapping slot BOOKED rather than omitting it', () => {
      const slots = computeAvailableSlots({
        date: '2026-08-16',
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules,
        blockedRanges: [
          {
            startAt: new Date('2026-08-16T07:00:00.000Z'),
            endAt: new Date('2026-08-16T08:00:00.000Z'),
          },
        ],
      });
      expect(slots).toHaveLength(3); // still returned, just flagged
      const booked = slots.find((s) => s.startAt.toISOString() === '2026-08-16T07:00:00.000Z');
      expect(booked?.available).toBe(false);
      expect(booked?.reason).toBe('BOOKED');
    });

    it('a closure exception takes precedence in reason over a coincidental booking overlap', () => {
      const slots = computeAvailableSlots({
        date: '2026-08-16',
        timeZone: CAIRO,
        slotDurationMinutes: 60,
        rules,
        exceptions: [
          {
            startsAt: new Date('2026-08-16T06:00:00.000Z'),
            endsAt: new Date('2026-08-16T07:00:00.000Z'),
            isClosed: true,
          },
        ],
        blockedRanges: [
          {
            startAt: new Date('2026-08-16T06:00:00.000Z'),
            endAt: new Date('2026-08-16T07:00:00.000Z'),
          },
        ],
      });
      expect(slots[0].reason).toBe('CLOSED_PERIOD');
    });
  });

  it('rejects a non-positive slot duration', () => {
    expect(() =>
      computeAvailableSlots({
        date: '2026-08-16',
        timeZone: CAIRO,
        slotDurationMinutes: 0,
        rules: [],
      }),
    ).toThrow();
  });

  it('returns slots in chronological order even when built from overlapping/unordered rules', () => {
    const rules: WeeklyRuleInput[] = [
      { dayOfWeek: 0, startTime: '17:00', endTime: '19:00', isClosed: false },
      { dayOfWeek: 0, startTime: '09:00', endTime: '11:00', isClosed: false },
    ];
    const slots = computeAvailableSlots({
      date: '2026-08-16',
      timeZone: CAIRO,
      slotDurationMinutes: 60,
      rules,
    });
    const times = slots.map((s) => s.startAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
