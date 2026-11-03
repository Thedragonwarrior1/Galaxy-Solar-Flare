--!strict
-- Animated fighter preview for menus (character select, results, title).
-- Draws the real sprite animation plus the character's idle effects
-- (CharacterFx) on a small lit floor, into its own pixel canvas.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Timeline = require(Shared:WaitForChild("Sim"):WaitForChild("Timeline"))
local Render = script.Parent.Parent:WaitForChild("Render")
local Canvas = require(Render:WaitForChild("Canvas"))
local Raster = require(Render:WaitForChild("Raster"))
local SpriteLibrary = require(Render:WaitForChild("SpriteLibrary"))
local Effects = require(Render:WaitForChild("Effects"))
local CharacterFx = require(Render:WaitForChild("CharacterFx"))

local Preview = {}
Preview.__index = Preview

local rgb = Raster.rgb

export type Options = { w: number?, h: number?, backdrop: { number }?, glow: { number }? }

function Preview.new(parent: Instance, opts: Options?)
	local o = opts or {}
	local w, h = o.w or 170, o.h or 150
	local cv = Canvas.small(parent, w, h)
	local fx = Effects.new()
	return setmetatable({
		cv = cv,
		w = w,
		h = h,
		fx = fx,
		cfx = CharacterFx.new(fx),
		char = nil :: string?,
		palette = 0,
		facing = 1,
		anim = "Idle",
		queue = {} :: { string },
		t = 0,
		backdrop = o.backdrop or { 40, 28, 64 },
		glow = o.glow or { 90, 60, 130 },
		frames = 0,
	}, Preview)
end

function Preview.set(self: any, char: string, palette: number?, facing: number?)
	if self.char ~= char then
		self.char = char
		self.anim = "Idle"
		self.t = 0
		self.queue = {}
		self.fx.list = {}
		task.spawn(SpriteLibrary.preload, char)
	end
	self.palette = palette or 0
	self.facing = facing or 1
end

-- Play animations once each, then return to the idle loop.
function Preview.play(self: any, anims: { string })
	self.queue = table.clone(anims)
	self.anim = table.remove(self.queue, 1) or "Idle"
	self.t = 0
end

function Preview.step(self: any, dt: number)
	local cv = self.cv
	if not cv or not self.char then
		return
	end
	self.frames += 1
	local cs = SpriteLibrary.get(self.char)
	local fd = cs.frameData
	local anim = fd[self.anim] or fd.Idle
	self.t += dt * 60
	if not anim.loop and self.t >= Timeline.length(anim) + 10 then
		self.anim = table.remove(self.queue, 1) or "Idle"
		self.t = 0
		anim = fd[self.anim] or fd.Idle
	end
	local rowIndex = Timeline.stateRow(anim, self.t)
	local row = anim.frames[rowIndex]
	local frame = SpriteLibrary.sheet(cs, anim.sheet)[row.f]
	local R, s = cv.R, cv.surface
	if R.begin then
		R.begin(s)
	end
	local floor = self.h - 14
	-- backdrop: dark gradient bands + a spotlight glow behind the fighter
	local b, g = self.backdrop, self.glow
	for k = 0, 5 do
		local f = k / 5
		R.rect(
			s,
			0,
			math.floor(k * floor / 6),
			self.w,
			math.ceil(floor / 6) + 1,
			rgb(b[1] + (g[1] - b[1]) * f * 0.6, b[2] + (g[2] - b[2]) * f * 0.6, b[3] + (g[3] - b[3]) * f * 0.6)
		)
	end
	R.disc(s, self.w / 2, floor - 40, 46, rgb(g[1], g[2], g[3]), true)
	R.rect(s, 0, floor, self.w, self.h - floor, rgb(b[1] * 0.6, b[2] * 0.6, b[3] * 0.6))
	R.rect(s, 0, floor, self.w, 1, rgb(g[1], g[2], g[3]))
	-- fighter centred (wide frames are shifted so the body stays in view)
	local x = self.w / 2 - 8 * self.facing
	if frame.w > self.w - 30 then
		x = if self.facing == 1 then 36 else self.w - 36
	end
	local f = { char = self.char, x = x, y = 0, facing = self.facing, anim = self.anim, row = rowIndex, airborne = false, ko = false }
	self.cfx:update(1, f, row)
	self.cfx:drawGround(R, s, 1, f, 0, floor, 0, 0, nil)
	R.rect(s, x - 16, floor, 33, 2, rgb(14, 10, 22), true)
	R.sprite(s, frame, x, floor, self.facing, cs.palettes[self.palette + 1] or cs.palettes[1])
	self.cfx:drawAttached(R, s, 1, f, row, 0, floor)
	self.fx:draw(s, 0, floor, R)
	self.fx:update()
	cv.present()
end

function Preview.destroy(self: any)
	if self.cv then
		self.cv.destroy()
	end
end

return Preview
