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
local STYLE_COLORS = {
	steam = { rgb(255, 240, 246), rgb(255, 120, 150) },
	smoke = { rgb(255, 220, 220), rgb(170, 30, 50) },
	cloud = { rgb(255, 255, 255), rgb(190, 150, 255) },
	threads = { rgb(255, 255, 255), rgb(255, 120, 200) },
	sparks = { rgb(255, 255, 255), rgb(120, 220, 255) },
	slash = { rgb(255, 255, 255), rgb(130, 255, 140) },
	mochi = { rgb(255, 252, 244), rgb(220, 200, 196) },
}

function Effects.hit(self: any, x: number, y: number, class: string, vfx: string?, counter: boolean?, style: string?)
	local power = if class == "SU" then 3 elseif class == "H" or class == "SP" then 2 elseif class == "M" then 1 else 0
	local sc = STYLE_COLORS[style or ""]
	-- character-specific impact identities
	if style == "smoke" then
		self:add({ kind = "ring", x = x, y = y, life = 12 + power * 3, size = 5, grow = 2 + power * 0.6, c1 = sc[2], thick = 3 })
		self:smoke(x, y, 2 + power * 2, "smoke")
	elseif style == "cloud" then
		self:add({ kind = "star", x = x, y = y, life = 10 + power * 2, size = 8 + power * 4, c1 = sc[1], c2 = sc[2], a = math.random() })
		self:smoke(x, y, 1 + power, "smoke")
	elseif style == "threads" then
		self:add({ kind = "rays", x = x, y = y, life = 9 + power * 2, size = 12 + power * 6, c1 = sc[1], c2 = sc[2], a = math.random() * 6 })
	elseif style == "sparks" then
		for _ = 1, 2 + power do
			self:add({ kind = "bolt", x = x, y = y, x2 = x + rnd(-28, 28), y2 = y + rnd(-28, 28), life = 7, c1 = sc[1], c2 = sc[2] })
		end
	elseif style == "slash" then
		for k = 1, 1 + math.min(power, 2) do
			self:add({
				kind = "slashspark",
				x = x + rnd(-3, 3),
				y = y + rnd(-3, 3),
				life = 10,
				size = 14 + power * 6,
				c1 = sc[1],
				c2 = sc[2],
				a = (k - 1.5) * 1.1 + rnd(-0.2, 0.2),
			})
		end
	elseif style == "mochi" then
		self:add({ kind = "splat", x = x, y = y, life = 14 + power * 2, size = 4 + power * 2, c1 = sc[1], c2 = sc[2] })
		for _ = 1, 3 + power do
			self:add({
				kind = "puff",
				x = x,
				y = y,
				vx = rnd(-1.6, 1.6),
				vy = rnd(0.5, 2),
				gravity = 0.15,
				r = rnd(1.5, 2.5),
				life = 26,
				c1 = sc[1],
				c2 = sc[2],
			})
		end
	elseif style == "steam" then
		for _ = 1, 2 + power do
			self:add({
				kind = "wisp",
				x = x + rnd(-4, 4),
				y = y + rnd(-4, 4),
				vx = 0,
				vy = rnd(0.5, 1),
				curl = rnd(0, 6),
				r = 2,
				life = 20,
				c1 = sc[1],
				c2 = sc[2],
			})
		end
	end
	-- debris pixels for heavier hits
	if power >= 2 and sc then
		for _ = 1, 4 + power * 2 do
			self:add({ kind = "bit", x = x, y = y, vx = rnd(-2.6, 2.6), vy = rnd(0.5, 3), gravity = 0.2, life = 22, c1 = sc[2] })
		end
	end
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
			self:add({
				kind = "puff",
				x = x + rnd(-6, 6),
				y = y + rnd(-6, 6),
				vx = rnd(-1.5, 1.5),
				vy = rnd(-1, 1.5),
				r = rnd(3, 6),
				life = 18,
				c1 = cols[1],
				c2 = cols[2],
			})
		end
	elseif vfx == "thread" or vfx == "parasite" or vfx == "birdcage" then
		cols = Effects.Colors.thread
	end
	self:add({
		kind = "spark",
		x = x,
		y = y,
		life = 9 + big * 4,
		size = 10 + big * 8 + (if class == "SU" then 8 else 0),
		c1 = cols[1],
		c2 = cols[2],
		rays = 6 + big * 2,
	})
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
		self:add({
			kind = "puff",
			x = x + rnd(-10, 10),
			y = 2,
			vx = rnd(-1.4, 1.4),
			vy = rnd(0.2, 0.9),
			r = rnd(2, if big then 6 else 4),
			life = 18,
			c1 = cols[1],
			c2 = cols[2],
		})
	end
end

function Effects.smoke(self: any, x: number, y: number, n: number, kind: string?)
	local cols = Effects.Colors[kind or "smoke"] or Effects.Colors.smoke
	for _ = 1, n do
		self:add({
			kind = "puff",
			x = x + rnd(-8, 8),
			y = y + rnd(-6, 6),
			vx = rnd(-0.6, 0.6),
			vy = rnd(0.3, 1.2),
			r = rnd(3, 6),
			life = 24,
			c1 = cols[1],
			c2 = cols[2],
		})
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
			if e.gravity then
				e.vy -= e.gravity
			end
			if e.curl then
				e.vx = math.sin(e.age * 0.2 + e.curl) * 0.4
			end
			e.x += e.vx
			e.y += e.vy
			if e.gravity and e.y < 0 then
				e.y = 0
				e.vy = -e.vy * 0.3
				e.vx *= 0.6
			end
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

