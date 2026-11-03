--!strict
-- Arcade character select.
--   * two big animated previews (P1 left, P2 right) with each fighter's idle
--     effects (steam, bouncing, laughing floor, strings, sparks, mochi)
--   * name, title, style, POWER / SPEED / RANGE ratings, description
--   * roster strip of seven pixel portraits; the highlighted card pops
--   * stage select, move list with frame data
-- Modes:
--   "versus"   P1 picks, then P2 (P2 keys or P1); P2 = HUMAN or CPU
--   "training" P1 picks a fighter and a dummy
--   "online"   P1 picks, then the server finds an opponent
--   "inspect"  browse; previews cycle through each fighter's attacks

local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local CharacterData = require(Shared:WaitForChild("CharacterData"))
local AttackDefinitions = require(Shared:WaitForChild("AttackDefinitions"))
local Input = require(Shared:WaitForChild("Sim"):WaitForChild("Input"))
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local Transition = require(script.Parent:WaitForChild("TransitionController"))
local Preview = require(script.Parent:WaitForChild("CharacterPreviewController"))
local Render = script.Parent.Parent:WaitForChild("Render")
local Canvas = require(Render:WaitForChild("Canvas"))
local Raster = require(Render:WaitForChild("Raster"))
local SpriteLibrary = require(Render:WaitForChild("SpriteLibrary"))
local Stage = require(Render:WaitForChild("Stage"))
local InputController = require(script.Parent.Parent:WaitForChild("Controllers"):WaitForChild("InputController"))

local C = Widgets.Colors
local CharacterSelect = {}
CharacterSelect.__index = CharacterSelect

local GOLD = Color3.fromRGB(255, 204, 64)
local SHOWREEL = { "StandLight", "StandMedium", "StandHeavy", "CrouchHeavy", "AirHeavy", "Special", "Super", "Victory" }
local INPUT_NAMES = {
	StandLight = "1",
	StandMedium = "2",
	StandHeavy = "3",
	CrouchLight = "S+1",
	CrouchMedium = "S+2",
	CrouchHeavy = "S+3",
	AirLight = "air 1",
	AirMedium = "air 2",
	AirHeavy = "air 3",
	Special = "4",
	Special2 = "S+4",
	Super = "F (100%)",
	Counter = "(auto)",
}
local MOVE_ORDER = {
	"StandLight",
	"StandMedium",
	"StandHeavy",
	"CrouchLight",
	"CrouchMedium",
	"CrouchHeavy",
	"AirLight",
	"AirMedium",
	"AirHeavy",
	"Special",
	"Special2",
	"Counter",
	"Super",
}

export type Options = {
	mode: string,
	onConfirm: (p1: string, p2: string, stage: string, p2Human: boolean) -> (),
	onBack: () -> (),
	initial: { string }?,
}

local function statBar(parent: Instance, label: string, y: number, color: Color3)
	Widgets.text(parent, label, {
		Size = UDim2.fromScale(0.3, 0.05),
		Position = UDim2.fromScale(0.04, y),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(200, 190, 220),
		ZIndex = 4,
	})
	local pips = {}
	for k = 1, 5 do
		local p = Widgets.frame(parent, {
			Size = UDim2.fromScale(0.1, 0.035),
			Position = UDim2.fromScale(0.36 + (k - 1) * 0.115, y + 0.008),
			BackgroundColor3 = C.ink,
			ZIndex = 4,
		})
		Widgets.stroke(p, Color3.fromRGB(90, 70, 120), 1)
		table.insert(pips, p)
	end
	return { pips = pips, color = color }
end

