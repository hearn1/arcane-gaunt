export class Captions {
  constructor() {
    this._enabled = false;
    this._captions = [];
    this._el = document.createElement("div");
    this._el.id = "captions-overlay";
    Object.assign(this._el.style, {
      position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)",
      zIndex: "1000", textAlign: "center", pointerEvents: "none",
      fontFamily: "sans-serif", fontSize: "18px", lineHeight: "1.6",
      display: "none", flexDirection: "column", alignItems: "center", gap: "4px",
    });
    document.body.appendChild(this._el);
  }

  setEnabled(on) {
    this._enabled = on;
    this._el.style.display = on ? "flex" : "none";
    if (!on) this._clear();
  }

  show(text, durationMs = 1500) {
    if (!this._enabled) return;
    const line = document.createElement("div");
    line.textContent = text;
    Object.assign(line.style, {
      background: "rgba(0,0,0,0.7)", color: "#fff", padding: "4px 14px",
      borderRadius: "6px", opacity: "1", transition: "opacity 0.3s",
    });
    this._el.appendChild(line);
    this._captions.push(line);
    while (this._captions.length > 3) {
      const old = this._captions.shift();
      old.remove();
    }
    setTimeout(() => {
      line.style.opacity = "0";
      setTimeout(() => {
        line.remove();
        this._captions = this._captions.filter((c) => c !== line);
      }, 300);
    }, durationMs);
  }

  _clear() {
    for (const c of this._captions) c.remove();
    this._captions = [];
  }
}
