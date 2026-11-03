--!strict
-- Small UI helpers + the arcade theme. All sizes are relative (Scale) so the
-- HUD lines up with the pixel canvas at any resolution.

local Widgets = {}

Widgets.Font = Enum.Font.Arcade
Widgets.TitleFont = Enum.Font.LuckiestGuy
Widgets.Colors = {
	ink = Color3.fromRGB(20, 14, 30),
	panel = Color3.fromRGB(34, 26, 52),
	panel2 = Color3.fromRGB(54, 40, 82),
	gold = Color3.fromRGB(255, 204, 64),
	red = Color3.fromRGB(230, 40, 60),
	hp = Color3.fromRGB(255, 214, 60),
	hpLow = Color3.fromRGB(255, 120, 40),
	hpTrail = Color3.fromRGB(220, 30, 40),
	meter = Color3.fromRGB(60, 190, 255),
	meterFull = Color3.fromRGB(140, 255, 255),
	white = Color3.fromRGB(255, 255, 255),
	p1 = Color3.fromRGB(255, 70, 80),
	p2 = Color3.fromRGB(70, 150, 255),
}

function Widgets.frame(parent: Instance, props: { [string]: any }): Frame
	local f = Instance.new("Frame")
	f.BorderSizePixel = 0
	f.BackgroundColor3 = Widgets.Colors.panel
	for k, v in props do
		(f :: any)[k] = v
	end
	f.Parent = parent
	return f
end

function Widgets.text(parent: Instance, text: string, props: { [string]: any }): TextLabel
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Font = Widgets.Font
	t.TextColor3 = Widgets.Colors.white
	t.TextScaled = true
	t.Text = text
	t.TextStrokeTransparency = 0
	t.TextStrokeColor3 = Widgets.Colors.ink
	for k, v in props do
		(t :: any)[k] = v
	end
	t.Parent = parent
	return t
end

function Widgets.button(parent: Instance, text: string, props: { [string]: any }, onClick: () -> ()): TextButton
	local b = Instance.new("TextButton")
	b.AutoButtonColor = true
	b.BorderSizePixel = 0
	b.BackgroundColor3 = Widgets.Colors.panel2
	b.Font = Widgets.Font
	b.TextColor3 = Widgets.Colors.white
	b.TextScaled = true
	b.Text = text
	b.TextStrokeTransparency = 0.2
	b.Selectable = true
	for k, v in props do
		(b :: any)[k] = v
	end
	local stroke = Instance.new("UIStroke")
	stroke.Color = Widgets.Colors.gold
	stroke.Thickness = 2
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Parent = b
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0.18, 0)
	pad.PaddingBottom = UDim.new(0.18, 0)
	pad.PaddingLeft = UDim.new(0.04, 0)
	pad.PaddingRight = UDim.new(0.04, 0)
	pad.Parent = b
	b.Activated:Connect(onClick)
	b.Parent = parent
	return b
end

function Widgets.stroke(parent: Instance, color: Color3?, thickness: number?)
	local s = Instance.new("UIStroke")
	s.Color = color or Widgets.Colors.ink
	s.Thickness = thickness or 2
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = parent
	return s
end

function Widgets.aspect(parent: Instance, ratio: number)
	local a = Instance.new("UIAspectRatioConstraint")
	a.AspectRatio = ratio
	a.Parent = parent
	return a
end

function Widgets.color(rgb: { number }): Color3
	return Color3.fromRGB(rgb[1], rgb[2], rgb[3])
end

return Widgets
