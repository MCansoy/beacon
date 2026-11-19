import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callHaService, haFetch } from '../api/ha-rest';
import { useDetailedWeatherForecast } from './useDetailedWeatherForecast';
vi.mock('../api/ha-rest', () => ({ haFetch: vi.fn(), callHaService: vi.fn(), hasToken: () => true }));
beforeEach(() => vi.resetAllMocks());
const state = { state: 'sunny', attributes: { temperature: 20, temperature_unit: '°C', wind_speed: 12, wind_speed_unit: 'km/h' } };

describe('detailed weather card data', () => {
  it('uses HA-provided units and reads the forecast service response', async () => {
    vi.mocked(haFetch).mockResolvedValue(state);
    const days = Array.from({ length: 7 }, (_, i) => ({ datetime: `2026-11-${20+i}T12:00:00Z`, temperature: 20+i, templow: 10 }));
    vi.mocked(callHaService).mockResolvedValue({ service_response: { 'weather.home': { forecast: days } } });
    const { result } = renderHook(() => useDetailedWeatherForecast('weather.home'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.current?.attributes.temperature_unit).toBe('°C');
    expect(result.current.current?.attributes.wind_speed_unit).toBe('km/h');
    expect(result.current.forecast).toHaveLength(5);
    expect(callHaService).toHaveBeenCalledWith('weather', 'get_forecasts', { entity_id: 'weather.home', type: 'daily' }, true);
  });

  it('retains current weather when the provider does not support daily forecasts', async () => {
    vi.mocked(haFetch).mockResolvedValue(state);
    vi.mocked(callHaService).mockRejectedValue(new Error('unsupported'));
    const { result } = renderHook(() => useDetailedWeatherForecast('weather.home'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(false);
    expect(result.current.current).toEqual(state);
    expect(result.current.forecast).toEqual([]);
  });

  it('does not turn an unavailable sensor into zero-degree weather', async () => {
    vi.mocked(haFetch).mockResolvedValue({ state: 'unavailable', attributes: {} });
    vi.mocked(callHaService).mockResolvedValue({});
    const { result } = renderHook(() => useDetailedWeatherForecast('weather.home'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.current).toBeNull();
  });

  it('ignores a late response after changing weather entities', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(haFetch).mockImplementation(path => path.includes('old') ? new Promise(r => { resolve = r; }) : Promise.resolve(state));
    vi.mocked(callHaService).mockResolvedValue({});
    const { result, rerender } = renderHook(({ entity }) => useDetailedWeatherForecast(entity), { initialProps: { entity: 'weather.old' } });
    rerender({ entity: 'weather.home' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { resolve({ state: 'rainy', attributes: { temperature: 5 } }); });
    expect(result.current.current).toEqual(state);
  });
});
