import * as Sentry from "@sentry/browser";

const SENTRY_DSN = "https://b9c937034ec22f925b6ce86c5d3d9324@o4511467162304512.ingest.us.sentry.io/4511467176984576";

let _initialized = false;
let _uuid = null;

export function init(settings) {
  if (_initialized) return;
  if (!settings.privacy?.telemetryEnabled) return;
  _uuid = settings.privacy?.telemetryUuid;
  if (!_uuid) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    beforeSend(event) {
      if (event.tags) event.tags.telemetryUuid = _uuid;
      return event;
    },
  });

  _initialized = true;
}

export function setEnabled(settings) {
  const nowEnabled = settings.privacy?.telemetryEnabled === true && !!settings.privacy?.telemetryUuid;
  if (nowEnabled && !_initialized) {
    init(settings);
  } else if (!nowEnabled && _initialized) {
    _initialized = false;
    _uuid = null;
    Sentry.close();
  }
}

export function track(eventName, payload = {}) {
  if (!_initialized) return;

  Sentry.addBreadcrumb({
    category: "game.event",
    message: eventName,
    level: "info",
    data: payload,
  });
}

export function trackException(error, context = {}) {
  if (!_initialized) return;

  Sentry.withScope((scope) => {
    scope.setTag("telemetryUuid", _uuid);
    scope.setExtras(context);
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage(String(error), {
        level: "fatal",
        extra: context,
        tags: { telemetryUuid: _uuid },
      });
    }
  });
}

export function shutdown() {
  if (!_initialized) return;
  _initialized = false;
  _uuid = null;
  Sentry.close();
}
