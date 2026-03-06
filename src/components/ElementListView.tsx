import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { isDesktopApp, openFilePath, revealFilePath } from "../lib/desktop";
import {
  buildSuggestedFilePath,
  formatVersionLabel,
  generateFileName
} from "../lib/filename";
import type {
  EngineeringElement,
  Product,
  Project,
  ReleaseState
} from "../lib/types";
import { RELEASE_STATES } from "../lib/types";
import { byVersionDesc, latestVersion } from "../lib/versioning";

interface ElementListViewProps {
  elements: EngineeringElement[];
  project: Project;
  product: Product;
  defaultRootPath: string;
  onAddConcept: (elementId: string) => void;
  onAddVersion: (elementId: string, conceptId: string, kind: "major" | "minor") => void;
  onDeleteVersion: (elementId: string, conceptId: string, versionId: string) => void;
  onSetElementParent: (elementId: string, parentElementId?: string) => void;
  onSetReleaseState: (
    elementId: string,
    conceptId: string,
    versionId: string,
    releaseState: ReleaseState
  ) => void;
}

interface RowModel {
  rowIndex: number;
  element: EngineeringElement;
  concept: EngineeringElement["concepts"][number];
  version: EngineeringElement["concepts"][number]["versions"][number];
  fileName: string;
  realPath: string;
  parentLabel: string;
  depth: number;
  conceptIndex: number;
  conceptCount: number;
  parentRowIndex: number | null;
}

interface PendingDelete {
  elementId: string;
  conceptId: string;
  versionId: string;
  message: string;
}

interface ParentEditState {
  elementId: string;
  selectedParentId: string;
}

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface OpenMenuState {
  id: string;
  left: number;
  top: number;
  items: MenuItem[];
}

type GraphSegment =
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
    }
  | {
      kind: "path";
      d: string;
      color: string;
    };

const LANE_COLORS = ["#2f5c8a", "#d9481f", "#6c8d2a", "#137f8a", "#8a5ca1", "#7a6f3a"];
const LANE_STEP = 18;
const GRAPH_PAD = 9;
const ROW_HEIGHT = 26;
const ROW_HALF = ROW_HEIGHT / 2;
const STROKE_OVERLAP = 2.5;

const laneColor = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length];

const xForLane = (lane: number): number => GRAPH_PAD + lane * LANE_STEP + 6;

const copyToClipboard = async (value: string): Promise<void> => {
  await navigator.clipboard.writeText(value);
};

const revealPathWithFeedback = async (targetPath: string): Promise<void> => {
  const didReveal = await revealFilePath(targetPath);
  if (didReveal) return;

  await copyToClipboard(targetPath);
  window.alert("File not found. Full path copied to clipboard.");
};

const KebabMenu = ({
  menuId,
  items,
  onOpen
}: {
  menuId: string;
  items: MenuItem[];
  onOpen: (menuId: string, items: MenuItem[], trigger: HTMLElement) => void;
}) => (
  <button
    className="kebab-trigger"
    aria-label="More actions"
    onClick={(event) => {
      event.stopPropagation();
      onOpen(menuId, items, event.currentTarget);
    }}
    type="button"
  >
    <span className="kebab-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  </button>
);

const sortElements = (a: EngineeringElement, b: EngineeringElement): number => {
  if (a.partNumber !== b.partNumber) {
    return a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true });
  }
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.descriptionSlug.localeCompare(b.descriptionSlug);
};

const buildElementOrder = (elements: EngineeringElement[]) => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const childMap = new Map<string | undefined, EngineeringElement[]>();

  for (const element of elements) {
    const hasKnownParent = element.parentElementId ? byId.has(element.parentElementId) : false;
    const key = hasKnownParent ? element.parentElementId : undefined;
    const bucket = childMap.get(key) ?? [];
    bucket.push(element);
    childMap.set(key, bucket);
  }

  for (const [, children] of childMap) {
    children.sort(sortElements);
  }

  const ordered: Array<{ element: EngineeringElement; depth: number }> = [];

  const visit = (parentId: string | undefined, depth: number) => {
    for (const child of childMap.get(parentId) ?? []) {
      ordered.push({ element: child, depth });
      visit(child.id, depth + 1);
    }
  };

  visit(undefined, 0);
  return ordered;
};

