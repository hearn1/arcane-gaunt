/**
 * CooldownRing — reusable conic-gradient cooldown ring component.
 *
 * PUBLIC API (consumed by this module and reused by issue #101 — blink ring):
 *
 *   const ring = new CooldownRing(parentEl, options);
 *   ring.setProgress(0..1);   // 0 = empty/on-cooldown, 1 = full/ready
 *   ring.setColor(cssColor);  // e.g. "#9a6cff" or "rgba(92,200,255,0.8)"
 *   ring.destroy();           // remove from DOM
 *
 * The ring renders as an absolutely-positioned <div class="cd-ring"> inside
 * parentEl, sized to cover the parent. It uses a conic-gradient on the border
 * via a ::before pseudo-element driven by the CSS custom property --cd (0..1).
 * No canvas; no extra pointer-event area.
 *
 * Options:
 *   size      — ring diameter in px (default: 28)
 *   thickness — ring stroke width in px (default: 3)
 *   color     — initial ring color CSS string (default: "rgba(255,255,255,0.7)")
 *   className — extra class(es) to add to the ring element (default: "")
 */
export class CooldownRing {
  constructor(parentEl, options = {}) {
    const {
      size = 28,
      thickness = 3,
      color = "rgba(255,255,255,0.7)",
      className = "",
    } = options;

    this._el = document.createElement("div");
    this._el.className = "cd-ring" + (className ? " " + className : "");
    this._el.style.setProperty("--cd", "1");
    this._el.style.setProperty("--cd-color", color);
    this._el.style.setProperty("--cd-size", size + "px");
    this._el.style.setProperty("--cd-thickness", thickness + "px");
    parentEl.appendChild(this._el);
  }

  /**
   * Update the ring fill. progress is 0..1:
   *   1 = fully filled (spell ready)
   *   0 = empty (full cooldown)
   * The ring drains clockwise as the spell cools down.
   * @param {number} progress — 0..1
   */
  setProgress(progress) {
    this._el.style.setProperty("--cd", Math.max(0, Math.min(1, progress)).toFixed(4));
  }

  /**
   * Change the ring color. Accepts any CSS color string.
   * @param {string} cssColor
   */
  setColor(cssColor) {
    this._el.style.setProperty("--cd-color", cssColor);
  }

  /**
   * Remove the ring from the DOM and release all references.
   */
  destroy() {
    this._el.remove();
    this._el = null;
  }

  /** The underlying DOM element, for callers that need direct DOM access. */
  get el() { return this._el; }
}

/**
 * Convert a Three.js / spellDefinitions numeric hex color (e.g. 0x9a6cff)
 * to a CSS hex string (e.g. "#9a6cff").
 * @param {number} hex
 * @returns {string}
 */
export function numericColorToCss(hex) {
  return "#" + (hex >>> 0).toString(16).padStart(6, "0");
}
