--!strict
-- Fast screen transitions: a diagonal wipe of dark bars plus a fade, so menus,
-- character select, fights and results never pop in abruptly. Kept short
-- (~0.25 s) so players never wait on them.

local TweenService = game:GetService("TweenService")

local TransitionController = {}

local gui: ScreenGui? = nil
local cover: Frame? = nil
local bars: { Frame } = {}
local busy = false

function TransitionController.init(parent: ScreenGui)
	gui = parent
	local c = Instance.new("Frame")
	c.Name = "Transition"
	c.BackgroundColor3 = Color3.fromRGB(10, 6, 18)
	c.BackgroundTransparency = 1
	c.BorderSizePixel = 0
	c.Size = UDim2.fromScale(1, 1)
	c.ZIndex = 200
	c.Active = false
	c.Parent = parent
	cover = c
	for i = 1, 6 do
		local b = Instance.new("Frame")
		b.BorderSizePixel = 0
		b.BackgroundColor3 = if i % 2 == 0 then Color3.fromRGB(28, 16, 44) else Color3.fromRGB(16, 10, 28)
		b.Size = UDim2.fromScale(0, 1 / 6 + 0.002)
		b.Position = UDim2.fromScale(0, (i - 1) / 6)
		b.ZIndex = 201
		b.Parent = parent
		table.insert(bars, b)
	end
end

-- Cover the screen, run `swap` (build the next screen), then reveal it.
function TransitionController.run(swap: () -> ())
	if not cover or busy then
		swap()
		return
	end
	busy = true
	local inInfo = TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	for i, b in bars do
		b.Position = UDim2.fromScale(0, (i - 1) / 6)
		b.AnchorPoint = Vector2.new(0, 0)
		TweenService:Create(b, TweenInfo.new(0.1 + i * 0.012, Enum.EasingStyle.Quad), { Size = UDim2.fromScale(1, 1 / 6 + 0.002) }):Play()
	end
	local t = TweenService:Create(cover :: Frame, inInfo, { BackgroundTransparency = 0 })
	t:Play()
	task.delay(0.15, function()
		local ok, err = pcall(swap)
		if not ok then
			warn("[Transition] " .. tostring(err))
		end
		for i, b in bars do
			b.AnchorPoint = Vector2.new(1, 0)
			b.Position = UDim2.fromScale(1, (i - 1) / 6)
			TweenService:Create(b, TweenInfo.new(0.12 + i * 0.012, Enum.EasingStyle.Quad), { Size = UDim2.fromScale(0, 1 / 6 + 0.002) })
				:Play()
		end
		TweenService:Create(cover :: Frame, TweenInfo.new(0.14, Enum.EasingStyle.Quad), { BackgroundTransparency = 1 }):Play()
		busy = false
	end)
end

-- Quick "pop" for highlighting an element (scale bump via a UIScale child).
function TransitionController.pop(inst: GuiObject, amount: number?)
	local sc = inst:FindFirstChildOfClass("UIScale") :: UIScale?
	if not sc then
		local n = Instance.new("UIScale")
		n.Parent = inst
		sc = n
	end
	local s = sc :: UIScale
	s.Scale = 1 + (amount or 0.18)
	TweenService:Create(s, TweenInfo.new(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

function TransitionController.slideIn(inst: GuiObject, fromOffset: UDim2, time: number?)
	local target = inst.Position or UDim2.new()
	inst.Position = target + fromOffset
	TweenService:Create(inst, TweenInfo.new(time or 0.22, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), { Position = target }):Play()
end

return TransitionController