local function panel(root: Frame, slot: number)
	local left = slot == 1
	local tint = if left then C.p1 else C.p2
	local box = Widgets.frame(root, {
		Name = "Panel" .. slot,
		Size = UDim2.fromScale(0.3, 0.66),
		Position = if left then UDim2.fromScale(0.02, 0.11) else UDim2.fromScale(0.98, 0.11),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		BackgroundColor3 = Color3.fromRGB(22, 14, 36),
		ZIndex = 2,
	})
	Widgets.stroke(box, tint, 3)
	local art = Widgets.frame(box, {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 0.56),
		Position = UDim2.fromScale(0.5, 0),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 3,
	})
	Widgets.aspect(art, 170 / 150)
	local glow = if left then { 140, 50, 70 } else { 50, 90, 160 }
	local pv = Preview.new(art, { w = 170, h = 150, backdrop = { 28, 18, 46 }, glow = glow })
	if pv.cv then
		pv.cv.label.ZIndex = 3
	end
	local tag = Widgets.text(box, if left then "P1" else "P2", {
		Size = UDim2.fromScale(0.22, 0.06),
		Position = UDim2.fromScale(0.03, 0.01),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = tint,
		ZIndex = 5,
	})
	local name = Widgets.text(box, "", {
		Size = UDim2.fromScale(0.92, 0.08),
		Position = UDim2.fromScale(0.04, 0.57),
		TextXAlignment = Enum.TextXAlignment.Left,
		Font = Widgets.TitleFont,
		TextColor3 = GOLD,
		ZIndex = 4,
	})
	local sub = Widgets.text(box, "", {
		Size = UDim2.fromScale(0.6, 0.045),
		Position = UDim2.fromScale(0.04, 0.65),
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 4,
	})
	local style = Widgets.text(box, "", {
		Size = UDim2.fromScale(0.34, 0.045),
		Position = UDim2.fromScale(0.96, 0.65),
		AnchorPoint = Vector2.new(1, 0),
		BackgroundColor3 = tint,
		BackgroundTransparency = 0,
		TextColor3 = C.white,
		ZIndex = 4,
	})
	local bars = {
		statBar(box, "POWER", 0.71, Color3.fromRGB(255, 110, 70)),
		statBar(box, "SPEED", 0.765, Color3.fromRGB(110, 230, 140)),
		statBar(box, "RANGE", 0.82, Color3.fromRGB(110, 180, 255)),
	}
	local desc = Widgets.text(box, "", {
		Size = UDim2.fromScale(0.92, 0.11),
		Position = UDim2.fromScale(0.04, 0.875),
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		Font = Enum.Font.GothamBold,
		TextStrokeTransparency = 1,
		TextColor3 = Color3.fromRGB(220, 214, 236),
		ZIndex = 4,
	})
	local moveLabel = Widgets.text(box, "", {
		Size = UDim2.fromScale(0.9, 0.045),
		Position = UDim2.fromScale(0.05, 0.505),
		TextColor3 = C.meterFull,
		ZIndex = 5,
	})
	return {
		box = box,
		preview = pv,
		tag = tag,
		name = name,
		sub = sub,
		style = style,
		bars = bars,
		desc = desc,
		moveLabel = moveLabel,
		char = "",
		idleWait = 0,
	}
end

