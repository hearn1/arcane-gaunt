# Privacy Policy

**ArcaneGaunt** does not collect, transmit, or store any personal data off your device.

## Network & Telemetry

- No remote telemetry, analytics, or crash reporting is transmitted over the network.
- No usage data, session recordings, or personal information is sent to any server.
- The game makes no outbound network connections during normal operation.
- The only network activity that may occur is asset loading from the local origin (`arcane://` in the Electron build, `http://localhost` or `file://` in development) — no external domains are contacted.

## Local Data Storage

### Save Files

Game settings and profile data are stored locally on your machine:

- **Windows (Electron build):** `%APPDATA%/ArcaneGaunt/saves/settings.v1.json` and `%APPDATA%/ArcaneGaunt/saves/profile.v1.json`
- **Browser development:** `localStorage` keys `arcaneGaunt.settings.v1` and `arcaneGaunt.profile.v1`

These files contain only game state: settings preferences, best-run records, and aggregate statistics. No personal identifiers, credentials, or system information are stored.

### Log Files

The Electron build writes local diagnostic logs:

- `%APPDATA%/ArcaneGaunt/logs/renderer.log` — renderer errors and unhandled promise rejections.
- `%APPDATA%/ArcaneGaunt/logs/main.log` — main-process startup and runtime errors.

These logs are not transmitted anywhere. They exist solely for debugging crashes and are not uploaded or shared unless you manually provide them to a developer.

## Steam Cloud

When launched through Steam with Cloud Sync enabled, the save directory (`%APPDATA%/ArcaneGaunt/saves/`) is synchronised to Steam Cloud under Valve's standard Steam Cloud privacy policy. ArcaneGaunt does not control or extend that sync behaviour — refer to Valve's Steam privacy policy for details on how Steam Cloud handles your data.

## Third-Party Libraries

ArcaneGaunt bundles third-party software components that operate entirely locally:

- **three.js** (MIT) — 3D rendering, loaded from local vendored files.
- **steamworks.js** (MIT) — Steam SDK bridge, only active when the game is launched through Steam.

Neither library transmits data off-device beyond what Steam itself does when the Steam client is running.

## Changes

If ArcaneGaunt's data practices change in a future update, this policy will be updated accordingly and the version-controlled history will document the change.
