import { useEffect, useMemo, useState } from "react";
import { ElementListView } from "./components/ElementListView";
import { getStorageLocation, isDesktopApp, pickDirectory } from "./lib/desktop";
import { padProjectOrProductId } from "./lib/filename";
import { useAppStore } from "./lib/store";
import { ELEMENT_TYPES, type ElementType, type ReleaseState } from "./lib/types";

const parentCapable = new Set<ElementType>(["HA", "SA", "MM"]);

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
    storageMode,
    dispatch,
    addProject,
    addProduct
  } = useAppStore();
  const [storageLocation, setStorageLocation] = useState<string | null>(null);

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
    parentElementId: "",
    elementType: "HA" as ElementType,
    description: ""
  });
  const [partNumberDraft, setPartNumberDraft] = useState<{
    productId?: string;
    value: string;
  }>({ value: "" });
  const desktopApp = isDesktopApp();

  useEffect(() => {
    if (!desktopApp) return;

    let isCancelled = false;
    void getStorageLocation().then((location) => {
      if (!isCancelled) {
        setStorageLocation(location);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [desktopApp]);

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

  const canCreateChild = elementForm.parentElementId.length === 0 || parentCandidates.length > 0;
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>Rommel en doe wat</h1>
          <p>Prototype PDM cockpit</p>
        </div>

        <section className="panel">
          <h2>Settings</h2>
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
                <button className="ghost-btn" onClick={() => void browseForDefaultRoot()} type="button">
                  Browse
                </button>
              )}
            </div>
          </label>
          <p className="helper-text">
            Storage: {storageMode === "sqlite" ? "desktop SQLite" : "browser local fallback"}
          </p>
          {storageLocation && (
            <p className="helper-text mono-hint" title={storageLocation}>
              {storageLocation}
            </p>
          )}
          {storageError && <p className="helper-text error-text">{storageError}</p>}
        </section>

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
              <li key={project.id}>
                <button
                  className={project.id === selectedProject?.id ? "active" : ""}
                  onClick={() => dispatch({ type: "SELECT_PROJECT", payload: project.id })}
                  type="button"
                >
                  {project.projectId} {project.name}
                </button>
              </li>
            ))}
          </ul>
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
              <li key={product.id}>
                <button
                  className={product.id === selectedProduct?.id ? "active" : ""}
                  onClick={() => dispatch({ type: "SELECT_PRODUCT", payload: product.id })}
                  type="button"
                >
                  {product.productId} {product.name}
                </button>
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
                      parentElementId: elementForm.parentElementId || undefined,
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
                <label>
                  Parent
                  <select
                    value={elementForm.parentElementId}
                    onChange={(event) =>
                      setElementForm((prev) => ({ ...prev, parentElementId: event.target.value }))
                    }
                  >
                    <option value="">(root)</option>
                    {parentCandidates.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.type} {parent.partNumber} {parent.descriptionSlug}
                      </option>
                    ))}
                  </select>
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
              <h2>Engineering list (latest only)</h2>
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
                onSetElementParent={(elementId, parentElementId) =>
                  dispatch({ type: "SET_ELEMENT_PARENT", payload: { elementId, parentElementId } })
                }
                onSetReleaseState={setReleaseState}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
