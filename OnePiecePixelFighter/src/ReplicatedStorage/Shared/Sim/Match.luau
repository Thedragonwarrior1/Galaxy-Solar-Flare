--!strict
--!optimize 2
-- A 1v1 match: two fighters, projectiles, rounds, timer and match result.
-- Pure simulation; it runs authoritatively on the server for online play and
-- locally on the client for Training / Local Test Match.
--
-- Step order per 60 Hz frame:
--   inputs -> fighter state machines -> facing -> push/walls/camera bounds
--   -> hit detection (both directions resolved together, so trades happen)
--   -> projectiles -> round logic

local Config = require(script.Parent.Parent.CombatConfig)
local Fighter = require(script.Parent.Fighter)
local Hitbox = require(script.Parent.Hitbox)
local Damage = require(script.Parent.Damage)

local Match = {}
Match.__index = Match

export type Options = {
	p1: any, -- CharacterData.Character
	p2: any,
	mode: string?, -- "versus" | "training"
	roundTime: number?,
	roundsToWin: number?,
	stage: string?,
	seed: number?,
}

function Match.new(opts: Options)
	local mirror = opts.p1.id == opts.p2.id
	local self = setmetatable({
		mode = opts.mode or "versus",
		roundTime = opts.roundTime or Config.RoundTime,
		roundsToWin = opts.roundsToWin or Config.RoundsToWin,
		stage = opts.stage or "Harbour",
		chars = { opts.p1, opts.p2 },
		frame = 0,
		phase = "intro",
		phaseFrame = 0,
		round = 0,
		wins = { 0, 0 },
		timer = 0,
		fighters = {} :: { any },
		projectiles = {} :: { any },
		events = {} :: { any },
		freeze = 0,
		freezeOwner = 0,
		result = nil :: number?, -- 1, 2 or 0 (draw) once the match is over
		roundWinner = nil :: number?,
		training = {
			infiniteHealth = true,
			infiniteMeter = false,
			dummy = "stand",
		},
		nextProjectileId = 1,
		koSlow = 0,
	}, Match)
	self.fighters[1] = Fighter.new(1, opts.p1, 0, 1, 0)
	self.fighters[2] = Fighter.new(2, opts.p2, 0, -1, if mirror then 1 else 0)
	self:startRound()
	return self
end

function Match.emit(self: any, ev: any)
	ev.frame = self.frame
	table.insert(self.events, ev)
end

function Match.startRound(self: any)
	self.round += 1
	self.phase = if self.mode == "training" then "fight" else "intro"
	self.phaseFrame = 0
	self.timer = self.roundTime * Config.TickRate
	self.projectiles = {}
	self.roundWinner = nil
	self.freeze = 0
	local mid = Config.StageWidth / 2
	for i, f in self.fighters do
		local dir = if i == 1 then -1 else 1
		f.x = mid + dir * Config.StartDistance / 2
		f.y, f.vx, f.vy, f.pvx = 0, 0, 0, 0
		f.facing = -dir
		f.hp = f.maxHp
		f.ko = false
		f.stun, f.hitstop, f.invuln = 0, 0, 0
		f.move = nil
		f:resetCombo()
		if self.mode == "training" then
			f.meter = Config.MaxMeter
			f:setState("idle")
		else
			f.meter = if self.round == 1 then 0 else f.meter
			f:setState("intro")
		end
	end
	self:emit({ type = "round", round = self.round })
end

function Match.superFreeze(self: any, f: any)
	self.freeze = Config.SuperFreeze
	self.freezeOwner = f.slot
	self:emit({ type = "super", slot = f.slot, move = f.move and f.move.id })
end

function Match.knockout(self: any, def: any, att: any)
	if self.mode == "training" then
		return
	end
	if self.phase ~= "fight" then
		return
	end
	self.phase = "ko"
	self.phaseFrame = 0
	self.koSlow = 0
	self:emit({ type = "ko", slot = def.slot, by = att.slot })
end

function Match.spawnProjectile(self: any, owner: any, m: any, other: any)
	local p = m.projectile
	local x, y
	if p.spawn == "opponent" then
		x = other.x
		y = 0
	else
		x = owner.x + owner.facing * p.x
		y = owner.y + p.y
	end
	local proj = {
		id = self.nextProjectileId,
		owner = owner.slot,
		kind = p.kind,
		move = m,
		x = x,
		y = y,
		vx = owner.facing * p.vx,
		vy = p.vy or 0,
		gravity = p.gravity or 0,
		facing = owner.facing,
		w = p.w,
		h = p.h,
		life = p.life,
		age = 0,
		hitsLeft = p.hits or 1,
		interval = p.interval or 0,
		cooldown = 0,
		hitIndex = 0,
		anchorBottom = p.spawn == "opponent",
	}
	self.nextProjectileId += 1
	table.insert(self.projectiles, proj)
	self:emit({ type = "projectile", slot = owner.slot, kind = p.kind, id = proj.id, x = x, y = y })
