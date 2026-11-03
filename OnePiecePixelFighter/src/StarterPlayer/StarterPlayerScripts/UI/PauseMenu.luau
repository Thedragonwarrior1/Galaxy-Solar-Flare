--!strict
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local C = Widgets.Colors

local PauseMenu = {}
PauseMenu.__index = PauseMenu

function PauseMenu.new(parent: Instance, actions: { resume: () -> (), select: () -> (), menu: () -> () })
	local root = Widgets.frame(
		parent,
		{ Name = "Pause", BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.4, Size = UDim2.fromScale(1, 1), ZIndex = 60 }
	)
	Widgets.text(root, "PAUSED", {
		Size = UDim2.fromScale(0.5, 0.12),
		Position = UDim2.fromScale(0.5, 0.2),
		AnchorPoint = Vector2.new(0.5, 0),
		Font = Widgets.TitleFont,
		TextColor3 = C.gold,
		ZIndex = 61,
	})
	local list = Widgets.frame(root, {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.34, 0.36),
		Position = UDim2.fromScale(0.5, 0.4),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 61,
	})
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0.05, 0)
	layout.Parent = list
	Widgets.button(list, "RESUME", { Size = UDim2.fromScale(1, 0.28), ZIndex = 62 }, actions.resume)
	Widgets.button(list, "CHARACTER SELECT", { Size = UDim2.fromScale(1, 0.28), ZIndex = 62 }, actions.select)
	Widgets.button(list, "MAIN MENU", { Size = UDim2.fromScale(1, 0.28), ZIndex = 62 }, actions.menu)
	return setmetatable({ root = root }, PauseMenu)
end

function PauseMenu.destroy(self: any)
	self.root:Destroy()
end

return PauseMenu
