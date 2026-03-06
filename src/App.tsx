import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ElementListView } from "./components/ElementListView";
import { exportDesktopBackup, restoreDesktopBackup } from "./lib/desktop-backup";
import { exportProjectExcel } from "./lib/desktop-export";
import { buildProjectExportPayload } from "./lib/export";
import { isDesktopApp, pickDirectory, saveAppState } from "./lib/desktop";
import { padProjectOrProductId } from "./lib/filename";
import { useAppStore } from "./lib/store";
import { ELEMENT_TYPES, type ElementType, type ReleaseState } from "./lib/types";

const parentCapable = new Set<ElementType>(["HA", "SA", "MM"]);

type DeleteTarget =
  | { kind: "project"; id: string; label: string }
  | { kind: "product"; id: string; label: string };

const nextPartNumberForProduct = (partNumbers: string[]): string => {
  const maxValue = partNumbers.reduce((max, partNumber) => {
    const parsed = Number.parseInt(partNumber, 10);
    if (Number.isNaN(parsed)) return max;
    return Math.max(max, parsed);
  }, -1);

  return String(maxValue + 1).padStart(2, "0");
};

const TrashIcon = () => (
  <svg className="trash-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-1 6h2v8H8V9Zm6 0h2v8h-2V9ZM7 7h10l-1 13H8L7 7Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

function App() {
  const {
    state,
    selectedProject,
    selectedProduct,
    selectedElements,
    isHydrating,
    storageError,
    dispatch,
    addProject,
    addProduct,
    deleteProject,
    deleteProduct,
    replaceState
  } = useAppStore();
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
  const [parentDropdownRect, setParentDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const [projectForm, setProjectForm] = useState({
    projectId: "001",
    name: "",
    rootPath: ""
  });
  const [productForm, setProductForm] = useState({
    productId: "001",
    name: ""
  });
  const [elementForm, setElementForm] = useState({
    parentElementIds: [] as string[],
    elementType: "HA" as ElementType,
    description: ""
  });
  const [partNumberDraft, setPartNumberDraft] = useState<{
    productId?: string;
    value: string;
  }>({ value: "" });
  const parentDropdownTriggerRef = useRef<HTMLButtonElement | null>(null);
  const parentDropdownPanelRef = useRef<HTMLDivElement | null>(null);
  const desktopApp = isDesktopApp();

  useEffect(() => {
    if (!isSettingsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!pendingDelete) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingDelete(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingDelete]);

  useEffect(() => {
    if (!isParentDropdownOpen) return;

    const updateParentDropdownRect = () => {
      const trigger = parentDropdownTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setParentDropdownRect({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (parentDropdownTriggerRef.current?.contains(target)) return;
      if (parentDropdownPanelRef.current?.contains(target)) return;
      setIsParentDropdownOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsParentDropdownOpen(false);
      }
    };

    updateParentDropdownRect();
    window.addEventListener("resize", updateParentDropdownRect);
    window.addEventListener("scroll", updateParentDropdownRect, true);
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updateParentDropdownRect);
      window.removeEventListener("scroll", updateParentDropdownRect, true);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isParentDropdownOpen]);

  const productsForSelectedProject = useMemo(
    () => state.products.filter((product) => product.projectId === selectedProject?.id),
    [state.products, selectedProject?.id]
  );

  const parentCandidates = useMemo(
    () => selectedElements.filter((element) => parentCapable.has(element.type)),
    [selectedElements]
  );
  const suggestedPartNumber = useMemo(
    () => nextPartNumberForProduct(selectedElements.map((element) => element.partNumber)),
    [selectedElements]
  );
  const currentPartNumber =
    partNumberDraft.productId === selectedProduct?.id && partNumberDraft.value.length > 0
      ? partNumberDraft.value
      : suggestedPartNumber;
  const selectedParentSummary = useMemo(() => {
    if (elementForm.parentElementIds.length === 0) return "ROOT";

    const selectedParents = parentCandidates.filter((candidate) =>
      elementForm.parentElementIds.includes(candidate.id)
    );

    if (selectedParents.length === 0) return "ROOT";
    if (selectedParents.length === 1) {
      const parent = selectedParents[0];
      return `${parent.type} ${parent.partNumber} ${parent.descriptionSlug}`;
    }

    return `${selectedParents.length} parents selected`;
  }, [elementForm.parentElementIds, parentCandidates]);

  useEffect(() => {
    const candidateIds = new Set(parentCandidates.map((candidate) => candidate.id));
    setElementForm((prev) => {
      const nextParentIds = prev.parentElementIds.filter((parentId) => candidateIds.has(parentId));
      if (
        nextParentIds.length === prev.parentElementIds.length &&
        nextParentIds.every((parentId, index) => parentId === prev.parentElementIds[index])
      ) {
        return prev;
      }

      return { ...prev, parentElementIds: nextParentIds };
    });
  }, [parentCandidates]);

  const canCreateChild = elementForm.parentElementIds.length === 0 || parentCandidates.length > 0;
  const setReleaseState = (
    elementId: string,
    conceptId: string,
    versionId: string,
    releaseState: ReleaseState
  ) => {
    dispatch({
      type: "SET_RELEASE_STATE",
      payload: { elementId, conceptId, versionId, releaseState }
    });
  };

  const browseForDefaultRoot = async () => {
    const selectedPath = await pickDirectory(state.settings.defaultRootPath);
    if (!selectedPath) return;
    dispatch({ type: "SET_DEFAULT_ROOT", payload: selectedPath });
  };

  const browseForProjectRoot = async () => {
    const selectedPath = await pickDirectory(projectForm.rootPath || state.settings.defaultRootPath);
    if (!selectedPath) return;
    setProjectForm((prev) => ({ ...prev, rootPath: selectedPath }));
  };

  const exportSelectedProject = async () => {
    if (!selectedProject) return;

    const payload = buildProjectExportPayload(state, selectedProject.id);
    if (!payload) {
      setExportFeedback("Project export failed.");
      return;
    }

    setIsExporting(true);
    const savedPath = await exportProjectExcel(payload);
    setIsExporting(false);
    setExportFeedback(savedPath ? `Exported: ${savedPath}` : "Export cancelled.");
  };

  const createBackup = async () => {
    setIsBackupBusy(true);
    setBackupFeedback(null);

    try {
      const savedPath = await exportDesktopBackup(state);
      setBackupFeedback(savedPath ? `Backup saved: ${savedPath}` : "Backup cancelled.");
    } catch (error) {
      setBackupFeedback(error instanceof Error ? error.message : "Backup failed.");
    } finally {
      setIsBackupBusy(false);
    }
  };

  const restoreBackup = async () => {
    const shouldRestore = window.confirm(
      "Restore a backup and replace the current app data? SolidWorks files are not touched."
    );
    if (!shouldRestore) return;

    setIsBackupBusy(true);
    setBackupFeedback(null);

    try {
      const restored = await restoreDesktopBackup();
      if (!restored) {
        setBackupFeedback("Restore cancelled.");
        return;
      }

      await saveAppState(restored.state);
      replaceState(restored.state);
      setBackupFeedback(`Restored: ${restored.path}`);
    } catch (error) {
      setBackupFeedback(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setIsBackupBusy(false);
    }
  };

  const toggleElementParentDraft = (parentId: string) => {
    setElementForm((prev) => ({
      ...prev,
      parentElementIds: prev.parentElementIds.includes(parentId)
        ? prev.parentElementIds.filter((candidateId) => candidateId !== parentId)
        : [...prev.parentElementIds, parentId]
    }));
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;

    if (pendingDelete.kind === "project") {
      deleteProject(pendingDelete.id);
    } else {
      deleteProduct(pendingDelete.id);
    }

    setPendingDelete(null);
  };

  const parentDropdown = isParentDropdownOpen && parentDropdownRect
    ? createPortal(
        <div
          ref={parentDropdownPanelRef}
          className="parent-dropdown-panel parent-dropdown-panel-floating"
          style={{
            top: parentDropdownRect.top,
            left: parentDropdownRect.left,
            width: parentDropdownRect.width
          }}
        >
          <div className="parent-checklist">
            <div className="parent-checklist-root">No selection = ROOT</div>
            {parentCandidates.map((parent) => (
              <label key={parent.id} className="parent-check">
                <input
                  checked={elementForm.parentElementIds.includes(parent.id)}
                  onChange={() => toggleElementParentDraft(parent.id)}
                  type="checkbox"
                />
                <span>
                  {parent.type} {parent.partNumber} {parent.descriptionSlug}
                </span>
              </label>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  const deleteModal = pendingDelete ? (
    <div className="confirm-backdrop" onClick={() => setPendingDelete(null)} role="presentation">
      <section
        className="confirm-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
      >
        <h3 className="confirm-title" id="delete-title">
          Delete {pendingDelete.kind}
        </h3>
        <p className="confirm-message">
          {pendingDelete.kind === "project"
            ? `Delete ${pendingDelete.label}? This removes the project, every product inside it, and all elements within those products.`
            : `Delete ${pendingDelete.label}? This removes the product and all elements within it.`}
        </p>
        <p className="confirm-message confirm-warning">This cannot be undone.</p>
        <div className="confirm-actions">
          <button className="ghost-btn" onClick={() => setPendingDelete(null)} type="button">
            Cancel
          </button>
          <button className="danger-mini" onClick={confirmDelete} type="button">
            Delete {pendingDelete.kind}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  const settingsModal = isSettingsOpen ? (
    <div className="settings-backdrop" onClick={() => setIsSettingsOpen(false)} role="presentation">
      <section
        className="settings-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-header">
          <div>
            <p className="settings-kicker">Workspace controls</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            aria-label="Close settings"
            className="settings-close"
            onClick={() => setIsSettingsOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="settings-grid">
          <section className="settings-card">
            <h3>Storage</h3>
            <label>
              Default root folder
              <div className="field-action">
                <input
                  value={state.settings.defaultRootPath}
                  onChange={(event) =>
                    dispatch({ type: "SET_DEFAULT_ROOT", payload: event.target.value })
                  }
                  placeholder="C:/Engineering"
                />
                {desktopApp && (
                  <button
                    className="ghost-btn"
                    onClick={() => void browseForDefaultRoot()}
                    type="button"
                  >
                    Browse
                  </button>
                )}
              </div>
            </label>
            <p className="helper-text">
              Used as fallback when a project has no custom root override.
            </p>
            {storageError && <p className="helper-text error-text">{storageError}</p>}
          </section>
          <section className="settings-card">
            <h3>Backup</h3>
            <p className="helper-text settings-copy">
              Save and restore app data. SolidWorks files on disk stay outside this backup.
            </p>
            {desktopApp && (
              <div className="backup-actions">
                <button
                  className="secondary-btn"
                  disabled={isBackupBusy}
                  onClick={() => void createBackup()}
                  type="button"
                >
                  {isBackupBusy ? "Working..." : "Create Backup"}
                </button>
                <button
                  className="secondary-btn"
                  disabled={isBackupBusy}
                  onClick={() => void restoreBackup()}
                  type="button"
                >
                  Restore Backup
                </button>
              </div>
            )}
            {backupFeedback && (
              <p className="helper-text mono-hint" title={backupFeedback}>
                {backupFeedback}
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-topline">
              <div>
                <h1>Rommel en doe wat</h1>
                <p>Prototype PDM cockpit</p>
              </div>
              <button
                className={`settings-launcher ${storageError ? "has-alert" : ""}`.trim()}
                onClick={() => setIsSettingsOpen(true)}
                type="button"
              >
                Settings
              </button>
            </div>
          </div>

          <section className="panel">
          <h2>Projects</h2>
          <form
            className="compact-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!projectForm.name.trim()) return;
              addProject(projectForm.projectId, projectForm.name, projectForm.rootPath);
              setProjectForm((prev) => ({
                ...prev,
                projectId: padProjectOrProductId(String(Number(prev.projectId) + 1)),
                name: "",
                rootPath: ""
              }));
            }}
          >
            <input
              value={projectForm.projectId}
              onChange={(event) =>
                setProjectForm((prev) => ({ ...prev, projectId: event.target.value }))
              }
              placeholder="013"
            />
            <input
              value={projectForm.name}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Project name"
            />
            <div className="field-action">
              <input
                value={projectForm.rootPath}
                onChange={(event) =>
                  setProjectForm((prev) => ({ ...prev, rootPath: event.target.value }))
                }
                placeholder="Optional root override"
              />
              {desktopApp && (
                <button className="ghost-btn" onClick={() => void browseForProjectRoot()} type="button">
                  Browse
                </button>
              )}
            </div>
            <button type="submit">Create project</button>
          </form>

          <ul className="list">
            {state.projects.map((project) => (
              <li key={project.id} className="list-item">
                <div className="sidebar-item">
                <button
                  className={`sidebar-select ${project.id === selectedProject?.id ? "active" : ""}`.trim()}
                  onClick={() => dispatch({ type: "SELECT_PROJECT", payload: project.id })}
                  type="button"
                >
                  {project.projectId} {project.name}
                </button>
                <button
                  aria-label={`Delete project ${project.projectId} ${project.name}`}
                  className="sidebar-delete"
                  onClick={() =>
                    setPendingDelete({
                      kind: "project",
                      id: project.id,
                      label: `project ${project.projectId} ${project.name}`
                    })
                  }
                  type="button"
                >
                  <TrashIcon />
                </button>
                </div>
              </li>
            ))}
          </ul>
          {desktopApp && selectedProject && (
            <>
              <button
                className="project-export-btn"
                disabled={isExporting}
                onClick={() => void exportSelectedProject()}
                type="button"
              >
                {isExporting ? "Exporting..." : "Export Project Excel"}
              </button>
              {exportFeedback && (
                <p className="helper-text mono-hint" title={exportFeedback}>
                  {exportFeedback}
                </p>
              )}
            </>
          )}
          </section>

          <section className="panel">
          <h2>Products</h2>
          <form
            className="compact-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedProject || !productForm.name.trim()) return;
              addProduct(selectedProject.id, productForm.productId, productForm.name);
              setProductForm((prev) => ({
                ...prev,
                productId: padProjectOrProductId(String(Number(prev.productId) + 1)),
                name: ""
              }));
            }}
          >
            <input
              value={productForm.productId}
              onChange={(event) =>
                setProductForm((prev) => ({ ...prev, productId: event.target.value }))
              }
              placeholder="009"
              disabled={!selectedProject}
            />
            <input
              value={productForm.name}
              onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Product name"
              disabled={!selectedProject}
            />
            <button type="submit" disabled={!selectedProject}>
              Create product
            </button>
          </form>

          <ul className="list">
            {productsForSelectedProject.map((product) => (
              <li key={product.id} className="list-item">
                <div className="sidebar-item">
                <button
                  className={`sidebar-select ${product.id === selectedProduct?.id ? "active" : ""}`.trim()}
                  onClick={() => dispatch({ type: "SELECT_PRODUCT", payload: product.id })}
                  type="button"
                >
                  {product.productId} {product.name}
                </button>
                <button
                  aria-label={`Delete product ${product.productId} ${product.name}`}
                  className="sidebar-delete"
                  onClick={() =>
                    setPendingDelete({
                      kind: "product",
                      id: product.id,
                      label: `product ${product.productId} ${product.name}`
                    })
                  }
                  type="button"
                >
                  <TrashIcon />
                </button>
                </div>
              </li>
            ))}
          </ul>
          </section>
        </aside>

        <main className="main">
          {isHydrating ? (
            <section className="hero">
              <h2>Loading workspace</h2>
              <p>Restoring projects, products, tree state, and settings.</p>
            </section>
          ) : !selectedProject || !selectedProduct ? (
            <section className="hero">
              <h2>Select project + product</h2>
              <p>Create both in left rail, then build engineering structure.</p>
            </section>
          ) : (
            <>
              <header className="workspace-header">
                <div>
                  <p>{selectedProject.projectId}</p>
                  <h2>{selectedProject.name}</h2>
                </div>
                <div>
                  <p>{selectedProduct.productId}</p>
                  <h3>{selectedProduct.name}</h3>
                </div>
              </header>

              <section className="panel element-builder">
                <h2>New element</h2>
                <form
                  className="element-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!selectedProject || !selectedProduct || !elementForm.description.trim()) return;
                    if (!canCreateChild) return;
                    dispatch({
                      type: "CREATE_ELEMENT",
                      payload: {
                        projectId: selectedProject.id,
                        productId: selectedProduct.id,
                        parentElementIds: elementForm.parentElementIds,
                        elementType: elementForm.elementType,
                        partNumber: currentPartNumber,
                        description: elementForm.description
                      }
                    });
                    setElementForm((prev) => ({
                      ...prev,
                      description: ""
                    }));
                    setPartNumberDraft({
                      productId: selectedProduct.id,
                      value: String(Number(currentPartNumber || "0") + 1).padStart(2, "0")
                    });
                  }}
                >
                  <label className="wide">
                    Parents
                    <div className="parent-dropdown">
                      <button
                        ref={parentDropdownTriggerRef}
                        aria-expanded={isParentDropdownOpen}
                        className="parent-dropdown-trigger"
                        onClick={() => setIsParentDropdownOpen((current) => !current)}
                        type="button"
                      >
                        {selectedParentSummary}
                      </button>
                    </div>
                  </label>
                  <label>
                    Type
                    <select
                      value={elementForm.elementType}
                      onChange={(event) =>
                        setElementForm((prev) => ({
                          ...prev,
                          elementType: event.target.value as ElementType
                        }))
                      }
                    >
                      {ELEMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Part number
                    <input
                      value={currentPartNumber}
                      onChange={(event) =>
                        setPartNumberDraft({
                          productId: selectedProduct?.id,
                          value: event.target.value
                        })
                      }
                      placeholder="00"
                    />
                  </label>
                  <label className="wide">
                    Description
                    <input
                      value={elementForm.description}
                      onChange={(event) =>
                        setElementForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="balkon mini vijver"
                    />
                  </label>
                  <button type="submit">Add element</button>
                </form>
              </section>

              <section className="panel">
                <h2>Engineering list</h2>
                <ElementListView
                  elements={selectedElements}
                  project={selectedProject}
                  product={selectedProduct}
                  defaultRootPath={state.settings.defaultRootPath}
                  onAddConcept={(elementId) =>
                    dispatch({ type: "ADD_CONCEPT", payload: { elementId } })
                  }
                  onAddVersion={(elementId, conceptId, kind) =>
                    dispatch({ type: "ADD_VERSION", payload: { elementId, conceptId, kind } })
                  }
                  onDeleteVersion={(elementId, conceptId, versionId) =>
                    dispatch({ type: "DELETE_VERSION", payload: { elementId, conceptId, versionId } })
                  }
                  onSetElementParents={(elementId, parentElementIds) =>
                    dispatch({ type: "SET_ELEMENT_PARENT", payload: { elementId, parentElementIds } })
                  }
                  onSetVersionExport={(elementId, conceptId, versionId, exportKind, enabled) =>
                    dispatch({
                      type: "SET_VERSION_EXPORT",
                      payload: { elementId, conceptId, versionId, exportKind, enabled }
                    })
                  }
                  onSetReleaseState={setReleaseState}
                />
              </section>
            </>
          )}
        </main>
      </div>
      {settingsModal}
      {deleteModal}
      {parentDropdown}
    </>
  );
}

export default App;
