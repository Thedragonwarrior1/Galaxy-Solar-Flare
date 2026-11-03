--!strict
-- Runs every online match's simulation at a fixed 60 Hz on the server.
-- Clients only send button state; all hit detection, damage, meter, rounds
-- and win conditions are computed here by the shared Match simulation.
--
-- Input validation: argument types, monotonically increasing sequence numbers
-- (duplicates/old packets dropped), a per-player rate limit, bit sanitising
-- (no impossible combinations), and a timeout that releases held buttons when
-- a client stops sending (lag spike / disconnect) so nobody walks forever.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local CombatConfig = require(Shared:WaitForChild("CombatConfig"))
local Protocol = require(Shared:WaitForChild("Protocol"))
local Input = require(Shared:WaitForChild("Sim"):WaitForChild("Input"))

local CombatService = {}

local STEP = 1 / CombatConfig.TickRate
local SNAPSHOT_EVERY = 2 -- 30 Hz
local remotes: any
local rounds: any

local matches: { any } = {}
local byPlayer: { [Player]: any } = {} -- player -> { entry, slot }
local inputState: { [Player]: any } = {}

local function newInput()
	return { held = 0, press = 0, seq = 0, last = os.clock(), budget = CombatConfig.MaxInputMessagesPerSecond, rejected = 0 }
end

function CombatService.addMatch(entry: any)
	table.insert(matches, entry)
	for slot, p in entry.players do
		byPlayer[p] = { entry = entry, slot = slot }
		inputState[p] = newInput()
	end
	entry.tick = 0
	entry.events = {}
end

function CombatService.removeMatch(entry: any)
	for i, e in matches do
		if e == entry then
			table.remove(matches, i)
			break
		end
	end
	for _, p in entry.players do
		if byPlayer[p] and byPlayer[p].entry == entry then
			byPlayer[p] = nil
			inputState[p] = nil
		end
	end
end

function CombatService.matchOf(p: Player): any
	return byPlayer[p]
end

local function onInput(player: Player, seq: any, held: any, pressed: any)
	local st = inputState[player]
	if not st then
		return -- not in a match: ignore
	end
	if type(seq) ~= "number" or type(held) ~= "number" or type(pressed) ~= "number" then
		st.rejected += 1
		return
	end
	if seq ~= seq or held ~= held or pressed ~= pressed then -- NaN
		st.rejected += 1
		return
	end
	if seq <= st.seq then
		return -- duplicate or out of order
	end
	if st.budget <= 0 then
		st.rejected += 1
		return -- flooding
	end
	st.budget -= 1
	st.seq = math.floor(seq)
	st.held = Input.sanitize(held)
	st.press = bit32.bor(st.press, Input.sanitize(pressed))
	st.last = os.clock()
end

local function step(entry: any)
	local m = entry.match
	local p1, p2 = entry.players[1], entry.players[2]
	local now = os.clock()
	local function take(p: Player): (number, number)
		local st = inputState[p]
		if not st then
			return 0, 0
		end
		if now - st.last > CombatConfig.InputTimeout then
			st.held = 0
		end
		local press = st.press
		st.press = 0
		return st.held, press
	end
	local h1, pr1 = take(p1)
	local h2, pr2 = take(p2)
	m:step(h1, h2, pr1, pr2)
	for _, e in m.events do
		table.insert(entry.events, e)
	end
	rounds.observe(entry)
	entry.tick += 1
	if entry.tick % SNAPSHOT_EVERY == 0 then
		entry.view = Protocol.view(m, entry.view)
		local snap = Protocol.encode(entry.view)
		local evs = Protocol.cleanEvents(entry.events)
		entry.events = {}
		for _, p in entry.players do
			if p.Parent then
				remotes.State:FireClient(p, snap)
				if #evs > 0 then
					remotes.Combat:FireClient(p, evs)
				end
			end
		end
	end
end

function CombatService.init(r: any, roundService: any)
	remotes = r
	rounds = roundService
	remotes.Input.OnServerEvent:Connect(onInput)
	local acc = 0
	local budgetAcc = 0
	RunService.Heartbeat:Connect(function(dt: number)
		acc = math.min(acc + dt, STEP * 8)
		budgetAcc += dt
		if budgetAcc >= 1 then
			budgetAcc -= 1
			for _, st in inputState do
				st.budget = CombatConfig.MaxInputMessagesPerSecond
			end
		end
		while acc >= STEP do
			acc -= STEP
			for _, entry in matches do
				local ok, err = pcall(step, entry)
				if not ok then
					warn("[CombatService] match step failed: " .. tostring(err))
				end
			end
		end
	end)
	Players.PlayerRemoving:Connect(function(p: Player)
		inputState[p] = nil
	end)
end

return CombatService
