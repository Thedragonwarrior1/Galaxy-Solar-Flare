--!strict
-- The "view" is everything the client needs to draw a frame of a match.
-- Local modes build it straight from the Match; online play serialises it on
-- the server into a compact buffer (sent ~30 Hz over an UnreliableRemoteEvent)
-- and the client decodes it. The renderer and HUD only ever see views, so
-- local and online matches are drawn by exactly the same code.

local CharacterData = require(script.Parent.CharacterData)

local Protocol = {}

Protocol.Phases = { "intro", "ready", "fight", "ko", "roundEnd", "matchEnd" }
Protocol.States = {
	"intro",
	"idle",
	"walk",
	"walkback",
	"crouch",
	"jumpsquat",
	"air",
	"land",
	"dash",
	"backdash",
	"attack",
	"block",
	"blockstun",
	"hitstun",
	"bound",
	"launched",
	"knockdown",
	"getup",
	"victory",
	"wait",
	"dead",
}
Protocol.Anims = {
	"Idle",
	"Walk",
	"WalkBack",
	"Crouch",
	"JumpSquat",
	"JumpRise",
	"JumpApex",
	"JumpFall",
	"Land",
	"DashForward",
	"DashBack",
	"Block",
	"CrouchBlock",
	"HitLight",
	"HitHeavy",
	"HitCrouch",
	"Launched",
	"Knockdown",
	"GetUp",
	"Defeat",
	"Victory",
	"Intro",
	"StandLight",
	"StandMedium",
	"StandHeavy",
	"CrouchLight",
	"CrouchMedium",
	"CrouchHeavy",
	"AirLight",
	"AirMedium",
	"AirHeavy",
	"Special",
	"Special2",
	"Counter",
	"Super",
}
Protocol.Projectiles = { "parasite", "birdcage", "vari", "elthor", "slash" }

local function index(list: { string }): { [string]: number }
	local t = {}
	for i, v in list do
		t[v] = i
	end
	return t
end
local PHASE = index(Protocol.Phases)
local STATE = index(Protocol.States)
local ANIM = index(Protocol.Anims)
local PROJ = index(Protocol.Projectiles)
local CHAR = index(CharacterData.Order)

export type FighterView = {
	char: string,
	palette: number,
	x: number,
	y: number,
	facing: number,
	anim: string,
	row: number,
	hp: number,
	maxHp: number,
	meter: number,
	combo: number,
	comboDamage: number,
	state: string,
	invuln: boolean,
	ko: boolean,
	ex: boolean,
	bound: boolean,
	airborne: boolean,
	moveName: string?,
}

export type View = {
	frame: number,
	phase: string,
	phaseFrame: number,
	round: number,
	wins: { number },
	timer: number,
	freeze: number,
	result: number?,
	stage: string?,
	fighters: { FighterView },
	projectiles: { any },
	events: { any },
}

function Protocol.view(match: any, out: View?): View
	local v: View = out
		or {
			frame = 0,
			phase = "intro",
			phaseFrame = 0,
			round = 1,
			wins = { 0, 0 },
			timer = 0,
			freeze = 0,
			result = nil,
			fighters = { {} :: any, {} :: any },
			projectiles = {},
			events = {},
		}
	v.frame = match.frame
	v.phase = match.phase
	v.phaseFrame = match.phaseFrame
	v.round = match.round
	v.wins[1], v.wins[2] = match.wins[1], match.wins[2]
	v.timer = match.timer
	v.freeze = match.freeze
	v.result = match.result
	v.stage = match.stage
	for i, f in match.fighters do
		local fv = v.fighters[i]
		local anim, row = f:animRow()
		fv.char = f.id
		fv.palette = f.palette
		fv.x, fv.y, fv.facing = f.x, f.y, f.facing
		fv.anim, fv.row = anim, row
		fv.hp, fv.maxHp = f.hp, f.maxHp
		fv.meter = f.meter
		fv.combo, fv.comboDamage = f.combo, f.comboDamage
		fv.state = f.state
		fv.invuln = f:isInvulnerable()
		fv.ko = f.ko
		fv.ex = f.exActive
		fv.bound = f.bound
		fv.airborne = f:isAirborne()
		fv.moveName = if f.move then f.move.name else nil
	end
	table.clear(v.projectiles)
	for _, p in match.projectiles do
		table.insert(v.projectiles, {
			id = p.id,
			kind = p.kind,
			owner = p.owner,
			x = p.x,
			y = p.y,
			facing = p.facing,
			age = p.age,
			w = p.w,
			h = p.h,
		})
	end
	v.events = match.events
	return v
