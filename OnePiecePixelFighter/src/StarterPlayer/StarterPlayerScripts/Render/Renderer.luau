--!strict
-- Draws one frame of a match from a View (see Shared/Protocol) into a Raster
-- surface: stage, shadows, fighters, projectiles, VFX, weather, flashes.
-- Gameplay never depends on anything here: the renderer is purely visual.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local CombatConfig = require(Shared:WaitForChild("CombatConfig"))
local CharacterData = require(Shared:WaitForChild("CharacterData"))
local Raster = require(script.Parent:WaitForChild("Raster"))
local SpriteLibrary = require(script.Parent:WaitForChild("SpriteLibrary"))
local Stage = require(script.Parent:WaitForChild("Stage"))
local Effects = require(script.Parent:WaitForChild("Effects"))

local Renderer = {}
Renderer.__index = Renderer

local rgb = Raster.rgb
local W, H = CombatConfig.ScreenWidth, CombatConfig.ScreenHeight

local SHAKE = { L = 0.6, M = 1.2, H = 2.2, SP = 2.6, SU = 4 }

function Renderer.new(surface: Raster.Surface, stageName: string)
	local self = setmetatable({
		s = surface,
		stage = Stage.new(stageName, W, H),
		fx = Effects.new(),
		camX = (CombatConfig.StageWidth - W) / 2,
		flash = { 0, 0 },
		lastAnim = { "", "" },
		moveByAnim = {},
		frameCount = 0,
		hitboxes = false, -- training overlay
		dbg = nil :: any,
	}, Renderer)
	return self
end

function Renderer.setStage(self: any, name: string)
	if self.stage.name ~= name then
		self.stage = Stage.new(name, W, H)
	end
end

local function movesFor(self: any, id: string)
	local m = self.moveByAnim[id]
	if m then
		return m
	end
	m = {}
	for _, mv in CharacterData.get(id).moves do
		m[mv.anim] = mv
	end
	self.moveByAnim[id] = m
	return m
end

-- ---------------------------------------------------------------------------
-- events -> effects
-- ---------------------------------------------------------------------------
function Renderer.onEvents(self: any, view: any)
	local fx = self.fx
	for _, e in view.events or {} do
		local t = e.type
		if t == "hit" then
			fx:hit(e.x, e.y, e.class or "M", e.vfx, e.counter)
			fx.shake = math.max(fx.shake, (SHAKE[e.class] or 1) + (e.shake or 0) * 0.5)
			if e.slot then
				self.flash[e.slot] = if e.class == "SU" or e.class == "H" then 4 else 3
			end
		elseif t == "block" then
			local f = view.fighters[e.slot or 1]
			fx:block(e.x, e.y, if f then f.facing else 1)
			fx.shake = math.max(fx.shake, 0.5)
		elseif t == "counter" then
			fx:add({ kind = "ring", x = e.x, y = e.y, life = 18, size = 6, grow = 3, c1 = rgb(255, 255, 255) })
			fx:smoke(e.x, e.y, 6, "mochi")
			self.flash[e.slot or 1] = 4
		elseif t == "armor" then
			fx:add({ kind = "ring", x = e.x, y = e.y, life = 10, size = 4, grow = 2, c1 = rgb(255, 120, 120) })
		elseif t == "super" then
			fx.darken = CombatConfig.SuperFreeze
			self.flash[e.slot or 1] = 6
			local f = view.fighters[e.slot or 1]
			if f then
				fx:add({ kind = "ring", x = f.x, y = f.y + 50, life = 22, size = 8, grow = 4, c1 = rgb(255, 255, 255) })
			end
		elseif t == "ko" then
			fx.flash = 8
			fx.shake = 6
		elseif t == "land" then
			fx:dust(e.x, if e.heavy then 7 else 3, e.heavy)
			if e.heavy then
				fx.shake = math.max(fx.shake, 1.5)
			end
		elseif t == "jump" then
			fx:dust(e.x, 3)
			if e.double then
				fx:smoke(e.x, (view.fighters[e.slot] and view.fighters[e.slot].y or 0) + 6, 4, "smoke")
			end
		elseif t == "dash" then
			fx:dust(e.x, 4)
		elseif t == "projectile" then
			fx:add({ kind = "spark", x = e.x, y = e.y, life = 8, size = 10, c1 = rgb(255, 255, 255), c2 = rgb(255, 220, 120), rays = 6 })
		elseif t == "projectileEnd" then
			fx:add({ kind = "spark", x = e.x, y = e.y, life = 6, size = 6, c1 = rgb(255, 255, 255), c2 = rgb(200, 200, 255), rays = 4 })
		elseif t == "clash" then
			fx:hit(e.x, e.y, "H", nil, false)
			fx.shake = math.max(fx.shake, 2)
		elseif t == "teleport" then
			local y = 40
			for _ = 1, 4 do
				fx:bolt(e.x + math.random(-14, 14), y + math.random(-30, 30), e.x + math.random(-14, 14), y + math.random(-30, 30), 8)
			end
		elseif t == "charge" then
			local f = view.fighters[e.slot or 1]
			if f then
				fx:smoke(f.x, f.y + 40, 4, "steam")
			end
		end
	end
