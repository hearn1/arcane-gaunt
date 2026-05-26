let _available = false
let _bridgeChecked = false

function _bridge() {
  if (_bridgeChecked) return _available
  _bridgeChecked = true
  _available = typeof window !== "undefined" && !!window.arcaneSteam?.event
  return _available
}

export function steamAvailable() {
  return _bridge() || _available
}

export function steamEvent(name, payload) {
  if (!_bridge()) return
  try {
    window.arcaneSteam.event(name, payload)
  } catch (err) {
    console.warn("[steam] event failed", name, err)
  }
}
