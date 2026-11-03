--!strict
-- Character idle + aura effects (the "CharacterIdleController" and the
-- character half of the "ParticleEffectController").
--
-- Purely visual layers that run on their own timing, attached to the anchors
-- baked into every sprite frame (hands, fingertips, drums, blade tips ...):
--   Gear 2   curling steam wisps rising around the body and arms
--   Gear 4   landing dust on every bounce of the idle
--   Gear 5   the trampoline floor bending under him + dust ripples + cloud wisps
--   Doflamingo  strings that extend from the fingertips, sway and retract
--   Enel     arcs jumping between the drums and the staff, sparks, faint glow
--   Zoro     a glint travelling along the blade
--   Katakuri mochi stretching from the forearm and snapping back
-- Frame events (row.ev) and ground bounce (row.gb) come from FrameData.
-- Nothing here touches hitboxes or damage.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CharacterData = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("CharacterData"))
local Raster = require(script.Parent:WaitForChild("Raster"))
local Effects = require(script.Parent:WaitForChild("Effects"))

local CharacterFx = {}
CharacterFx.__index = CharacterFx

local rgb = Raster.rgb
local WHITE = rgb(255, 255, 255)
local PINK = rgb(255, 150, 210)
local PINK_D = rgb(200, 90, 160)
local ELEC = rgb(120, 220, 255)
local MOCHI = rgb(250, 244, 234)
local MOCHI_D = rgb(214, 198, 192)
local INK = rgb(26, 16, 30)

function CharacterFx.new(fx: any)
	return setmetatable({
		fx = fx,
		t = 0,
		lastRow = { "", "" },
		strings = { {}, {} },
		arcs = { {}, {} },
		glint = { 0, 0 },
		mochi = { {}, {} },
		gb = { 0, 0 },
	}, CharacterFx)
end

local function world(f: any, a: { number }?): (number?, number?)
	if not a then
		return nil, nil
	end
	return f.x + a[1] * f.facing, f.y + a[2]
end

local function rnd(a: number, b: number): number
	return a + math.random() * (b - a)
end

