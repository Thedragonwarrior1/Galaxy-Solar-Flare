--!strict
-- Title screen ("MenuController"). A live showcase of two fighters idling and
-- showing off plays in the pixel canvas behind this overlay.
--
--   PLAY  ->  ONLINE 1V1 / VS CPU / 2 PLAYERS (LOCAL) / BACK
--   CHARACTER SELECT
--   TRAINING
--   SETTINGS ->  screen shake, renderer, CPU level, round time

local TweenService = game:GetService("TweenService")
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local Transition = require(script.Parent:WaitForChild("TransitionController"))
local Settings = require(script.Parent.Parent:WaitForChild("Controllers"):WaitForChild("Settings"))
local C = Widgets.Colors

local MainMenu = {}
MainMenu.__index = MainMenu

export type Actions = {
	online: () -> (),
	vsCpu: () -> (),
	versus2p: () -> (),
	inspect: () -> (),
	training: () -> (),
	settingsChanged: (key: string) -> (),
}

local GOLD = Color3.fromRGB(255, 204, 64)
local DIM = Color3.fromRGB(200, 190, 220)

local function entry(self: any, parent: Instance, text: string, order: number, onActivate: () -> ())
	local holder = Instance.new("TextButton")
	holder.Name = text
	holder.AutoButtonColor = false
	holder.BackgroundTransparency = 1
	holder.Text = ""
	holder.Size = UDim2.fromScale(1, 0.16)
	holder.LayoutOrder = order
	holder.ZIndex = 33
	holder.Parent = parent
	local bar = Widgets.frame(holder, {
		Name = "Bar",
		BackgroundColor3 = GOLD,
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.012, 0.7),
		Position = UDim2.fromScale(0, 0.15),
		ZIndex = 34,
	})
	local glow = Widgets.frame(holder, {
		Name = "Glow",
		BackgroundColor3 = Color3.fromRGB(255, 204, 64),
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 0.84),
		Position = UDim2.fromScale(0, 0.08),
		ZIndex = 33,
	})
	local g = Instance.new("UIGradient")
	g.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.55), NumberSequenceKeypoint.new(1, 1) })
	g.Parent = glow
	local label = Widgets.text(holder, text, {
		Name = "Label",
		Size = UDim2.fromScale(0.9, 0.7),
		Position = UDim2.fromScale(0.05, 0.15),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = DIM,
		ZIndex = 35,
	})
	local e = { holder = holder, bar = bar, glow = glow, label = label, activate = onActivate }
	holder.MouseEnter:Connect(function()
		self:select(e)
	end)
	holder.Activated:Connect(function()
		self:select(e)
		onActivate()
	end)
	return e
end

