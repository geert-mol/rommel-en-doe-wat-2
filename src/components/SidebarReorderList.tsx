import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";

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

export function SidebarReorderList({
  items,
  onSelect,
  onEdit,
  onReorder
}: SidebarReorderListProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const itemRectsRef = useRef(new Map<string, DOMRect>());
  const dragPointerIdRef = useRef<number | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const effectivePreviewIds = previewIds ?? itemIds;
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

  useEffect(() => {
    if (!draggedId) return;

    const getNextPreviewIds = (clientY: number): string[] => {
      const currentIds = previewIds ?? itemIds;
      const remainingIds = currentIds.filter((id) => id !== draggedId);
      let insertIndex = remainingIds.length;

      for (const [index, itemId] of remainingIds.entries()) {
        const rect = itemRefs.current.get(itemId)?.getBoundingClientRect();
        if (!rect) continue;
        if (clientY < rect.top + rect.height / 2) {
          insertIndex = index;
          break;
        }
      }

      return [
        ...remainingIds.slice(0, insertIndex),
        draggedId,
        ...remainingIds.slice(insertIndex)
      ];
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      const nextIds = getNextPreviewIds(event.clientY);
      setPreviewIds((currentPreviewIds) => {
        const resolvedCurrentIds = currentPreviewIds ?? itemIds;
        return arraysEqual(resolvedCurrentIds, nextIds) ? currentPreviewIds : nextIds;
      });
    };

    const finishDrag = (shouldCommit: boolean) => {
      const pointerId = dragPointerIdRef.current;
      if (pointerId !== null && dragHandleRef.current?.hasPointerCapture(pointerId)) {
        dragHandleRef.current.releasePointerCapture(pointerId);
      }

      if (shouldCommit && !arraysEqual(previewIds ?? itemIds, itemIds)) {
        onReorder(previewIds ?? itemIds);
      }

      dragPointerIdRef.current = null;
      setPreviewIds(null);
      setDraggedId(null);
      dragHandleRef.current = null;
    };

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      finishDrag(true);
    };

    const handlePointerCancel = (event: globalThis.PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      finishDrag(false);
    };

    const handleWindowBlur = () => {
      finishDrag(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [draggedId, itemIds, onReorder, previewIds]);

  const handlePointerDown = (
    itemId: string,
    event: PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    dragPointerIdRef.current = event.pointerId;
    dragHandleRef.current = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedId(itemId);
    setPreviewIds(itemIds);
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
        >
          <div className="sidebar-item sidebar-item-reorderable">
            <button
              aria-label={`Reorder ${item.label}`}
              className="sidebar-reorder-handle"
              onPointerDown={(event) => handlePointerDown(item.id, event)}
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
