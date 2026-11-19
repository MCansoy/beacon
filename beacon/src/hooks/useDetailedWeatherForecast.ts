import { useEffect, useState } from 'react';
import { callHaService, haFetch, hasToken } from '../api/ha-rest';

export interface ForecastDay {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  precipitation_probability?: number;
}
export interface WeatherSnapshot {
  state: string;
  attributes: {
    friendly_name?: string;
    temperature?: number;
    temperature_unit?: string;
    apparent_temperature?: number;
    humidity?: number;
    wind_speed?: number;
    wind_speed_unit?: string;
  };
}

/** Current conditions remain useful even when a provider has no daily forecast. */
export function useDetailedWeatherForecast(entityId: string) {
  const [current, setCurrent] = useState<WeatherSnapshot | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setCurrent(null);
    setForecast([]);
    setLoading(true);
    setFailed(false);
    const refresh = async () => {
      if (!hasToken()) {
        if (!cancelled) { setLoading(false); setFailed(true); }
      } else {
        const [state, days] = await Promise.allSettled([
          haFetch(`/api/states/${encodeURIComponent(entityId)}`),
          callHaService('weather', 'get_forecasts', { entity_id: entityId, type: 'daily' }, true),
        ]);
        if (cancelled) return;
        const snapshot = state.status === 'fulfilled' ? state.value as WeatherSnapshot : null;
        const valid = snapshot?.attributes && !['unknown', 'unavailable'].includes(snapshot.state);
        setCurrent(valid ? snapshot : null);
        setFailed(!valid);
        const response = days.status === 'fulfilled' ? days.value as {
          service_response?: Record<string, { forecast?: ForecastDay[] }>;
          [entity: string]: unknown;
        } : null;
        const result = (response?.service_response ?? response)?.[entityId] as { forecast?: ForecastDay[] } | undefined;
        setForecast(Array.isArray(result?.forecast)
          ? result.forecast.filter(d => typeof d.datetime === 'string' && !Number.isNaN(Date.parse(d.datetime))).slice(0, 5)
          : []);
        setLoading(false);
      }
      if (!cancelled) timer = setTimeout(refresh, 10 * 60 * 1000);
    };
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [entityId]);

  return { current, forecast, loading, failed };
}