function MainMenu.new(gui: ScreenGui, actions: Actions)
	local root = Widgets.frame(gui, { Name = "MainMenu", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 30 })
	-- vignette + left shade so the menu reads over the live scene
	local vign = Widgets.frame(root, { BackgroundColor3 = Color3.new(0, 0, 0), Size = UDim2.fromScale(1, 1), ZIndex = 30 })
	local vg = Instance.new("UIGradient")
	vg.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.15),
		NumberSequenceKeypoint.new(0.42, 0.75),
		NumberSequenceKeypoint.new(1, 0.55),
	})
	vg.Parent = vign
	local top = Widgets.frame(root, { BackgroundColor3 = Color3.new(0, 0, 0), Size = UDim2.fromScale(1, 0.45), ZIndex = 30 })
	local tg = Instance.new("UIGradient")
	tg.Rotation = 90
	tg.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.25), NumberSequenceKeypoint.new(1, 1) })
	tg.Parent = top

	-- title
	local title = Widgets.text(root, "ONE PIECE", {
		Name = "Title",
		Size = UDim2.fromScale(0.62, 0.2),
		Position = UDim2.fromScale(0.5, 0.05),
		AnchorPoint = Vector2.new(0.5, 0),
		Font = Widgets.TitleFont,
		TextColor3 = Color3.new(1, 1, 1),
		TextStrokeTransparency = 1,
		ZIndex = 36,
	})
	local tgrad = Instance.new("UIGradient")
	tgrad.Rotation = 90
	tgrad.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 244, 170)),
		ColorSequenceKeypoint.new(0.55, Color3.fromRGB(255, 196, 48)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(230, 110, 30)),
	})
	tgrad.Parent = title
	local ts = Instance.new("UIStroke")
	ts.Color = Color3.fromRGB(40, 10, 20)
	ts.Thickness = 4
	ts.Parent = title
	local sub = Widgets.text(root, "P I X E L   F I G H T E R", {
		Name = "Subtitle",
		Size = UDim2.fromScale(0.42, 0.055),
		Position = UDim2.fromScale(0.5, 0.25),
		AnchorPoint = Vector2.new(0.5, 0),
		TextColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 36,
	})
	for _, side in { -1, 1 } do
		Widgets.frame(root, {
			BackgroundColor3 = GOLD,
			Size = UDim2.fromScale(0.12, 0.004),
			Position = UDim2.fromScale(0.5 + side * 0.28, 0.277),
			AnchorPoint = Vector2.new(0.5, 0.5),
			ZIndex = 36,
		})
	end
	Transition.slideIn(title, UDim2.fromScale(0, -0.08), 0.35)
	Transition.slideIn(sub, UDim2.fromScale(0, 0.04), 0.4)

	-- menu list (left)
	local list = Widgets.frame(root, {
		Name = "List",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.3, 0.46),
		Position = UDim2.fromScale(0.05, 0.4),
		ZIndex = 32,
	})
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0.02, 0)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = list
	local self = setmetatable({
		root = root,
		list = list,
		entries = {},
		cursor = 1,
		actions = actions,
		page = "main",
		selected = nil :: any,
		settingsPanel = nil :: any,
		featured = nil :: any,
	}, MainMenu)
	self.featured = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.4, 0.04),
		Position = UDim2.fromScale(0.97, 0.9),
		AnchorPoint = Vector2.new(1, 0),
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = DIM,
		ZIndex = 36,
	})
	Widgets.text(root, "W/S OR MOUSE TO CHOOSE  -  ENTER / 1 TO CONFIRM  -  ESC / 2 BACK", {
		Size = UDim2.fromScale(0.6, 0.03),
		Position = UDim2.fromScale(0.05, 0.94),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(160, 150, 190),
		ZIndex = 36,
	})
	self:showPage("main")
	return self
end

function MainMenu.select(self: any, e: any)
	if self.selected == e then
		return
	end
	if self.selected then
		local o = self.selected
		TweenService:Create(o.label, TweenInfo.new(0.12), { TextColor3 = DIM, Position = UDim2.fromScale(0.05, 0.15) }):Play()
		TweenService:Create(o.bar, TweenInfo.new(0.12), { BackgroundTransparency = 1 }):Play()
		TweenService:Create(o.glow, TweenInfo.new(0.12), { BackgroundTransparency = 1 }):Play()
	end
	self.selected = e
	for i, x in self.entries do
		if x == e then
			self.cursor = i
		end
	end
	TweenService:Create(e.label, TweenInfo.new(0.14, Enum.EasingStyle.Quad), { TextColor3 = GOLD, Position = UDim2.fromScale(0.09, 0.15) })
		:Play()
	TweenService:Create(e.bar, TweenInfo.new(0.14), { BackgroundTransparency = 0 }):Play()
	TweenService:Create(e.glow, TweenInfo.new(0.14), { BackgroundTransparency = 0 }):Play()
end

function MainMenu.showPage(self: any, page: string)
	self.page = page
	for _, e in self.entries do
		e.holder:Destroy()
	end
	self.entries = {}
	self.selected = nil
	local a = self.actions
	local items
	if page == "play" then
		items = {
			{ "ONLINE 1V1", a.online },
			{ "VS CPU", a.vsCpu },
			{ "2 PLAYERS (LOCAL)", a.versus2p },
			{
				"BACK",
				function()
					self:showPage("main")
				end,
			},
		}
	else
		items = {
			{
				"PLAY",
				function()
					self:showPage("play")
				end,
			},
			{ "CHARACTER SELECT", a.inspect },
			{ "TRAINING", a.training },
			{
				"SETTINGS",
				function()
					self:toggleSettings()
				end,
			},
		}
	end
	for i, it in items do
		local e = entry(self, self.list, it[1], i, it[2])
		table.insert(self.entries, e)
		Transition.slideIn(e.holder, UDim2.fromScale(-0.4, 0), 0.16 + i * 0.04)
	end
	self.cursor = 1
	self:select(self.entries[1])
