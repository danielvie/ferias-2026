import { useState } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Place } from '../../../shared/model';
import { routeDateConflicts } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { CityVisitCard } from './CityVisitCard';

export interface RouteActions {
  moveVisit: (id: string, beforeId: string | null) => void;
  moveActivity: (id: string, cityId: string, beforeId: string | null) => void;
  insert: (beforeId: string | null, button: HTMLButtonElement) => void;
  addActivity: (cityId: string, button: HTMLButtonElement) => void;
  details: (place: Place, button: HTMLButtonElement) => void;
  edit: (place: Place, button: HTMLButtonElement) => void;
  schedule: (place: Place, button: HTMLButtonElement) => void;
}

// Nested activity targets must win over their enclosing visit. Pointer drops
// outside the board cancel; keyboard drags use the documented center fallback.
// https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms
const collisionDetection: CollisionDetection = args => {
  const kind = args.active.data.current?.kind;
  const candidates = args.droppableContainers.filter(item => item.id !== args.active.id &&
    (kind === 'visit' ? item.data.current?.kind === 'visit' : item.data.current?.kind !== 'visit'));
  const options = { ...args, droppableContainers: candidates };
  if (!args.pointerCoordinates) return closestCenter(options);
  const hits = pointerWithin(options);
  const activityHits = hits.filter(hit => String(hit.id).startsWith('activity:'));
  return activityHits.length ? activityHits : hits;
};

export function RouteBoard({ places, disabled, reorderingDisabled, actions }: {
  places: Place[]; disabled: boolean; reorderingDisabled: boolean; actions: RouteActions;
}) {
  const { snapshot, canEdit } = useTrip();
  const { trip, events } = snapshot.data;
  const [active, setActive] = useState<{ kind: string; id: string } | null>(null);
  // Handle-only touch-action:none leaves the rest of the board scrollable.
  // https://docs.dndkit.com/api-documentation/sensors/pointer#touch-action
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const conflicts = routeDateConflicts(trip.cities, events);

  function drop({ active: dragged, over }: DragEndEvent) {
    setActive(null);
    if (!over || reorderingDisabled || !canEdit || dragged.id === over.id) return;
    const source = dragged.data.current;
    const target = over.data.current;
    if (!source || !target) return;
    if (source.kind === 'visit' && target.kind === 'visit') {
      const from = trip.cities.findIndex(city => city.id === source.id);
      const to = trip.cities.findIndex(city => city.id === target.id);
      actions.moveVisit(source.id, from < to ? trip.cities[to + 1]?.id ?? null : target.id);
    } else if (source.kind === 'activity') {
      const siblings = snapshot.data.places.filter(place => place.cityId === target.cityId);
      const from = siblings.findIndex(place => place.id === source.id);
      const to = siblings.findIndex(place => place.id === target.id);
      const beforeId = target.kind === 'drop' ? null :
        from >= 0 && from < to ? siblings[to + 1]?.id ?? null : target.id;
      actions.moveActivity(source.id, target.cityId, beforeId);
    }
  }

  const activeTitle = active?.kind === 'visit' ? trip.cities.find(city => city.id === active.id)?.name :
    snapshot.data.places.find(place => place.id === active?.id)?.title;

  return <DndContext sensors={sensors} collisionDetection={collisionDetection}
    onDragStart={({ active }) => setActive({ kind: active.data.current?.kind, id: active.data.current?.id })}
    onDragCancel={() => setActive(null)} onDragEnd={drop}>
    <ol className="places-route" aria-label="City visits in route order">
      <SortableContext items={trip.cities.map(city => `visit:${city.id}`)} strategy={rectSortingStrategy}>
        {trip.cities.map((city, index) => <CityVisitCard key={city.id} city={city} index={index}
          places={places.filter(place => place.cityId === city.id)} disabled={disabled}
          reorderingDisabled={reorderingDisabled} conflict={conflicts.includes(city.id)} actions={actions} />)}
      </SortableContext>
    </ol>
    <DragOverlay dropAnimation={null}>{active && <div className="route-drag-preview">{activeTitle}</div>}</DragOverlay>
  </DndContext>;
}
