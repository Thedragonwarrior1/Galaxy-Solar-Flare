// Room / lobby management and the authoritative match loop.
import { World } from '../src/shared/sim/world.js';
import { CpuController } from '../src/shared/sim/ai.js';
import { CHARACTER_IDS } from '../src/shared/characters/index.js';
import { ARENA_IDS } from '../src/shared/sim/arenas.js';
import { parseClientMessage, encodeSnapshot, makeRoomCode, SNAPSHOT_EVERY, MAX_INPUT_QUEUE, PROTOCOL_VERSION } from '../src/shared/protocol.js';

const TICK_MS = 1000 / 60;
const MAX_INPUT_RATE = 130; // messages per second allowed per client (client sends 60)
const MAX_BAD = 40;

export function createRoomManager({ log = () => {} } = {}) {
  const rooms = new Map();
  let nextClient = 1;

  function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  class Room {
    constructor(code, host) {
      this.code = code;
      this.clients = []; // {ws, id, name, char, ready, team}
      this.host = host.id;
      this.settings = { mode: 'ffa', arena: 'random', stocks: 3, time: 300, hazards: false, cpus: 0 };
      this.state = 'lobby';
      this.world = null;
      this.timer = null;
      this.slots = [];
      this.results = null;
      this.pendingEvents = [];
    }
    publicState() {
      return {
        code: this.code, host: this.host, state: this.state, settings: this.settings,
        players: this.clients.map((c) => ({ id: c.id, name: c.name, char: c.char, ready: c.ready, team: c.team })),
      };
    }
    broadcast(obj) { const s = JSON.stringify(obj); for (const c of this.clients) if (c.ws.readyState === 1) c.ws.send(s); }
    sync() { this.broadcast({ t: 'room', room: this.publicState() }); }

    add(c) {
      if (this.clients.length >= 4) return 'Room is full';
      if (this.state !== 'lobby') return 'Match already in progress';
      c.room = this; c.ready = false; c.char = c.char || null; c.team = this.clients.length % 2;
      this.clients.push(c);
      this.sync();
      return null;
    }
    remove(c) {
      this.clients = this.clients.filter((x) => x !== c);
      c.room = null;
      if (this.state === 'playing' && this.world) {
        // a bot takes over the disconnected player's fighter so the match can finish
        const s = this.slots.find((sl) => sl.client === c);
        if (s) { s.client = null; s.cpu = new CpuController(this.world, s.slot, 5, 'cpu', 99); }
      }
      if (this.clients.length === 0) { this.stop(); rooms.delete(this.code); log('room closed', this.code); return; }
      if (this.host === c.id) this.host = this.clients[0].id;
      this.sync();
    }

    effectiveMode() {
      const n = this.clients.length + (this.settings.cpus | 0);
      if (this.settings.mode === '1v1' && n !== 2) return n === 4 ? '2v2' : 'ffa';
      if (this.settings.mode === '2v2' && n !== 4) return n === 2 ? '1v1' : 'ffa';
      return this.settings.mode;
    }

    start(by) {
      if (by.id !== this.host) return 'Only the host can start the match';
      if (this.state !== 'lobby') return 'Already started';
      const total = this.clients.length + (this.settings.cpus | 0);
      if (total < 2) return 'Need at least 2 fighters (invite a friend or add CPUs)';
      if (total > 4) return 'At most 4 fighters';
      for (const c of this.clients) {
        if (!CHARACTER_IDS.includes(c.char)) return `${c.name} has not picked a fighter`;
        if (!c.ready && c.id !== this.host) return `${c.name} is not ready`;
      }
      const mode = this.effectiveMode();
      const arena = this.settings.arena === 'random' ? ARENA_IDS[Math.floor(Math.random() * ARENA_IDS.length)] : this.settings.arena;
      const players = this.clients.map((c, i) => ({ char: c.char, name: c.name, team: mode === '2v2' ? c.team : i }));
      for (let i = 0; i < (this.settings.cpus | 0); i++) {
        players.push({ char: CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)], name: `CPU ${i + 1}`, cpu: 6, team: mode === '2v2' ? (players.length % 2) : players.length });
      }
      if (mode === '2v2') { // balance teams
        const t0 = players.filter((p) => p.team === 0).length;
        if (t0 !== 2) players.forEach((p, i) => { p.team = i % 2; });
      }
      const seed = (Math.random() * 1e9) | 0;
      const cfg = { arena, mode, stocks: this.settings.stocks, time: this.settings.time, hazards: this.settings.hazards, players, seed };
      this.world = new World(cfg);
      this.slots = players.map((p, i) => ({
        slot: i, client: i < this.clients.length ? this.clients[i] : null, queue: [], last: { mx: 0, mz: 0, b: 0 }, lastSeq: -1,
        cpu: p.cpu ? new CpuController(this.world, i, p.cpu, 'cpu', seed + i) : null,
      }));
      this.state = 'playing';
      this.clients.forEach((c, i) => send(c.ws, { t: 'start', cfg, you: i }));
      this.sync();
      log('match start', this.code, mode, arena, players.map((p) => p.char).join(','));
      this.tickCount = 0;
      this.t0 = Date.now();
      this.acc = 0;
      this.lastT = performance.now();
      this.timer = setInterval(() => this.loop(), 8);
      return null;
    }

    loop() {
      const now = performance.now();
      this.acc += now - this.lastT;
      this.lastT = now;
      let steps = 0;
      while (this.acc >= TICK_MS && steps < 5) { this.acc -= TICK_MS; this.tick(); steps++; }
      if (this.acc > 200) this.acc = 0; // never spiral
    }

    tick() {
      const w = this.world;
      if (!w) return;
      const inputs = this.slots.map((s) => {
        if (s.cpu) return s.cpu.think();
        if (s.queue.length) s.last = s.queue.shift();
        return s.last;
      });
      w.step(inputs);
      if (w.events.length) this.pendingEvents.push(...w.events.map((e) => ({ ...e })));
      this.tickCount++;
      if (this.tickCount % SNAPSHOT_EVERY === 0 || w.phase === 'ended') {
        const ev = this.pendingEvents; this.pendingEvents = [];
        this.broadcast(encodeSnapshot(w, ev));
      }
      if (w.phase === 'ended') {
        this.results = w.results;
        this.broadcast({ t: 'end', results: w.results });
        this.stop();
        this.state = 'results';
        for (const c of this.clients) c.ready = false;
        this.sync();
        log('match end', this.code, 'winner', w.results.winner);
      }
    }

    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

    input(c, m) {
      if (this.state !== 'playing') return;
      const s = this.slots.find((sl) => sl.client === c);
      if (!s) return;
      if (m.s <= s.lastSeq) return; // duplicate / replayed input
      s.lastSeq = m.s;
      s.queue.push({ mx: m.mx, mz: m.mz, b: m.b });
      if (s.queue.length > MAX_INPUT_QUEUE) s.queue.splice(0, s.queue.length - MAX_INPUT_QUEUE);
    }
  }

  function connect(ws) {
    const c = { ws, id: nextClient++, name: 'Pirate', room: null, bad: 0, rate: { t: Date.now(), n: 0 } };
    send(ws, { t: 'welcome', id: c.id, v: PROTOCOL_VERSION });
    ws.on('message', (data) => {
      // rate limiting
      const now = Date.now();
      if (now - c.rate.t > 1000) { c.rate.t = now; c.rate.n = 0; }
      if (++c.rate.n > MAX_INPUT_RATE) { c.bad++; if (c.bad > MAX_BAD) ws.close(1008, 'rate limit'); return; }
      const m = parseClientMessage(typeof data === 'string' ? data : data.toString());
      if (!m) { c.bad++; if (c.bad > MAX_BAD) ws.close(1008, 'invalid messages'); return; }
      handle(c, m);
    });
    ws.on('close', () => { if (c.room) c.room.remove(c); });
    ws.on('error', () => {});
  }

  function handle(c, m) {
    const r = c.room;
    switch (m.t) {
      case 'hello': c.name = m.name; if (r) r.sync(); break;
      case 'create': {
        if (r) r.remove(c);
        let code; do code = makeRoomCode(); while (rooms.has(code));
        const room = new Room(code, c);
        rooms.set(code, room);
        room.add(c);
        log('room created', code);
        break;
      }
      case 'join': {
        const room = rooms.get(m.code);
        if (!room) return send(c.ws, { t: 'error', msg: 'Room not found' });
        if (r && r !== room) r.remove(c);
        if (r === room) return;
        const err = room.add(c);
        if (err) send(c.ws, { t: 'error', msg: err });
        break;
      }
      case 'leave': if (r) r.remove(c); send(c.ws, { t: 'left' }); break;
      case 'char': if (r && r.state === 'lobby') { c.char = m.char; c.ready = false; r.sync(); } break;
      case 'team': if (r && r.state === 'lobby') { c.team = m.team; r.sync(); } break;
      case 'ready': if (r && r.state === 'lobby') { if (m.v && !CHARACTER_IDS.includes(c.char)) return send(c.ws, { t: 'error', msg: 'Pick a fighter first' }); c.ready = m.v; r.sync(); } break;
      case 'settings': if (r && r.state === 'lobby') { if (c.id !== r.host) return send(c.ws, { t: 'error', msg: 'Only the host can change rules' }); Object.assign(r.settings, m.s); r.sync(); } break;
      case 'start': if (r) { const err = r.start(c); if (err) send(c.ws, { t: 'error', msg: err }); } break;
      case 'rematch': if (r && r.state === 'results' && c.id === r.host) { r.state = 'lobby'; r.world = null; r.sync(); } break;
      case 'in': if (r) r.input(c, m); break;
      case 'ping': send(c.ws, { t: 'pong', c: m.c, s: Date.now() }); break;
      default: break;
    }
  }

  return {
    connect,
    count: () => rooms.size,
    rooms,
    shutdown() { for (const r of rooms.values()) r.stop(); rooms.clear(); },
  };
}