end

-- ---------------------------------------------------------------------------
-- binary snapshot
-- ---------------------------------------------------------------------------
local HEADER = 4 + 1 + 2 + 1 + 1 + 1 + 2 + 1 + 1
local FIGHTER = 1 + 1 + 4 + 4 + 1 + 1 + 1 + 2 + 2 + 1 + 1 + 2 + 1 + 1
local PROJ_SIZE = 2 + 1 + 1 + 4 + 4 + 1 + 2 + 2 + 2

function Protocol.encode(v: View): buffer
	local n = math.min(#v.projectiles, 20)
	local b = buffer.create(HEADER + FIGHTER * 2 + 1 + PROJ_SIZE * n)
	local o = 0
	buffer.writeu32(b, o, v.frame)
	o += 4
	buffer.writeu8(b, o, PHASE[v.phase] or 1)
	o += 1
	buffer.writeu16(b, o, math.min(v.phaseFrame, 65535))
	o += 2
	buffer.writeu8(b, o, v.round)
	o += 1
	buffer.writeu8(b, o, v.wins[1])
	o += 1
	buffer.writeu8(b, o, v.wins[2])
	o += 1
	buffer.writeu16(b, o, math.clamp(v.timer, 0, 65535))
	o += 2
	buffer.writeu8(b, o, math.clamp(v.freeze, 0, 255))
	o += 1
	buffer.writeu8(b, o, if v.result == nil then 255 else v.result)
	o += 1
	for i = 1, 2 do
		local f = v.fighters[i]
		buffer.writeu8(b, o, CHAR[f.char] or 1)
		o += 1
		buffer.writeu8(b, o, f.palette)
		o += 1
		buffer.writef32(b, o, f.x)
		o += 4
		buffer.writef32(b, o, f.y)
		o += 4
		buffer.writei8(b, o, f.facing)
		o += 1
		buffer.writeu8(b, o, ANIM[f.anim] or 1)
		o += 1
		buffer.writeu8(b, o, math.clamp(f.row, 1, 255))
		o += 1
		buffer.writeu16(b, o, math.clamp(math.floor(f.hp), 0, 65535))
		o += 2
		buffer.writeu16(b, o, f.maxHp)
		o += 2
		buffer.writeu8(b, o, math.clamp(math.floor(f.meter), 0, 255))
		o += 1
		buffer.writeu8(b, o, math.clamp(f.combo, 0, 255))
		o += 1
		buffer.writeu16(b, o, math.clamp(f.comboDamage, 0, 65535))
		o += 2
		local flags = (if f.invuln then 1 else 0)
			+ (if f.ko then 2 else 0)
			+ (if f.ex then 4 else 0)
			+ (if f.bound then 8 else 0)
			+ (if f.airborne then 16 else 0)
		buffer.writeu8(b, o, flags)
		o += 1
		buffer.writeu8(b, o, STATE[f.state] or 2)
		o += 1
	end
	buffer.writeu8(b, o, n)
	o += 1
	for i = 1, n do
		local p = v.projectiles[i]
		buffer.writeu16(b, o, p.id % 65536)
		o += 2
		buffer.writeu8(b, o, PROJ[p.kind] or 1)
		o += 1
		buffer.writeu8(b, o, p.owner)
		o += 1
		buffer.writef32(b, o, p.x)
		o += 4
		buffer.writef32(b, o, p.y)
		o += 4
		buffer.writei8(b, o, p.facing)
		o += 1
		buffer.writeu16(b, o, math.min(p.age, 65535))
		o += 2
		buffer.writeu16(b, o, p.w)
		o += 2
		buffer.writeu16(b, o, p.h)
		o += 2
	end
	return b
end

-- Returns nil for malformed data (never trust the network, even server -> client).
function Protocol.decode(b: any): View?
	if typeof(b) ~= "buffer" then
		return nil
	end
	local len = buffer.len(b)
	if len < HEADER + FIGHTER * 2 + 1 then
		return nil
	end
	local o = 0
	local v: any = { wins = {}, fighters = {}, projectiles = {}, events = {} }
	v.frame = buffer.readu32(b, o)
	o += 4
	v.phase = Protocol.Phases[buffer.readu8(b, o)] or "fight"
	o += 1
	v.phaseFrame = buffer.readu16(b, o)
	o += 2
	v.round = buffer.readu8(b, o)
	o += 1
	v.wins[1] = buffer.readu8(b, o)
	o += 1
	v.wins[2] = buffer.readu8(b, o)
	o += 1
	v.timer = buffer.readu16(b, o)
	o += 2
	v.freeze = buffer.readu8(b, o)
	o += 1
	local r = buffer.readu8(b, o)
	o += 1
	v.result = if r == 255 then nil else r
	for i = 1, 2 do
		local f: any = {}
		f.char = CharacterData.Order[buffer.readu8(b, o)] or "LuffyGear2"
		o += 1
		f.palette = buffer.readu8(b, o)
		o += 1
		f.x = buffer.readf32(b, o)
		o += 4
		f.y = buffer.readf32(b, o)
		o += 4
		f.facing = if buffer.readi8(b, o) < 0 then -1 else 1
		o += 1
		f.anim = Protocol.Anims[buffer.readu8(b, o)] or "Idle"
		o += 1
		f.row = buffer.readu8(b, o)
		o += 1
		f.hp = buffer.readu16(b, o)
		o += 2
		f.maxHp = math.max(1, buffer.readu16(b, o))
		o += 2
		f.meter = buffer.readu8(b, o)
		o += 1
		f.combo = buffer.readu8(b, o)
		o += 1
		f.comboDamage = buffer.readu16(b, o)
		o += 2
		local flags = buffer.readu8(b, o)
		o += 1
		f.invuln = bit32.band(flags, 1) ~= 0
		f.ko = bit32.band(flags, 2) ~= 0
		f.ex = bit32.band(flags, 4) ~= 0
		f.bound = bit32.band(flags, 8) ~= 0
		f.airborne = bit32.band(flags, 16) ~= 0
		f.state = Protocol.States[buffer.readu8(b, o)] or "idle"
		o += 1
		v.fighters[i] = f
	end
	local n = buffer.readu8(b, o)
	o += 1
	if len < o + n * PROJ_SIZE then
		return nil
	end
	for _ = 1, n do
		local p: any = {}
		p.id = buffer.readu16(b, o)
		o += 2
		p.kind = Protocol.Projectiles[buffer.readu8(b, o)] or "vari"
		o += 1
		p.owner = buffer.readu8(b, o)
		o += 1
		p.x = buffer.readf32(b, o)
		o += 4
		p.y = buffer.readf32(b, o)
		o += 4
		p.facing = if buffer.readi8(b, o) < 0 then -1 else 1
		o += 1
		p.age = buffer.readu16(b, o)
		o += 2
		p.w = buffer.readu16(b, o)
		o += 2
		p.h = buffer.readu16(b, o)
		o += 2
		table.insert(v.projectiles, p)
	end
	return v
end

-- Events are plain tables; strip anything that is not a small scalar before sending.
function Protocol.cleanEvents(events: { any }): { any }
	local out = {}
	for i, e in events do
		if i > 40 then
			break
		end
		local c = {}
		for k, val in e do
			local t = type(val)
			if t == "number" or t == "string" or t == "boolean" then
				c[k] = val
			end
		end
		table.insert(out, c)
	end
	return out
end

return Protocol
