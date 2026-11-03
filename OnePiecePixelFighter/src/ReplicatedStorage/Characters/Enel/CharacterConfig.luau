--!strict
-- ENEL: lightning zoner. Fast bolts, close-range shocks, teleport repositioning, El Thor.
local AD = require(script.Parent.Parent.Parent.Shared.AttackDefinitions)
local M = AD.move

return {
	Id = "Enel",
	DisplayName = "ENEL",
	Subtitle = "GOD OF SKYPIEA",
	Style = "ZONER",
	Description = "Keeps you at range with Vari bolts, blinks with Mantra Step (DOWN + SPECIAL) and calls down El Thor.",
	Theme = { primary = { 250, 210, 80 }, accent = { 120, 220, 255 }, aura = "sparks" },
	Stats = {
		Health = 950,
		Walk = 1.9,
		Back = 1.9,
		DashSpeed = 7.2,
		DashFrames = 14,
		BackdashSpeed = 6.4,
		BackdashFrames = 15,
		JumpVel = 7.8,
		JumpX = 2.6,
		Gravity = 0.95,
		DoubleJump = false,
		PushWidth = 22,
		MeterGain = 1.0,
	},
	Moves = {
		StandLight = M({ class = "L", anim = "StandLight", startup = 5, active = 3, recovery = 9, damage = 32, name = "Staff Jab" }),
		StandMedium = M({ class = "M", anim = "StandMedium", startup = 7, active = 4, recovery = 14, damage = 58, name = "Shock Palm", vfx = "shock" }),
		StandHeavy = M({ class = "H", anim = "StandHeavy", startup = 11, active = 5, recovery = 20, damage = 95, kbX = 4.5, shake = 3, name = "Nonosama Swing" }),
		CrouchLight = M({ class = "L", anim = "CrouchLight", startup = 5, active = 3, recovery = 9, damage = 28, name = "Low Shock", vfx = "shock" }),
		CrouchMedium = M({ class = "M", anim = "CrouchMedium", startup = 8, active = 4, recovery = 15, damage = 52, height = "low", name = "Staff Sweep" }),
		CrouchHeavy = M({ class = "H", anim = "CrouchHeavy", startup = 10, active = 6, recovery = 22, damage = 88, launch = 8, name = "Kari", vfx = "kari" }),
		AirLight = M({ class = "L", anim = "AirLight", startup = 5, active = 4, recovery = 6, damage = 30, air = true, height = "high", name = "Air Kick" }),
		AirMedium = M({ class = "M", anim = "AirMedium", startup = 7, active = 4, recovery = 8, damage = 50, air = true, height = "high", name = "Air Staff" }),
		AirHeavy = M({ class = "H", anim = "AirHeavy", startup = 9, active = 5, recovery = 10, damage = 74, air = true, height = "high", name = "Thunder Staff", vfx = "shock" }),
		Special = M({ class = "SP", anim = "Special", startup = 15, active = 4, recovery = 22, damage = 80,
			projectile = { at = 15, kind = "vari", x = 28, y = 66, vx = 6.6, life = 80, w = 30, h = 16 }, name = "Vari Bolt" }),
		Special2 = M({ class = "SP", anim = "Special2", startup = 6, active = 8, recovery = 10, damage = 0, teleport = { at = 8, dist = 120 },
			invuln = { from = 0, to = 16 }, name = "Mantra Step" }),
		Super = M({ class = "SU", anim = "Super", startup = 24, active = 22, recovery = 18, damage = 60, hitstun = 20, kbX = 1.0, invuln = { from = 0, to = 24 },
			projectile = { at = 22, kind = "elthor", spawn = "opponent", x = 0, y = 0, vx = 0, life = 26, w = 60, h = 216, hits = 6, interval = 4 },
			name = "El Thor" }),
	},
}
