import { useRef, useState } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ChecklistItem } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { Icon } from '../../components/Icon';
import { CompactChecklistItem } from './CompactChecklistItem';

const collisionDetection: CollisionDetection = args =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

/** One context per completion section prevents a reorder from changing status.
 * https://docs.dndkit.com/presets/sortable
 */
export function ChecklistItems({ checklistId, items, label, disabled, onDirtyChange }: {
  checklistId: string;
  items: ChecklistItem[];
  label: string;
  disabled: boolean;
  onDirtyChange: (id: string, dirty: boolean) => void;
}) {
  const { command, canEdit } = useTrip();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const moving = useRef(false);
  const list = useRef<HTMLUListElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const active = items.find(item => item.id === activeId);
  const title = (id: string | number) => items.find(item => item.id === id)?.title ?? 'Item';

  async function move(from: number, to: number) {
    if (!canEdit || disabled || moving.current || from < 0 || to < 0 || to >= items.length || from === to) return;
    const item = items[from];
    const beforeId = from < to ? items[to + 1]?.id ?? null : items[to].id;
    moving.current = true;
    setFailed(false);
    try {
      const saved = await command({ type: 'checklist.item.move', checklistId, id: item.id, beforeId });
      setFailed(!saved);
    } finally {
      moving.current = false;
      requestAnimationFrame(() => document.getElementById(`checklist-handle-${checklistId}-${item.id}`)?.focus({ preventScroll: true }));
    }
  }

  function drop({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    void move(items.findIndex(item => item.id === active.id), items.findIndex(item => item.id === over.id));
  }

  return <DndContext sensors={sensors} collisionDetection={collisionDetection}
    accessibility={{
      screenReaderInstructions: { draggable: 'Press Space to pick up an item, Up or Down to reorder, Space to drop, or Escape to cancel. Reordering stays within this section.' },
      announcements: {
        onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
        onDragOver: ({ active, over }) => over ? `${title(active.id)}, position ${items.findIndex(item => item.id === over.id) + 1} of ${items.length}.` : 'Outside this checklist section. Drop to cancel.',
        onDragEnd: ({ active, over }) => over ? `Dropped ${title(active.id)}. Saving the new order.` : 'Reordering cancelled.',
        onDragCancel: () => 'Reordering cancelled. Saved order is unchanged.',
      },
    }}
    onDragStart={({ active }) => {
      setFailed(false);
      setActiveId(String(active.id));
      list.current?.querySelectorAll<HTMLDetailsElement>('.compact-item-options[open]').forEach(menu => { menu.open = false; });
    }}
    onDragCancel={() => setActiveId(null)} onDragEnd={drop}>
    <ul ref={list} className="compact-checklist-items" aria-label={label}>
      <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => <CompactChecklistItem key={item.id} checklistId={checklistId} item={item}
          sortingDisabled={disabled} first={index === 0} last={index === items.length - 1}
          onMove={direction => { void move(index, index + (direction === 'up' ? -1 : 1)); }}
          onDirtyChange={onDirtyChange} />)}
      </SortableContext>
    </ul>
    <DragOverlay dropAnimation={null}>{active && <div className="checklist-drag-preview" aria-hidden="true">
      <Icon name="grip" /><span>{active.title}</span>
    </div>}</DragOverlay>
    {failed && <p className="checklist-save-error" role="status">Couldn't save the new order. The saved order is shown; try moving the item again.</p>}
  </DndContext>;
}
