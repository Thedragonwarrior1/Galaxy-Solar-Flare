local H = require("./harness")
local CD = H.require("ReplicatedStorage.Shared.CharacterData")
local Match = H.require("ReplicatedStorage.Shared.Sim.Match")
for _, id in CD.Order do
	local c = CD.get(id)
	print(id, c.config.DisplayName)
end
local m = Match.new({ p1 = CD.get("LuffyGear2"), p2 = CD.get("Zoro") })
for i = 1, 400 do
	m:step(if i > 220 then 2 else 0, 0)
end
local f1, f2 = m.fighters[1], m.fighters[2]
print(m.phase, f1.state, f1.x, f2.x, f1:animRow())
