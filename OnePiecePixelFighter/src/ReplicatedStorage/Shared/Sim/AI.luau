--!strict
-- CPU opponent and training-dummy behaviours. Produces the same input bits a
-- player would, so it can never do anything a player cannot.

local Input = require(script.Parent.Input)

local AI = {}
AI.__index = AI

export type Mode = "cpu" | "stand" | "crouch" | "jump" | "block" | "record"

function AI.new(slot: number, difficulty: number?, seed: number?)
	return setmetatable({
		slot = slot,
		difficulty = math.clamp(difficulty or 0.6, 0, 1),
		seed = seed or 7,
		plan = 0,
		planFrames = 0,
		cooldown = 0,
		lastHit = false,
		mode = "cpu" :: Mode,
	}, AI)
end

-- tiny deterministic LCG (Random is unavailable outside Roblox)
function AI.rand(self: any): number
	self.seed = (self.seed * 1103515245 + 12345) % 2147483648
	return self.seed / 2147483648
end

local function fwdBit(me: any, op: any): number
	return if op.x >= me.x then Input.RIGHT else Input.LEFT
end

local function backBit(me: any, op: any): number
	return if op.x >= me.x then Input.LEFT else Input.RIGHT
end

-- rough reach of a fighter's normals, measured from the generated hitboxes
local reachCache: { [string]: number } = {}
local function reach(me: any, name: string): number
	local key = me.id .. name
	if reachCache[key] then
		return reachCache[key]
	end
	local r = 30
	local anim = me.fd[name]
	if anim then
		for _, row in anim.frames do
			for _, b in row.hit or {} do
				r = math.max(r, b[1] + b[3])
			end
		end
	end
	reachCache[key] = r
	return r
end

function AI.dummy(self: any, match: any): number
	local me = match.fighters[self.slot]
	local op = match.fighters[3 - self.slot]
	local mode = self.mode
	if mode == "stand" then
		return 0
	elseif mode == "crouch" then
		return Input.DOWN
	elseif mode == "jump" then
		return if match.frame % 50 < 3 then Input.UP else 0
	elseif mode == "block" then
		local bits = Input.BLOCK
		local m = op.move
		if op.state == "attack" and m and m.height == "low" then
			bits += Input.DOWN
		end
		return bits
	end
	return self:think(match)
end

function AI.think(self: any, match: any): number
	local me = match.fighters[self.slot]
	local op = match.fighters[3 - self.slot]
	if match.phase ~= "fight" and match.phase ~= "ready" then
		return 0
	end
	local dist = math.abs(op.x - me.x)
	local fwd, back = fwdBit(me, op), backBit(me, op)
	local d = self.difficulty

	-- keep executing the current plan
	if self.planFrames > 0 then
		self.planFrames -= 1
		return self.plan
	end

	-- combo follow-up when an attack connected
	if me.state == "attack" and me.connected and me.hitstop == 0 then
		local m = me.move
		if m.rank == 1 and self:rand() < 0.5 + d * 0.4 then
			return Input.MEDIUM
		elseif m.rank == 2 and self:rand() < 0.4 + d * 0.5 then
			return Input.HEAVY
		elseif m.rank == 3 and self:rand() < 0.3 + d * 0.5 then
			if me.meter >= 100 and self:rand() < 0.5 then
				return Input.SUPER
			end
			return Input.SPECIAL
		end
		return 0
	end

	if not me:actionable() and me.state ~= "air" then
		return 0
	end

	-- reaction delay
	if self.cooldown > 0 then
		self.cooldown -= 1
		return if me.state == "block" then self.plan else 0
	end
	self.cooldown = math.floor(14 - d * 10)

	local function setPlan(bits: number, frames: number): number
		self.plan = bits
		self.planFrames = frames
		return bits
	end

	-- defence: block attacks that are coming
	local threat = (op.state == "attack" and op.move and dist < reach(op, op.move.anim) + 30)
	if threat and self:rand() < 0.25 + d * 0.6 then
		local low = op.move.height == "low"
		local guessLow = if self:rand() < 0.6 + d * 0.35 then low else not low
		return setPlan(Input.BLOCK + (if guessLow then Input.DOWN else 0), 10)
	end
	for _, p in match.projectiles do
		if p.owner ~= self.slot and math.abs(p.x - me.x) < 120 and self:rand() < 0.4 + d * 0.5 then
			if self:rand() < 0.3 then
				return setPlan(Input.UP + fwd, 4)
			end
			return setPlan(Input.BLOCK, 14)
		end
	end

	-- anti-air
	if op:isAirborne() and op.state ~= "launched" and dist < 90 and self:rand() < 0.2 + d * 0.6 then
		return setPlan(Input.DOWN + Input.HEAVY, 2)
	end

	if me.state == "air" then
		if dist < 70 and self:rand() < 0.6 then
			return Input.HEAVY
		end
		return 0
	end

	-- super when it can reach
	if me.meter >= 100 and dist < 110 and self:rand() < 0.15 + d * 0.2 then
		return setPlan(Input.SUPER, 1)
	end

	local zoner = me.id == "Enel" or me.id == "Doflamingo" or me.id == "Zoro"
	if zoner and dist > 150 and self:rand() < 0.35 then
		return setPlan(Input.SPECIAL, 1)
	end

	local r = self:rand()
	local rM = reach(me, "StandMedium")
	local rH = reach(me, "StandHeavy")
	if dist <= reach(me, "StandLight") + 14 then
		if r < 0.35 then
			return setPlan(Input.LIGHT, 1)
		elseif r < 0.55 then
			return setPlan(Input.DOWN + Input.MEDIUM, 2)
		elseif r < 0.7 then
			return setPlan(Input.MEDIUM, 1)
		elseif r < 0.8 then
			return setPlan(back, 14)
		elseif r < 0.88 and me.moves.Special then
			return setPlan(Input.SPECIAL, 1)
		end
		return setPlan(Input.BLOCK, 12)
	elseif dist <= rM + 12 and r < 0.4 then
		return setPlan(Input.MEDIUM, 1)
	elseif dist <= rH + 10 and r < 0.3 then
		return setPlan(Input.HEAVY, 1)
	elseif r < 0.08 + d * 0.06 then
		return setPlan(Input.UP + fwd, 3)
	elseif r < 0.2 and dist > 120 then
		self.plan = 0
		self.planFrames = 0
		-- double tap forward to dash
		return Input.DASH + fwd
	end
	return setPlan(fwd, 10 + math.floor(self:rand() * 14))
end

return AI
