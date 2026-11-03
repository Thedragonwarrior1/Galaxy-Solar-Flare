// World: authoritative match simulation. Runs identically in the browser (local play) and on the server (online).
import { ARENAS, platformAt } from './arenas.js';
import { RULES, SHIELD, KB, DEG, DT } from './constants.js';
import { Fighter } from './fighter.js';
import { computeKnockback, hitstunFrames, hitlagFrames, launchVector, applyDI, predictKO } from './knockback.js';
import { makeRng, yawOf, pointSegDist2, localToWorld, clamp } from './math.js';
import { inFootprint } from './collision.js';
import { evalTrack } from './tracks.js';
import { updateHazards } from './hazards.js';
import { CHARACTERS } from '../characters/index.js';

const NEUTRAL = { mx: 0, mz: 0, b: 0 };
const SUB = [-0.66, -0.33, 0];

export class World {
  /**
   * cfg: { arena, mode: 'ffa'|'1v1'|'2v2'|'training', stocks, time (seconds, 0 = none), hazards, friendlyFire,
   *        players: [{ char, name, team, cpu }], seed, skipCountdown }
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.arena = ARENAS[cfg.arena] || ARENAS.pirate_haven;
    this.platforms = this.arena.platforms;
    this.frame = 0;
    this.placements = this.platforms.map((p) => platformAt(p, 0));
    this.prevPlacements = this.placements.map((p) => ({ ...p }));
    this.mode = cfg.mode || 'ffa';
    this.training = this.mode === 'training';
    this.teams = this.mode === '2v2';
    this.friendlyFire = !!cfg.friendlyFire;
    this.hazardsOn = !!cfg.hazards;
    this.stocks = cfg.stocks || RULES.DEFAULT_STOCKS;
    this.rng = makeRng(cfg.seed || 12345);
    this.events = [];
    this.projectiles = [];
    this.zones = [];
    this.hazards = [];
    this.hazardTimer = 420;
    this.nextId = 1;
    this.cine = null;
    this.phase = cfg.skipCountdown ? 'play' : 'countdown';
    this.countdown = RULES.COUNTDOWN;
    this.timer = cfg.time > 0 ? Math.round(cfg.time * 60) : 0;
    this.timed = this.timer > 0;
    this.elapsed = 0;
    this.endTimer = 0;
    this.results = null;
    this.endReason = null;
    this.applyDI = applyDI;
    this.fighters = cfg.players.map((p, i) => {
      const def = CHARACTERS[p.char];
      if (!def) throw new Error('Unknown character ' + p.char);
      const sp = this.arena.spawns[i % this.arena.spawns.length];
      const f = new Fighter(this, {
        id: i, slot: i, name: p.name, cpu: p.cpu || 0,
        team: this.teams ? (p.team !== undefined ? p.team : i % 2) : i,
        stocks: this.training ? 99 : this.stocks,
        spawn: sp, facing: yawOf(-sp[0], -sp[2]),
      }, def);
      return f;
    });
    // settle fighters onto spawn platforms
    for (const f of this.fighters) this.settle(f);
  }

  settle(f) {
    const y = f.pos.y;
    f.prev.y = y + 0.05; f.pos.y = y - 0.001;
    f.collide();
    if (!f.grounded) f.pos.y = y;
  }

  emit(type, data = {}) { data.type = type; data.f = this.frame; this.events.push(data); }
  fighterById(id) { return this.fighters[id] || null; }

  hostile(a, b) {
    if (!a || !b || a === b) return false;
    if (this.teams && !this.friendlyFire && a.team === b.team) return false;
    return true;
  }

  nearestEnemy(f, range = 1e9) {
    let best = null, bd = range;
    for (const o of this.fighters) {
      if (!this.hostile(f, o) || !o.alive || o.state === 'respawn') continue;
      const d = Math.hypot(o.pos.x - f.pos.x, (o.pos.y - f.pos.y) * 0.6, o.pos.z - f.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  startCinematic(f, frames) {
    if (frames > 0) this.cine = { id: f.id, left: frames, total: frames };
    this.emit('ultStart', { id: f.id, char: f.charId, move: f.move });
  }

  // ------------------------------------------------------------------ step
  step(inputs = []) {
    this.events.length = 0;
    const F = this.fighters;
    for (let i = 0; i < F.length; i++) F[i].setInput(inputs[i] || NEUTRAL);

    if (this.phase === 'ending' || this.phase === 'ended') {
      if (this.phase === 'ending' && --this.endTimer <= 0) { this.phase = 'ended'; this.emit('gameEnd', {}); }
      this.frame++;
      return;
    }

    // Ultimate cinematic: everyone except the user is frozen.
    if (this.cine) {
      const f = F[this.cine.id];
      if (f && f.alive && f.state === 'move') f.update();
      if (--this.cine.left <= 0 || !f || f.state !== 'move') this.cine = null;
      this.frame++;
      return;
    }

    // Moving platforms
    for (let i = 0; i < this.platforms.length; i++) {
      const prev = this.prevPlacements[i], cur = this.placements[i];
      prev.x = cur.x; prev.top = cur.top; prev.z = cur.z;
      this.placements[i] = platformAt(this.platforms[i], this.frame + 1);
    }
    for (const f of F) {
      if (f.grounded && f.groundIdx >= 0 && this.platforms[f.groundIdx].motion) {
        const a = this.prevPlacements[f.groundIdx], b = this.placements[f.groundIdx];
        f.pos.x += b.x - a.x; f.pos.z += b.z - a.z; f.pos.y = b.top;
      }
    }

    if (this.phase === 'countdown') {
      const c = this.countdown;
      if (c === RULES.COUNTDOWN || c === 120 || c === 60) this.emit('countdown', { n: c / 60 });
      if (--this.countdown <= 0) { this.phase = 'play'; this.emit('go', {}); }
    }

    for (const f of F) f.update();
    this.updateProjectiles();
    this.updateZones();
    updateHazards(this);
    this.resolveHits();
    this.separate();
    this.checkBlastZones();
    this.updateRules();
    this.frame++;
  }

  // ------------------------------------------------------------------ projectiles
  spawnProjectile(owner, kind, pos, yaw, pitch = 0, over = {}) {
    const def = { ...(owner.def.projectiles[kind] || {}), ...over };
    const sp = def.speed || 0;
    const p = {
      pid: this.nextId++, kind, owner: owner.id, def,
      x: pos.x, y: pos.y, z: pos.z, px: pos.x, py: pos.y, pz: pos.z,
      vx: Math.sin(yaw) * Math.cos(pitch) * sp, vy: Math.sin(pitch) * sp, vz: Math.cos(yaw) * Math.cos(pitch) * sp,
      r: def.r || 0.4, age: 0, life: def.life || 90, reg: new Map(), dead: false, stuck: false, armed: !def.trap,
      dmgMult: over.dmgMult || 1, yaw, hits: 0,
    };
    this.projectiles.push(p);
    this.emit('projSpawn', { pid: p.pid, kind, owner: owner.id, x: p.x, y: p.y, z: p.z });
    return p;
  }

  endProjectile(p, reason) {
    if (p.dead) return;
    p.dead = true;
    this.emit('projEnd', { pid: p.pid, kind: p.kind, owner: p.owner, x: p.x, y: p.y, z: p.z, reason });
    if ((reason === 'hit' || reason === 'ground' || reason === 'expire' || reason === 'trigger') && p.def.explode) {
      this.explode(this.fighters[p.owner], p.x, p.y, p.z, p.def.explode, p.dmgMult);
    }
  }

  explode(owner, x, y, z, ex, dmgMult = 1) {
    const z0 = this.spawnZone(owner, 'blast', { x, y, z }, {
      r: ex.r, life: ex.dur || 6, hit: { dmg: ex.dmg, ang: ex.ang, bkb: ex.bkb, kbg: ex.kbg, el: ex.el || 'fire', dir: 'radial', shield: ex.shield || 1 },
      visual: ex.visual || 'explosion', color: ex.color,
    });
    if (ex.ult) z0.def.hit.ult = true;
    z0.dmgMult = dmgMult;
    this.emit('explode', { x, y, z, r: ex.r, el: ex.el || 'fire', owner: owner ? owner.id : -1, color: ex.color });
  }

  updateProjectiles() {
    const P = this.platforms, PL = this.placements;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const d = p.def;
      p.age++;
      if (d.tick) d.tick(this, p);
      if (p.dead) continue;
      if (d.trap) {
        if (!p.armed && p.age >= d.trap.arm && p.stuck) p.armed = true;
        if (p.armed) {
          const owner = this.fighters[p.owner];
          for (const o of this.fighters) {
            if (!this.hostile(owner, o) || !o.canTakeHits()) continue;
            if (Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < d.trap.trigger && Math.abs(o.pos.y - p.y) < 1.6) {
              p.trigger = true;
            }
          }
        }
      }
      if (d.homing && p.age > (d.homing.delay || 0)) {
        const owner = this.fighters[p.owner];
        const t = this.nearestEnemyPoint(owner, p, d.homing.range || 12);
        if (t) {
          const want = yawOf(t.pos.x - p.x, t.pos.z - p.z);
          const cur = yawOf(p.vx, p.vz);
          let dd = want - cur; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
          const ny = cur + clamp(dd, -d.homing.turn, d.homing.turn);
          const hs = Math.hypot(p.vx, p.vz);
          p.vx = Math.sin(ny) * hs; p.vz = Math.cos(ny) * hs;
        }
      }
      if (d.grow) p.r = Math.min(d.maxR || 99, p.r + d.grow);
      p.px = p.x; p.py = p.y; p.pz = p.z;
      if (!p.stuck) {
        p.vy -= (d.grav || 0) * DT;
        if (d.drag) { const k = 1 - d.drag * DT; p.vx *= k; p.vy *= k; p.vz *= k; }
        p.x += p.vx * DT; p.y += p.vy * DT; p.z += p.vz * DT;
        // ground / wall collision
        for (let i = 0; i < P.length; i++) {
          const pf = P[i], pl = PL[i];
          if (!inFootprint(pf, pl, p.x, p.z, 0)) continue;
          const hitTop = p.vy <= 0 && p.py - p.r * 0.5 >= pl.top - 0.1 && p.y - p.r * 0.5 <= pl.top;
          const inside = pf.kind === 'solid' && p.y < pl.top - 0.05 && p.y > pl.top - pf.thick;
          if (hitTop || inside) {
            const g = d.ground || 'die';
            if (g === 'bounce' && hitTop && p.hits < 3) { p.y = pl.top + p.r * 0.5; p.vy = Math.abs(p.vy) * 0.55; p.hits++; }
            else if (g === 'stick' && hitTop) { p.y = pl.top + 0.05; p.stuck = true; p.vx = p.vy = p.vz = 0; p.plat = i; }
            else if (g === 'slide' && hitTop) { p.y = pl.top + p.r * 0.5; p.vy = 0; }
            else if (g === 'pass') { /* ignore */ }
            else this.endProjectile(p, 'ground');
            break;
          }
        }
      } else if (p.plat !== undefined) {
        // stuck traps ride moving platforms
        const a = this.prevPlacements[p.plat], b = PL[p.plat];
        p.x += b.x - a.x; p.z += b.z - a.z; p.y = b.top + 0.05;
      }
      if (p.dead) continue;
      if (p.trigger) { this.endProjectile(p, 'trigger'); continue; }
      const B = this.arena.blast;
      if (p.age >= p.life) this.endProjectile(p, d.expireExplode ? 'expire' : 'fizzle');
      else if (p.y < B.minY || p.x < B.minX - 5 || p.x > B.maxX + 5 || p.z < B.minZ - 5 || p.z > B.maxZ + 5) this.endProjectile(p, 'fizzle');
    }
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  nearestEnemyPoint(owner, p, range) {
    let best = null, bd = range;
    for (const o of this.fighters) {
      if (!this.hostile(owner, o) || !o.canTakeHits()) continue;
      const d = Math.hypot(o.pos.x - p.x, o.pos.y + 1 - p.y, o.pos.z - p.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ------------------------------------------------------------------ zones (area effects, explosions, traps)
  spawnZone(owner, kind, pos, def) {
    const z = {
      zid: this.nextId++, kind, owner: owner ? owner.id : -1, def,
      x: pos.x, y: pos.y, z: pos.z, r: def.r || 2, h: def.h || 0, age: 0, life: def.life || 60,
      reg: new Map(), dead: false, dmgMult: 1, follow: def.follow ? owner.id : -1,
    };
    this.zones.push(z);
    if (def.announce !== false) this.emit('zone', { zid: z.zid, kind, owner: z.owner, x: z.x, y: z.y, z: z.z, r: z.r, life: z.life, visual: def.visual, color: def.color });
    return z;
  }

  updateZones() {
    for (const z of this.zones) {
      if (z.dead) continue;
      z.age++;
      if (z.follow >= 0) {
        const f = this.fighters[z.follow];
        if (f && f.alive) { z.x = f.pos.x; z.y = f.pos.y + (z.def.followY || 0); z.z = f.pos.z; }
      }
      if (z.def.tick) z.def.tick(this, z);
      if (z.def.slow) {
        const owner = this.fighters[z.owner];
        for (const f of this.fighters) {
          if (!this.hostile(owner, f) || !f.alive) continue;
          if (this.inZone(z, f)) f.slowed = z.def.slow;
        }
      }
      if (z.age >= z.life) z.dead = true;
    }
    if (this.zones.some((z) => z.dead)) this.zones = this.zones.filter((z) => !z.dead);
  }

  inZone(z, f) {
    if (z.h > 0) {
      return Math.hypot(f.pos.x - z.x, f.pos.z - z.z) < z.r + f.radius && f.pos.y < z.y + z.h && f.pos.y + f.height > z.y;
    }
    return Math.hypot(f.pos.x - z.x, f.pos.y + f.height * 0.5 - z.y, f.pos.z - z.z) < z.r + f.radius;
  }

  // ------------------------------------------------------------------ hit detection
  collectHitboxes() {
    const out = [];
    const tmpA = {}, tmpB = {};
    for (const f of this.fighters) {
      if (f.state !== 'move' || !f.mdef || !f.mdef.hb) continue;
      const m = f.mdef;
      const mult = (1 + (m.charge ? (m.chargeDmg || 0.45) * (f.charge / m.charge.max) : 0)) * (f.transform > 0 && !m.ult ? 1.3 : 1);
      for (let i = 0; i < m.hb.length; i++) {
        const h = m.hb[i];
        if (f.mf < h.f[0] || f.mf > h.f[1]) continue;
        const sc = f.scale;
        const base = { owner: f, reg: f.hitReg, grp: h.grp || 0, hb: h, src: 'f', mult, air: !!m.air, ult: !!m.ult, shape: null };
        // Tracked hitboxes are sampled at sub-frame steps so fast swings sweep a continuous volume (no tunnelling).
        if (h.seg) {
          for (const s of SUB) {
            const fr = f.mf + s;
            if (fr < h.f[0] - 1) continue;
            const a = f.effectorWorld(h.seg[0], fr, tmpA), b = f.effectorWorld(h.seg[1], fr, tmpB);
            if (!a || !b) continue;
            const n = h.seg[2] || 3;
            for (let k = 0; k < n; k++) {
              const t = n === 1 ? 1 : k / (n - 1);
              out.push({ ...base, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, r: h.r * sc });
            }
          }
          continue;
        }
        if (h.at) {
          for (const s of SUB) {
            const fr = f.mf + s;
            if (fr < h.f[0] - 1) continue;
            const k = evalTrack(m.fx[h.at], fr);
            if (!k) continue;
            const p = localToWorld(f.pos, f.facing, k.a, (k.r + (h.ext || 0)) * sc, k.h * sc, tmpA);
            out.push({ ...base, x: p.x, y: p.y, z: p.z, r: h.r * sc });
          }
          continue;
        }
        let x, y, z;
        {
          const p = h.p || [0, 0, 1];
          const q = localToWorld(f.pos, f.facing, p[0], p[1] * sc, p[2] * sc, tmpA);
          x = q.x; y = q.y; z = q.z;
        }
        out.push({ ...base, x, y, z, r: h.r * sc });
      }
    }
    for (const p of this.projectiles) {
      if (p.dead || !p.def.dmg || !p.armed || p.def.trap) continue;
      if (p.def.hitDelay && p.age < p.def.hitDelay) continue;
      out.push({ owner: this.fighters[p.owner], reg: p.reg, grp: 0, hb: p.def, src: 'p', proj: p, x: p.x, y: p.y, z: p.z, r: p.r, mult: p.dmgMult, ult: !!p.def.ult });
    }
    for (const z of this.zones) {
      const hit = z.def.hit;
      if (!hit) continue;
      if (hit.from !== undefined && (z.age < hit.from || z.age > (hit.to !== undefined ? hit.to : 1e9))) continue;
      out.push({ owner: z.owner >= 0 ? this.fighters[z.owner] : null, reg: z.reg, grp: 0, hb: hit, src: 'z', zone: z, x: z.x, y: z.y, z: z.z, r: z.r, h: z.h, shape: z.h > 0 ? 'cyl' : null, mult: z.dmgMult || 1, ult: !!hit.ult });
    }
    return out;
  }

  overlapsFighter(hb, t) {
    const r = t.radius;
    if (hb.shape === 'cyl') {
      return Math.hypot(t.pos.x - hb.x, t.pos.z - hb.z) < hb.r + r && t.pos.y < hb.y + hb.h && t.pos.y + t.height > hb.y;
    }
    const ay = t.pos.y + r, by = t.pos.y + t.height - r;
    const d2 = pointSegDist2(hb.x, hb.y, hb.z, t.pos.x, ay, t.pos.z, t.pos.x, by, t.pos.z);
    const rr = hb.r + r;
    return d2 <= rr * rr;
  }

  resolveHits() {
    const hbs = this.collectHitboxes();
    if (hbs.length === 0) return;
    const cancelled = new Set();
    // --- Clashes between opposing attacks (simultaneous attacks handled deterministically) ---
    for (let i = 0; i < hbs.length; i++) {
      const A = hbs[i];
      if (!A.owner || A.ult) continue;
      for (let j = i + 1; j < hbs.length; j++) {
        const B = hbs[j];
        if (!B.owner || B.ult || A.owner === B.owner || !this.hostile(A.owner, B.owner)) continue;
        if (A.src === 'z' || B.src === 'z') continue;
        const dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z, rr = A.r + B.r;
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        const da = A.hb.dmg * A.mult, db = B.hb.dmg * B.mult;
        if (A.src === 'p' && B.src === 'p') {
          if (Math.abs(da - db) <= 6) { this.endProjectile(A.proj, 'clash'); this.endProjectile(B.proj, 'clash'); }
          else this.endProjectile(da < db ? A.proj : B.proj, 'clash');
          this.emit('clank', { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 });
        } else if (A.src === 'p' || B.src === 'p') {
          const P = A.src === 'p' ? A : B, M = A.src === 'p' ? B : A;
          if (M.hb.dmg * M.mult >= P.hb.dmg * P.mult * 0.5 && !P.ult) {
            this.endProjectile(P.proj, 'clash');
            this.emit('clank', { x: P.x, y: P.y, z: P.z });
          }
        } else if (!A.air && !B.air) {
          const key = A.owner.id < B.owner.id ? A.owner.id + ':' + B.owner.id : B.owner.id + ':' + A.owner.id;
          if (cancelled.has(key)) continue;
          cancelled.add(key);
          const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, mz = (A.z + B.z) / 2;
          if (Math.abs(da - db) <= 9) { this.rebound(A.owner); this.rebound(B.owner); }
          else this.rebound(da < db ? A.owner : B.owner);
          this.emit('clank', { x: mx, y: my, z: mz });
        }
      }
    }
    // --- Hits on fighters ---
    const hits = [];
    for (const t of this.fighters) {
      if (!t.canTakeHits()) continue;
      const best = new Map();
      for (const h of hbs) {
        if (h.src === 'p' && h.proj.dead) continue;
        const a = h.owner;
        if (a && (a === t || !this.hostile(a, t))) continue;
        if (a && h.src === 'f' && (a.state !== 'move' || a.hitReg !== h.reg)) continue; // move was cancelled this frame
        if (t.state === 'captured' && (!a || t.captured.by !== a.id)) continue;
        if (h.hb.onlyCaptured && !(t.state === 'captured' && a && t.captured.by === a.id)) continue;
        if (h.hb.grab && (t.state === 'captured' || (!t.grounded && !h.hb.airGrab))) continue;
        const reg = h.reg.get(t.id);
        if (reg && reg.has(h.grp)) {
          const last = reg.get(h.grp);
          if (!h.hb.rehit || this.frame - last < h.hb.rehit) continue;
        }
        if (!this.overlapsFighter(h, t)) continue;
        const key = h.reg;
        const k2 = best.get(key);
        const gkey = h.grp;
        if (!k2) best.set(key, new Map([[gkey, h]]));
        else {
          const cur = k2.get(gkey);
          if (!cur || h.hb.dmg > cur.hb.dmg) k2.set(gkey, h);
        }
      }
      for (const m of best.values()) {
        // only one group per registry per frame (prevents a whole multi-hitbox move landing at once)
        let pick = null;
        for (const h of m.values()) if (!pick || h.hb.dmg > pick.hb.dmg) pick = h;
        if (pick) hits.push({ h: pick, t });
      }
    }
    // register first so simultaneous trades are both applied
    for (const { h, t } of hits) {
      let reg = h.reg.get(t.id);
      if (!reg) { reg = new Map(); h.reg.set(t.id, reg); }
      reg.set(h.grp, this.frame);
    }
    for (const { h, t } of hits) this.applyHit(h, t);
  }

  rebound(f) {
    if (f.state !== 'move') return;
    this.releaseCaptured(f);
    f.setState('rebound', 18);
    f.vel.x *= 0.2; f.vel.z *= 0.2;
  }

  releaseCaptured(f) {
    if (f.holding === null || f.holding === undefined) return;
    const v = this.fighters[f.holding];
    f.holding = null;
    if (v && v.state === 'captured') {
      v.captured = null;
      v.setState('air');
      v.vel.y = 6;
      v.invTimer = Math.max(v.invTimer, 10);
    }
  }

  applyHit(H, t) {
    const h = H.hb;
    const a = H.owner;
    const dmg = (h.dmg || 0) * (H.mult || 1);
    const cx = (H.x + t.pos.x) / 2, cy = Math.min(H.y, t.pos.y + t.height * 0.8), cz = (H.z + t.pos.z) / 2;
    const meleeOwner = a && H.src === 'f' ? a : null;

    // ---------------- shield / parry ----------------
    if ((t.state === 'shield' || t.state === 'shieldstun') && !h.unblockable && !h.grab) {
      if (t.state === 'shield' && t.sf <= SHIELD.PARRY_WINDOW) {
        t.flash = 24; t.hitlag = 8;
        t.ult = Math.min(RULES.ULT_MAX, t.ult + 6);
        if (meleeOwner && !H.ult) {
          this.releaseCaptured(meleeOwner);
          meleeOwner.setState('parried', 34); meleeOwner.hitlag = 8;
        }
        if (H.src === 'p' && !H.ult) {
          const p = H.proj; // reflect
          p.vx = -p.vx * 1.2; p.vz = -p.vz * 1.2; p.vy = Math.abs(p.vy) * 0.3; p.owner = t.id; p.reg = new Map(); p.age = 0;
        }
        this.emit('parry', { a: a ? a.id : -1, t: t.id, x: cx, y: cy, z: cz });
        return;
      }
      t.shieldHP -= dmg * (h.shield || 1) * 1.15;
      const stun = Math.floor(dmg * 0.55 + 3);
      t.setState('shieldstun', stun);
      const src = a && H.src === 'f' ? a.pos : { x: H.x, z: H.z };
      const yaw = yawOf(t.pos.x - src.x, t.pos.z - src.z);
      const push = 2 + dmg * 0.22;
      t.vel.x = Math.sin(yaw) * push; t.vel.z = Math.cos(yaw) * push;
      const hl = Math.floor(hitlagFrames(dmg, h.hitlag || 1) * 0.7);
      t.hitlag = hl;
      if (meleeOwner) { meleeOwner.hitlag = hl; meleeOwner.vel.x -= Math.sin(yaw) * push * 0.5; meleeOwner.vel.z -= Math.cos(yaw) * push * 0.5; }
      this.emit('shieldHit', { a: a ? a.id : -1, t: t.id, x: cx, y: cy, z: cz, dmg });
      if (t.shieldHP <= 0) t.shieldBreak();
      if (H.src === 'p' && !h.pierce) this.endProjectile(H.proj, 'blocked');
      return;
    }

    // ---------------- grab ----------------
    if (h.grab && a) {
      this.releaseCaptured(t);
      t.setState('captured');
      t.captured = { by: a.id, a: 0, r: 0.75 + t.radius, h: 0.15 };
      a.holding = t.id;
      a.setState('holding');
      this.emit('sfx', { name: 'grab', id: a.id });
      return;
    }

    // ---------------- damage ----------------
    t.pct = Math.min(RULES.PCT_MAX, t.pct + dmg);
    if (a) {
      a.stats.dmgDealt += dmg; a.stats.hits++;
      if (!H.ult) a.ult = Math.min(RULES.ULT_MAX, a.ult + dmg * RULES.ULT_GAIN_DEALT);
      t.lastHitBy = a.id; t.lastHitFrame = this.frame;
    }
    t.stats.dmgTaken += dmg;
    t.ult = Math.min(RULES.ULT_MAX, t.ult + dmg * RULES.ULT_GAIN_TAKEN);
    if (H.src === 'p' && !h.pierce) this.endProjectile(H.proj, 'hit');

    // capture (cinematic grabs / multi-hit holds)
    if (h.capture && a && (a.holding === null || a.holding === undefined)) {
      if (t.holding !== null) this.releaseCaptured(t);
      t.setState('captured');
      t.captured = { by: a.id, a: h.capture[0], r: h.capture[1], h: h.capture[2] };
      a.holding = t.id;
      t.hitlag = 4;
      this.emit('hit', { a: a.id, t: t.id, x: cx, y: cy, z: cz, dmg, kb: 0, el: h.el || 'punch', heavy: false, deadly: false, combo: ++t.combo });
      return;
    }
    if (t.state === 'captured' && a && t.captured && t.captured.by === a.id && !h.release) {
      t.hitlag = Math.max(t.hitlag, 3);
      this.emit('hit', { a: a.id, t: t.id, x: cx, y: cy, z: cz, dmg, kb: 0, el: h.el || 'punch', heavy: false, deadly: false, combo: ++t.combo });
      return;
    }
    if (t.state === 'captured') { t.captured = null; if (a && a.holding === t.id) a.holding = null; }

    // ---------------- knockback ----------------
    let kb = computeKnockback(t.pct, dmg, t.weight, h.bkb || 0, h.kbg !== undefined ? h.kbg : 100, h.setKb);
    // super armor (monster transformation, armored moves)
    const armor = (t.transform > 0 ? 70 : 0) + (t.state === 'move' && t.mdef && t.mdef.armor && t.mf >= t.mdef.armor.f[0] && t.mf <= t.mdef.armor.f[1] ? t.mdef.armor.kb : 0);
    const hl = hitlagFrames(dmg, (h.hitlag || 1) * (h.el === 'lightning' ? 1.25 : 1));
    if (armor > 0 && kb < armor && !h.ult) {
      t.hitlag = Math.floor(hl * 0.6);
      if (meleeOwner) meleeOwner.hitlag = Math.floor(hl * 0.6);
      this.emit('hit', { a: a ? a.id : -1, t: t.id, x: cx, y: cy, z: cz, dmg, kb: 0, el: h.el || 'punch', heavy: false, deadly: false, armor: true, combo: 0 });
      return;
    }
    let yaw;
    const dir = h.dir || 'facing';
    if (dir === 'radial' || !a) yaw = yawOf(t.pos.x - H.x, t.pos.z - H.z);
    else if (dir === 'proj' && H.proj) yaw = Math.hypot(H.proj.vx, H.proj.vz) > 0.1 ? yawOf(H.proj.vx, H.proj.vz) : yawOf(t.pos.x - H.x, t.pos.z - H.z);
    else if (dir === 'pull') yaw = yawOf(a.pos.x - t.pos.x, a.pos.z - t.pos.z);
    else if (dir === 'away') yaw = yawOf(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    else yaw = a.facing - (h.yaw || 0) * DEG;
    if (dir === 'radial' && Math.hypot(t.pos.x - H.x, t.pos.z - H.z) < 0.05) yaw = a ? a.facing : 0;
    let ang = h.ang !== undefined ? h.ang : 361;
    if (ang === 361) ang = t.grounded ? (kb < 55 ? 0 : 38) : 44;
    const launch = launchVector(kb, yaw, ang);
    const stayGrounded = t.grounded && ang <= 8 && kb < 55;

    if (t.holding !== null) this.releaseCaptured(t);
    t.ledge = null;
    t.setState('hitstun');
    t.hitstun = Math.max(h.minStun || 0, hitstunFrames(kb));
    t.tumble = kb >= KB.TUMBLE;
    t.vel.x = t.vel.z = 0; t.vel.y = 0;
    t.kb.x = t.kb.y = t.kb.z = 0;
    t.fastFall = false;
    t.jumpsLeft = t.st.airJumps; t.recUsed = false; t.airDodgeUsed = false;
    const deadly = kb > 95 && predictKO(t.pos, launch, t.st, this.arena.blast);
    t.hitlag = hl + (deadly ? 8 : 0);
    if (meleeOwner) meleeOwner.hitlag = hl + (deadly ? 8 : 0);
    t.pending = { x: launch.x, y: launch.y, z: launch.z, di: true, stayGrounded };
    if (stayGrounded) { t.pending.y = 0; }
    t.combo++;
    if (a && t.combo > a.stats.maxCombo) a.stats.maxCombo = t.combo;
    this.emit('hit', { a: a ? a.id : -1, t: t.id, x: cx, y: cy, z: cz, dmg, kb, el: h.el || 'punch', heavy: kb >= 100, deadly, combo: t.combo, src: H.src, char: a ? a.charId : null });
  }

  // ------------------------------------------------------------------ body separation
  separate() {
    const F = this.fighters;
    for (let i = 0; i < F.length; i++) {
      const a = F[i];
      if (!a.alive || a.state === 'captured' || a.state === 'ledge' || a.state === 'respawn') continue;
      for (let j = i + 1; j < F.length; j++) {
        const b = F[j];
        if (!b.alive || b.state === 'captured' || b.state === 'ledge' || b.state === 'respawn') continue;
        if (Math.abs(a.pos.y - b.pos.y) > Math.max(a.height, b.height) * 0.8) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = (a.radius + b.radius) * 0.9;
        if (d >= minD) continue;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        const push = (minD - d) * 0.22;
        if (a.grounded || b.grounded) {
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
        }
      }
    }
  }

  // ------------------------------------------------------------------ ring-outs & respawn
  checkBlastZones() {
    const B = this.arena.blast;
    for (const f of this.fighters) {
      if (f.state === 'dead') {
        if (f.eliminated) continue;
        if (--f.deadTimer <= 0) this.respawn(f);
        continue;
      }
      if (f.eliminated) continue;
      const p = f.pos;
      const bad = !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z);
      if (bad || p.x < B.minX || p.x > B.maxX || p.z < B.minZ || p.z > B.maxZ || p.y < B.minY || p.y > B.maxY) {
        this.knockOut(f, bad);
      }
    }
  }

  knockOut(f, bad = false) {
    const B = this.arena.blast;
    const p = f.pos;
    const style = p.y > B.maxY ? 'star' : (p.y < B.minY ? this.arena.koStyle : 'blast');
    const credited = f.lastHitBy >= 0 && this.frame - f.lastHitFrame < RULES.KO_CREDIT_FRAMES;
    const killer = credited ? this.fighters[f.lastHitBy] : null;
    this.emit('ko', {
      id: f.id, by: killer ? killer.id : -1,
      x: bad ? 0 : clamp(p.x, B.minX, B.maxX), y: bad ? 0 : clamp(p.y, B.minY, B.maxY), z: bad ? 0 : clamp(p.z, B.minZ, B.maxZ),
      style, stocksLeft: this.training ? 99 : f.stocks - 1,
    });
    f.stats.falls++;
    if (killer) killer.stats.kos++; else f.stats.sds++;
    this.releaseCaptured(f);
    for (const o of this.fighters) if (o.holding === f.id) { o.holding = null; }
    if (!this.training) f.stocks--;
    f.setState('dead');
    f.deadTimer = RULES.RESPAWN_DELAY;
    f.vel.x = f.vel.y = f.vel.z = 0; f.kb.x = f.kb.y = f.kb.z = 0;
    f.hitlag = 0; f.pending = null; f.captured = null;
    f.transform = 0; f.scale = f.st.scale || 1;
    if (f.stocks <= 0) {
      f.eliminated = true;
      f.elimFrame = this.frame;
    }
  }

  respawn(f) {
    const sp = this.arena.respawn[f.slot % this.arena.respawn.length];
    const keep = { pct: 0, stocks: f.stocks, ult: f.ult, stats: f.stats, cd: f.cd };
    f.spawnAt(sp, yawOf(-sp[0], -sp[2]));
    Object.assign(f, keep);
    if (this.training && f.trainingPct !== undefined) f.pct = f.trainingPct;
    f.grounded = false;
    f.setState('respawn');
    this.emit('respawn', { id: f.id, x: sp[0], y: sp[1], z: sp[2] });
  }

  // ------------------------------------------------------------------ rules
  updateRules() {
    if (this.phase !== 'play') return;
    this.elapsed++;
    if (this.training) return;
    const groups = new Map();
    for (const f of this.fighters) {
      const key = this.teams ? 't' + f.team : 'f' + f.id;
      if (!groups.has(key)) groups.set(key, false);
      if (!f.eliminated) groups.set(key, true);
    }
    const remaining = [...groups.values()].filter(Boolean).length;
    if (this.fighters.length > 1 && remaining <= 1) return this.endMatch('ko');
    if (this.timed) {
      this.timer--;
      if (this.timer <= 0) { this.emit('timeUp', {}); return this.endMatch('time'); }
    }
  }

  endMatch(reason) {
    if (this.phase === 'ending' || this.phase === 'ended') return;
    this.phase = 'ending';
    this.endReason = reason;
    this.endTimer = RULES.END_DELAY;
    this.cine = null;
    this.results = this.computeResults();
    this.emit('gameSet', { reason, winner: this.results.winner, winnerTeam: this.results.winnerTeam });
  }

  computeResults() {
    const score = (f) => (f.eliminated ? -1e6 + f.elimFrame : f.stocks * 10000 - f.pct + f.stats.dmgDealt * 0.001);
    let order;
    if (this.teams) {
      const teamScore = new Map();
      for (const f of this.fighters) teamScore.set(f.team, Math.max(teamScore.get(f.team) ?? -1e9, score(f)));
      order = [...this.fighters].sort((a, b) => (teamScore.get(b.team) - teamScore.get(a.team)) || (score(b) - score(a)));
    } else {
      order = [...this.fighters].sort((a, b) => score(b) - score(a));
    }
    let place = 0, lastTeam = null;
    const rows = order.map((f, i) => {
      if (this.teams) { if (f.team !== lastTeam) { place++; lastTeam = f.team; } }
      else place = i + 1;
      f.place = place;
      return {
        id: f.id, slot: f.slot, name: f.name, char: f.charId, team: f.team, place, cpu: f.cpu,
        stocks: Math.max(0, f.stocks), pct: Math.round(f.pct),
        dmgDealt: Math.round(f.stats.dmgDealt), dmgTaken: Math.round(f.stats.dmgTaken),
        kos: f.stats.kos, falls: f.stats.falls, sds: f.stats.sds, maxCombo: f.stats.maxCombo,
      };
    });
    return {
      rows, winner: rows[0].id, winnerTeam: this.teams ? rows[0].team : null, reason: this.endReason,
      duration: this.elapsed, mode: this.mode, arena: this.arena.id,
    };
  }

  // ------------------------------------------------------------------ training helpers
  setTrainingPct(id, v) {
    const f = this.fighters[id];
    if (!f) return;
    f.pct = clamp(v, 0, RULES.PCT_MAX);
    f.trainingPct = f.pct;
  }

  resetPositions() {
    this.fighters.forEach((f, i) => {
      const sp = this.arena.spawns[i % this.arena.spawns.length];
      const keep = { stocks: f.stocks, stats: f.stats, ult: f.ult, pct: f.trainingPct || 0 };
      f.spawnAt(sp, yawOf(-sp[0], -sp[2]));
      Object.assign(f, keep);
      this.settle(f);
    });
    this.projectiles = []; this.zones = []; this.cine = null;
  }
}

