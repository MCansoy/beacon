import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { haFetch } from '../api/ha-rest';
import { useCalendarEvents } from './useCalendarEvents';

vi.mock('../api/ha-rest', () => ({
  haFetch: vi.fn(), hasToken: () => true, callBeaconAction: vi.fn(),
  BeaconActionError: class extends Error {},
}));

const calendars = [{ entity_id: 'calendar.one', name: 'One' }, { entity_id: 'calendar.two', name: 'Two' }];
const event = (uid: string) => ({ uid, summary: uid, start: { date: '2026-11-30' }, end: { date: '2026-12-01' } });
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => vi.resetAllMocks());

describe('calendar event requests', () => {
  it('starts calendars concurrently and preserves calendar identity', async () => {
    const first = deferred();
    vi.mocked(haFetch).mockImplementation(async (path) => {
      if (path === '/api/calendars') return calendars;
      if (path.includes('calendar.one')) return first.promise;
      return [event('second')];
    });
    const { result } = renderHook(() => useCalendarEvents(true));
    await act(async () => { await result.current.fetchCalendars(); });
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.fetchEvents('2026-11-29', '2026-12-07'); });
    expect(haFetch).toHaveBeenCalledWith(expect.stringContaining('calendar.two?'), expect.anything());
    expect(result.current.loading).toBe(true);
    await act(async () => { first.resolve([event('first')]); await pending; });
    expect(result.current.events.map(e => e.calendarId)).toEqual(['calendar.one', 'calendar.two']);
    expect(result.current.loading).toBe(false);
  });

  it('ignores late results even when the transport ignores abort', async () => {
    const old = deferred();
    let oldSignal: AbortSignal | null | undefined;
    vi.mocked(haFetch).mockImplementation(async (path, options) => {
      if (path === '/api/calendars') return calendars.slice(0, 1);
      if (path.includes('start=old')) { oldSignal = options?.signal; return old.promise; }
      return [event('new')];
    });
    const { result } = renderHook(() => useCalendarEvents(true));
    await act(async () => { await result.current.fetchCalendars(); });
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.fetchEvents('old', 'end'); });
    await act(async () => { await result.current.fetchEvents('new', 'end'); });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { old.resolve([event('old')]); await pending; });
    expect(result.current.events.map(e => e.id)).toEqual(['new']);
  });

  it('does not let an old completion clear the current loading state', async () => {
    const old = deferred(), next = deferred();
    vi.mocked(haFetch).mockImplementation(async (path) => {
      if (path === '/api/calendars') return calendars.slice(0, 1);
      return path.includes('start=old') ? old.promise : next.promise;
    });
    const { result } = renderHook(() => useCalendarEvents(true));
    await act(async () => { await result.current.fetchCalendars(); });
    let a!: Promise<void>, b!: Promise<void>;
    await act(async () => { a = result.current.fetchEvents('old', 'end'); });
    await act(async () => { b = result.current.fetchEvents('next', 'end'); });
    await act(async () => { old.resolve([]); await a; });
    expect(result.current.loading).toBe(true);
    await act(async () => { next.resolve([]); await b; });
    expect(result.current.loading).toBe(false);
  });

  it('cancels in-flight event requests on unmount', async () => {
    const pending = deferred();
    let signal: AbortSignal | null | undefined;
    vi.mocked(haFetch).mockImplementation(async (path, options) => {
      if (path === '/api/calendars') return calendars.slice(0, 1);
      signal = options?.signal;
      return pending.promise;
    });
    const { result, unmount } = renderHook(() => useCalendarEvents(true));
    await act(async () => { await result.current.fetchCalendars(); });
    let request!: Promise<void>;
    await act(async () => { request = result.current.fetchEvents('start', 'end'); });
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve([]); await request; });
  });
});
