// Dynamic fighting-game camera: frames every active fighter, smooths, shakes, and does short ultimate cinematics.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.center = new THREE.Vector3(0, 2, 0);
    this.dist = 24;
    this.yawOffset = 0;
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.shakeEnabled = true;
    this.cine = 0; // 0..1 blend toward cinematic framing
    this.cineTarget = new THREE.Vector3();
    this.cineYaw = 0;
    this.baseFov = 40;
    this.punch = 0; // zoom punch on big hits
    this.arena = null;
    this.snap = true;
  }

  setArena(a) { this.arena = a; this.yawOffset = 0; this.snap = true; }
  get yaw() { return (this.arena ? this.arena.camera.yaw : 0) + this.yawOffset; }
  orbit(d) { this.yawOffset = THREE.MathUtils.clamp(this.yawOffset + d, -1.1, 1.1); }

  shake(amount, dur = 0.3) {
    if (!this.shakeEnabled) return;
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  zoomPunch(k = 1) { this.punch = Math.max(this.punch, k); }

  /** points: array of THREE.Vector3 (fighter centres). cine: {pos:Vector3, facing} | null */
  update(dt, points, cine) {
    const a = this.arena;
    const cfg = a ? a.camera : { pitch: 0.4, minDist: 16, maxDist: 40, focusY: 2 };
    // framing box
    const box = new THREE.Box3();
    if (points.length) for (const p of points) box.expandByPoint(p);
    else box.expandByPoint(new THREE.Vector3(0, cfg.focusY, 0));
    box.expandByPoint(new THREE.Vector3(0, cfg.focusY * 0.6, 0)); // keep stage centre loosely in view
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const spread = Math.max(size.x, size.z * 1.2, size.y * 1.6);
    const want = THREE.MathUtils.clamp(spread * 1.05 + 6.5, cfg.minDist * 0.7, cfg.maxDist);
    c.y = Math.max(c.y + 1.2, cfg.focusY);
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 4.5);
    this.center.lerp(c, k);
    this.dist += (want - this.dist) * (this.snap ? 1 : 1 - Math.exp(-dt * 3));
    this.snap = false;
    // cinematic blend
    const ck = cine ? 1 : 0;
    this.cine += (ck - this.cine) * (1 - Math.exp(-dt * (cine ? 10 : 5)));
    if (cine) { this.cineTarget.copy(cine.pos); this.cineYaw = cine.facing; }
    const pitch = cfg.pitch;
    const yaw = this.yaw;
    const pos = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(this.dist * (1 - this.punch * 0.06)).add(this.center);
    const look = this.center.clone();
    if (this.cine > 0.001) {
      // three-quarter close-up in front of the ult user
      const fy = this.cineYaw + 0.6;
      const cp = this.cineTarget.clone().add(new THREE.Vector3(Math.sin(fy) * 5.2, 1.9, Math.cos(fy) * 5.2));
      const cl = this.cineTarget.clone().add(new THREE.Vector3(0, 1.2, 0));
      pos.lerp(cp, this.cine);
      look.lerp(cl, this.cine);
    }
    this.punch = Math.max(0, this.punch - dt * 4);
    // shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeAmt * Math.min(1, this.shakeT * 4);
      pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; pos.z += (Math.random() - 0.5) * s;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(look);
    const fov = this.baseFov - this.cine * 8;
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }

  /** Showcase orbit for menus. */
  orbitShowcase(t, center, radius, height, speed = 0.08) {
    const a = t * speed;
    this.cam.position.set(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius);
    this.cam.lookAt(center);
  }
}
