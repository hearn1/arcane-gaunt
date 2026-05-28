import * as THREE from "three";
import { t } from "../core/i18n.js";
import { pointInRect } from "../core/ArenaCollision.js";

const GATE_WARN = 1.3;
const GATE_OPEN = 5.5;
const GATE_CLOSE_WARN = 1.2;
const RIFT_WARN = 1.8;
const RIFT_ACTIVE = 4.5;

function hazardCenter(hazard) {
  return new THREE.Vector3(hazard.x, 0.08, hazard.z);
}

function gateCenter(gate) {
  return new THREE.Vector3(gate.x, 0.08, gate.z);
}

export class LayoutEventManager {
  constructor(world) {
    this.world = world;
    this.layoutName = "";
    this.level = 1;
    this.enabled = false;
    this.cooldown = 0;
    this.event = null;
    this._toastLock = 0;
  }

  startWave(level, layoutName, bossPattern = null) {
    this.clear();
    this.level = level;
    this.layoutName = layoutName || "";
    this.enabled = !bossPattern && (this.layoutName === "gates" || this.layoutName === "rift");
    this.cooldown = this.enabled ? 5.5 + Math.random() * 2.5 : 0;
  }

  clear() {
    this.enabled = false;
    this.cooldown = 0;
    this.event = null;
    this._toastLock = 0;
    for (const gate of this._gates()) this._restoreGate(gate);
    for (const hazard of this._hazards()) this._restoreHazard(hazard);
  }

