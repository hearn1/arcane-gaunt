const AXIS_DEADZONE = 0.18;

function applyCurve(val) {
  const sign = Math.sign(val);
  const mag = Math.abs(val);
  if (mag <= AXIS_DEADZONE) return 0;
  const norm = (mag - AXIS_DEADZONE) / (1 - AXIS_DEADZONE);
  return sign * norm * norm;
}

export class Gamepad {
  constructor() {
    this._prevButtons = [];
    this._active = false;
  }

  poll() {
    const pads = navigator.getGamepads();
    let active = false;
    const axes = [0, 0, 0, 0];
    const buttons = new Array(16).fill(false);

    for (const pad of pads) {
      if (!pad) continue;
      active = true;
      for (let i = 0; i < Math.min(pad.axes.length, 4); i++) {
        axes[i] = applyCurve(pad.axes[i]);
      }
      for (let i = 0; i < Math.min(pad.buttons.length, 16); i++) {
        buttons[i] = pad.buttons[i].pressed;
      }
      break;
    }

    const justPressed = {};
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i] && !this._prevButtons[i]) {
        justPressed[i] = true;
      }
    }
    this._prevButtons = [...buttons];
    this._active = active;

    return { axes, buttons, justPressed, active };
  }
}
