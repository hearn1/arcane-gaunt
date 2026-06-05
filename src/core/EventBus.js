// Tiny synchronous event bus for gameplay events.
// Subscribers are added with .on(name, fn) and removed with .off(name, fn).
// Events fire synchronously; no queuing, no throttling (throttle at the consumer).
export class EventBus {
  constructor() {
    this._listeners = {};
  }

  on(name, fn) {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(fn);
  }

  off(name, fn) {
    if (!this._listeners[name]) return;
    this._listeners[name] = this._listeners[name].filter((f) => f !== fn);
  }

  emit(name, payload) {
    const fns = this._listeners[name];
    if (!fns || fns.length === 0) return;
    for (const fn of fns) {
      try { fn(payload); } catch (e) { /* consumers must not crash the game loop */ }
    }
  }
}
