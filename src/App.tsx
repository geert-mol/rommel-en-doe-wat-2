import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ElementListView } from "./components/ElementListView";
import { SidebarReorderList } from "./components/SidebarReorderList";
import { exportDesktopBackup, restoreDesktopBackup } from "./lib/desktop-backup";
import {
  checkForDesktopUpdates,
  downloadDesktopUpdate,
  getDesktopUpdateState,
  installDesktopUpdate,
  subscribeToDesktopUpdates,
  type DesktopUpdateState
} from "./lib/desktop-updater";
import { exportProjectExcel } from "./lib/desktop-export";
import { buildProjectExportPayload } from "./lib/export";
import { isDesktopApp, pickDirectory, saveAppState } from "./lib/desktop";
import { parseMarkdownBlocks } from "./lib/markdown";
import { padProjectOrProductId } from "./lib/filename";
import { sortProductsForProject, sortProjects } from "./lib/order";
import { useAppStore } from "./lib/store";
import { ELEMENT_TYPES, type ElementType, type ReleaseState } from "./lib/types";

const parentCapable = new Set<ElementType>(["HA", "SA", "MM"]);

type DeleteTarget =
  | { kind: "project"; id: string; label: string }
  | { kind: "product"; id: string; label: string };

interface ProductEditDraft {
  id: string;
  productId: string;
  name: string;
  folderPath: string;
}

interface ProjectEditDraft {
  id: string;
  projectId: string;
  name: string;
}

