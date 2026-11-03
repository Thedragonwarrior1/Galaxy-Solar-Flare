--!strict
-- Fallback renderer backend that draws the same pixel art with ordinary GUI
-- Frames, so the game works in published experiences WITHOUT EditableImage
-- (which Roblox only allows for 13+ ID-verified owners with
-- "Allow Mesh & Image APIs" enabled).
--
-- It exposes the same drawing functions as Raster.luau, so the Renderer,
-- Effects, Stage, HUD portraits and select-screen previews run unchanged:
--   * primitives (rect, line, disc, ring, pixel) come from pools of Frames and
--     are re-positioned every frame (immediate mode);
--   * sprites are drawn as merged same-colour rectangles in pooled containers
--     that are only repainted when the shown frame/facing/palette changes;
--   * stage layers are built once as static rectangles and only moved.
-- Draw order is reproduced with increasing ZIndex inside a "Scene" frame.

local Raster = require(script.Parent:WaitForChild("Raster"))

local GuiRaster = setmetatable({}, { __index = Raster }) :: any
GuiRaster.isGui = true
GuiRaster.sinkColumn = false -- pixel shifting needs a framebuffer; CharacterFx draws an approximation instead

local readu8 = buffer.readu8
local readu32 = buffer.readu32

local colorCache: { [number]: Color3 } = {}
local function col(c: number): Color3
	local v = colorCache[c]
	if not v then
		local r, g, b = Raster.unpack(c)
		v = Color3.fromRGB(r, g, b)
		colorCache[c] = v
	end
	return v
end
GuiRaster.color = col

export type GuiSurface = {
	isGui: boolean,
	root: Frame,
	w: number,
	h: number,
	z: number,
	pools: { [string]: { GuiObject } },
	used: { [string]: number },
	sprites: { any },
	retained: { [any]: GuiObject },
	seen: { [any]: boolean },
	scale: number,
}

function GuiRaster.newSurface(parent: Instance, w: number, h: number): GuiSurface
	local root = Instance.new("Frame")
	root.Name = "Scene"
	root.BackgroundTransparency = 1
	root.BorderSizePixel = 0
	root.Size = UDim2.fromScale(1, 1)
	root.ClipsDescendants = true
	root.ZIndex = 1
	root.Parent = parent
	return {
		isGui = true,
		root = root,
		w = w,
		h = h,
		z = 0,
		pools = { rect = {}, disc = {}, ring = {} },
		used = { rect = 0, disc = 0, ring = 0 },
		sprites = {},
		retained = {},
		seen = {},
		lastSeen = {},
		frameNo = 0,
		scale = 1,
	}
end

function GuiRaster.begin(s: GuiSurface)
	s.z = 0
	for k in s.used do
		s.used[k] = 0
	end
	table.clear(s.seen)
	for _, sp in s.sprites do
		sp.claimed = false
	end
end

function GuiRaster.finish(s: GuiSurface)
	for kind, list in s.pools do
		for i = s.used[kind] + 1, #list do
			local f = list[i]
			if f.Visible then
				f.Visible = false
			end
		end
	end
	for _, sp in s.sprites do
		if not sp.claimed and sp.frame.Visible then
			sp.frame.Visible = false
		end
	end
	s.frameNo += 1
	for key, obj in s.retained do
		if s.seen[key] then
			s.lastSeen[key] = s.frameNo
		else
			if obj.Visible then
				obj.Visible = false
			end
			-- free layers of stages that are no longer shown (e.g. after a match)
			if s.frameNo - (s.lastSeen[key] or s.frameNo) > 600 then
				obj:Destroy()
				s.retained[key] = nil
				s.lastSeen[key] = nil
			end
		end
	end
end

local function nextZ(s: GuiSurface): number
	s.z += 1
	return s.z
end

local function prim(s: GuiSurface, kind: string): Frame
	local i = s.used[kind] + 1
	s.used[kind] = i
	local list = s.pools[kind]
	local f = list[i] :: Frame?
	if not f then
		local nf = Instance.new("Frame")
		nf.BorderSizePixel = 0
		nf.AnchorPoint = Vector2.new(0, 0)
		if kind == "disc" or kind == "ring" then
			local c = Instance.new("UICorner")
			c.CornerRadius = UDim.new(0.5, 0)
			c.Parent = nf
		end
		if kind == "ring" then
			nf.BackgroundTransparency = 1
			local st = Instance.new("UIStroke")
			st.Name = "Stroke"
			st.Parent = nf
		end
		nf.Parent = s.root
		list[i] = nf
		f = nf
	end
	local fr = f :: Frame
	fr.Visible = true
	fr.ZIndex = nextZ(s)
	return fr
