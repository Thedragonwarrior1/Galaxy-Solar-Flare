--!strict
-- The 320x180 virtual screen.
--
-- Preferred backend: an EditableImage shown through one ImageLabel with
-- nearest-neighbour (Pixelated) resampling - pixel-perfect and fastest.
-- Roblox only allows EditableImage in published experiences when the owner is
-- 13+ and ID verified and "Allow Mesh & Image APIs" is on (Game Settings >
-- Security). When it is unavailable the canvas automatically falls back to
-- GuiRaster, which draws the same pixel art with ordinary GUI Frames and
-- needs no special settings.
--
-- Each canvas exposes `.R` (the drawing module: Raster or GuiRaster) and
-- `.surface`; callers always draw with canvas.R.<fn>(canvas.surface, ...).

local AssetService = game:GetService("AssetService")
local Raster = require(script.Parent:WaitForChild("Raster"))
local GuiRaster = require(script.Parent:WaitForChild("GuiRaster"))

local Canvas = {}
Canvas.__index = Canvas

-- Set to true to always use the GUI backend (e.g. to test it in Studio).
Canvas.ForceGui = false

local function tryEditable(w: number, h: number): any
	if Canvas.ForceGui then
		return nil
	end
	local ok, image = pcall(function()
		return AssetService:CreateEditableImage({ Size = Vector2.new(w, h) })
	end)
	if ok and image then
		return image
	end
	return nil
end

function Canvas.new(parent: Instance, w: number, h: number, name: string?): any
	-- the holder is the "screen" rectangle; HUD elements are parented to it
	local holder = Instance.new("Frame")
	holder.Name = name or "Screen"
	holder.BackgroundColor3 = Color3.new(0, 0, 0)
	holder.BorderSizePixel = 0
	holder.AnchorPoint = Vector2.new(0.5, 0.5)
	holder.Position = UDim2.fromScale(0.5, 0.5)
	holder.ClipsDescendants = true
	holder.Parent = parent

	local self = setmetatable({
		frame = holder,
		scale = 1,
		w = w,
		h = h,
		size = Vector2.new(w, h),
	}, Canvas) :: any

	local image = tryEditable(w, h)
	if image then
		local label = Instance.new("ImageLabel")
		label.Name = "Pixels"
		label.BackgroundTransparency = 1
		label.Size = UDim2.fromScale(1, 1)
		label.ResampleMode = Enum.ResamplerMode.Pixelated
		label.ImageContent = Content.fromObject(image)
		label.ZIndex = 1
		label.Parent = holder
		self.image = image
		self.label = label
		self.surface = Raster.new(w, h)
		self.R = Raster
		self.backend = "EditableImage"
	else
		self.surface = GuiRaster.newSurface(holder, w, h)
		self.label = self.surface.root
		self.R = GuiRaster
		self.backend = "GuiFrames"
	end
	return self
end

-- Fit to the available size. Integer scale when it fills at least 85% of the
-- available height, otherwise fractional (still nearest-neighbour).
function Canvas.fit(self: any, avail: Vector2, reserveX: number?)
	local aw = avail.X - (reserveX or 0)
	local ah = avail.Y
	local s = math.min(aw / self.w, ah / self.h)
	local si = math.floor(s)
	if si >= 1 and si * self.h >= ah * 0.85 then
		s = si
	end
	self.scale = s
	if self.R.isGui then
		self.surface.scale = s
	end
	self.frame.Size = UDim2.fromOffset(math.floor(self.w * s), math.floor(self.h * s))
	return s
end

function Canvas.present(self: any)
	if self.image then
		self.image:WritePixelsBuffer(Vector2.zero, self.size, self.surface.buf)
	else
		GuiRaster.finish(self.surface)
	end
end

function Canvas.destroy(self: any)
	self.frame:Destroy()
	if self.image then
		self.image:Destroy()
	end
end

-- Small standalone pixel image (portraits, select-screen previews).
function Canvas.small(parent: Instance, w: number, h: number): any
	local image = tryEditable(w, h)
	if image then
		local label = Instance.new("ImageLabel")
		label.BackgroundTransparency = 1
		label.Size = UDim2.fromScale(1, 1)
		label.ResampleMode = Enum.ResamplerMode.Pixelated
		label.ImageContent = Content.fromObject(image)
		label.Parent = parent
		local surf = Raster.new(w, h)
		return {
			R = Raster,
			surface = surf,
			image = image,
			label = label,
			present = function()
				image:WritePixelsBuffer(Vector2.zero, Vector2.new(w, h), surf.buf)
			end,
			destroy = function()
				label:Destroy()
				image:Destroy()
			end,
		}
	end
	local surf = GuiRaster.newSurface(parent, w, h)
	return {
		R = GuiRaster,
		surface = surf,
		label = surf.root,
		present = function()
			GuiRaster.finish(surf)
		end,
		destroy = function()
			surf.root:Destroy()
		end,
	}
end

return Canvas
