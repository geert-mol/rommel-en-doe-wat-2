# Rommel en doe wat (R&D) - Product Concept

## 1) Product Summary

Rommel en doe wat is a lightweight PDM tool for SolidWorks prototype development.

Purpose:

- Keep project/product structures organized.
- Track concept and version history per engineering element.
- Auto-generate correct file names.
- Link records to real SolidWorks files on disk.

## 2) Goals

- Reduce naming mistakes and manual admin.
- Make latest valid concept/version instantly visible.
- Make file creation/opening from one place.
- Support release maturity flow: Prototype -> Pre-release -> Release -> Re-release.

## 3) Target Users

- Product/design engineers using SolidWorks.
- Small hardware teams managing many iterations.
- Technical leads who need traceable concept/version history.

## 4) Scope (MVP)

- Create Projects.
- Create Products inside Projects.
- Build product structure with element types:
  - `MM` (Moeder model)
  - `HA` (Hoofd assembly)
  - `SA` (Sub assembly)
  - `PA` (Part)
- For each element:
  - create Concept (`A`, `B`, ...)
  - create Version:
    - major (`v1` -> `v2`)
    - minor (`v1-1`, `v1-2`, ...)
  - set Release State
  - generate filename
  - copy filename with one click
  - link/open SolidWorks file when found/linked
- Settings for configurable project root folder.

## 5) Core Concepts

### 5.1 Hierarchy

- Project
- Product
- Element tree (HA/SA/MM/PA), where:
  - HA/SA can contain HA/SA/MM/PA children
  - MM/PA are leaf by default (can be extended later if needed)

### 5.2 Concept + Version Model

- Each Element has one or more Concepts (`A` default).
- Each Concept has one or more Versions (`v1` default).
- Version kinds:
  - Major: `vN` (large design change)
  - Minor: `vN-M` (small change within major)
- UI default: show latest version only per concept.
- Optional expand: show full version history under each concept.

### 5.3 Release State

- Default state: `PT` (Prototype)
- Pogression:
  - `PT` -> `PR` (Pre-release) -> `RL` (Release) -> `RR` (Re-release)
- User can set it to any state without limitation
- State code is part of filename.

## 6) Refined Data Model

Recommended entities:

### 6.1 Project

- `project_id` (string, e.g. `013`)
- `name`
- `root_path` (inherited default from settings; override optional)

### 6.2 Product

- `product_id` (string, e.g. `009`)
- `project_id` (FK)
- `name`

### 6.3 Element

- `element_id` (internal UUID/int)
- `project_id` (FK)
- `product_id` (FK)
- `parent_element_id` (nullable FK; assembly relation)
- `type` (`HA|SA|MM|PA`)
- `part_number` (string, e.g. `00`)
- `description_slug` (e.g. `balkon-mini-vijver`)

### 6.4 ElementConcept

- `concept_id` (internal)
- `element_id` (FK)
- `concept_code` (`A`, `B`, ...)

### 6.5 ElementVersion

- `version_id` (internal)
- `concept_id` (FK)
- `major_version` (int, default `1`)
- `minor_version` (int, default `0`; `0` means major only)
- `release_state` (`PT|PR|RL|RR`)
- `file_name` (generated)
- `file_path` (nullable; linked when detected)
- `is_latest` (derived/indexed)
- `created_at`

## 7) Filename Standard

Pattern:
`{STATE}_{PROJECT}-{PRODUCT}_{CONCEPT}_{TYPE}_{PART}_{DESCRIPTION}_{VERSION}`

Example:
`PT_013-009_A_MM_00_balkon-mini-vijver_v1`

Rules:

- `STATE`: `PT|PR|RL|RR`
- `PROJECT`: 3-digit string
- `PRODUCT`: 3-digit string
- `CONCEPT`: letter (`A` default)
- `TYPE`: `MM|HA|SA|PA`
- `PART`: 2+ digit part number
- `DESCRIPTION`: kebab-case
- `VERSION`:
  - major: `v1`, `v2`
  - minor: `v1-1`, `v2-3`

## 8) File Linking Behavior

- Configurable root folder in Settings, e.g.:
  - `.../{ProjectName}/Product/Engineering/`
- Match strategy:
  - User clicks open, which opens file explores with the defined path based on root path and object filename
- UI actions:
  - copy generated filename
  - reveal in folder

## 9) Main UI Requirements

- Project list -> Product view -> hierarchical engineering tree.
- Tree grouped by assembly nesting.
- Each element row shows concept groups (A/B/...).
- Each concept shows latest version by default.
- Expand per concept to view historical versions.
- Quick actions on row:
  - New Concept
  - New Major Version
  - New Minor Version
  - Change Release State
  - Copy Filename
  - Open File (if linked)