end

local function place(s: GuiSurface, f: GuiObject, x: number, y: number, w: number, h: number)
	f.Position = UDim2.fromScale(x / s.w, y / s.h)
	f.Size = UDim2.fromScale(w / s.w, h / s.h)
end

-- ---------------------------------------------------------------------------
-- primitives
-- ---------------------------------------------------------------------------
function GuiRaster.rect(s: GuiSurface, x: number, y: number, w: number, h: number, c: number, halfAlpha: boolean?)
	if w <= 0 or h <= 0 then
		return
	end
	local f = prim(s, "rect")
	f.AnchorPoint = Vector2.zero
	f.Rotation = 0
	f.BackgroundColor3 = col(c)
	f.BackgroundTransparency = if halfAlpha then 0.5 else 0
	place(s, f, math.floor(x), math.floor(y), math.floor(w), math.floor(h))
end

function GuiRaster.fill(s: GuiSurface, c: number)
	GuiRaster.rect(s, 0, 0, s.w, s.h, c)
end

function GuiRaster.pixel(s: GuiSurface, x: number, y: number, c: number)
	GuiRaster.rect(s, x, y, 1, 1, c)
end

function GuiRaster.blend(s: GuiSurface, x: number, y: number, c: number)
	GuiRaster.rect(s, x, y, 1, 1, c, true)
end

function GuiRaster.line(s: GuiSurface, x0: number, y0: number, x1: number, y1: number, c: number, thick: number?, half: boolean?)
	local t = thick or 1
	local dx, dy = x1 - x0, y1 - y0
	local len = math.sqrt(dx * dx + dy * dy) + t
	local f = prim(s, "rect")
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.BackgroundColor3 = col(c)
	f.BackgroundTransparency = if half then 0.5 else 0
	f.Rotation = math.deg(math.atan2(dy, dx))
	-- rotation happens in screen pixels; size the bar in pixel-equivalent scale units
	f.Position = UDim2.fromScale((x0 + x1 + 1) / 2 / s.w, (y0 + y1 + 1) / 2 / s.h)
	f.Size = UDim2.fromScale(len / s.w, t / s.h)
end

function GuiRaster.disc(s: GuiSurface, cx: number, cy: number, r: number, c: number, half: boolean?)
	local f = prim(s, "disc")
	f.BackgroundColor3 = col(c)
	f.BackgroundTransparency = if half then 0.5 else 0
	local d = r * 2 + 1
	place(s, f, math.floor(cx) - r, math.floor(cy) - r, d, d)
end

function GuiRaster.ring(s: GuiSurface, cx: number, cy: number, r: number, c: number, thick: number?, ry: number?)
	local f = prim(s, "ring")
	local st = f:FindFirstChild("Stroke") :: UIStroke
	st.Color = col(c)
	st.Thickness = math.max(1, (thick or 1) * s.scale)
	local d = r * 2 + 1
	local dy = d * (ry or 1)
	place(s, f, cx - r, cy - dy / 2, d, dy)
end

function GuiRaster.darken(s: GuiSurface)
	GuiRaster.rect(s, 0, 0, s.w, s.h, 0xFF000000, true)
end

function GuiRaster.whiteout(s: GuiSurface, strong: boolean)
	local f = prim(s, "rect")
	f.AnchorPoint = Vector2.zero
	f.Rotation = 0
	f.BackgroundColor3 = Color3.new(1, 1, 1)
	f.BackgroundTransparency = if strong then 0.25 else 0.55
	place(s, f, 0, 0, s.w, s.h)
end

-- ---------------------------------------------------------------------------
-- sprites: merged rectangles, cached per (frame, palette/solid)
-- ---------------------------------------------------------------------------
local rectCache: { [any]: { [any]: { number } } } = setmetatable({}, { __mode = "k" }) :: any

