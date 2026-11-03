--!strict
-- Pixel VFX: hit sparks, impact rings, dust, smoke, steam, cloud wisps,
-- lightning bolts, slash trails, string threads, mochi blobs, afterimages.
-- All positions are world space (x, y up); draw() converts with the camera.

local Raster = require(script.Parent:WaitForChild("Raster"))

local Effects = {}
Effects.__index = Effects

local rgb = Raster.rgb
local WHITE = rgb(255, 255, 255)
local INK = rgb(26, 16, 30)

Effects.Colors = {
	L = { rgb(255, 255, 255), rgb(255, 230, 120) },
	M = { rgb(255, 255, 255), rgb(255, 180, 70) },
	H = { rgb(255, 255, 255), rgb(255, 110, 60) },
	SP = { rgb(255, 255, 255), rgb(255, 80, 120) },
	SU = { rgb(255, 255, 255), rgb(120, 200, 255) },
	block = { rgb(200, 230, 255), rgb(90, 140, 255) },
	electric = { rgb(255, 255, 255), rgb(120, 220, 255) },
	slash = { rgb(255, 255, 255), rgb(150, 255, 160) },
	thread = { rgb(255, 255, 255), rgb(255, 150, 210) },
	mochi = { rgb(255, 252, 244), rgb(216, 202, 196) },
	steam = { rgb(255, 246, 250), rgb(250, 190, 210) },
	smoke = { rgb(236, 236, 244), rgb(176, 176, 196) },
	dust = { rgb(214, 190, 160), rgb(160, 130, 110) },
}

function Effects.new()
	return setmetatable({ list = {}, trails = {}, shake = 0, flash = 0, darken = 0, t = 0 }, Effects)
end

function Effects.add(self: any, e: any)
	e.age = 0
	table.insert(self.list, e)
	if #self.list > 260 then
		table.remove(self.list, 1)
	end
	return e
end

local function rnd(a: number, b: number): number
	return a + math.random() * (b - a)
end

-- ---------------------------------------------------------------------------
-- spawners
-- ---------------------------------------------------------------------------
function Effects.hit(self: any, x: number, y: number, class: string, vfx: string?, counter: boolean?)
	local big = if class == "H" or class == "SP" or class == "SU" then 1 else 0
	local cols = Effects.Colors[class] or Effects.Colors.M
	if vfx == "shock" or vfx == "kari" or vfx == "vari" or vfx == "elthor" then
		cols = Effects.Colors.electric
		for _ = 1, 3 do
			self:add({ kind = "bolt", x = x, y = y, x2 = x + rnd(-24, 24), y2 = y + rnd(-24, 24), life = 8, c1 = cols[1], c2 = cols[2] })
		end
	elseif vfx == "slash" or vfx == "asura" then
		cols = Effects.Colors.slash
		self:add({ kind = "slashspark", x = x, y = y, life = 10, size = 18 + big * 10, c1 = cols[1], c2 = cols[2], a = rnd(-0.6, 0.6) })
	elseif vfx == "mochi" or vfx == "powermochi" or vfx == "mochispike" then
		cols = Effects.Colors.mochi
		for _ = 1, 5 do
			self:add({ kind = "puff", x = x + rnd(-6, 6), y = y + rnd(-6, 6), vx = rnd(-1.5, 1.5), vy = rnd(-1, 1.5), r = rnd(3, 6), life = 18, c1 = cols[1], c2 = cols[2] })
		end
	elseif vfx == "thread" or vfx == "parasite" or vfx == "birdcage" then
		cols = Effects.Colors.thread
	end
	self:add({ kind = "spark", x = x, y = y, life = 9 + big * 4, size = 10 + big * 8 + (if class == "SU" then 8 else 0), c1 = cols[1], c2 = cols[2], rays = 6 + big * 2 })
	if big > 0 then
		self:add({ kind = "ring", x = x, y = y, life = 12, size = 6, grow = 2.2, c1 = cols[2] })
	end
	if counter then
		self:add({ kind = "ring", x = x, y = y, life = 16, size = 4, grow = 3, c1 = rgb(255, 60, 60) })
	end
