import { useMemo } from "react";
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
import { latestVersion } from "../lib/versioning";

interface ElementListViewProps {
  elements: EngineeringElement[];
  project: Project;
  product: Product;
  defaultRootPath: string;
  onAddConcept: (elementId: string) => void;
  onAddVersion: (elementId: string, conceptId: string, kind: "major" | "minor") => void;
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
  onSetReleaseState
}: ElementListViewProps) => {
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

  if (rows.length === 0) {
    return <p className="empty">No rows yet. List appears when elements are added.</p>;
  }

  return (
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
                  <button
                    className="mini-btn"
                    onClick={() => void copyToClipboard(row.fileName)}
                    type="button"
                  >
                    Copy name
                  </button>
                  <button
                    className="mini-btn"
                    onClick={() => void copyToClipboard(row.realPath)}
                    type="button"
                  >
                    Copy path
                  </button>
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
