--!strict
-- Axis-aligned box tests in world space. Boxes are {x0, y0, x1, y1}.

local Hitbox = {}

function Hitbox.overlap(a: { number }, b: { number }): boolean
	return a[1] < b[3] and b[1] < a[3] and a[2] < b[4] and b[2] < a[4]
end

-- First overlapping pair between two box lists; returns the contact point.
function Hitbox.contact(hits: { { number } }, hurts: { { number } }): (boolean, number, number)
	for _, h in hits do
		for _, u in hurts do
			if Hitbox.overlap(h, u) then
				local x0 = math.max(h[1], u[1])
				local x1 = math.min(h[3], u[3])
				local y0 = math.max(h[2], u[2])
				local y1 = math.min(h[4], u[4])
				return true, (x0 + x1) * 0.5, (y0 + y1) * 0.5
			end
		end
	end
	return false, 0, 0
end

function Hitbox.box(x: number, y: number, w: number, h: number): { number }
	return { x - w * 0.5, y - h * 0.5, x + w * 0.5, y + h * 0.5 }
end

return Hitbox
