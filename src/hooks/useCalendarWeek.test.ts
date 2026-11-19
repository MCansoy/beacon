import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { useCalendarWeek } from './useCalendarWeek';

describe('visible calendar week', () => {
  it('follows dashboard navigation beyond the originally loaded week and back', () => {
    const calendarWeek = new Date(2026, 10, 15);
    const { result, rerender } = renderHook(({ date, view }) =>
      useCalendarWeek(view, date, calendarWeek, 0),
    { initialProps: { date: new Date(2026, 10, 19), view: 'dashboard' } });
    expect(format(result.current, 'yyyy-MM-dd')).toBe('2026-11-15');
    rerender({ date: new Date(2026, 10, 30), view: 'dashboard' });
    expect(format(result.current, 'yyyy-MM-dd')).toBe('2026-11-29');
    rerender({ date: new Date(2026, 10, 30), view: 'calendar' });
    expect(result.current.getTime()).toBe(calendarWeek.getTime());
    rerender({ date: new Date(2026, 10, 30), view: 'dashboard' });
    expect(format(result.current, 'yyyy-MM-dd')).toBe('2026-11-29');
    rerender({ date: new Date(2026, 10, 19), view: 'dashboard' });
    expect(format(result.current, 'yyyy-MM-dd')).toBe('2026-11-15');
  });

  it('keeps the same reference within a week to avoid unnecessary fetching', () => {
    const { result, rerender } = renderHook(({ date }) =>
      useCalendarWeek('dashboard', date, new Date(2026, 10, 15), 0),
    { initialProps: { date: new Date(2026, 10, 19) } });
    const first = result.current;
    rerender({ date: new Date(2026, 10, 20) });
    expect(result.current).toBe(first);
  });

  it('respects Monday-start calendars across the year boundary', () => {
    const { result } = renderHook(() =>
      useCalendarWeek('dashboard', new Date(2027, 0, 1), new Date(2026, 10, 15), 1));
    expect(format(result.current, 'yyyy-MM-dd')).toBe('2026-12-28');
  });
});
