// CPU opponents. Produces the same input frames a human would ({mx, mz, b}) — no cheating via direct state edits.
import { BTN } from './constants.js';
import { groundBelow, closestRim, inFootprint } from './collision.js';
import { makeRng, yawOf } from './math.js';

const LEVEL = (lvl) => {
  const l = Math.max(1, Math.min(9, lvl | 0));
  return {
    lvl: l,
    react: [28, 24, 20, 16, 13, 10, 8, 6, 4][l - 1],
    aggression: 0.25 + l * 0.07,
    defend: 0.02 + l * 0.075,
    jitter: (10 - l) * 0.07,
    smartRecovery: l >= 3,
    ult: l >= 2,
  };
};

export class CpuController {
  /** mode: 'cpu' (normal) or training dummy modes: 'stand' | 'jump' | 'shield' | 'move' */
  constructor(world, fighterId, level = 5, mode = 'cpu', seed = 1) {
    this.w = world;
    this.id = fighterId;
    this.p = LEVEL(level);
    this.mode = mode;
    this.rng = makeRng(seed * 7919 + fighterId * 31 + level);
    this.hold = new Map(); // bit -> frames
    this.gap = new Set();
    this.mx = 0; this.mz = 0;
    this.nextThink = 0;
    this.target = -1;
    this.plan = null;
    this.chainPresses = 0;
  }

  setLevel(l) { this.p = LEVEL(l); }

  tap(bit, frames = 2) {
    if ((this.hold.get(bit) || 0) > 0) this.gap.add(bit);
    this.hold.set(bit, frames);
  }

  output() {
    let b = 0;
    for (const [bit, n] of this.hold) {
      if (n > 0) {
        if (this.gap.has(bit)) { this.gap.delete(bit); continue; }
        b |= bit;
        this.hold.set(bit, n - 1);
      }
    }
    return { mx: this.mx, mz: this.mz, b };
  }

  stick(x, z, jitter = 0) {
    const m = Math.hypot(x, z);
    if (m < 1e-4) { this.mx = 0; this.mz = 0; return; }
    let yaw = yawOf(x, z) + (jitter ? (this.rng() - 0.5) * jitter : 0);
    this.mx = Math.sin(yaw); this.mz = Math.cos(yaw);
  }

  think() {
    const w = this.w, f = w.fighters[this.id];
    if (!f || !f.alive || w.phase !== 'play') { this.mx = this.mz = 0; this.hold.clear(); return this.output(); }
    if (this.mode !== 'cpu') return this.dummy(f);
    if (f.state === 'respawn') {
      if (f.sf > 30 + this.rng() * 30) this.stick(-f.pos.x, -f.pos.z);
      return this.output();
    }
    // urgent recovery decisions every frame, normal decisions at reaction interval
    if (this.offstage(f)) { this.recover(f); return this.output(); }
    if (w.frame >= this.nextThink) {
      this.nextThink = w.frame + this.p.react + Math.floor(this.rng() * 4);
      this.decide(f);
    }
    this.edgeGuardSafety(f);
    return this.output();
  }

  dummy(f) {
    const w = this.w;
    this.mx = this.mz = 0;
    if (this.mode === 'shield') this.hold.set(BTN.SHIELD, 2);
    else if (this.mode === 'jump') { if (f.grounded && w.frame % 70 === 0) this.tap(BTN.JUMP, 6); }
    else if (this.mode === 'move') { const s = Math.sin(w.frame / 60); this.stick(s > 0 ? 1 : -1, 0); this.mx *= 0.55; this.mz *= 0.55; }
    if (this.offstage(f)) this.recover(f);
    return this.output();
  }

  mainPlatform() { return { p: this.w.platforms[0], pl: this.w.placements[0] }; }

  offstage(f) {
    if (f.grounded || f.state === 'ledge') return f.state === 'ledge';
    const w = this.w;
    const g = groundBelow(w.platforms, w.placements, f.pos.x, f.pos.y + 0.2, f.pos.z, -0.3);
    if (!g) return true;
    const { pl } = this.mainPlatform();
    return f.pos.y < pl.top - 0.6 && g.y < f.pos.y - 8;
  }