-- flat list: x, y, w, h, colour  (frame-local coordinates, facing right)
local function buildRects(f: Raster.Frame, pal: { [number]: number }, solid: number?, outline: number?): { number }
	local out = {}
	local active: { [string]: number } = {} -- key -> index of rect in `out`
	local w = f.w
	for r = 0, f.h - 1 do
		local cur: { [string]: number } = {}
		for k = f.rowOff[r], f.rowOff[r + 1] - 1, 2 do
			local x0, len = f.runs[k], f.runs[k + 1]
			local x = x0
			local xend = x0 + len
			while x < xend do
				local ci = readu8(f.idx, r * w + x)
				local c = if solid then (if ci == 1 then (outline or pal[1]) else solid) else pal[ci]
				local sx = x
				x += 1
				while x < xend do
					local cj = readu8(f.idx, r * w + x)
					local cc = if solid then (if cj == 1 then (outline or pal[1]) else solid) else pal[cj]
					if cc ~= c then
						break
					end
					x += 1
				end
				local key = sx .. ":" .. (x - sx) .. ":" .. c
				local ai = active[key]
				if ai then
					out[ai + 3] += 1 -- extend the rect from the previous row downward
					cur[key] = ai
				else
					local n = #out
					out[n + 1] = sx
					out[n + 2] = r
					out[n + 3] = x - sx
					out[n + 4] = 1
					out[n + 5] = c
					cur[key] = n + 1
				end
			end
		end
		active = cur
	end
	return out
end

local function rectsFor(f: Raster.Frame, pal: any, solid: number?, outline: number?): { number }
	local byFrame = rectCache[f]
	if not byFrame then
		byFrame = setmetatable({}, { __mode = "k" }) :: any
		rectCache[f] = byFrame
	end
	local key: any = if solid then (solid + (outline or 0) * 0.5) else pal
	local r = (byFrame :: any)[key]
	if not r then
		r = buildRects(f, pal, solid, outline);
		(byFrame :: any)[key] = r
	end
	return r
end

local function newSpriteSlot(s: GuiSurface): any
	local holder = Instance.new("Frame")
	holder.Name = "Sprite"
	holder.BackgroundTransparency = 1
	holder.BorderSizePixel = 0
	holder.Parent = s.root
	local slot = { frame = holder, kids = {}, key = nil, claimed = false, last = 0 }
	table.insert(s.sprites, slot)
	return slot
end

local function paint(slot: any, rects: { number }, fw: number, fh: number, facing: number)
	local kids = slot.kids
	local n = #rects // 5
	for i = 1, n do
		local o = (i - 1) * 5
		local x, y, w, h, c = rects[o + 1], rects[o + 2], rects[o + 3], rects[o + 4], rects[o + 5]
		if facing ~= 1 then
			x = fw - x - w
		end
		local k = kids[i]
		if not k then
			k = Instance.new("Frame")
			k.BorderSizePixel = 0
			k.Parent = slot.frame
			kids[i] = k
		end
		k.Position = UDim2.fromScale(x / fw, y / fh)
		k.Size = UDim2.fromScale(w / fw, h / fh)
		k.BackgroundColor3 = col(c)
		if not k.Visible then
			k.Visible = true
		end
	end
	for i = n + 1, #kids do
		if kids[i].Visible then
			kids[i].Visible = false
		end
	end
end

