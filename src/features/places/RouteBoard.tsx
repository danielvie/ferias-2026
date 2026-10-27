import { useState, type ReactNode } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { verticalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Place } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { Icon } from '../../components/Icon';
import { CityVisitCard } from './CityVisitCard';
import { CityChecklists } from './CityChecklists';

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
  const { trip } = snapshot.data;
  const [draggedVisit, setDraggedVisit] = useState<{ id: string; handleOffset: number } | null>(null);
  // Handle-only touch-action:none leaves the rest of the board scrollable.
  // https://docs.dndkit.com/api-documentation/sensors/pointer#touch-action
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function drop({ active: dragged, over }: DragEndEvent) {
    setDraggedVisit(null);
    if (!over || disabled || !canEdit || dragged.id === over.id) return;
    const source = dragged.data.current;
    const target = over.data.current;
    if (!source || !target) return;
    const from = trip.cities.findIndex(city => city.id === source.id);
    const to = trip.cities.findIndex(city => city.id === target.id);
    if (from < 0 || to < 0) return;
    actions.moveVisit(source.id, from < to ? trip.cities[to + 1]?.id ?? null : target.id);
  }

  const activeTitle = trip.cities.find(city => city.id === draggedVisit?.id)?.name;

  return <DndContext sensors={sensors} collisionDetection={collisionDetection}
    onDragStart={({ active }) => {
      const id = active.data.current?.id as string | undefined;
      if (!id) return;
      const handle = document.getElementById(`visit-handle-${id}`);
      const item = handle?.closest('.route-visit-item');
      // The sortable item includes the arriving checklist; offset only the
      // visual overlay so it starts at the handle without moving the drop target.
      // https://docs.dndkit.com/api-documentation/draggable/drag-overlay
      setDraggedVisit({ id, handleOffset: handle && item
        ? handle.getBoundingClientRect().top - item.getBoundingClientRect().top : 0 });
    }}
    onDragCancel={() => setDraggedVisit(null)} onDragEnd={drop}>
    <ol id="places-route" className="places-route" aria-label="Checkpoints in route order">
      <SortableContext items={trip.cities.map(city => `visit:${city.id}`)} strategy={verticalListSortingStrategy}>
        {trip.cities.map((city, index) => <CityVisitCard key={city.id} city={city} index={index}
          activityCount={places.filter(place => place.cityId === city.id).length} selected={selectedId === city.id}
          disabled={disabled} actions={actions} onSelect={onSelect}
          before={snapshot.session.role !== 'family' && <CityChecklists city={city} phase="arriving" disabled={disabled} />}
          after={snapshot.session.role !== 'family' && <CityChecklists city={city} phase="leaving" disabled={disabled} />}>
          {selectedId === city.id && children}
        </CityVisitCard>)}
      </SortableContext>
    </ol>
    <DragOverlay dropAnimation={null}>{draggedVisit && <div className="route-drag-preview" aria-hidden="true"
      style={{ top: draggedVisit.handleOffset }}>
      <Icon name="grip" /><span>{activeTitle}</span>
    </div>}</DragOverlay>
  </DndContext>;
}