function CharacterSelect.new(gui: ScreenGui, opts: Options)
	local root = Widgets.frame(
		gui,
		{ Name = "CharacterSelect", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(14, 8, 26), ZIndex = 1 }
	)
	local g = Instance.new("UIGradient")
	g.Rotation = 115
	g.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(80, 26, 50)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(18, 10, 34)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(20, 40, 80)),
	})
	g.Parent = root
	for k = 0, 5 do
		Widgets.frame(root, {
			Name = "Stripe",
			BackgroundColor3 = Color3.fromRGB(255, 255, 255),
			BackgroundTransparency = 0.96,
			Size = UDim2.fromScale(0.04, 2),
			Position = UDim2.fromScale(0.1 + k * 0.17, -0.5),
			Rotation = 25,
			ZIndex = 1,
		})
	end

	local self = setmetatable({
		root = root,
		opts = opts,
		mode = opts.mode,
		cursor = { 1, 2 },
		phase = "p1",
		picked = { "", "" },
		p2Human = false,
		stageIndex = 1,
		cards = {},
		panels = {},
		conn = nil :: RBXScriptConnection?,
		showMoves = false,
		smallCanvases = {},
		statusText = "",
	}, CharacterSelect)

	local header = Widgets.frame(
		root,
		{ BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.35, Size = UDim2.fromScale(1, 0.09), ZIndex = 2 }
	)
	local titles = {
		versus = "LOCAL MATCH  -  SELECT YOUR FIGHTERS",
		training = "TRAINING  -  FIGHTER AND DUMMY",
		online = "ONLINE 1V1  -  SELECT YOUR FIGHTER",
		inspect = "CHARACTER SELECT",
	}
	Widgets.text(header, titles[opts.mode] or "SELECT YOUR FIGHTER", {
		Size = UDim2.fromScale(0.8, 0.7),
		Position = UDim2.fromScale(0.5, 0.15),
		AnchorPoint = Vector2.new(0.5, 0),
		Font = Widgets.TitleFont,
		TextColor3 = GOLD,
		ZIndex = 3,
	})
	Widgets.frame(header, { BackgroundColor3 = GOLD, Size = UDim2.fromScale(1, 0.05), Position = UDim2.fromScale(0, 0.95), ZIndex = 3 })

	self.panels[1] = panel(root, 1)
	self.panels[2] = panel(root, 2)

	local vs = Widgets.text(root, "VS", {
		Size = UDim2.fromScale(0.16, 0.16),
		Position = UDim2.fromScale(0.5, 0.3),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Font = Widgets.TitleFont,
		TextColor3 = Color3.fromRGB(255, 90, 90),
		ZIndex = 3,
	})
	local vstroke = Instance.new("UIStroke")
	vstroke.Thickness = 3
	vstroke.Color = Color3.fromRGB(30, 8, 16)
	vstroke.Parent = vs
	self.vs = vs
	self.stageLabel = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.24, 0.045),
		Position = UDim2.fromScale(0.5, 0.47),
		AnchorPoint = Vector2.new(0.5, 0),
		TextColor3 = GOLD,
		ZIndex = 3,
	})
	Widgets.button(root, "<", { Size = UDim2.fromScale(0.035, 0.05), Position = UDim2.fromScale(0.345, 0.465), ZIndex = 3 }, function()
		self:cycleStage(-1)
	end)
	Widgets.button(root, ">", { Size = UDim2.fromScale(0.035, 0.05), Position = UDim2.fromScale(0.62, 0.465), ZIndex = 3 }, function()
		self:cycleStage(1)
	end)
	self.status = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.34, 0.04),
		Position = UDim2.fromScale(0.5, 0.55),
		AnchorPoint = Vector2.new(0.5, 0),
		TextWrapped = true,
		ZIndex = 3,
	})

	local strip = Widgets.frame(root, {
		Name = "Roster",
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		Size = UDim2.fromScale(0.96, 0.15),
		Position = UDim2.fromScale(0.02, 0.785),
		ZIndex = 2,
	})
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	layout.VerticalAlignment = Enum.VerticalAlignment.Center
	layout.Padding = UDim.new(0.008, 0)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = strip
	for i, id in CharacterData.Order do
		local cfg = CharacterData.get(id).config
		local card = Instance.new("TextButton")
		card.Name = id
		card.LayoutOrder = i
		card.Text = ""
		card.AutoButtonColor = false
		card.BackgroundColor3 = Color3.fromRGB(40, 28, 64)
		card.BorderSizePixel = 0
		card.Size = UDim2.fromScale(0.13, 0.9)
		card.ZIndex = 3
		card.Parent = strip
		local cg = Instance.new("UIGradient")
		cg.Rotation = 90
		cg.Color = ColorSequence.new(Color3.fromRGB(80, 60, 120), Color3.fromRGB(30, 20, 46))
		cg.Parent = card
		local stroke = Widgets.stroke(card, C.ink, 2)
		local art = Widgets.frame(card, {
			BackgroundTransparency = 1,
			Size = UDim2.fromScale(0.62, 0.78),
			Position = UDim2.fromScale(0.5, 0.02),
			AnchorPoint = Vector2.new(0.5, 0),
			ZIndex = 4,
		})
		Widgets.aspect(art, 44 / 40)
		local cs = SpriteLibrary.get(id)
		local pc = Canvas.small(art, cs.portrait.w, cs.portrait.h)
		if pc then
			pc.label.ZIndex = 4
			if pc.R.begin then
				pc.R.begin(pc.surface)
			end
			pc.R.fill(pc.surface, Raster.rgb(52, 38, 82))
			pc.R.sprite(pc.surface, cs.portrait, 0, 0, 1, cs.palettes[1])
			pc.present()
			table.insert(self.smallCanvases, pc)
		end
		local short = cfg.DisplayName
		if string.sub(id, 1, 5) == "Luffy" then
			short = cfg.DisplayName .. " " .. (string.gsub(cfg.Subtitle, "GEAR ", "G"))
		end
		Widgets.text(card, short, { Size = UDim2.fromScale(0.96, 0.18), Position = UDim2.fromScale(0.02, 0.8), ZIndex = 4 })
		local tagP1 = Widgets.text(card, "P1", {
			Size = UDim2.fromScale(0.35, 0.2),
			Position = UDim2.fromScale(0.02, -0.02),
			TextColor3 = C.p1,
			Visible = false,
			ZIndex = 6,
		})
		local tagP2 = Widgets.text(card, "P2", {
			Size = UDim2.fromScale(0.35, 0.2),
			Position = UDim2.fromScale(0.63, -0.02),
			TextColor3 = C.p2,
			Visible = false,
			ZIndex = 6,
		})
		card.MouseEnter:Connect(function()
			self:moveCursorTo(i)
		end)
		card.Activated:Connect(function()
			self:moveCursorTo(i)
			self:confirm()
		end)
		self.cards[i] = { card = card, stroke = stroke, p1 = tagP1, p2 = tagP2 }
	end

	local actions = Widgets.frame(root, {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.36, 0.06),
		Position = UDim2.fromScale(0.5, 0.63),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 3,
	})
	local al = Instance.new("UIListLayout")
	al.FillDirection = Enum.FillDirection.Horizontal
	al.HorizontalAlignment = Enum.HorizontalAlignment.Center
	al.Padding = UDim.new(0.02, 0)
	al.Parent = actions
	Widgets.button(actions, "BACK", { Size = UDim2.fromScale(0.22, 1), ZIndex = 4 }, function()
		self:back()
	end)
	self.moveBtn = Widgets.button(actions, "MOVES", { Size = UDim2.fromScale(0.22, 1), ZIndex = 4 }, function()
		self:toggleMoves()
	end)
	if opts.mode == "versus" then
		self.p2Btn = Widgets.button(actions, "P2: CPU", { Size = UDim2.fromScale(0.26, 1), ZIndex = 4 }, function()
			self.p2Human = not self.p2Human
			self.p2Btn.Text = if self.p2Human then "P2: HUMAN" else "P2: CPU"
			self:refresh()
		end)
	end
	self.goBtn = Widgets.button(
		actions,
		if opts.mode == "online" then "FIND MATCH" elseif opts.mode == "inspect" then "TRAIN" else "FIGHT!",
		{
			Size = UDim2.fromScale(0.28, 1),
			BackgroundColor3 = C.red,
			ZIndex = 4,
		},
		function()
			self:confirm(true)
		end
	)

	self.movePanel = Widgets.frame(root, {
		Visible = false,
		Size = UDim2.fromScale(0.36, 0.5),
		Position = UDim2.fromScale(0.5, 0.12),
		AnchorPoint = Vector2.new(0.5, 0),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.05,
		ZIndex = 20,
	})
	Widgets.stroke(self.movePanel, GOLD, 2)
	self.moveText = Widgets.text(self.movePanel, "", {
		Size = UDim2.fromScale(0.96, 0.96),
		Position = UDim2.fromScale(0.02, 0.02),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		Font = Enum.Font.Code,
		TextStrokeTransparency = 1,
		ZIndex = 21,
	})

	if opts.initial then
		for s = 1, 2 do
			for i, id in CharacterData.Order do
				if id == opts.initial[s] then
					self.cursor[s] = i
				end
			end
		end
	end
	if opts.mode == "inspect" then
		-- browse mode: the move list docks on the right instead of a second fighter
		self.vs.Visible = false
		self.showMoves = true
		self.movePanel.Visible = true
		self.movePanel.Size = UDim2.fromScale(0.62, 0.34)
		self.movePanel.Position = UDim2.fromScale(0.66, 0.11)
	elseif opts.mode == "online" then
		self.vs.Visible = false
	end
	self:refresh()
	Transition.slideIn(self.panels[1].box, UDim2.fromScale(-0.3, 0), 0.25)
	Transition.slideIn(self.panels[2].box, UDim2.fromScale(0.3, 0), 0.25)
	Transition.slideIn(strip, UDim2.fromScale(0, 0.2), 0.3)
	self.conn = RunService.RenderStepped:Connect(function(dt)
		self:step(dt)
	end)
	return self
