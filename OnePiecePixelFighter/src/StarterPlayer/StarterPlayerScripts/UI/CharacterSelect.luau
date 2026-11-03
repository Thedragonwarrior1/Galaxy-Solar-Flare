--!strict
-- Arcade character select: seven portrait slots, two big animated previews,
-- fighting-style descriptions, a move list with frame data, and stage select.
--
-- Modes:
--   "versus"   (Local Test Match) P1 picks, then P2 (P2 keys or P1) picks; P2 = HUMAN or CPU
--   "training" P1 picks a fighter and a dummy
--   "online"   P1 picks, then the server finds an opponent
--   "inspect"  browse fighters; previews cycle through their attack animations

local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local CharacterData = require(Shared:WaitForChild("CharacterData"))
local AttackDefinitions = require(Shared:WaitForChild("AttackDefinitions"))
local Input = require(Shared:WaitForChild("Sim"):WaitForChild("Input"))
local Timeline = require(Shared:WaitForChild("Sim"):WaitForChild("Timeline"))
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local Render = script.Parent.Parent:WaitForChild("Render")
local Canvas = require(Render:WaitForChild("Canvas"))
local Raster = require(Render:WaitForChild("Raster"))
local SpriteLibrary = require(Render:WaitForChild("SpriteLibrary"))
local Stage = require(Render:WaitForChild("Stage"))
local InputController = require(script.Parent.Parent:WaitForChild("Controllers"):WaitForChild("InputController"))

local C = Widgets.Colors
local CharacterSelect = {}
CharacterSelect.__index = CharacterSelect

local PREVIEW_W, PREVIEW_H = 170, 150
local CYCLE = { "Idle", "Walk", "StandLight", "StandMedium", "StandHeavy", "CrouchHeavy", "AirHeavy", "Special", "Super", "Victory" }
local INPUT_NAMES = {
	StandLight = "J", StandMedium = "K", StandHeavy = "L",
	CrouchLight = "S+J", CrouchMedium = "S+K", CrouchHeavy = "S+L",
	AirLight = "air J", AirMedium = "air K", AirHeavy = "air L",
	Special = "U", Special2 = "S+U", Super = "I (100%)", Counter = "(auto)",
}
local MOVE_ORDER = { "StandLight", "StandMedium", "StandHeavy", "CrouchLight", "CrouchMedium", "CrouchHeavy",
	"AirLight", "AirMedium", "AirHeavy", "Special", "Special2", "Counter", "Super" }

export type Options = {
	mode: string,
	onConfirm: (p1: string, p2: string, stage: string, p2Human: boolean) -> (),
	onBack: () -> (),
	initial: { string }?,
}

local function preview(parent: Frame, slot: number)
	local box = Widgets.frame(parent, {
		Name = "Preview" .. slot,
		Size = UDim2.fromScale(0.3, 0.6),
		Position = if slot == 1 then UDim2.fromScale(0.02, 0.14) else UDim2.fromScale(0.98, 0.14),
		AnchorPoint = if slot == 1 then Vector2.new(0, 0) else Vector2.new(1, 0),
		BackgroundColor3 = C.panel,
		ZIndex = 2,
	})
	Widgets.stroke(box, if slot == 1 then C.p1 else C.p2, 3)
	local art = Widgets.frame(box, {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 0.56),
		Position = UDim2.fromScale(0.5, 0),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 3,
	})
	Widgets.aspect(art, PREVIEW_W / PREVIEW_H)
	local cv = Canvas.small(art, PREVIEW_W, PREVIEW_H)
	if cv then
		cv.label.ZIndex = 3
	end
	local name = Widgets.text(box, "", { Size = UDim2.fromScale(0.94, 0.08), Position = UDim2.fromScale(0.03, 0.62), Font = Widgets.TitleFont, TextColor3 = C.gold, ZIndex = 3 })
	local sub = Widgets.text(box, "", { Size = UDim2.fromScale(0.94, 0.05), Position = UDim2.fromScale(0.03, 0.70), ZIndex = 3 })
	local style = Widgets.text(box, "", { Size = UDim2.fromScale(0.94, 0.05), Position = UDim2.fromScale(0.03, 0.76), TextColor3 = if slot == 1 then C.p1 else C.p2, ZIndex = 3 })
	local desc = Widgets.text(box, "", {
		Size = UDim2.fromScale(0.94, 0.16),
		Position = UDim2.fromScale(0.03, 0.82),
		TextWrapped = true,
		TextScaled = true,
		Font = Enum.Font.GothamBold,
		TextStrokeTransparency = 1,
		ZIndex = 3,
	})
	local tag = Widgets.text(box, if slot == 1 then "P1" else "P2", {
		Size = UDim2.fromScale(0.2, 0.07),
		Position = UDim2.fromScale(0.02, 0.01),
		TextColor3 = if slot == 1 then C.p1 else C.p2,
		ZIndex = 4,
	})
	local moveLabel = Widgets.text(box, "", { Size = UDim2.fromScale(0.96, 0.05), Position = UDim2.fromScale(0.02, 0.56), ZIndex = 4, TextColor3 = C.meterFull })
	return { box = box, canvas = cv, name = name, sub = sub, style = style, desc = desc, tag = tag, moveLabel = moveLabel, t = 0, cycle = 1, cycleT = 0, char = "" }
