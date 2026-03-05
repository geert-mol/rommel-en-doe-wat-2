# Rommel en doe wat (R&D)

Lightweight PDM MVP for prototype engineering workflows.

## Stack

- React + TypeScript + Vite
- Local-first state (`localStorage`)
- PWA base via `vite-plugin-pwa` (manifest + SW + install icons)

## Run

```bash
npm install
npm run dev
```

## Quality Gate

```bash
npm run check
```

## MVP Features

- Project/Product management
- Engineering element tree (`HA|SA|MM|PA`)
- Concept management (`A`, `B`, ...)
- Versioning: major (`vN`) + minor (`vN-M`)
- Release states (`PT|PR|RL|RR`)
- Filename generation + one-click copy
- Linked/suggested SolidWorks path + open action
- Configurable root path in settings