end

function CharacterSelect.activeSlot(self: any): number
	return if self.phase == "p2" then 2 else 1
end

function CharacterSelect.moveCursorTo(self: any, i: number)
	if self.phase == "done" then
		return
	end
	local slot = self:activeSlot()
	if self.cursor[slot] ~= i then
		self.cursor[slot] = i
		Transition.pop(self.cards[i].card, 0.12)
		self:refresh()
	end
end

function CharacterSelect.cycleStage(self: any, d: number)
	self.stageIndex = (self.stageIndex - 1 + d) % #Stage.List + 1
	self:refresh()
end

function CharacterSelect.toggleMoves(self: any)
	if self.mode == "inspect" then
		return
	end
	self.showMoves = not self.showMoves
	self.movePanel.Visible = self.showMoves
	self:refresh()
end

function CharacterSelect.back(self: any)
	if self.phase == "p2" then
		self.phase = "p1"
		self.picked[1] = ""
		self:refresh()
		return
	end
	self.opts.onBack()
end

function CharacterSelect.confirm(self: any, fromButton: boolean?)
	local mode = self.mode
	if self.phase == "done" then
		return
	end
	local slot = self:activeSlot()
	self.picked[slot] = CharacterData.Order[self.cursor[slot]]
	self.panels[slot].preview:play({ "Victory" })
	Transition.pop(self.panels[slot].box, 0.05)
	if mode == "online" or mode == "inspect" then
		self.phase = "done"
		local opp = CharacterData.Order[self.cursor[2]]
		self.opts.onConfirm(self.picked[1], opp, Stage.List[self.stageIndex], false)
		return
	end
	if slot == 1 then
		if fromButton then
			self.picked[2] = CharacterData.Order[self.cursor[2]]
			self.phase = "done"
			self.opts.onConfirm(self.picked[1], self.picked[2], Stage.List[self.stageIndex], self.p2Human)
			return
		end
		self.phase = "p2"
		self:refresh()
		return
	end
	self.phase = "done"
	self.opts.onConfirm(self.picked[1], self.picked[2], Stage.List[self.stageIndex], self.p2Human)
