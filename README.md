# Rommel en doe wat (R&D)

Lightweight PDM MVP for prototype engineering workflows.

## Stack

- React + TypeScript + Vite
- Electron desktop shell
- SQLite persistence (`better-sqlite3`)
- PWA base via `vite-plugin-pwa` (manifest + SW + install icons)

## Run

```bash
npm install
npm run dev
```

Desktop dev:

```bash
npm run dev:desktop
```

## Quality Gate

```bash
npm run check
```

## Windows Build

```bash
npm run dist:win
```

Artifacts:

- `release/Rommel en doe wat Setup 0.1.0.exe`
- `release/Rommel en doe wat 0.1.0.exe`

## MVP Features

- Project/Product management
- Engineering element tree (`HA|SA|MM|PA`)
- Concept management (`A`, `B`, ...)
- Versioning: major (`vN`) + minor (`vN-M`)
- Release states (`PT|PR|RL|RR`)
- Filename generation + one-click copy
- Linked/suggested SolidWorks path + desktop open/reveal actions
- Configurable root path in settings
