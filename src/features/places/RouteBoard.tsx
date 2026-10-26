import { useState, type ReactNode } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { verticalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Place } from '../../../shared/model';
import { routeDateConflicts } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { CityVisitCard } from './CityVisitCard';

export interface RouteActions {
  moveVisit: (id: string, beforeId: string | null) => void;
  moveActivity: (place: Place, button: HTMLButtonElement) => void;
  insert: (beforeId: string | null, button: HTMLButtonElement) => void;
  addActivity: (draft: Place, button: HTMLButtonElement, onSaved: () => void) => void;
  details: (place: Place, button: HTMLButtonElement) => void;
  edit: (place: Place, button: HTMLButtonElement) => void;
  schedule: (place: Place, button: HTMLButtonElement) => void;
}

// Only city visits are draggable. Pointer drops outside the board cancel;
// keyboard drags use the documented center fallback.
// https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms
const collisionDetection: CollisionDetection = args => {
  return args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
};

export function RouteBoard({ places, selectedId, disabled, actions, onSelect, children }: {
  places: Place[]; selectedId: string | null; disabled: boolean; actions: RouteActions; onSelect: (id: string) => void;
  children?: ReactNode;
}) {
  const { snapshot, canEdit } = useTrip();
  const { trip, events } = snapshot.data;
  const [activeId, setActiveId] = useState<string | null>(null);
  // Handle-only touch-action:none leaves the rest of the board scrollable.
  // https://docs.dndkit.com/api-documentation/sensors/pointer#touch-action
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const conflicts = routeDateConflicts(trip.cities, events);

  function drop({ active: dragged, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || disabled || !canEdit || dragged.id === over.id) return;
    const source = dragged.data.current;
    const target = over.data.current;
    if (!source || !target) return;
    const from = trip.cities.findIndex(city => city.id === source.id);
    const to = trip.cities.findIndex(city => city.id === target.id);
    if (from < 0 || to < 0) return;
    actions.moveVisit(source.id, from < to ? trip.cities[to + 1]?.id ?? null : target.id);
  }

  const activeTitle = trip.cities.find(city => city.id === activeId)?.name;

  return <DndContext sensors={sensors} collisionDetection={collisionDetection}
    onDragStart={({ active }) => setActiveId(active.data.current?.id)}
    onDragCancel={() => setActiveId(null)} onDragEnd={drop}>
    <ol id="places-route" className="places-route" aria-label="Checkpoints in route order">
      <SortableContext items={trip.cities.map(city => `visit:${city.id}`)} strategy={verticalListSortingStrategy}>
        {trip.cities.map((city, index) => <CityVisitCard key={city.id} city={city} index={index}
          activityCount={places.filter(place => place.cityId === city.id).length} selected={selectedId === city.id}
          disabled={disabled} conflict={conflicts.includes(city.id)} actions={actions} onSelect={onSelect}>
          {selectedId === city.id && children}
        </CityVisitCard>)}
      </SortableContext>
    </ol>
    <DragOverlay dropAnimation={null}>{activeId && <div className="route-drag-preview">{activeTitle}</div>}</DragOverlay>
  </DndContext>;
}