const collectDescendantIds = (elements: EngineeringElement[], elementId: string): Set<string> => {
  const childMap = new Map<string, string[]>();
  for (const element of elements) {
    if (!element.parentElementId) continue;
    const bucket = childMap.get(element.parentElementId) ?? [];
    bucket.push(element.id);
    childMap.set(element.parentElementId, bucket);
  }

  const result = new Set<string>();
  const stack = [...(childMap.get(elementId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || result.has(current)) continue;
    result.add(current);
    stack.push(...(childMap.get(current) ?? []));
  }
  return result;
};

const buildCurve = (fromX: number, toX: number): string => {
  const delta = toX - fromX;
  const c1x = fromX + delta * 0.35;
  const c2x = fromX + delta * 0.85;
  const c1y = ROW_HALF + 1;
  const c2y = ROW_HEIGHT - 1 + STROKE_OVERLAP;
  return `M ${fromX} ${ROW_HALF} C ${c1x} ${c1y} ${c2x} ${c2y} ${toX} ${ROW_HEIGHT + STROKE_OVERLAP}`;
};

const buildGraph = (rows: RowModel[], maxDepth: number): GraphSegment[][] => {
  const segmentsByRow = rows.map(() => [] as GraphSegment[]);

  const pushLine = (
    rowIndex: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string
  ) => {
    segmentsByRow[rowIndex].push({ kind: "line", x1, y1, x2, y2, color });
  };

  const pushPath = (rowIndex: number, d: string, color: string) => {
    segmentsByRow[rowIndex].push({ kind: "path", d, color });
  };

  for (const row of rows) {
    if (row.parentRowIndex === null) continue;

    const sourceRow = rows[row.parentRowIndex];
    const sourceX = xForLane(sourceRow.depth);
    const targetX = xForLane(row.depth);
    const color = laneColor(row.depth);
    const span = row.rowIndex - sourceRow.rowIndex;

    if (span <= 0) continue;

    if (sourceX === targetX) {
      pushLine(
        sourceRow.rowIndex,
        sourceX,
        ROW_HALF,
        sourceX,
        ROW_HEIGHT + STROKE_OVERLAP,
        color
      );
    } else {
      pushPath(sourceRow.rowIndex, buildCurve(sourceX, targetX), color);
    }

    for (let i = sourceRow.rowIndex + 1; i < row.rowIndex; i += 1) {
      pushLine(i, targetX, -STROKE_OVERLAP, targetX, ROW_HEIGHT + STROKE_OVERLAP, color);
    }

    pushLine(row.rowIndex, targetX, -STROKE_OVERLAP, targetX, ROW_HALF, color);
  }

  const width = (maxDepth + 1) * LANE_STEP + GRAPH_PAD * 2;
  if (width > 0) {
    return segmentsByRow;
  }
  return segmentsByRow;
};

const BranchGraphCell = ({
  row,
  maxDepth,
  segments
}: {
  row: RowModel;
  maxDepth: number;
  segments: GraphSegment[];
}) => {
  const width = (maxDepth + 1) * LANE_STEP + GRAPH_PAD * 2;
  const x = xForLane(row.depth);
  const color = laneColor(row.depth);
  const isPrimaryConcept = row.conceptIndex === 0;
  const isMotherModel = row.element.type === "MM";
  const isAssemblyNode = row.element.type === "HA" || row.element.type === "SA";
  const radius = isPrimaryConcept ? 4 : 3;
  const isLargeNode = isAssemblyNode || isMotherModel;
  const nodeRadius = isLargeNode ? radius + 1 : radius;
  const nodeFill = isAssemblyNode ? "#ffffff" : color;
  const nodeStroke = isAssemblyNode
    ? color
    : isMotherModel
      ? color
      : "rgba(255,255,255,0.92)";
  const nodeStrokeWidth = isLargeNode ? 2.2 : 1.3;

  return (
    <div className="branch-graph" style={{ width, height: ROW_HEIGHT }}>
      <svg className="branch-svg" width={width} height={ROW_HEIGHT} viewBox={`0 0 ${width} ${ROW_HEIGHT}`}>
        {segments.map((segment, index) =>
          segment.kind === "line" ? (
            <line
              key={`l-${index}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={segment.color}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.92}
            />
          ) : (
            <path
              key={`p-${index}`}
              d={segment.d}
              fill="none"
              stroke={segment.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          )
        )}

        <circle
          cx={x}
          cy={ROW_HALF}
          r={nodeRadius}
          fill={nodeFill}
          stroke={nodeStroke}
          strokeWidth={nodeStrokeWidth}
        />
      </svg>
    </div>
  );
};

export const ElementListView = ({
  elements,
  project,
  product,
  defaultRootPath,
  onAddConcept,
  onAddVersion,
  onDeleteVersion,
  onSetElementParent,
  onSetReleaseState
}: ElementListViewProps) => {
  const [historyElementId, setHistoryElementId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [parentEdit, setParentEdit] = useState<ParentEditState | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenuState | null>(null);
  const desktopApp = isDesktopApp();

  const { rows, maxDepth, segmentsByRow } = useMemo(() => {
    const ordered = buildElementOrder(elements);
    const parentMap = new Map(elements.map((element) => [element.id, element]));
    const primaryRowByElement = new Map<string, number>();
    const rowsDraft: RowModel[] = [];

    for (const { element, depth } of ordered) {
      const concepts = [...element.concepts].sort((a, b) => a.conceptCode.localeCompare(b.conceptCode));

      concepts.forEach((concept, conceptIndex) => {
        const version = latestVersion(concept);
        const fileName = generateFileName({
          state: version.releaseState,
          projectCode: project.projectId,
          productCode: product.productId,
          conceptCode: concept.conceptCode,
          type: element.type,
          partNumber: element.partNumber,
          descriptionSlug: element.descriptionSlug,
          majorVersion: version.majorVersion,
          minorVersion: version.minorVersion
        });
        const realPath = buildSuggestedFilePath(fileName, element, project, product, defaultRootPath);
        const parent = element.parentElementId ? parentMap.get(element.parentElementId) : undefined;
        const rowIndex = rowsDraft.length;

        rowsDraft.push({
          rowIndex,
          element,
          concept,
          version,
          fileName,
          realPath,
          parentLabel: parent ? `${parent.type}-${parent.partNumber}` : "ROOT",
          depth,
          conceptIndex,
          conceptCount: concepts.length,
          parentRowIndex: null
        });

        if (conceptIndex === 0) {
          primaryRowByElement.set(element.id, rowIndex);
        }
      });
    }

    const rowsResolved = rowsDraft.map((row) => {
      if (row.conceptIndex > 0) {
        return { ...row, parentRowIndex: row.rowIndex - 1 };
      }

      const parentId = row.element.parentElementId;
      if (!parentId) return row;
      const parentRowIndex = primaryRowByElement.get(parentId) ?? null;
      return { ...row, parentRowIndex };
    });

    const maxDepthValue = rowsResolved.reduce((max, row) => Math.max(max, row.depth), 0);
    const segments = buildGraph(rowsResolved, maxDepthValue);

    return {
      rows: rowsResolved,
      maxDepth: maxDepthValue,
      segmentsByRow: segments
    };
  }, [defaultRootPath, elements, product, project]);

  const historyElement = useMemo(
    () => elements.find((element) => element.id === historyElementId) ?? null,
    [elements, historyElementId]
  );

  const historyRows = useMemo(() => {
    if (!historyElement) return [];

    return [...historyElement.concepts]
      .sort((a, b) => a.conceptCode.localeCompare(b.conceptCode))
      .flatMap((concept) =>
        [...concept.versions].sort(byVersionDesc).map((version) => {
          const fileName = generateFileName({
            state: version.releaseState,
            projectCode: project.projectId,
            productCode: product.productId,
            conceptCode: concept.conceptCode,
            type: historyElement.type,
            partNumber: historyElement.partNumber,
            descriptionSlug: historyElement.descriptionSlug,
            majorVersion: version.majorVersion,
            minorVersion: version.minorVersion
          });

          return {
            conceptId: concept.id,
            versionId: version.id,
            conceptCode: concept.conceptCode,
            versionLabel: formatVersionLabel(version.majorVersion, version.minorVersion),
            releaseState: version.releaseState,
            createdAt: version.createdAt,
            fileName,
            realPath: buildSuggestedFilePath(
              fileName,
              historyElement,
              project,
              product,
              defaultRootPath
            )
          };
        })
      );
  }, [defaultRootPath, historyElement, product, project]);

  const parentEditElement = useMemo(
    () => elements.find((element) => element.id === parentEdit?.elementId) ?? null,
    [elements, parentEdit?.elementId]
  );

  const parentOptions = useMemo(() => {
    if (!parentEditElement) return [];
    const descendantIds = collectDescendantIds(elements, parentEditElement.id);
    return elements
      .filter((candidate) => {
        if (candidate.id === parentEditElement.id) return false;
        if (descendantIds.has(candidate.id)) return false;
        return candidate.type === "HA" || candidate.type === "SA" || candidate.type === "MM";
      })
      .sort(sortElements);
  }, [elements, parentEditElement]);

  if (rows.length === 0) {
    return <p className="empty">No rows yet. List appears when elements are added.</p>;
  }

  const requestDelete = (
    elementId: string,
    conceptId: string,
    versionId: string,
    message: string
  ) => {
    setPendingDelete({ elementId, conceptId, versionId, message });
    setOpenMenu(null);
  };

  const openKebabMenu = (menuId: string, items: MenuItem[], trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    const panelWidth = 156;
    const left = Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 8));
    setOpenMenu({
      id: menuId,
      left,
      top,
      items
    });
  };

  const historyModal = historyElement ? (
    <div className="history-backdrop" onClick={() => setHistoryElementId(null)} role="presentation">
      <section
        className="history-modal"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
      >
        <header className="history-header">
          <h3>
            {historyElement.type} {historyElement.partNumber} - {historyElement.descriptionSlug}
          </h3>
          <button className="mini-btn" onClick={() => setHistoryElementId(null)} type="button">
            Close
          </button>
        </header>
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Concept</th>
                <th>Version</th>
                <th>State</th>
                <th>Filename</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((historyRow) => (
                <tr key={`${historyRow.conceptCode}-${historyRow.versionLabel}-${historyRow.createdAt}`}>
                  <td>{historyRow.conceptCode}</td>
                  <td>{historyRow.versionLabel}</td>
                  <td>{historyRow.releaseState}</td>
                  <td className="mono-cell" title={historyRow.fileName}>
                    {historyRow.fileName}
                  </td>
                  <td>{new Date(historyRow.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="dense-actions">
                      <KebabMenu
                        menuId={`history-${historyRow.conceptId}-${historyRow.versionId}`}
                        items={[
                          {
                            label: "Copy name",
                            onClick: () => void copyToClipboard(historyRow.fileName)
                          },
                          ...(desktopApp
                            ? [
                                {
                                  label: "Open path",
                                  onClick: () => void openFilePath(historyRow.realPath)
                                },
                                {
                                  label: "Reveal folder",
                                  onClick: () => void revealPathWithFeedback(historyRow.realPath)
                                }
                              ]
                            : []),
                          {
                            label: "Copy path",
                            onClick: () => void copyToClipboard(historyRow.realPath)
                          },
                          {
                            label: "Delete",
                            danger: true,
                            onClick: () => {
                              if (!historyElement) return;
                              requestDelete(
                                historyElement.id,
                                historyRow.conceptId,
                                historyRow.versionId,
                                "Delete this version?"
                              );
                            }
                          }
                        ]}
                        onOpen={openKebabMenu}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  ) : null;

  const confirmModal = pendingDelete ? (
    <div className="confirm-backdrop" onClick={() => setPendingDelete(null)} role="presentation">
      <section
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <p className="confirm-title">Confirm Delete</p>
        <p className="confirm-message">{pendingDelete.message}</p>
        <div className="confirm-actions">
          <button className="mini-btn" onClick={() => setPendingDelete(null)} type="button">
            Cancel
          </button>
          <button
            className="mini-btn danger-mini"
            onClick={() => {
              onDeleteVersion(
                pendingDelete.elementId,
                pendingDelete.conceptId,
                pendingDelete.versionId
              );
              setPendingDelete(null);
            }}
            type="button"
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  ) : null;

  const parentModal = parentEdit && parentEditElement ? (
    <div className="confirm-backdrop" onClick={() => setParentEdit(null)} role="presentation">
      <section
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <p className="confirm-title">Change Parent</p>
        <p className="confirm-message">
          {parentEditElement.type} {parentEditElement.partNumber} - {parentEditElement.descriptionSlug}
        </p>
        <label className="parent-select-label">
          New parent
          <select
            value={parentEdit.selectedParentId}
            onChange={(event) =>
              setParentEdit((prev) =>
                prev ? { ...prev, selectedParentId: event.target.value } : prev
              )
            }
          >
            <option value="">(root)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.type} {option.partNumber} {option.descriptionSlug}
              </option>
            ))}
          </select>
        </label>
        <div className="confirm-actions">
          <button className="mini-btn" onClick={() => setParentEdit(null)} type="button">
            Cancel
          </button>
          <button
            className="mini-btn"
            onClick={() => {
              onSetElementParent(parentEdit.elementId, parentEdit.selectedParentId || undefined);
              setParentEdit(null);
            }}
            type="button"
          >
            Save
          </button>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="branch-head">Tree</th>
              <th>Parent</th>
              <th>Type</th>
              <th>Part</th>
              <th>Description</th>
              <th>Concept</th>
              <th>Version</th>
              <th>State</th>
              <th>Filename</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.version.id}>
                <td className="branch-cell">
                  <BranchGraphCell
                    row={row}
                    maxDepth={maxDepth}
                    segments={segmentsByRow[row.rowIndex] ?? []}
                  />
                </td>
                <td>{row.parentLabel}</td>
                <td>{row.element.type}</td>
                <td>{row.element.partNumber}</td>
                <td>{row.element.descriptionSlug}</td>
                <td>{row.concept.conceptCode}</td>
                <td>{formatVersionLabel(row.version.majorVersion, row.version.minorVersion)}</td>
                <td>
                  <select
                    className="table-select"
                    value={row.version.releaseState}
                    onChange={(event) =>
                      onSetReleaseState(
                        row.element.id,
                        row.concept.id,
                        row.version.id,
                        event.target.value as ReleaseState
                      )
                    }
                  >
                    {RELEASE_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="mono-cell" title={row.fileName}>
                  {row.fileName}
                </td>
                <td>{new Date(row.version.createdAt).toLocaleDateString()}</td>
                <td>
                  <div className="dense-actions">
                    {desktopApp && (
                      <button
                        className="mini-btn"
                        onClick={() => void revealPathWithFeedback(row.realPath)}
                        type="button"
                      >
                        Reveal
                      </button>
                    )}
                    <button
                      className="mini-btn"
                      onClick={() => onAddConcept(row.element.id)}
                      type="button"
                    >
                      +Concept
                    </button>
                    <button
                      className="mini-btn"
                      onClick={() => onAddVersion(row.element.id, row.concept.id, "major")}
                      type="button"
                    >
                      +Major
                    </button>
                    <button
                      className="mini-btn"
                      onClick={() => onAddVersion(row.element.id, row.concept.id, "minor")}
                      type="button"
                    >
                      +Minor
                    </button>
                    <KebabMenu
                      menuId={`grid-${row.element.id}-${row.concept.id}-${row.version.id}`}
                      items={[
                        {
                          label: "Copy name",
                          onClick: () => void copyToClipboard(row.fileName)
                        },
                        {
                          label: "Copy path",
                          onClick: () => void copyToClipboard(row.realPath)
                        },
                        ...(row.conceptIndex === 0
                          ? [
                              {
                                label: "All versions",
                                onClick: () => setHistoryElementId(row.element.id)
                              },
                              {
                                label: "Change parent",
                                onClick: () =>
                                  setParentEdit({
                                    elementId: row.element.id,
                                    selectedParentId: row.element.parentElementId ?? ""
                                  })
                              }
                            ]
                          : []),
                        {
                          label: "Delete",
                          danger: true,
                          onClick: () => {
                            requestDelete(
                              row.element.id,
                              row.concept.id,
                              row.version.id,
                              "Delete latest visible version for this row?"
                            );
                          }
                        }
                      ]}
                      onOpen={openKebabMenu}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openMenu
        ? createPortal(
            <div className="kebab-root" onClick={() => setOpenMenu(null)} role="presentation">
              <div
                className="kebab-panel kebab-panel-floating"
                style={{ left: openMenu.left, top: openMenu.top }}
                onClick={(event) => event.stopPropagation()}
              >
                {openMenu.items.map((item) => (
                  <button
                    key={`${openMenu.id}-${item.label}`}
                    className={`kebab-item ${item.danger ? "danger-mini" : ""}`.trim()}
                    onClick={() => {
                      item.onClick();
                      setOpenMenu(null);
                    }}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
      {historyModal ? createPortal(historyModal, document.body) : null}
      {confirmModal ? createPortal(confirmModal, document.body) : null}
      {parentModal ? createPortal(parentModal, document.body) : null}
    </>
  );
};
