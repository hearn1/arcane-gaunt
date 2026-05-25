// Keyboard + pointer-lock mouse. No gameplay logic here.
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firing = false;
    this.rightDown = false; // right mouse held (block), consumed by Block
    this.locked = false;
    this._selectSpell = -1; // 1..6 set on keydown, consumed by caster
    this._wheel = 0;        // net wheel steps, consumed by caster
    this.onBlink = null;

    addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (e.code >= "Digit1" && e.code <= "Digit9") {
        this._selectSpell = parseInt(e.code.slice(5), 10);
      }
      if (e.code === "ShiftLeft" || e.code === "KeyQ") {
        if (this.onBlink) this.onBlink();
      }
    });
    addEventListener("keyup", (e) => { this.keys[e.code] = false; });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.clearKeys();
      if (this.onLockChange) this.onLockChange(this.locked);
    });

    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.rightDown = true;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.rightDown = false;
    });
    addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("wheel", (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this._wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  requestLock() {
    try {
      const lock = this.dom.requestPointerLock?.();
      if (lock?.catch) lock.catch(() => this._fallbackLock());
    } catch {
      this._fallbackLock();
    }
  }

  _fallbackLock() {
    if (this.locked) return;
    this.locked = true;
    this.onLockChange?.(true);
  }

  exitLock() {
    const wasLocked = this.locked;
    document.exitPointerLock?.();
    this.firing = false;
    this.rightDown = false;
    if (wasLocked && document.pointerLockElement !== this.dom) {
      this.locked = false;
      this.onLockChange?.(false);
    }
  }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }

  consumeSpellSelect() {
    const s = this._selectSpell;
    this._selectSpell = -1;
    return s;
  }

  consumeWheel() {
    const w = this._wheel;
    this._wheel = 0;
    return w;
  }

  down(code) { return !!this.keys[code]; }
  clearKeys() {
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firing = false;
    this.rightDown = false;
    this._selectSpell = -1;
    this._wheel = 0;
  }
}
