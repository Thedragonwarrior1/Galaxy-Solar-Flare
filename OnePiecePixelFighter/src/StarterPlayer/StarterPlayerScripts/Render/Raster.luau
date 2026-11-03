--!strict
--!native
--!optimize 2
-- Software rasteriser over an RGBA8 buffer (the 384x216 virtual screen).
-- Pure Luau: no Roblox APIs, so it can be unit-tested offline. Canvas.luau
-- uploads the finished buffer to an EditableImage each frame.
--
-- Colours are packed u32 in memory order R,G,B,A (buffer.writeu32 little-endian).

local Raster = {}

export type Surface = { buf: buffer, w: number, h: number }

local readu8 = buffer.readu8
local readu32 = buffer.readu32
local writeu32 = buffer.writeu32
local band, bor, rshift = bit32.band, bit32.bor, bit32.rshift

function Raster.rgb(r: number, g: number, b: number, a: number?): number
	return math.floor(r) + math.floor(g) * 256 + math.floor(b) * 65536 + math.floor(a or 255) * 16777216
end

function Raster.unpack(c: number): (number, number, number)
	return band(c, 255), band(rshift(c, 8), 255), band(rshift(c, 16), 255)
end

function Raster.new(w: number, h: number): Surface
	return { buf = buffer.create(w * h * 4), w = w, h = h }
end

function Raster.copyFrom(s: Surface, src: buffer)
	buffer.copy(s.buf, 0, src, 0, math.min(buffer.len(src), s.w * s.h * 4))
end

function Raster.fill(s: Surface, c: number)
	local buf, n = s.buf, s.w * s.h
	writeu32(buf, 0, c)
	local filled = 1
	while filled < n do
		local count = math.min(filled, n - filled)
		buffer.copy(buf, filled * 4, buf, 0, count * 4)
		filled += count
	end
end

function Raster.pixel(s: Surface, x: number, y: number, c: number)
	x, y = math.floor(x), math.floor(y)
	if x >= 0 and y >= 0 and x < s.w and y < s.h then
		writeu32(s.buf, (y * s.w + x) * 4, c)
	end
end

-- 50% blend (cheap translucency for effects)
function Raster.blend(s: Surface, x: number, y: number, c: number)
	x, y = math.floor(x), math.floor(y)
	if x >= 0 and y >= 0 and x < s.w and y < s.h then
		local o = (y * s.w + x) * 4
		local d = readu32(s.buf, o)
		local m = band(rshift(d, 1), 0x7F7F7F) + band(rshift(c, 1), 0x7F7F7F)
		writeu32(s.buf, o, bor(m, 0xFF000000))
	end
end

function Raster.rect(s: Surface, x: number, y: number, w: number, h: number, c: number, halfAlpha: boolean?)
	local x0, y0 = math.max(0, math.floor(x)), math.max(0, math.floor(y))
	local x1, y1 = math.min(s.w, math.floor(x + w)), math.min(s.h, math.floor(y + h))
	if x1 <= x0 or y1 <= y0 then
		return
	end
	local buf, W = s.buf, s.w
	if halfAlpha then
		for yy = y0, y1 - 1 do
			for xx = x0, x1 - 1 do
				local o = (yy * W + xx) * 4
				local d = readu32(buf, o)
				writeu32(buf, o, bor(band(rshift(d, 1), 0x7F7F7F) + band(rshift(c, 1), 0x7F7F7F), 0xFF000000))
			end
		end
		return
	end
	for xx = x0, x1 - 1 do
		writeu32(buf, (y0 * W + xx) * 4, c)
	end
	for yy = y0 + 1, y1 - 1 do
		buffer.copy(buf, (yy * W + x0) * 4, buf, (y0 * W + x0) * 4, (x1 - x0) * 4)
	end
end

