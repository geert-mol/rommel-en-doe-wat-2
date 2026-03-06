import { useMemo, useState } from "react";
import {
  buildSuggestedFilePath,
  generateFileName
} from "../lib/filename";
import type {
  ElementConcept,
  ElementVersion,
  EngineeringElement,
  Product,
  Project,
  ReleaseState
} from "../lib/types";
import { RELEASE_STATES } from "../lib/types";
import { byVersionDesc } from "../lib/versioning";

interface ElementTreeProps {
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

const asFileUri = (rawPath: string): string => `file:///${rawPath.replaceAll("\\", "/")}`;
const isBrowserProtocol =
  typeof window !== "undefined" &&
  (window.location.protocol === "http:" || window.location.protocol === "https:");

const copyToClipboard = async (value: string): Promise<void> => {
  await navigator.clipboard.writeText(value);
};

const findLatest = (concept: ElementConcept): ElementVersion => [...concept.versions].sort(byVersionDesc)[0];

const openOrCopyPath = async (path: string): Promise<void> => {
  if (isBrowserProtocol) {
    await copyToClipboard(path);
    return;
  }

  window.open(asFileUri(path), "_blank", "noopener,noreferrer");
};

export const ElementTree = ({
  elements,
  project,
  product,
  defaultRootPath,
  onAddConcept,
  onAddVersion,
  onSetReleaseState
}: ElementTreeProps) => {
  const tree = useMemo(() => {
    const byId = new Map(elements.map((element) => [element.id, element]));
    const map = new Map<string | undefined, EngineeringElement[]>();
    for (const element of elements) {
      const parentIds = element.parentElementIds.filter((parentId) => byId.has(parentId));
      const keys = parentIds.length > 0 ? parentIds : [undefined];
      for (const key of keys) {
        const bucket = map.get(key) ?? [];
        bucket.push(element);
        map.set(key, bucket);
      }
    }
    for (const [, value] of map) {
      value.sort((a, b) => a.partNumber.localeCompare(b.partNumber));
    }
    return map;
  }, [elements]);

  const roots = tree.get(undefined) ?? [];

  if (roots.length === 0) {
    return <p className="empty">No elements yet. Add first HA/SA/MM/PA element.</p>;
  }

  return (
    <div className="tree">
      {roots.map((root) => (
        <ElementNode
          key={root.id}
          node={root}
          level={0}
          tree={tree}
          project={project}
          product={product}
          defaultRootPath={defaultRootPath}
          onAddConcept={onAddConcept}
          onAddVersion={onAddVersion}
          onSetReleaseState={onSetReleaseState}
        />
      ))}
    </div>
  );
};

interface ElementNodeProps {
  node: EngineeringElement;
  level: number;
  tree: Map<string | undefined, EngineeringElement[]>;
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

const ElementNode = ({
  node,
  level,
  tree,
  project,
  product,
  defaultRootPath,
  onAddConcept,
  onAddVersion,
  onSetReleaseState
}: ElementNodeProps) => {
  const children = tree.get(node.id) ?? [];
  const [expandedConceptIds, setExpandedConceptIds] = useState<Record<string, boolean>>({});

  return (
    <div className="node" style={{ "--level": level } as React.CSSProperties}>
      <div className="node-card">
        <header className="node-header">
          <div>
            <strong>{node.type}</strong> <span>{node.partNumber}</span>
            <p>{node.descriptionSlug}</p>
          </div>
          <button className="ghost-btn" onClick={() => onAddConcept(node.id)} type="button">
            + Concept
          </button>
        </header>

        <div className="concept-list">
          {node.concepts.map((concept) => {
            const ordered = [...concept.versions].sort(byVersionDesc);
            const latest = findLatest(concept);
            const isExpanded = expandedConceptIds[concept.id] ?? false;
            const visibleVersions = isExpanded ? ordered : [latest];

            return (
              <section key={concept.id} className="concept">
                <header className="concept-header">
                  <h4>Concept {concept.conceptCode}</h4>
                  <div className="concept-actions">
                    <button
                      className="ghost-btn"
                      onClick={() => onAddVersion(node.id, concept.id, "major")}
                      type="button"
                    >
                      + Major
                    </button>
                    <button
                      className="ghost-btn"
                      onClick={() => onAddVersion(node.id, concept.id, "minor")}
                      type="button"
                    >
                      + Minor
                    </button>
                    <button
                      className="ghost-btn"
                      onClick={() =>
                        setExpandedConceptIds((prev) => ({ ...prev, [concept.id]: !isExpanded }))
                      }
                      type="button"
                    >
                      {isExpanded ? "Hide history" : "Show history"}
                    </button>
                  </div>
                </header>

                {visibleVersions.map((version) => {
                  const fileName = generateFileName({
                    state: version.releaseState,
                    projectCode: project.projectId,
                    productCode: product.productId,
                    conceptCode: concept.conceptCode,
                    type: node.type,
                    partNumber: node.partNumber,
                    descriptionSlug: node.descriptionSlug,
                    majorVersion: version.majorVersion,
                    minorVersion: version.minorVersion
                  });
                  const suggestedPath = buildSuggestedFilePath(
                    fileName,
                    node,
                    project,
                    product,
                    defaultRootPath
                  );

                  return (
                    <article key={version.id} className="version">
                      <div className="version-head">
                        <code>{fileName}</code>
                        <select
                          value={version.releaseState}
                          onChange={(event) =>
                            onSetReleaseState(
                              node.id,
                              concept.id,
                              version.id,
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
                      </div>
                      <div className="version-actions">
                        <button
                          className="chip-btn"
                          onClick={() => void copyToClipboard(fileName)}
                          type="button"
                        >
                          Copy filename
                        </button>
                        <button
                          className="chip-btn"
                          onClick={() => void openOrCopyPath(suggestedPath)}
                          type="button"
                        >
                          {isBrowserProtocol ? "Copy real path" : "Open file"}
                        </button>
                      </div>
                      {isBrowserProtocol && (
                        <p className="path-hint">Browser blocks direct file opens. Path copied.</p>
                      )}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>

      {children.length > 0 && (
        <div className="children">
          {children.map((child) => (
            <ElementNode
              key={child.id}
              node={child}
              level={level + 1}
              tree={tree}
              project={project}
              product={product}
              defaultRootPath={defaultRootPath}
              onAddConcept={onAddConcept}
              onAddVersion={onAddVersion}
              onSetReleaseState={onSetReleaseState}
            />
          ))}
        </div>
      )}
    </div>
  );
};