end

function CharacterSelect.new(gui: ScreenGui, opts: Options)
	local root = Widgets.frame(gui, {
		Name = "CharacterSelect",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(16, 10, 28),
		ZIndex = 1,
	})
	local g = Instance.new("UIGradient")
	g.Rotation = 90
	g.Color = ColorSequence.new(Color3.fromRGB(70, 30, 70), Color3.fromRGB(14, 10, 30))
	g.Parent = root

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
		previews = {},
		conn = nil :: RBXScriptConnection?,
		showMoves = false,
		smallCanvases = {},
	}, CharacterSelect)

	local titles = {
		versus = "LOCAL TEST MATCH",
		training = "TRAINING - CHOOSE FIGHTER AND DUMMY",
		online = "ONLINE 1V1 - CHOOSE YOUR FIGHTER",
		inspect = "CHARACTER SELECT",
	}
	Widgets.text(root, titles[opts.mode] or "SELECT YOUR FIGHTER", {
		Size = UDim2.fromScale(0.9, 0.08),
		Position = UDim2.fromScale(0.05, 0.02),
		Font = Widgets.TitleFont,
		TextColor3 = C.gold,
		ZIndex = 2,
	})
	self.previews[1] = preview(root, 1)
	self.previews[2] = preview(root, 2)

	-- roster grid (centre)
	local grid = Widgets.frame(root, {
		Name = "Roster",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.34, 0.6),
		Position = UDim2.fromScale(0.5, 0.14),
		AnchorPoint = Vector2.new(0.5, 0),
		ZIndex = 2,
	})
	local layout = Instance.new("UIGridLayout")
	layout.CellSize = UDim2.fromScale(0.31, 0.3)
	layout.CellPadding = UDim2.fromScale(0.03, 0.03)
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = grid
	for i, id in CharacterData.Order do
		local cfg = CharacterData.get(id).config
		local card = Instance.new("TextButton")
		card.Name = id
		card.LayoutOrder = i
		card.Text = ""
		card.AutoButtonColor = false
		card.BackgroundColor3 = C.panel
		card.BorderSizePixel = 0
		card.ZIndex = 2
		card.Parent = grid
		local stroke = Widgets.stroke(card, C.ink, 3)
		local art = Widgets.frame(card, { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 0.78), ZIndex = 3 })
		local cs = SpriteLibrary.get(id)
		local pc = Canvas.small(art, cs.portrait.w, cs.portrait.h)
		if pc then
			pc.label.ZIndex = 3
			Raster.fill(pc.surface, Raster.rgb(48, 34, 74))
			Raster.sprite(pc.surface, cs.portrait, 0, 0, 1, cs.palettes[1])
			pc.present()
			table.insert(self.smallCanvases, pc)
		end
		Widgets.text(card, cfg.DisplayName, { Size = UDim2.fromScale(1, 0.11), Position = UDim2.fromScale(0, 0.78), ZIndex = 3 })
		Widgets.text(card, cfg.Subtitle, { Size = UDim2.fromScale(1, 0.1), Position = UDim2.fromScale(0, 0.89), TextColor3 = C.gold, ZIndex = 3 })
		card.MouseEnter:Connect(function()
			self:moveCursorTo(i)
		end)
		card.Activated:Connect(function()
			self:moveCursorTo(i)
			self:confirm()
		end)
		self.cards[i] = { card = card, stroke = stroke }
	end

	-- stage select + actions (bottom)
	local bottom = Widgets.frame(root, {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.96, 0.2),
		Position = UDim2.fromScale(0.02, 0.77),
		ZIndex = 2,
	})
	self.stageLabel = Widgets.text(bottom, "", { Size = UDim2.fromScale(0.3, 0.3), Position = UDim2.fromScale(0.35, 0), TextColor3 = C.gold, ZIndex = 3 })
	Widgets.button(bottom, "<", { Size = UDim2.fromScale(0.05, 0.3), Position = UDim2.fromScale(0.29, 0), ZIndex = 3 }, function()
		self:cycleStage(-1)
	end)
	Widgets.button(bottom, ">", { Size = UDim2.fromScale(0.05, 0.3), Position = UDim2.fromScale(0.66, 0), ZIndex = 3 }, function()
		self:cycleStage(1)
	end)
	self.status = Widgets.text(bottom, "", { Size = UDim2.fromScale(0.6, 0.22), Position = UDim2.fromScale(0.2, 0.36), ZIndex = 3 })
	Widgets.button(bottom, "BACK", { Size = UDim2.fromScale(0.14, 0.3), Position = UDim2.fromScale(0.0, 0.66), ZIndex = 3 }, function()
		self:back()
	end)
	self.moveBtn = Widgets.button(bottom, "MOVE LIST", { Size = UDim2.fromScale(0.18, 0.3), Position = UDim2.fromScale(0.41, 0.66), ZIndex = 3 }, function()
		self:toggleMoves()
	end)
	if opts.mode == "versus" then
		self.p2Btn = Widgets.button(bottom, "P2: CPU", { Size = UDim2.fromScale(0.16, 0.3), Position = UDim2.fromScale(0.62, 0.66), ZIndex = 3 }, function()
			self.p2Human = not self.p2Human
			self.p2Btn.Text = if self.p2Human then "P2: HUMAN" else "P2: CPU"
		end)
	end
	self.goBtn = Widgets.button(bottom, if opts.mode == "online" then "FIND MATCH" elseif opts.mode == "inspect" then "TRAIN" else "FIGHT!", {
		Size = UDim2.fromScale(0.18, 0.3),
		Position = UDim2.fromScale(0.82, 0.66),
		BackgroundColor3 = C.red,
		ZIndex = 3,
	}, function()
		self:confirm(true)
	end)
	-- move list panel
	self.movePanel = Widgets.frame(root, {
		Visible = false,
		Size = UDim2.fromScale(0.34, 0.6),
		Position = UDim2.fromScale(0.5, 0.14),
		AnchorPoint = Vector2.new(0.5, 0),
		BackgroundColor3 = C.ink,
		ZIndex = 20,
	})
	Widgets.stroke(self.movePanel, C.gold, 2)
	self.moveText = Widgets.text(self.movePanel, "", {
		Size = UDim2.fromScale(0.96, 0.96),
		Position = UDim2.fromScale(0.02, 0.02),
		TextScaled = true,
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
	for s = 1, 2 do
		local id = CharacterData.Order[self.cursor[s]]
		task.spawn(SpriteLibrary.preload, id)
	end
	self:refresh()
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
	self.cursor[self:activeSlot()] = i
	self:refresh()
end

function CharacterSelect.cycleStage(self: any, d: number)
	self.stageIndex = (self.stageIndex - 1 + d) % #Stage.List + 1
	self:refresh()
end

function CharacterSelect.toggleMoves(self: any)
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
	if mode == "online" or mode == "inspect" then
		self.phase = "done"
		local opp = CharacterData.Order[self.cursor[2]]
		self.opts.onConfirm(self.picked[1], opp, Stage.List[self.stageIndex], false)
		return
	end
	if slot == 1 then
		self.phase = "p2"
		if fromButton then
			-- the FIGHT button skips straight to the fight with the current P2 cursor
			self.picked[2] = CharacterData.Order[self.cursor[2]]
			self.phase = "done"
			self.opts.onConfirm(self.picked[1], self.picked[2], Stage.List[self.stageIndex], self.p2Human)
			return
		end
		self:refresh()
		return
	end
	self.phase = "done"
	self.opts.onConfirm(self.picked[1], self.picked[2], Stage.List[self.stageIndex], self.p2Human)
end

function CharacterSelect.setStatus(self: any, text: string)
	self.status.Text = text
end

function CharacterSelect.refresh(self: any)
	local cols = 3
	for i, c in self.cards do
		local p1 = self.cursor[1] == i
		local p2 = self.cursor[2] == i
		c.stroke.Color = if p1 and p2 then C.gold elseif p1 then C.p1 elseif p2 then C.p2 else C.ink
		c.stroke.Thickness = if p1 or p2 then 4 else 2
	end
	local stageName = Stage.List[self.stageIndex]
	self.stageLabel.Text = "STAGE: " .. string.upper(stageName == "SkyIsland" and "SKY ISLAND" or stageName)
	local hints = {
		versus = if self.phase == "p1" then "P1: A/D/W/S + J to pick" else "P2: arrows + N (or P1 keys) to pick",
		training = if self.phase == "p1" then "Pick your fighter" else "Pick the training dummy",
		online = "Pick your fighter, then FIND MATCH",
		inspect = "Browse the roster. Previews show each fighter's attacks.",
	}
	if self.status.Text == "" or self.phase ~= "done" then
		self.status.Text = hints[self.mode] or ""
	end
	for s = 1, 2 do
		local pv = self.previews[s]
		local id = CharacterData.Order[self.cursor[s]]
		if pv.char ~= id then
			pv.char = id
			pv.t = 0
			pv.cycle = 1
			pv.cycleT = 0
			task.spawn(SpriteLibrary.preload, id)
		end
		local cfg = CharacterData.get(id).config
		pv.name.Text = cfg.DisplayName
		pv.sub.Text = cfg.Subtitle
		pv.style.Text = cfg.Style
		pv.desc.Text = cfg.Description
		if s == 2 then
			local label = if self.mode == "training" then "DUMMY" elseif self.mode == "online" then "OPPONENT ?" elseif self.p2Human then "P2" else "CPU"
			pv.tag.Text = label
			pv.box.Visible = self.mode ~= "online"
		end
	end
	if self.showMoves then
		local id = CharacterData.Order[self.cursor[self:activeSlot()]]
		local c = CharacterData.get(id)
		local lines = { c.config.DisplayName .. " " .. c.config.Subtitle .. "  (startup/active/recovery)", "" }
		for _, mid in MOVE_ORDER do
			local m = c.moves[mid]
			if m then
				local hit, blk = AttackDefinitions.advantage(m)
				table.insert(lines, string.format("%-8s %-22s %2d/%2d/%2d  %3d dmg  %s%d/%s%d%s",
					INPUT_NAMES[mid] or mid, m.name, m.startup, m.active, m.recovery, m.damage * (if m.multi then m.multi.count else 1),
					if hit >= 0 then "+" else "", hit, if blk >= 0 then "+" else "", blk,
					if m.height == "low" then "  LOW" elseif m.height == "high" then "  OVERHEAD" else ""))
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
	elseif bit32.band(edges, Input.UP) ~= 0 then
		i = (i - 4) % n + 1
	elseif bit32.band(edges, Input.DOWN) ~= 0 then
		i = (i + 2) % n + 1
	end
	if i ~= self.cursor[slot] then
		self.cursor[slot] = i
		self:refresh()
	end
	if bit32.band(edges, Input.LIGHT) ~= 0 then
		self:confirm()
	elseif bit32.band(edges, Input.MEDIUM) ~= 0 then
		self:back()
	elseif bit32.band(edges, Input.SPECIAL) ~= 0 then
		self:toggleMoves()
	elseif bit32.band(edges, Input.HEAVY) ~= 0 then
		self:cycleStage(1)
	end
end

function CharacterSelect.step(self: any, dt: number)
	nav(self, InputController.takeMenu())
	-- animate previews at 60 fps
	for s = 1, 2 do
		local pv = self.previews[s]
		local cv = pv.canvas
		if cv and pv.char ~= "" and pv.box.Visible then
			local cs = SpriteLibrary.get(pv.char)
			local fd = cs.frameData
			pv.t += dt * 60
			local animName = "Idle"
			if self.mode == "inspect" or self.showMoves then
				animName = CYCLE[pv.cycle]
				local a = fd[animName]
				local len = Timeline.length(a)
				local dur = if a.loop then 90 else len + 24
				if pv.t > dur then
					pv.t = 0
					pv.cycle = pv.cycle % #CYCLE + 1
					animName = CYCLE[pv.cycle]
				end
				local mv = CharacterData.get(pv.char).moves[animName]
				pv.moveLabel.Text = if mv then string.upper(mv.name) else string.upper(animName)
			else
				pv.moveLabel.Text = ""
			end
			local anim = fd[animName] or fd.Idle
			local row = Timeline.stateRow(anim, pv.t)
			local frame = SpriteLibrary.sheet(cs, anim.sheet)[anim.frames[row].f]
			Raster.fill(cv.surface, Raster.rgb(40, 28, 64))
			-- floor line
			Raster.rect(cv.surface, 0, PREVIEW_H - 10, PREVIEW_W, 10, Raster.rgb(26, 18, 44))
			local wide = frame.w > PREVIEW_W - 20
			local ox = if wide then 40 else PREVIEW_W / 2
			Raster.sprite(cv.surface, frame, if s == 1 then ox else PREVIEW_W - ox, PREVIEW_H - 10, if s == 1 then 1 else -1,
				cs.palettes[if s == 2 and self.cursor[1] == self.cursor[2] then 2 else 1])
			cv.present()
		end
	end
end

function CharacterSelect.destroy(self: any)
	if self.conn then
		self.conn:Disconnect()
	end
	for _, c in self.smallCanvases do
		c.destroy()
	end
	for _, p in self.previews do
		if p.canvas then
			p.canvas.destroy()
		end
	end
	self.root:Destroy()
end

return CharacterSelect
