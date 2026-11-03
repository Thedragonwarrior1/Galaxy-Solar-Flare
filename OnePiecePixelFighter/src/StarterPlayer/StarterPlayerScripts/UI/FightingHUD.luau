--!strict
-- Arcade fighting HUD drawn over the pixel canvas:
--   top-left / top-right: portrait, name, health bar (smooth drain + red damage
--   trail), round win markers; centre: round number and timer; bottom: super
--   meters; combo counter; ROUND / FIGHT / K.O. / TIME / PERFECT banners; super
--   name call-outs and COUNTER flashes.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local CharacterData = require(Shared:WaitForChild("CharacterData"))
local CombatConfig = require(Shared:WaitForChild("CombatConfig"))
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local Render = script.Parent.Parent:WaitForChild("Render")
local Canvas = require(Render:WaitForChild("Canvas"))
local Raster = require(Render:WaitForChild("Raster"))
local SpriteLibrary = require(Render:WaitForChild("SpriteLibrary"))

local C = Widgets.Colors
local FightingHUD = {}
FightingHUD.__index = FightingHUD

local function side(self: any, root: Frame, slot: number, charId: string, palette: number, label: string)
	local left = slot == 1
	local cfg = CharacterData.get(charId).config
	local holder = Widgets.frame(root, {
		Name = "P" .. slot,
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.43, 0.2),
		Position = if left then UDim2.fromScale(0.012, 0.02) else UDim2.fromScale(0.988, 0.02),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		ZIndex = 5,
	})
	-- portrait
	local pf = Widgets.frame(holder, {
		Size = UDim2.fromScale(0.2, 0.9),
		Position = if left then UDim2.fromScale(0, 0) else UDim2.fromScale(1, 0),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		BackgroundColor3 = C.panel,
		ZIndex = 5,
	})
	Widgets.stroke(pf, if left then C.p1 else C.p2, 2)
	local cs = SpriteLibrary.get(charId)
	local pc = Canvas.small(pf, cs.portrait.w, cs.portrait.h)
	if pc then
		pc.label.ZIndex = 6
		Raster.fill(pc.surface, Raster.rgb(40, 30, 64))
		local pal = cs.palettes[palette + 1] or cs.palettes[1]
		Raster.sprite(pc.surface, cs.portrait, if left then 0 else cs.portrait.w, 0, if left then 1 else -1, pal)
		pc.present()
	end
	-- health bar
	local bar = Widgets.frame(holder, {
		Size = UDim2.fromScale(0.77, 0.3),
		Position = if left then UDim2.fromScale(0.22, 0.05) else UDim2.fromScale(0.78, 0.05),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		BackgroundColor3 = C.ink,
		ZIndex = 5,
	})
	Widgets.stroke(bar, C.white, 2)
	local trail = Widgets.frame(bar, {
		Size = UDim2.fromScale(1, 1),
		Position = if left then UDim2.fromScale(1, 0) else UDim2.fromScale(0, 0),
		AnchorPoint = if left then Vector2.new(1, 0) else Vector2.new(0, 0),
		BackgroundColor3 = C.hpTrail,
		ZIndex = 6,
	})
	local fill = Widgets.frame(bar, {
		Size = UDim2.fromScale(1, 1),
		Position = if left then UDim2.fromScale(1, 0) else UDim2.fromScale(0, 0),
		AnchorPoint = if left then Vector2.new(1, 0) else Vector2.new(0, 0),
		BackgroundColor3 = C.hp,
		ZIndex = 7,
	})
	local grad = Instance.new("UIGradient")
	grad.Rotation = 90
	grad.Color = ColorSequence.new(Color3.fromRGB(255, 255, 200), Color3.fromRGB(230, 150, 20))
	grad.Parent = fill
	-- name + subtitle
	Widgets.text(holder, cfg.DisplayName .. "  " .. cfg.Subtitle, {
		Size = UDim2.fromScale(0.77, 0.24),
		Position = if left then UDim2.fromScale(0.22, 0.4) else UDim2.fromScale(0.78, 0.4),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		ZIndex = 6,
	})
	Widgets.text(holder, label, {
		Size = UDim2.fromScale(0.2, 0.2),
		Position = if left then UDim2.fromScale(0.22, 0.68) else UDim2.fromScale(0.78, 0.68),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		TextColor3 = if left then C.p1 else C.p2,
		ZIndex = 6,
	})
	-- round win markers
	local marks = {}
	for i = 1, CombatConfig.RoundsToWin do
		local m = Widgets.frame(holder, {
			Size = UDim2.fromScale(0.05, 0.22),
			Position = if left then UDim2.fromScale(0.93 - (i - 1) * 0.07, 0.42) else UDim2.fromScale(0.07 + (i - 1) * 0.07, 0.42),
			AnchorPoint = Vector2.new(0.5, 0),
			BackgroundColor3 = C.ink,
			ZIndex = 6,
			Rotation = 45,
		})
		Widgets.aspect(m, 1)
		Widgets.stroke(m, C.gold, 1)
		table.insert(marks, m)
	end
	-- super meter (bottom)
	local mb = Widgets.frame(root, {
		Name = "Meter" .. slot,
		Size = UDim2.fromScale(0.3, 0.035),
		Position = if left then UDim2.fromScale(0.02, 0.955) else UDim2.fromScale(0.98, 0.955),
		AnchorPoint = if left then Vector2.new(0, 1) else Vector2.new(1, 1),
		BackgroundColor3 = C.ink,
		ZIndex = 5,
	})
	Widgets.stroke(mb, C.white, 1)
	local mfill = Widgets.frame(mb, {
		Size = UDim2.fromScale(0, 1),
		Position = if left then UDim2.fromScale(0, 0) else UDim2.fromScale(1, 0),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		BackgroundColor3 = C.meter,
		ZIndex = 6,
	})
	local mtext = Widgets.text(root, "SUPER", {
		Size = UDim2.fromScale(0.12, 0.05),
		Position = if left then UDim2.fromScale(0.33, 0.96) else UDim2.fromScale(0.67, 0.96),
		AnchorPoint = if left then Vector2.new(0, 1) else Vector2.new(1, 1),
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		TextColor3 = C.meter,
		ZIndex = 6,
	})
	-- combo counter
	local combo = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.3, 0.12),
		Position = if left then UDim2.fromScale(0.02, 0.3) else UDim2.fromScale(0.98, 0.3),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		TextColor3 = C.gold,
		Font = Widgets.TitleFont,
		Visible = false,
		ZIndex = 8,
	})
	local comboDmg = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.3, 0.055),
		Position = if left then UDim2.fromScale(0.02, 0.42) else UDim2.fromScale(0.98, 0.42),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		Visible = false,
		ZIndex = 8,
	})
	local callout = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.42, 0.07),
		Position = if left then UDim2.fromScale(0.02, 0.22) else UDim2.fromScale(0.98, 0.22),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		TextColor3 = C.meterFull,
		Font = Widgets.TitleFont,
		Visible = false,
		ZIndex = 8,
	})
	self.sides[slot] = {
		fill = fill,
		trail = trail,
		shown = 1,
		trailShown = 1,
		trailDelay = 0,
		marks = marks,
		mfill = mfill,
		mtext = mtext,
		combo = combo,
		comboDmg = comboDmg,
		comboTimer = 0,
		lastCombo = 0,
		callout = callout,
		calloutTimer = 0,
		portrait = pc,
	}
