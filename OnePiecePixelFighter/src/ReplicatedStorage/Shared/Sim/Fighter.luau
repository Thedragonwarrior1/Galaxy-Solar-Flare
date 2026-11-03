--!strict
--!optimize 2
-- One fighter: input interpretation, the state machine, physics and move
-- progression. Hit resolution between fighters lives in Combat.luau; round
-- flow in Match.luau. Pure Luau (no Roblox APIs) so the server, the client and
-- the offline test-suite all run the exact same code.

local Config = require(script.Parent.Parent.CombatConfig)
local Input = require(script.Parent.Input)
local Timeline = require(script.Parent.Timeline)

local Fighter = {}
Fighter.__index = Fighter

-- states that accept new commands
local ACTIONABLE = {
	idle = true,
	walk = true,
	walkback = true,
	crouch = true,
	block = true,
}

local GROUND_FACE = {
	idle = true,
	walk = true,
	walkback = true,
	crouch = true,
	block = true,
	land = true,
	jumpsquat = true,
}

export type Fighter = typeof(setmetatable({} :: any, Fighter))

function Fighter.new(slot: number, char: any, x: number, facing: number, palette: number?)
	local stats = char.config.Stats
	local self = setmetatable({
		slot = slot,
		char = char,
		id = char.id,
		stats = stats,
		fd = char.frameData,
		moves = char.moves,
		palette = palette or 0,

		x = x,
		y = 0,
		vx = 0,
		vy = 0,
		pvx = 0, -- pushback / knockback velocity on the ground
		facing = facing,
		-- head height (from the idle frame) decides face vs body hit reactions
		height = (
			char.frameData.Idle.frames[1].anc
			and char.frameData.Idle.frames[1].anc.head
			and char.frameData.Idle.frames[1].anc.head[2]
		) or 70,
		hp = stats.Health,
		maxHp = stats.Health,
		meter = 0,

		state = "intro",
		stateFrame = 0,
		hitAnim = "HitLight",

		move = nil :: any,
		moveFrame = 0,
		curFrame = 0,
		chargeTime = 0,
		hitRegistry = {} :: { [number]: boolean },
		connected = false,
		lightChain = 0,
		usedInChain = {} :: { [string]: boolean },
		exActive = false,
		armorLeft = 0,

		stun = 0, -- frames of hitstun / blockstun / bind left
		hitstop = 0,
		invuln = 0,
		juggle = 0,
		combo = 0, -- hits taken in the current combo (the attacker's combo count)
		comboDamage = 0,
		comboMoves = {} :: { [string]: number },
		ko = false,
		airJumps = 0,
		jumpDir = 0,
		dashTimer = 0,
		superFlash = false,
		bound = false,

		-- input
		held = 0,
		prevHeld = 0,
		pressAt = {} :: { [number]: number },
		consumedAt = {} :: { [number]: number },
		lastTap = { [1] = -999, [-1] = -999 },
		lastDownAt = -999,
		frame = 0,
		clock = 0, -- advances only while the fighter is not in hitstop (keeps buffered inputs fresh)
		dashDir = 1,
		crouchingFlag = false,

		-- stats for training mode
		lastMoveName = "",
		lastAdvantage = 0,
	}, Fighter)
	return self
end

-- --------------------------------------------------------------------------
-- input
-- --------------------------------------------------------------------------
function Fighter.setInput(self: Fighter, bits: number, pressedMask: number?, _frame: number)
	local frame = self.clock
	self.frame = frame
	bits = Input.sanitize(bits)
	local fresh = bit32.band(bits, bit32.bnot(self.held))
	if pressedMask then
		fresh = bit32.bor(fresh, Input.sanitize(pressedMask))
	end
	for _, b in Input.Buttons do
		if bit32.band(fresh, b) ~= 0 then
			self.pressAt[b] = frame
		end
	end
	-- double-tap dash detection (relative to facing)
	if bit32.band(fresh, Input.LEFT + Input.RIGHT) ~= 0 then
		local dir = if bit32.band(fresh, Input.RIGHT) ~= 0 then 1 else -1
		local rel = dir * self.facing
		if frame - self.lastTap[rel] <= Config.DashWindow then
			self.pressAt[Input.DASH] = frame
			self.dashDir = rel
			self.lastTap[rel] = -999
		else
			self.lastTap[rel] = frame
		end
	end
	if bit32.band(fresh, Input.DASH) ~= 0 then
		local h = Input.horizontal(bits, self.facing)
		self.dashDir = if h == -1 then -1 else 1
	end
	if bit32.band(bits, Input.DOWN) ~= 0 then
		self.lastDownAt = frame
	end
	self.prevHeld = self.held
	self.held = bits
end

function Fighter.pressed(self: Fighter, b: number): boolean
	local at = self.pressAt[b]
	if not at then
		return false
	end
	if self.frame - at > Config.InputBuffer then
		return false
	end
	return at > (self.consumedAt[b] or -1)
end

function Fighter.consume(self: Fighter, b: number)
	self.consumedAt[b] = self.frame
end

function Fighter.holding(self: Fighter, b: number): boolean
	return bit32.band(self.held, b) ~= 0
end

-- --------------------------------------------------------------------------
-- state helpers
-- --------------------------------------------------------------------------
function Fighter.setState(self: Fighter, s: string)
	self.state = s
	self.stateFrame = 0
end

function Fighter.isAirborne(self: Fighter): boolean
	return self.y > 0 or self.state == "air" or self.state == "launched"
end

function Fighter.actionable(self: Fighter): boolean
	return ACTIONABLE[self.state] == true
end

function Fighter.inHitState(self: Fighter): boolean
	local s = self.state
	return s == "hitstun" or s == "launched" or s == "knockdown" or s == "bound"
end

function Fighter.isBlocking(self: Fighter): boolean
	return self.state == "block" or self.state == "blockstun"
end

function Fighter.isCrouching(self: Fighter): boolean
	if self.state == "crouch" then
		return true
	end
	if self.state == "block" or self.state == "blockstun" or self.state == "hitstun" then
		return self.crouchingFlag == true
	end
	if self.state == "attack" and self.move then
		return string.sub(self.move.anim, 1, 6) == "Crouch"
	end
	return false
end

function Fighter.addMeter(self: Fighter, amount: number)
	self.meter = math.clamp(self.meter + amount * (self.stats.MeterGain or 1), 0, Config.MaxMeter)
end

function Fighter.resetCombo(self: Fighter)
	self.combo = 0
	self.comboDamage = 0
	self.juggle = 0
	table.clear(self.comboMoves)
end

function Fighter.toNeutral(self: Fighter)
	self.move = nil
	self.exActive = false
	self.lightChain = 0
	table.clear(self.usedInChain)
	if self.y > 0 then
		self:setState("air")
	else
		self.y = 0
		self.vy = 0
		self:setState("idle")
	end
end

-- --------------------------------------------------------------------------
-- moves
-- --------------------------------------------------------------------------
function Fighter.moveTotal(self: Fighter): number
	local m = self.move
	return m.startup + m.active + m.recovery
end

function Fighter.isActive(self: Fighter): boolean
	if self.state ~= "attack" or not self.move then
		return false
	end
	local f = self.curFrame
	return f >= self.move.startup and f < self.move.startup + self.move.active
end

function Fighter.isStartup(self: Fighter): boolean
	return self.state == "attack" and self.move ~= nil and self.curFrame < self.move.startup
end

function Fighter.hitIndex(self: Fighter): number
	local m = self.move
	if not m.multi then
		return 0
	end
	local count = m.multi.count + (if self.exActive and m.ex and m.ex.extraHits then m.ex.extraHits else 0)
	return math.min(count - 1, (self.curFrame - m.startup) // m.multi.interval)
end

local function buttonMove(self: Fighter): (string?, number?)
	local air = self:isAirborne()
	local down = self:holding(Input.DOWN)
	if self:pressed(Input.SUPER) then
		if not air and self.moves.Super and self.meter >= self.moves.Super.meterCost then
			return "Super", Input.SUPER
		end
	end
	if self:pressed(Input.SPECIAL) then
		if air then
			if self.moves.AirSpecial then
				return "AirSpecial", Input.SPECIAL
			end
		else
			local downRecent = down or (self.frame - self.lastDownAt) <= Config.SpecialDownWindow
			if downRecent and self.moves.Special2 then
				return "Special2", Input.SPECIAL
			end
			return "Special", Input.SPECIAL
		end
	end
	local prefix = if air then "Air" elseif down then "Crouch" else "Stand"
	if self:pressed(Input.HEAVY) then
		return prefix .. "Heavy", Input.HEAVY
	end
	if self:pressed(Input.MEDIUM) then
		return prefix .. "Medium", Input.MEDIUM
	end
	if self:pressed(Input.LIGHT) then
		return prefix .. "Light", Input.LIGHT
	end
	return nil, nil
end

-- Can the current move be cancelled into `nextMove`?
function Fighter.canCancel(self: Fighter, nextMove: any): boolean
	local m = self.move
	if not m or not self.connected then
		return false
	end
	if m.class == "SU" then
		return false
	end
	local f = self.curFrame
	if f < m.startup or f >= m.startup + m.active + m.cancelWindow then
		return false
	end
	if nextMove.air ~= m.air then
		return false
	end
	if self.usedInChain[nextMove.id] and not (nextMove.rank == 1 and m.rank == 1) then
		return false
	end
	if nextMove.rank > m.rank then
		return true
	end
	-- light -> light rapid chain (max two lights)
	if nextMove.rank == 1 and m.rank == 1 and self.lightChain < 2 then
		return true
	end
	return false
end

function Fighter.startMove(self: Fighter, id: string, match: any, isCancel: boolean?)
	local m = self.moves[id]
	self.move = m
	self.moveFrame = 0
	self.curFrame = 0
	self.chargeTime = 0
	table.clear(self.hitRegistry)
	self.connected = false
	self.usedInChain[id] = true
	if m.rank == 1 then
		self.lightChain += 1
	else
		self.lightChain = 0
	end
	self.exActive = false
	self.armorLeft = if m.armor then m.armor.hits else 0
	if m.ex and self.meter >= m.ex.cost then
		self.exActive = true
		self.meter -= m.ex.cost
		if m.ex.armor then
			self.armorLeft = 99
		end
	end
	if m.meterCost > 0 then
		self.meter -= m.meterCost
	end
	if not m.air then
		self.vx = 0
	end
	self:setState("attack")
	self.lastMoveName = m.name
	if m.class == "SU" then
		match:superFreeze(self)
	elseif m.class == "SP" or m.class == "H" then
		self:addMeter(Config.MeterOnWhiff)
	end
	match:emit({ type = "move", slot = self.slot, move = id, class = m.class, ex = self.exActive, cancel = isCancel == true })
	-- the frame a move starts on is its first frame
	self:stepMove(match, match.fighters[3 - self.slot])
end

function Fighter.tryAttack(self: Fighter, match: any, isCancel: boolean): boolean
	local id, button = buttonMove(self)
	if not id then
		return false
	end
	local m = self.moves[id]
	if not m or m.hidden then
		if button then
			self:consume(button)
		end
		return false
	end
	if isCancel and not self:canCancel(m) then
		return false
	end
	self:consume(button :: number)
	self:startMove(id, match, isCancel)
	return true
end

-- --------------------------------------------------------------------------
-- per-frame update
-- --------------------------------------------------------------------------
function Fighter.faceToward(self: Fighter, other: Fighter)
	if GROUND_FACE[self.state] and math.abs(other.x - self.x) > 1 then
		local f = if other.x > self.x then 1 else -1
		if f ~= self.facing then
			self.facing = f
		end
	end
end

function Fighter.step(self: Fighter, match: any, other: Fighter)
	if self.hitstop > 0 then
		self.hitstop -= 1
		return
	end
	self.clock += 1
	self.stateFrame += 1
	if self.invuln > 0 then
		self.invuln -= 1
	end
	local st = self.state
	local S = self.stats

	if st == "intro" or st == "victory" or st == "wait" then
		self.vx = 0
	elseif st == "dead" then
		self.vx = 0
	elseif ACTIONABLE[st] then
		self:neutral(match)
	elseif st == "jumpsquat" then
		if self:tryAttack(match, false) and self.move and not self.move.air then
			-- jump-cancel into a grounded special/super is allowed (reversal)
		elseif self.stateFrame >= Config.JumpSquat then
			self:setState("air")
			self.vy = S.JumpVel
			self.vx = self.jumpDir * S.JumpX * self.facing
			self.airJumps = 0
			match:emit({ type = "jump", slot = self.slot, x = self.x })
		end
	elseif st == "air" then
		if not self:tryAttack(match, false) then
			if S.DoubleJump and self.airJumps < 1 and self:pressed(Input.UP) and self.vy < 3 then
				self:consume(Input.UP)
				self.airJumps += 1
				self.vy = S.JumpVel * 0.85
				local h = Input.horizontal(self.held, self.facing)
				self.vx = h * S.JumpX * self.facing
				match:emit({ type = "jump", slot = self.slot, x = self.x, double = true })
			end
		end
	elseif st == "land" then
		if self.stateFrame >= Config.LandingRecovery then
			self:toNeutral()
			self:neutral(match)
		end
	elseif st == "dash" then
		local t = self.stateFrame / S.DashFrames
		self.vx = self.facing * S.DashSpeed * (1 - t * t)
		if self.stateFrame >= 5 and self:tryAttack(match, false) then
			-- dash-cancelled attack keeps some momentum
			self.pvx = self.facing * S.DashSpeed * 0.35
		elseif self.stateFrame >= S.DashFrames then
			self.vx = 0
			self:toNeutral()
		end
	elseif st == "backdash" then
		local t = self.stateFrame / S.BackdashFrames
		self.vx = -self.facing * S.BackdashSpeed * (1 - t)
		if self.stateFrame >= S.BackdashFrames then
			self.vx = 0
			self:toNeutral()
		end
	elseif st == "attack" then
		self:stepMove(match, other)
	elseif st == "blockstun" then
		self.stun -= 1
		if self.stun <= 0 then
			self:setState(if self:holding(Input.BLOCK) then "block" else "idle")
			self:neutral(match)
		end
	elseif st == "hitstun" or st == "bound" then
		self.stun -= 1
		if self.stun <= 0 then
			self.bound = false
			self:toNeutral()
		end
	elseif st == "launched" then
		-- physics only; landing handled below
	elseif st == "knockdown" then
		self.vx = 0
		if self.ko then
			if self.stateFrame >= 30 then
				self:setState("dead")
			end
		elseif self.stateFrame >= Config.KnockdownFrames then
			self:setState("getup")
			self.invuln = Config.GetUpFrames + 2
		end
	elseif st == "getup" then
		if self.stateFrame >= Config.GetUpFrames then
			self:toNeutral()
		end
	end

	self:physics(match)
end

function Fighter.neutral(self: Fighter, match: any)
	local S = self.stats
	if self:tryAttack(match, false) then
		return
	end
	if self:pressed(Input.UP) or self:holding(Input.UP) then
		self:consume(Input.UP)
		self.jumpDir = Input.horizontal(self.held, self.facing)
		self:setState("jumpsquat")
		self.vx = 0
		return
	end
	if self:pressed(Input.DASH) then
		self:consume(Input.DASH)
		if (self.dashDir or 1) < 0 then
			self:setState("backdash")
			self.invuln = Config.BackdashInvuln
		else
			self:setState("dash")
		end
		match:emit({ type = "dash", slot = self.slot, x = self.x, back = (self.dashDir or 1) < 0 })
		return
	end
	local down = self:holding(Input.DOWN)
	if self:holding(Input.BLOCK) then
		self.crouchingFlag = down
		if self.state ~= "block" then
			self:setState("block")
		end
		self.vx = 0
		return
	end
	if down then
		if self.state ~= "crouch" then
			self:setState("crouch")
		end
		self.vx = 0
		return
	end
	local h = Input.horizontal(self.held, self.facing)
	if h == 1 then
		if self.state ~= "walk" then
			self:setState("walk")
		end
		self.vx = self.facing * S.Walk
	elseif h == -1 then
		if self.state ~= "walkback" then
			self:setState("walkback")
		end
		self.vx = -self.facing * S.Back
	else
		if self.state ~= "idle" then
			self:setState("idle")
		end
		self.vx = 0
	end
end

function Fighter.stepMove(self: Fighter, match: any, other: Fighter)
	local m = self.move
	local f = self.moveFrame
	self.curFrame = f

	-- cancels (only after the move connected, inside its window)
	if self.connected and f > 0 and self:tryAttack(match, true) then
		return
	end

	-- charge: hold the button to stay on the charge frame
	if m.charge and f == m.charge.at and self:holding(Input.SPECIAL) and self.chargeTime < m.charge.max then
		self.chargeTime += 1
		if self.chargeTime == 1 then
			match:emit({ type = "charge", slot = self.slot })
		end
		return
	end

	-- scripted movement
	if m.motion then
		local moving = false
		for _, mo in m.motion do
			if f >= mo.from and f <= mo.to then
				moving = true
				if mo.vx then
					self.vx = self.facing * mo.vx
				end
				if mo.vy then
					self.vy = mo.vy
				end
			end
		end
		if not moving and not m.air then
			self.vx = 0
		end
	end

	if m.projectile and f == m.projectile.at then
		match:spawnProjectile(self, m, other)
	end

	if m.teleport and f == m.teleport.at then
		local nx = self.x + self.facing * m.teleport.dist
		self.x = math.clamp(nx, Config.WallMargin, Config.StageWidth - Config.WallMargin)
		match:emit({ type = "teleport", slot = self.slot, x = self.x })
	end

	self.moveFrame = f + 1
	if self.moveFrame >= self:moveTotal() then
		if m.air and self.y > 0 then
			self.move = nil
			self:setState("air")
		else
			self:toNeutral()
		end
	end
end

function Fighter.physics(self: Fighter, match: any)
	local st = self.state
	local airborne = self.y > 0 or st == "air" or st == "launched" or (st == "attack" and self.move and self.move.air)
	if airborne then
		local g = Config.Gravity * (self.stats.Gravity or 1)
		if st == "launched" then
			g = Config.Gravity
		end
		self.vy = math.max(self.vy - g, -Config.MaxFall)
		self.x += self.vx
		self.y += self.vy
		if self.y <= 0 then
			self.y = 0
			self.vy = 0
			self:landed(match)
		end
	else
		self.x += self.vx + self.pvx
		self.pvx *= Config.GroundFriction
		if math.abs(self.pvx) < 0.05 then
			self.pvx = 0
		end
	end
end

function Fighter.landed(self: Fighter, match: any)
	local st = self.state
	if st == "launched" then
		self.vx = 0
		self:setState("knockdown")
		self.invuln = Config.KnockdownFrames + 4
		match:emit({ type = "land", slot = self.slot, x = self.x, heavy = true })
	elseif st == "attack" and self.move and self.move.air then
		self.move = nil
		self.vx = 0
		self:setState("land")
		match:emit({ type = "land", slot = self.slot, x = self.x })
	elseif st == "air" then
		self.vx = 0
		self:setState("land")
		match:emit({ type = "land", slot = self.slot, x = self.x })
	end
end

-- --------------------------------------------------------------------------
-- animation + boxes
-- --------------------------------------------------------------------------
local STATE_ANIM = {
	idle = "Idle",
	walk = "Walk",
	walkback = "WalkBack",
	crouch = "Crouch",
	jumpsquat = "JumpSquat",
	land = "Land",
	dash = "DashForward",
	backdash = "DashBack",
	launched = "Launched",
	knockdown = "Knockdown",
	getup = "GetUp",
	intro = "Intro",
	victory = "Victory",
	wait = "Idle",
	dead = "Defeat",
}

-- Returns the animation name and row index currently shown.
function Fighter.animRow(self: Fighter): (string, number)
	local st = self.state
	local fd = self.fd
	if st == "attack" and self.move then
		local m = self.move
		local anim = fd[m.anim]
		local f = self.curFrame
		return m.anim, Timeline.moveRow(anim, m.startup, m.active, m.recovery, f, m.activeLoop)
	end
	local name: string
	local t = self.stateFrame
	if st == "air" then
		name = if self.vy > 2.2 then "JumpRise" elseif self.vy > -1.8 then "JumpApex" else "JumpFall"
		t = 999
	elseif st == "block" or st == "blockstun" then
		name = if self.crouchingFlag then "CrouchBlock" else "Block"
	elseif st == "hitstun" or st == "bound" then
		name = self.hitAnim
	elseif st == "dead" then
		name = "Defeat"
		t = 999
	else
		name = STATE_ANIM[st] or "Idle"
	end
	if st == "walk" or st == "walkback" then
		local a = fd[name]
		local ref = a.speedRef or 1
		t = t * math.clamp(math.abs(self.vx) / ref, 0.4, 2.5)
	end
	local anim = fd[name] or fd.Idle
	if st == "air" then
		return name, #anim.frames
	end
	return name, Timeline.stateRow(anim, t)
end

function Fighter.row(self: Fighter): any
	local name, i = self:animRow()
	local anim = self.fd[name] or self.fd.Idle
	return anim.frames[i] or anim.frames[1], name, i
end

local function toWorld(self: Fighter, b: { number }, out: { { number } })
	-- box {x, y, w, h} in fighter space -> world AABB {x0, y0, x1, y1}
	local x0, x1
	if self.facing == 1 then
		x0, x1 = self.x + b[1], self.x + b[1] + b[3]
	else
		x0, x1 = self.x - b[1] - b[3], self.x - b[1]
	end
	table.insert(out, { x0, self.y + b[2], x1, self.y + b[2] + b[4] })
end

function Fighter.isInvulnerable(self: Fighter): boolean
	if self.ko or self.invuln > 0 then
		return true
	end
	local st = self.state
	if st == "knockdown" or st == "getup" or st == "dead" or st == "intro" or st == "victory" then
		return true
	end
	if st == "launched" and self.juggle >= Config.MaxJuggle then
		return true
	end
	local m = self.move
	if st == "attack" and m and m.invuln and self.curFrame >= m.invuln.from and self.curFrame <= m.invuln.to then
		return true
	end
	return false
end

function Fighter.hurtboxes(self: Fighter): { { number } }
	local out = {}
	if self:isInvulnerable() then
		return out
	end
	local row = self:row()
	for _, b in row.hurt or {} do
		toWorld(self, b, out)
	end
	return out
end

function Fighter.hitboxes(self: Fighter): { { number } }
	local out = {}
	if not self:isActive() then
		return out
	end
	local m = self.move
	if m.hitbox then
		for _, b in m.hitbox do
			toWorld(self, b, out)
		end
		return out
	end
	local row = self:row()
	for _, b in row.hit or {} do
		toWorld(self, b, out)
	end
	return out
end

function Fighter.pushHalf(self: Fighter): number
	local w = self.stats.PushWidth or 22
	if self:isAirborne() then
		return w * 0.35
	end
	return w * 0.5
end

return Fighter
