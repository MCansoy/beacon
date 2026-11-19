import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPhotos } from '../api/photos';
import { usePhotos } from './usePhotos';
vi.mock('../api/photos', () => ({ getPhotos: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe('photo list refresh', () => {
  it('discovers uploads and renews signed URLs without a page reload', async () => {
    vi.useFakeTimers();
    vi.mocked(getPhotos).mockResolvedValueOnce([]).mockResolvedValueOnce([{ url: '/photo?authSig=first', source: 'local' }])
      .mockResolvedValueOnce([{ url: '/photo?authSig=renewed', source: 'local' }]);
    const { result, unmount } = renderHook(() => usePhotos(['local']));
    await act(async () => {});
    expect(result.current.photoCount).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.currentPhoto?.url).toContain('first');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.currentPhoto?.url).toContain('renewed');
    unmount();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(getPhotos).toHaveBeenCalledTimes(3);
  });

  it('does not start overlapping refreshes while HA is slow', async () => {
    vi.useFakeTimers();
    vi.mocked(getPhotos).mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => usePhotos(['local']));
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(getPhotos).toHaveBeenCalledTimes(1);
    unmount();
  });
});
