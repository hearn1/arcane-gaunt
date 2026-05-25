# feature_3 — Electron Metadata

## Rationale

The packaged build currently ships with the default Electron icon, an
auto-generated AppUserModelID, and no Windows version-info resource. For a
Steam release the executable, taskbar entry, installer, and About dialog all
need a consistent ArcaneGaunt identity. Without this, the .exe shows as
"electron.exe" in some Windows contexts, the taskbar groups oddly, and Steam's
file integrity tools flag missing version data.

## Depends On

- None (standalone). Can land independently of feature_1, feature_2, and
  feature_4.

## Files Touched

### Created

- `assets/icons/arcane.ico` — Windows multi-resolution icon (16, 24, 32, 48,
  64, 128, 256). Authored from a CC0 base (see Guardrails) or a placeholder
  silhouette; documented in `CREDITS.md`.
- `assets/icons/arcane.png` — 512×512 PNG used by electron-builder for
  Linux/Mac stubs and as a fallback for any future Steam app shortcut art.
- `assets/icons/icon_sources/README.md` — Notes on how the icons were
  generated (source SVG, sizes baked, conversion tool) so the next pass can
  re-export consistently.

### Modified

- `package.json`
  - Bump `description` to something user-facing (e.g.
    "ArcaneGaunt — a first-person wizard roguelike").
  - Add `author`, `homepage`, and `license` fields (license: "UNLICENSED"
    or whatever the project chooses; verify in feature_7).
  - Add `build.appId`, `build.productName` (already set), and
    `build.copyright` (e.g. "Copyright © 2026").
  - Set `build.win.icon` to `assets/icons/arcane.ico`.
  - Set `build.win.executableName` to `ArcaneGaunt` (matches productName).
  - Set `build.nsis.installerIcon` and `uninstallerIcon` to the new .ico.
  - Set `build.fileAssociations: []` explicitly (we don't register any).
  - Add `build.extraMetadata.version` parity check.
  - Add `build.win.legalTrademarks` if applicable, or omit cleanly.
- `electron/main.cjs`
  - Call `app.setAppUserModelId("com.arcanegaunt.game")` immediately after
    `app.setName(...)` so Windows taskbar grouping uses the correct ID.
  - Set the `BrowserWindow` `icon` property to the resolved
    `assets/icons/arcane.ico` (falls back gracefully if missing).
  - Use `path.join(app.getAppPath(), "assets/icons/arcane.ico")` resolution
    that works under both `npm start` and packaged `asar`.
- `index.html`
  - Add `<link rel="icon" href="assets/icons/arcane.png" type="image/png">`
    so the Electron window and browser favicon are consistent.
  - Confirm `<title>ArcaneGaunt</title>` matches productName.
- `README.md`
  - Note where to find the icon source and how to regenerate it.
  - Update the "Notes for later Steam polish" block to reflect that icons,
    productName, and AppUserModelID are now set (with feature_3 marked done).
- `CREDITS.md`
  - Add a row for the icon source (must be CC0 or original work; do not
    bundle non-CC0 art).

## Implementation Plan

1. Author or source a CC0 ArcaneGaunt icon SVG (placeholder is acceptable
   for v1, e.g. a stylized "AG" sigil with the existing purple gradient).
   Save it under `assets/icons/icon_sources/arcane.svg`.
2. Export multi-resolution `.ico` and a 512×512 `.png` using a documented
   tool (notes recorded in `assets/icons/icon_sources/README.md`).
3. Update `package.json`:
   - Add `description`, `author`, `license`, `homepage`.
   - Add `build.win.icon`, `build.nsis.installerIcon`,
     `build.nsis.uninstallerIcon`, `build.copyright`,
     `build.win.executableName`.
4. Modify `electron/main.cjs`:
   - Call `app.setAppUserModelId("com.arcanegaunt.game")` after
     `app.setName`.
   - Resolve the icon path with `path.join(app.getAppPath(), "assets/icons/arcane.ico")`
     and pass it as `icon` to the `BrowserWindow` constructor.
   - Guard with `fs.existsSync` so a missing icon doesn't crash startup;
     fall back to default and `reportMainError("icon-missing", ...)`.
5. Update `index.html` favicon and document title comments.
6. Update `README.md` and `CREDITS.md`.
7. Run `npm run pack:win` and confirm:
   - `dist/win-unpacked/ArcaneGaunt.exe` has the ArcaneGaunt icon visible in
     Explorer.
   - Right-click → Properties → Details shows the productName, copyright,
     and version 0.1.0 from package.json.
   - Launching the .exe shows the correct icon in the taskbar and the
     window title bar.
8. Run `npm run dist:win` and `npm run dist:portable`; verify the installer
   and portable launcher both show the new icon and metadata.

## Verification

### Automated

- `?smoke=boot-start-menu` continues to pass — icon load is best-effort and
  doesn't gate startup. (No new automated coverage; metadata is a build-side
  concern.)

### Manual (Electron)

- `npm start` from source: window title is "ArcaneGaunt", taskbar icon is
  the new icon.
- `npm run pack:win` → `dist/win-unpacked/ArcaneGaunt.exe`:
  - File properties show productName, copyright, fileVersion, productVersion.
  - Taskbar groups under the new AppUserModelID (no longer "electron").
- `npm run dist:win`:
  - Installer .exe is named consistently (e.g.
    "ArcaneGaunt Setup 0.1.0.exe") and shows the icon in Explorer.
  - Installed Start Menu and desktop shortcuts use the ArcaneGaunt icon.
- `npm run dist:portable`:
  - Portable single-file launcher shows the new icon.

### Console / logs

- No new entries in `main.log` other than (optionally) the "icon-missing"
  fallback if the .ico file is absent in a partial build.
- `arcane:storage-meta` and other IPC handlers continue to return data
  with no errors.

## Guardrails

- Do not bundle non-CC0 icon art. If a placeholder silhouette is used,
  attribute it correctly in `CREDITS.md`.
- Do not change the appId (`com.arcanegaunt.game`) — Steam Cloud / save
  paths are tied to this through `app.getPath("userData")`. Changing it
  would orphan existing user saves.
- Do not modify gameplay, ui.js, or any `src/` non-electron module.
- Do not introduce a build step (icon should be a static checked-in asset,
  not generated at build time).
- Do not register file associations or URL protocol handlers — the
  `arcane://` scheme is internal-only and remains so.
- Do not raise the Electron `nodeIntegration` or weaken `contextIsolation`
  to satisfy any icon resolution path.