end

function FightingHUD.new(root: Frame, view: any, labels: { string })
	local self = setmetatable({ root = root, sides = {}, bannerTimer = 0, lastPhase = "", lastRound = 0 }, FightingHUD)
	local container = Widgets.frame(root, { Name = "HUD", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 4 })
	self.container = container
	for i = 1, 2 do
		local f = view.fighters[i]
		side(self, container, i, f.char, f.palette or 0, labels[i])
	end
	-- centre timer
	local tbox = Widgets.frame(container, {
		Size = UDim2.fromScale(0.1, 0.13),
		Position = UDim2.fromScale(0.5, 0.015),
		AnchorPoint = Vector2.new(0.5, 0),
		BackgroundColor3 = C.ink,
		ZIndex = 5,
	})
	Widgets.stroke(tbox, C.gold, 2)
	self.timer = Widgets.text(tbox, "99", { Size = UDim2.fromScale(1, 0.75), TextColor3 = C.gold, ZIndex = 6 })
	self.roundLabel = Widgets.text(tbox, "ROUND 1", { Size = UDim2.fromScale(1, 0.25), Position = UDim2.fromScale(0, 0.75), ZIndex = 6 })
	-- banner
	self.banner = Widgets.text(container, "", {
		Size = UDim2.fromScale(0.8, 0.2),
		Position = UDim2.fromScale(0.5, 0.42),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Font = Widgets.TitleFont,
		TextColor3 = C.gold,
		Visible = false,
		ZIndex = 10,
	})
	self.sub = Widgets.text(container, "", {
		Size = UDim2.fromScale(0.6, 0.08),
		Position = UDim2.fromScale(0.5, 0.55),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Visible = false,
		ZIndex = 10,
	})
	self.counter = Widgets.text(container, "COUNTER!", {
		Size = UDim2.fromScale(0.25, 0.07),
		Position = UDim2.fromScale(0.5, 0.2),
		AnchorPoint = Vector2.new(0.5, 0.5),
		TextColor3 = C.red,
		Visible = false,
		ZIndex = 10,
	})
	self.counterTimer = 0
	return self
end