const nextPartNumberForProduct = (partNumbers: string[]): string => {
  const maxValue = partNumbers.reduce((max, partNumber) => {
    const parsed = Number.parseInt(partNumber, 10);
    if (Number.isNaN(parsed)) return max;
    return Math.max(max, parsed);
  }, -1);

  return String(maxValue + 1).padStart(2, "0");
};

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
    updateProject,
    addProduct,
    updateProduct,
    deleteProject,
    deleteProduct,
    reorderProjectList,
    reorderProductList,
    replaceState
  } = useAppStore();
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const [isUpdateActionBusy, setIsUpdateActionBusy] = useState(false);
  const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectEditDraft | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductEditDraft | null>(null);
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
  const [parentDropdownRect, setParentDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const [projectForm, setProjectForm] = useState({
    projectId: "001",
    name: ""
  });
  const [productForm, setProductForm] = useState({
    productId: "001",
    name: "",
    folderPath: ""
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
    if (!desktopApp) return;

    let isCancelled = false;

    void getDesktopUpdateState().then((nextState) => {
      if (isCancelled || !nextState) return;
      setUpdateState(nextState);
    });

    const unsubscribe = subscribeToDesktopUpdates((nextState) => {
      if (isCancelled) return;
      setUpdateState(nextState);
      setIsUpdateActionBusy(false);
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [desktopApp]);

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
    if (!editingProduct) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingProduct(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingProduct]);

  useEffect(() => {
    if (!editingProject) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingProject(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingProject]);

  useEffect(() => {
    const targetVersion = updateState?.downloadedVersion ?? updateState?.availableVersion ?? null;
    const shouldPrompt =
      targetVersion !== null &&
      (updateState?.status === "available" ||
        updateState?.status === "downloading" ||
        updateState?.status === "downloaded");

    if (!shouldPrompt) {
      setIsUpdatePromptOpen(false);
      return;
    }

    if (dismissedUpdateVersion === targetVersion) {
      return;
    }

    setIsUpdatePromptOpen(true);
  }, [
    dismissedUpdateVersion,
    updateState?.availableVersion,
    updateState?.downloadedVersion,
    updateState?.status
  ]);

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

  const orderedProjects = useMemo(() => sortProjects(state.projects), [state.projects]);
  const productsForSelectedProject = useMemo(
    () => sortProductsForProject(state.products, selectedProject?.id),
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

  const browseForProductFolder = async () => {
    if (!selectedProject) return;
    const selectedPath = await pickDirectory(productForm.folderPath || undefined);
    if (!selectedPath) return;
    setProductForm((prev) => ({ ...prev, folderPath: selectedPath }));
  };

  const browseForEditedProductFolder = async () => {
    if (!editingProduct) return;
    const selectedPath = await pickDirectory(editingProduct.folderPath || undefined);
    if (!selectedPath) return;
    setEditingProduct((prev) => (prev ? { ...prev, folderPath: selectedPath } : prev));
  };

  const exportProject = async (projectId: string) => {
    const payload = buildProjectExportPayload(state, projectId);
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

  const checkForUpdates = async () => {
    setIsUpdateActionBusy(true);
    try {
      const nextState = await checkForDesktopUpdates();
      if (nextState) {
        setUpdateState(nextState);
      }
    } finally {
      setIsUpdateActionBusy(false);
    }
  };

  const downloadUpdate = async () => {
    setIsUpdateActionBusy(true);
    try {
      const nextState = await downloadDesktopUpdate();
      if (nextState) {
        setUpdateState(nextState);
      }
    } finally {
      setIsUpdateActionBusy(false);
    }
  };

  const installUpdate = async () => {
    setIsUpdateActionBusy(true);
    await installDesktopUpdate();
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

  const openProductEditor = (product: typeof productsForSelectedProject[number]) => {
    setEditingProduct({
      id: product.id,
      productId: product.productId,
      name: product.name,
      folderPath: product.folderPath ?? ""
    });
  };

  const saveProductEdit = () => {
    if (
      !editingProduct ||
      !editingProduct.productId.trim() ||
      !editingProduct.name.trim() ||
      !editingProduct.folderPath.trim()
    ) {
      return;
    }
    updateProduct(
      editingProduct.id,
      editingProduct.productId,
      editingProduct.name,
      editingProduct.folderPath
    );
    setEditingProduct(null);
  };

  const openProjectEditor = (project: typeof state.projects[number]) => {
    setExportFeedback(null);
    setEditingProject({
      id: project.id,
      projectId: project.projectId,
      name: project.name
    });
  };

  const saveProjectEdit = () => {
    if (!editingProject || !editingProject.projectId.trim() || !editingProject.name.trim()) return;
    updateProject(editingProject.id, editingProject.projectId, editingProject.name);
    setEditingProject(null);
  };

  const openProjectEditorById = (projectId: string) => {
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    openProjectEditor(project);
  };

  const openProductEditorById = (productId: string) => {
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product) return;
    openProductEditor(product);
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

  const updateProgressLabel =
    updateState?.status === "downloading" && typeof updateState.progressPercent === "number"
      ? `${Math.round(updateState.progressPercent)}% downloaded`
      : null;
  const updateActionLabel =
    updateState?.status === "checking"
      ? "Checking..."
      : updateState?.status === "available"
        ? "Download Update"
      : updateState?.status === "downloading"
        ? "Downloading..."
        : "Check for Updates";
  const currentVersionLabel = updateState?.currentVersion ?? "Unknown";
  const promptVersion = updateState?.downloadedVersion ?? updateState?.availableVersion ?? null;
  const releaseNotes = updateState?.releaseNotes ?? [];
  const renderMarkdownNote = (body: string) => (
    <div className="update-note-body">
      {parseMarkdownBlocks(body).map((block, index) => {
        if (block.type === "heading") {
          const HeadingTag = block.level === 1 ? "h4" : block.level === 2 ? "h5" : "h6";
          return <HeadingTag key={`${block.type}-${index}`}>{block.text}</HeadingTag>;
        }

        if (block.type === "list") {
          return (
            <ul key={`${block.type}-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${block.type}-${index}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        return <p key={`${block.type}-${index}`}>{block.text}</p>;
      })}
    </div>
  );

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

  const productEditModal = editingProduct ? (
    <div className="confirm-backdrop" onClick={() => setEditingProduct(null)} role="presentation">
      <section
        className="confirm-modal product-edit-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-edit-title"
      >
        <div className="product-edit-header">
          <div>
            <p className="settings-kicker">Product details</p>
            <h3 className="confirm-title" id="product-edit-title">
              Edit {editingProduct.productId}
            </h3>
          </div>
          <button className="ghost-btn" onClick={() => setEditingProduct(null)} type="button">
            Close
          </button>
        </div>
        <form
          className="compact-form product-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveProductEdit();
          }}
        >
          <label>
            Product ID
            <input
              value={editingProduct.productId}
              onChange={(event) =>
                setEditingProduct((prev) =>
                  prev ? { ...prev, productId: event.target.value } : prev
                )
              }
              placeholder="001"
            />
          </label>
          <label>
            Product name
            <input
              value={editingProduct.name}
              onChange={(event) =>
                setEditingProduct((prev) => (prev ? { ...prev, name: event.target.value } : prev))
              }
              placeholder="Product name"
            />
          </label>
          <label>
            Product folder
            <div className="field-action">
              <input
                value={editingProduct.folderPath}
                onChange={(event) =>
                  setEditingProduct((prev) =>
                    prev ? { ...prev, folderPath: event.target.value } : prev
                  )
                }
                placeholder="Product folder"
              />
              {desktopApp && (
                <button className="ghost-btn" onClick={() => void browseForEditedProductFolder()} type="button">
                  Browse
                </button>
              )}
            </div>
          </label>
          <div className="confirm-actions product-edit-actions">
            <button
              className="danger-mini"
              onClick={() => {
                setPendingDelete({
                  kind: "product",
                  id: editingProduct.id,
                  label: `product ${editingProduct.productId} ${editingProduct.name}`
                });
                setEditingProduct(null);
              }}
              type="button"
            >
              Delete product
            </button>
            <button className="ghost-btn" onClick={() => setEditingProduct(null)} type="button">
              Cancel
            </button>
            <button
              className="secondary-btn"
              disabled={
                !editingProduct.productId.trim() ||
                !editingProduct.name.trim() ||
                !editingProduct.folderPath.trim()
              }
              type="submit"
            >
              Save product
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  const projectEditModal = editingProject ? (
    <div className="confirm-backdrop" onClick={() => setEditingProject(null)} role="presentation">
      <section
        className="confirm-modal product-edit-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-edit-title"
      >
        <div className="product-edit-header">
          <div>
            <p className="settings-kicker">Project details</p>
            <h3 className="confirm-title" id="project-edit-title">
              Edit {editingProject.projectId}
            </h3>
          </div>
          <button className="ghost-btn" onClick={() => setEditingProject(null)} type="button">
            Close
          </button>
        </div>
        <form
          className="compact-form product-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveProjectEdit();
          }}
        >
          <label>
            Project ID
            <input
              value={editingProject.projectId}
              onChange={(event) =>
                setEditingProject((prev) =>
                  prev ? { ...prev, projectId: event.target.value } : prev
                )
              }
              placeholder="001"
            />
          </label>
          <label>
            Project name
            <input
              value={editingProject.name}
              onChange={(event) =>
                setEditingProject((prev) => (prev ? { ...prev, name: event.target.value } : prev))
              }
              placeholder="Project name"
            />
          </label>
          {desktopApp ? (
            <button
              className="secondary-btn"
              disabled={isExporting}
              onClick={() => void exportProject(editingProject.id)}
              type="button"
            >
              {isExporting ? "Exporting..." : "Export Project Excel"}
            </button>
          ) : null}
          {exportFeedback ? (
            <p className="helper-text mono-hint" title={exportFeedback}>
              {exportFeedback}
            </p>
          ) : null}
          <div className="confirm-actions product-edit-actions">
            <button
              className="danger-mini"
              onClick={() => {
                setPendingDelete({
                  kind: "project",
                  id: editingProject.id,
                  label: `project ${editingProject.projectId} ${editingProject.name}`
                });
                setEditingProject(null);
              }}
              type="button"
            >
              Delete project
            </button>
            <button className="ghost-btn" onClick={() => setEditingProject(null)} type="button">
              Cancel
            </button>
            <button
              className="secondary-btn"
              disabled={!editingProject.projectId.trim() || !editingProject.name.trim()}
              type="submit"
            >
              Save project
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  const updateModal =
    desktopApp && isUpdatePromptOpen && promptVersion ? (
      <div
        className="update-backdrop"
        onClick={() => {
          setDismissedUpdateVersion(promptVersion);
          setIsUpdatePromptOpen(false);
        }}
        role="presentation"
      >
        <section
          className="update-modal"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-title"
        >
          <div className="update-header">
            <div>
              <p className="settings-kicker">Desktop update</p>
              <h2 id="update-title">
                {updateState?.status === "downloaded"
                  ? `Version ${promptVersion} ready`
                  : `Version ${promptVersion} available`}
              </h2>
            </div>
            <button
              className="settings-close"
              onClick={() => {
                setDismissedUpdateVersion(promptVersion);
                setIsUpdatePromptOpen(false);
              }}
              type="button"
            >
              Later
            </button>
          </div>
          <p className="helper-text update-copy">
            {updateState?.message ??
              `Version ${promptVersion} is available. Review the missed release notes below.`}
          </p>
          {updateState?.status === "downloading" &&
          typeof updateState.progressPercent === "number" ? (
            <p className="helper-text update-progress">
              {Math.round(updateState.progressPercent)}% downloaded
            </p>
          ) : null}
          <div className="update-notes-list">
            {releaseNotes.length > 0 ? (
              releaseNotes.map((note) => (
                <article key={note.version} className="update-note-card">
                  <div className="update-note-head">
                    <h3>{note.title}</h3>
                    <p className="helper-text">
                      {note.publishedAt ? new Date(note.publishedAt).toLocaleDateString() : null}
                    </p>
                  </div>
                  {renderMarkdownNote(note.body)}
                </article>
              ))
            ) : (
              <article className="update-note-card">
                <div className="update-note-head">
                  <h3>Version {promptVersion}</h3>
                </div>
                {renderMarkdownNote("Release notes are not available.")}
              </article>
            )}
          </div>
          <div className="confirm-actions update-actions">
            <button
              className="ghost-btn"
              onClick={() => {
                setDismissedUpdateVersion(promptVersion);
                setIsUpdatePromptOpen(false);
              }}
              type="button"
            >
              Later
            </button>
            {updateState?.status === "downloaded" ? (
              <button
                className="secondary-btn"
                disabled={isUpdateActionBusy}
                onClick={() => void installUpdate()}
                type="button"
              >
                Install and Restart
              </button>
            ) : (
              <button
                className="secondary-btn"
                disabled={
                  isUpdateActionBusy ||
                  updateState?.status === "checking" ||
                  updateState?.status === "downloading"
                }
                onClick={() => void downloadUpdate()}
                type="button"
              >
                {updateState?.status === "downloading" ? "Downloading..." : "Download Update"}
              </button>
            )}
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
            <h3>Backup</h3>
            <p className="helper-text settings-copy">
              Save and restore app data. SolidWorks files on disk stay outside this backup.
            </p>
            {storageError && <p className="helper-text error-text">{storageError}</p>}
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
          <section className="settings-card">
            <h3>Updates</h3>
            <p className="helper-text settings-copy">
              Packaged desktop builds check GitHub Releases for newer versions and show release
              notes before you choose to download.
            </p>
            <div className="settings-status-list">
              <p className="helper-text">
                Current version: <strong>{currentVersionLabel}</strong>
              </p>
              <p className="helper-text">
                {updateState?.message ??
                  (desktopApp
                    ? "Waiting for updater status..."
                    : "Automatic updates are desktop-only.")}
              </p>
              {updateProgressLabel && <p className="helper-text">{updateProgressLabel}</p>}
            </div>
            {desktopApp && (
              <div className="backup-actions settings-actions">
                <button
                  className="secondary-btn"
                  disabled={
                    isUpdateActionBusy ||
                    updateState?.status === "checking" ||
                    updateState?.status === "downloading"
                  }
                  onClick={() =>
                    void (updateState?.status === "available" ? downloadUpdate() : checkForUpdates())
                  }
                  type="button"
                >
                  {updateActionLabel}
                </button>
                <button
                  className="secondary-btn"
                  disabled={updateState?.status !== "downloaded" || isUpdateActionBusy}
                  onClick={() => void installUpdate()}
                  type="button"
                >
                  Install and Restart
                </button>
              </div>
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
                className={`settings-launcher ${storageError || updateState?.status === "downloaded" || updateState?.status === "available" ? "has-alert" : ""}`.trim()}
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
              addProject(projectForm.projectId, projectForm.name);
              setProjectForm((prev) => ({
                ...prev,
                projectId: padProjectOrProductId(String(Number(prev.projectId) + 1)),
                name: ""
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
            <button type="submit">Create project</button>
          </form>

          <SidebarReorderList
            items={orderedProjects.map((project) => ({
              id: project.id,
              label: `${project.projectId} ${project.name}`,
              isActive: project.id === selectedProject?.id,
              editLabel: `Edit project ${project.projectId} ${project.name}`
            }))}
            onEdit={openProjectEditorById}
            onReorder={reorderProjectList}
            onSelect={(projectId) => dispatch({ type: "SELECT_PROJECT", payload: projectId })}
          />
          </section>

          <section className="panel">
          <h2>Products</h2>
          <form
            className="compact-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedProject || !productForm.name.trim() || !productForm.folderPath.trim()) {
                return;
              }
              addProduct(
                selectedProject.id,
                productForm.productId,
                productForm.name,
                productForm.folderPath
              );
              setProductForm((prev) => ({
                ...prev,
                productId: padProjectOrProductId(String(Number(prev.productId) + 1)),
                name: "",
                folderPath: ""
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
            <div className="field-action">
              <input
                value={productForm.folderPath}
                onChange={(event) =>
                  setProductForm((prev) => ({ ...prev, folderPath: event.target.value }))
                }
                placeholder="Product folder"
                disabled={!selectedProject}
              />
              {desktopApp && (
                <button className="ghost-btn" onClick={() => void browseForProductFolder()} type="button">
                  Browse
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!selectedProject || !productForm.name.trim() || !productForm.folderPath.trim()}
            >
              Create product
            </button>
          </form>

          <SidebarReorderList
            items={productsForSelectedProject.map((product) => ({
              id: product.id,
              label: `${product.productId} ${product.name}`,
              isActive: product.id === selectedProduct?.id,
              editLabel: `Edit product ${product.productId} ${product.name}`
            }))}
            onEdit={openProductEditorById}
            onReorder={(orderedIds) => {
              if (!selectedProject) return;
              reorderProductList(selectedProject.id, orderedIds);
            }}
            onSelect={(productId) => dispatch({ type: "SELECT_PRODUCT", payload: productId })}
          />
          </section>
        </aside>

        <main className="main">
          {isHydrating ? (
            <section className="hero">
              <h2>Loading workspace</h2>
              <p>Restoring projects, products, tree state, and app data.</p>
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
      {projectEditModal}
      {productEditModal}
      {updateModal}
      {parentDropdown}
    </>
  );
}

export default App;
