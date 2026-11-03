--!strict
-- Sound effects driven by simulation events. The IDs below point at sounds
-- that ship with the Roblox client (rbxasset://sounds/...) so the game makes
-- noise out of the box; replace them with your own uploaded rbxassetid://
-- sounds in this table - nothing else needs to change. Empty = silent.

local SoundService = game:GetService("SoundService")

local AudioController = {}

AudioController.Sounds = {
	hitL = { id = "rbxasset://sounds/swordslash.wav", volume = 0.35, pitch = 1.6 },
	hitM = { id = "rbxasset://sounds/swordslash.wav", volume = 0.45, pitch = 1.2 },
	hitH = { id = "rbxasset://sounds/swordlunge.wav", volume = 0.6, pitch = 0.9 },
	hitSU = { id = "rbxasset://sounds/swordlunge.wav", volume = 0.8, pitch = 0.7 },
	block = { id = "rbxasset://sounds/button.wav", volume = 0.4, pitch = 0.8 },
	jump = { id = "rbxasset://sounds/action_jump.mp3", volume = 0.3, pitch = 1.2 },
	land = { id = "rbxasset://sounds/action_jump_land.mp3", volume = 0.3, pitch = 1 },
	super = { id = "rbxasset://sounds/electronicpingshort.wav", volume = 0.7, pitch = 0.6 },
	ko = { id = "rbxasset://sounds/uuhhh.mp3", volume = 0.6, pitch = 1 },
	electric = { id = "rbxasset://sounds/electronicpingshort.wav", volume = 0.35, pitch = 1.8 },
	menu = { id = "", volume = 0.3, pitch = 1 },
	fight = { id = "", volume = 0.3, pitch = 1 },
}

local pool: { [string]: { Sound } } = {}
local started = false

local function make(key: string): Sound?
	local def = AudioController.Sounds[key]
	if not def or def.id == "" then
		return nil
	end
	local s = Instance.new("Sound")
	s.SoundId = def.id
	s.Volume = def.volume
	s.PlaybackSpeed = def.pitch
	s.Parent = SoundService
	return s
end

function AudioController.start()
	started = true
end

function AudioController.play(key: string)
	if not started then
		return
	end
	local list = pool[key]
	if not list then
		list = {}
		pool[key] = list
	end
	for _, s in list do
		if not s.IsPlaying then
			s:Play()
			return
		end
	end
	if #list < 4 then
		local s = make(key)
		if s then
			table.insert(list, s)
			s:Play()
		end
	end
end

local music: Sound? = nil
function AudioController.music(key: string)
	if music then
		music:Stop()
		music:Destroy()
		music = nil
	end
	local s = make(key)
	if s then
		s.Looped = true
		s:Play()
		music = s
	end
end

function AudioController.events(events: { any }?)
	for _, e in events or {} do
		local t = e.type
		if t == "hit" then
			local c = e.class
			if e.vfx == "shock" or e.vfx == "kari" then
				AudioController.play("electric")
			end
			AudioController.play(if c == "SU" then "hitSU" elseif c == "H" or c == "SP" then "hitH" elseif c == "M" then "hitM" else "hitL")
		elseif t == "block" then
			AudioController.play("block")
		elseif t == "jump" then
			AudioController.play("jump")
		elseif t == "land" and e.heavy then
			AudioController.play("land")
		elseif t == "super" then
			AudioController.play("super")
		elseif t == "ko" then
			AudioController.play("ko")
		elseif t == "projectile" and (e.kind == "vari" or e.kind == "elthor") then
			AudioController.play("electric")
		end
	end
end

return AudioController
