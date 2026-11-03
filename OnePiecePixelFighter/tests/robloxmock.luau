--!nonstrict
-- A strict mock of the Roblox engine surface used by the client and server.
-- Instances validate property names against Roblox's reflection database
-- (via @lune/roblox), so typos like `TextStrokeThickness` fail loudly here
-- instead of in Studio. Signals can be fired manually by tests.

local roblox = require("@lune/roblox")
local task = require("@lune/task")
local H = require("./harness")

local M = {}
local db = roblox.getReflectionDatabase()

-- ---------------------------------------------------------------------------
-- signals
-- ---------------------------------------------------------------------------
local Signal = {}
Signal.__index = Signal
function Signal.new(name)
	return setmetatable({ name = name, handlers = {} }, Signal)
end
function Signal:Connect(fn)
	local h = { fn = fn, connected = true }
	table.insert(self.handlers, h)
	return {
		Disconnect = function()
			h.connected = false
		end,
		Connected = true,
	}
end
function Signal:Once(fn)
	local c
	c = self:Connect(function(...)
		c.Disconnect()
		fn(...)
	end)
	return c
end
function Signal:Fire(...)
	for _, h in table.clone(self.handlers) do
		if h.connected then
			h.fn(...)
		end
	end
end
function Signal:Wait()
	return nil
end
M.Signal = Signal

-- ---------------------------------------------------------------------------
-- instances
-- ---------------------------------------------------------------------------
local EVENTS = {
	Activated = true,
	MouseEnter = true,
	MouseLeave = true,
	MouseButton1Click = true,
	MouseButton1Down = true,
	InputBegan = true,
	InputEnded = true,
	InputChanged = true,
	Changed = true,
	ChildAdded = true,
	ChildRemoved = true,
	OnClientEvent = true,
	OnServerEvent = true,
	Ended = true,
	Played = true,
	Destroying = true,
}

local function hasProperty(class, prop)
	local c = db:GetClass(class)
	while c do
		if c.Properties[prop] then
			return true
		end
		if not c.Superclass then
			break
		end
		c = db:GetClass(c.Superclass)
	end
	return false
end

local function isA(class, target)
	local c = db:GetClass(class)
	while c do
		if c.Name == target then
			return true
		end
		if not c.Superclass then
			break
		end
		c = db:GetClass(c.Superclass)
	end
	return false
end

local Inst = {}
M.created = 0

local function newInstance(class, extra)
	assert(db:GetClass(class), "Instance.new: unknown class " .. tostring(class))
	M.created += 1
	local self = {
		__class = class,
		__props = { Name = class, ClassName = class },
		__children = {},
		__signals = {},
		__propSignals = {},
	}
	if extra then
		for k, v in extra do
			self.__props[k] = v
		end
	end
	return setmetatable(self, Inst)
end

Inst.__index = function(self, k)
	local props = rawget(self, "__props")
	if k == "Parent" or k == "Name" or k == "ClassName" then
		return props[k]
	end
	local method = rawget(Inst, k)
	if method then
		return method
	end
	local class = rawget(self, "__class")
	if EVENTS[k] then
		local s = self.__signals[k]
		if not s then
			s = Signal.new(k)
			self.__signals[k] = s
		end
		return s
	end
	if props[k] ~= nil then
		return props[k]
	end
	if hasProperty(class, k) then
		-- sensible defaults for geometry reads
		if k == "AbsoluteSize" then
			return roblox.Vector2.new(1280, 720)
		elseif k == "AbsolutePosition" then
			return roblox.Vector2.new(0, 0)
		end
		return nil
	end
	for _, child in self.__children do
		if child.__props.Name == k then
			return child
		end
	end
	error(string.format("%s is not a valid member of %s", tostring(k), class), 2)
end

Inst.__newindex = function(self, k, v)
	local class = rawget(self, "__class")
	if k == "Parent" then
		local old = self.__props.Parent
		if type(old) == "table" and rawget(old, "__children") then
			local list = old.__children
			for i, c in list do
				if c == self then
					table.remove(list, i)
					break
				end
			end
		end
		self.__props.Parent = v
		if type(v) == "table" and rawget(v, "__children") then
			table.insert(v.__children, self)
		end
		return
	end
	if k ~= "Name" and not hasProperty(class, k) then
		error(string.format("%s is not a valid property of %s", tostring(k), class), 2)
	end
	self.__props[k] = v
	local ps = self.__propSignals[k]
	if ps then
		ps:Fire()
	end
end

function Inst:Destroy()
	self.Parent = nil
	rawset(self, "__destroyed", true)
	for _, c in table.clone(self.__children) do
		c:Destroy()
	end
end
function Inst:GetChildren()
	return table.clone(self.__children)
end
function Inst:FindFirstChild(n)
	for _, c in self.__children do
		if c.__props.Name == n then
			return c
		end
	end
	return nil
end
function Inst:WaitForChild(n)
	return self:FindFirstChild(n)
end
function Inst:IsA(c)
	return isA(self.__class, c)
end
function Inst:GetPropertyChangedSignal(p)
	local s = self.__propSignals[p]
	if not s then
		s = Signal.new(p)
		self.__propSignals[p] = s
	end
	return s
