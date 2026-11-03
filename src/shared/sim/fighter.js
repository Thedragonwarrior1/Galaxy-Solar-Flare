// Fighter: state machine, platform-fighter movement physics, move execution.
import { BTN, BTN_ALL, DT, INPUT_BUFFER, SHIELD, LEDGE, RULES, KB, DEG } from './constants.js';
import { clamp, angDiff, turnToward, yawOf, localToWorld } from './math.js';
import { inFootprint, pushOutSolid, closestRim } from './collision.js';
import { evalTrack } from './tracks.js';

const BIT_INDEX = {};
Object.keys(BTN).forEach((k, i) => { BIT_INDEX[k] = i; });
const NBTN = Object.keys(BTN).length;

// States in which the fighter can freely act.
export const ACTIONABLE = new Set(['idle', 'air']);

export class Fighter {
  constructor(world, cfg, charDef) {
    this.world = world;
    this.id = cfg.id;
    this.slot = cfg.slot;
    this.team = cfg.team !== undefined ? cfg.team : cfg.slot;
    this.name = cfg.name || `P${cfg.slot + 1}`;
    this.cpu = cfg.cpu || 0;
    this.charId = charDef.id;
    this.def = charDef;
    this.st = charDef.stats;
    this.stocks = cfg.stocks;
    this.pct = 0;
    this.ult = 0;
    this.cd = {};
    this.stats = { dmgDealt: 0, dmgTaken: 0, kos: 0, falls: 0, sds: 0, maxCombo: 0, hits: 0 };
    this.place = 0;
    this.eliminated = false;
    this.elimFrame = 0;
    this.b = 0; this.prevB = 0; this.mx = 0; this.mz = 0; this.stick = 0;
    this.buf = new Int16Array(NBTN);
    this.lastDefPress = -999; // frame of last shield/dodge press (for teching)
    this.spawnAt(cfg.spawn || [0, 0, 0], cfg.facing || 0);
  }

  spawnAt(p, facing) {
    this.pos = { x: p[0], y: p[1], z: p[2] };
    this.prev = { x: p[0], y: p[1], z: p[2] };
    this.vel = { x: 0, y: 0, z: 0 };
    this.kb = { x: 0, y: 0, z: 0 };
    this.facing = facing;
    this.grounded = false;
    this.groundIdx = -1;
    this.jumpsLeft = this.st.airJumps;
    this.airDodgeUsed = false;
    this.recUsed = false;
    this.fastFall = false;
    this.dropThrough = 0;
    this.state = 'air';
    this.sf = 0;
    this.move = null; this.mdef = null; this.mf = 0; this.charge = 0; this.mvars = null;
    this.hitReg = null;
    this.hitlag = 0; this.hitstun = 0; this.pending = null; this.tumble = false;
    this.invTimer = 0;
    this.shieldHP = SHIELD.MAX;
    this.ledge = null; this.ledgeGrabs = 0; this.ledgeCD = 0;
    this.captured = null; this.holding = null;
    this.lastHitBy = -1; this.lastHitFrame = -9999; this.combo = 0;
    this.lag = 0; // generic state timer target
    this.rollDir = null;
    this.transform = 0; // frames of monster transformation remaining
    this.scale = this.st.scale || 1;
    this.slowed = 0; // zone slow factor this frame
    this.armorKb = 0;
    this.flash = 0; // render hint (parry / ult glow)
    this.lastMoveInfo = null; // for training mode readout
  }

  // ---------- input ----------
  setInput(inp) {
    let mx = +inp.mx || 0, mz = +inp.mz || 0;
    if (!Number.isFinite(mx)) mx = 0;
    if (!Number.isFinite(mz)) mz = 0;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    this.mx = mx; this.mz = mz; this.stick = Math.min(1, m);
    this.prevB = this.b;
    this.b = (inp.b | 0) & BTN_ALL;
  }

  processInputEdges() {
    const pressed = this.b & ~this.prevB;
    if (this.hitlag <= 0) {
      for (let i = 0; i < NBTN; i++) if (this.buf[i] > 0) this.buf[i]--;
    }
    if (pressed) {
      let i = 0;
      for (const k in BTN) {
        if (pressed & BTN[k]) this.buf[i] = INPUT_BUFFER;
        i++;
      }
      if (pressed & (BTN.SHIELD | BTN.DODGE)) this.lastDefPress = this.world.frame;
    }
  }

  pressed(name) { return this.buf[BIT_INDEX[name]] > 0; }
  consume(name) { this.buf[BIT_INDEX[name]] = 0; }
  held(name) { return (this.b & BTN[name]) !== 0; }
  stickYaw() { return yawOf(this.mx, this.mz); }

  // ---------- queries ----------
  get height() { return this.st.height * this.scale; }
  get radius() { return this.st.radius * this.scale; }
  get weight() { return this.st.weight + (this.transform > 0 ? 40 : 0); }
  get alive() { return this.state !== 'dead' && !this.eliminated; }

  intangible() {
    if (this.invTimer > 0) return true;
    const s = this.state, f = this.sf;
    if (s === 'respawn' || s === 'dead') return true;
    if (s === 'spotdodge') return f >= 2 && f <= 16;
    if (s === 'roll') return f >= 3 && f <= 18;
    if (s === 'airdodge') return f >= 2 && f <= (this.lag >= 38 ? 26 : 20);
    if (s === 'ledgeClimb' || s === 'ledgeRoll' || s === 'getup' || s === 'tech') return true;
    if (s === 'ledge') return f < this.lag;
    if (s === 'move' && this.mdef && this.mdef.inv) {
      const iv = this.mdef.inv;
      if (this.mf >= iv[0] && this.mf <= iv[1]) return true;
    }
    return false;
  }