function Raster.line(s: Surface, x0: number, y0: number, x1: number, y1: number, c: number, thick: number?, half: boolean?)
	x0, y0, x1, y1 = math.floor(x0), math.floor(y0), math.floor(x1), math.floor(y1)
	local dx, dy = math.abs(x1 - x0), -math.abs(y1 - y0)
	local sx = if x0 < x1 then 1 else -1
	local sy = if y0 < y1 then 1 else -1
	local err = dx + dy
	local t = thick or 1
	local guard = 0
	while guard < 2000 do
		guard += 1
		if t <= 1 then
			if half then
				Raster.blend(s, x0, y0, c)
			else
				Raster.pixel(s, x0, y0, c)
			end
		else
			Raster.rect(s, x0 - t // 2, y0 - t // 2, t, t, c, half)
		end
		if x0 == x1 and y0 == y1 then
			break
		end
		local e2 = 2 * err
		if e2 >= dy then
			err += dy
			x0 += sx
		end
		if e2 <= dx then
			err += dx
			y0 += sy
		end
	end
end

function Raster.disc(s: Surface, cx: number, cy: number, r: number, c: number, half: boolean?)
	local ri = math.ceil(r)
	local r2 = r * r
	for dy = -ri, ri do
		local yy = math.floor(cy) + dy
		if yy >= 0 and yy < s.h then
			local span = math.floor(math.sqrt(math.max(0, r2 - dy * dy)) + 0.5)
			if span > 0 or dy == 0 then
				Raster.rect(s, math.floor(cx) - span, yy, span * 2 + 1, 1, c, half)
			end
		end
	end
end

function Raster.ring(s: Surface, cx: number, cy: number, r: number, c: number, thick: number?, ry: number?)
	local n = math.max(12, math.floor(r * 6))
	local t = thick or 1
	local sy = ry or 1
	for i = 0, n - 1 do
		local a = i / n * math.pi * 2
		local x = cx + math.cos(a) * r
		local y = cy + math.sin(a) * r * sy
		if t <= 1 then
			Raster.pixel(s, x, y, c)
		else
			Raster.rect(s, x - t // 2, y - t // 2, t, t, c)
		end
	end
end

-- Push a column of pixels down by `depth` from row `top` (bending floor effect).
function Raster.sinkColumn(s: Surface, x: number, top: number, depth: number)
	x, top = math.floor(x), math.floor(top)
	if x < 0 or x >= s.w or depth <= 0 then
		return
	end
	local buf, W = s.buf, s.w
	for y = s.h - 1, top + depth, -1 do
		writeu32(buf, (y * W + x) * 4, readu32(buf, ((y - depth) * W + x) * 4))
	end
end

-- darken the whole surface by half (super freeze backdrop)
function Raster.darken(s: Surface)
	local buf = s.buf
	for o = 0, s.w * s.h * 4 - 4, 4 do
		local d = readu32(buf, o)
		writeu32(buf, o, bor(band(rshift(d, 1), 0x7F7F7F), 0xFF000000))
	end
end

-- additive-ish flash toward white (impact frames); amount 0..1 approximated by blends
function Raster.whiteout(s: Surface, strong: boolean)
	local buf = s.buf
	local white = 0xFFFFFFFF
	for o = 0, s.w * s.h * 4 - 4, 4 do
		local d = readu32(buf, o)
		local m = band(rshift(d, 1), 0x7F7F7F) + band(rshift(white, 1), 0x7F7F7F)
		if strong then
			m = band(rshift(m, 1), 0x7F7F7F) + 0x7F7F7F
		end
		writeu32(buf, o, bor(m, 0xFF000000))
	end
end

-- ---------------------------------------------------------------------------
-- palette sprites
-- ---------------------------------------------------------------------------
export type Frame = {
	w: number,
	h: number,
	ox: number,
	oy: number,
	idx: buffer,
	rowOff: { number },
	runs: { number },
}

-- Build per-row opaque spans so blits skip transparent pixels entirely.
function Raster.prepareFrame(w: number, h: number, ox: number, oy: number, idx: buffer): Frame
	local runs = {}
	local rowOff = {}
	for r = 0, h - 1 do
		rowOff[r] = #runs + 1
		local base = r * w
		local x = 0
		while x < w do
			if readu8(idx, base + x) ~= 0 then
				local x0 = x
				while x < w and readu8(idx, base + x) ~= 0 do
					x += 1
				end
				table.insert(runs, x0)
				table.insert(runs, x - x0)
			else
				x += 1
			end
		end
	end
	rowOff[h] = #runs + 1
	return { w = w, h = h, ox = ox, oy = oy, idx = idx, rowOff = rowOff, runs = runs }
end

-- Draw a palette-indexed frame with its origin (the fighter's feet) at (x, y).
-- facing = -1 mirrors horizontally. `solid` replaces every colour except the
-- outline (index 1) for hit flashes / silhouettes.
function Raster.sprite(
	s: Surface,
	f: Frame,
	x: number,
	y: number,
	facing: number,
	pal: { [number]: number },
	solid: number?,
	outlineColor: number?
)
	x, y = math.floor(x), math.floor(y)
	local buf, W, H = s.buf, s.w, s.h
	local idx, w, runs, rowOff = f.idx, f.w, f.runs, f.rowOff
	local oc = outlineColor or pal[1]
	for r = 0, f.h - 1 do
		local sy = y + f.oy + r
		if sy >= 0 and sy < H then
			local rowBase = sy * W
			local srcBase = r * w
			for k = rowOff[r], rowOff[r + 1] - 1, 2 do
				local x0, len = runs[k], runs[k + 1]
				for i = x0, x0 + len - 1 do
					local sx = if facing == 1 then x + f.ox + i else x - f.ox - i - 1
					if sx >= 0 and sx < W then
						local ci = readu8(idx, srcBase + i)
						local c
						if solid then
							c = if ci == 1 then oc else solid
						else
							c = pal[ci]
						end
						writeu32(buf, (rowBase + sx) * 4, c)
					end
				end
			end
		end
	end
end

-- Translucent single-colour silhouette (afterimages): 50% blend, every other pixel row.
function Raster.ghost(s: Surface, f: Frame, x: number, y: number, facing: number, color: number, phase: number)
	x, y = math.floor(x), math.floor(y)
	local buf, W, H = s.buf, s.w, s.h
	local half = band(rshift(color, 1), 0x7F7F7F)
	for r = 0, f.h - 1 do
		local sy = y + f.oy + r
		if sy >= 0 and sy < H and (r + phase) % 2 == 0 then
			local rowBase = sy * W
			for k = f.rowOff[r], f.rowOff[r + 1] - 1, 2 do
				local x0, len = f.runs[k], f.runs[k + 1]
				for i = x0, x0 + len - 1 do
					local sx = if facing == 1 then x + f.ox + i else x - f.ox - i - 1
					if sx >= 0 and sx < W then
						local o = (rowBase + sx) * 4
						local d = readu32(buf, o)
						writeu32(buf, o, bor(band(rshift(d, 1), 0x7F7F7F) + half, 0xFF000000))
					end
				end
			end
		end
	end
end

-- Draw a sprite scaled by an integer factor (portraits, select-screen previews).
function Raster.spriteScaled(s: Surface, f: Frame, x: number, y: number, scale: number, pal: { [number]: number })
	local buf, W, H = s.buf, s.w, s.h
	for r = 0, f.h - 1 do
		for k = f.rowOff[r], f.rowOff[r + 1] - 1, 2 do
			local x0, len = f.runs[k], f.runs[k + 1]
			for i = x0, x0 + len - 1 do
				local c = pal[readu8(f.idx, r * f.w + i)]
				local px, py = x + (f.ox + i) * scale, y + (f.oy + r) * scale
				for yy = py, py + scale - 1 do
					if yy >= 0 and yy < H then
						for xx = px, px + scale - 1 do
							if xx >= 0 and xx < W then
								writeu32(buf, (yy * W + xx) * 4, c)
							end
						end
					end
				end
			end
		end
	end
end

-- ---------------------------------------------------------------------------
-- stage layers: pre-converted RGBA rows + opaque spans, blitted with buffer.copy
-- ---------------------------------------------------------------------------
export type Layer = {
	w: number,
	h: number,
	y: number,
	rgba: buffer,
	rowOff: { number },
	runs: { number },
}

function Raster.prepareLayer(w: number, h: number, y: number, idx: buffer, pal: { [number]: number }): Layer
	local rgba = buffer.create(w * h * 4)
	for i = 0, w * h - 1 do
		local ci = readu8(idx, i)
		if ci ~= 0 then
			writeu32(rgba, i * 4, pal[ci])
		end
	end
	local f = Raster.prepareFrame(w, h, 0, 0, idx)
	return { w = w, h = h, y = y, rgba = rgba, rowOff = f.rowOff, runs = f.runs }
end

local function copySpan(s: Surface, layer: Layer, row: number, sy: number, srcX: number, dstX: number, len: number)
	if dstX < 0 then
		srcX -= dstX
		len += dstX
		dstX = 0
	end
	if dstX + len > s.w then
		len = s.w - dstX
	end
	if len > 0 then
		buffer.copy(s.buf, (sy * s.w + dstX) * 4, layer.rgba, (row * layer.w + srcX) * 4, len * 4)
	end
end

-- offset = layer x shown at screen x 0. wrap = layer repeats horizontally.
function Raster.layer(s: Surface, layer: Layer, offset: number, wrap: boolean, dy: number?)
	offset = math.floor(offset)
	local ddy = math.floor(dy or 0)
	for r = 0, layer.h - 1 do
		local sy = layer.y + r + ddy
		if sy >= 0 and sy < s.h then
			for k = layer.rowOff[r], layer.rowOff[r + 1] - 1, 2 do
				local x0, len = layer.runs[k], layer.runs[k + 1]
				if wrap then
					local base = x0 - (offset % layer.w)
					for rep = -1, math.ceil(s.w / layer.w) do
						local dx = base + rep * layer.w
						if dx < s.w and dx + len > 0 then
							copySpan(s, layer, r, sy, x0, dx, len)
						end
					end
				else
					local dx = x0 - offset
					if dx < s.w and dx + len > 0 then
						copySpan(s, layer, r, sy, x0, dx, len)
					end
				end
			end
		end
	end
end

-- Vertical gradient with 4x4 ordered dithering between stops.
function Raster.gradient(w: number, h: number, stops: { { number } }): buffer
	local b = buffer.create(w * h * 4)
	local bayer = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 }
	local n = #stops
	-- quantise to 4 shades per stop interval for a pixel-art look
	for y = 0, h - 1 do
		local t = y / h * (n - 1)
		local i = math.min(n - 1, math.floor(t) + 1)
		local f = t - (i - 1)
		local steps = 4
		local q = f * steps
		local lo = math.floor(q)
		local frac = q - lo
		for x = 0, w - 1 do
			local th = bayer[(y % 4) * 4 + (x % 4) + 1] / 16
			local level = (lo + (if frac > th then 1 else 0)) / steps
			local a, c = stops[i], stops[math.min(n, i + 1)]
			local r = a[1] + (c[1] - a[1]) * level
			local g = a[2] + (c[2] - a[2]) * level
			local bl = a[3] + (c[3] - a[3]) * level
			writeu32(b, (y * w + x) * 4, Raster.rgb(r, g, bl))
		end
	end
	return b
end

return Raster
