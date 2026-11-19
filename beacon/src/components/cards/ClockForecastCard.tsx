import { format, parseISO } from 'date-fns';
import { ClockWeatherCard } from './ClockWeatherCard';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { getConfig } from '../../config';
import { useDetailedWeatherForecast } from '../../hooks/useDetailedWeatherForecast';
import { weatherIcon, conditionLabel } from '../../types/weather-icons';
import { useTranslation } from '../../i18n';
import '../../styles/clock-forecast.css';

const numeric = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const degrees = (n: unknown) => numeric(n) ? `${Math.round(n)}°` : '—';

export function ClockForecastCard({ config, context }: DashboardCardProps) {
  const { t, dateLocale } = useTranslation();
  const entity = typeof config.entity_id === 'string' && config.entity_id.startsWith('weather.')
    ? config.entity_id : getConfig().weather_entity;
  const { current, forecast, loading, failed } = useDetailedWeatherForecast(entity);
  const attrs = current?.attributes;
  const title = typeof config.title === 'string' && config.title.trim()
    ? config.title : attrs?.friendly_name || t('cards.clockForecast.current');
  const temperatures = forecast.flatMap(d => [d.templow, d.temperature]).filter(numeric);
  const min = Math.min(...temperatures), max = Math.max(...temperatures);
  const span = Math.max(1, max - min);

  return (
    <section className="clock-forecast-card" aria-label={t('cards.clockForecast.displayName')}>
      <ClockWeatherCard config={{}} context={{ ...context, weather: null }} />
      <div className="clock-forecast-panel">
        <div className="clock-forecast-current">
          <div className="clock-forecast-location">{title}</div>
          <div className="clock-forecast-caption">{t('cards.clockForecast.current')}</div>
          {loading ? <p role="status">{t('weatherView.loading')}</p> : failed ? (
            <p role="status">{t('weatherView.fetchFailed')}</p>
          ) : current && (
            <>
              <div className="clock-forecast-reading">
                <span className="clock-forecast-icon" aria-hidden="true">{weatherIcon(current.state)}</span>
                <span className="clock-forecast-temperature">{degrees(attrs?.temperature)}<small>{attrs?.temperature_unit?.replace('°', '')}</small></span>
              </div>
              <div className="clock-forecast-condition">{conditionLabel(current.state, t)}</div>
              <dl className="clock-forecast-details">
                {numeric(attrs?.apparent_temperature) && <div><dt>{t('weatherView.feelsLike')}</dt><dd>{degrees(attrs.apparent_temperature)}</dd></div>}
                {numeric(attrs?.humidity) && <div><dt>{t('weatherView.humidity')}</dt><dd>{Math.round(attrs.humidity)}%</dd></div>}
                {numeric(attrs?.wind_speed) && <div><dt>{t('weatherView.wind')}</dt><dd>{Math.round(attrs.wind_speed)} {attrs.wind_speed_unit}</dd></div>}
              </dl>
            </>
          )}
        </div>
        <div className="clock-forecast-days">
          <h3>{t('cards.clockForecast.forecast')}</h3>
          {!loading && !forecast.length && <p role="status">{t('cards.clockForecast.unavailable')}</p>}
          {forecast.map(day => {
            const low = numeric(day.templow) ? day.templow : day.temperature;
            const high = day.temperature;
            const condition = conditionLabel(day.condition || 'unknown', t);
            return (
              <div className="clock-forecast-day" key={day.datetime}>
                <div className="clock-forecast-day-name"><strong>{format(parseISO(day.datetime), 'EEE', { locale: dateLocale })}</strong><small>{format(parseISO(day.datetime), 'MMM d', { locale: dateLocale })}</small></div>
                <span className="clock-forecast-day-icon" role="img" aria-label={condition} title={condition}>{weatherIcon(day.condition || 'unknown')}</span>
                <span className="clock-forecast-low">{degrees(day.templow)}</span>
                <span className="clock-forecast-range" aria-hidden="true">
                  {numeric(low) && numeric(high) && <span style={{ left: `${(low - min) / span * 100}%`, width: `${Math.max(2, (high - low) / span * 100)}%` }} />}
                </span>
                <strong className="clock-forecast-high">{degrees(high)}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
