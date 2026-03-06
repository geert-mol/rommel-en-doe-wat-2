import Database from "better-sqlite3";
import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";

type ReleaseState = "PT" | "PR" | "RL" | "RR";
type ElementType = "MM" | "HA" | "SA" | "PA";

interface AppSettings {
  defaultRootPath: string;
}

interface Project {
  id: string;
  projectId: string;
  name: string;
  rootPath?: string;
}

interface Product {
  id: string;
  projectId: string;
  productId: string;
  name: string;
}

interface ElementVersion {
  id: string;
  majorVersion: number;
  minorVersion: number;
  releaseState: ReleaseState;
  createdAt: string;
  availableExports?: Partial<
    Record<"solidworksDrawing" | "step" | "drawing" | "sheetMetal" | "stl", true>
  >;
}

interface ElementConcept {
  id: string;
  conceptCode: string;
  versions: ElementVersion[];
}

interface EngineeringElement {
  id: string;
  projectId: string;
  productId: string;
  parentElementIds: string[];
  type: ElementType;
  partNumber: string;
  descriptionSlug: string;
  concepts: ElementConcept[];
}

interface AppState {
  settings: AppSettings;
  projects: Project[];
  products: Product[];
  elements: EngineeringElement[];
  selectedProjectId?: string;
  selectedProductId?: string;
}

interface ProjectRow {
  id: string;
  project_code: string;
  name: string;
  root_path: string | null;
}

interface ProductRow {
  id: string;
  project_ref: string;
  product_code: string;
  name: string;
}

interface ElementRow {
  id: string;
  project_ref: string;
  product_ref: string;
  parent_element_ref: string | null;
  type: ElementType;
  part_number: string;
  description_slug: string;
}

interface ConceptRow {
  id: string;
  element_ref: string;
  concept_code: string;
}

interface ParentLinkRow {
  element_ref: string;
  parent_element_ref: string;
}

interface VersionRow {
  id: string;
  concept_ref: string;
  major_version: number;
  minor_version: number;
  release_state: ReleaseState;
  created_at: string;
  has_solidworks_drawing: number;
  has_step: number;
  has_drawing: number;
  has_sheet_metal: number;
  has_stl: number;
}

interface SettingsRow {
  default_root_path: string;
}

interface MetaRow {
  key: string;
  value: string;
}

const createInitialState = (): AppState => ({
  settings: { defaultRootPath: "C:/Engineering" },
  projects: [],
  products: [],
  elements: []
});

const sanitizeElementParents = (elements: EngineeringElement[]): EngineeringElement[] => {
  const byId = new Map(elements.map((element) => [element.id, element]));

  return elements.map((element) => ({
    ...element,
    parentElementIds: [...new Set(element.parentElementIds)].filter((parentId) => {
      if (parentId === element.id) return false;
      const parent = byId.get(parentId);
      if (!parent) return false;
      return parent.projectId === element.projectId && parent.productId === element.productId;
    })
  }));
};

const getVersionExportState = (
  versionRow: Pick<
    VersionRow,
    "has_solidworks_drawing" | "has_step" | "has_drawing" | "has_sheet_metal" | "has_stl"
  >
): ElementVersion["availableExports"] => {
  const availableExports: NonNullable<ElementVersion["availableExports"]> = {};

  if (versionRow.has_solidworks_drawing) availableExports.solidworksDrawing = true;
  if (versionRow.has_step) availableExports.step = true;
  if (versionRow.has_drawing) availableExports.drawing = true;
  if (versionRow.has_sheet_metal) availableExports.sheetMetal = true;
  if (versionRow.has_stl) availableExports.stl = true;

  return Object.keys(availableExports).length > 0 ? availableExports : undefined;
};

const databaseFileName = "rnd-pdm.sqlite";
let database: Database.Database | null = null;

const getDatabasePath = (): string => {
  const userDataPath = app.getPath("userData");
  mkdirSync(userDataPath, { recursive: true });
  return path.join(userDataPath, databaseFileName);
};

