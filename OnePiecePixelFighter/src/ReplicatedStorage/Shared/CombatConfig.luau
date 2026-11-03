--!strict
-- Global combat and match tuning. Every value is in simulation units:
-- pixels of the 320x180 virtual screen (integer-scales to 720p x4, 1080p x6, 1440p x8) and 60 Hz simulation frames.

local CombatConfig = {
	TickRate = 60,

	-- virtual screen / stage
	ScreenWidth = 320,
	ScreenHeight = 180,
	StageWidth = 720,
	GroundY = 30, -- pixels from the bottom of the screen to the fighting plane
	WallMargin = 14, -- fighters cannot get closer than this to a stage edge
	MaxSeparation = 320 - 48, -- both fighters must fit on screen
	StartDistance = 140,

	-- match flow
	RoundTime = 99, -- seconds (configurable)
	RoundsToWin = 2,
	MaxRounds = 5, -- safety cap for repeated draws
	IntroFrames = 150, -- "ROUND N" banner + character intros
	ReadyFrames = 50, -- "FIGHT!"
	KOFrames = 110, -- slow-motion knockout
	RoundEndFrames = 140,
	MatchEndFrames = 260,

	-- physics
	Gravity = 0.42,
	MaxFall = 9,
	GroundFriction = 0.78, -- applied to knockback/pushback each frame
	LandingRecovery = 4,
	JumpSquat = 4,

	-- input
	InputBuffer = 7, -- a press is remembered for this many frames
	DashWindow = 11, -- frames between taps for a double-tap dash
	SpecialDownWindow = 8,

	-- combat
	MaxHealth = 1000,
	MaxMeter = 100,
	SuperCost = 100,
	SuperFreeze = 34,
	ChipNormals = 0,
	ChipSpecials = 0.12,
	MinScaling = 0.3,
	ScalingStart = 3, -- full damage for the first hits of a combo
	ScalingStep = 0.12,
	RepeatPenalty = 0.75, -- the same move hitting again in one combo
	HitstunDecayStart = 4,
	HitstunDecay = 1, -- frames removed per hit after the start
	MinHitstun = 9,
	MaxJuggle = 4, -- airborne hits before the defender can no longer be juggled
	CounterHitBonus = 1.2,
	CounterHitstun = 4,
	MeterOnHit = 0.09, -- meter gained by the attacker per point of damage
	MeterOnBlock = 0.04,
	MeterOnTaken = 0.06,
	MeterOnWhiff = 0.8, -- per special/heavy started
	KnockdownFrames = 34,
	GetUpFrames = 20,
	BackdashInvuln = 7,
	ProximityBlockRange = 0, -- 0 = blocking is purely the block button

	-- anti-exploit (server)
	MaxInputMessagesPerSecond = 90,
	InputTimeout = 0.6, -- seconds without input -> release held buttons
}

return CombatConfig