  update(dt) {
    if (this._toastLock > 0) this._toastLock = Math.max(0, this._toastLock - dt);
    if (!this.enabled) return;
    if (this.event) {
      this._updateEvent(dt);
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (this.layoutName === "gates") this._beginGateShift();
    else if (this.layoutName === "rift") this._beginRiftPulse();
  }

  _features() {
    return this.world.arenaBounds.layoutFeatures || {};
  }

  _gates() {
    return this._features().gates || [];
  }

  _hazards() {
    return this.world.arenaBounds.hazards || [];
  }

  _toast(message, ms = 1100) {
    if (this._toastLock > 0) return;
    this._toastLock = 0.7;
    if (this.world.layoutToast) this.world.layoutToast(message, ms);
    else this.world.onCombatProc?.(message);
  }

  _beginGateShift() {
    const gates = this._gates().filter((g) => g.dynamicGate && !g.open);
    if (!gates.length) {
      this.cooldown = 10;
      return;
    }
    const start = Math.floor(Math.random() * gates.length);
    const selected = [gates[start], gates[(start + 2) % gates.length]].filter(Boolean);
    for (const gate of selected) this._markGate(gate, 0x7fffe6);
    this.event = {
      type: "gates",
      phase: "openingWarn",
      t: GATE_WARN,
      gates: selected,
      pulse: 0,
    };
    this._toast(t("toast.gate_shift"), 1300);
    this.world.audio?.telegraphSurge?.();
    for (const gate of selected) this._gateTelegraph(gate, 0x7fffe6);
  }

  _beginRiftPulse() {
    const hazards = this._hazards();
    if (!hazards.length) {
      this.cooldown = 10;
      return;
    }
    for (const hazard of hazards) {
      hazard.dynamicWarn = true;
      hazard.dynamicDamageMult = 1;
    }
    this.event = {
      type: "rift",
      phase: "warn",
      t: RIFT_WARN,
      hazards,
      pulse: 0,
    };
    this._toast(t("toast.rift_surge_leave"), 1500);
    this.world.audio?.telegraphSurge?.();
    for (const hazard of hazards) this._hazardTelegraph(hazard, 0x7fffe6);
  }

  _updateEvent(dt) {
    if (this.event.type === "gates") this._updateGateEvent(dt);
    else if (this.event.type === "rift") this._updateRiftEvent(dt);
  }

  _updateGateEvent(dt) {
    const ev = this.event;
    ev.t -= dt;
    ev.pulse -= dt;
    if (ev.pulse <= 0) {
      ev.pulse = ev.phase === "open" ? 0.9 : 0.45;
      const color = ev.phase === "closingWarn" ? 0xffcf4d : 0x7fffe6;
      for (const gate of ev.gates) this._gateTelegraph(gate, color);
    }

    if (ev.phase === "openingWarn" && ev.t <= 0) {
      for (const gate of ev.gates) this._openGate(gate);
      ev.phase = "open";
      ev.t = GATE_OPEN;
      ev.pulse = 0;
      this._toast(t("toast.gate_open"), 1000);
      return;
    }

    if (ev.phase === "open" && ev.t <= GATE_CLOSE_WARN) {
      ev.phase = "closingWarn";
      ev.t = GATE_CLOSE_WARN;
      ev.pulse = 0;
      for (const gate of ev.gates) this._markGate(gate, 0xffcf4d);
      this._toast(t("toast.gate_closing"), 1400);
      return;
    }

    if (ev.phase === "closingWarn" && ev.t <= 0) {
      const blocked = ev.gates.some((gate) => this._playerInGate(gate));
      if (blocked) {
        ev.t = 0.35;
        ev.pulse = 0;
        return;
      }
      for (const gate of ev.gates) this._closeGate(gate);
      this.event = null;
      this.cooldown = 14 + Math.random() * 5;
    }
  }

  _updateRiftEvent(dt) {
    const ev = this.event;
    ev.t -= dt;
    ev.pulse -= dt;
    if (ev.pulse <= 0) {
      ev.pulse = ev.phase === "active" ? 0.55 : 0.4;
      const color = ev.phase === "active" ? 0x47ffd2 : 0xffcf4d;
      for (const hazard of ev.hazards) this._hazardTelegraph(hazard, color);
    }

    if (ev.phase === "warn" && ev.t <= 0) {
      for (const hazard of ev.hazards) {
        hazard.dynamicWarn = false;
        hazard.dynamicActive = true;
        hazard.dynamicDamageMult = 1.75;
      }
      ev.phase = "active";
      ev.t = RIFT_ACTIVE;
      ev.pulse = 0;
      this._toast(t("toast.rift_surge_active"), 1000);
      return;
    }

    if (ev.phase === "active" && ev.t <= 0) {
      for (const hazard of ev.hazards) this._restoreHazard(hazard);
      this.event = null;
      this.cooldown = 15 + Math.random() * 6;
    }
  }

  _openGate(gate) {
    gate.open = true;
    gate.solid = false;
    if (gate.mesh) {
      gate.mesh.scale.y = 0.08;
      gate.mesh.position.y = Math.max(0.12, gate.h * 0.04);
    }
    this._markGate(gate, 0x7fffe6);
    this.world.vfx?.shock?.(gateCenter(gate), 0x7fffe6, Math.max(gate.w, gate.d) * 0.45, 0.45);
  }

  _closeGate(gate) {
    gate.open = false;
    gate.solid = true;
    if (gate.mesh) {
      gate.mesh.scale.y = 1;
      gate.mesh.position.y = gate.baseY || gate.h / 2;
    }
    this._restoreGateMaterial(gate);
    this.world.vfx?.shock?.(gateCenter(gate), 0xffcf4d, Math.max(gate.w, gate.d) * 0.38, 0.35);
  }

  _restoreGate(gate) {
    gate.open = false;
    gate.solid = true;
    if (gate.mesh) {
      gate.mesh.scale.y = 1;
      gate.mesh.position.y = gate.baseY || gate.h / 2;
    }
    this._restoreGateMaterial(gate);
    if (this._playerInGate(gate)) {
      this.world.resolveArenaCollision?.(this.world.player.feet, this.world.player.radius || 0.8);
    }
  }

  _restoreHazard(hazard) {
    hazard.dynamicWarn = false;
    hazard.dynamicActive = false;
    hazard.dynamicDamageMult = 1;
  }

  _markGate(gate, color) {
    if (!gate.mesh?.material?.color) return;
    gate.mesh.material.color.setHex(color);
  }

  _restoreGateMaterial(gate) {
    if (!gate.mesh?.material?.color) return;
    gate.mesh.material.color.setHex(gate.baseColor || 0x5c526d);
  }

  _playerInGate(gate) {
    const feet = this.world.player?.feet;
    const radius = (this.world.player?.radius || 0.8) + 0.45;
    return !!feet && pointInRect(feet, gate, radius);
  }

  _gateTelegraph(gate, color) {
    const center = gateCenter(gate);
    const radius = Math.max(1.4, Math.min(5.5, Math.max(gate.w, gate.d) * 0.35));
    this.world.vfx?.ring?.(center, radius, color, 0.55);
  }

  _hazardTelegraph(hazard, color) {
    const center = hazardCenter(hazard);
    const radius = Math.max(2.2, Math.min(8, Math.max(hazard.w, hazard.d) * 0.18));
    this.world.vfx?.ring?.(center, radius, color, 0.6);
    this.world.vfx?.shock?.(center, color, Math.max(4, radius * 1.3), 0.32);
  }
}
