--!strict
-- Arcade fighting HUD ("HUDController"), layered over the pixel canvas:
--   P1 top-left / P2 top-right: framed portrait, nameplate, large health bar
--   (smooth drain, red damage trail, white hit flash, segment ticks), round
--   gems beside the bar, AWAKENING meter directly below it.
--   Centre: framed round timer. Combo counter pops on the attacker's side.
--   Banners: ROUND N slides in, FIGHT! zooms, K.O. slams, TIME / PERFECT /
--   winner; super call-outs and COUNTER flashes.

local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local CharacterData = require(Shared:WaitForChild("CharacterData"))
local CombatConfig = require(Shared:WaitForChild("CombatConfig"))
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local Transition = require(script.Parent:WaitForChild("TransitionController"))
local Render = script.Parent.Parent:WaitForChild("Render")
local Canvas = require(Render:WaitForChild("Canvas"))
local Raster = require(Render:WaitForChild("Raster"))
local SpriteLibrary = require(Render:WaitForChild("SpriteLibrary"))

local C = Widgets.Colors
local FightingHUD = {}
FightingHUD.__index = FightingHUD

local GOLD = Color3.fromRGB(255, 204, 64)
local FRAME_DARK = Color3.fromRGB(16, 10, 24)

local function anchor(left: boolean, x: number, y: number): (UDim2, Vector2)
	return if left then UDim2.fromScale(x, y) else UDim2.fromScale(1 - x, y), if left then Vector2.new(0, 0) else Vector2.new(1, 0)
end