function Effects.draw(self: any, s: any, camX: number, floor: number, backend: any?)
	local R = backend or Raster
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
			R.line(s, SX(a.x), SY(a.y), SX(b.x), SY(b.y), t.color, th, b.age > 3)
			if b.age < 3 then
				R.line(s, SX(a.x), SY(a.y), SX(b.x), SY(b.y), WHITE, 1)
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
				R.line(s, x, y, x + math.cos(a) * len, y + math.sin(a) * len, e.c2, 2)
				R.line(s, x, y, x + math.cos(a) * len * 0.7, y + math.sin(a) * len * 0.7, e.c1, 1)
			end
			if p < 0.4 then
				R.disc(s, x, y, size * 0.35 + 1, e.c1)
			end
		elseif k == "slashspark" then
			local len = e.size * (1 - p * 0.5)
			local ca, sa = math.cos(e.a), math.sin(e.a)
			R.line(s, x - ca * len, y - sa * len, x + ca * len, y + sa * len, e.c2, 3)
			R.line(s, x - ca * len, y - sa * len, x + ca * len, y + sa * len, e.c1, 1)
			R.line(s, x + sa * len * 0.6, y - ca * len * 0.6, x - sa * len * 0.6, y + ca * len * 0.6, e.c1, 2)
		elseif k == "ring" then
			R.ring(s, x, y, e.size + e.age * (e.grow or 1.5), e.c1, if p < 0.5 then (e.thick or 2) else 1, e.ry)
		elseif k == "arc" then
			for i = -3, 3 do
				local a = i * 0.32
				local r = e.size
				R.pixel(s, x - e.facing * math.cos(a) * r, y + math.sin(a) * r, e.c1)
				R.pixel(s, x - e.facing * math.cos(a) * (r + 1), y + math.sin(a) * (r + 1), e.c1)
			end
		elseif k == "puff" then
			local r = e.r * (0.7 + p * 0.8)
			if p < 0.75 or (e.age % 2 == 0) then
				R.disc(s, x, y, r + 1, INK, p > 0.5)
				R.disc(s, x, y, r, e.c2)
				R.disc(s, x - 1, y - 1, math.max(1, r - 1.5), e.c1)
			end
		elseif k == "wisp" then
			local r = e.r * (1 + p * 1.6)
			local fade = p > 0.6
			if not fade or e.age % 2 == 0 then
				R.disc(s, x, y, r, e.c2, fade)
				R.disc(s, x - 1, y - 1, math.max(1, r - 1), e.c1, fade)
			end
		elseif k == "bit" then
			if p < 0.8 or e.age % 2 == 0 then
				R.rect(s, x, y, 2, 2, e.c1)
			end
		elseif k == "star" then
			local r = e.size * (if p < 0.25 then p / 0.25 else 1)
			for i = 0, 4 do
				local a0 = e.a + i / 5 * math.pi * 2
				local a1 = a0 + math.pi / 5
				local a2 = a0 + math.pi * 2 / 5
				local ox, oy = x + math.cos(a0) * r, y + math.sin(a0) * r
				local ix, iy = x + math.cos(a1) * r * 0.45, y + math.sin(a1) * r * 0.45
				local nx, ny = x + math.cos(a2) * r, y + math.sin(a2) * r
				R.line(s, ox, oy, ix, iy, e.c2, 2)
				R.line(s, ix, iy, nx, ny, e.c2, 2)
			end
			if p < 0.5 then
				R.disc(s, x, y, r * 0.35, e.c1)
			end
		elseif k == "rays" then
			local len = e.size * math.sin(math.min(1, p * 1.3) * math.pi)
			for i = 0, 7 do
				local a = e.a + i / 8 * math.pi * 2
				R.line(
					s,
					x + math.cos(a) * 3,
					y + math.sin(a) * 3,
					x + math.cos(a) * len,
					y + math.sin(a) * len,
					if i % 2 == 0 then e.c1 else e.c2,
					1
				)
			end
		elseif k == "splat" then
			local r = e.size * (0.6 + math.min(1, p * 2) * 0.8)
			R.disc(s, x, y, r + 1, INK, p > 0.6)
			R.disc(s, x, y, r, e.c2, p > 0.6)
			R.disc(s, x - 1, y - 1, math.max(1, r - 1.5), e.c1, p > 0.6)
		elseif k == "bolt" then
			local segs = 6
			local px, py = x, y
			local tx, ty = SX(e.x2), SY(e.y2)
			for i = 1, segs do
				local t = i / segs
				local nx = x + (tx - x) * t + (if i < segs then rnd(-5, 5) else 0)
				local ny = y + (ty - y) * t + (if i < segs then rnd(-5, 5) else 0)
				R.line(s, px, py, nx, ny, e.c2, (e.thick or 1) + 1)
				R.line(s, px, py, nx, ny, e.c1, e.thick or 1)
				px, py = nx, ny
			end
		elseif k == "after" then
			R.ghost(s, e.frame, x, y, e.facing, e.c1, e.age)
		elseif k == "spike" then
			local h = math.floor(28 * math.min(1, e.age / 4) * (if p > 0.7 then (1 - p) / 0.3 else 1))
			local c1, c2 = Effects.Colors.mochi[1], Effects.Colors.mochi[2]
			for i = -2, 2 do
				local bx = x + i * 7
				local hh = h - math.abs(i) * 5
				if hh > 0 then
					for yy = 0, hh do
						local w = math.max(0, math.floor((hh - yy) / hh * 4))
						R.rect(s, bx - w - 1, y - yy, w * 2 + 3, 1, INK)
						R.rect(s, bx - w, y - yy, w * 2 + 1, 1, if yy > hh * 0.6 then c1 else c2)
					end
				end
			end
		end
	end
end

return Effects