const getDatabase = (): Database.Database => {
  if (database) return database;

  database = new Database(getDatabasePath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      default_root_path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      project_code TEXT NOT NULL,
      name TEXT NOT NULL,
      root_path TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      project_ref TEXT NOT NULL,
      product_code TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (project_ref) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS elements (
      id TEXT PRIMARY KEY,
      project_ref TEXT NOT NULL,
      product_ref TEXT NOT NULL,
      parent_element_ref TEXT,
      type TEXT NOT NULL,
      part_number TEXT NOT NULL,
      description_slug TEXT NOT NULL,
      FOREIGN KEY (project_ref) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (product_ref) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_element_ref) REFERENCES elements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      element_ref TEXT NOT NULL,
      concept_code TEXT NOT NULL,
      FOREIGN KEY (element_ref) REFERENCES elements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS element_parent_links (
      element_ref TEXT NOT NULL,
      parent_element_ref TEXT NOT NULL,
      PRIMARY KEY (element_ref, parent_element_ref),
      FOREIGN KEY (element_ref) REFERENCES elements(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_element_ref) REFERENCES elements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      concept_ref TEXT NOT NULL,
      major_version INTEGER NOT NULL,
      minor_version INTEGER NOT NULL,
      release_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      has_solidworks_drawing INTEGER NOT NULL DEFAULT 0,
      has_step INTEGER NOT NULL DEFAULT 0,
      has_drawing INTEGER NOT NULL DEFAULT 0,
      has_sheet_metal INTEGER NOT NULL DEFAULT 0,
      has_stl INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (concept_ref) REFERENCES concepts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_project_ref ON products(project_ref);
    CREATE INDEX IF NOT EXISTS idx_elements_product_ref ON elements(product_ref);
    CREATE INDEX IF NOT EXISTS idx_elements_parent_ref ON elements(parent_element_ref);
    CREATE INDEX IF NOT EXISTS idx_parent_links_parent_ref ON element_parent_links(parent_element_ref);
    CREATE INDEX IF NOT EXISTS idx_concepts_element_ref ON concepts(element_ref);
    CREATE INDEX IF NOT EXISTS idx_versions_concept_ref ON versions(concept_ref);
  `);

  const versionColumns = new Set(
    (database.prepare("PRAGMA table_info(versions)").all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  );
  const missingVersionColumns = [
    ["has_solidworks_drawing", "INTEGER NOT NULL DEFAULT 0"],
    ["has_step", "INTEGER NOT NULL DEFAULT 0"],
    ["has_drawing", "INTEGER NOT NULL DEFAULT 0"],
    ["has_sheet_metal", "INTEGER NOT NULL DEFAULT 0"],
    ["has_stl", "INTEGER NOT NULL DEFAULT 0"]
  ].filter(([columnName]) => !versionColumns.has(columnName));

  for (const [columnName, columnDefinition] of missingVersionColumns) {
    database.exec(`ALTER TABLE versions ADD COLUMN ${columnName} ${columnDefinition}`);
  }

  const parentLinkCount = (
    database
      .prepare("SELECT COUNT(*) as count FROM element_parent_links")
      .get() as { count: number | bigint }
  ).count;

  if (Number(parentLinkCount) === 0) {
    const legacyParentLinks = database
      .prepare(
        `
          SELECT id as element_ref, parent_element_ref
          FROM elements
          WHERE parent_element_ref IS NOT NULL
        `
      )
      .all() as ParentLinkRow[];

    const parentLinkStatement = database.prepare(
      `
        INSERT OR IGNORE INTO element_parent_links (element_ref, parent_element_ref)
        VALUES (@element_ref, @parent_element_ref)
      `
    );

    for (const parentLink of legacyParentLinks) {
      parentLinkStatement.run(parentLink);
    }
  }

  database
    .prepare(
      `
        INSERT INTO settings (id, default_root_path)
        VALUES (1, ?)
        ON CONFLICT(id) DO NOTHING
      `
    )
    .run(createInitialState().settings.defaultRootPath);

  return database;
};

const saveStateTxn = (db: Database.Database) =>
  db.transaction((state: AppState) => {
    const sanitizedElements = sanitizeElementParents(state.elements);

    db.prepare("DELETE FROM versions").run();
    db.prepare("DELETE FROM concepts").run();
    db.prepare("DELETE FROM element_parent_links").run();
    db.prepare("DELETE FROM elements").run();
    db.prepare("DELETE FROM products").run();
    db.prepare("DELETE FROM projects").run();

    db.prepare(
      `
        INSERT INTO settings (id, default_root_path)
        VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET default_root_path = excluded.default_root_path
      `
    ).run(state.settings.defaultRootPath);

    const projectStatement = db.prepare(
      `
        INSERT INTO projects (id, project_code, name, root_path)
        VALUES (@id, @project_code, @name, @root_path)
      `
    );
    const productStatement = db.prepare(
      `
        INSERT INTO products (id, project_ref, product_code, name)
        VALUES (@id, @project_ref, @product_code, @name)
      `
    );
    const elementStatement = db.prepare(
      `
        INSERT INTO elements (
          id,
          project_ref,
          product_ref,
          parent_element_ref,
          type,
          part_number,
          description_slug
        )
        VALUES (
          @id,
          @project_ref,
          @product_ref,
          @parent_element_ref,
          @type,
          @part_number,
          @description_slug
        )
      `
    );
    const conceptStatement = db.prepare(
      `
        INSERT INTO concepts (id, element_ref, concept_code)
        VALUES (@id, @element_ref, @concept_code)
      `
    );
    const parentLinkStatement = db.prepare(
      `
        INSERT INTO element_parent_links (element_ref, parent_element_ref)
        VALUES (@element_ref, @parent_element_ref)
      `
    );
    const versionStatement = db.prepare(
      `
        INSERT INTO versions (
          id,
          concept_ref,
          major_version,
          minor_version,
          release_state,
          created_at,
          has_solidworks_drawing,
          has_step,
          has_drawing,
          has_sheet_metal,
          has_stl
        )
        VALUES (
          @id,
          @concept_ref,
          @major_version,
          @minor_version,
          @release_state,
          @created_at,
          @has_solidworks_drawing,
          @has_step,
          @has_drawing,
          @has_sheet_metal,
          @has_stl
        )
      `
    );
    const metaStatement = db.prepare(
      `
        INSERT INTO meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
    );

    for (const project of state.projects) {
      projectStatement.run({
        id: project.id,
        project_code: project.projectId,
        name: project.name,
        root_path: project.rootPath ?? null
      });
    }

    for (const product of state.products) {
      productStatement.run({
        id: product.id,
        project_ref: product.projectId,
        product_code: product.productId,
        name: product.name
      });
    }

    for (const element of sanitizedElements) {
      elementStatement.run({
        id: element.id,
        project_ref: element.projectId,
        product_ref: element.productId,
        parent_element_ref: null,
        type: element.type,
        part_number: element.partNumber,
        description_slug: element.descriptionSlug
      });
    }

    // Insert links only after every element row exists, otherwise a child can reference
    // a valid parent that simply appears later in the save order.
    for (const element of sanitizedElements) {
      for (const parentElementId of element.parentElementIds) {
        parentLinkStatement.run({
          element_ref: element.id,
          parent_element_ref: parentElementId
        });
      }
    }

    for (const element of sanitizedElements) {
      for (const concept of element.concepts) {
        conceptStatement.run({
          id: concept.id,
          element_ref: element.id,
          concept_code: concept.conceptCode
        });

        for (const version of concept.versions) {
          versionStatement.run({
            id: version.id,
            concept_ref: concept.id,
            major_version: version.majorVersion,
            minor_version: version.minorVersion,
            release_state: version.releaseState,
            created_at: version.createdAt,
            has_solidworks_drawing: version.availableExports?.solidworksDrawing ? 1 : 0,
            has_step: version.availableExports?.step ? 1 : 0,
            has_drawing: version.availableExports?.drawing ? 1 : 0,
            has_sheet_metal: version.availableExports?.sheetMetal ? 1 : 0,
            has_stl: version.availableExports?.stl ? 1 : 0
          });
        }
      }
    }

    metaStatement.run("selectedProjectId", state.selectedProjectId ?? "");
    metaStatement.run("selectedProductId", state.selectedProductId ?? "");
  });

