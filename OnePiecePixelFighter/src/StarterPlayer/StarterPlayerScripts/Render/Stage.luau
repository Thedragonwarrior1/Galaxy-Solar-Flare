--!strict
-- Pixel-art stage: dithered gradient sky, parallax layers, animated sea strips,
-- drifting clouds and weather (rain + lightning on the storm deck, floating
-- cloud wisps on the sky island).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Codec = require(Shared:WaitForChild("Codec"))
local Raster = require(script.Parent:WaitForChild("Raster"))

local Stage = {}
Stage.__index = Stage

Stage.List = { "Harbour", "Storm", "SkyIsland" }

function Stage.new(name: string, screenW: number, screenH: number)
	local stages = ReplicatedStorage:WaitForChild("Stages")
	local data = require(stages:WaitForChild(name)) :: any
	local pal = Codec.palette(data.Palette)
	local layers = {}
	for _, l in data.Layers do
		local frames = {}
		for _, enc in l.frames do
			local idx = Codec.lz4(Codec.base64(enc), l.w * l.h)
			table.insert(frames, Raster.prepareLayer(l.w, l.h, l.y, idx, pal))
		end
		table.insert(layers, {
			name = l.name,
			parallax = l.parallax,
			wrap = l.wrap,
			scroll = l.scroll,
			frames = frames,
		})
	end
	local self = setmetatable({
		name = name,
		title = data.Title,
		weather = data.Weather,
		floor = data.Floor,
		sky = Raster.gradient(screenW, screenH, data.Sky),
		skyStops = data.Sky,
		layers = layers,
		w = screenW,
		h = screenH,
		rain = {},
		lightning = 0,
		boltX = 0,
		wisps = {},
		t = 0,
	}, Stage)
	if self.weather == "storm" then
		for i = 1, 90 do
			self.rain[i] = { x = math.random() * screenW, y = math.random() * screenH, s = 4 + math.random() * 3 }
		end
	elseif self.weather == "clouds" then
		for i = 1, 14 do
			self.wisps[i] = { x = math.random() * screenW, y = 150 + math.random() * 60, s = 0.2 + math.random() * 0.4 }
		end
	end
	return self
end

function Stage.drawBack(self: any, s: any, camX: number, shakeX: number, shakeY: number, backend: any?)
	local R = backend or Raster
	self.t += 1
	if R.isGui then
		R.sky(s, self.skyStops)
	else
		Raster.copyFrom(s, self.sky)
	end
	if self.weather == "storm" then
		if self.lightning <= 0 and math.random() < 0.006 then
			self.lightning = 10
			self.boltX = 40 + math.random() * (self.w - 80)
		end
	end
	for _, l in self.layers do
		local frame = l.frames[1]
		if #l.frames > 1 then
			frame = l.frames[(self.t // 10) % #l.frames + 1]
		end
		local off = camX * l.parallax + self.t * l.scroll - shakeX
		R.layer(s, frame, off, l.wrap, shakeY * l.parallax)
		if l.name == "Clouds" and self.lightning > 0 then
			-- lightning strikes behind the far layers
			if self.lightning > 6 then
				local x, y = self.boltX, 0
				local white = Raster.rgb(255, 255, 255)
				while y < 120 do
					local nx = x + (math.random() - 0.5) * 16
					local ny = y + 6 + math.random() * 8
					R.line(s, x, y, nx, ny, white, 2)
					x, y = nx, ny
				end
			end
		end
	end
	if self.lightning > 0 then
		if self.lightning > 7 then
			R.whiteout(s, false)
		end
		self.lightning -= 1
	end
end

function Stage.drawFront(self: any, s: any, backend: any?)
	local R = backend or Raster
	if self.weather == "storm" then
		local c = Raster.rgb(170, 190, 230)
		for _, r in self.rain do
			r.x -= 1.4
			r.y += r.s
			if r.y > self.h then
				r.y -= self.h
				r.x = math.random() * (self.w + 40)
			end
			if r.x < 0 then
				r.x += self.w
			end
			R.line(s, r.x, r.y, r.x - 1, r.y + 4, c, 1, true)
		end
	elseif self.weather == "clouds" then
		local c = Raster.rgb(255, 255, 255)
		for _, w in self.wisps do
			w.x += w.s
			if w.x > self.w + 20 then
				w.x = -20
			end
			R.disc(s, w.x, w.y + math.sin((self.t + w.x) * 0.02) * 2, 3, c, true)
			R.disc(s, w.x + 5, w.y + 1, 2, c, true)
		end
	end
end

return Stage