  canTakeHits() { return this.alive && !this.intangible(); }

  // world position of a move effector (handR, footL, tipR...) at the current move frame
  effectorWorld(name, f = this.mf, out = {}) {
    const m = this.mdef;
    if (!m || !m.fx || !m.fx[name]) return null;
    const k = evalTrack(m.fx[name], f);
    if (!k) return null;
    return localToWorld(this.pos, this.facing, k.a, k.r * this.scale, k.h * this.scale, out);
  }

  // ---------- state helpers ----------
  setState(s, lag = 0) {
    this.state = s; this.sf = 0; this.lag = lag;
    if (s !== 'move') { this.move = null; this.mdef = null; this.mvars = null; }
  }

  leaveGround() {
    if (!this.grounded) return;
    this.grounded = false;
    this.groundIdx = -1;
  }

  // ---------- main per-frame update ----------
  update() {
    const w = this.world;
    this.processInputEdges();
    if (this.state === 'dead') return;
    if (this.hitlag > 0) {
      this.hitlag--;
      if (this.hitlag === 0 && this.pending) this.applyPendingLaunch();
      return;
    }
    if (this.invTimer > 0) this.invTimer--;
    if (this.ledgeCD > 0) this.ledgeCD--;
    if (this.dropThrough > 0) this.dropThrough--;
    if (this.flash > 0) this.flash--;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k]--;
    if (this.transform > 0) {
      this.transform--;
      if (this.transform === 0) { this.scale = this.st.scale || 1; w.emit('transform', { id: this.id, on: false }); }
    }
    if (this.state !== 'shield' && this.shieldHP < SHIELD.MAX) this.shieldHP = Math.min(SHIELD.MAX, this.shieldHP + SHIELD.REGEN);
    if (w.phase === 'play' && w.cine === null) this.ult = Math.min(RULES.ULT_MAX, this.ult + RULES.ULT_GAIN_PASSIVE);

    this.sf++;
    const st = this.st;
    const s = this.state;
    let gscale = 1; // gravity scale
    let control = 'none'; // movement control mode this frame: ground | air | none
    let airCtl = 1;

