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
  onSetReleaseState: (
    elementId: string,
    conceptId: string,
    versionId: string,
    releaseState: ReleaseState
  ) => void;
}

const copyToClipboard = async (value: string): Promise<void> => {
  await navigator.clipboard.writeText(value);
};

export const ElementListView = ({
  elements,
  project,
  product,
  defaultRootPath,
  onSetReleaseState
}: ElementListViewProps) => {
  const rows = useMemo(() => {
    const parentMap = new Map(elements.map((element) => [element.id, element]));
    const result = elements.flatMap((element) =>
      element.concepts.map((concept) => {
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
        return {
          element,
          concept,
          version,
          fileName,
          realPath,
          parentLabel: parent ? `${parent.type}-${parent.partNumber}` : "ROOT"
        };
      })
    );

    result.sort((a, b) => {
      if (a.element.partNumber !== b.element.partNumber) {
        return a.element.partNumber.localeCompare(b.element.partNumber, undefined, {
          numeric: true
        });
      }
      if (a.element.type !== b.element.type) return a.element.type.localeCompare(b.element.type);
      return a.concept.conceptCode.localeCompare(b.concept.conceptCode);
    });

    return result;
  }, [defaultRootPath, elements, product, project]);

  if (rows.length === 0) {
    return <p className="empty">No rows yet. List appears when elements are added.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