export const loadState = (): AppState => {
  const db = getDatabase();
  const settings = db.prepare("SELECT default_root_path FROM settings WHERE id = 1").get() as
    | SettingsRow
    | undefined;
  const projects = db
    .prepare(
      "SELECT id, project_code, name, root_path FROM projects ORDER BY name COLLATE NOCASE, project_code"
    )
    .all() as ProjectRow[];
  const products = db
    .prepare(
      "SELECT id, project_ref, product_code, name FROM products ORDER BY name COLLATE NOCASE, product_code"
    )
    .all() as ProductRow[];
  const elements = db
    .prepare(
      `
        SELECT
          id,
          project_ref,
          product_ref,
          parent_element_ref,
          type,
          part_number,
          description_slug
        FROM elements
      `
    )
    .all() as ElementRow[];
  const concepts = db
    .prepare("SELECT id, element_ref, concept_code FROM concepts ORDER BY concept_code")
    .all() as ConceptRow[];
  const parentLinks = db
    .prepare(
      `
        SELECT element_ref, parent_element_ref
        FROM element_parent_links
        ORDER BY parent_element_ref, element_ref
      `
    )
    .all() as ParentLinkRow[];
  const versions = db
    .prepare(
      `
        SELECT
          id,
          concept_ref,
          major_version,
          minor_version,
          release_state,
          created_at,
          has_solidworks_drawing,
          has_step,
          has_drawing,
          has_sheet_metal,
          has_stl
        FROM versions
        ORDER BY major_version DESC, minor_version DESC, created_at DESC
      `
    )
    .all() as VersionRow[];
  const metaRows = db.prepare("SELECT key, value FROM meta").all() as MetaRow[];
  const meta = new Map(metaRows.map((row) => [row.key, row.value]));

  const versionsByConceptId = new Map<string, ElementVersion[]>();
  for (const version of versions) {
    const bucket = versionsByConceptId.get(version.concept_ref) ?? [];
    bucket.push({
      id: version.id,
      majorVersion: version.major_version,
      minorVersion: version.minor_version,
      releaseState: version.release_state,
      createdAt: version.created_at,
      availableExports: getVersionExportState(version)
    });
    versionsByConceptId.set(version.concept_ref, bucket);
  }

  const conceptsByElementId = new Map<string, ElementConcept[]>();
  for (const concept of concepts) {
    const bucket = conceptsByElementId.get(concept.element_ref) ?? [];
    bucket.push({
      id: concept.id,
      conceptCode: concept.concept_code,
      versions: versionsByConceptId.get(concept.id) ?? []
    });
    conceptsByElementId.set(concept.element_ref, bucket);
  }

  const parentIdsByElementId = new Map<string, string[]>();
  for (const parentLink of parentLinks) {
    const bucket = parentIdsByElementId.get(parentLink.element_ref) ?? [];
    bucket.push(parentLink.parent_element_ref);
    parentIdsByElementId.set(parentLink.element_ref, bucket);
  }

  return {
    settings: {
      defaultRootPath: settings?.default_root_path ?? createInitialState().settings.defaultRootPath
    },
    projects: projects.map((project) => ({
      id: project.id,
      projectId: project.project_code,
      name: project.name,
      rootPath: project.root_path ?? undefined
    })),
    products: products.map((product) => ({
      id: product.id,
      projectId: product.project_ref,
      productId: product.product_code,
      name: product.name
    })),
    elements: sanitizeElementParents(elements.map((element) => ({
      id: element.id,
      projectId: element.project_ref,
      productId: element.product_ref,
      parentElementIds: parentIdsByElementId.get(element.id) ?? [],
      type: element.type,
      partNumber: element.part_number,
      descriptionSlug: element.description_slug,
      concepts: conceptsByElementId.get(element.id) ?? []
    }))),
    selectedProjectId: meta.get("selectedProjectId") || undefined,
    selectedProductId: meta.get("selectedProductId") || undefined
  };
};

export const saveState = (state: AppState): void => {
  const db = getDatabase();
  saveStateTxn(db)(state);
};

export const getStateDatabasePath = (): string => getDatabasePath();
