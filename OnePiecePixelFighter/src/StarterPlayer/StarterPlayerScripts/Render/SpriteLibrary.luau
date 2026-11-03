--!strict
-- Decodes a fighter's generated sprite modules (palette-indexed LZ4 frames)
-- into blit-ready frames, lazily per sheet, and caches them.
--
-- Sheets map to the brief's per-character folders:
--   Characters/<Id>/Sprites/{Idle, Walk, Jump, Attacks, Specials, Hit, Victory}
-- Replace a sheet module (or regenerate it from edited PNGs) and the game
-- picks it up with no code changes.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Codec = require(Shared:WaitForChild("Codec"))
local CharacterData = require(Shared:WaitForChild("CharacterData"))
local Raster = require(script.Parent:WaitForChild("Raster"))

local SpriteLibrary = {}

export type CharSprites = {
	id: string,
	palettes: { { [number]: number } }, -- [1] normal, [2] alternate (mirror matches)
	flash: number,
	flashOutline: number,
	sheets: { [string]: { Raster.Frame } },
	raw: any,
	portrait: Raster.Frame,
	frameData: any,
}

local cache: { [string]: CharSprites } = {}

local function decodeFrame(t: { any }): Raster.Frame
	local w, h, ox, oy, data = t[1], t[2], t[3], t[4], t[5]
	local idx = Codec.lz4(Codec.base64(data), w * h)
	return Raster.prepareFrame(w, h, ox, oy, idx)
end

function SpriteLibrary.get(id: string): CharSprites
	local c = cache[id]
	if c then
		return c
	end
	local raw = CharacterData.sprites(id)
	local char = CharacterData.get(id)
	local cs: CharSprites = {
		id = id,
		palettes = { Codec.palette(raw.Palette), Codec.palette(raw.AltPalette) },
		flash = Raster.rgb(255, 255, 255),
		flashOutline = Raster.rgb(220, 40, 70),
		sheets = {},
		raw = raw,
		portrait = decodeFrame(raw.Portrait),
		frameData = char.frameData,
	}
	cache[id] = cs
	return cs
end

-- Decode every sheet up front (call during loading screens to avoid hitches).
function SpriteLibrary.preload(id: string)
	local cs = SpriteLibrary.get(id)
	for name in cs.raw.Sheets do
		SpriteLibrary.sheet(cs, name)
	end
end

function SpriteLibrary.sheet(cs: CharSprites, name: string): { Raster.Frame }
	local s = cs.sheets[name]
	if s then
		return s
	end
	local list = {}
	for i, t in cs.raw.Sheets[name] or {} do
		list[i] = decodeFrame(t)
	end
	cs.sheets[name] = list
	return list
end

-- Frame for an animation row (anim name + 1-based row index from the sim/snapshot).
function SpriteLibrary.frame(cs: CharSprites, anim: string, row: number): (Raster.Frame?, any)
	local a = cs.frameData[anim] or cs.frameData.Idle
	local r = a.frames[row] or a.frames[1]
	local sheet = SpriteLibrary.sheet(cs, a.sheet)
	return sheet[r.f], r
end

return SpriteLibrary