end

-- ---------------------------------------------------------------------------
-- per-fighter visual extras: auras, move VFX, trails, afterimages
-- ---------------------------------------------------------------------------
local function anchorWorld(f: any, a: { number }?): (number?, number?)
	if not a then
		return nil, nil
	end
	return f.x + a[1] * f.facing, f.y + a[2]
end

function Renderer.fighterExtras(self: any, i: number, f: any, cs: any, frame: any, row: any)
	local fx = self.fx
	local cfg = CharacterData.get(f.char).config
	local aura = cfg.Theme and cfg.Theme.aura
	local t = self.frameCount + i * 3
	local anc = row and row.anc or {}

	-- character auras
	if aura == "steam" and t % 9 == 0 and not f.ko then
		local x, y = anchorWorld(f, anc.chest)
		if x then
			fx:add({ kind = "puff", x = x + math.random(-8, 8), y = y + math.random(-6, 10), vx = math.random(-5, 5) / 20, vy = 0.7, r = 2.5, life = 22,
				c1 = Effects.Colors.steam[1], c2 = Effects.Colors.steam[2] })
		end
	elseif aura == "smoke" and t % 5 == 0 and not f.ko then
		fx:add({ kind = "puff", x = f.x + math.random(-22, 22), y = f.y + math.random(40, 72), vx = 0, vy = 0.4, r = 3, life = 20,
			c1 = Effects.Colors.smoke[1], c2 = Effects.Colors.smoke[2] })
	elseif aura == "cloud" and t % 7 == 0 and not f.ko then
		local x, y = anchorWorld(f, anc.head)
		if x then
			fx:add({ kind = "puff", x = x + math.random(-14, 14), y = y + math.random(-6, 12), vx = math.random(-5, 5) / 15, vy = 0.3, r = 2, life = 26,
				c1 = rgb(255, 255, 255), c2 = rgb(220, 226, 250) })
		end
	elseif aura == "sparks" and t % 11 == 0 and not f.ko then
		local x, y = anchorWorld(f, anc.chest)
		if x then
			fx:bolt(x + math.random(-12, 12), y + math.random(-14, 20), x + math.random(-18, 18), y + math.random(-20, 24), 4)
		end
	end

	if f.state ~= "attack" then
		return
	end
	local mv = movesFor(self, f.char)[f.anim]
	local vfx = mv and mv.vfx
	local active = row and row.p == "a"

	-- sword trails follow the actual blade tips every frame of the swing
	if anc.bladeNTip or anc.bladeFTip then
		local col = Effects.Colors.slash[2]
		for _, key in { "bladeNTip", "bladeFTip", "bladeMTip" } do
			local x, y = anchorWorld(f, anc[key])
			if x and (active or (row and row.p == "s" and mv and mv.class ~= "L")) then
				fx:trail(f.char .. i .. key, x, y, col)
			end
		end
	end
	if anc.staffTip and active then
		local x, y = anchorWorld(f, anc.staffTip)
		if x then
			fx:trail(f.char .. i .. "staff", x, y, rgb(255, 230, 120))
		end
	end
	if anc.weaponTip and active then
		local x, y = anchorWorld(f, anc.weaponTip)
		if x then
			fx:trail(f.char .. i .. "mog", x, y, rgb(255, 240, 230))
		end
	end

	if not active then
		return
	end
	local hx, hy = anchorWorld(f, anc.handF)
	local nx, ny = anchorWorld(f, anc.handN)
	if vfx == "thread" or vfx == "floorthread" or vfx == "risethread" then
		local white, pink = rgb(255, 255, 255), rgb(255, 150, 210)
		for _, b in row.hit or {} do
			local far = f.x + (b[1] + b[3]) * f.facing
			local mid = f.y + b[2] + b[4] * 0.5
			for k = -1, 1 do
				local ox, oy = (hx or f.x), (hy or f.y + 60)
				if vfx == "risethread" then
					fx:add({ kind = "bolt", x = f.x + (b[1] + b[3] * 0.5 + k * 6) * f.facing, y = f.y, x2 = f.x + (b[1] + b[3] * 0.5 + k * 9) * f.facing,
						y2 = f.y + b[2] + b[4], life = 2, c1 = white, c2 = pink })
				else
					fx:add({ kind = "bolt", x = ox, y = oy, x2 = far, y2 = mid + k * 4, life = 2, c1 = white, c2 = pink })
				end
			end
		end
	elseif vfx == "shock" or vfx == "kari" then
		local x, y = nx or hx, ny or hy
		if x and self.frameCount % 2 == 0 then
			fx:bolt(x, y :: number, x + f.facing * math.random(4, 26), (y :: number) + math.random(-14, 14), 3)
		end
		if vfx == "kari" then
			fx:bolt(f.x + math.random(-20, 20), f.y + 10, f.x + math.random(-20, 20), f.y + 120, 3, 2)
		end
	elseif vfx == "gatling" then
		local x, y = nx or hx, ny or hy
		if x then
			for k = 1, 3 do
				local ox = (x :: number) + f.facing * math.random(-6, 6)
				local oy = (y :: number) + math.random(-16, 16)
				fx:add({ kind = "puff", x = ox, y = oy, life = 3, r = 3, c1 = Effects.Colors.steam[1], c2 = Effects.Colors.steam[2] })
			end
			fx:add({ kind = "bolt", x = x - f.facing * 26, y = y, x2 = x, y2 = y, life = 2, c1 = rgb(255, 255, 255), c2 = rgb(255, 200, 200) })
		end
		if self.frameCount % 3 == 0 then
			fx:afterimage(frame, f.x - f.facing * 6, f.y, f.facing, rgb(255, 150, 160), 6)
		end
	elseif vfx == "asura" then
		if self.frameCount % 2 == 0 then
			fx:afterimage(frame, f.x - f.facing * 10, f.y, f.facing, rgb(120, 220, 120), 8)
		end
	elseif vfx == "mochispike" and self.lastAnim[i] ~= f.anim .. "a" then
		for _, b in row.hit or {} do
			fx:spike(f.x + (b[1] + b[3] * 0.5) * f.facing, 20)
		end
	elseif vfx == "kong" or vfx == "kingkong" or vfx == "giantfist" or vfx == "powermochi" then
		local x, y = if vfx == "powermochi" then nx else hx, if vfx == "powermochi" then ny else hy
		if x and self.frameCount % 3 == 0 then
			fx:smoke(x, y :: number, 2, if vfx == "powermochi" then "mochi" else "smoke")
		end
		fx.shake = math.max(fx.shake, if vfx == "kingkong" or vfx == "giantfist" then 3 else 1.5)
	elseif vfx == "toon" then
		if self.frameCount % 2 == 0 then
			fx:smoke(f.x, f.y + 30, 1, "smoke")
			fx:afterimage(frame, f.x - f.facing * 8, f.y, f.facing, rgb(255, 255, 255), 6)
		end
	elseif vfx == "mochi" then
		local x, y = nx or hx, ny or hy
		if x and self.frameCount % 2 == 0 then
			fx:add({ kind = "puff", x = x, y = y, life = 8, r = 4, c1 = Effects.Colors.mochi[1], c2 = Effects.Colors.mochi[2] })
		end
	end
	self.lastAnim[i] = f.anim .. (if active then "a" else "")
