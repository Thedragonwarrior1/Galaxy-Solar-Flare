--!strict
-- Match result: the winner performs their victory animation in a framed
-- preview beside the result, match stats, and REMATCH / CHARACTER SELECT /
-- MAIN MENU.

local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CharacterData = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("CharacterData"))
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local Transition = require(script.Parent:WaitForChild("TransitionController"))
local Preview = require(script.Parent:WaitForChild("CharacterPreviewController"))
local C = Widgets.Colors

local ResultsScreen = {}
ResultsScreen.__index = ResultsScreen

local GOLD = Color3.fromRGB(255, 204, 64)

export type Actions = { rematch: () -> (), select: () -> (), menu: () -> () }

function ResultsScreen.new(parent: Instance, view: any, labels: { string }, stats: any, actions: Actions)
	local root = Widgets.frame(parent, {
		Name = "Results",
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.35,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 40,
	})
	local winner = view.result
	local self = setmetatable({ root = root }, ResultsScreen)
	local title, subtitle = "DRAW GAME", ""
	local winChar = nil
	if winner == 1 or winner == 2 then
		winChar = view.fighters[winner].char
		local cfg = CharacterData.get(winChar).config
		title = cfg.DisplayName .. " WINS!"
		subtitle = cfg.Subtitle .. "  -  " .. (labels[winner] or ("P" .. winner))
	end
	-- winner preview (victory pose loop)
	local frame = Widgets.frame(root, {
		Size = UDim2.fromScale(0.3, 0.5),
		Position = UDim2.fromScale(0.07, 0.24),
		BackgroundColor3 = Color3.fromRGB(22, 14, 36),
		ZIndex = 41,
	})
	Widgets.stroke(frame, GOLD, 3)
	local art = Widgets.frame(frame, {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Position = UDim2.fromScale(0.5, 0.5),
		AnchorPoint = Vector2.new(0.5, 0.5),
		ZIndex = 42,
	})
	Widgets.aspect(art, 170 / 150)
	if winChar then
		local pv = Preview.new(art, { w = 170, h = 150, backdrop = { 40, 22, 30 }, glow = { 200, 150, 60 } })
		if pv.cv then
			pv.cv.label.ZIndex = 42
		end
		pv:set(winChar, view.fighters[winner].palette or 0, 1)
		pv:play({ "Victory" })
		self.preview = pv
		self.conn = RunService.RenderStepped:Connect(function(dt)
			if pv.anim == "Idle" and #pv.queue == 0 then
				pv:play({ "Victory" })
			end
			pv:step(dt)
		end)
	end
	local t = Widgets.text(root, title, {
		Size = UDim2.fromScale(0.54, 0.14),
		Position = UDim2.fromScale(0.42, 0.24),
		TextXAlignment = Enum.TextXAlignment.Left,
		Font = Widgets.TitleFont,
		TextColor3 = GOLD,
		ZIndex = 41,
	})
	local ts = Instance.new("UIStroke")
	ts.Thickness = 3
	ts.Color = Color3.fromRGB(40, 8, 18)
	ts.Parent = t
	Transition.slideIn(t, UDim2.fromScale(0.3, 0), 0.25)
	Widgets.text(root, subtitle, {
		Size = UDim2.fromScale(0.5, 0.06),
		Position = UDim2.fromScale(0.42, 0.39),
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 41,
	})
	local lines = {
		string.format("ROUNDS        %d - %d", view.wins[1], view.wins[2]),
		string.format("BEST COMBO    %d / %d", stats.best[1], stats.best[2]),
	}
	for i, l in lines do
		Widgets.text(root, l, {
			Size = UDim2.fromScale(0.5, 0.05),
			Position = UDim2.fromScale(0.42, 0.48 + (i - 1) * 0.06),
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = Color3.fromRGB(220, 214, 236),
			ZIndex = 41,
		})
	end
	local row = Widgets.frame(
		root,
		{ BackgroundTransparency = 1, Size = UDim2.fromScale(0.54, 0.08), Position = UDim2.fromScale(0.42, 0.66), ZIndex = 41 }
	)
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.Padding = UDim.new(0.03, 0)
	layout.Parent = row
	self.rematch =
		Widgets.button(row, "REMATCH", { Size = UDim2.fromScale(0.3, 1), BackgroundColor3 = C.red, ZIndex = 42 }, actions.rematch)
	Widgets.button(row, "CHARACTER SELECT", { Size = UDim2.fromScale(0.38, 1), ZIndex = 42 }, actions.select)
	Widgets.button(row, "MAIN MENU", { Size = UDim2.fromScale(0.26, 1), ZIndex = 42 }, actions.menu)
	Transition.slideIn(row, UDim2.fromScale(0, 0.2), 0.3)
	self.status = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.5, 0.05),
		Position = UDim2.fromScale(0.42, 0.77),
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 41,
	})
	return self
end

function ResultsScreen.setStatus(self: any, s: string)
	self.status.Text = s
end

function ResultsScreen.destroy(self: any)
	if self.conn then
		self.conn:Disconnect()
	end
	if self.preview then
		self.preview:destroy()
	end
	self.root:Destroy()
end

return ResultsScreen