end

local function projectileBox(p: any): { number }
	if p.anchorBottom then
		return { p.x - p.w / 2, p.y, p.x + p.w / 2, p.y + p.h }
	end
	return Hitbox.box(p.x, p.y, p.w, p.h)
end
Match.projectileBox = projectileBox

-- --------------------------------------------------------------------------
-- step
-- --------------------------------------------------------------------------
function Match.step(self: any, in1: number, in2: number, press1: number?, press2: number?)
	table.clear(self.events)
	self.frame += 1
	self.phaseFrame += 1
	local f1, f2 = self.fighters[1], self.fighters[2]
	f1:setInput(in1, press1, self.frame)
	f2:setInput(in2, press2, self.frame)

	local phase = self.phase
	if phase == "intro" then
		if self.phaseFrame >= Config.IntroFrames then
			self.phase = "ready"
			self.phaseFrame = 0
			f1:setState("idle")
			f2:setState("idle")
			self:emit({ type = "fight" })
		end
		self:simulate(false)
		return
	elseif phase == "ready" then
		-- "FIGHT!" banner: fighters can already move
		if self.phaseFrame >= Config.ReadyFrames then
			self.phase = "fight"
			self.phaseFrame = 0
		end
		self:simulate(true)
		return
	elseif phase == "fight" then
		self:simulate(true)
		if self.mode ~= "training" and self.phase == "fight" and self.freeze <= 0 then
			self.timer -= 1
			if self.timer <= 0 then
				self.timer = 0
				self.phase = "ko"
				self.phaseFrame = 0
				self:emit({ type = "timeover" })
			end
		end
		if self.mode == "training" then
			self:trainingUpkeep()
		end
		return
	elseif phase == "ko" then
		-- slow motion for the first part of a knockout
		self.koSlow += 1
		if self.phaseFrame < 50 then
			if self.koSlow % 3 == 0 then
				self:simulate(false)
			end
		else
			self:simulate(false)
		end
		if self.phaseFrame >= Config.KOFrames then
			self:endRound()
		end
		return
	elseif phase == "roundEnd" then
		self:simulate(false)
		if self.phaseFrame >= Config.RoundEndFrames then
			if self.result ~= nil then
				self.phase = "matchEnd"
				self.phaseFrame = 0
				self:emit({ type = "matchWin", slot = self.result })
			else
				self:startRound()
			end
		end
		return
	elseif phase == "matchEnd" then
		self:simulate(false)
		return
	end
end

function Match.endRound(self: any)
	local f1, f2 = self.fighters[1], self.fighters[2]
	local winner = 0
	local r1, r2 = f1.hp / f1.maxHp, f2.hp / f2.maxHp
	if r1 > r2 then
		winner = 1
	elseif r2 > r1 then
		winner = 2
	end
	self.roundWinner = winner
	if winner > 0 then
		self.wins[winner] += 1
		local w = self.fighters[winner]
		if w.state ~= "dead" and not w.ko then
			w:setState("victory")
			w.move = nil
			w.vx, w.pvx = 0, 0
		end
	end
	self.phase = "roundEnd"
	self.phaseFrame = 0
	self:emit({ type = "roundWin", slot = winner, perfect = winner > 0 and self.fighters[winner].hp == self.fighters[winner].maxHp })
	if self.wins[1] >= self.roundsToWin or self.wins[2] >= self.roundsToWin then
		self.result = if self.wins[1] > self.wins[2] then 1 elseif self.wins[2] > self.wins[1] then 2 else 0
	elseif self.round >= Config.MaxRounds then
		self.result = if self.wins[1] > self.wins[2] then 1 elseif self.wins[2] > self.wins[1] then 2 else 0
	end
end

function Match.trainingUpkeep(self: any)
	local t = self.training
	for _, f in self.fighters do
		local recovering = f:inHitState() or f.state == "getup" or f.state == "blockstun"
		if not recovering then
			if f.combo > 0 then
				f:resetCombo()
			end
			if t.infiniteHealth and f.hp < f.maxHp then
				f.hp = f.maxHp
			end
		end
		if t.infiniteMeter then
			f.meter = Config.MaxMeter
		end
	end
end

-- The actual frame simulation.
function Match.simulate(self: any, allowControl: boolean)
	local f1, f2 = self.fighters[1], self.fighters[2]
	if self.freeze > 0 then
		self.freeze -= 1
		return
	end
	if not allowControl then
		-- inputs are ignored outside of the fight
		for _, f in self.fighters do
			if f:actionable() then
				f.held = 0
				f.vx = 0
			end
		end
	end
	f1:step(self, f2)
	f2:step(self, f1)

	-- combos end when the victim is back to neutral
	for _, f in self.fighters do
		if f.combo > 0 and not (f:inHitState() or f.state == "getup") and self.mode ~= "training" then
			f:resetCombo()
		end
	end

	f1:faceToward(f2)
	f2:faceToward(f1)
	self:separate()
	self:resolveHits()
	self:stepProjectiles()