  recover(f) {
    const w = this.w;
    const { p, pl } = this.mainPlatform();
    const rim = closestRim(p, pl, f.pos.x, f.pos.z, {});
    const inX = rim.x - rim.nx * 2.5, inZ = rim.z - rim.nz * 2.5;
    if (f.state === 'ledge') {
      this.mx = this.mz = 0;
      if (f.sf > 8 + this.rng() * 30) {
        const r = this.rng();
        if (r < 0.45) this.stick(-rim.nx, -rim.nz);
        else if (r < 0.7) this.tap(BTN.JUMP, 3);
        else if (r < 0.85) this.tap(BTN.DODGE, 2);
        else this.tap(BTN.ATTACK, 2);
      }
      return;
    }
    this.stick(inX - f.pos.x, inZ - f.pos.z);
    if (f.state === 'hitstun' || f.hitlag > 0) return;
    const below = f.pos.y < pl.top - 0.5;
    const horiz = Math.hypot(rim.x - f.pos.x, rim.z - f.pos.z);
    const falling = f.vel.y + f.kb.y < 1;
    if (f.state !== 'air' && f.state !== 'helpless') return;
    if (f.state === 'helpless') return;
    if (falling && f.jumpsLeft > 0 && (below || horiz > 4) && f.pos.y < pl.top + 3) {
      this.tap(BTN.JUMP, 4);
      return;
    }
    const lowEnough = f.pos.y < pl.top + (f.def.id === 'spatial_swordsman' || f.def.id === 'tempest' ? 0.5 : 2.5);
    if (f.jumpsLeft === 0 && !f.recUsed && falling && lowEnough && (below || horiz > 2.5)) {
      if (!this.p.smartRecovery && this.rng() < 0.3) return;
      // aim the recovery: upward + toward the ledge
      this.stick(rim.x - f.pos.x, rim.z - f.pos.z);
      this.tap(BTN.SP3, 3);
      return;
    }
    if (f.recUsed && !f.airDodgeUsed && falling && f.pos.y < pl.top - 3 && horiz < 7 && this.rng() < 0.15) {
      this.tap(BTN.JUMP, 1);
    }
  }

