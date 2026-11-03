--!nonstrict
local H = require("./harness")
local T = require("./t")
local CD = H.require("ReplicatedStorage.Shared.CharacterData")
local Match = H.require("ReplicatedStorage.Shared.Sim.Match")
local AI = H.require("ReplicatedStorage.Shared.Sim.AI")
local Protocol = H.require("ReplicatedStorage.Shared.Protocol")
local Codec = H.require("ReplicatedStorage.Shared.Codec")

T.test("snapshot encode/decode round-trips and stays small", function()
	local m = Match.new({ p1 = CD.get("Enel"), p2 = CD.get("Doflamingo"), mode = "training" })
	local a, b = AI.new(1, 0.9, 1), AI.new(2, 0.9, 2)
	m.training.infiniteMeter = true
	local maxSize = 0
	for _ = 1, 1200 do
		m:step(a:think(m), b:think(m))
		local v = Protocol.view(m)
		local buf = Protocol.encode(v)
		maxSize = math.max(maxSize, buffer.len(buf))
		local d = Protocol.decode(buf)
		T.ok(d, "decode failed")
		for i = 1, 2 do
			T.eq(d.fighters[i].char, v.fighters[i].char)
			T.eq(d.fighters[i].anim, v.fighters[i].anim)
			T.eq(d.fighters[i].row, v.fighters[i].row)
			T.eq(d.fighters[i].hp, math.floor(v.fighters[i].hp))
			T.ok(math.abs(d.fighters[i].x - v.fighters[i].x) < 0.01)
		end
		T.eq(#d.projectiles, #v.projectiles)
		T.eq(d.phase, v.phase)
	end
	T.ok(maxSize < 900, "snapshot must fit an unreliable remote (" .. maxSize .. " bytes)")
end)

T.test("decode rejects malformed data", function()
	T.eq(Protocol.decode("hello"), nil)
	T.eq(Protocol.decode(buffer.create(3)), nil)
	T.eq(Protocol.decode(nil), nil)
end)

T.test("every animation name used by the sim is in the protocol table", function()
	local known = {}
	for _, a in Protocol.Anims do
		known[a] = true
	end
	for _, id in CD.Order do
		for name in CD.get(id).frameData do
			T.ok(known[name], "animation " .. name .. " missing from Protocol.Anims")
		end
	end
end)

T.test("sprite data decodes to the declared frame sizes", function()
	for _, id in CD.Order do
		local spr = H.require("ReplicatedStorage.Characters." .. id .. ".Sprites")
		local n = 0
		for name, sheet in spr.Sheets do
			for _, f in sheet do
				local idx = Codec.lz4(Codec.base64(f[5]), f[1] * f[2])
				T.eq(buffer.len(idx), f[1] * f[2])
				n += 1
			end
		end
		local pal = Codec.palette(spr.Palette)
		T.ok(pal[1] ~= nil and pal[0] == 0, id .. " palette")
		T.ok(n > 100, id .. " has " .. n .. " frames")
		-- frame indices referenced by FrameData must exist in their sheet
		for aname, a in CD.get(id).frameData do
			for _, r in a.frames do
				T.ok(spr.Sheets[a.sheet][r.f], id .. "." .. aname .. " references missing frame")
			end
		end
	end
end)

return T