end

function Effects.block(self: any, x: number, y: number, facing: number)
	local cols = Effects.Colors.block
	self:add({ kind = "spark", x = x, y = y, life = 8, size = 9, c1 = cols[1], c2 = cols[2], rays = 5 })
	self:add({ kind = "arc", x = x, y = y, facing = facing, life = 8, size = 12, c1 = cols[1] })
end

function Effects.dust(self: any, x: number, n: number?, big: boolean?)
	local cols = Effects.Colors.dust
	for i = 1, (n or 4) do
		self:add({ kind = "puff", x = x + rnd(-10, 10), y = 2, vx = rnd(-1.4, 1.4), vy = rnd(0.2, 0.9), r = rnd(2, if big then 6 else 4), life = 18, c1 = cols[1], c2 = cols[2] })
	end
end

function Effects.smoke(self: any, x: number, y: number, n: number, kind: string?)
	local cols = Effects.Colors[kind or "smoke"] or Effects.Colors.smoke
	for _ = 1, n do
		self:add({ kind = "puff", x = x + rnd(-8, 8), y = y + rnd(-6, 6), vx = rnd(-0.6, 0.6), vy = rnd(0.3, 1.2), r = rnd(3, 6), life = 24, c1 = cols[1], c2 = cols[2] })
	end
end

function Effects.bolt(self: any, x: number, y: number, x2: number, y2: number, life: number?, thick: number?)
	local cols = Effects.Colors.electric
	self:add({ kind = "bolt", x = x, y = y, x2 = x2, y2 = y2, life = life or 6, c1 = cols[1], c2 = cols[2], thick = thick })
end

function Effects.afterimage(self: any, frame: any, x: number, y: number, facing: number, color: number, life: number?)
	self:add({ kind = "after", frame = frame, x = x, y = y, facing = facing, c1 = color, life = life or 10 })
end

function Effects.spike(self: any, x: number, life: number?)
	self:add({ kind = "spike", x = x, y = 0, life = life or 18 })
end

-- Sword/limb trail: call every frame with the current tip; points expire.
function Effects.trail(self: any, key: string, x: number, y: number, color: number)
	local t = self.trails[key]
	if not t then
		t = { pts = {}, color = color }
		self.trails[key] = t
	end
	table.insert(t.pts, { x = x, y = y, age = 0 })
	t.color = color
	t.touched = true
end

-- ---------------------------------------------------------------------------
-- update + draw
-- ---------------------------------------------------------------------------
function Effects.update(self: any)
	self.t += 1
	local keep = {}
	for _, e in self.list do
		e.age += 1
		if e.vx then
			e.x += e.vx
			e.y += e.vy
		end
		if e.age < e.life then
			table.insert(keep, e)
		end
	end
	self.list = keep
	for key, t in self.trails do
		local pts = {}
		for _, p in t.pts do
			p.age += 1
			if p.age < 7 then
				table.insert(pts, p)
			end
		end
		t.pts = pts
		if #pts == 0 and not t.touched then
			self.trails[key] = nil
		end
		t.touched = false
	end
	if self.shake > 0 then
		self.shake = math.max(0, self.shake - 0.35)
	end
	if self.flash > 0 then
		self.flash -= 1
	end
	if self.darken > 0 then
		self.darken -= 1
	end
end

