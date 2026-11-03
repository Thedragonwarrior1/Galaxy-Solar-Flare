--!strict
-- Schema, defaults and validation for move definitions.
--
-- Character files (ReplicatedStorage/Characters/<Id>/CharacterConfig) describe
-- their moves with AttackDefinitions.move{...}. Anything not specified falls
-- back to the defaults of the move's strength class, so a character file only
-- states what makes a move different.
--
-- Frame data is in 60 Hz frames. Hitboxes normally come from the generated
-- FrameData (they follow the striking limb / blade of the drawn sprite); a move
-- can override them with `hitbox = { {x, y, w, h}, ... }` (fighter space,
-- x forward, y up from the feet).

local AttackDefinitions = {}

export type Motion = { from: number, to: number, vx: number?, vy: number? }
export type Projectile = {
	at: number, -- move frame that spawns it
	kind: string, -- renderer effect id
	x: number,
	y: number,
	vx: number,
	vy: number?,
	life: number,
	w: number,
	h: number,
	hits: number?,
	interval: number?,
	spawn: string?, -- "self" (default) | "opponent" (appears at the opponent's x)
	gravity: number?,
}

export type Move = {
	id: string,
	anim: string,
	class: string, -- L M H SP SU
	rank: number,
	startup: number,
	active: number,
	recovery: number,
	damage: number,
	chip: number,
	hitstun: number,
	blockstun: number,
	hitstop: number,
	kbX: number,
	launch: number?, -- vertical launch velocity (anti-airs, finishers)
	knockdown: boolean?, -- trips/ground bounces into a knockdown
	height: string, -- "mid" | "low" | "high" (overhead)
	multi: { count: number, interval: number }?,
	activeLoop: boolean?,
	cancelWindow: number, -- frames after the active window that still allow cancels
	motion: { Motion }?,
	projectile: Projectile?,
	invuln: { from: number, to: number }?,
	armor: { from: number, to: number, hits: number }?,
	counter: { from: number, to: number, follow: string }?,
	charge: { at: number, max: number, bonus: number }?,
	teleport: { at: number, dist: number }?,
	ex: { cost: number, damage: number, extraHits: number?, armor: boolean? }?,
	bind: number?, -- frames the opponent is bound on hit (Doflamingo)
	meterCost: number,
	air: boolean,
	hidden: boolean?, -- not directly inputtable (follow-ups)
	hitbox: { { number } }?,
	shake: number,
	vfx: string?,
	sfx: string?,
	name: string,
}

local CLASS = {
	L = { rank = 1, hitstop = 7, hitstun = 14, blockstun = 10, kbX = 2.0, chip = 0, shake = 0, cancelWindow = 10 },
	M = { rank = 2, hitstop = 9, hitstun = 17, blockstun = 13, kbX = 2.8, chip = 0, shake = 1, cancelWindow = 10 },
	H = { rank = 3, hitstop = 12, hitstun = 21, blockstun = 16, kbX = 4.0, chip = 0, shake = 2, cancelWindow = 12 },
	SP = { rank = 4, hitstop = 12, hitstun = 22, blockstun = 16, kbX = 4.4, chip = 0.12, shake = 2, cancelWindow = 12 },
	SU = { rank = 5, hitstop = 16, hitstun = 30, blockstun = 20, kbX = 5.5, chip = 0.15, shake = 4, cancelWindow = 0 },
}
AttackDefinitions.Classes = CLASS

local REQUIRED = { "anim", "startup", "active", "recovery" }

function AttackDefinitions.move(def: { [string]: any }): Move
	local class = def.class or "M"
	local c = CLASS[class]
	assert(c, "unknown move class " .. tostring(class))
	for _, k in REQUIRED do
		assert(def[k] ~= nil, "move missing field " .. k)
	end
	local m = table.clone(def) :: any
	m.class = class
	m.rank = def.rank or c.rank
	m.damage = def.damage or 0
	m.chip = def.chip or c.chip
	m.hitstun = def.hitstun or c.hitstun
	m.blockstun = def.blockstun or c.blockstun
	m.hitstop = def.hitstop or c.hitstop
	m.kbX = def.kbX or c.kbX
	m.height = def.height or "mid"
	m.cancelWindow = def.cancelWindow or c.cancelWindow
	m.meterCost = def.meterCost or (if class == "SU" then 100 else 0)
	m.air = def.air == true
	m.shake = def.shake or c.shake
	m.name = def.name or def.anim
	assert(m.startup >= 1 and m.active >= 1 and m.recovery >= 0, "bad frame data for " .. m.name)
	assert(m.height == "mid" or m.height == "low" or m.height == "high", "bad height on " .. m.name)
	return m :: Move
end

-- Fill ids and validate a whole move table against the animation data.
function AttackDefinitions.finalize(charId: string, moves: { [string]: any }, frameData: { [string]: any }): { [string]: Move }
	for id, m in moves do
		m.id = id
		local anim = frameData[m.anim]
		assert(anim, string.format("%s.%s uses missing animation %s", charId, id, tostring(m.anim)))
		if m.counter then
			assert(moves[m.counter.follow], charId .. " counter follow-up missing: " .. m.counter.follow)
		end
	end
	return moves :: any
end

-- Frame advantage helper used by training mode's readout.
function AttackDefinitions.advantage(m: Move): (number, number)
	local onHit = m.hitstun - m.recovery
	local onBlock = m.blockstun - m.recovery
	return onHit, onBlock
end

return AttackDefinitions