end
function Inst:Play()
	self.__props.IsPlaying = true
end
function Inst:Stop()
	self.__props.IsPlaying = false
end
-- remotes
function Inst:FireServer(...)
	M.toServer(self, ...)
end
function Inst:FireClient(player, ...)
	M.toClient(self, player, ...)
end
function Inst:FireAllClients(...) end

M.Instance = {
	new = function(class)
		return newInstance(class)
	end,
}
M.newInstance = newInstance

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
local keysDown = {}
M.keysDown = keysDown
local UIS = {
	InputBegan = Signal.new("InputBegan"),
	InputEnded = Signal.new("InputEnded"),
	TouchStarted = Signal.new("TouchStarted"),
	TouchMoved = Signal.new("TouchMoved"),
	TouchEnded = Signal.new("TouchEnded"),
	TouchEnabled = false,
	KeyboardEnabled = true,
}
function UIS:IsKeyDown(k)
	return keysDown[k] == true
end
function UIS:GetFocusedTextBox()
	return nil
end
function UIS:GetGamepadConnected()
	return false
end
function UIS:IsGamepadButtonDown()
	return false
end
function UIS:GetGamepadState()
	return {}
end
M.UserInputService = UIS

function M.press(key)
	keysDown[key] = true
	UIS.InputBegan:Fire(
		{ KeyCode = key, UserInputType = roblox.Enum.UserInputType.Keyboard, Position = roblox.Vector3.new(0, 0, 0) },
		false
	)
end
function M.release(key)
	keysDown[key] = nil
	UIS.InputEnded:Fire({ KeyCode = key, UserInputType = roblox.Enum.UserInputType.Keyboard }, false)
end

local RS = {
	RenderStepped = Signal.new("RenderStepped"),
	Heartbeat = Signal.new("Heartbeat"),
	Stepped = Signal.new("Stepped"),
}
function RS:BindToRenderStep() end
function RS:IsServer()
	return M.isServer
end
function RS:IsClient()
	return not M.isServer
end
M.RunService = RS

M.images = {}
local AssetService = {}
function AssetService:CreateEditableImage(opts)
	local img = {
		Size = opts.Size,
		last = nil,
		writes = 0,
	}
	function img:WritePixelsBuffer(pos, size, buf)
		assert(typeof(buf) == "buffer", "WritePixelsBuffer needs a buffer")
		assert(buffer.len(buf) == size.X * size.Y * 4, "buffer size mismatch")
		self.last = buf
		self.writes += 1
	end
	function img:Destroy() end
	table.insert(M.images, img)
	return img
end

local StarterGui = {}
function StarterGui:SetCoreGuiEnabled() end
function StarterGui:SetCore() end

local SoundService = newInstance("SoundService")

local playerGui = newInstance("PlayerGui")
local localPlayer = newInstance("Player", { DisplayName = "Tester", UserId = 1 })
playerGui.Parent = localPlayer

local Players = {
	LocalPlayer = localPlayer,
	PlayerAdded = Signal.new("PlayerAdded"),
	PlayerRemoving = Signal.new("PlayerRemoving"),
	CharacterAutoLoads = true,
}
M.Players = Players
M.playerGui = playerGui

local camera = newInstance("Camera")
local workspaceMock = newInstance("Workspace", { CurrentCamera = camera })

-- Remotes folder lives inside the harness ReplicatedStorage tree
local remotesFolder = newInstance("Folder", { Name = "Remotes" })
M.remotes = remotesFolder

local services = {
	UserInputService = UIS,
	RunService = RS,
	AssetService = AssetService,
	StarterGui = StarterGui,
	SoundService = SoundService,
	Players = Players,
	Workspace = workspaceMock,
}

local game = H.game
local origGet = getmetatable(game).GetService or game.GetService
function H.game.GetService(self, name)
	if services[name] then
		return services[name]
	end
	return self:WaitForChild(name)
end
M.services = services

-- harness nodes do not know about runtime-created children (Remotes)
local rs = game:WaitForChild("ReplicatedStorage")
rs._children.Remotes = remotesFolder

M.toServer = function() end
M.toClient = function() end

-- globals for scripts
H.globals.Instance = M.Instance
H.globals.UDim2 = roblox.UDim2
H.globals.UDim = roblox.UDim
H.globals.Vector2 = roblox.Vector2
H.globals.Vector3 = roblox.Vector3
H.globals.Color3 = roblox.Color3
H.globals.ColorSequence = roblox.ColorSequence
H.globals.ColorSequenceKeypoint = roblox.ColorSequenceKeypoint
H.globals.NumberSequence = roblox.NumberSequence
H.globals.NumberSequenceKeypoint = roblox.NumberSequenceKeypoint
H.globals.CFrame = roblox.CFrame
H.globals.Enum = roblox.Enum
H.globals.Content = {
	fromObject = function(o)
		return { object = o }
	end,
}
H.globals.task = task
H.globals.workspace = workspaceMock
H.globals.warn = function(...)
	M.warnings = (M.warnings or 0) + 1
	print("WARN", ...)
end
H.globals.tick = os.clock

return M
