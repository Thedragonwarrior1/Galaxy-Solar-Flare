--!strict
-- Hit resolution: blocking, counters, armor, damage scaling, hitstun, launches,
-- knockback and meter. Called by Match when a live hitbox touches a hurtbox.

local Config = require(script.Parent.Parent.CombatConfig)

local Damage = {}

export type HitSource = {
	move: any, -- move definition (damage, hitstun, ...)
	attacker: any,
	projectile: boolean,
	hitIndex: number,
	x: number,
	y: number,
	final: boolean,
}

function Damage.scaling(combo: number): number
	local over = combo - Config.ScalingStart + 1
	if over <= 0 then
		return 1
	end
	return math.max(Config.MinScaling, 1 - Config.ScalingStep * over)
end

-- Can `def` block an attack of this height right now?
function Damage.canBlock(def: any, height: string): boolean
	local st = def.state
	if st ~= "block" and st ~= "blockstun" then
		-- holding block while walking/crouching also counts (block is instant)
		if not (def:actionable() and def:holding(512)) then
			return false
		end
	end
	if def:isAirborne() then
		return false
	end
	local crouching = def:holding(8)
	if height == "low" and not crouching then
		return false
	end
	if height == "high" and crouching then
		return false
	end
	return true
end

function Damage.compute(src: HitSource, def: any): number
	local m = src.move
	local att = src.attacker
	local dmg = m.damage
	if att.exActive and m.ex then
		dmg *= m.ex.damage
	end
	if m.charge and att.chargeTime > 0 then
		dmg *= 1 + m.charge.bonus * (att.chargeTime / m.charge.max)
	end
	local scale = Damage.scaling(def.combo)
	local repeats = def.comboMoves[m.id] or 0
	if repeats > 0 and not m.multi and not src.projectile then
		scale *= Config.RepeatPenalty ^ repeats
	end
	return math.max(1, math.floor(dmg * scale + 0.5))
end

