--!strict
-- Training and Local Test Match: the shared Match simulation runs on this
-- client at a fixed 60 Hz (accumulator), fed by local input devices and/or
-- the CPU. No server involvement and nothing at stake, so it is responsive.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Sim = Shared:WaitForChild("Sim")
local CharacterData = require(Shared:WaitForChild("CharacterData"))
local CombatConfig = require(Shared:WaitForChild("CombatConfig"))
local Protocol = require(Shared:WaitForChild("Protocol"))
local Match = require(Sim:WaitForChild("Match"))
local AI = require(Sim:WaitForChild("AI"))
local InputController = require(script.Parent.Parent:WaitForChild("Controllers"):WaitForChild("InputController"))

local LocalSession = {}
LocalSession.__index = LocalSession

export type Options = {
	mode: string, -- "training" | "versus" | "attract"
	p1: string,
	p2: string,
	stage: string,
	p2Human: boolean?,
	difficulty: number?,
	roundTime: number?,
}

local STEP = 1 / CombatConfig.TickRate

function LocalSession.new(opts: Options)
	local match = Match.new({
		p1 = CharacterData.get(opts.p1),
		p2 = CharacterData.get(opts.p2),
		mode = if opts.mode == "training" then "training" else "versus",
		stage = opts.stage,
		roundTime = opts.roundTime,
		seed = os.time(),
	})
	local self = setmetatable({
		kind = "local",
		mode = opts.mode,
		opts = opts,
		match = match,
		acc = 0,
		paused = false,
		events = {},
		view = nil :: any,
		ai1 = if opts.mode == "attract" then AI.new(1, 0.75, os.time() % 1000 + 3) else nil,
		ai2 = AI.new(2, opts.difficulty or 0.6, os.time() % 1000 + 17),
		p2Human = opts.p2Human == true,
		labels = { "P1", if opts.mode == "training" then "DUMMY" elseif opts.p2Human then "P2" else "CPU" },
	}, LocalSession)
	if opts.mode == "training" then
		self.ai2.mode = "stand"
	end
	return self
end

function LocalSession.stepOnce(self: any)
	local m = self.match
	local b1, p1, b2, p2 = 0, 0, 0, 0
	if self.ai1 then
		b1 = self.ai1:think(m)
	else
		b1 = InputController.held(1, true)
		p1 = InputController.takePresses(1, true)
	end
	if self.p2Human then
		b2 = InputController.held(2, false)
		p2 = InputController.takePresses(2, false)
	elseif self.mode == "training" then
		b2 = self.ai2:dummy(m)
	else
		b2 = self.ai2:think(m)
	end
	m:step(b1, b2, p1, p2)
	for _, e in m.events do
		table.insert(self.events, e)
	end
end

function LocalSession.update(self: any, dt: number)
	if self.paused then
		InputController.takePresses(1, true)
		InputController.takePresses(2, false)
		return
	end
	self.acc = math.min(self.acc + dt, STEP * 6)
	while self.acc >= STEP do
		self.acc -= STEP
		self:stepOnce()
	end
	if self.mode == "attract" and self.match.phase == "matchEnd" and self.match.phaseFrame > 200 then
		-- endless attract loop with new fighters
		local ids = CharacterData.Order
		local a, b = ids[math.random(1, #ids)], ids[math.random(1, #ids)]
		local next = LocalSession.new({ mode = "attract", p1 = a, p2 = b, stage = self.opts.stage })
		self.match = next.match
		self.restarted = true
	end
end

-- View for the renderer/HUD; carries every event since the previous call.
function LocalSession.getView(self: any)
	self.view = Protocol.view(self.match, self.view)
	self.view.events = self.events
	self.view.mode = self.match.mode
	self.events = {}
	return self.view
end

function LocalSession.resetPositions(self: any)
	local m = self.match
	local mid = CombatConfig.StageWidth / 2
	for i, f in m.fighters do
		f.x = mid + (if i == 1 then -1 else 1) * CombatConfig.StartDistance / 2
		f.y, f.vx, f.vy, f.pvx = 0, 0, 0, 0
		f.facing = if i == 1 then 1 else -1
		f.move = nil
		f.hp = f.maxHp
		f.stun, f.hitstop, f.invuln = 0, 0, 0
		f:resetCombo()
		f:setState("idle")
	end
	m.projectiles = {}
end

function LocalSession.destroy(_self: any) end

return LocalSession
