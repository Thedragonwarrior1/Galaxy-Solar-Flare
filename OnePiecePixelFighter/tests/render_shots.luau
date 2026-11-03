--!nonstrict
-- Renders real frames through the game's Luau renderer (offline) and dumps
-- them as raw RGBA for tools/rgba2png.py. Usage: lune run tests/render_shots.luau
local fs = require("@lune/fs")
local process = require("@lune/process")
local H = require("./harness")
local CD = H.require("ReplicatedStorage.Shared.CharacterData")
local Match = H.require("ReplicatedStorage.Shared.Sim.Match")
local AI = H.require("ReplicatedStorage.Shared.Sim.AI")
local Protocol = H.require("ReplicatedStorage.Shared.Protocol")
local Raster = H.require("StarterPlayer.StarterPlayerScripts.Render.Raster")
local Renderer = H.require("StarterPlayer.StarterPlayerScripts.Render.Renderer")

local pairsList = {
	{ "LuffyGear2", "Zoro", "Harbour" },
	{ "LuffyGear4", "Katakuri", "Storm" },
	{ "Enel", "Doflamingo", "SkyIsland" },
	{ "LuffyGear5", "Enel", "Harbour" },
}
local which = tonumber(process.args[1] or "1") or 1
local p = pairsList[which]
local m = Match.new({ p1 = CD.get(p[1]), p2 = CD.get(p[2]), stage = p[3] })
local a, b = AI.new(1, 0.8, 3 + which), AI.new(2, 0.8, 9 + which)
local surf = Raster.new(320, 180)
local r = Renderer.new(surf, p[3])
r.hitboxes = process.args[2] == "boxes"
local shots = {}
for _, n in { 40, 230, 300, 360, 420, 480, 540, 620, 700, 800, 900, 1000 } do
	shots[n] = true
end
local t0 = os.clock()
local view
local drawn = 0
for i = 1, 1000 do
	if i == 300 then
		m.fighters[1].meter = 100
	end
	m:step(a:think(m), b:think(m))
	view = Protocol.view(m, view)
	r:draw(view)
	drawn += 1
	if shots[i] then
		fs.writeFile(string.format("tests/out/shot_%d_%04d.rgba", which, i), buffer.tostring(surf.buf))
	end
end
print(string.format("rendered %d frames in %.2fs (%.2f ms/frame)", drawn, os.clock() - t0, (os.clock() - t0) / drawn * 1000))
