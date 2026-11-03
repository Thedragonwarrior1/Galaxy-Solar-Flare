--!strict
-- Match result overlay: winner, match stats, rematch / character select / menu.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CharacterData = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("CharacterData"))
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local C = Widgets.Colors

local ResultsScreen = {}
ResultsScreen.__index = ResultsScreen

export type Actions = { rematch: () -> (), select: () -> (), menu: () -> () }

function ResultsScreen.new(parent: Instance, view: any, labels: { string }, stats: any, actions: Actions)
	local root = Widgets.frame(parent, { Name = "Results", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 40 })
	local winner = view.result
	local title, subtitle
	if winner == 0 or winner == nil then
		title, subtitle = "DRAW GAME", ""
	else
		local cfg = CharacterData.get(view.fighters[winner].char).config
		title = cfg.DisplayName .. " WINS!"
		subtitle = cfg.Subtitle .. "  -  " .. (labels[winner] or ("P" .. winner))
	end
	Widgets.text(root, title, {
		Size = UDim2.fromScale(0.8, 0.14),
		Position = UDim2.fromScale(0.5, 0.2),
		AnchorPoint = Vector2.new(0.5, 0),
		Font = Widgets.TitleFont,
		TextColor3 = C.gold,
		ZIndex = 41,
	})
	Widgets.text(
		root,
		subtitle,
		{ Size = UDim2.fromScale(0.6, 0.06), Position = UDim2.fromScale(0.5, 0.35), AnchorPoint = Vector2.new(0.5, 0), ZIndex = 41 }
	)
	Widgets.text(root, string.format("ROUNDS %d - %d     BEST COMBO %d / %d", view.wins[1], view.wins[2], stats.best[1], stats.best[2]), {
		Size = UDim2.fromScale(0.6, 0.05),
		Position = UDim2.fromScale(0.5, 0.42),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 41,
	})
	local row = Widgets.frame(root, {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.7, 0.09),
		Position = UDim2.fromScale(0.5, 0.78),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 41,
	})
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	layout.Padding = UDim.new(0.03, 0)
	layout.Parent = row
	local self = setmetatable({ root = root }, ResultsScreen)
	self.rematch =
		Widgets.button(row, "REMATCH", { Size = UDim2.fromScale(0.3, 1), BackgroundColor3 = C.red, ZIndex = 42 }, actions.rematch)
	Widgets.button(row, "CHARACTER SELECT", { Size = UDim2.fromScale(0.36, 1), ZIndex = 42 }, actions.select)
	Widgets.button(row, "MAIN MENU", { Size = UDim2.fromScale(0.28, 1), ZIndex = 42 }, actions.menu)
	self.status = Widgets.text(
		root,
		"",
		{ Size = UDim2.fromScale(0.6, 0.05), Position = UDim2.fromScale(0.5, 0.9), AnchorPoint = Vector2.new(0.5, 0), ZIndex = 41 }
	)
	return self
end

function ResultsScreen.setStatus(self: any, s: string)
	self.status.Text = s
end

function ResultsScreen.destroy(self: any)
	self.root:Destroy()
end

return ResultsScreen
