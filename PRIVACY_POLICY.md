# Privacy Policy

**ArcaneGaunt** does not collect, transmit, or store any personal data off your device unless you explicitly opt in.

## Network & Telemetry

### Default (Telemetry Disabled)

- No remote telemetry, analytics, or crash reporting is transmitted over the network.
- No usage data, session recordings, or personal information is sent to any server.
- The game makes no outbound network connections during normal operation.
- The only network activity that may occur is asset loading from the local origin (`arcane://` in the Electron build, `http://localhost` or `file://` in development) — no external domains are contacted.

### Opt-In Telemetry

You may choose to enable anonymous telemetry from the first-launch prompt or the Settings → Privacy panel. When enabled, the following data is transmitted to Sentry ([sentry.io/privacy](https://sentry.io/privacy/)):

- **Crash reports** — stack traces, error messages, and the last 50 lines of console output when a fatal error occurs.
- **Run events** — anonymised run start and completion events containing level reached, gold earned, kills, starter spell, and difficulty tier.
- **Device identifier** — a randomly generated UUID stored in your settings file. This is not linked to your identity, IP address, or any other personal information.

No personal information (name, email, IP address, geolocation, or system files) is collected. The UUID is used solely to deduplicate crash reports and estimate unique installs.

Telemetry can be disabled at any time from Settings → Privacy. Disabling will stop all data transmission immediately. Previously sent data cannot be recalled from Sentry's servers.

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
