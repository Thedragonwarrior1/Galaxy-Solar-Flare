--!strict
-- Roster registry. Loads each fighter's CharacterConfig + generated FrameData
-- from ReplicatedStorage/Characters/<Id>. Adding a fighter = adding a folder
-- with those modules and listing its id here.

local AttackDefinitions = require(script.Parent.AttackDefinitions)

local CharacterData = {}

CharacterData.Order = {
	"LuffyGear2",
	"LuffyGear4",
	"LuffyGear5",
	"Doflamingo",
	"Enel",
	"Zoro",
	"Katakuri",
}

export type Character = {
	id: string,
	config: any,
	frameData: { [string]: any },
	moves: { [string]: AttackDefinitions.Move },
}

local cache: { [string]: Character } = {}

local function folder(): Instance
	return (script.Parent.Parent :: any):WaitForChild("Characters")
end

function CharacterData.isValid(id: any): boolean
	if type(id) ~= "string" then
		return false
	end
	for _, v in CharacterData.Order do
		if v == id then
			return true
		end
	end
	return false
end

function CharacterData.get(id: string): Character
	local c = cache[id]
	if c then
		return c
	end
	assert(CharacterData.isValid(id), "unknown character " .. tostring(id))
	local dir = (folder() :: any):WaitForChild(id)
	local config = require(dir:WaitForChild("CharacterConfig")) :: any
	local frameData = require(dir:WaitForChild("FrameData")) :: any
	local moves = AttackDefinitions.finalize(id, config.Moves, frameData)
	c = { id = id, config = config, frameData = frameData, moves = moves }
	cache[id] = c
	return c
end

-- Sprite data is client-only (large); the server never needs it.
function CharacterData.sprites(id: string): any
	local dir = (folder() :: any):WaitForChild(id)
	return require(dir:WaitForChild("Sprites"))
end

return CharacterData
