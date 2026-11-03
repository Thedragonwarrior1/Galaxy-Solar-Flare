--!nonstrict
-- Flattens the mocked GUI tree into draw commands (absolute rects in a
-- 1280x720 screen, Roblox sibling ZIndex order, UIListLayout + aspect
-- constraints applied) for tools/uisnap2png.py. Canvas images are dumped too.
local fs = require("@lune/fs")
local Mock = require("./robloxmock")

local Snap = {}
local SW, SH = 1280, 720

local function prop(c, k)
	return c.__props[k]
end

local function kids(inst)
	return rawget(inst, "__children") or {}
end

local function childOf(inst, cls)
	for _, k in kids(inst) do
		if k.__class == cls then
			return k
		end
	end
	return nil
end

local GUI = { Frame = true, TextLabel = true, TextButton = true, ImageLabel = true, ImageButton = true, ScrollingFrame = true }

function Snap.dump(name, images)
	local out = {}
	local imgIds = {}
	local function emit(c, x, y, w, h)
		local p = c.__props
		local col = p.BackgroundColor3
		local stroke = childOf(c, "UIStroke")
		local grad = childOf(c, "UIGradient")
		local line = {
			x = x,
			y = y,
			w = w,
			h = h,
			cls = c.__class,
			bt = p.BackgroundTransparency or 0,
			rot = p.Rotation or 0,
			r = col and math.floor(col.R * 255) or 0,
			g = col and math.floor(col.G * 255) or 0,
			b = col and math.floor(col.B * 255) or 0,
			round = childOf(c, "UICorner") ~= nil,
		}
		if grad and grad.__props.Transparency then
			local kp = grad.__props.Transparency.Keypoints
			local sum = 0
			for _, k in kp do
				sum += k.Value
			end
			line.gt = sum / #kp
		end
		if grad and grad.__props.Color then
			local kp = grad.__props.Color.Keypoints
			local c2 = kp[#kp].Value
			line.g2 = string.format("%d,%d,%d", c2.R * 255, c2.G * 255, c2.B * 255)
			line.g1 = string.format("%d,%d,%d", kp[1].Value.R * 255, kp[1].Value.G * 255, kp[1].Value.B * 255)
		end
		if stroke and (stroke.__props.Enabled ~= false) then
			local sc = stroke.__props.Color or Color3.new(0, 0, 0)
			line.stroke = string.format("%d,%d,%d,%d", sc.R * 255, sc.G * 255, sc.B * 255, stroke.__props.Thickness or 1)
			line.strokeText = c.__class == "TextLabel" or c.__class == "TextButton"
		end
		if (c.__class == "TextLabel" or c.__class == "TextButton") and p.Text and p.Text ~= "" then
			local tc = p.TextColor3 or Color3.new(1, 1, 1)
			line.text = p.Text
			line.tc = string.format("%d,%d,%d", tc.R * 255, tc.G * 255, tc.B * 255)
			line.align = tostring(p.TextXAlignment or "Center")
			line.font = tostring(p.Font or "")
		end
		if c.__class == "ImageLabel" and p.ImageContent and p.ImageContent.object then
			local img = p.ImageContent.object
			if img.last then
				local id = imgIds[img]
				if not id then
					id = #images + 1
					imgIds[img] = id
					images[id] = img
					fs.writeFile(string.format("tests/out/snapimg_%s_%d.rgba", name, id), buffer.tostring(img.last))
				end
				line.img = string.format("%d,%d,%d", id, img.Size.X, img.Size.Y)
			end
		end
		table.insert(out, line)
	end
	local function walk(inst, x, y, w, h)
		local children = {}
		for _, c in kids(inst) do
			if GUI[c.__class] and prop(c, "Visible") ~= false then
				table.insert(children, c)
			end
		end
		table.sort(children, function(a, b)
			return (prop(a, "ZIndex") or 1) < (prop(b, "ZIndex") or 1)
		end)
		local list = childOf(inst, "UIListLayout")
		local cursor = 0
		if list then
			table.sort(children, function(a, b)
				return (prop(a, "LayoutOrder") or 0) < (prop(b, "LayoutOrder") or 0)
			end)
		end
		local horiz = list and tostring(list.__props.FillDirection) == "Enum.FillDirection.Horizontal"
		local pad = 0
		if list and list.__props.Padding then
			pad = list.__props.Padding.Scale * (if horiz then w else h) + list.__props.Padding.Offset
		end
		-- total length for centred horizontal lists
		local total = 0
		if list then
			for _, c in children do
				local sz = prop(c, "Size")
				local cw = sz and (sz.X.Scale * w + sz.X.Offset) or 0
				local ch = sz and (sz.Y.Scale * h + sz.Y.Offset) or 0
				total += (if horiz then cw else ch) + pad
			end
			total -= pad
			if
				horiz
				and list.__props.HorizontalAlignment
				and tostring(list.__props.HorizontalAlignment) == "Enum.HorizontalAlignment.Center"
			then
				cursor = (w - total) / 2
			end
		end
		for _, c in children do
			local pos, sz, ap = prop(c, "Position"), prop(c, "Size"), prop(c, "AnchorPoint")
			local cw = sz and (sz.X.Scale * w + sz.X.Offset) or 0
			local ch = sz and (sz.Y.Scale * h + sz.Y.Offset) or 0
			local aspect = childOf(c, "UIAspectRatioConstraint")
			if aspect then
				local r = aspect.__props.AspectRatio or 1
				if cw / math.max(1, ch) > r then
					cw = ch * r
				else
					ch = cw / r
				end
			end
			local cx, cy
			if list then
				if horiz then
					cx, cy = x + cursor, y + (h - ch) / 2
					cursor += cw + pad
				else
					cx, cy = x, y + cursor
					cursor += ch + pad
				end
			else
				cx = x + (pos and (pos.X.Scale * w + pos.X.Offset) or 0)
				cy = y + (pos and (pos.Y.Scale * h + pos.Y.Offset) or 0)
				if ap then
					cx -= ap.X * cw
					cy -= ap.Y * ch
				end
			end
			emit(c, cx, cy, cw, ch)
			walk(c, cx, cy, cw, ch)
		end
	end
	local guis = {}
	for _, g in kids(Mock.playerGui) do
		table.insert(guis, g)
	end
	for _, g in guis do
		walk(g, 0, 0, SW, SH)
	end
	local lines = {}
	for _, l in out do
		local parts = {}
		for k, v in l do
			table.insert(parts, k .. "=" .. string.gsub(tostring(v), "[\t\n]", " "))
		end
		table.insert(lines, table.concat(parts, "\t"))
	end
	fs.writeFile("tests/out/snap_" .. name .. ".txt", table.concat(lines, "\n"))
end

return Snap