end

-- ---------------------------------------------------------------------------
-- projectiles
-- ---------------------------------------------------------------------------
function Renderer.drawProjectile(self: any, p: any, view: any, floor: number)
	local s = self.s
	local x = p.x - self.camX
	local y = floor - p.y
	local white = rgb(255, 255, 255)
	if p.kind == "vari" then
		local c2 = rgb(120, 220, 255)
		Raster.disc(s, x, y, 7, rgb(40, 60, 140))
		Raster.disc(s, x, y, 6, c2)
		Raster.disc(s, x, y, 3 + (p.age % 3), white)
		for _ = 1, 3 do
			local a = math.random() * math.pi * 2
			local r = 8 + math.random() * 6
			Raster.line(s, x, y, x + math.cos(a) * r, y + math.sin(a) * r, c2, 1)
		end
		Raster.line(s, x - p.facing * 18, y + math.random(-2, 2), x, y, c2, 2, true)
	elseif p.kind == "parasite" then
		local owner = view.fighters[p.owner]
		local pink = rgb(255, 150, 210)
		if owner then
			local hx = owner.x + owner.facing * 24 - self.camX
			local hy = floor - (owner.y + 70)
			Raster.line(s, hx, hy, x, y, white, 1)
			Raster.line(s, hx, hy + 2, x, y + 1, pink, 1, true)
		end
		Raster.line(s, x, y, x - p.facing * 5, y - 4, white, 2)
		Raster.line(s, x, y, x - p.facing * 5, y + 4, white, 2)
	elseif p.kind == "slash" then
		local green, pale = rgb(110, 230, 120), rgb(230, 255, 230)
		for k = -10, 10 do
			local t = k / 10
			local ax = x + p.facing * (math.cos(t * 1.2) * 12 - 6)
			local ay = y + t * 20
			local th = math.floor(4 * (1 - math.abs(t))) + 1
			Raster.rect(s, ax - th, ay, th * 2, 1, green)
			Raster.rect(s, ax - th + 1, ay, math.max(1, th), 1, pale)
		end
	elseif p.kind == "birdcage" then
		local pink = rgb(255, 150, 210)
		local x0, x1 = x - p.w / 2, x + p.w / 2
		local top = 0
		for k = 0, 10 do
			local lx = x0 + (x1 - x0) * k / 10 + math.sin(p.age * 0.3 + k) * 2
			Raster.line(s, lx, top, lx + (k - 5) * 2, floor, if k % 2 == 0 then white else pink, 1, p.age % 2 == 1)
		end
		for k = 1, 4 do
			local ly = floor - (p.age * 4 + k * 40) % p.h
			Raster.line(s, x0, ly, x1, ly + 6, pink, 1, true)
		end
	elseif p.kind == "elthor" then
		local c2 = rgb(120, 220, 255)
		local hw = p.w / 2
		if p.age < 3 then
			self.fx.flash = math.max(self.fx.flash, 2)
		end
		Raster.rect(s, x - hw * 0.6, 0, hw * 1.2, floor, c2, true)
		Raster.rect(s, x - hw * 0.25, 0, hw * 0.5, floor, white)
		for _ = 1, 4 do
			local bx = x + (math.random() - 0.5) * hw * 2
			Raster.line(s, bx, 0, bx + math.random(-10, 10), floor, c2, 1)
		end
		self.fx:dust(p.x, 2, true)
	end
