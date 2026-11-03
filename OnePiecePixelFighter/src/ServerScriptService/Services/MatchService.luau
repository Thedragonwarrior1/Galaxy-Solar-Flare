--!strict
-- Matchmaking and match lifecycle for Online 1v1:
--   queue -> pair two players -> authoritative Match on CombatService ->
--   result -> rematch (both must accept) or leave.
-- Leaving or disconnecting mid-match forfeits it; the opponent is told.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local CombatConfig = require(Shared:WaitForChild("CombatConfig"))
local Match = require(Shared:WaitForChild("Sim"):WaitForChild("Match"))

local MatchService = {}

local STAGES = { "Harbour", "Storm", "SkyIsland" }
local remotes: any
local combat: any
local chars: any
local queue: { { player: Player, char: string } } = {}

local function inQueue(p: Player): number?
	for i, q in queue do
		if q.player == p then
			return i
		end
	end
	return nil
end

local function send(p: Player, msg: any)
	if p.Parent then
		remotes.Match:FireClient(p, msg)
	end
end

local function begin(a: any, b: any, stage: string?)
	local st = stage or STAGES[math.random(1, #STAGES)]
	local match = Match.new({
		p1 = chars.get(a.char),
		p2 = chars.get(b.char),
		stage = st,
		roundTime = CombatConfig.RoundTime,
	})
	local entry = {
		match = match,
		players = { a.player, b.player },
		chars = { a.char, b.char },
		stage = st,
		rematch = {},
		lastPhase = "",
	}
	combat.addMatch(entry)
	for slot, p in entry.players do
		local other = entry.players[3 - slot]
		send(p, {
			op = "start",
			slot = slot,
			p1 = a.char,
			p2 = b.char,
			stage = st,
			roundTime = CombatConfig.RoundTime,
			opponentName = other.DisplayName,
		})
	end
end

local function tryPair()
	while #queue >= 2 do
		local a = table.remove(queue, 1) :: any
		local b = table.remove(queue, 1) :: any
		if a.player.Parent and b.player.Parent then
			begin(a, b)
		elseif a.player.Parent then
			table.insert(queue, 1, a)
		elseif b.player.Parent then
			table.insert(queue, 1, b)
		end
	end
	for _, q in queue do
		send(q.player, { op = "queued", waiting = #queue })
	end
end

local function leaveMatch(p: Player)
	local info = combat.matchOf(p)
	if not info then
		return
	end
	local entry = info.entry
	local other = entry.players[3 - info.slot]
	combat.removeMatch(entry)
	if other and other.Parent then
		send(other, { op = "opponentLeft" })
	end
end

local function onMessage(p: Player, msg: any)
	if type(msg) ~= "table" or type(msg.op) ~= "string" then
		return
	end
	local op = msg.op
	if op == "queue" then
		local char = chars.validate(msg.char)
		if not char then
			send(p, { op = "error", message = "Invalid character" })
			return
		end
		if combat.matchOf(p) then
			leaveMatch(p)
		end
		local i = inQueue(p)
		if i then
			queue[i].char = char
		else
			table.insert(queue, { player = p, char = char })
		end
		tryPair()
	elseif op == "cancel" then
		local i = inQueue(p)
		if i then
			table.remove(queue, i)
		end
	elseif op == "rematch" then
		local info = combat.matchOf(p)
		if not info then
			return
		end
		local entry = info.entry
		if entry.match.phase ~= "matchEnd" then
			return
		end
		entry.rematch[info.slot] = true
		local other = entry.players[3 - info.slot]
		if entry.rematch[1] and entry.rematch[2] then
			combat.removeMatch(entry)
			begin({ player = entry.players[1], char = entry.chars[1] }, { player = entry.players[2], char = entry.chars[2] }, entry.stage)
		else
			send(other, { op = "rematch", status = "waiting" })
		end
	elseif op == "leave" then
		leaveMatch(p)
		local i = inQueue(p)
		if i then
			table.remove(queue, i)
		end
	end
end

function MatchService.init(r: any, combatService: any, characterService: any)
	remotes = r
	combat = combatService
	chars = characterService
	remotes.Match.OnServerEvent:Connect(onMessage)
	Players.PlayerRemoving:Connect(function(p: Player)
		local i = inQueue(p)
		if i then
			table.remove(queue, i)
		end
		leaveMatch(p)
	end)
end

return MatchService