local function side(self: any, root: Frame, slot: number, charId: string, palette: number, label: string)
	local left = slot == 1
	local cfg = CharacterData.get(charId).config
	local tint = if left then C.p1 else C.p2

	-- portrait frame
	local pos, ap = anchor(left, 0.012, 0.025)
	local pf = Widgets.frame(
		root,
		{ Size = UDim2.fromScale(0.082, 0.146), Position = pos, AnchorPoint = ap, BackgroundColor3 = FRAME_DARK, ZIndex = 5 }
	)
	Widgets.stroke(pf, GOLD, 2)
	local pg = Instance.new("UIGradient")
	pg.Rotation = 90
	pg.Color = ColorSequence.new(Color3.fromRGB(70, 50, 110), Color3.fromRGB(24, 16, 40))
	pg.Parent = pf
	local inner = Widgets.frame(
		pf,
		{ BackgroundTransparency = 1, Size = UDim2.fromScale(0.9, 0.9), Position = UDim2.fromScale(0.05, 0.05), ZIndex = 6 }
	)
	local cs = SpriteLibrary.get(charId)
	local pc = Canvas.small(inner, cs.portrait.w, cs.portrait.h)
	if pc then
		pc.label.ZIndex = 6
		if pc.R.begin then
			pc.R.begin(pc.surface)
		end
		pc.R.fill(pc.surface, Raster.rgb(46, 32, 74))
		local pal = cs.palettes[palette + 1] or cs.palettes[1]
		pc.R.sprite(pc.surface, cs.portrait, if left then 0 else cs.portrait.w, 0, if left then 1 else -1, pal)
		pc.present()
	end

	-- health bar: dark bevelled frame, trail, fill, flash, segment ticks
	pos, ap = anchor(left, 0.1, 0.035)
	local bar = Widgets.frame(
		root,
		{ Size = UDim2.fromScale(0.34, 0.062), Position = pos, AnchorPoint = ap, BackgroundColor3 = FRAME_DARK, ZIndex = 5 }
	)
	Widgets.stroke(bar, Color3.fromRGB(240, 236, 255), 2)
	local well = Widgets.frame(bar, {
		Size = UDim2.fromScale(0.985, 0.72),
		Position = UDim2.fromScale(0.0075, 0.14),
		BackgroundColor3 = Color3.fromRGB(40, 12, 24),
		ZIndex = 6,
	})
	local function strip(color: Color3, z: number): Frame
		return Widgets.frame(well, {
			Size = UDim2.fromScale(1, 1),
			Position = if left then UDim2.fromScale(1, 0) else UDim2.fromScale(0, 0),
			AnchorPoint = if left then Vector2.new(1, 0) else Vector2.new(0, 0),
			BackgroundColor3 = color,
			ZIndex = z,
		})
	end
	local trail = strip(C.hpTrail, 7)
	local fill = strip(C.hp, 8)
	local grad = Instance.new("UIGradient")
	grad.Rotation = 90
	grad.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 255, 210)),
		ColorSequenceKeypoint.new(0.45, Color3.fromRGB(255, 214, 60)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(214, 120, 20)),
	})
	grad.Parent = fill
	local flash = Widgets.frame(
		well,
		{ Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(1, 1, 1), BackgroundTransparency = 1, ZIndex = 10 }
	)
	for k = 1, 9 do
		Widgets.frame(well, {
			Size = UDim2.fromScale(0.004, 1),
			Position = UDim2.fromScale(k / 10, 0),
			BackgroundColor3 = FRAME_DARK,
			BackgroundTransparency = 0.35,
			ZIndex = 9,
		})
	end
	-- nameplate under the bar
	pos, ap = anchor(left, 0.1, 0.1)
	local plate = Widgets.frame(root, {
		Size = UDim2.fromScale(0.2, 0.045),
		Position = pos,
		AnchorPoint = ap,
		BackgroundColor3 = FRAME_DARK,
		BackgroundTransparency = 0.15,
		ZIndex = 5,
	})
	Widgets.frame(plate, {
		Size = UDim2.fromScale(0.02, 1),
		Position = if left then UDim2.fromScale(0, 0) else UDim2.fromScale(0.98, 0),
		BackgroundColor3 = tint,
		ZIndex = 6,
	})
	Widgets.text(plate, cfg.DisplayName .. "  " .. cfg.Subtitle, {
		Size = UDim2.fromScale(0.94, 0.8),
		Position = UDim2.fromScale(0.04, 0.1),
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		ZIndex = 6,
	})
	pos, ap = anchor(left, 0.305, 0.1)
	Widgets.text(root, label, {
		Size = UDim2.fromScale(0.06, 0.04),
		Position = pos,
		AnchorPoint = ap,
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		TextColor3 = tint,
		ZIndex = 6,
	})
	-- round gems beside the bar (towards the timer)
	local marks = {}
	for i = 1, CombatConfig.RoundsToWin do
		pos, ap = anchor(left, 0.425 - (i - 1) * 0.022, 0.108)
		local m = Widgets.frame(root, {
			Size = UDim2.fromScale(0.014, 0.025),
			Position = pos,
			AnchorPoint = ap,
			BackgroundColor3 = FRAME_DARK,
			Rotation = 45,
			ZIndex = 6,
		})
		Widgets.stroke(m, GOLD, 1)
		table.insert(marks, m)
	end
	-- AWAKENING meter, directly below the health bar
	pos, ap = anchor(left, 0.1, 0.152)
	local mb = Widgets.frame(
		root,
		{ Size = UDim2.fromScale(0.2, 0.026), Position = pos, AnchorPoint = ap, BackgroundColor3 = FRAME_DARK, ZIndex = 5 }
	)
	Widgets.stroke(mb, Color3.fromRGB(150, 220, 255), 1)
	local mfill = Widgets.frame(mb, {
		Size = UDim2.fromScale(0, 1),
		Position = if left then UDim2.fromScale(0, 0) else UDim2.fromScale(1, 0),
		AnchorPoint = if left then Vector2.new(0, 0) else Vector2.new(1, 0),
		BackgroundColor3 = C.meter,
		ZIndex = 6,
	})
	for k = 1, 3 do
		Widgets.frame(
			mb,
			{ Size = UDim2.fromScale(0.006, 1), Position = UDim2.fromScale(k / 4, 0), BackgroundColor3 = FRAME_DARK, ZIndex = 7 }
		)
	end
	pos, ap = anchor(left, 0.305, 0.148)
	local mtext = Widgets.text(root, "AWAKENING", {
		Size = UDim2.fromScale(0.14, 0.034),
		Position = pos,
		AnchorPoint = ap,
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		TextColor3 = C.meter,
		ZIndex = 6,
	})
	-- combo counter (attacker side, mid-height so it never covers the HUD)
	pos, ap = anchor(left, 0.02, 0.27)
	local combo = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.26, 0.11),
		Position = pos,
		AnchorPoint = ap,
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		TextColor3 = GOLD,
		Font = Widgets.TitleFont,
		Visible = false,
		ZIndex = 8,
	})
	local cstroke = Instance.new("UIStroke")
	cstroke.Thickness = 2
	cstroke.Color = Color3.fromRGB(60, 10, 20)
	cstroke.Parent = combo
	pos, ap = anchor(left, 0.02, 0.375)
	local comboDmg = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.26, 0.045),
		Position = pos,
		AnchorPoint = ap,
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		Visible = false,
		ZIndex = 8,
	})
	pos, ap = anchor(left, 0.02, 0.2)
	local callout = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.42, 0.065),
		Position = pos,
		AnchorPoint = ap,
		TextXAlignment = if left then Enum.TextXAlignment.Left else Enum.TextXAlignment.Right,
		TextColor3 = C.meterFull,
		Font = Widgets.TitleFont,
		Visible = false,
		ZIndex = 8,
	})
	self.sides[slot] = {
		bar = bar,
		barPos = bar.Position,
		fill = fill,
		trail = trail,
		flash = flash,
		shown = 1,
		trailShown = 1,
		trailDelay = 0,
		lastHp = nil,
		marks = marks,
		lastWins = 0,
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
	local self = setmetatable({ root = root, sides = {}, bannerTimer = 0 }, FightingHUD)
	local container = Widgets.frame(root, { Name = "HUD", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 4 })
	self.container = container
	-- soft dark band behind the top HUD for readability on bright stages
	local band = Widgets.frame(container, { BackgroundColor3 = Color3.new(0, 0, 0), Size = UDim2.fromScale(1, 0.22), ZIndex = 4 })
	local bg = Instance.new("UIGradient")
	bg.Rotation = 90
	bg.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.45), NumberSequenceKeypoint.new(1, 1) })
	bg.Parent = band
	for i = 1, 2 do
		local f = view.fighters[i]
		side(self, container, i, f.char, f.palette or 0, labels[i])
	end
	-- centre timer: double frame
	local tbox = Widgets.frame(container, {
		Size = UDim2.fromScale(0.09, 0.15),
		Position = UDim2.fromScale(0.5, 0.012),
		AnchorPoint = Vector2.new(0.5, 0),
		BackgroundColor3 = FRAME_DARK,
		ZIndex = 5,
	})
	Widgets.stroke(tbox, GOLD, 2)
	local tin = Widgets.frame(
		tbox,
		{ BackgroundTransparency = 1, Size = UDim2.fromScale(0.86, 0.86), Position = UDim2.fromScale(0.07, 0.07), ZIndex = 5 }
	)
	Widgets.stroke(tin, Color3.fromRGB(120, 80, 30), 1)
	self.timer = Widgets.text(
		tbox,
		"99",
		{ Size = UDim2.fromScale(0.9, 0.62), Position = UDim2.fromScale(0.05, 0.06), TextColor3 = GOLD, ZIndex = 6 }
	)
	self.roundLabel =
		Widgets.text(tbox, "ROUND 1", { Size = UDim2.fromScale(0.9, 0.22), Position = UDim2.fromScale(0.05, 0.7), ZIndex = 6 })
	-- banners
	self.banner = Widgets.text(container, "", {
		Size = UDim2.fromScale(0.8, 0.2),
		Position = UDim2.fromScale(0.5, 0.42),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Font = Widgets.TitleFont,
		TextColor3 = GOLD,
		Visible = false,
		ZIndex = 10,
	})
	local bs = Instance.new("UIStroke")
	bs.Thickness = 4
	bs.Color = Color3.fromRGB(40, 8, 18)
	bs.Parent = self.banner
	self.sub = Widgets.text(container, "", {
		Size = UDim2.fromScale(0.6, 0.07),
		Position = UDim2.fromScale(0.5, 0.555),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Visible = false,
		ZIndex = 10,
	})
	self.counter = Widgets.text(container, "COUNTER!", {
		Size = UDim2.fromScale(0.25, 0.065),
		Position = UDim2.fromScale(0.5, 0.25),
		AnchorPoint = Vector2.new(0.5, 0.5),
		TextColor3 = C.red,
		Visible = false,
		ZIndex = 10,
	})
	self.counterTimer = 0
	return self