end

function CharacterSelect.setStatus(self: any, text: string)
	self.statusText = text
	self.status.Text = text
end

function CharacterSelect.refresh(self: any)
	local solo = self.mode == "inspect" or self.mode == "online"
	for i, c in self.cards do
		local p1 = self.cursor[1] == i
		local p2 = self.cursor[2] == i and not solo
		c.stroke.Color = if p1 and p2 then GOLD elseif p1 then C.p1 elseif p2 then C.p2 else C.ink
		c.stroke.Thickness = if p1 or p2 then 4 else 2
		c.p1.Visible = p1
		c.p2.Visible = p2
		TweenService:Create(c.card, TweenInfo.new(0.12), {
			BackgroundColor3 = if p1 or p2 then Color3.fromRGB(90, 60, 130) else Color3.fromRGB(40, 28, 64),
		}):Play()
	end
	local stageName = Stage.List[self.stageIndex]
	self.stageLabel.Text = "STAGE: " .. string.upper(if stageName == "SkyIsland" then "SKY ISLAND" else stageName)
	local hints = {
		versus = if self.phase == "p1" then "P1: PICK WITH A/D + 1  (OR CLICK)" else "P2: PICK WITH ARROWS + N  (OR P1 KEYS)",
		training = if self.phase == "p1" then "PICK YOUR FIGHTER" else "PICK THE TRAINING DUMMY",
		online = "PICK YOUR FIGHTER, THEN FIND MATCH",
		inspect = "BROWSE THE ROSTER - PREVIEWS SHOW EACH FIGHTER'S MOVES",
	}
	if self.phase ~= "done" or self.statusText == "" then
		self.status.Text = hints[self.mode] or ""
	end
	for s = 1, 2 do
		local pn = self.panels[s]
		local id = CharacterData.Order[self.cursor[s]]
		local cfg = CharacterData.get(id).config
		if pn.char ~= id then
			pn.char = id
			local mirror = s == 2 and self.cursor[1] == self.cursor[2]
			pn.preview:set(id, if mirror then 1 else 0, if s == 1 then 1 else -1)
			if self.mode == "inspect" then
				pn.preview:play(SHOWREEL)
			end
			Transition.pop(pn.name, 0.15)
		end
		pn.name.Text = cfg.DisplayName
		pn.sub.Text = cfg.Subtitle
		pn.style.Text = cfg.Style
		pn.desc.Text = cfg.Description
		local r = cfg.Ratings or { Power = 3, Speed = 3, Range = 3 }
		for b, v in { r.Power, r.Speed, r.Range } do
			for k, pip in pn.bars[b].pips do
				pip.BackgroundColor3 = if k <= v then pn.bars[b].color else C.ink
			end
		end
		if s == 2 then
			pn.tag.Text = if self.mode == "training" then "DUMMY" elseif self.p2Human then "P2" else "CPU"
			pn.box.Visible = not solo
		end
	end
	if self.showMoves then
		local id = CharacterData.Order[self.cursor[self:activeSlot()]]
		local c = CharacterData.get(id)
		local lines = { c.config.DisplayName .. " " .. c.config.Subtitle .. "   startup/active/recovery  dmg  hit/block", "" }
		for _, mid in MOVE_ORDER do
			local m = c.moves[mid]
			if m then
				local hit, blk = AttackDefinitions.advantage(m)
				table.insert(
					lines,
					string.format(
						"%-8s %-21s %2d/%2d/%2d %4d  %+d/%+d%s",
						INPUT_NAMES[mid] or mid,
						m.name,
						m.startup,
						m.active,
						m.recovery,
						m.damage * (if m.multi then m.multi.count else 1),
						hit,
						blk,
						if m.height == "low" then " LOW" elseif m.height == "high" then " OVERHEAD" else ""
					)
				)
			end
		end
		self.moveText.Text = table.concat(lines, "\n")
	end
