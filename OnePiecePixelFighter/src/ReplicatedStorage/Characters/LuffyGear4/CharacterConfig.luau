--!strict
-- MONKEY D. LUFFY - GEAR 4 (Boundman): heavy hitter. Slow, huge reach, big knockback.
local AD = require(script.Parent.Parent.Parent.Shared.AttackDefinitions)
local M = AD.move

return {
	Id = "LuffyGear4",
	DisplayName = "LUFFY",
	Subtitle = "GEAR 4",
	Style = "POWERHOUSE",
	Description = "Boundman. Deliberate and heavy: long Kong punches, crushing knockback and a chargeable Kong Gun.",
	Theme = { primary = { 140, 20, 36 }, accent = { 255, 255, 255 }, aura = "smoke" },
	Stats = {
		Health = 1100,
		Walk = 1.6,
		Back = 1.3,
		DashSpeed = 6.0,
		DashFrames = 16,
		BackdashSpeed = 5.0,
		BackdashFrames = 18,
		JumpVel = 9.0,
		JumpX = 2.4,
		Gravity = 1.05,
		DoubleJump = false,
		PushWidth = 30,
		MeterGain = 1.0,
	},
	Moves = {
		StandLight = M({ class = "L", anim = "StandLight", startup = 6, active = 3, recovery = 10, damage = 44, name = "Kong Jab" }),
		StandMedium = M({ class = "M", anim = "StandMedium", startup = 9, active = 4, recovery = 16, damage = 80, kbX = 4, shake = 2, name = "Kong Gun" }),
		StandHeavy = M({ class = "H", anim = "StandHeavy", startup = 15, active = 5, recovery = 22, damage = 120, height = "high", knockdown = true, shake = 4, name = "Kong Hammer" }),
		CrouchLight = M({ class = "L", anim = "CrouchLight", startup = 6, active = 3, recovery = 10, damage = 40, name = "Low Kong Jab" }),
		CrouchMedium = M({ class = "M", anim = "CrouchMedium", startup = 9, active = 4, recovery = 16, damage = 70, height = "low", knockdown = true, name = "Kong Sweep" }),
		CrouchHeavy = M({ class = "H", anim = "CrouchHeavy", startup = 11, active = 5, recovery = 22, damage = 110, launch = 8.5, shake = 3, name = "Rhino Uppercut" }),
		AirLight = M({ class = "L", anim = "AirLight", startup = 6, active = 4, recovery = 8, damage = 42, air = true, height = "high", name = "Air Kong Jab" }),
		AirMedium = M({ class = "M", anim = "AirMedium", startup = 8, active = 5, recovery = 10, damage = 62, air = true, height = "high", name = "Bound Kick" }),
		AirHeavy = M({ class = "H", anim = "AirHeavy", startup = 10, active = 5, recovery = 14, damage = 100, air = true, height = "high", knockdown = true, shake = 4, name = "Culverin Drop" }),
		Special = M({ class = "SP", anim = "Special", startup = 18, active = 6, recovery = 22, damage = 110, kbX = 6.5, shake = 5,
			charge = { at = 10, max = 40, bonus = 0.6 }, armor = { from = 6, to = 18, hits = 1 }, name = "Kong Gun (Charged)", vfx = "kong" }),
		Super = M({ class = "SU", anim = "Super", startup = 22, active = 18, recovery = 24, damage = 360, kbX = 7, launch = 6, shake = 9,
			invuln = { from = 0, to = 22 }, name = "King Kong Gun", vfx = "kingkong" }),
	},
}
