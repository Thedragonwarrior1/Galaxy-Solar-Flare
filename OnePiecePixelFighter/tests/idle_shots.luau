--!nonstrict
-- Idle showcase: every fighter idling in training mode; dumps frames for review.
local fs = require("@lune/fs")
local H = require("./harness")
local CD = H.require("ReplicatedStorage.Shared.CharacterData")
local Match = H.require("ReplicatedStorage.Shared.Sim.Match")
local Protocol = H.require("ReplicatedStorage.Shared.Protocol")
local Raster = H.require("StarterPlayer.StarterPlayerScripts.Render.Raster")
local Renderer = H.require("StarterPlayer.StarterPlayerScripts.Render.Renderer")
local pairsList = { { "LuffyGear2", "LuffyGear4" }, { "LuffyGear5", "Doflamingo" }, { "Enel", "Zoro" }, { "Katakuri", "LuffyGear5" } }
for k, p in pairsList do
	local m = Match.new({ p1 = CD.get(p[1]), p2 = CD.get(p[2]), mode = "training" })
	local surf = Raster.new(320, 180)
	local r = Renderer.new(surf, ({ "Harbour", "SkyIsland", "Storm", "Harbour" })[k])
	local view
	for i = 1, 200 do
		m:step(0, 0)
		view = Protocol.view(m, view)
		r:draw(view)
		if i == 120 or i == 150 or i == 185 then
			fs.writeFile(string.format("tests/out/idle_%d_%03d.rgba", k, i), buffer.tostring(surf.buf))
		end
	end
end
print("ok")
