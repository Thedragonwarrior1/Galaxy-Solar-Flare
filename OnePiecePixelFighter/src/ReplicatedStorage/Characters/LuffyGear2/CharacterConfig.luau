--!strict
-- MONKEY D. LUFFY - GEAR 2: rushdown. Fast walk/dash, quick normals, short recovery.
local AD = require(script.Parent.Parent.Parent.Shared.AttackDefinitions)
local M = AD.move

return {
	Id = "LuffyGear2",
	DisplayName = "LUFFY",
	Subtitle = "GEAR 2",
	Style = "RUSHDOWN",
	Description = "Blinding speed and short recovery. Stay in their face and chain Jet punches into the Gatling.",
	Theme = { primary = { 214, 30, 42 }, accent = { 255, 150, 160 }, aura = "steam" },
	Stats = {
		Health = 950,
		Walk = 2.5,
		Back = 1.9,
		DashSpeed = 7.8,
		DashFrames = 13,
		BackdashSpeed = 6.2,
		BackdashFrames = 15,
		JumpVel = 7.9,
		JumpX = 3.0,
		Gravity = 1.0,
		DoubleJump = false,
		PushWidth = 20,
		MeterGain = 1.0,
	},
	Moves = {
		StandLight = M({ class = "L", anim = "StandLight", startup = 4, active = 2, recovery = 7, damage = 32, name = "Jet Jab" }),
		StandMedium = M({ class = "M", anim = "StandMedium", startup = 6, active = 3, recovery = 12, damage = 55, name = "Jet Pistol" }),
		StandHeavy = M({ class = "H", anim = "StandHeavy", startup = 10, active = 4, recovery = 18, damage = 92, kbX = 5, shake = 3, name = "Jet Bazooka" }),
		CrouchLight = M({ class = "L", anim = "CrouchLight", startup = 4, active = 2, recovery = 7, damage = 28, name = "Low Jab" }),
		CrouchMedium = M({ class = "M", anim = "CrouchMedium", startup = 7, active = 3, recovery = 13, damage = 52, height = "low", name = "Jet Sweep" }),
		CrouchHeavy = M({ class = "H", anim = "CrouchHeavy", startup = 8, active = 4, recovery = 20, damage = 85, launch = 7.5, name = "Jet Stamp" }),
		AirLight = M({ class = "L", anim = "AirLight", startup = 4, active = 4, recovery = 6, damage = 30, air = true, height = "high", name = "Air Jab" }),
		AirMedium = M({ class = "M", anim = "AirMedium", startup = 6, active = 4, recovery = 8, damage = 50, air = true, height = "high", name = "Jet Kick" }),
		AirHeavy = M({ class = "H", anim = "AirHeavy", startup = 8, active = 5, recovery = 10, damage = 76, air = true, height = "high", name = "Jet Hammer" }),
		Special = M({ class = "SP", anim = "Special", startup = 9, active = 16, recovery = 16, damage = 20, multi = { count = 6, interval = 3 },
			activeLoop = true, hitstun = 16, blockstun = 12, kbX = 1.2, motion = { { from = 9, to = 24, vx = 0.7 } }, name = "Jet Gatling", vfx = "gatling" }),
		Super = M({ class = "SU", anim = "Super", startup = 14, active = 27, recovery = 22, damage = 34, multi = { count = 8, interval = 3, finalLaunch = 7.5 },
			hitstun = 18, kbX = 1.0, invuln = { from = 0, to = 15 }, motion = { { from = 12, to = 30, vx = 5 } }, name = "Jet Rush", vfx = "gatling" }),
	},
}
