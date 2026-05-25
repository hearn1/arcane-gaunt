# SteamPipe Build Scripts

These scripts upload `dist/win-unpacked/` to Steam using SteamCMD.

## Prerequisites

1. **Steamworks account** with access to the ArcaneGaunt app.
2. **SteamCMD** installed locally:
   - Download from https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip
   - Extract to a folder (e.g. `C:\steamcmd\`)
   - Run `steamcmd.exe +quit` once to let it self-update

## Placeholder Substitution

Before running, replace the placeholders in the VDF files:

| Placeholder | Replace with |
|-------------|--------------|
| `__APPID__` | Your Steamworks App ID (assigned in Steamworks partner site) |
| `__DEPOTID__` | Your Windows depot ID (created in Steamworks → Depots) |

## Build & Upload

1. Package the game:
   ```sh
   npm run pack:win
   ```

2. Log in to SteamCMD and run the build:
   ```sh
   steamcmd +login <your_steam_username> +run_app_build "<full_path_to_repo>\steampipe\app_build_arcane.vdf" +quit
   ```
   You will be prompted for your Steam Guard code and password.

3. On success, SteamCMD prints "Build complete" and outputs are written to `steampipe/build_output/`.

## Branch Strategy

1. **Push to a private branch first** — In Steamworks, configure a `internal-test` branch.
   Set the VDF `setlive` to `internal-test` (or omit it and use the `-branch` parameter).
2. **Smoke-test** — Install the build via the Steam client on a Windows VM or Steam Deck.
   Confirm the game launches, the icon/AppUserModelID are correct, and saves/logs work.
3. **Promote to default** — After passing smoke tests, update `setlive` to an empty string (default branch) or use the Steamworks web UI to promote the build.

## Steamworks Launch Options

Configure these in the Steamworks partner site:

| Setting | Value |
|---------|-------|
| Executable | `ArcaneGaunt.exe` |
| Arguments | (none) |
| Working directory | (blank — defaults to install root) |
| OS | Windows |
| Architecture | 64-bit |

## Helper Script

Run `scripts/prep_steam_upload.ps1` from the repo root to pack and print the SteamCMD command:
```powershell
.\scripts\prep_steam_upload.ps1
```
