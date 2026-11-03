--!strict
-- The 320x180 virtual screen as an EditableImage shown through one ImageLabel
-- with nearest-neighbour (Pixelated) resampling. The label is sized to the
-- largest integer multiple that fits the viewport (falls back to a
-- fractional scale only on very small screens) and centred with letterboxing.
--
-- Requires EditableImage support (Studio: works out of the box; published
-- experiences: Game Settings > Security > "Allow Mesh / Image APIs").

local AssetService = game:GetService("AssetService")
local Raster = require(script.Parent:WaitForChild("Raster"))

local Canvas = {}
Canvas.__index = Canvas

export type Canvas = {
	surface: Raster.Surface,
	image: any,
	frame: Frame,
	label: ImageLabel,
	scale: number,
}

function Canvas.new(parent: Instance, w: number, h: number, name: string?): any
	local ok, image = pcall(function()
		return AssetService:CreateEditableImage({ Size = Vector2.new(w, h) })
	end)
	if not ok or image == nil then
		return nil, tostring(image)
	end
	-- the holder is the "screen" rectangle; HUD elements are parented to it
	local holder = Instance.new("Frame")
	holder.Name = name or "Screen"
	holder.BackgroundColor3 = Color3.new(0, 0, 0)
	holder.BorderSizePixel = 0
	holder.AnchorPoint = Vector2.new(0.5, 0.5)
	holder.Position = UDim2.fromScale(0.5, 0.5)
	holder.ClipsDescendants = true
	holder.Parent = parent

	local label = Instance.new("ImageLabel")
	label.Name = "Pixels"
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.ResampleMode = Enum.ResamplerMode.Pixelated
	label.ImageContent = Content.fromObject(image)
	label.ZIndex = 1
	label.Parent = holder

	local self = setmetatable({
		surface = Raster.new(w, h),
		image = image,
		frame = holder,
		label = label,
		scale = 1,
		w = w,
		h = h,
		size = Vector2.new(w, h),
	}, Canvas)
	return self
end

-- Fit to the parent's absolute size. Integer scale when it fills at least 85%
-- of the available height, otherwise fractional (still nearest-neighbour).
function Canvas.fit(self: any, avail: Vector2, reserveX: number?)
	local aw = avail.X - (reserveX or 0)
	local ah = avail.Y
	local s = math.min(aw / self.w, ah / self.h)
	local si = math.floor(s)
	if si >= 1 and si * self.h >= ah * 0.85 then
		s = si
	end
	self.scale = s
	self.frame.Size = UDim2.fromOffset(math.floor(self.w * s), math.floor(self.h * s))
	return s
end

function Canvas.present(self: any)
	self.image:WritePixelsBuffer(Vector2.zero, self.size, self.surface.buf)
end

function Canvas.destroy(self: any)
	self.frame:Destroy()
	if self.image then
		self.image:Destroy()
	end
end

-- Small standalone pixel image (portraits, select-screen previews).
function Canvas.small(parent: Instance, w: number, h: number): any
	local ok, image = pcall(function()
		return AssetService:CreateEditableImage({ Size = Vector2.new(w, h) })
	end)
	if not ok or image == nil then
		return nil
	end
	local label = Instance.new("ImageLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.ResampleMode = Enum.ResamplerMode.Pixelated
	label.ImageContent = Content.fromObject(image)
	label.Parent = parent
	local surf = Raster.new(w, h)
	return {
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

return Canvas
