import { Gamepad } from "./Gamepad.js";

const STICK_DEADZONE = 0.18;

export class Input {
  constructor(domElement, settings = null) {
    this.dom = domElement;
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this._mouseFiring = false;
    this._mouseRightDown = false;
    this._gpFiring = false;
    this._gpRightDown = false;
    this.locked = false;
    this._selectSpell = -1;
    this._wheel = 0;
    this.onBlink = null;
    this.onPause = null;
    this._settings = settings;
    this._bindings = settings?.controls?.keyBindings || {};

    this.gamepad = new Gamepad();
    this.lastInputDevice = "kbm";
    this._lookAxes = { x: 0, y: 0 };
    this.leftStickX = 0;
    this.leftStickY = 0;

    addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (this.lastInputDevice !== "kbm") this.lastInputDevice = "kbm";
      if (e.code >= "Digit1" && e.code <= "Digit9") {
        this._selectSpell = parseInt(e.code.slice(5), 10);
      }
      if (e.code === this._bindings?.blink || e.code === "ShiftLeft" || e.code === "KeyQ") {
        if (this.onBlink) this.onBlink();
      }
      if (e.code === this._bindings?.pause || e.code === "Escape") {
        if (this.onPause) this.onPause();
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
      if (this.lastInputDevice !== "kbm") this.lastInputDevice = "kbm";
      const castBtnId = this._bindings?.cast;
      const blockBtnId = this._bindings?.block;
      if (e.button === 0 && castBtnId === "Mouse0") this._mouseFiring = true;
      if (e.button === 2 && blockBtnId === "Mouse2") this._mouseRightDown = true;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this._mouseFiring = false;
      if (e.button === 2) this._mouseRightDown = false;
    });
    addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("wheel", (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this._wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  get firing() { return this._mouseFiring || this._gpFiring; }
  get rightDown() { return this._mouseRightDown || this._gpRightDown; }

  rebind(action, key) {
    this._bindings[action] = key;
  }

  setBindings(bindings) {
    this._bindings = { ...this._bindings, ...bindings };
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
    this._mouseFiring = false;
    this._mouseRightDown = false;
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

  consumeStickLook(dt) {
    const d = { x: this._lookAxes.x, y: this._lookAxes.y };
    this._lookAxes.x = 0;
    this._lookAxes.y = 0;
    d.x *= dt;
    d.y *= dt;
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

  pump(dt) {
    const gp = this.gamepad.poll();
    if (!gp.active) return;

    const hasInput = gp.buttons.some(Boolean) || gp.axes.some((a) => Math.abs(a) > 0.05);
    if (hasInput && this.lastInputDevice !== "gamepad") this.lastInputDevice = "gamepad";

    this._lookAxes.x += gp.axes[2];
    this._lookAxes.y += gp.axes[3];

    this.leftStickX = gp.axes[0];
    this.leftStickY = gp.axes[1];

    this._gpFiring = gp.buttons[0] || gp.buttons[7];
    this._gpRightDown = gp.buttons[6];

    if (gp.justPressed[1]) this.onBlink?.();
    if (gp.justPressed[9]) this.onPause?.();

    if (gp.justPressed[4]) this._wheel -= 1;
    if (gp.justPressed[5]) this._wheel += 1;
  }

  down(code) { return !!this.keys[code]; }
  clearKeys() {
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this._mouseFiring = false;
    this._mouseRightDown = false;
    this._gpFiring = false;
    this._gpRightDown = false;
    this._selectSpell = -1;
    this._wheel = 0;
    this._lookAxes.x = 0;
    this._lookAxes.y = 0;
    this.leftStickX = 0;
    this.leftStickY = 0;
  }
}