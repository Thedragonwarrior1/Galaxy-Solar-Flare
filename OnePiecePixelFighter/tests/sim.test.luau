--!nonstrict
-- Combat simulation tests (run with: lune run tests/run.luau)
local H = require("./harness")
local T = require("./t")
local CD = H.require("ReplicatedStorage.Shared.CharacterData")
local Match = H.require("ReplicatedStorage.Shared.Sim.Match")
local Input = H.require("ReplicatedStorage.Shared.Sim.Input")
local Timeline = H.require("ReplicatedStorage.Shared.Sim.Timeline")
local Config = H.require("ReplicatedStorage.Shared.CombatConfig")

local REQUIRED_ANIMS = {
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
}
local NORMALS = { "StandLight", "StandMedium", "StandHeavy", "CrouchLight", "CrouchMedium", "CrouchHeavy" }

local function training(a, b)
	local m = Match.new({ p1 = CD.get(a), p2 = CD.get(b or "LuffyGear2"), mode = "training" })
	m.training.infiniteHealth = false
	return m
end

-- place both fighters facing each other at a distance
local function place(m, dist)
	local f1, f2 = m.fighters[1], m.fighters[2]
	f1.x, f2.x = 300, 300 + dist
	f1.facing, f2.facing = 1, -1
	for _, f in m.fighters do
		f:setState("idle")
		f.y, f.vx, f.vy, f.pvx = 0, 0, 0, 0
	end
end

local function idleFrames(m, n, in2)
	for _ = 1, n do
		m:step(0, in2 or 0)
	end
end

-- press `bits` on the next frame (held for one frame), returns the frame it was pressed
local function press(m, bits, hold2)
	m:step(bits, hold2 or 0)
	return m.frame
end

local function moveFor(id, name)
	return CD.get(id).moves[name]
end

local function buttonFor(name)
	local b = 0
	if string.find(name, "Light") then
		b = Input.LIGHT
	end
	if string.find(name, "Medium") then
		b = Input.MEDIUM
	end
	if string.find(name, "Heavy") then
		b = Input.HEAVY
	end
	if string.find(name, "Crouch") then
		b += Input.DOWN
	end
	return b
end

