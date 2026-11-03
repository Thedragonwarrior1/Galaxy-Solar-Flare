--!strict
-- Title screen over a live CPU-vs-CPU attract match.

local Widgets = require(script.Parent:WaitForChild("Widgets"))
local C = Widgets.Colors

local MainMenu = {}
MainMenu.__index = MainMenu

export type Actions = {
	online: () -> (),
	training: () -> (),
	versus: () -> (),
	inspect: () -> (),
}

function MainMenu.new(gui: ScreenGui, actions: Actions)
	local root = Widgets.frame(gui, { Name = "MainMenu", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 30 })
	local shade = Widgets.frame(root, { BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.45, Size = UDim2.fromScale(1, 1), ZIndex = 30 })
	local g = Instance.new("UIGradient")
	g.Rotation = 90
	g.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(0.5, 0.9), NumberSequenceKeypoint.new(1, 0.1) })
	g.Parent = shade
	Widgets.text(root, "ONE PIECE", {
		Size = UDim2.fromScale(0.7, 0.16),
		Position = UDim2.fromScale(0.5, 0.06),
		AnchorPoint = Vector2.new(0.5, 0),
		Font = Widgets.TitleFont,
		TextColor3 = C.gold,
		ZIndex = 31,
	})
	Widgets.text(root, "PIXEL FIGHTER", {
		Size = UDim2.fromScale(0.5, 0.08),
		Position = UDim2.fromScale(0.5, 0.22),
		AnchorPoint = Vector2.new(0.5, 0),
		TextColor3 = C.white,
		ZIndex = 31,
	})
	local list = Widgets.frame(root, {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.34, 0.44),
		Position = UDim2.fromScale(0.5, 0.36),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 31,
	})
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0.04, 0)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = list
	local items = {
		{ "ONLINE 1V1", actions.online },
		{ "TRAINING", actions.training },
		{ "LOCAL TEST MATCH", actions.versus },
		{ "CHARACTER SELECT", actions.inspect },
	}
	local buttons = {}
	for i, it in items do
		local b = Widgets.button(list, it[1], { Size = UDim2.fromScale(1, 0.21), LayoutOrder = i, ZIndex = 32 }, it[2])
		table.insert(buttons, b)
	end
	Widgets.text(root, "MOVE A/D  JUMP W  CROUCH S  DASH SPACE  BLOCK SHIFT  J/K/L LIGHT/MED/HEAVY  U SPECIAL  I SUPER  P PAUSE", {
		Size = UDim2.fromScale(0.94, 0.035),
		Position = UDim2.fromScale(0.5, 0.95),
		AnchorPoint = Vector2.new(0.5, 1),
		TextColor3 = C.white,
		ZIndex = 31,
	})
	return setmetatable({ root = root, buttons = buttons, cursor = 1, items = items }, MainMenu)
end

-- keyboard / gamepad navigation
function MainMenu.nav(self: any, edges: number, Input: any)
	local n = #self.buttons
	if bit32.band(edges, Input.UP) ~= 0 then
		self.cursor = (self.cursor - 2) % n + 1
	elseif bit32.band(edges, Input.DOWN) ~= 0 then
		self.cursor = self.cursor % n + 1
	elseif bit32.band(edges, Input.LIGHT) ~= 0 then
		self.items[self.cursor][2]()
		return
	end
	for i, b in self.buttons do
		b.BackgroundColor3 = if i == self.cursor then C.red else C.panel2
	end
end

function MainMenu.destroy(self: any)
	self.root:Destroy()
end

return MainMenu
