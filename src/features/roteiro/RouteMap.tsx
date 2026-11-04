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

export function CityIllustration() {
  return <svg className="roteiro-illustration" viewBox="0 0 300 180" aria-hidden="true">
    <circle cx="234" cy="40" r="25" fill="#e7bd60" />
    <path d="M10 145h280v35H10z" fill="#a8c7be" />
    <g stroke="#395346" strokeWidth="2.5" strokeLinejoin="round">
      <path d="M32 145V72l30-28 30 28v73" fill="#cc8668" />
      <path d="M98 145V90l32-25 32 25v55" fill="#e9c786" />
      <path d="M170 145V52l27-28 27 28v93" fill="#d6dcc5" />
      <path d="M230 145V93l23-20 24 20v52" fill="#bb9679" />
      <path d="M190 29V10h14v19M47 83h10v18H47zm24 0h10v18H71zm41 18h10v18h-10zm25 0h10v18h-10zm46-37h9v18h-9zm21 0h9v18h-9zm-21 34h9v18h-9zm21 0h9v18h-9zm38 6h9v17h-9zm17 0h9v17h-9z" fill="#425e4f" />
      <path d="M6 145h288M69 164h62l-10 12H80z" fill="#bd7654" />
    </g>
  </svg>;
}