local tick = 0
function GuiRaster.sprite(
	s: GuiSurface,
	f: Raster.Frame,
	x: number,
	y: number,
	facing: number,
	pal: { [number]: number },
	solid: number?,
	outlineColor: number?
)
	tick += 1
	local rects = rectsFor(f, pal, solid, outlineColor)
	local key = rects
	-- reuse a slot already showing exactly this image (no repaint), else the least recently used
	local slot = nil
	for _, sp in s.sprites do
		if not sp.claimed and sp.key == key and sp.facing == facing then
			slot = sp
			break
		end
	end
	if not slot then
		local best = nil
		for _, sp in s.sprites do
			if not sp.claimed and (best == nil or sp.last < best.last) then
				best = sp
			end
		end
		if best == nil or (#s.sprites < 8 and best.key ~= nil) then
			best = newSpriteSlot(s)
		end
		slot = best
		paint(slot, rects, f.w, f.h, facing)
		slot.key = key
		slot.facing = facing
	end
	slot.claimed = true
	slot.last = tick
	local left = if facing == 1 then math.floor(x) + f.ox else math.floor(x) - f.ox - f.w
	local holder = slot.frame
	holder.Position = UDim2.fromScale(left / s.w, (math.floor(y) + f.oy) / s.h)
	holder.Size = UDim2.fromScale(f.w / s.w, f.h / s.h)
	holder.ZIndex = nextZ(s)
	if not holder.Visible then
		holder.Visible = true
	end
end

function GuiRaster.ghost(_s: GuiSurface, _f: Raster.Frame, _x: number, _y: number, _facing: number, _color: number, _phase: number)
	-- afterimages are skipped in the fallback renderer (too many frames for GUI)
end

function GuiRaster.spriteScaled(s: GuiSurface, f: Raster.Frame, x: number, y: number, _scale: number, pal: { [number]: number })
	GuiRaster.sprite(s, f, x, y, 1, pal)
end

-- ---------------------------------------------------------------------------
-- stage: retained, built once, moved every frame
-- ---------------------------------------------------------------------------
local function retained(s: GuiSurface, key: any, build: () -> GuiObject): GuiObject
	local obj = s.retained[key]
	if not obj then
		obj = build()
		s.retained[key] = obj
	end
	s.seen[key] = true
	obj.ZIndex = nextZ(s)
	if not obj.Visible then
		obj.Visible = true
	end
	return obj
end

function GuiRaster.sky(s: GuiSurface, stops: { { number } })
	retained(s, stops, function()
		local holder = Instance.new("Frame")
		holder.Name = "Sky"
		holder.BorderSizePixel = 0
		holder.BackgroundTransparency = 1
		holder.Size = UDim2.fromScale(1, 1)
		holder.Parent = s.root
		-- same quantised bands as Raster.gradient, without the dither
		local n = #stops
		local lastC, startY = nil, 0
		local function flush(y: number)
			if lastC then
				local fr = Instance.new("Frame")
				fr.BorderSizePixel = 0
				fr.BackgroundColor3 = lastC
				fr.Position = UDim2.fromScale(0, startY / s.h)
				fr.Size = UDim2.fromScale(1, (y - startY) / s.h)
				fr.Parent = holder
			end
		end
		for y = 0, s.h - 1 do
			local t = y / s.h * (n - 1)
			local i = math.min(n - 1, math.floor(t) + 1)
			local level = math.floor((t - (i - 1)) * 4 + 0.5) / 4
			local a, b = stops[i], stops[math.min(n, i + 1)]
			local c = Color3.fromRGB(a[1] + (b[1] - a[1]) * level, a[2] + (b[2] - a[2]) * level, a[3] + (b[3] - a[3]) * level)
			if c ~= lastC then
				flush(y)
				lastC = c
				startY = y
			end
		end
		flush(s.h)
		return holder
	end)
end

local function buildLayer(s: GuiSurface, layer: Raster.Layer): Frame
	local holder = Instance.new("Frame")
	holder.Name = "Layer"
	holder.BackgroundTransparency = 1
	holder.BorderSizePixel = 0
	holder.Size = UDim2.fromScale(layer.w / s.w, layer.h / s.h)
	holder.Parent = s.root
	local active: { [string]: Frame } = {}
	local heights: { [Frame]: number } = {}
	local widths: { [Frame]: number } = {}
	for r = 0, layer.h - 1 do
		local cur: { [string]: Frame } = {}
		for k = layer.rowOff[r], layer.rowOff[r + 1] - 1, 2 do
			local x0, len = layer.runs[k], layer.runs[k + 1]
			local x = x0
			while x < x0 + len do
				local c = readu32(layer.rgba, (r * layer.w + x) * 4)
				local sx = x
				x += 1
				while x < x0 + len and readu32(layer.rgba, (r * layer.w + x) * 4) == c do
					x += 1
				end
				local key = sx .. ":" .. (x - sx) .. ":" .. c
				local fr = active[key]
				if fr then
					heights[fr] += 1
				else
					fr = Instance.new("Frame")
					fr.BorderSizePixel = 0
					fr.BackgroundColor3 = col(c)
					heights[fr] = 1
					widths[fr] = x - sx
					fr.Position = UDim2.fromScale(sx / layer.w, r / layer.h)
					fr.Parent = holder
				end
				cur[key] = fr
			end
		end
		active = cur
	end
	for fr, h in heights do
		local w = widths[fr]
		fr.Size = UDim2.fromScale(w / layer.w, h / layer.h)
	end
	return holder
end

-- Stable wrap keys (a fresh table each call would rebuild every frame)
local wrapKeys: { [any]: any } = setmetatable({}, { __mode = "k" }) :: any
function GuiRaster.layer(s: GuiSurface, layer: Raster.Layer, offset: number, wrap: boolean, dy: number?)
	offset = math.floor(offset)
	local y = layer.y + math.floor(dy or 0)
	local a = retained(s, layer, function()
		return buildLayer(s, layer)
	end)
	if not wrap then
		a.Position = UDim2.fromScale(-offset / s.w, y / s.h)
		return
	end
	local base = -(offset % layer.w)
	a.Position = UDim2.fromScale(base / s.w, y / s.h)
	local k = wrapKeys[layer]
	if not k then
		k = {}
		wrapKeys[layer] = k
	end
	local b = retained(s, k, function()
		return buildLayer(s, layer)
	end)
	b.Position = UDim2.fromScale((base + layer.w) / s.w, y / s.h)
end

function GuiRaster.destroy(s: GuiSurface)
	s.root:Destroy()
end

return GuiRaster
