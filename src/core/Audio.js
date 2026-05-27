export class AudioSys {
  constructor(settings = {}) {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.volume = 0.35;
    this.musicVolume = 0.25;
    this._buffers = {};
    this._musicBuffers = {};
    this._loaded = false;
    this._currentMusic = null;
    this.setSettings(settings);
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this._applyMasterGain();
    this._applyMusicGain();
    this.master.connect(this.ctx.destination);
    this.musicGain.connect(this.ctx.destination);
    this._preload();
    this._preloadMusic();
  }

  setSettings(settings = {}) {
    if (typeof settings.muted === "boolean") this.muted = settings.muted;
    if (Number.isFinite(settings.volume)) {
      this.volume = Math.min(1, Math.max(0, settings.volume));
    }
    if (Number.isFinite(settings.musicVolume)) {
      this.musicVolume = Math.min(1, Math.max(0, settings.musicVolume));
    }
    this._applyMasterGain();
    this._applyMusicGain();
  }

  _applyMasterGain() {
    if (!this.master) return;
    this.master.gain.value = this.muted ? 0 : this.volume;
  }

  _applyMusicGain() {
    if (!this.musicGain) return;
    this.musicGain.gain.value = this.muted ? 0 : this.musicVolume;
  }

  _preload() {
    if (this._loaded) return;
    this._loaded = true;
    const manifest = {
      cast_arcane:  "assets/audio/cast_arcane.ogg",
      cast_fire:    "assets/audio/cast_fire.ogg",
      cast_frost:   "assets/audio/cast_frost.ogg",
      cast_poison:  "assets/audio/cast_poison.ogg",
      cast_chain:   "assets/audio/cast_chain.ogg",
      cast_meteor:  "assets/audio/cast_meteor.ogg",
      explosion:    "assets/audio/explosion.ogg",
      enemy_hit:    "assets/audio/enemy_hit.ogg",
      enemy_death:  "assets/audio/enemy_death.ogg",
      player_hurt:  "assets/audio/player_hurt.ogg",
      blink:        "assets/audio/blink.ogg",
      reward:       "assets/audio/reward.ogg",
      wave_clear:   "assets/audio/wave_clear.ogg",
      game_over:    "assets/audio/game_over.ogg",
    };
    for (const [name, url] of Object.entries(manifest)) {
      fetch(url)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url} ${r.status}`)))
        .then(buf => this.ctx.decodeAudioData(buf))
        .then(audio => { this._buffers[name] = audio; })
        .catch(err => console.warn(`[audio] missing ${name}:`, err.message || err));
    }
  }

  _preloadMusic() {
    const manifest = {
      menu_loop:    "assets/audio/music/menu_loop.ogg",
      arena_calm:   "assets/audio/music/arena_calm.ogg",
      arena_combat: "assets/audio/music/arena_combat.ogg",
      boss_bed:     "assets/audio/music/boss_bed.ogg",
      boss_enrage:  "assets/audio/music/boss_enrage.ogg",
    };
    for (const [name, url] of Object.entries(manifest)) {
      fetch(url)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url} ${r.status}`)))
        .then(buf => this.ctx.decodeAudioData(buf))
        .then(audio => { this._musicBuffers[name] = audio; })
        .catch(err => console.warn(`[audio] missing music ${name}:`, err.message || err));
    }
  }

  _sample(name, vol = 1) {
    if (!this.ctx || this.muted) return true;
    const buf = this._buffers[name];
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(this.ctx.currentTime);
    return true;
  }

  _tone(freq, dur, type = "sine", vol = 1, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol = 0.6) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(t);
  }

  _procCast(kind) {
    const map = {
      arcane: () => this._tone(620, 0.16, "triangle", 0.5, 320),
      fire:   () => this._tone(180, 0.22, "sawtooth", 0.55, 90),
      frost:  () => this._tone(880, 0.18, "sine", 0.45, 1200),
      poison: () => this._tone(240, 0.2, "square", 0.4, 160),
      chain:  () => this._tone(1400, 0.12, "sawtooth", 0.4, 700),
      meteor: () => this._tone(120, 0.3, "sawtooth", 0.6, 60),
    };
    (map[kind] || map.arcane)();
  }
  _procImpact()     { this._noise(0.12, 0.4); this._tone(220, 0.1, "square", 0.3, 110); }
  _procExplosion()  { this._noise(0.32, 0.7); this._tone(90, 0.3, "sawtooth", 0.5, 40); }
  _procEnemyHit()   { this._tone(330, 0.07, "square", 0.3, 240); }
  _procEnemyDeath() { this._tone(180, 0.22, "sawtooth", 0.4, 60); this._noise(0.15, 0.3); }
  _procPlayerHurt() { this._tone(140, 0.18, "sawtooth", 0.5, 70); }
  _procBlink()      { this._tone(1000, 0.14, "sine", 0.4, 1800); }
  _procReward()     { this._tone(523, 0.1, "sine", 0.4); setTimeout(() => this._tone(784, 0.16, "sine", 0.4), 90); }
  _procWaveClear()  { this._tone(440, 0.1, "triangle", 0.4); setTimeout(() => this._tone(660, 0.14, "triangle", 0.4), 100); }
  _procGameOver()   { this._tone(300, 0.5, "sawtooth", 0.5, 80); }
  _procTelegraphDash()  { this._tone(540, 0.18, "sine", 0.45, 920); }
  _procTelegraphSurge() { this._tone(380, 0.28, "sawtooth", 0.5, 180); }

  cast(kind = "arcane") {
    if (this._sample(`cast_${kind}`, 0.9)) return;
    this._procCast(kind);
  }
  impact()     { this._procImpact(); }
  explosion()  { if (!this._sample("explosion", 0.9))   this._procExplosion(); }
  enemyHit()   { if (!this._sample("enemy_hit", 0.7))   this._procEnemyHit(); }
  enemyDeath() { if (!this._sample("enemy_death", 0.7)) this._procEnemyDeath(); }
  playerHurt() { if (!this._sample("player_hurt", 0.9)) this._procPlayerHurt(); }
  blink()      { if (!this._sample("blink", 0.7))       this._procBlink(); }
  reward()     { if (!this._sample("reward", 0.8))      this._procReward(); }
  waveClear()  { if (!this._sample("wave_clear", 0.8))  this._procWaveClear(); }
  gameOver()   { if (!this._sample("game_over", 0.9))   this._procGameOver(); }
  telegraphDash()  { if (!this._sample("telegraph_dash", 0.7))  this._procTelegraphDash(); }
  telegraphSurge() { if (!this._sample("telegraph_surge", 0.7)) this._procTelegraphSurge(); }

  playMusic(trackId, { loop = true, fadeIn = 0 } = {}) {
    if (!this.ctx) return;
    this.stopMusic(fadeIn > 0 ? 0.05 : 0);
    const buf = this._musicBuffers[trackId];
    if (!buf) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.loop = loop;
    const gain = this.ctx.createGain();
    gain.gain.value = fadeIn > 0 ? 0 : 1;
    source.connect(gain).connect(this.musicGain);
    source.start(this.ctx.currentTime);
    if (fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fadeIn);
    }
    this._currentMusic = { source, gain, trackId, loop };
  }

  stopMusic(fadeOut = 0) {
    if (!this._currentMusic) return;
    const { source, gain } = this._currentMusic;
    if (fadeOut > 0 && this.ctx) {
      const t = this.ctx.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + fadeOut);
      source.stop(t + fadeOut + 0.05);
    } else {
      try { source.stop(); } catch (e) {}
    }
    this._currentMusic = null;
  }

  bossEnrage() {
    if (!this.ctx) return;
    const buf = this._musicBuffers["boss_enrage"];
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = this.muted ? 0 : this.volume;
      src.connect(g).connect(this.master);
      src.start(this.ctx.currentTime);
      return;
    }
    this._tone(800, 0.3, "sawtooth", 0.5, 1600);
    this._tone(400, 0.4, "sawtooth", 0.4, 800);
  }
}
