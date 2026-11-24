import type { City } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { mapDestination, mapDestinations } from './selection';

export function RouteMap({ cities, selectedId, disabled, onSelect }: {
  cities: City[]; selectedId?: string; disabled: boolean; onSelect: (id: string) => void;
}) {
  const groups = mapDestinations.map(destination => ({ ...destination,
    visits: cities.filter(city => mapDestination(city.name) === destination) })).filter(group => group.visits.length);
  return <div className="roteiro-map">
    <div className="roteiro-map-surface">
      <svg viewBox="0 0 760 480" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="roteiro-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".8" fill="#799174" opacity=".4" />
        </pattern></defs>
        <rect width="760" height="480" fill="url(#roteiro-dots)" />
        <path d="M0 0h215q-14 44-82 85T0 244" fill="#c7ded9" />
        <path d="M0 369q130-98 252-8t229 43 279-21v97H0" fill="#d8e0ca" />
        <path d="M405 0q-22 96 66 172t137 50 152-4" stroke="#acbba4" strokeDasharray="5 7" fill="none" />
        <path d="M752 65q-74 28-93 82t-69 124 27 209" stroke="#b2d1ca" strokeWidth="5" fill="none" />
      </svg>
      <span className="roteiro-country be">BÉLGICA</span><span className="roteiro-country nl">PAÍSES BAIXOS</span>
      {groups.map(group => <button key={group.name} className="roteiro-map-stop" disabled={disabled}
        style={{ left: group.x + '%', top: group.y + '%' }}
        aria-pressed={group.visits.some(city => city.id === selectedId)}
        aria-label={`Selecionar ${group.name}${group.visits.length > 1 ? `, ${group.visits.length} passagens` : ''}`}
        onClick={() => onSelect(group.visits.find(city => city.id === selectedId)?.id ?? group.visits[0].id)}>
        <span className="roteiro-map-dot" /><strong>{group.name}</strong>
        {group.visits.length > 1 && <small>{group.visits.length} passagens</small>}
      </button>)}
      {!groups.length && <p className="roteiro-map-empty">Selecione uma parada na lista abaixo.</p>}
    </div>
    <p className="roteiro-map-caption">Mapa esquemático, sem escala. Todas as paradas estão na lista.</p>
    <label className="field roteiro-visit-select">Parada da viagem
      <select value={selectedId ?? ''} disabled={disabled} onChange={event => onSelect(event.target.value)}>
        <option value="" disabled>Escolher uma parada</option>
        {cities.map((city, index) => <option key={city.id} value={city.id}>
          {index + 1}. {visitLabel(cities, city.id)}
        </option>)}
      </select>
    </label>
  </div>;
}
