--!strict
-- Server entry point: no avatars (the game is drawn in 2D on each client),
-- remotes, and the services that run authoritative online matches.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

Players.CharacterAutoLoads = false

local folder = ReplicatedStorage:FindFirstChild("Remotes") or Instance.new("Folder")
folder.Name = "Remotes"
local function remote(class: string, name: string): Instance
	local r = folder:FindFirstChild(name) or Instance.new(class)
	r.Name = name
	r.Parent = folder
	return r
end
local remotes = {
	Match = remote("RemoteEvent", "MatchRemote") :: RemoteEvent, -- queue / start / rematch / leave
	Input = remote("RemoteEvent", "InputRemote") :: RemoteEvent, -- client -> server button state
	Combat = remote("RemoteEvent", "CombatRemote") :: RemoteEvent, -- server -> client combat events (reliable)
	State = remote("UnreliableRemoteEvent", "StateRemote") :: any, -- server -> client snapshots (~30 Hz)
}
folder.Parent = ReplicatedStorage

local Services = script.Parent:WaitForChild("Services")
local CharacterService = require(Services:WaitForChild("CharacterService"))
local RoundService = require(Services:WaitForChild("RoundService"))
local CombatService = require(Services:WaitForChild("CombatService"))
local MatchService = require(Services:WaitForChild("MatchService"))

CharacterService.init()
RoundService.init(remotes)
CombatService.init(remotes, RoundService)
MatchService.init(remotes, CombatService, CharacterService)
