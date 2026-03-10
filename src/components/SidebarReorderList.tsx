import { useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";

export interface SidebarReorderItem {
  id: string;
  label: string;
  isActive: boolean;
  editLabel: string;
}

interface SidebarReorderListProps {
  items: SidebarReorderItem[];
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

const GripIcon = () => (
  <svg className="grip-icon" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="5" cy="4" r="1.1" />
    <circle cx="11" cy="4" r="1.1" />
    <circle cx="5" cy="8" r="1.1" />
    <circle cx="11" cy="8" r="1.1" />
    <circle cx="5" cy="12" r="1.1" />
    <circle cx="11" cy="12" r="1.1" />
  </svg>
);

const EditIcon = () => (
  <svg className="trash-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="m4 16.5 9.9-9.9 3.5 3.5-9.9 9.9-4.5 1 1-4.5Zm11.3-11.3 1.4-1.4a1.5 1.5 0 0 1 2.1 0l1.4 1.4a1.5 1.5 0 0 1 0 2.1l-1.4 1.4-3.5-3.5Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

const arraysEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const moveItem = (ids: string[], movedId: string, targetIndex: number): string[] => {
  const currentIndex = ids.indexOf(movedId);
  if (currentIndex === -1) return ids;

  const nextIds = [...ids];
  nextIds.splice(currentIndex, 1);

  const adjustedTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const clampedIndex = Math.max(0, Math.min(adjustedTargetIndex, nextIds.length));
  nextIds.splice(clampedIndex, 0, movedId);
  return nextIds;
};

export function SidebarReorderList({
  items,
  onSelect,
  onEdit,
  onReorder
}: SidebarReorderListProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const itemRectsRef = useRef(new Map<string, DOMRect>());
  const didDropRef = useRef(false);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState(itemIds);
  const effectivePreviewIds = draggedId ? previewIds : itemIds;
  const renderedItems = effectivePreviewIds
    .map((id) => itemById.get(id))
    .filter((item): item is SidebarReorderItem => item !== undefined);

  useLayoutEffect(() => {
    const frameIds: number[] = [];
    const nextRects = new Map<string, DOMRect>();

    for (const item of renderedItems) {
      const node = itemRefs.current.get(item.id);
      if (!node) continue;
      const nextRect = node.getBoundingClientRect();
      nextRects.set(item.id, nextRect);

      const previousRect = itemRectsRef.current.get(item.id);
      const deltaY = previousRect ? previousRect.top - nextRect.top : 0;
      if (Math.abs(deltaY) < 1) continue;

      node.style.transition = "none";
      node.style.transform = `translateY(${deltaY}px)`;
      frameIds.push(
        window.requestAnimationFrame(() => {
          node.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
          node.style.transform = "";
        })
      );
    }

    itemRectsRef.current = nextRects;

    return () => {
      frameIds.forEach((frameId) => window.cancelAnimationFrame(frameId));
    };
  }, [renderedItems]);

  const commitOrder = () => {
    if (!arraysEqual(effectivePreviewIds, itemIds)) {
      onReorder(effectivePreviewIds);
    }
    setDraggedId(null);
  };

  const handleDragStart = (itemId: string, event: DragEvent<HTMLButtonElement>) => {
    didDropRef.current = false;
    setDraggedId(itemId);
    setPreviewIds(itemIds);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  };

  const handleDragOver = (itemId: string, event: DragEvent<HTMLLIElement>) => {
    if (!draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const rect = event.currentTarget.getBoundingClientRect();
    const targetIndex = effectivePreviewIds.indexOf(itemId);
    if (targetIndex === -1) return;

    const shouldInsertAfter = event.clientY > rect.top + rect.height / 2;
    const nextIds = moveItem(
      effectivePreviewIds,
      draggedId,
      targetIndex + (shouldInsertAfter ? 1 : 0)
    );
    if (!arraysEqual(effectivePreviewIds, nextIds)) {
      setPreviewIds(nextIds);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>) => {
    if (!draggedId) return;
    event.preventDefault();
    didDropRef.current = true;
    commitOrder();
  };

  const handleDragEnd = () => {
    if (!didDropRef.current) {
      setPreviewIds(itemIds);
    }
    setDraggedId(null);
  };

  return (
    <ul className="list">
      {renderedItems.map((item) => (
        <li
          key={item.id}
          ref={(node) => {
            if (node) {
              itemRefs.current.set(item.id, node);
            } else {
              itemRefs.current.delete(item.id);
            }
          }}
          className={`list-item ${draggedId === item.id ? "is-dragging" : ""}`.trim()}
          onDragOver={(event) => handleDragOver(item.id, event)}
          onDrop={handleDrop}
        >
          <div className="sidebar-item sidebar-item-reorderable">
            <button
              aria-label={`Reorder ${item.label}`}
              className="sidebar-reorder-handle"
              draggable
              onDragEnd={handleDragEnd}
              onDragStart={(event) => handleDragStart(item.id, event)}
              type="button"
            >
              <GripIcon />
            </button>
            <div className="sidebar-select-shell">
              <button
                className={`sidebar-select ${item.isActive ? "active" : ""}`.trim()}
                onClick={() => onSelect(item.id)}
                type="button"
              >
                {item.label}
              </button>
              <button
                aria-label={item.editLabel}
                className="sidebar-item-action"
                onClick={() => onEdit(item.id)}
                type="button"
              >
                <EditIcon />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
