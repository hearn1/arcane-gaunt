# feature_4 — SteamPipe Build Scripts

## Rationale

To upload a build to Steam we need SteamPipe app/depot VDF scripts that
reference the `dist/win-unpacked/` output, plus documentation for the build
operator. Without these files, every release would be a manual SteamCMD
session, which is error-prone and not reproducible.

## Depends On

- **feature_3 (Electron Metadata)** — SteamPipe scripts upload an executable
  with a stable productName, AppUserModelID, and icon. Doing this before
  metadata is set means re-uploading once the metadata lands.
- **feature_2 (Smoke Tests)** is _recommended_ before first SteamPipe push
  so we have an automated check the upload still boots cleanly.

## Files Touched

### Created

- `steampipe/app_build_arcane.vdf` — App build script, references one or
  more depots. App ID is left as a placeholder (`__APPID__`) until the
  Steamworks account assigns one.
- `steampipe/depot_build_arcane_windows.vdf` — Windows depot, includes
  `..\dist\win-unpacked\*` recursively, excludes obvious leftovers
  (e.g. `*.pdb`, `LICENSES.chromium.html` is intentionally kept,
  `*.map` excluded).
- `steampipe/README.md` — Operator-facing guide:
  - How to install SteamCMD.
  - How to log in and run `app_build` with the script.
  - How to substitute `__APPID__` and `__DEPOTID__` placeholders.
  - How to push to a private branch (`internal-test`) first.
  - How launch options should be configured in the Steamworks partner site
    (`ArcaneGaunt.exe`, no args, working dir = install root).
- `scripts/prep_steam_upload.ps1` — Optional helper that runs
  `npm run pack:win` and then prints the SteamPipe command line. Pure
  convenience wrapper; does not call SteamCMD itself.

### Modified

- `package.json`
  - Add a new script entry `"steam:prep": "npm run pack:win"` so the
    workflow is one-command.
  - No `electron-builder` config changes.
- `README.md`
  - Add a new "Steam upload" section that references
    `steampipe/README.md` and notes that SteamCMD/Steamworks credentials
    are not bundled.
- `.gitignore`
  - Ignore `steampipe/build_output/` and any `steam_appid.txt` produced by
    local SteamCMD runs.

## Implementation Plan

1. Author `steampipe/app_build_arcane.vdf` using the standard Steamworks
   template:
   ```
   "appbuild"
   {
     "appid"   "__APPID__"
     "desc"    "ArcaneGaunt Windows build"
     "buildoutput" "build_output"
     "contentroot" ".."
     "setlive" ""
     "preview" "0"
     "local"   ""
     "depots"
     {
       "__DEPOTID__" "depot_build_arcane_windows.vdf"
     }
   }
   ```
2. Author `steampipe/depot_build_arcane_windows.vdf`:
   ```
   "DepotBuildConfig"
   {
     "DepotID" "__DEPOTID__"
     "ContentRoot" "..\dist\win-unpacked\"
     "FileMapping"
     {
       "LocalPath" "*"
       "DepotPath" "."
       "recursive" "1"
     }
     "FileExclusion" "*.pdb"
     "FileExclusion" "*.map"
     "FileExclusion" "**/*.log"
   }
   ```
3. Write `steampipe/README.md` with:
   - Download link / install steps for SteamCMD (no actual binary
     committed).
   - Login: `steamcmd +login <user> +run_app_build "<full path to vdf>" +quit`.
   - Placeholder substitution checklist.
   - Branch strategy (push first to `internal-test`, only promote to
     default after manual smoke pass on a Steam Deck or Windows VM).
   - Launch options to configure in Steamworks:
     - Executable: `ArcaneGaunt.exe`
     - Arguments: (none)
     - Working directory: (blank — defaults to install root)
     - OS: Windows
     - Architecture: 64-bit
4. Write `scripts/prep_steam_upload.ps1` that runs
   `npm run pack:win` and emits the SteamCMD invocation string with
   placeholders for the operator to copy.
5. Update `package.json` scripts (just add `"steam:prep"`).
6. Update `README.md` with the new section and a pointer to the steampipe
   folder.
7. Update `.gitignore` to keep generated `build_output/` and SteamCMD
   appid files out of source control.

## Verification

### Automated

- N/A — SteamPipe is an external CLI; no in-repo smoke check applies.

### Manual

- Run `npm run pack:win`. Confirm `dist/win-unpacked/ArcaneGaunt.exe` exists.
- With SteamCMD installed and a Steamworks login, run:
  ```
  steamcmd +login <user> +run_app_build "<repo>\steampipe\app_build_arcane.vdf" +quit
  ```
  with the placeholders substituted. Confirm a successful "Build complete"
  message and a populated `steampipe/build_output/` folder.
- Push to a private `internal-test` branch on Steamworks; install via
  Steam client; confirm the game launches from Steam and the AppUserModelID
  / icon (from feature_3) carry through.
- Re-run after a code change; confirm SteamPipe correctly bundles only the
  newly built `dist/win-unpacked/` contents.

### Console / logs

- SteamCMD output is captured by the operator; no in-game logs change.
- After install via Steam, `%APPDATA%/ArcaneGaunt/saves/` and `.../logs/`
  are still the active save/log locations (Steamworks-driven Cloud sync is
  a separate feature_6).

## Guardrails

- Do not commit Steamworks credentials, App IDs, Depot IDs, or any
  partner-specific secrets. The VDF files ship with explicit `__APPID__`
  / `__DEPOTID__` placeholders documented in the README.
- Do not commit SteamCMD binaries into the repo.
- Do not include `dist/` contents in the depot via wildcard tricks that
  could sweep in development artifacts — the `ContentRoot` must point at
  `dist/win-unpacked/` only.
- Do not modify gameplay code, electron main process, or any `src/` file.
- Do not enable Steam Input config push or Steamworks SDK integration in
  this feature — that belongs to feature_6.
- Do not weaken the asar/contextIsolation/sandbox settings in
  electron/main.cjs to satisfy the upload pipeline.
- Do not assume Linux/macOS depots — Windows-only for the first release.
  Adding additional depots is a future feature.
