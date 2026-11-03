--!strict
--!native
-- Decoders for the generated sprite/stage data: base64 -> buffer, LZ4 block -> buffer.
-- Mirrors tools/spritegen/encode.py.

local Codec = {}

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local LOOKUP = buffer.create(256)
buffer.fill(LOOKUP, 0, 255)
for i = 1, 64 do
	buffer.writeu8(LOOKUP, string.byte(B64, i), i - 1)
end

function Codec.base64(s: string): buffer
	local n = #s
	local pad = 0
	if n >= 1 and string.byte(s, n) == 61 then
		pad += 1
	end
	if n >= 2 and string.byte(s, n - 1) == 61 then
		pad += 1
	end
	local outLen = (n // 4) * 3 - pad
	local out = buffer.create(math.max(0, outLen))
	local src = buffer.fromstring(s)
	local o = 0
	for i = 0, n - 4, 4 do
		local a = buffer.readu8(LOOKUP, buffer.readu8(src, i))
		local b = buffer.readu8(LOOKUP, buffer.readu8(src, i + 1))
		local c = buffer.readu8(LOOKUP, buffer.readu8(src, i + 2))
		local d = buffer.readu8(LOOKUP, buffer.readu8(src, i + 3))
		local v = bit32.bor(bit32.lshift(a, 18), bit32.lshift(b, 12), bit32.lshift(bit32.band(c, 63), 6), bit32.band(d, 63))
		if o < outLen then
			buffer.writeu8(out, o, bit32.rshift(v, 16))
		end
		if o + 1 < outLen then
			buffer.writeu8(out, o + 1, bit32.band(bit32.rshift(v, 8), 255))
		end
		if o + 2 < outLen then
			buffer.writeu8(out, o + 2, bit32.band(v, 255))
		end
		o += 3
	end
	return out
end

-- Decompress an LZ4 block into a new buffer of `size` bytes.
function Codec.lz4(src: buffer, size: number): buffer
	local dst = buffer.create(size)
	local n = buffer.len(src)
	local ip, op = 0, 0
	while ip < n do
		local token = buffer.readu8(src, ip)
		ip += 1
		local lit = bit32.rshift(token, 4)
		if lit == 15 then
			repeat
				local b = buffer.readu8(src, ip)
				ip += 1
				lit += b
			until b ~= 255
		end
		if lit > 0 then
			buffer.copy(dst, op, src, ip, lit)
			op += lit
			ip += lit
		end
		if ip >= n then
			break
		end
		local off = buffer.readu16(src, ip)
		ip += 2
		local ml = bit32.band(token, 15)
		if ml == 15 then
			repeat
				local b = buffer.readu8(src, ip)
				ip += 1
				ml += b
			until b ~= 255
		end
		ml += 4
		local from = op - off
		if off >= ml then
			buffer.copy(dst, op, dst, from, ml)
		else
			-- overlapping match (run-length style): copy byte by byte
			for k = 0, ml - 1 do
				buffer.writeu8(dst, op + k, buffer.readu8(dst, from + k))
			end
		end
		op += ml
	end
	return dst
end

-- Palette string (base64 of RGBA quads) -> array of packed u32 colors (little-endian RGBA in memory).
function Codec.palette(s: string): { number }
	local b = Codec.base64(s)
	local out = {}
	for i = 0, buffer.len(b) // 4 - 1 do
		out[i] = buffer.readu32(b, i * 4)
	end
	return out
end

return Codec