end

function FightingHUD.showBanner(self: any, text: string, sub: string?, frames: number, color: Color3?, style: string?)
	local b = self.banner
	b.Text = text
	b.TextColor3 = color or GOLD
	b.Visible = true
	b.Position = UDim2.fromScale(0.5, 0.42)
	self.sub.Text = sub or ""
	self.sub.Visible = sub ~= nil
	self.bannerTimer = frames
	if style == "slide" then
		Transition.slideIn(b, UDim2.fromScale(-0.8, 0), 0.25)
	elseif style == "slam" then
		Transition.pop(b, 1.4)
	else
		Transition.pop(b, 0.5)
	end
end

function FightingHUD.update(self: any, view: any)
	for _, e in view.events or {} do
		if e.type == "round" then
			local final = view.wins[1] == CombatConfig.RoundsToWin - 1 and view.wins[2] == CombatConfig.RoundsToWin - 1
			self:showBanner(if final then "FINAL ROUND" else "ROUND " .. e.round, "GET READY", 100, nil, "slide")
		elseif e.type == "fight" then
			self:showBanner("FIGHT!", nil, 50, C.red, "zoom")
		elseif e.type == "ko" then
			self:showBanner("K.O.", nil, 90, C.red, "slam")
		elseif e.type == "timeover" then
			self:showBanner("TIME", nil, 90, nil, "slam")
		elseif e.type == "roundWin" then
			if e.slot == 0 then
				self:showBanner("DRAW", nil, 120)
			else
				local cfg = CharacterData.get(view.fighters[e.slot].char).config
				self:showBanner(cfg.DisplayName .. " WINS", if e.perfect then "PERFECT!" else nil, 120, nil, "zoom")
			end
		elseif e.type == "counter" or (e.type == "hit" and e.counter) then
			self.counter.Visible = true
			self.counterTimer = 40
			Transition.pop(self.counter, 0.4)
		elseif e.type == "super" or (e.type == "move" and e.class == "SP" and e.ex) then
			local f = view.fighters[e.slot]
			local s = self.sides[e.slot]
			if f and s then
				local mv = CharacterData.get(f.char).moves[e.move or "Super"]
				s.callout.Text = string.upper(if mv then mv.name else "AWAKENING") .. "!"
				s.callout.Visible = true
				s.calloutTimer = 70
				Transition.slideIn(s.callout, UDim2.fromScale(if e.slot == 1 then -0.3 else 0.3, 0), 0.2)
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
	self.timer.TextColor3 = if view.mode ~= "training" and view.timer < 600 and (view.frame // 15) % 2 == 0 then C.red else GOLD
	self.roundLabel.Text = if view.mode == "training" then "TRAINING" else "ROUND " .. view.round

	for i = 1, 2 do
		local f = view.fighters[i]
		local s = self.sides[i]
		local target = math.clamp(f.hp / f.maxHp, 0, 1)
		-- the bar drops the moment a hit lands; the red trail catches up after the combo
		if s.lastHp and f.hp < s.lastHp then
			s.flash.BackgroundTransparency = 0.2
			TweenService:Create(s.flash, TweenInfo.new(0.18), { BackgroundTransparency = 1 }):Play()
			s.bar.Position = s.barPos + UDim2.fromOffset(math.random(-3, 3), math.random(-2, 2))
			TweenService:Create(s.bar, TweenInfo.new(0.12), { Position = s.barPos }):Play()
		end
		s.lastHp = f.hp
		s.shown += (target - s.shown) * 0.5
		if math.abs(target - s.shown) < 0.002 then
			s.shown = target
		end
		if target < s.trailShown then
			if s.trailDelay <= 0 and f.combo == 0 then
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
		if view.wins[i] ~= s.lastWins then
			s.lastWins = view.wins[i]
			local m = s.marks[view.wins[i]]
			if m then
				Transition.pop(m, 1)
			end
		end
		for k, m in s.marks do
			m.BackgroundColor3 = if view.wins[i] >= k then GOLD else FRAME_DARK
		end
		local meter = math.clamp(f.meter / CombatConfig.MaxMeter, 0, 1)
		s.mfill.Size = UDim2.fromScale(meter, 1)
		local full = meter >= 1
		local pulse = (view.frame // 6) % 2 == 0
		s.mfill.BackgroundColor3 = if full then (if pulse then C.meterFull else C.meter) else C.meter
		s.mtext.Text = if full then "AWAKENING READY [F]" else string.format("AWAKENING %d%%", math.floor(meter * 100))
		s.mtext.TextColor3 = if full and pulse then C.white else C.meter
		-- combo counter on the attacker's side (hits the opponent has taken)
		local opp = view.fighters[3 - i]
		if opp.combo >= 2 then
			if opp.combo ~= s.lastCombo then
				Transition.pop(s.combo, 0.35)
			end
			s.combo.Text = opp.combo .. " HITS"
			s.combo.Visible = true
			s.comboDmg.Text = tostring(opp.comboDamage) .. " DAMAGE"
			s.comboDmg.Visible = true
			s.comboTimer = 60
			s.lastCombo = opp.combo
		elseif s.comboTimer > 0 then
			s.comboTimer -= 1
			if s.comboTimer <= 0 then
				s.combo.Visible = false
				s.comboDmg.Visible = false
				s.lastCombo = 0
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