-- Called once per drawn frame for each fighter (before it is drawn).
function CharacterFx.update(self: any, i: number, f: any, row: any)
	self.t += 1
	local fx = self.fx
	local cfg = CharacterData.get(f.char).config
	local aura = cfg.Theme and cfg.Theme.aura
	local anc = row and row.anc or {}
	local idle = f.anim == "Idle"
	local t = self.t + i * 7
	self.gb[i] = if idle and row and row.gb then row.gb else 0

	-- frame events (fire once when the row changes)
	local key = f.anim .. ":" .. tostring(f.row)
	if key ~= self.lastRow[i] then
		self.lastRow[i] = key
		local ev = row and row.ev
		if ev == "dust" then
			fx:dust(f.x, 4, false)
		elseif ev == "bigdust" then
			fx:dust(f.x, 8, true)
		elseif ev == "pat" then
			local hx = world(f, anc.handF)
			fx:dust(hx or f.x, 3, false)
			fx:add({ kind = "ring", x = hx or f.x, y = 1, ry = 0.3, life = 14, size = 4, grow = 1.6, c1 = rgb(255, 255, 255) })
		end
	end
	if f.ko then
		return
	end

	if aura == "steam" then
		-- several separate wisps: each curls upward, grows, then thins out
		local every = if idle then 3 else 6
		if t % every == 0 then
			local spots = { anc.chest, anc.handN, anc.handF, anc.head }
			local a = spots[(t // every) % #spots + 1]
			local x, y = world(f, a)
			if x then
				fx:add({
					kind = "wisp",
					x = x + rnd(-6, 6),
					y = (y :: number) + rnd(-8, 4),
					vx = 0,
					vy = rnd(0.45, 0.85),
					curl = rnd(0, 6.28),
					r = rnd(1.2, 2),
					life = math.random(22, 34),
					c1 = Effects.Colors.steam[1],
					c2 = Effects.Colors.steam[2],
				})
			end
		end
	elseif aura == "smoke" then
		if t % 7 == 0 then
			fx:add({
				kind = "wisp",
				x = f.x + rnd(-24, 24),
				y = f.y + rnd(46, 74),
				vx = 0,
				vy = 0.35,
				curl = rnd(0, 6),
				r = 2.2,
				life = 24,
				c1 = Effects.Colors.smoke[1],
				c2 = Effects.Colors.smoke[2],
			})
		end
	elseif aura == "cloud" then
		if t % (if idle then 5 else 9) == 0 then
			local x, y = world(f, anc.head)
			if x then
				fx:add({
					kind = "wisp",
					x = x + rnd(-14, 14),
					y = (y :: number) + rnd(-4, 14),
					vx = rnd(-0.2, 0.2),
					vy = 0.25,
					curl = rnd(0, 6),
					r = 1.6,
					life = 28,
					c1 = WHITE,
					c2 = rgb(222, 228, 252),
				})
			end
		end
	elseif aura == "threads" and idle then
		local list = self.strings[i]
		if #list < 4 and math.random() < 0.07 then
			table.insert(list, {
				hand = if math.random() < 0.5 then "fingersN" else "fingersF",
				ang = rnd(-0.9, 0.6),
				len = 0,
				max = rnd(22, 46),
				age = 0,
				life = math.random(40, 80),
				sway = rnd(0, 6),
			})
		end
	elseif aura == "sparks" then
		if t % (if idle then 9 else 13) == 0 then
			local x, y = world(f, anc.chest)
			if x then
				fx:bolt(x + rnd(-12, 12), (y :: number) + rnd(-14, 20), x + rnd(-18, 18), (y :: number) + rnd(-20, 24), 4)
			end
		end
		if idle and math.random() < 0.04 then
			local pts = { anc.drum0, anc.drum1, anc.drum2, anc.drum3, anc.staffTip }
			local a = pts[math.random(1, #pts)]
			local b = pts[math.random(1, #pts)]
			if a and b and a ~= b then
				table.insert(self.arcs[i], { a = a, b = b, life = 7 })
			end
		end
	elseif aura == "slash" and idle then
		if self.glint[i] <= 0 and math.random() < 0.012 then
			self.glint[i] = 10
		end
	elseif aura == "mochi" and idle then
		local list = self.mochi[i]
		if #list < 1 and math.random() < 0.02 then
			table.insert(list, { age = 0, life = 36, side = if math.random() < 0.6 then "N" else "F" })
		end
		if t % 17 == 0 then
			local x, y = world(f, anc.handN)
			if x then
				fx:add({
					kind = "puff",
					x = x + rnd(-4, 4),
					y = (y :: number) + rnd(-3, 3),
					vx = rnd(-0.2, 0.2),
					vy = 0.3,
					r = 1.6,
					life = 16,
					c1 = MOCHI,
					c2 = MOCHI_D,
				})
			end
		end
	end
end

-- Gear 5's bouncing floor: a separate visual layer drawn under the fighter.
function CharacterFx.drawGround(
	self: any,
	R: any,
	s: any,
	i: number,
	f: any,
	camX: number,
	floor: number,
	shx: number,
	shy: number,
	tint: { number }?
)
	local depth = self.gb[i]
	if depth <= 0 or f.airborne then
		return
	end
	local cx = math.floor(f.x - camX + shx)
	local hw = 30
	local hi = if tint then rgb(tint[1], tint[2], tint[3]) else WHITE
	if R.sinkColumn then
		for dx = -hw, hw do
			local c = math.cos(dx / hw * math.pi / 2)
			local d = math.floor(depth * c * c + 0.5)
			if d > 0 then
				R.sinkColumn(s, cx + dx, floor + shy, d)
			end
		end
	else
		R.rect(s, cx - hw, floor + shy, hw * 2 + 1, depth, INK, true)
	end
	-- lit rim of the stretched surface + raised lips either side
	for dx = -hw, hw, 2 do
		local c = math.cos(dx / hw * math.pi / 2)
		local d = math.floor(depth * c * c + 0.5)
		R.rect(s, cx + dx, floor + shy + d, 2, 1, hi, true)
	end
	R.rect(s, cx - hw - 4, floor + shy - 1, 4, 1, hi, true)
	R.rect(s, cx + hw + 1, floor + shy - 1, 4, 1, hi, true)
end

-- Attached effects drawn after the fighter (strings, arcs, glint, mochi).
function CharacterFx.drawAttached(self: any, R: any, s: any, i: number, f: any, row: any, camX: number, floor: number)
	local anc = row and row.anc or {}
	local function SX(x: number): number
		return math.floor(x - camX)
	end
	local function SY(y: number): number
		return math.floor(floor - y)
	end
	-- Doflamingo's strings
	local list = self.strings[i]
	for k = #list, 1, -1 do
		local st = list[k]
		st.age += 1
		local grow = math.min(1, st.age / 10)
		local shrink = math.clamp((st.life - st.age) / 12, 0, 1)
		st.len = st.max * math.min(grow, shrink)
		local x, y = world(f, anc[st.hand] or anc.handN)
		if x and st.len > 1 and f.anim == "Idle" then
			local a = st.ang + math.sin(st.age * 0.12 + st.sway) * 0.25
			local mx = x + f.facing * math.cos(a) * st.len * 0.55
			local my = (y :: number) + math.sin(a) * st.len * 0.55 - 2
			local ex = x + f.facing * math.cos(a + 0.15) * st.len
			local ey = (y :: number) + math.sin(a + 0.15) * st.len - 1
			R.line(s, SX(x), SY(y :: number), SX(mx), SY(my), WHITE, 1, true)
			R.line(s, SX(mx), SY(my), SX(ex), SY(ey), PINK, 1, true)
			if st.age % 6 < 3 then
				R.pixel(s, SX(ex), SY(ey), WHITE)
			end
		end
		if st.age >= st.life or f.anim ~= "Idle" then
			table.remove(list, k)
		end
	end
	-- Enel's arcs between drums / staff
	local arcs = self.arcs[i]
	for k = #arcs, 1, -1 do
		local a = arcs[k]
		a.life -= 1
		local x1, y1 = world(f, a.a)
		local x2, y2 = world(f, a.b)
		if x1 and x2 then
			local px, py = SX(x1), SY(y1 :: number)
			local tx, ty = SX(x2), SY(y2 :: number)
			for seg = 1, 5 do
				local t = seg / 5
				local nx = px + (tx - px) / (6 - seg) + (if seg < 5 then rnd(-3, 3) else 0)
				local ny = py + (ty - py) / (6 - seg) + (if seg < 5 then rnd(-3, 3) else 0)
				R.line(s, px, py, nx, ny, ELEC, 2, true)
				R.line(s, px, py, nx, ny, WHITE, 1)
				px, py = nx, ny
			end
		end
		if a.life <= 0 then
			table.remove(arcs, k)
		end
	end
	if f.char == "Enel" and f.anim == "Idle" and self.t % 3 == 0 then
		for _, key in { "drum0", "drum1", "drum2", "drum3" } do
			local x, y = world(f, anc[key])
			if x and math.random() < 0.3 then
				R.pixel(s, SX(x + rnd(-6, 6)), SY((y :: number) + rnd(-6, 6)), ELEC)
			end
		end
	end
	-- Zoro's blade glint travelling base -> tip
	if self.glint[i] > 0 then
		local g = self.glint[i]
		self.glint[i] -= 1
		local bx, by = world(f, anc.bladeNBase)
		local tx, ty = world(f, anc.bladeNTip)
		if bx and tx and f.anim == "Idle" then
			local t = 1 - g / 10
			local gx, gy = SX(bx + (tx - bx) * t), SY((by :: number) + ((ty :: number) - (by :: number)) * t)
			R.line(s, gx - 3, gy, gx + 3, gy, WHITE, 1)
			R.line(s, gx, gy - 3, gx, gy + 3, WHITE, 1)
			R.pixel(s, gx, gy, rgb(210, 255, 210))
		end
	end
	-- Katakuri's mochi stretch
	local ml = self.mochi[i]
	for k = #ml, 1, -1 do
		local m = ml[k]
		m.age += 1
		local x, y = world(f, anc["hand" .. m.side])
		if x and f.anim == "Idle" then
			local p = m.age / m.life
			local stretch = math.sin(math.min(1, p * 1.4) * math.pi) * 12
			local hx, hy = SX(x), SY(y :: number)
			local bx, by = hx - f.facing * 2, hy + stretch
			R.line(s, hx, hy, bx, by, INK, 4)
			R.line(s, hx, hy, bx, by, MOCHI_D, 3)
			R.line(s, hx, hy, bx, by - 1, MOCHI, 1)
			R.disc(s, bx, by, 2.5, INK)
			R.disc(s, bx, by, 2, MOCHI)
		end
		if m.age >= m.life or f.anim ~= "Idle" then
			table.remove(ml, k)
		end
	end
end

return CharacterFx
