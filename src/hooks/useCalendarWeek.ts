import { useMemo } from 'react';
import { startOfWeek } from 'date-fns';

/** Keep each view's navigation independent, but fetch the visible view's week. */
export function useCalendarWeek(
  activeView: string,
  dashboardDate: Date,
  calendarWeek: Date,
  weekStartsOn: 0 | 1,
) {
  const timestamp = activeView === 'dashboard'
    ? startOfWeek(dashboardDate, { weekStartsOn }).getTime()
    : calendarWeek.getTime();
  // Same-week day navigation should not restart requests or the polling timer.
  return useMemo(() => new Date(timestamp), [timestamp]);
}