    switch (s) {
      case 'idle': {
        if (this.tryGroundActions()) return this.physics(gscale, 'none');
        control = 'ground';
        break;
      }
      case 'air': {
        if (this.tryAirActions()) return this.physics(gscale, 'none');
        control = 'air';
        break;
      }
      case 'jumpsquat': {
        control = 'ground-slide';
        if (this.sf >= 3) this.doJump();
        break;
      }
      case 'land': {
        control = 'ground-slide';
        if (this.lag <= 3 && this.pressed('JUMP')) { this.consume('JUMP'); this.setState('jumpsquat'); break; }
        if (this.sf >= this.lag) { this.setState('idle'); if (this.tryGroundActions()) return this.physics(1, 'none'); }
        break;
      }
      case 'move': {
        const r = this.moveStep();
        if (r === 'ended') return this.physics(1, this.grounded ? 'ground-slide' : 'air');
        gscale = r.g; control = r.control; airCtl = r.airCtl;
        break;
      }
      case 'shield': {
        control = 'ground-slide';
        this.shieldHP -= SHIELD.DECAY;
        if (this.shieldHP <= 0) { this.shieldBreak(); break; }
        if (this.pressed('JUMP')) { this.consume('JUMP'); this.setState('jumpsquat'); break; }
        if (this.pressed('DODGE')) { this.consume('DODGE'); this.startDodge(); break; }
        if (this.pressed('ATTACK')) { this.consume('ATTACK'); this.startMove('grab'); break; }
        if (!this.held('SHIELD')) this.setState('shieldDrop', SHIELD.DROP_LAG);
        break;
      }
      case 'shieldstun': {
        control = 'ground-slide';
        if (this.sf >= this.lag) this.setState(this.held('SHIELD') ? 'shield' : 'shieldDrop', SHIELD.DROP_LAG);
        if (this.state === 'shield') this.sf = SHIELD.PARRY_WINDOW + 1;
        break;
      }
      case 'shieldDrop': case 'rebound': case 'parried': case 'getup': case 'tech': {
        control = this.grounded ? 'ground-slide' : 'air-none';
        if (this.sf >= this.lag) this.setState(this.grounded ? 'idle' : 'air');
        break;
      }
      case 'dizzy': {
        control = this.grounded ? 'ground-slide' : 'air-none';
        if (this.sf >= this.lag) this.setState(this.grounded ? 'idle' : 'air');
        break;
      }
      case 'knockdown': {
        control = 'ground-slide';
        if (this.sf > 10) {
          if (this.pressed('ATTACK') || this.pressed('HEAVY')) { this.consume('ATTACK'); this.consume('HEAVY'); this.startMove('getupAttack'); break; }
          if (this.stick > 0.5 || this.pressed('JUMP') || this.pressed('DODGE')) { this.setState('getup', 20); break; }
        }
        if (this.sf >= 36) this.setState('getup', 20);
        break;
      }
      case 'spotdodge': {
        control = 'ground-slide';
        if (this.sf >= 24) this.setState('idle');
        break;
      }
      case 'roll': {
        control = 'none';
        const t = this.sf;
        const sp = t >= 3 && t <= 22 ? 16 * Math.sin(((t - 3) / 19) * Math.PI) : 0;
        this.vel.x = this.rollDir.x * sp; this.vel.z = this.rollDir.z * sp;
        if (this.sf >= 30) { this.vel.x *= 0.2; this.vel.z *= 0.2; this.setState('idle'); }
        break;
      }
      case 'airdodge': {
        const dirFrames = this.rollDir ? 12 : 0;
        if (this.rollDir && this.sf <= dirFrames) {
          const sp = 15 * (1 - this.sf / (dirFrames + 6));
          this.vel.x = this.rollDir.x * sp; this.vel.z = this.rollDir.z * sp; this.vel.y = this.rollDir.y * sp;
          gscale = 0; control = 'none';
        } else {
          control = 'air'; airCtl = 0.5; gscale = this.rollDir ? 0.8 : 0.5;
        }
        if (this.sf >= this.lag) this.setState('air');
        break;
      }
      case 'hitstun': {
        control = this.grounded ? 'ground-slide' : 'air-none';
        this.hitstun--;
        if (this.hitstun <= 0) {
          this.combo = 0;
          this.setState(this.grounded ? 'idle' : 'air');
        }
        break;
      }
      case 'helpless': {
        control = 'air'; airCtl = 0.6;
        if (this.pressed('DOWN') && this.vel.y <= 1) this.fastFall = true;
        break;
      }
      case 'ledge': return this.ledgeStep();
      case 'ledgeClimb': case 'ledgeRoll': {
        const L = this.ledge;
        const total = s === 'ledgeClimb' ? LEDGE.CLIMB : LEDGE.ROLL;
        const inward = s === 'ledgeClimb' ? 1.0 : 3.6;
        const t = Math.min(1, this.sf / total);
        const startX = L.x + L.nx * this.radius * 1.1, startZ = L.z + L.nz * this.radius * 1.1;
        const endX = L.x - L.nx * inward, endZ = L.z - L.nz * inward;
        const yUp = Math.min(1, t * 2.2);
        this.pos.x = startX + (endX - startX) * t;
        this.pos.z = startZ + (endZ - startZ) * t;
        this.pos.y = (L.y - this.height * 0.85) + this.height * 0.85 * yUp;
        this.vel.x = this.vel.y = this.vel.z = 0;
        if (this.sf >= total) {
          this.pos.y = L.y; this.grounded = true; this.groundIdx = L.idx; this.ledge = null;
          this.setState('idle');
        }
        return;
      }
      case 'captured': return this.capturedStep();
      case 'holding': {
        control = 'ground-slide';
        const tgt = this.world.fighterById(this.holding);
        if (!tgt || tgt.state !== 'captured') { this.holding = null; this.setState(this.grounded ? 'idle' : 'air'); break; }
        if (this.sf > 6 && (this.pressed('ATTACK') || this.pressed('HEAVY') || this.stick > 0.6) || this.sf >= 45) {
          this.consume('ATTACK'); this.consume('HEAVY');
          if (this.stick > 0.3) this.facing = this.stickYaw();
          this.startMove('throw', true);
        }
        break;
      }
      case 'respawn': {
        this.vel.x = this.vel.y = this.vel.z = 0;
        const anyInput = this.sf > 20 && (this.stick > 0.3 || (this.b & ~BTN.DOWN) !== 0 || this.pressed('DOWN'));
        if (anyInput || this.sf > RULES.RESPAWN_PLATFORM_MAX) {
          this.invTimer = RULES.RESPAWN_INV;
          this.setState('air');
          this.jumpsLeft = this.st.airJumps;
        }
        return;
      }
      case 'victory': case 'frozen': {
        control = this.grounded ? 'ground-slide' : 'air-none';
        break;
      }
      default: control = 'air';
    }
    this.physics(gscale, control, airCtl);
  }

  // ---------- actions ----------
  tryGroundActions() {
    if (this.world.phase !== 'play') return false;
    if (this.pressed('ULT') && this.ult >= RULES.ULT_MAX && this.startMove('ult')) { this.consume('ULT'); return true; }
    if (this.pressed('SP3') && this.startMove('sp3')) { this.consume('SP3'); return true; }
    if (this.pressed('SP1') && this.startMove('sp1')) { this.consume('SP1'); return true; }
    if (this.pressed('SP2') && this.startMove('sp2')) { this.consume('SP2'); return true; }
    if (this.pressed('HEAVY')) {
      this.consume('HEAVY');
      return this.startMove(this.stick > 0.35 ? 'fwdHeavy' : 'upHeavy');
    }
    if (this.pressed('ATTACK')) {
      this.consume('ATTACK');
      const sp = Math.hypot(this.vel.x, this.vel.z);
      return this.startMove(sp > this.st.runSpeed * 0.72 && this.stick > 0.5 ? 'dash' : 'jab1');
    }
    if (this.pressed('SHIELD') && this.shieldHP > SHIELD.MIN_TO_RAISE) {
      this.consume('SHIELD');
      this.setState('shield');
      this.world.emit('sfx', { name: 'shield_on', id: this.id });
      return true;
    }
    if (this.held('SHIELD') && this.shieldHP > SHIELD.MIN_TO_RAISE) { this.setState('shield'); this.sf = SHIELD.PARRY_WINDOW + 1; return true; }
    if (this.pressed('DODGE')) { this.consume('DODGE'); this.startDodge(); return true; }
    if (this.pressed('JUMP')) { this.consume('JUMP'); this.setState('jumpsquat'); return true; }
    if (this.pressed('DOWN')) {
      const p = this.groundIdx >= 0 ? this.world.platforms[this.groundIdx] : null;
      if (p && p.kind === 'soft') {
        this.consume('DOWN');
        this.leaveGround(); this.dropThrough = 12; this.vel.y = -4; this.setState('air');
        this.jumpsLeft = this.st.airJumps;
        return true;
      }
    }
    return false;
  }

  tryAirActions() {
    if (this.world.phase !== 'play') return false;
    if (this.pressed('ULT') && this.ult >= RULES.ULT_MAX && this.startMove('ult')) { this.consume('ULT'); return true; }
    if (this.pressed('SP3') && this.startMove('sp3')) { this.consume('SP3'); return true; }
    if (this.pressed('SP1') && this.startMove('sp1')) { this.consume('SP1'); return true; }
    if (this.pressed('SP2') && this.startMove('sp2')) { this.consume('SP2'); return true; }
    if (this.pressed('HEAVY')) { this.consume('HEAVY'); return this.startMove(this.held('DOWN') ? 'dair' : 'fair'); }
    if (this.pressed('ATTACK')) { this.consume('ATTACK'); return this.startMove(this.held('DOWN') ? 'dair' : 'nair'); }
    if ((this.pressed('DODGE') || this.pressed('SHIELD')) && !this.airDodgeUsed) {
      this.consume('DODGE'); this.consume('SHIELD');
      this.startAirDodge();
      return true;
    }
    if (this.pressed('JUMP') && this.jumpsLeft > 0) {
      this.consume('JUMP');
      this.jumpsLeft--;
      this.vel.y = this.st.djumpVel;
      const target = this.st.airSpeed * 0.9;
      this.vel.x = this.mx * target; this.vel.z = this.mz * target;
      if (this.stick > 0.3) this.facing = turnToward(this.facing, this.stickYaw(), 1.2);
      this.fastFall = false;
      this.kb.x *= 0.5; this.kb.z *= 0.5; if (this.kb.y < 0) this.kb.y = 0;
      this.tumble = false;
      this.world.emit('jump', { id: this.id, air: true });
      return true;
    }
    if (this.pressed('DOWN') && this.vel.y + this.kb.y <= 2) {
      this.consume('DOWN');
      this.fastFall = true;
      this.vel.y = -this.st.fastFall;
    }
    return false;
  }

  doJump() {
    const full = this.held('JUMP');
    this.leaveGround();
    this.vel.y = full ? this.st.jumpVel : this.st.shortHop;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const cap = this.st.airSpeed * 1.15;
    if (hs > cap) { this.vel.x *= cap / hs; this.vel.z *= cap / hs; }
    if (this.stick > 0.2) {
      this.vel.x = this.vel.x * 0.5 + this.mx * this.st.airSpeed * 0.6;
      this.vel.z = this.vel.z * 0.5 + this.mz * this.st.airSpeed * 0.6;
    }
    this.jumpsLeft = this.st.airJumps;
    this.setState('air');
    this.world.emit('jump', { id: this.id, air: false });
  }

  startDodge() {
    if (this.stick > 0.35) {
      this.rollDir = { x: this.mx / this.stick, y: 0, z: this.mz / this.stick };
      this.setState('roll');
    } else {
      this.setState('spotdodge');
    }
    this.vel.x *= 0.2; this.vel.z *= 0.2;
    this.world.emit('dodge', { id: this.id, air: false });
  }

  startAirDodge() {
    this.airDodgeUsed = true;
    this.fastFall = false;
    if (this.stick > 0.35) {
      // directional: stick plus an implicit vertical part from the jump/down buttons
      let y = this.held('JUMP') ? 0.6 : this.held('DOWN') ? -0.6 : 0.15;
      const len = Math.hypot(this.mx, y, this.mz);
      this.rollDir = { x: this.mx / len, y: y / len, z: this.mz / len };
      this.setState('airdodge', 34);
      this.kb.x = this.kb.y = this.kb.z = 0;
    } else {
      this.rollDir = null;
      this.setState('airdodge', 38);
      this.vel.x *= 0.3; this.vel.z *= 0.3; this.vel.y = Math.max(this.vel.y, -2);
    }
    this.world.emit('dodge', { id: this.id, air: true });
  }

  shieldBreak() {
    this.shieldHP = 30;
    this.setState('dizzy', SHIELD.BREAK_STUN);
    this.leaveGround();
    this.vel.y = 12;
    this.world.emit('shieldBreak', { t: this.id, x: this.pos.x, y: this.pos.y + 1, z: this.pos.z });
  }

  aimAt(m) {
    if (m.aim === 'none') return;
    if (this.stick > 0.3) { this.facing = this.stickYaw(); return; }
    const range = m.aim === 'far' ? 26 : 9;
    const t = this.world.nearestEnemy(this, range);
    if (t) this.facing = yawOf(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
  }

  /** Begin a move. Returns false if unavailable (cooldown, recovery used, no meter). */
  startMove(key, keepFacing = false) {
    let m = this.def.moves[key];
    if (!m) return false;
    if (!this.grounded && this.def.moves[key + 'Air']) m = this.def.moves[key + 'Air'];
    if (this.transform > 0 && this.def.moves[key + 'Mon']) m = this.def.moves[key + 'Mon'];
    if (m.kind === 'ground' && !this.grounded) return false;
    if (m.kind === 'air' && this.grounded) return false;
    if (this.cd[key] > 0) return false;
    if (key === 'sp3' && this.recUsed) return false;
    if (m.ult) {
      if (this.ult < RULES.ULT_MAX) return false;
      if (m.canUse && !m.canUse(this)) return false;
    }
    if (m.canUse && !m.ult && !m.canUse(this)) return false;
    if (!keepFacing) this.aimAt(m);
    this.state = 'move'; this.sf = 0;
    this.move = key; this.mdef = m; this.mf = 0; this.charge = 0;
    this.mvars = { evDone: -1, loops: 0, startedAir: !this.grounded };
    this.hitReg = new Map();
    this.tumble = false;
    if (m.cooldown) this.cd[key] = m.cooldown;
    if (key === 'sp3') { this.recUsed = !this.grounded || m.setsRecUsed !== false; }
    if (m.ult) { this.ult = 0; this.world.startCinematic(this, m.cinematic || 0); }
    if (m.kind !== 'ground' && !this.grounded && m.stall) { this.vel.y = Math.max(this.vel.y, m.stall); }
    if (!this.grounded && m.air) this.fastFall = this.fastFall && this.vel.y < 0;
    this.lastMoveInfo = { key, name: m.name, startup: m.startup, active: m.activeFrames, total: m.total, dmg: m.totalDmg };
    this.world.emit('move', { id: this.id, move: key });
    if (m.onStart) m.onStart(this.world, this);
    return true;
  }

  /** Advance the current move by one frame. Returns physics config or 'ended'. */
  moveStep() {
    const m = this.mdef;
    // Charging holds the move on its charge frame.
    if (m.charge && this.mf === m.charge.at && this.held(m.charge.btn) && this.charge < m.charge.max) {
      this.charge++;
      if (this.charge === 1) this.world.emit('fx', { name: 'chargeStart', id: this.id });
    } else {
      this.mf++;
    }
    const mf = this.mf;
    // One-shot frame events (projectile spawns, teleports, custom logic)
    if (mf !== this.mvars.evDone) {
      this.mvars.evDone = mf;
      if (m.events) {
        for (let i = 0; i < m.events.length; i++) {
          const e = m.events[i];
          if (e.f === mf) e.fn(this.world, this, m);
        }
      }
      if (this.state !== 'move' || this.mdef !== m) return 'ended';
    }
    if (m.tick) { m.tick(this.world, this, m, mf); if (this.state !== 'move' || this.mdef !== m) return 'ended'; }
    // Combo chain
    if (m.next && mf >= m.next.from && mf <= m.next.to && this.pressed(m.next.btn)) {
      this.consume(m.next.btn);
      this.startMove(m.next.move, !m.next.reaim);
      return 'ended';
    }
    // Rapid loop while the button is held / mashed
    if (m.loop && mf === m.loop.to && this.mvars.loops < m.loop.max && (this.held(m.loop.btn) || this.pressed(m.loop.btn))) {
      this.consume(m.loop.btn);
      this.mf = m.loop.from;
      this.mvars.loops++;
      this.mvars.evDone = this.mf;
    }
    // Steering
    if (m.turn && this.stick > 0.3) this.facing = turnToward(this.facing, this.stickYaw(), m.turn);
    // Movement windows
    let g = m.gravity !== undefined ? m.gravity : 1;
    let control = this.grounded ? 'ground-slide' : 'air';
    let airCtl = m.airControl !== undefined ? m.airControl : (m.air ? 1 : 0.35);
    if (m.mv) {
      for (let i = 0; i < m.mv.length; i++) {
        const w = m.mv[i];
        if (mf < w.f[0] || mf > w.f[1]) continue;
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        const yaw = this.facing - (w.side ? 90 * DEG * Math.sign(w.side) : 0);
        const vx = fx * (w.fwd || 0), vz = fz * (w.fwd || 0);
        if (w.mode === 'add') {
          this.vel.x += vx * DT * 60; this.vel.z += vz * DT * 60;
          if (w.up !== undefined) this.vel.y += w.up * DT * 60;
        } else if (w.mode === 'stick') {
          const sp = w.fwd || 0;
          const dx = this.stick > 0.3 ? this.mx / this.stick : fx, dz = this.stick > 0.3 ? this.mz / this.stick : fz;
          this.vel.x = dx * sp; this.vel.z = dz * sp;
          if (w.up !== undefined) this.vel.y = w.up;
        } else {
          if (w.fwd !== undefined) { this.vel.x = vx; this.vel.z = vz; }
          if (w.up !== undefined) this.vel.y = w.up;
        }
        void yaw;
        if (w.grav !== undefined) g = w.grav;
        if (w.up !== undefined && w.up > 0 && this.grounded) this.leaveGround();
        control = w.control || 'none';
        if (w.kbStop) { this.kb.x = this.kb.y = this.kb.z = 0; }
      }
    }
    if (mf >= m.total) {
      this.endMove();
      return 'ended';
    }
    return { g, control, airCtl };
  }

  endMove() {
    const m = this.mdef;
    if (this.holding !== null && this.move !== 'grab') {
      // a capture move ended without a final release -> drop the victim
      this.world.releaseCaptured(this);
    }
    if (m && m.onEnd) m.onEnd(this.world, this);
    if (this.state === 'move' && this.mdef === m) {
      if (this.grounded) this.setState('idle');
      else this.setState(m.helpless ? 'helpless' : 'air');
    }
  }

  // ---------- ledge ----------
  tryLedgeGrab() {
    if (this.grounded || this.ledgeCD > 0 || this.hitlag > 0) return false;
    const s = this.state;
    const okState = s === 'air' || s === 'helpless' || (s === 'airdodge' && this.sf > 14) ||
      (s === 'move' && this.mdef && this.mdef.ledgeGrab !== undefined && this.mf >= this.mdef.ledgeGrab);
    if (!okState) return false;
    if (this.vel.y + this.kb.y > 0.5 && s !== 'move') return false;
    if (this.held('DOWN')) return false;
    const w = this.world;
    const hand = this.pos.y + this.height * 0.82;
    const rim = {};
    for (let i = 0; i < w.platforms.length; i++) {
      const p = w.platforms[i];
      if (!p.ledges) continue;
      const pl = w.placements[i];
      const dy = pl.top - hand;
      if (dy < -0.9 || dy > 1.3) continue;
      if (this.pos.y > pl.top - 0.4) continue; // above surface -> landing, not ledge
      closestRim(p, pl, this.pos.x, this.pos.z, rim);
      const ox = this.pos.x - rim.x, oz = this.pos.z - rim.z;
      const out = ox * rim.nx + oz * rim.nz;
      const tang = Math.abs(ox * -rim.nz + oz * rim.nx);
      if (out < -0.25 || out > 1.25 || tang > 0.6) continue;
      // occupied?
      let occupied = false;
      for (const o of w.fighters) {
        if (o !== this && o.state === 'ledge' && o.ledge && Math.hypot(o.ledge.x - rim.x, o.ledge.z - rim.z) < 1.4) occupied = true;
      }
      if (occupied) continue;
      this.grabLedge(i, rim, pl.top);
      return true;
    }
    return false;
  }

  grabLedge(idx, rim, top) {
    this.ledge = { idx, x: rim.x, z: rim.z, nx: rim.nx, nz: rim.nz, y: top };
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.kb.x = this.kb.y = this.kb.z = 0;
    this.fastFall = false;
    this.jumpsLeft = this.st.airJumps;
    this.recUsed = false;
    this.airDodgeUsed = false;
    const inv = this.ledgeGrabs === 0 ? LEDGE.INV_FIRST : this.ledgeGrabs === 1 ? 20 : this.ledgeGrabs === 2 ? 8 : 0;
    this.ledgeGrabs++;
    this.setState('ledge', inv);
    this.facing = yawOf(-rim.nx, -rim.nz);
    this.pos.x = rim.x + rim.nx * this.radius * 1.1;
    this.pos.z = rim.z + rim.nz * this.radius * 1.1;
    this.pos.y = top - this.height * 0.85;
    this.world.emit('ledge', { id: this.id });
  }

  ledgeStep() {
    const L = this.ledge;
    const pl = this.world.placements[L.idx];
    // keep attached to (possibly moving) platform
    L.y = pl.top;
    this.pos.y = L.y - this.height * 0.85;
    this.vel.x = this.vel.y = this.vel.z = 0;
    if (this.sf < 6) return;
    const inward = this.stick > 0.4 ? (-(this.mx * L.nx + this.mz * L.nz) / this.stick) : 0;
    if (this.pressed('JUMP')) {
      this.consume('JUMP');
      this.ledge = null;
      this.setState('air');
      this.vel.y = this.st.jumpVel * 1.02;
      this.vel.x = -L.nx * 3; this.vel.z = -L.nz * 3;
      this.invTimer = LEDGE.JUMP_INV;
      this.ledgeCD = LEDGE.REGRAB_CD;
      this.world.emit('jump', { id: this.id, air: false });
      return;
    }
    if (this.pressed('ATTACK') || this.pressed('HEAVY')) {
      this.consume('ATTACK'); this.consume('HEAVY');
      // climb onto stage, then attack
      this.pos.x = L.x - L.nx * 0.8; this.pos.z = L.z - L.nz * 0.8; this.pos.y = L.y;
      this.grounded = true; this.groundIdx = L.idx; this.ledge = null;
      this.startMove('ledgeAttack', true);
      return;
    }
    if (this.pressed('DODGE') || this.pressed('SHIELD')) {
      this.consume('DODGE'); this.consume('SHIELD');
      this.setState('ledgeRoll');
      this.ledge = L;
      return;
    }
    if (inward > 0.5 || this.pressed('SP3') && false) {
      this.setState('ledgeClimb');
      this.ledge = L;
      return;
    }
    if (inward < -0.5 || this.pressed('DOWN') || this.sf > LEDGE.MAX_HANG) {
      this.consume('DOWN');
      this.ledge = null;
      this.setState('air');
      this.ledgeCD = LEDGE.REGRAB_CD;
      this.pos.x += L.nx * 0.3; this.pos.z += L.nz * 0.3;
      return;
    }
  }

  capturedStep() {
    const c = this.captured;
    const by = c ? this.world.fighterById(c.by) : null;
    if (!by || !by.alive || (by.state !== 'move' && by.state !== 'holding') || by.holding !== this.id) {
      this.captured = null;
      this.setState(this.grounded ? 'idle' : 'air');
      return;
    }
    const p = localToWorld(by.pos, by.facing, c.a, c.r * by.scale, c.h * by.scale);
    this.pos.x = p.x; this.pos.y = p.y; this.pos.z = p.z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.kb.x = this.kb.y = this.kb.z = 0;
    this.facing = by.facing + Math.PI;
    this.grounded = false;
  }

  // ---------- hits ----------
  applyPendingLaunch() {
    const p = this.pending;
    this.pending = null;
    // Directional influence from the victim's stick at the end of hitlag.
    let v = { x: p.x, y: p.y, z: p.z };
    if (p.di) {
      // imported lazily to avoid circular import
      v = this.world.applyDI(v, this.mx, this.mz);
    }
    this.kb.x = v.x; this.kb.y = v.y; this.kb.z = v.z;
    if (v.y > 0.5 || !p.stayGrounded) {
      if (this.grounded && (v.y > 0.5 || Math.hypot(v.x, v.z) > 9)) this.leaveGround();
    }
    if (this.grounded && v.y < -0.5) {
      // spike into the ground: pop up instead
      this.kb.y = -v.y * 0.7;
      this.leaveGround();
    }
  }

  // ---------- physics ----------
  physics(gscale, control, airCtl = 1) {
    if (this.pinned) { this.vel.x = this.vel.y = this.vel.z = 0; this.kb.x = this.kb.y = this.kb.z = 0; return; }
    const st = this.st;
    const w = this.world;
    const slow = this.slowed > 0 ? this.slowed : 1;
    this.slowed = 0;
    // Horizontal control
    if (control === 'ground') {
      const mag = this.stick;
      if (mag > 0.12) {
        const spd = (mag < 0.6 ? st.walkSpeed * (mag / 0.6) : st.walkSpeed + (st.runSpeed - st.walkSpeed) * ((mag - 0.6) / 0.4)) * slow;
        const tx = (this.mx / mag) * spd, tz = (this.mz / mag) * spd;
        let accel = st.groundAccel;
        if (this.vel.x * tx + this.vel.z * tz < 0) accel *= 2.4;
        this.approach(tx, tz, accel * DT);
        this.facing = turnToward(this.facing, this.stickYaw(), 0.42);
      } else {
        this.approach(0, 0, st.friction * DT);
      }
    } else if (control === 'ground-slide') {
      this.approach(0, 0, st.friction * DT);
    } else if (control === 'air') {
      const mag = this.stick;
      if (mag > 0.12) {
        const tx = this.mx * st.airSpeed * slow, tz = this.mz * st.airSpeed * slow;
        this.approach(tx, tz, st.airAccel * DT * airCtl);
        this.facing = turnToward(this.facing, this.stickYaw(), 0.05 * airCtl);
      } else {
        this.approach(0, 0, st.airFriction * DT);
      }
      if ((this.state === 'air' || (this.state === 'move' && this.mdef && this.mdef.air)) && this.pressed('DOWN') && this.vel.y + this.kb.y <= 2 && !this.fastFall) {
        this.consume('DOWN'); this.fastFall = true; this.vel.y = Math.min(this.vel.y, -st.fastFall);
      }
    } else if (control === 'air-none') {
      this.approach(0, 0, st.airFriction * 0.5 * DT);
    }

    // Gravity
    if (!this.grounded) {
      this.vel.y -= st.gravity * gscale * DT;
      const maxFall = this.fastFall ? st.fastFall : st.fallSpeed;
      if (gscale > 0 && this.vel.y < -maxFall) this.vel.y = Math.min(-maxFall, this.vel.y + st.gravity * 2 * DT);
    } else if (this.vel.y < 0) this.vel.y = 0;

    // Launch velocity decays independently (Smash model).
    const km = Math.hypot(this.kb.x, this.kb.y, this.kb.z);
    if (km > 0) {
      const decay = KB.DECAY * DT * (this.grounded ? 2.2 : 1);
      const nm = Math.max(0, km - decay);
      const s = nm / km;
      this.kb.x *= s; this.kb.y *= s; this.kb.z *= s;
      if (nm < 0.05) { this.kb.x = this.kb.y = this.kb.z = 0; }
    }

    // Integrate
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;
    const vx = this.vel.x + this.kb.x, vy = this.vel.y + this.kb.y, vz = this.vel.z + this.kb.z;
    this.pos.x += vx * DT; this.pos.y += vy * DT; this.pos.z += vz * DT;

    this.collide();
    if (!this.grounded) this.tryLedgeGrab();
  }

  approach(tx, tz, maxStep) {
    const dx = tx - this.vel.x, dz = tz - this.vel.z;
    const d = Math.hypot(dx, dz);
    if (d <= maxStep || d < 1e-6) { this.vel.x = tx; this.vel.z = tz; return; }
    this.vel.x += (dx / d) * maxStep; this.vel.z += (dz / d) * maxStep;
  }

  collide() {
    const w = this.world;
    const P = w.platforms, PL = w.placements;
    const r = this.radius, h = this.height;
    if (this.grounded) {
      const p = P[this.groundIdx], pl = PL[this.groundIdx];
      const edgeStop = this.state === 'move' && this.mdef && this.mdef.edgeStop;
      const keepOn = this.state === 'shield' || this.state === 'shieldstun' || this.state === 'spotdodge' || this.state === 'land' || this.state === 'jumpsquat' || this.state === 'roll' || this.state === 'holding';
      if (!inFootprint(p, pl, this.pos.x, this.pos.z, 0)) {
        if (edgeStop || keepOn) {
          this.pos.x = this.prev.x; this.pos.z = this.prev.z;
          this.vel.x = 0; this.vel.z = 0;
          if (!inFootprint(p, pl, this.pos.x, this.pos.z, 0)) { this.walkOff(); }
          else this.pos.y = pl.top;
        } else {
          this.walkOff();
        }
      } else {
        this.pos.y = pl.top;
        if (this.kb.y < 0) this.kb.y = 0;
      }
    } else {
      const vy = this.vel.y + this.kb.y;
      if (vy <= 0) {
        let best = -1, bestTop = -1e9;
        for (let i = 0; i < P.length; i++) {
          const p = P[i], pl = PL[i];
          if (p.kind === 'soft' && (this.dropThrough > 0 || this.state === 'captured')) continue;
          const prevTop = w.prevPlacements[i].top;
          if (this.prev.y >= prevTop - 0.06 && this.pos.y <= pl.top && inFootprint(p, pl, this.pos.x, this.pos.z, 0.04)) {
            if (pl.top > bestTop) { bestTop = pl.top; best = i; }
          }
        }
        if (best >= 0) this.land(best);
      }
    }
    // Solid walls / underside
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.kind !== 'solid') continue;
      if (this.grounded && i === this.groundIdx) continue;
      const pushed = pushOutSolid(p, PL[i], this.pos, r * 0.85, h, this.prev.y, this.vel, this.kb);
      if (pushed && !this.grounded && Math.abs(this.pos.y - PL[i].top) < 0.001 && inFootprint(p, PL[i], this.pos.x, this.pos.z, 0)) this.land(i);
    }
    // Anti-stuck: deep inside a solid block -> pop to its top.
    for (let i = 0; i < P.length; i++) {
      const p = P[i], pl = PL[i];
      if (p.kind !== 'solid') continue;
      if (this.pos.y < pl.top - 0.35 && this.pos.y > pl.top - p.thick + 0.1 && inFootprint(p, pl, this.pos.x, this.pos.z, -0.6)) {
        this.pos.y = pl.top; this.land(i);
      }
    }
  }

  walkOff() {
    this.leaveGround();
    this.jumpsLeft = this.st.airJumps;
    if (this.state === 'idle' || this.state === 'land' || this.state === 'shieldDrop') this.setState('air');
    if (this.state === 'move' && this.mdef && this.mdef.kind === 'ground' && !this.mdef.canLeaveGround) this.setState('air');
  }

  land(idx) {
    const w = this.world;
    const vy = this.vel.y + this.kb.y;
    const pl = w.placements[idx];
    this.pos.y = pl.top;
    const hard = vy < -15;
    // Tumble landings: ground bounce, tech, or knockdown.
    if (this.state === 'hitstun' || (this.tumble && this.state === 'air')) {
      const tumbling = this.tumble || this.state === 'hitstun' && this.hitstun > 12;
      if (tumbling && vy < -16 && this.state === 'hitstun') {
        this.vel.y = 0; this.kb.y = Math.min(-vy * 0.4, 9);
        w.emit('land', { id: this.id, hard: true });
        return;
      }
      if (tumbling) {
        this.grounded = true; this.groundIdx = idx; this.vel.y = 0; this.kb.y = 0;
        this.resetAirResources();
        if (w.frame - this.lastDefPress <= 14) {
          this.setState('tech', 18); this.hitstun = 0; this.combo = 0;
          w.emit('fx', { name: 'tech', id: this.id, x: this.pos.x, y: this.pos.y, z: this.pos.z });
        } else {
          this.setState('knockdown'); this.hitstun = 0; this.combo = 0;
          w.emit('land', { id: this.id, hard: true });
        }
        this.tumble = false;
        return;
      }
    }
    this.grounded = true;
    this.groundIdx = idx;
    this.vel.y = 0;
    if (this.kb.y < 0) this.kb.y = 0;
    this.resetAirResources();
    const s = this.state;
    if (s === 'move') {
      const m = this.mdef;
      if (m.onLand) { m.onLand(w, this); }
      else if (m.kind !== 'ground' && m.landCancel !== false) {
        const lag = m.landLag !== undefined ? m.landLag : 6;
        this.setState('land', lag);
      }
    } else if (s === 'helpless') {
      this.setState('land', 16);
    } else if (s === 'airdodge') {
      this.setState('land', this.rollDir ? 10 : 3);
    } else if (s === 'air') {
      this.setState('land', 2);
    } else if (s === 'dizzy' || s === 'parried' || s === 'rebound' || s === 'hitstun' || s === 'victory' || s === 'frozen') {
      // keep state, now grounded
    }
    this.tumble = false;
    w.emit('land', { id: this.id, hard });
  }

  resetAirResources() {
    this.jumpsLeft = this.st.airJumps;
    this.airDodgeUsed = false;
    this.recUsed = false;
    this.fastFall = false;
    this.ledgeGrabs = 0;
  }
}
