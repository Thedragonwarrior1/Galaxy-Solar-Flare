--!strict
-- Validates character selections against the roster and preloads the
-- (server-side, sprite-free) character data.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CharacterData = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("CharacterData"))

local CharacterService = {}

function CharacterService.init()
	for _, id in CharacterData.Order do
		CharacterData.get(id) -- validates every move against its animation data at startup
	end
end

function CharacterService.validate(id: any): string?
	if CharacterData.isValid(id) then
		return id
	end
	return nil
end

function CharacterService.get(id: string)
	return CharacterData.get(id)
end

return CharacterService