function FightingHUD.showBanner(self: any, text: string, sub: string?, frames: number, color: Color3?)
	self.banner.Text = text
	self.banner.TextColor3 = color or C.gold
	self.banner.Visible = true
	self.sub.Text = sub or ""
	self.sub.Visible = sub ~= nil
	self.bannerTimer = frames
end

function FightingHUD.update(self: any, view: any)
	-- events
	for _, e in view.events or {} do
		if e.type == "round" then
			local final = view.wins[1] == CombatConfig.RoundsToWin - 1 and view.wins[2] == CombatConfig.RoundsToWin - 1
			self:showBanner(if final then "FINAL ROUND" else "ROUND " .. e.round, nil, 100)
		elseif e.type == "fight" then
			self:showBanner("FIGHT!", nil, 50, C.red)
		elseif e.type == "ko" then
			self:showBanner("K.O.", nil, 90, C.red)
		elseif e.type == "timeover" then
			self:showBanner("TIME", nil, 90)
		elseif e.type == "roundWin" then
			if e.slot == 0 then
				self:showBanner("DRAW", nil, 120)
			else
				local cfg = CharacterData.get(view.fighters[e.slot].char).config
				self:showBanner(cfg.DisplayName .. " WINS", if e.perfect then "PERFECT" else nil, 120)
			end
		elseif e.type == "counter" or (e.type == "hit" and e.counter) then
			self.counter.Visible = true
			self.counterTimer = 40
		elseif e.type == "super" or (e.type == "move" and e.class == "SP" and e.ex) then
			local f = view.fighters[e.slot]
			local s = self.sides[e.slot]
			if f and s then
				local mv = CharacterData.get(f.char).moves[e.move or "Super"]
				s.callout.Text = string.upper(if mv then mv.name else "SUPER") .. "!"
				s.callout.Visible = true
				s.calloutTimer = 70
			end
		end
	end
	if self.bannerTimer > 0 then
		self.bannerTimer -= 1
		if self.bannerTimer <= 0 then
			self.banner.Visible = false
			self.sub.Visible = false
		end
	end
	if self.counterTimer > 0 then
		self.counterTimer -= 1
		if self.counterTimer <= 0 then
			self.counter.Visible = false
		end
	end
	self.timer.Text = if view.mode == "training" then "--" else tostring(math.ceil(view.timer / 60))
	self.roundLabel.Text = if view.mode == "training" then "TRAINING" else "ROUND " .. view.round

	for i = 1, 2 do
		local f = view.fighters[i]
		local s = self.sides[i]
		local target = math.clamp(f.hp / f.maxHp, 0, 1)
		-- health drains smoothly; the red trail waits, then catches up
		s.shown += (target - s.shown) * 0.35
		if math.abs(target - s.shown) < 0.002 then
			s.shown = target
		end
		if target < s.trailShown then
			if s.trailDelay <= 0 and (f.combo == 0) then
				s.trailShown = math.max(target, s.trailShown - 0.012)
			else
				s.trailDelay -= 1
			end
		else
			s.trailShown = target
			s.trailDelay = 30
		end
		s.fill.Size = UDim2.fromScale(s.shown, 1)
		s.trail.Size = UDim2.fromScale(s.trailShown, 1)
		s.fill.BackgroundColor3 = if target < 0.25 then C.hpLow else C.hp
		for k, m in s.marks do
			m.BackgroundColor3 = if view.wins[i] >= k then C.gold else C.ink
		end
		local meter = math.clamp(f.meter / CombatConfig.MaxMeter, 0, 1)
		s.mfill.Size = UDim2.fromScale(meter, 1)
		local full = meter >= 1
		s.mfill.BackgroundColor3 = if full then (if (view.frame // 6) % 2 == 0 then C.meterFull else C.meter) else C.meter
		s.mtext.Text = if full then "SUPER READY" else string.format("SUPER %d%%", math.floor(meter * 100))
		-- the combo counter shows on the attacker's side (hits the opponent has taken)
		local opp = view.fighters[3 - i]
		if opp.combo >= 2 then
			s.combo.Text = opp.combo .. " HIT COMBO"
			s.combo.Visible = true
			s.comboDmg.Text = tostring(opp.comboDamage) .. " DMG"
			s.comboDmg.Visible = true
			s.comboTimer = 60
			s.lastCombo = opp.combo
		elseif s.comboTimer > 0 then
			s.comboTimer -= 1
			if s.comboTimer <= 0 then
				s.combo.Visible = false
				s.comboDmg.Visible = false
			end
		end
		if s.calloutTimer > 0 then
			s.calloutTimer -= 1
			if s.calloutTimer <= 0 then
				s.callout.Visible = false
			end
		end
	end
end

function FightingHUD.destroy(self: any)
	for _, s in self.sides do
		if s.portrait then
			s.portrait.destroy()
		end
	end
	self.container:Destroy()
end

return FightingHUD
