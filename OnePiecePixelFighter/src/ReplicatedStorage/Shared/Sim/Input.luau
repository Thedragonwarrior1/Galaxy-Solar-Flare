--!strict
-- Button bitmask shared by input controllers, the network layer and the sim.

local Input = {}

Input.LEFT = 1
Input.RIGHT = 2
Input.UP = 4
Input.DOWN = 8
Input.LIGHT = 16
Input.MEDIUM = 32
Input.HEAVY = 64
Input.SPECIAL = 128
Input.SUPER = 256
Input.BLOCK = 512
Input.DASH = 1024

Input.ALL = 2047
Input.ATTACKS = 16 + 32 + 64 + 128 + 256

Input.Names = {
	[1] = "LEFT",
	[2] = "RIGHT",
	[4] = "UP",
	[8] = "DOWN",
	[16] = "LIGHT",
	[32] = "MEDIUM",
	[64] = "HEAVY",
	[128] = "SPECIAL",
	[256] = "SUPER",
	[512] = "BLOCK",
	[1024] = "DASH",
}

Input.Buttons = { 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024 }

function Input.has(bits: number, b: number): boolean
	return bit32.band(bits, b) ~= 0
end

-- Horizontal direction relative to facing: 1 = toward the opponent, -1 = away, 0 = none.
function Input.horizontal(bits: number, facing: number): number
	local l = bit32.band(bits, Input.LEFT) ~= 0
	local r = bit32.band(bits, Input.RIGHT) ~= 0
	if l == r then
		return 0
	end
	local dir = if r then 1 else -1
	return dir * facing
end

-- Remove impossible combinations (left+right, up+down) so inputs are always well formed.
function Input.sanitize(bits: number): number
	bits = bit32.band(math.floor(bits), Input.ALL)
	if bit32.band(bits, 3) == 3 then
		bits = bit32.band(bits, bit32.bnot(3))
	end
	if bit32.band(bits, 12) == 12 then
		bits = bit32.band(bits, bit32.bnot(12))
	end
	return bits
end

return Input