end

-- ---------------------------------------------------------------------------
-- frame
-- ---------------------------------------------------------------------------
function Renderer.draw(self: any, view: any)
	self.frameCount += 1
	local s = self.s
	local fx = self.fx
	local stage = self.stage
	local floor = stage.floor
	local f1, f2 = view.fighters[1], view.fighters[2]

	-- camera follows the midpoint, clamped to the stage
	local target = math.clamp((f1.x + f2.x) / 2 - W / 2, 0, CombatConfig.StageWidth - W)
	self.camX += (target - self.camX) * 0.25
	local camX = math.floor(self.camX + 0.5)

	self:onEvents(view)
	local shx, shy = 0, 0
	if fx.shake > 0 then
		shx = math.floor((math.random() - 0.5) * fx.shake * 2 + 0.5)
		shy = math.floor((math.random() - 0.5) * fx.shake * 1.4 + 0.5)
	end

	stage:drawBack(s, camX, shx, shy)
	if view.freeze > 0 or fx.darken > 0 then
		Raster.darken(s)
		-- radial speed lines behind the super user
		local cx, cy = W / 2, H / 2 - 10
		for k = 0, 23 do
			local a = k / 24 * math.pi * 2 + self.frameCount * 0.02
			Raster.line(s, cx + math.cos(a) * 60, cy + math.sin(a) * 60, cx + math.cos(a) * 260, cy + math.sin(a) * 260, rgb(70, 70, 110), 1)
		end
	end

	-- shadows
	local shadow = rgb(20, 14, 30)
	for _, f in view.fighters do
		local sx = f.x - camX + shx
		local w = math.max(8, 22 - f.y * 0.12)
		for dx = -w, w do
			local hh = if math.abs(dx) < w * 0.6 then 1 else 0
			Raster.blend(s, sx + dx, floor + shy, shadow)
			if hh == 1 then
				Raster.blend(s, sx + dx, floor + 1 + shy, shadow)
			end
		end
	end

	-- fighters: the attacking one is drawn in front
	local order = { 1, 2 }
	if f1.state == "attack" and f2.state ~= "attack" then
		order = { 2, 1 }
	end
	for _, i in order do
		local f = view.fighters[i]
		local cs = SpriteLibrary.get(f.char)
		local frame, row = SpriteLibrary.frame(cs, f.anim, f.row)
		if frame then
			local pal = cs.palettes[(f.palette or 0) + 1] or cs.palettes[1]
			local solid = nil
			if self.flash[i] > 0 then
				solid = cs.flash
				self.flash[i] -= 1
			end
			local sx, sy = f.x - camX + shx, floor - f.y + shy
			self:fighterExtras(i, f, cs, frame, row)
			Raster.sprite(s, frame, sx, sy, f.facing, pal, solid, if solid then cs.flashOutline else nil)
			if f.bound then
				-- Parasite threads hold the victim like a puppet
				local pink = rgb(255, 150, 210)
				for k = -2, 2 do
					Raster.line(s, sx + k * 6, 0, sx + k * 5, sy - 60 + math.abs(k) * 8, pink, 1, true)
				end
			end
			if self.hitboxes and row then
				self:drawBoxes(f, row, camX, floor)
			end
		end
	end

	for _, p in view.projectiles do
		self:drawProjectile(p, view, floor)
	end
	fx:draw(s, camX - shx, floor + shy)
	stage:drawFront(s)
	if fx.flash > 0 then
		Raster.whiteout(s, fx.flash > 4)
	end
	fx:update()
end

-- Training overlay: hurtboxes blue, hitboxes red (exactly the sim's boxes).
function Renderer.drawBoxes(self: any, f: any, row: any, camX: number, floor: number)
	local s = self.s
	local function box(b: { number }, c: number)
		local x0 = if f.facing == 1 then f.x + b[1] else f.x - b[1] - b[3]
		local sx, sy = x0 - camX, floor - (f.y + b[2] + b[4])
		Raster.rect(s, sx, sy, b[3], 1, c)
		Raster.rect(s, sx, sy + b[4] - 1, b[3], 1, c)
		Raster.rect(s, sx, sy, 1, b[4], c)
		Raster.rect(s, sx + b[3] - 1, sy, 1, b[4], c)
	end
	if not f.invuln then
		for _, b in row.hurt or {} do
			box(b, rgb(80, 200, 255))
		end
	end
	if row.p == "a" then
		for _, b in row.hit or {} do
			box(b, rgb(255, 60, 60))
		end
	end
end

return Renderer