  pickTarget(f) {
    const w = this.w;
    let cur = this.target >= 0 ? w.fighters[this.target] : null;
    let best = null, bd = 1e9;
    for (const o of w.fighters) {
      if (!w.hostile(f, o) || !o.alive || o.state === 'respawn') continue;
      const d = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) - o.pct * 0.01;
      if (d < bd) { bd = d; best = o; }
    }
    if (cur && cur.alive && cur.state !== 'respawn' && w.hostile(f, cur)) {
      const dc = Math.hypot(cur.pos.x - f.pos.x, cur.pos.z - f.pos.z);
      if (best && dc < bd * 1.6 + 1) best = cur;
    }
    this.target = best ? best.id : -1;
    return best;
  }

  threatened(f, t) {
    const w = this.w;
    if (t && t.state === 'move' && t.mdef && t.mdef.hb.length) {
      const d = Math.hypot(t.pos.x - f.pos.x, t.pos.z - f.pos.z);
      const first = t.mdef.startup || 0;
      if (d < 3.6 + (t.mdef.key === 'sp1' ? 4 : 0) && t.mf <= first + 2) return true;
    }
    for (const p of w.projectiles) {
      if (!w.hostile(w.fighters[p.owner], f) || !p.def.dmg) continue;
      const dx = f.pos.x - p.x, dz = f.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 5 && (p.vx * dx + p.vz * dz) > 0) return true;
    }
    return false;
  }

  decide(f) {
    const w = this.w, P = this.p, ai = f.def.ai || {};
    const t = this.pickTarget(f);
    // continue holding shield plan
    if (!t) { this.stick(-f.pos.x, -f.pos.z); if (Math.hypot(f.pos.x, f.pos.z) < 2) this.mx = this.mz = 0; return; }
    const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z, dy = t.pos.y - f.pos.y;
    const dist = Math.hypot(dx, dz);
    const r = this.rng();
    const ready = (k) => !(f.cd[k] > 0);
    const actionable = f.state === 'idle' || f.state === 'air' || f.state === 'shield' || f.state === 'land';

    if (!actionable) { this.stick(dx, dz, P.jitter); return; }

    // Defense
    if (this.threatened(f, t) && r < P.defend) {
      const k = this.rng();
      if (f.grounded) {
        if (k < 0.5) this.hold.set(BTN.SHIELD, 10 + Math.floor(this.rng() * 14));
        else if (k < 0.75) { this.stick(-dx, -dz); this.tap(BTN.DODGE, 2); }
        else if (k < 0.9) { this.mx = this.mz = 0; this.tap(BTN.DODGE, 2); }
        else this.tap(BTN.JUMP, 3);
      } else if (!f.airDodgeUsed && k < 0.5) { this.mx = this.mz = 0; this.tap(BTN.DODGE, 2); }
      return;
    }
    // Ultimate
    if (P.ult && f.ult >= 100 && dist < (ai.ultRange || 9) && Math.abs(dy) < 4 && r < 0.6) {
      this.stick(dx, dz); this.tap(BTN.ULT, 2); return;
    }
    // Juggle a launched target
    if (t.state === 'hitstun' && dy > 1.2 && dist < 3.5 && r < P.aggression) {
      this.stick(dx, dz);
      if (f.grounded) { this.tap(BTN.JUMP, 6); this.queueAir = BTN.ATTACK; }
      else this.tap(BTN.ATTACK, 2);
      return;
    }
    // Keep-away characters back off when crowded
    if (ai.keepAway && dist < ai.keepAway && r < 0.18) {
      this.stick(-dx, -dz, P.jitter);
      if (f.grounded && this.rng() < 0.3) this.tap(BTN.JUMP, 4);
      return;
    }
    // Projectiles
    if (ai.projectile && ready(ai.projectile) && dist > ai.projRange[0] && dist < ai.projRange[1] && Math.abs(dy) < 2.5 && r < 0.45) {
      this.stick(dx, dz, P.jitter * 0.5);
      const bit = ai.projectile === 'sp1' ? BTN.SP1 : BTN.SP2;
      this.tap(bit, 2 + Math.floor(this.rng() * 30 * (P.lvl / 9)));
      return;
    }
    // Setup moves (traps, domains)
    if (ai.setup && r < 0.08 && dist > 3 && dist < 10) {
      const k = ai.setup;
      if (ready(k)) {
        if (k === 'upHeavy') { if (f.grounded) { this.mx = this.mz = 0; this.tap(BTN.HEAVY, 2); return; } }
        else { this.stick(dx, dz); this.tap(k === 'sp1' ? BTN.SP1 : BTN.SP2, 2); return; }
      }
    }
    // Pokes from mid range
    if (ai.poke && dist > ai.pokeRange[0] && dist < ai.pokeRange[1] && Math.abs(dy) < 1.8 && r < 0.32 * (0.5 + P.aggression)) {
      const k = ai.poke;
      if (k === 'fwdHeavy') { if (f.grounded) { this.stick(dx, dz); this.tap(BTN.HEAVY, 2 + Math.floor(this.rng() * 12)); return; } }
      else if (ready(k)) { this.stick(dx, dz); this.tap(k === 'sp1' ? BTN.SP1 : BTN.SP2, 2); return; }
    }
    // Anti-air
    if (dy > 1.8 && dist < 2.6 && f.grounded && r < 0.55) {
      if (ai.antiAir === 'upHeavy') { this.mx = this.mz = 0; this.tap(BTN.HEAVY, 2); }
      else { this.tap(BTN.JUMP, 5); this.queueAir = BTN.ATTACK; }
      return;
    }
    // Close range
    const range = ai.range || 2;
    if (dist < range + 0.5 && Math.abs(dy) < 1.6) {
      if (!f.grounded) { this.stick(dx, dz); this.tap(this.rng() < 0.6 ? BTN.ATTACK : BTN.HEAVY, 2); return; }
      const k = this.rng();
      if (t.state === 'shield' && k < 0.5) { this.mx = this.mz = 0; this.hold.set(BTN.SHIELD, 4); this.pendingGrab = 2; return; }
      if (t.pct > 95 && k < 0.5) {
        const kill = ai.kill || 'fwdHeavy';
        this.stick(dx, dz);
        if (kill === 'fwdHeavy') this.tap(BTN.HEAVY, 2 + Math.floor(this.rng() * 20));
        else if (ready(kill)) this.tap(kill === 'sp1' ? BTN.SP1 : BTN.SP2, 2);
        else this.tap(BTN.HEAVY, 3);
        return;
      }
      if (k < 0.5) { this.mx = this.mz = 0; this.tap(BTN.ATTACK, 2); this.chainPresses = 2; return; }
      if (k < 0.7) { this.stick(dx, dz); this.tap(BTN.HEAVY, 2 + Math.floor(this.rng() * 10)); return; }
      if (k < 0.82 && ai.combo && ai.combo !== 'jab1' && ready(ai.combo)) { this.stick(dx, dz); this.tap(ai.combo === 'sp1' ? BTN.SP1 : BTN.SP2, 3); return; }
      if (k < 0.9) { this.hold.set(BTN.SHIELD, 3); this.pendingGrab = 2; return; }
      this.tap(BTN.JUMP, 4); this.queueAir = BTN.ATTACK;
      return;
    }
    // Approach
    this.stick(dx, dz, P.jitter);
    if (f.grounded && dist > 7 && this.rng() < 0.08) this.tap(BTN.JUMP, 6);
    if (f.grounded && dist > 2.4 && dist < 4.2 && Math.hypot(f.vel.x, f.vel.z) > f.st.runSpeed * 0.75 && this.rng() < 0.3 * P.aggression) this.tap(BTN.ATTACK, 2);
    if (!f.grounded && dy < -1 && f.vel.y < 0 && this.rng() < 0.3) this.tap(BTN.DOWN, 2);
  }

  edgeGuardSafety(f) {
    const w = this.w;
    // chain jabs
    if (this.chainPresses > 0 && f.state === 'move' && f.mf > 5 && this.rng() < 0.5) { this.tap(BTN.ATTACK, 2); this.chainPresses--; }
    // grab out of shield
    if (this.pendingGrab > 0) { this.pendingGrab--; if (this.pendingGrab === 0) { this.hold.set(BTN.SHIELD, 2); this.tap(BTN.ATTACK, 2); } }
    // queued aerial after a jump
    if (this.queueAir && !f.grounded && f.state === 'air') { this.tap(this.queueAir, 2); this.queueAir = 0; }
    if (f.state === 'holding') { const t = this.target >= 0 ? w.fighters[this.target] : null; const { pl } = this.mainPlatform(); this.stick(f.pos.x - pl.x, f.pos.z - pl.z); if (this.rng() < 0.2) this.tap(BTN.ATTACK, 2); void t; }
    // never run off an edge by accident
    if (f.grounded && (this.mx || this.mz)) {
      const p = w.platforms[f.groundIdx], pl = w.placements[f.groundIdx];
      const ax = f.pos.x + this.mx * 1.3, az = f.pos.z + this.mz * 1.3;
      if (!inFootprint(p, pl, ax, az, -0.2)) {
        const g = groundBelow(w.platforms, w.placements, ax, f.pos.y + 0.1, az, -0.2);
        if (!g || g.y < f.pos.y - 6) { this.mx = 0; this.mz = 0; }
      }
    }
  }
}