end

function MainMenu.toggleSettings(self: any)
	if self.settingsPanel then
		self.settingsPanel:Destroy()
		self.settingsPanel = nil
		return
	end
	local panel = Widgets.frame(self.root, {
		Name = "Settings",
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.1,
		Size = UDim2.fromScale(0.36, 0.5),
		Position = UDim2.fromScale(0.62, 0.38),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 40,
	})
	Widgets.stroke(panel, GOLD, 2)
	Widgets.text(
		panel,
		"SETTINGS",
		{ Size = UDim2.fromScale(0.9, 0.12), Position = UDim2.fromScale(0.05, 0.03), TextColor3 = GOLD, ZIndex = 41 }
	)
	local rows = Widgets.frame(
		panel,
		{ BackgroundTransparency = 1, Size = UDim2.fromScale(0.9, 0.78), Position = UDim2.fromScale(0.05, 0.18), ZIndex = 41 }
	)
	local l = Instance.new("UIListLayout")
	l.Padding = UDim.new(0.03, 0)
	l.Parent = rows
	local function label(): { string }
		local diff = if Settings.cpuDifficulty < 0.45 then "EASY" elseif Settings.cpuDifficulty > 0.75 then "HARD" else "NORMAL"
		return {
			"SCREEN SHAKE: " .. (if Settings.screenShake then "ON" else "OFF"),
			"RENDERER: " .. (if Settings.renderer == "gui" then "UI FRAMES" else "AUTO"),
			"CPU LEVEL: " .. diff,
			"ROUND TIME: " .. Settings.roundTime,
			"CLOSE",
		}
	end
	local buttons = {}
	local function refresh()
		for i, txt in label() do
			buttons[i].Text = txt
		end
	end
	local handlers = {
		function()
			Settings.set("screenShake", not Settings.screenShake)
			self.actions.settingsChanged("screenShake")
		end,
		function()
			Settings.set("renderer", if Settings.renderer == "gui" then "auto" else "gui")
			self.actions.settingsChanged("renderer")
		end,
		function()
			local d = Settings.cpuDifficulty
			Settings.set("cpuDifficulty", if d < 0.45 then 0.6 elseif d < 0.75 then 0.9 else 0.3)
		end,
		function()
			Settings.set("roundTime", if Settings.roundTime == 99 then 60 else 99)
		end,
		function()
			self:toggleSettings()
		end,
	}
	for i, txt in label() do
		local b = Widgets.button(
			rows,
			txt,
			{ Size = UDim2.fromScale(1, 0.16), ZIndex = 42, TextXAlignment = Enum.TextXAlignment.Left },
			function()
				handlers[i]()
				if self.settingsPanel then
					refresh()
				end
			end
		)
		buttons[i] = b
	end
	self.settingsPanel = panel
	Transition.slideIn(panel, UDim2.fromScale(0.1, 0), 0.2)
end

function MainMenu.setFeatured(self: any, text: string)
	self.featured.Text = text
end

-- keyboard / gamepad navigation
function MainMenu.nav(self: any, edges: number, Input: any)
	if self.settingsPanel then
		if bit32.band(edges, Input.MEDIUM) ~= 0 then
			self:toggleSettings()
		end
		return
	end
	local n = #self.entries
	if n == 0 then
		return
	end
	if bit32.band(edges, Input.UP) ~= 0 then
		self:select(self.entries[(self.cursor - 2) % n + 1])
	elseif bit32.band(edges, Input.DOWN) ~= 0 then
		self:select(self.entries[self.cursor % n + 1])
	elseif bit32.band(edges, Input.LIGHT) ~= 0 then
		self.entries[self.cursor].activate()
	elseif bit32.band(edges, Input.MEDIUM) ~= 0 and self.page ~= "main" then
		self:showPage("main")
	end
end

function MainMenu.destroy(self: any)
	self.root:Destroy()
end

return MainMenu