T.test("all seven fighters load with full animation sets", function()
	T.eq(#CD.Order, 7)
	for _, id in CD.Order do
		local c = CD.get(id)
		for _, a in REQUIRED_ANIMS do
			T.ok(c.frameData[a] and #c.frameData[a].frames > 0, id .. " missing animation " .. a)
		end
		for mid, m in c.moves do
			local anim = c.frameData[m.anim]
			T.ok(anim, id .. "." .. mid .. " animation")
			local phases = {}
			for _, r in anim.frames do
				if r.p then
					phases[r.p] = true
				end
			end
			T.ok(phases.s and phases.a and phases.r, id .. "." .. mid .. " needs startup/active/recovery rows")
			local strikes = m.damage > 0 and not m.projectile and not m.counter
			if strikes then
				local hasHit = m.hitbox ~= nil
				for _, r in anim.frames do
					if r.p == "a" and r.hit and #r.hit > 0 then
						hasHit = true
					end
					if r.p ~= "a" then
						T.ok(r.hit == nil, id .. "." .. mid .. " has a hitbox outside its active rows")
					end
				end
				T.ok(hasHit, id .. "." .. mid .. " deals damage but has no hitbox")
			end
		end
	end
end)

T.test("every character's sprite assets are their own", function()
	local seen = {}
	for _, id in CD.Order do
		local fd = CD.get(id).frameData
		seen[id] = fd
	end
	for _, a in CD.Order do
		for _, b in CD.Order do
			if a ~= b then
				T.ok(seen[a] ~= seen[b], a .. " and " .. b .. " share frame data")
			end
		end
	end
end)

T.test("timeline shows the strike pose exactly during active frames", function()
	for _, id in CD.Order do
		local c = CD.get(id)
		for mid, m in c.moves do
			local anim = c.frameData[m.anim]
			local total = m.startup + m.active + m.recovery
			for f = 0, total - 1 do
				local row = anim.frames[Timeline.moveRow(anim, m.startup, m.active, m.recovery, f, m.activeLoop)]
				local inActive = f >= m.startup and f < m.startup + m.active
				if inActive then
					T.eq(row.p, "a", id .. "." .. mid .. " frame " .. f .. " should show an active row")
				else
					T.ok(row.p ~= "a", id .. "." .. mid .. " frame " .. f .. " shows an active row outside the active window")
				end
			end
		end
	end
end)

T.test("normals hit on their first active frame and never outside the window", function()
	for _, id in CD.Order do
		for _, name in NORMALS do
			local m = training(id, "Katakuri")
			local mv = moveFor(id, name)
			-- find a distance where the move connects
			local hitAt, hitDist = nil, nil
			for dist = 26, 200, 6 do
				m = training(id, "Katakuri")
				place(m, dist)
				local start = press(m, buttonFor(name))
				local hp0 = m.fighters[2].hp
				local f1 = m.fighters[1]
				for _ = 1, mv.startup + mv.active + mv.recovery + 30 do
					if m.fighters[2].hp < hp0 then
						break
					end
					m:step(0, 0)
				end
				if m.fighters[2].hp < hp0 then
					hitDist = dist
					break
				end
			end
			T.ok(hitDist, id .. "." .. name .. " never connects at any range")
			if hitDist then
				-- measure the exact frame
				m = training(id, "Katakuri")
				place(m, hitDist)
				local f1 = m.fighters[1]
				m:step(buttonFor(name), 0)
				local seenFrame = nil
				local hp0 = m.fighters[2].hp
				if hp0 > m.fighters[2].hp then
					seenFrame = f1.curFrame
				end
				for _ = 1, 60 do
					if seenFrame then
						break
					end
					local before = m.fighters[2].hp
					m:step(0, 0)
					if m.fighters[2].hp < before then
						seenFrame = f1.curFrame
					end
				end
				T.ok(
					seenFrame and seenFrame >= mv.startup and seenFrame < mv.startup + mv.active,
					string.format(
						"%s.%s hit on move frame %s (active %d-%d)",
						id,
						name,
						tostring(seenFrame),
						mv.startup,
						mv.startup + mv.active - 1
					)
				)
			end
		end
	end
end)

T.test("a single-hit move damages only once (no double hits)", function()
	for _, id in CD.Order do
		local m = training(id, "Katakuri")
		place(m, 40)
		local hits = 0
		m:step(Input.LIGHT, 0)
		for _ = 1, 40 do
			m:step(0, 0)
			for _, e in m.events do
				if e.type == "hit" and e.slot == 2 then
					hits += 1
				end
			end
		end
		T.ok(hits <= 1, id .. " light hit " .. hits .. " times")
	end
end)

T.test("multi-hit moves hit at most their hit count", function()
	local m = training("LuffyGear2", "Katakuri")
	place(m, 45)
	m:step(Input.SPECIAL, 0)
	local hits = 0
	for _ = 1, 80 do
		m:step(0, 0)
		for _, e in m.events do
			if e.type == "hit" then
				hits += 1
			end
		end
	end
	T.ok(hits >= 3 and hits <= 6, "Gatling hits " .. hits)
end)

T.test("blocking: mids blocked standing, lows must be crouch-blocked, overheads standing", function()
	-- mid vs stand block
	local m = training("Zoro", "LuffyGear2")
	place(m, 40)
	idleFrames(m, 2, Input.BLOCK)
	m:step(Input.LIGHT, Input.BLOCK)
	local blocked, hit = 0, 0
	for _ = 1, 30 do
		m:step(0, Input.BLOCK)
		for _, e in m.events do
			if e.type == "block" then
				blocked += 1
			elseif e.type == "hit" then
				hit += 1
			end
		end
	end
	T.eq(hit, 0, "mid should be blocked")
	T.eq(blocked, 1)
	T.eq(m.fighters[2].hp, m.fighters[2].maxHp, "normals do no chip")
	-- low vs stand block: hits
	m = training("Zoro", "LuffyGear2")
	place(m, 40)
	idleFrames(m, 2, Input.BLOCK)
	m:step(Input.MEDIUM + Input.DOWN, Input.BLOCK)
	hit = 0
	for _ = 1, 30 do
		m:step(Input.DOWN, Input.BLOCK)
		for _, e in m.events do
			if e.type == "hit" then
				hit += 1
			end
		end
	end
	T.eq(hit, 1, "low must beat a standing block")
	-- low vs crouch block: blocked
	m = training("Zoro", "LuffyGear2")
	place(m, 40)
	idleFrames(m, 2, Input.BLOCK + Input.DOWN)
	m:step(Input.MEDIUM + Input.DOWN, Input.BLOCK + Input.DOWN)
	hit, blocked = 0, 0
	for _ = 1, 30 do
		m:step(Input.DOWN, Input.BLOCK + Input.DOWN)
		for _, e in m.events do
			if e.type == "hit" then
				hit += 1
			elseif e.type == "block" then
				blocked += 1
			end
		end
	end
	T.eq(hit, 0, "crouch block stops lows")
	T.eq(blocked, 1)
	-- overhead vs crouch block: hits (Gear 4 Kong Hammer is an overhead)
	m = training("LuffyGear4", "LuffyGear2")
	place(m, 46)
	idleFrames(m, 2, Input.BLOCK + Input.DOWN)
	m:step(Input.HEAVY, Input.BLOCK + Input.DOWN)
	hit = 0
	for _ = 1, 50 do
		m:step(0, Input.BLOCK + Input.DOWN)
		for _, e in m.events do
			if e.type == "hit" then
				hit += 1
			end
		end
	end
	T.eq(hit, 1, "overhead must beat a crouching block")
end)

T.test("chain combo LIGHT -> MEDIUM -> HEAVY -> SPECIAL connects for every fighter", function()
	for _, id in CD.Order do
		local m = training(id, "Katakuri")
		place(m, 40)
		local f1 = m.fighters[1]
		local seq = { Input.LIGHT, Input.MEDIUM, Input.HEAVY }
		local k = 1
		local best = 0
		m:step(seq[1], 0)
		k = 2
		for _ = 1, 160 do
			local bits = 0
			if k <= #seq and f1.connected and f1.move and f1.hitstop == 0 then
				bits = seq[k]
				k += 1
			end
			m:step(bits, 0)
			best = math.max(best, m.fighters[2].combo)
		end
		T.ok(best >= 3, id .. " L>M>H combo reached " .. best)
	end
end)

T.test("the same normal cannot be chained endlessly", function()
	local m = training("Zoro", "Katakuri")
	place(m, 42)
	local best = 0
	for i = 1, 120 do
		m:step(if i % 3 == 1 then Input.MEDIUM else 0, 0)
		best = math.max(best, m.fighters[2].combo)
	end
	T.ok(best <= 2, "medium chained into itself (" .. best .. " hits)")
end)

T.test("no new attack can start during recovery without a cancel", function()
	local m = training("LuffyGear4", "Katakuri")
	place(m, 220) -- whiff
	m:step(Input.HEAVY, 0)
	local f1 = m.fighters[1]
	local mv = f1.move
	T.ok(mv and mv.id == "StandHeavy")
	for _ = 1, mv.startup + mv.active + 2 do
		m:step(0, 0)
	end
	m:step(Input.LIGHT, 0)
	T.eq(f1.move and f1.move.id, "StandHeavy", "light started during whiffed heavy's recovery")
end)

T.test("damage scales down in long combos", function()
	local m = training("LuffyGear2", "Katakuri")
	place(m, 45)
	m:step(Input.SPECIAL, 0)
	local dmgs = {}
	for _ = 1, 80 do
		m:step(0, 0)
		for _, e in m.events do
			if e.type == "hit" then
				table.insert(dmgs, e.damage)
			end
		end
	end
	T.ok(#dmgs >= 4)
	T.ok(dmgs[#dmgs] < dmgs[1], "later hits should be scaled")
end)

T.test("juggle limit makes the defender invulnerable", function()
	local m = training("LuffyGear2", "Katakuri")
	local d = m.fighters[2]
	d:setState("launched")
	d.y = 40
	d.juggle = Config.MaxJuggle
	T.eq(#d:hurtboxes(), 0)
end)

T.test("best of three: two round wins take the match", function()
	local m = Match.new({ p1 = CD.get("Zoro"), p2 = CD.get("Enel") })
	T.eq(m.round, 1)
	for round = 1, 2 do
		while m.phase ~= "fight" do
			m:step(0, 0)
		end
		m.fighters[2].hp = 1
		place(m, 40)
		local guard = 0
		while m.phase == "fight" and guard < 200 do
			m:step(if guard % 6 == 0 then Input.LIGHT else 0, 0)
			guard += 1
		end
		T.eq(m.phase, "ko", "round " .. round .. " should end by KO")
		while m.phase == "ko" or m.phase == "roundEnd" do
			m:step(0, 0)
			if m.phase == "matchEnd" then
				break
			end
		end
	end
	T.eq(m.wins[1], 2)
	T.eq(m.result, 1)
	T.eq(m.phase, "matchEnd")
end)

T.test("time over gives the round to the healthier fighter", function()
	local m = Match.new({ p1 = CD.get("Zoro"), p2 = CD.get("Enel"), roundTime = 2 })
	while m.phase ~= "fight" do
		m:step(0, 0)
	end
	m.fighters[1].hp -= 100
	local guard = 0
	while m.phase == "fight" and guard < 400 do
		m:step(0, 0)
		guard += 1
	end
	T.eq(m.phase, "ko")
	while m.phase == "ko" do
		m:step(0, 0)
	end
	T.eq(m.roundWinner, 2)
	T.eq(m.wins[2], 1)
end)

T.test("projectiles: Enel's Vari bolt hits at long range", function()
	local m = training("Enel", "Zoro")
	place(m, 240)
	m:step(Input.SPECIAL, 0)
	local hit = false
	for _ = 1, 100 do
		m:step(0, 0)
		for _, e in m.events do
			if e.type == "hit" and e.projectile then
				hit = true
			end
		end
	end
	T.ok(hit, "Vari never hit")
end)

T.test("projectile clash cancels both", function()
	local m = training("Enel", "Zoro")
	place(m, 300)
	m:step(Input.SPECIAL, Input.SPECIAL)
	local clash = false
	for _ = 1, 100 do
		m:step(0, 0)
		for _, e in m.events do
			if e.type == "clash" then
				clash = true
			end
		end
	end
	T.ok(clash)
end)

T.test("Katakuri's Future Sight counters a strike", function()
	local m = training("Zoro", "Katakuri")
	place(m, 46)
	m:step(0, Input.SPECIAL)
	m:step(0, 0)
	local kHp = m.fighters[2].hp
	m:step(Input.LIGHT, 0)
	local countered, zoroHit = false, false
	for _ = 1, 60 do
		m:step(0, 0)
		for _, e in m.events do
			if e.type == "counter" then
				countered = true
			end
			if e.type == "hit" and e.slot == 1 then
				zoroHit = true
			end
		end
	end
	T.ok(countered, "no counter")
	T.ok(zoroHit, "counter strike should hit Zoro")
	T.eq(m.fighters[2].hp, kHp, "Katakuri takes no damage when countering")
end)

T.test("Doflamingo's Parasite binds the opponent", function()
	local m = training("Doflamingo", "Zoro")
	place(m, 140)
	m:step(Input.SPECIAL, 0)
	local bound = false
	for _ = 1, 80 do
		m:step(0, 0)
		if m.fighters[2].state == "bound" then
			bound = true
		end
	end
	T.ok(bound)
end)

T.test("Enel's Mantra Step teleports forward", function()
	local m = training("Enel", "Zoro")
	place(m, 250)
	local x0 = m.fighters[1].x
	m:step(Input.SPECIAL + Input.DOWN, 0)
	for _ = 1, 30 do
		m:step(0, 0)
	end
	T.ok(m.fighters[1].x - x0 >= 100, "moved " .. (m.fighters[1].x - x0))
end)

T.test("Gear 4's charged Kong Gun deals more damage when held", function()
	local function run(holdFrames)
		local m = training("LuffyGear4", "Katakuri")
		place(m, 70)
		m:step(Input.SPECIAL, 0)
		local dmg = 0
		for i = 1, 120 do
			m:step(if i <= holdFrames then Input.SPECIAL else 0, 0)
			for _, e in m.events do
				if e.type == "hit" then
					dmg += e.damage
				end
			end
		end
		return dmg
	end
	local tap, held = run(0), run(40)
	T.ok(tap > 0, "tap Kong Gun missed")
	T.ok(held > tap, "charged " .. held .. " vs tap " .. tap)
end)

T.test("Gear 5's EX Toon Bounce spends meter for extra damage", function()
	local function run(meter)
		local m = training("LuffyGear5", "Katakuri")
		place(m, 60)
		m.fighters[1].meter = meter
		m:step(Input.SPECIAL, 0)
		local dmg = 0
		for _ = 1, 80 do
			m:step(0, 0)
			for _, e in m.events do
				if e.type == "hit" then
					dmg += e.damage
				end
			end
		end
		return dmg, m.fighters[1].meter
	end
	local d0 = run(0)
	local d1, left = run(50)
	T.ok(d1 > d0, "EX " .. d1 .. " vs normal " .. d0)
	T.ok(left < 50)
end)

T.test("super needs a full meter, spends it and freezes the screen", function()
	local m = training("Zoro", "Katakuri")
	place(m, 50)
	m.fighters[1].meter = 50
	m:step(Input.SUPER, 0)
	T.ok(m.fighters[1].state ~= "attack" or m.fighters[1].move.id ~= "Super", "super without meter")
	m = training("Zoro", "Katakuri")
	place(m, 50)
	m.fighters[1].meter = 100
	m:step(Input.SUPER, 0)
	T.eq(m.fighters[1].move and m.fighters[1].move.id, "Super")
	T.eq(m.fighters[1].meter, 0)
	T.ok(m.freeze > 0, "super freeze")
	local dmg = 0
	for _ = 1, 150 do
		m:step(0, 0)
		for _, e in m.events do
			if e.type == "hit" then
				dmg += e.damage
			end
		end
	end
	T.ok(dmg >= 200, "Zoro super damage " .. dmg)
end)

T.test("every super connects at close range", function()
	for _, id in CD.Order do
		local m = training(id, "Katakuri")
		place(m, 60)
		m.fighters[1].meter = 100
		m:step(Input.SUPER, 0)
		local dmg = 0
		for _ = 1, 200 do
			m:step(0, 0)
			for _, e in m.events do
				if e.type == "hit" and e.slot == 2 then
					dmg += e.damage
				end
			end
		end
		T.ok(dmg >= 150, id .. " super dealt " .. dmg)
	end
end)

T.test("every special does something", function()
	for _, id in CD.Order do
		local m = training(id, "Zoro")
		place(m, 70)
		m:step(Input.SPECIAL, 0)
		T.eq(m.fighters[1].move and m.fighters[1].move.id, "Special", id)
	end
end)

T.test("fighters face each other after a cross-up jump", function()
	local m = training("LuffyGear2", "Zoro")
	place(m, 50)
	m:step(Input.UP + Input.RIGHT, 0)
	for _ = 1, 60 do
		m:step(Input.RIGHT, 0)
	end
	for _ = 1, 20 do
		m:step(0, 0)
	end
	local f1, f2 = m.fighters[1], m.fighters[2]
	T.ok(f1.x > f2.x, "jumped over")
	T.eq(f1.facing, -1)
	T.eq(f2.facing, 1)
end)

T.test("double-tap dash and Gear 5 double jump", function()
	local m = training("LuffyGear2", "Zoro")
	place(m, 200)
	m:step(Input.RIGHT, 0)
	m:step(0, 0)
	m:step(Input.RIGHT, 0)
	T.eq(m.fighters[1].state, "dash")
	m = training("LuffyGear5", "Zoro")
	place(m, 200)
	m:step(Input.UP, 0)
	for _ = 1, 12 do
		m:step(0, 0)
	end
	local y0 = m.fighters[1].y
	for _ = 1, 10 do
		m:step(0, 0)
	end
	m:step(Input.UP, 0)
	T.ok(m.fighters[1].airJumps == 1, "double jump")
end)

T.test("fighters stay inside the stage and on screen", function()
	local m = training("LuffyGear2", "Zoro")
	place(m, 100)
	for _ = 1, 600 do
		m:step(Input.LEFT, Input.RIGHT)
	end
	local f1, f2 = m.fighters[1], m.fighters[2]
	T.ok(f1.x >= Config.WallMargin and f2.x <= Config.StageWidth - Config.WallMargin)
	T.ok(math.abs(f2.x - f1.x) <= Config.MaxSeparation + 0.01)
end)

T.test("sanitized input rejects impossible combinations", function()
	T.eq(Input.sanitize(Input.LEFT + Input.RIGHT + Input.LIGHT), Input.LIGHT)
	T.eq(
		Input.sanitize(99999999),
		bit32.band(99999999, Input.ALL)
			- 3 * 0
			- (if bit32.band(99999999, 3) == 3 then 3 else 0)
			- (if bit32.band(99999999, 12) == 12 then 12 else 0)
	)
	T.eq(Input.sanitize(-5) >= 0, true)
end)

return T