end

function Match.separate(self: any)
	local f1, f2 = self.fighters[1], self.fighters[2]
	-- push boxes: fighters cannot overlap on the ground (they can jump over)
	local yOverlap = math.abs(f1.y - f2.y) < 48
	local minDist = f1:pushHalf() + f2:pushHalf()
	local dx = f2.x - f1.x
	if yOverlap and math.abs(dx) < minDist then
		local overlap = minDist - math.abs(dx)
		local dir = if dx > 0 then 1 elseif dx < 0 then -1 else f1.facing
		if f1:isAirborne() ~= f2:isAirborne() then
			-- jumping over: only nudge the airborne one
			local a = if f1:isAirborne() then f1 else f2
			local sign = if a == f1 then -dir else dir
			a.x += sign * overlap * 0.5
		else
			f1.x -= dir * overlap * 0.5
			f2.x += dir * overlap * 0.5
		end
	end
	-- stage walls
	local lo, hi = Config.WallMargin, Config.StageWidth - Config.WallMargin
	for _, f in self.fighters do
		f.x = math.clamp(f.x, lo, hi)
	end
	-- both fighters must stay on screen
	local sep = math.abs(f2.x - f1.x)
	if sep > Config.MaxSeparation then
		local over = sep - Config.MaxSeparation
		local left = if f1.x < f2.x then f1 else f2
		local right = if left == f1 then f2 else f1
		-- whoever is moving away gets stopped
		local lAway = left.vx + left.pvx < 0
		local rAway = right.vx + right.pvx > 0
		if lAway and not rAway then
			left.x += over
		elseif rAway and not lAway then
			right.x -= over
		else
			left.x += over / 2
			right.x -= over / 2
		end
	end
	-- re-check walls after the camera clamp (corner pushes)
	for _, f in self.fighters do
		f.x = math.clamp(f.x, lo, hi)
	end
end

function Match.resolveHits(self: any)
	local f1, f2 = self.fighters[1], self.fighters[2]
	local pending = {}
	for _, pair in { { f1, f2 }, { f2, f1 } } do
		local att, def = pair[1], pair[2]
		if att:isActive() then
			local idx = att:hitIndex()
			if not att.hitRegistry[idx] then
				local hits = att:hitboxes()
				if #hits > 0 then
					local ok, cx, cy = Hitbox.contact(hits, def:hurtboxes())
					if ok then
						att.hitRegistry[idx] = true
						local m = att.move
						local count = if m.multi then m.multi.count else 1
						table.insert(pending, {
							def = def,
							src = {
								move = m,
								attacker = att,
								projectile = false,
								hitIndex = idx,
								x = cx,
								y = cy,
								final = idx >= count - 1,
							},
						})
					end
				end
			end
		end
	end
	-- apply simultaneously so trades are symmetric
	for _, p in pending do
		Damage.apply(self, p.src, p.def)
	end
end

function Match.stepProjectiles(self: any)
	local list = self.projectiles
	-- projectile clashes
	for i = 1, #list do
		local a = list[i]
		for j = i + 1, #list do
			local b = list[j]
			if a.owner ~= b.owner and a.hitsLeft > 0 and b.hitsLeft > 0 and not a.anchorBottom and not b.anchorBottom then
				if Hitbox.overlap(projectileBox(a), projectileBox(b)) then
					a.hitsLeft -= 1
					b.hitsLeft -= 1
					self:emit({ type = "clash", x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 })
				end
			end
		end
	end
	local keep = {}
	for _, p in list do
		p.age += 1
		p.x += p.vx
		p.vy -= p.gravity
		p.y += p.vy
		if p.cooldown > 0 then
			p.cooldown -= 1
		end
		local owner = self.fighters[p.owner]
		local target = self.fighters[3 - p.owner]
		if p.hitsLeft > 0 and p.cooldown <= 0 then
			local ok, cx, cy = Hitbox.contact({ projectileBox(p) }, target:hurtboxes())
			if ok then
				p.hitsLeft -= 1
				p.cooldown = p.interval
				local total = (p.move.projectile.hits or 1)
				Damage.apply(self, {
					move = p.move,
					attacker = owner,
					projectile = true,
					hitIndex = p.hitIndex,
					x = cx,
					y = cy,
					final = p.hitsLeft <= 0 and total > 1,
				}, target)
				p.hitIndex += 1
			end
		end
		local alive = p.age < p.life and p.x > -40 and p.x < Config.StageWidth + 40
		if p.hitsLeft <= 0 and not p.anchorBottom then
			alive = false
		end
		if alive then
			table.insert(keep, p)
		else
			self:emit({ type = "projectileEnd", id = p.id, x = p.x, y = p.y, kind = p.kind })
		end
	end
	self.projectiles = keep
end

-- Timer in whole seconds for the HUD.
function Match.secondsLeft(self: any): number
	return math.ceil(self.timer / Config.TickRate)
end

return Match
