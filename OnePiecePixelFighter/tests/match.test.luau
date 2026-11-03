--!nonstrict
local H = require("./harness")
local T = require("./t")
local CD = H.require("ReplicatedStorage.Shared.CharacterData")
local Match = H.require("ReplicatedStorage.Shared.Sim.Match")
local AI = H.require("ReplicatedStorage.Shared.Sim.AI")
local Config = H.require("ReplicatedStorage.Shared.CombatConfig")

local function invariants(m)
	for _, f in m.fighters do
		assert(f.hp >= 0 and f.hp <= f.maxHp, "hp out of range")
		assert(f.meter >= 0 and f.meter <= Config.MaxMeter, "meter out of range " .. f.meter)
		assert(f.x == f.x and f.y == f.y, "NaN position")
		assert(f.x >= Config.WallMargin - 0.01 and f.x <= Config.StageWidth - Config.WallMargin + 0.01, "outside stage")
		assert(f.y >= 0, "below the floor")
		assert(f.facing == 1 or f.facing == -1)
		local name, i = f:animRow()
		assert(f.fd[name] and f.fd[name].frames[i], "invalid anim row " .. name .. " " .. i)
	end
end

T.test("CPU vs CPU matches finish for every fighter", function()
	local stats = {}
	for i, id in CD.Order do
		local opp = CD.Order[(i % #CD.Order) + 1]
		local m = Match.new({ p1 = CD.get(id), p2 = CD.get(opp), roundTime = 40 })
		local a, b = AI.new(1, 0.7, i * 13), AI.new(2, 0.7, i * 31 + 5)
		local hits = 0
		local frames = 0
		while m.phase ~= "matchEnd" and frames < 60 * 60 * 6 do
			m:step(a:think(m), b:think(m))
			for _, e in m.events do
				if e.type == "hit" then
					hits += 1
				end
			end
			invariants(m)
			frames += 1
		end
		T.eq(m.phase, "matchEnd", id .. " vs " .. opp .. " never finished")
		T.ok(hits > 10, id .. " vs " .. opp .. " only " .. hits .. " hits")
		table.insert(stats, string.format("%s vs %s: winner P%d in %ds, %d hits", id, opp, m.result, frames // 60, hits))
	end
	for _, s in stats do
		print("       " .. s)
	end
end)

T.test("random input fuzzing keeps the simulation valid", function()
	local seed = 99
	local function rnd()
		seed = (seed * 1103515245 + 12345) % 2147483648
		return seed
	end
	for i, id in CD.Order do
		local m = Match.new({ p1 = CD.get(id), p2 = CD.get(CD.Order[8 - i]), mode = "training" })
		m.training.infiniteMeter = true
		local b1, b2 = 0, 0
		for f = 1, 4000 do
			if f % 3 == 0 then
				b1 = rnd() % 2048
			end
			if f % 4 == 0 then
				b2 = rnd() % 2048
			end
			m:step(b1, b2)
			invariants(m)
		end
	end
end)

T.test("mirror match uses the alternate palette for player 2", function()
	local m = Match.new({ p1 = CD.get("Zoro"), p2 = CD.get("Zoro") })
	T.eq(m.fighters[1].palette, 0)
	T.eq(m.fighters[2].palette, 1)
end)

return T