-- Apply a hit. Returns a result tag for events: "hit" | "block" | "counter" | "armor" | "whiff"
function Damage.apply(match: any, src: HitSource, def: any): string
	local m = src.move
	local att = src.attacker

	-- Katakuri's Future Sight: strikes landing during the counter window are read and answered
	local dm = def.move
	if
		def.state == "attack"
		and dm
		and dm.counter
		and not src.projectile
		and m.class ~= "SU"
		and def.curFrame >= dm.counter.from
		and def.curFrame <= dm.counter.to
	then
		att.hitstop = 16
		def.hitstop = 6
		def:startMove(dm.counter.follow, match, true)
		def.invuln = 10
		def.facing = if att.x > def.x then 1 else -1
		match:emit({ type = "counter", slot = def.slot, x = src.x, y = src.y })
		return "counter"
	end

	local dmg = Damage.compute(src, def)
	local blocked = Damage.canBlock(def, m.height)
	local push = if att.x < def.x then 1 else -1
	if src.projectile then
		push = src.attacker.facing
	end

	if blocked then
		local chip = 0
		if m.class == "SP" or m.class == "SU" then
			chip = math.floor(dmg * m.chip + 0.5)
			-- chip damage cannot finish a round except from a super
			if m.class ~= "SU" then
				chip = math.min(chip, def.hp - 1)
			end
		end
		def.hp = math.max(0, def.hp - chip)
		def.crouchingFlag = def:holding(8)
		def:setState("blockstun")
		def.stun = m.blockstun
		def.vx = 0
		def.pvx = push * m.kbX * 1.15
		def.hitstop = math.floor(m.hitstop * 0.8)
		if not src.projectile then
			att.hitstop = math.floor(m.hitstop * 0.8)
			att.connected = true
			Damage.wallPush(att, def, push, m.kbX)
		end
		att:addMeter(dmg * Config.MeterOnBlock)
		def:addMeter(dmg * Config.MeterOnBlock * 0.5)
		att.lastAdvantage = m.blockstun - (m.recovery + m.active - 1)
		match:emit({ type = "block", slot = def.slot, x = src.x, y = src.y, class = m.class, chip = chip })
		if def.hp <= 0 then
			match:knockout(def, att)
		end
		return "block"
	end

	-- armor absorbs the hit (damage is still taken, no stun)
	if def.state == "attack" and def.armorLeft > 0 and dm and m.class ~= "SU" then
		local inArmor = def.exActive or (dm.armor and def.curFrame >= dm.armor.from and def.curFrame <= dm.armor.to)
		if inArmor then
			def.armorLeft -= 1
			def.hp = math.max(0, def.hp - math.floor(dmg * 0.6))
			def.hitstop = 8
			if not src.projectile then
				att.hitstop = 8
				att.connected = true
			end
			match:emit({ type = "armor", slot = def.slot, x = src.x, y = src.y })
			if def.hp <= 0 then
				match:knockout(def, att)
			end
			return "armor"
		end
	end

	-- counter hit: interrupting the opponent's startup
	local counterHit = def.state == "attack" and def:isStartup()
	if counterHit then
		dmg = math.floor(dmg * Config.CounterHitBonus + 0.5)
	end

	def.hp = math.max(0, def.hp - dmg)
	def.combo += 1
	def.comboDamage += dmg
	def.comboMoves[m.id] = (def.comboMoves[m.id] or 0) + 1
	att:addMeter(dmg * Config.MeterOnHit)
	def:addMeter(dmg * Config.MeterOnTaken)
	if not src.projectile then
		att.connected = true
	end

	local hitstun = m.hitstun
	if def.combo > Config.HitstunDecayStart then
		hitstun -= (def.combo - Config.HitstunDecayStart) * Config.HitstunDecay
	end
	hitstun = math.max(Config.MinHitstun, hitstun) + (if counterHit then Config.CounterHitstun else 0)

	local launchV = m.launch
	if m.multi and m.multi.finalLaunch and src.final then
		launchV = m.multi.finalLaunch
	end
	local wasAirborne = def:isAirborne()
	def.move = nil
	def.exActive = false

	if def.hp <= 0 then
		def.ko = true
		def:setState("launched")
		def.vy = 6
		def.vx = push * 2.6
		def.y = math.max(def.y, 1)
		match:knockout(def, att)
	elseif m.bind and m.bind > 0 then
		def:setState("bound")
		def.bound = true
		def.stun = m.bind
		def.hitAnim = "HitLight"
		def.vx = 0
		def.pvx = 0
	elseif launchV or m.knockdown or wasAirborne then
		def:setState("launched")
		def.juggle += 1
		def.vy = launchV or (if m.knockdown then 3.2 else 4.2)
		def.vx = push * (if launchV then 1.4 else m.kbX * 0.55)
		def.y = math.max(def.y, 1)
	else
		def.crouchingFlag = def:isCrouching()
		local bodyHit = (src.y - def.y) < def.height * 0.72
		def.hitAnim = if def.crouchingFlag then "HitCrouch" elseif m.rank >= 3 then "HitHeavy" elseif bodyHit then "HitGut" else "HitLight"
		def:setState("hitstun")
		def.stun = hitstun
		def.vx = 0
		def.pvx = push * m.kbX
	end

	local stop = m.hitstop + (if counterHit then 3 else 0)
	def.hitstop = stop
	if not src.projectile then
		att.hitstop = stop
		Damage.wallPush(att, def, push, m.kbX)
	end
	att.lastAdvantage = hitstun - (m.recovery + m.active - 1)
	match:emit({
		type = "hit",
		slot = def.slot,
		by = att.slot,
		x = src.x,
		y = src.y,
		class = m.class,
		damage = dmg,
		combo = def.combo,
		counter = counterHit,
		vfx = m.vfx,
		shake = m.shake,
		projectile = src.projectile,
	})
	return "hit"
end

-- If the defender is against a wall, the attacker gets pushed back instead.
function Damage.wallPush(att: any, def: any, push: number, kb: number)
	if att:isAirborne() then
		return
	end
	local nearWall = def.x <= Config.WallMargin + 4 or def.x >= Config.StageWidth - Config.WallMargin - 4
	if nearWall then
		att.pvx = -push * kb * 0.8
	end
end

return Damage