function Effects.draw(self: any, s: Raster.Surface, camX: number, floor: number)
	local function SX(x: number): number
		return math.floor(x - camX)
	end
	local function SY(y: number): number
		return math.floor(floor - y)
	end
	-- trails first (under sparks)
	for _, t in self.trails do
		local pts = t.pts
		for i = 2, #pts do
			local a, b = pts[i - 1], pts[i]
			local th = math.max(1, 4 - b.age // 2)
			Raster.line(s, SX(a.x), SY(a.y), SX(b.x), SY(b.y), t.color, th, b.age > 3)
			if b.age < 3 then
				Raster.line(s, SX(a.x), SY(a.y), SX(b.x), SY(b.y), WHITE, 1)
			end
		end
	end
	for _, e in self.list do
		local k = e.kind
		local p = e.age / e.life
		local x, y = SX(e.x), SY(e.y)
		if k == "spark" then
			local size = e.size * (if p < 0.3 then p / 0.3 else 1 - (p - 0.3) * 0.6)
			local rays = e.rays or 6
			for i = 0, rays - 1 do
				local a = i / rays * math.pi * 2 + e.x * 0.1
				local len = size * (if i % 2 == 0 then 1 else 0.6)
				Raster.line(s, x, y, x + math.cos(a) * len, y + math.sin(a) * len, e.c2, 2)
				Raster.line(s, x, y, x + math.cos(a) * len * 0.7, y + math.sin(a) * len * 0.7, e.c1, 1)
			end
			if p < 0.4 then
				Raster.disc(s, x, y, size * 0.35 + 1, e.c1)
			end
		elseif k == "slashspark" then
			local len = e.size * (1 - p * 0.5)
			local ca, sa = math.cos(e.a), math.sin(e.a)
			Raster.line(s, x - ca * len, y - sa * len, x + ca * len, y + sa * len, e.c2, 3)
			Raster.line(s, x - ca * len, y - sa * len, x + ca * len, y + sa * len, e.c1, 1)
			Raster.line(s, x + sa * len * 0.6, y - ca * len * 0.6, x - sa * len * 0.6, y + ca * len * 0.6, e.c1, 2)
		elseif k == "ring" then
			Raster.ring(s, x, y, e.size + e.age * (e.grow or 1.5), e.c1, if p < 0.5 then 2 else 1)
		elseif k == "arc" then
			for i = -3, 3 do
				local a = i * 0.32
				local r = e.size
				Raster.pixel(s, x - e.facing * math.cos(a) * r, y + math.sin(a) * r, e.c1)
				Raster.pixel(s, x - e.facing * math.cos(a) * (r + 1), y + math.sin(a) * (r + 1), e.c1)
			end
		elseif k == "puff" then
			local r = e.r * (0.7 + p * 0.8)
			if p < 0.75 or (e.age % 2 == 0) then
				Raster.disc(s, x, y, r + 1, INK, p > 0.5)
				Raster.disc(s, x, y, r, e.c2)
				Raster.disc(s, x - 1, y - 1, math.max(1, r - 1.5), e.c1)
			end
		elseif k == "bolt" then
			local segs = 6
			local px, py = x, y
			local tx, ty = SX(e.x2), SY(e.y2)
			for i = 1, segs do
				local t = i / segs
				local nx = x + (tx - x) * t + (if i < segs then rnd(-5, 5) else 0)
				local ny = y + (ty - y) * t + (if i < segs then rnd(-5, 5) else 0)
				Raster.line(s, px, py, nx, ny, e.c2, (e.thick or 1) + 1)
				Raster.line(s, px, py, nx, ny, e.c1, e.thick or 1)
				px, py = nx, ny
			end
		elseif k == "after" then
			Raster.ghost(s, e.frame, x, y, e.facing, e.c1, e.age)
		elseif k == "spike" then
			local h = math.floor(28 * math.min(1, e.age / 4) * (if p > 0.7 then (1 - p) / 0.3 else 1))
			local c1, c2 = Effects.Colors.mochi[1], Effects.Colors.mochi[2]
			for i = -2, 2 do
				local bx = x + i * 7
				local hh = h - math.abs(i) * 5
				if hh > 0 then
					for yy = 0, hh do
						local w = math.max(0, math.floor((hh - yy) / hh * 4))
						Raster.rect(s, bx - w - 1, y - yy, w * 2 + 3, 1, INK)
						Raster.rect(s, bx - w, y - yy, w * 2 + 1, 1, if yy > hh * 0.6 then c1 else c2)
					end
				end
			end
		end
	end
end

return Effects
