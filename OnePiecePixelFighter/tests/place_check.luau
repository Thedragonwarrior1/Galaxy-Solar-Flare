-- Verifies the built place file: lune run tests/place_check.luau
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local game = roblox.deserializePlace(fs.readFile("build/OnePiecePixelFighter.rbxl"))
local counts, biggest = {}, {}
local function walk(inst, path)
	local c = inst.ClassName
	if c == "Script" or c == "LocalScript" or c == "ModuleScript" then
		counts[c] = (counts[c] or 0) + 1
		table.insert(biggest, { path, #inst.Source })
	end
	for _, ch in inst:GetChildren() do
		walk(ch, path .. "." .. ch.Name)
	end
end
walk(game, "game")
table.sort(biggest, function(a, b)
	return a[2] > b[2]
end)
for k, v in counts do
	print(k, v)
end
for i = 1, 5 do
	print(string.format("%7.1f KB  %s", biggest[i][2] / 1024, biggest[i][1]))
end
local rs = game:GetService("ReplicatedStorage")
assert(rs:FindFirstChild("Shared"):FindFirstChild("Sim"):FindFirstChild("Match"), "Match missing")
for _, id in { "LuffyGear2", "LuffyGear4", "LuffyGear5", "Doflamingo", "Enel", "Zoro", "Katakuri" } do
	local ch = rs.Characters:FindFirstChild(id)
	assert(ch and ch:FindFirstChild("CharacterConfig") and ch:FindFirstChild("FrameData") and ch:FindFirstChild("Sprites"), id)
	local spr = ch.Sprites
	for _, sheet in { "Idle", "Walk", "Jump", "Attacks", "Specials", "Hit", "Victory" } do
		assert(spr:FindFirstChild(sheet) or spr:FindFirstChild(sheet .. "_1"), id .. " sheet " .. sheet)
	end
end
local sps = game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
assert(sps:FindFirstChild("Main").ClassName == "LocalScript")
assert(game:GetService("ServerScriptService"):FindFirstChild("Main").ClassName == "Script")
print("place OK")
