--!strict
-- Online 1v1 as seen by a client. The server runs the only real simulation:
-- this session sends input state (held buttons + presses since the last send)
-- and draws the snapshots the server streams back, interpolated ~2 snapshots
-- behind to hide jitter. The client never reports hits or damage.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Protocol = require(Shared:WaitForChild("Protocol"))
local InputController = require(script.Parent.Parent:WaitForChild("Controllers"):WaitForChild("InputController"))

local OnlineSession = {}
OnlineSession.__index = OnlineSession

local INTERP_DELAY = 1 / 20 -- seconds behind the newest snapshot
local SEND_INTERVAL = 1 / 60
local HEARTBEAT = 0.1

function OnlineSession.new(remotes: any, start: any)
	local self = setmetatable({
		kind = "online",
		mode = "online",
		remotes = remotes,
		slot = start.slot,
		stage = start.stage,
		info = start,
		snaps = {} :: { any },
		events = {} :: { any },
		seq = 0,
		lastHeld = -1,
		pendingPress = 0,
		sendAcc = 0,
		sinceSend = 0,
		clock = 0,
		conns = {},
		ended = false,
		labels = if start.slot == 1 then { "YOU", start.opponentName or "RIVAL" } else { start.opponentName or "RIVAL", "YOU" },
		paused = false,
	}, OnlineSession)
	table.insert(
		self.conns,
		remotes.State.OnClientEvent:Connect(function(b: any)
			local v = Protocol.decode(b)
			if v then
				v.recv = self.clock
				table.insert(self.snaps, v)
				if #self.snaps > 12 then
					table.remove(self.snaps, 1)
				end
			end
		end)
	)
	table.insert(
		self.conns,
		remotes.Combat.OnClientEvent:Connect(function(list: any)
			if type(list) == "table" then
				for i, e in list do
					if i > 60 then
						break
					end
					if type(e) == "table" then
						table.insert(self.events, e)
					end
				end
			end
		end)
	)
	return self
end

function OnlineSession.update(self: any, dt: number)
	self.clock += dt
	-- input: always read slot 1 devices (you are "player 1" on your own machine)
	local held = InputController.held(1, true)
	local pressed = InputController.takePresses(1, true)
	self.pendingPress = bit32.bor(self.pendingPress, pressed)
	self.sendAcc += dt
	self.sinceSend += dt
	if self.sendAcc >= SEND_INTERVAL then
		self.sendAcc = 0
		if held ~= self.lastHeld or self.pendingPress ~= 0 or self.sinceSend >= HEARTBEAT then
			self.seq += 1
			self.remotes.Input:FireServer(self.seq, held, self.pendingPress)
			self.lastHeld = held
			self.pendingPress = 0
			self.sinceSend = 0
		end
	end
end

local function lerp(a: number, b: number, t: number): number
	return a + (b - a) * t
end

function OnlineSession.getView(self: any)
	local snaps = self.snaps
	if #snaps == 0 then
		return nil
	end
	local renderTime = self.clock - INTERP_DELAY
	local a, b = snaps[1], snaps[#snaps]
	for i = #snaps - 1, 1, -1 do
		if snaps[i].recv <= renderTime then
			a = snaps[i]
			b = snaps[i + 1]
			break
		end
	end
	local v = table.clone(b)
	if a ~= b and b.recv > a.recv then
		local t = math.clamp((renderTime - a.recv) / (b.recv - a.recv), 0, 1)
		v.fighters = {}
		for i = 1, 2 do
			local fa, fb = a.fighters[i], b.fighters[i]
			local f = table.clone(fb)
			-- interpolate position unless it teleported
			if math.abs(fa.x - fb.x) < 60 then
				f.x = lerp(fa.x, fb.x, t)
				f.y = lerp(fa.y, fb.y, t)
			end
			v.fighters[i] = f
		end
	end
	v.events = self.events
	v.stage = self.stage
	v.mode = "versus"
	self.events = {}
	return v
end

function OnlineSession.destroy(self: any)
	for _, c in self.conns do
		c:Disconnect()
	end
	self.conns = {}
end

return OnlineSession