end

local function nav(self: any, edges: number)
	if self.phase == "done" then
		return
	end
	local slot = self:activeSlot()
	local i = self.cursor[slot]
	local n = #CharacterData.Order
	if bit32.band(edges, Input.LEFT) ~= 0 then
		i = (i - 2) % n + 1
	elseif bit32.band(edges, Input.RIGHT) ~= 0 then
		i = i % n + 1
	end
	if i ~= self.cursor[slot] then
		self:moveCursorTo(i)
	end
	if bit32.band(edges, Input.LIGHT) ~= 0 then
		self:confirm()
	elseif bit32.band(edges, Input.MEDIUM) ~= 0 then
		self:back()
	elseif bit32.band(edges, Input.SPECIAL) ~= 0 then
		self:toggleMoves()
	elseif bit32.band(edges, Input.HEAVY) ~= 0 or bit32.band(edges, Input.UP) ~= 0 then
		self:cycleStage(1)
	elseif bit32.band(edges, Input.DOWN) ~= 0 then
		self:cycleStage(-1)
	end
end

function CharacterSelect.step(self: any, dt: number)
	nav(self, InputController.takeMenu())
	for s = 1, 2 do
		local pn = self.panels[s]
		if pn.box.Visible then
			pn.preview:step(dt)
			local mv = CharacterData.get(pn.char).moves[pn.preview.anim]
			pn.moveLabel.Text = if self.mode == "inspect" and pn.preview.anim ~= "Idle"
				then string.upper(if mv then mv.name else pn.preview.anim)
				else ""
			if self.mode == "inspect" and pn.preview.anim == "Idle" and #pn.preview.queue == 0 then
				pn.idleWait += dt
				if pn.idleWait > 2.5 then
					pn.idleWait = 0
					pn.preview:play(SHOWREEL)
				end
			end
		end
	end
	self.vs.Rotation = math.sin(os.clock() * 2) * 3
end

function CharacterSelect.destroy(self: any)
	if self.conn then
		self.conn:Disconnect()
	end
	for _, c in self.smallCanvases do
		c.destroy()
	end
	for _, p in self.panels do
		p.preview:destroy()
	end
	self.root:Destroy()
end

return CharacterSelect
