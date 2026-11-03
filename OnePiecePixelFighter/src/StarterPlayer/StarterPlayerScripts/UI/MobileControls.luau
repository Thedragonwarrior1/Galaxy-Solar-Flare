--!strict
-- Touch controls: an 8-way d-pad on the left and attack buttons on the right.
-- They sit in the letterbox margins beside the 16:9 game screen when the phone
-- is wide enough, otherwise low in the corners and semi-transparent, so they
-- never cover the fighters in the middle of the stage.
--
-- Touches are tracked with UserInputService (true multi-touch: hold block and
-- press an attack, slide across the d-pad, etc.) and hit-tested against the
-- buttons' screen rectangles.

local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Input = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Sim"):WaitForChild("Input"))
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local InputController = require(script.Parent.Parent:WaitForChild("Controllers"):WaitForChild("InputController"))

local MobileControls = {}
MobileControls.__index = MobileControls

local BUTTONS = {
	-- label, bit, x, y (relative to the right cluster), colour
	{ "L", Input.LIGHT, 0.12, 0.62, Color3.fromRGB(255, 220, 90) },
	{ "M", Input.MEDIUM, 0.42, 0.62, Color3.fromRGB(255, 160, 60) },
	{ "H", Input.HEAVY, 0.72, 0.62, Color3.fromRGB(255, 90, 70) },
	{ "SP", Input.SPECIAL, 0.27, 0.32, Color3.fromRGB(200, 110, 255) },
	{ "SU", Input.SUPER, 0.57, 0.32, Color3.fromRGB(90, 210, 255) },
	{ "BLK", Input.BLOCK, 0.85, 0.32, Color3.fromRGB(150, 200, 160) },
	{ "JMP", Input.UP, 0.85, 0.9, Color3.fromRGB(220, 220, 240) },
	{ "DASH", Input.DASH, 0.55, 0.9, Color3.fromRGB(220, 220, 240) },
}

function MobileControls.new(gui: ScreenGui)
	local root = Instance.new("Frame")
	root.Name = "MobileControls"
	root.BackgroundTransparency = 1
	root.Size = UDim2.fromScale(1, 1)
	root.ZIndex = 50
	root.Parent = gui

	local self = setmetatable({ root = root, buttons = {}, touches = {}, dpad = nil :: any, held = 0, conns = {} }, MobileControls)

	-- d-pad
	local pad = Instance.new("Frame")
	pad.Name = "DPad"
	pad.AnchorPoint = Vector2.new(0, 1)
	pad.BackgroundColor3 = Color3.fromRGB(20, 14, 30)
	pad.BackgroundTransparency = 0.45
	pad.Size = UDim2.fromScale(0.2, 0.36)
	pad.Position = UDim2.fromScale(0.015, 0.97)
	pad.ZIndex = 50
	pad.Parent = root
	Widgets.aspect(pad, 1)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.5, 0)
	corner.Parent = pad
	Widgets.stroke(pad, Color3.fromRGB(255, 255, 255), 2)
	for _, d in { { "^", 0.5, 0.16 }, { "v", 0.5, 0.84 }, { "<", 0.16, 0.5 }, { ">", 0.84, 0.5 } } do
		Widgets.text(
			pad,
			d[1],
			{ Size = UDim2.fromScale(0.25, 0.25), Position = UDim2.fromScale(d[2], d[3]), AnchorPoint = Vector2.new(0.5, 0.5), ZIndex = 51 }
		)
	end
	local knob = Instance.new("Frame")
	knob.Size = UDim2.fromScale(0.34, 0.34)
	knob.AnchorPoint = Vector2.new(0.5, 0.5)
	knob.Position = UDim2.fromScale(0.5, 0.5)
	knob.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	knob.BackgroundTransparency = 0.5
	knob.ZIndex = 52
	knob.Parent = pad
	local kc = Instance.new("UICorner")
	kc.CornerRadius = UDim.new(0.5, 0)
	kc.Parent = knob
	self.dpad = pad
	self.knob = knob

	-- attack cluster
	local cluster = Instance.new("Frame")
	cluster.Name = "Buttons"
	cluster.BackgroundTransparency = 1
	cluster.AnchorPoint = Vector2.new(1, 1)
	cluster.Size = UDim2.fromScale(0.3, 0.5)
	cluster.Position = UDim2.fromScale(0.99, 0.98)
	cluster.ZIndex = 50
	cluster.Parent = root
	Widgets.aspect(cluster, 1.25)
	for _, b in BUTTONS do
		local f = Instance.new("TextLabel")
		f.Name = b[1]
		f.AnchorPoint = Vector2.new(0.5, 0.5)
		f.Size = UDim2.fromScale(0.25, 0.3)
		f.Position = UDim2.fromScale(b[3], b[4])
		f.BackgroundColor3 = b[5]
		f.BackgroundTransparency = 0.35
		f.Text = b[1]
		f.TextScaled = true
		f.Font = Widgets.Font
		f.TextColor3 = Color3.fromRGB(20, 14, 30)
		f.ZIndex = 51
		f.Parent = cluster
		Widgets.aspect(f, 1)
		local c = Instance.new("UICorner")
		c.CornerRadius = UDim.new(0.5, 0)
		c.Parent = f
		Widgets.stroke(f, Color3.fromRGB(255, 255, 255), 2)
		table.insert(self.buttons, { gui = f, bit = b[2] })
	end
	self.cluster = cluster

	local function inside(g: GuiObject, p: Vector2, grow: number?): boolean
		local a, s = g.AbsolutePosition, g.AbsoluteSize
		local m = grow or 0
		return p.X >= a.X - m and p.X <= a.X + s.X + m and p.Y >= a.Y - m and p.Y <= a.Y + s.Y + m
	end

	local function classify(io: InputObject): (string?, number)
		local p = Vector2.new(io.Position.X, io.Position.Y)
		if inside(pad, p, 30) then
			return "dpad", 0
		end
		for _, b in self.buttons do
			if inside(b.gui, p, 6) then
				return "button", b.bit
			end
		end
		return nil, 0
	end

	local function dpadBits(io: InputObject): number
		local a, s = pad.AbsolutePosition, pad.AbsoluteSize
		local c = a + s / 2
		local d = Vector2.new(io.Position.X, io.Position.Y) - c
		local bits = 0
		local dead = s.X * 0.16
		if d.Magnitude < dead then
			knob.Position = UDim2.fromScale(0.5, 0.5)
			return 0
		end
		local ang = math.atan2(-d.Y, d.X)
		local sector = math.floor((ang + math.pi / 8) / (math.pi / 4)) % 8
		local map = {
			[0] = Input.RIGHT,
			[1] = Input.RIGHT + Input.UP,
			[2] = Input.UP,
			[3] = Input.LEFT + Input.UP,
			[4] = Input.LEFT,
			[5] = Input.LEFT + Input.DOWN,
			[6] = Input.DOWN,
			[7] = Input.RIGHT + Input.DOWN,
		}
		bits = map[sector]
		local clamped = if d.Magnitude > s.X * 0.4 then d.Unit * s.X * 0.4 else d
		knob.Position = UDim2.new(0.5, clamped.X, 0.5, clamped.Y)
		return bits
	end

	local function recompute()
		local held = 0
		for _, t in self.touches do
			held = bit32.bor(held, t.bits)
		end
		local pressed = bit32.band(held, bit32.bnot(self.held))
		self.held = held
		for _, b in self.buttons do
			b.gui.BackgroundTransparency = if bit32.band(held, b.bit) ~= 0 then 0 else 0.35
		end
		InputController.setTouch(held, pressed)
	end

	table.insert(
		self.conns,
		UserInputService.TouchStarted:Connect(function(io: InputObject)
			if not root.Visible then
				return
			end
			local kind, bit = classify(io)
			if kind == "dpad" then
				self.touches[io] = { kind = kind, bits = dpadBits(io) }
			elseif kind == "button" then
				self.touches[io] = { kind = kind, bits = bit }
			end
			recompute()
		end)
	)
	table.insert(
		self.conns,
		UserInputService.TouchMoved:Connect(function(io: InputObject)
			local t = self.touches[io]
			if t and t.kind == "dpad" then
				t.bits = dpadBits(io)
				recompute()
			end
		end)
	)
	table.insert(
		self.conns,
		UserInputService.TouchEnded:Connect(function(io: InputObject)
			local t = self.touches[io]
			if t then
				if t.kind == "dpad" then
					knob.Position = UDim2.fromScale(0.5, 0.5)
				end
				self.touches[io] = nil
				recompute()
			end
		end)
	)
	return self
end

-- Place the controls beside the game screen when there is room.
function MobileControls.layout(self: any, screenAbs: Vector2, canvasSize: Vector2)
	local margin = (screenAbs.X - canvasSize.X) / 2
	local roomy = margin >= screenAbs.Y * 0.28
	for _, g in { self.dpad, self.cluster } do
		(g :: any).BackgroundTransparency = if g == self.dpad then (if roomy then 0.2 else 0.5) else 1
	end
	self.root.Visible = true
end

function MobileControls.setVisible(self: any, v: boolean)
	self.root.Visible = v
	if not v then
		table.clear(self.touches)
		self.held = 0
		InputController.setTouch(0, 0)
	end
end

function MobileControls.destroy(self: any)
	for _, c in self.conns do
		c:Disconnect()
	end
	self.root:Destroy()
end

return MobileControls
