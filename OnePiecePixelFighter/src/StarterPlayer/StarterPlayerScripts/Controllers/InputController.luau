--!strict
-- Keyboard, gamepad and touch -> per-player input bits.
--
-- PLAYER 1 (keyboard+mouse) A/D move  W jump  S crouch  SPACE dash (or double-tap)  SHIFT block
--                          1 light  2 medium  3 heavy  4 special  F awakening (super)
--                          left mouse button = light   (J/K/L/U/I also work)
-- PLAYER 2 (local only)    arrows move/jump/crouch  RIGHT CTRL dash
--                          N light  M medium  , heavy  . special  / super  RIGHT SHIFT block
--                          (numpad 1/2/3 light/medium/heavy, 4 special, 5 super, 0 block also work)
-- GAMEPAD                  stick / d-pad move (up = jump)  A jump
--                          X light  Y medium  RB heavy  B special  RT super  LB/LT block  R3 dash
-- Gamepad 1 drives player 1, gamepad 2 drives player 2.

local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Input = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Sim"):WaitForChild("Input"))

local InputController = {}

local K = Enum.KeyCode
local KEYS = {
	[1] = {
		[K.A] = Input.LEFT,
		[K.D] = Input.RIGHT,
		[K.W] = Input.UP,
		[K.S] = Input.DOWN,
		[K.J] = Input.LIGHT,
		[K.K] = Input.MEDIUM,
		[K.L] = Input.HEAVY,
		[K.U] = Input.SPECIAL,
		[K.I] = Input.SUPER,
		[K.One] = Input.LIGHT,
		[K.Two] = Input.MEDIUM,
		[K.Three] = Input.HEAVY,
		[K.Four] = Input.SPECIAL,
		[K.F] = Input.SUPER,
		[K.LeftShift] = Input.BLOCK,
		[K.Space] = Input.DASH,
	},
	[2] = {
		[K.Left] = Input.LEFT,
		[K.Right] = Input.RIGHT,
		[K.Up] = Input.UP,
		[K.Down] = Input.DOWN,
		[K.N] = Input.LIGHT,
		[K.M] = Input.MEDIUM,
		[K.Comma] = Input.HEAVY,
		[K.Period] = Input.SPECIAL,
		[K.Slash] = Input.SUPER,
		[K.RightShift] = Input.BLOCK,
		[K.RightControl] = Input.DASH,
		[K.KeypadOne] = Input.LIGHT,
		[K.KeypadTwo] = Input.MEDIUM,
		[K.KeypadThree] = Input.HEAVY,
		[K.KeypadFour] = Input.SPECIAL,
		[K.KeypadFive] = Input.SUPER,
		[K.KeypadZero] = Input.BLOCK,
		[K.KeypadSix] = Input.DASH,
	},
}

local PAD = {
	[K.ButtonX] = Input.LIGHT,
	[K.ButtonY] = Input.MEDIUM,
	[K.ButtonR1] = Input.HEAVY,
	[K.ButtonB] = Input.SPECIAL,
	[K.ButtonR2] = Input.SUPER,
	[K.ButtonL1] = Input.BLOCK,
	[K.ButtonL2] = Input.BLOCK,
	[K.ButtonA] = Input.UP,
	[K.ButtonR3] = Input.DASH,
	[K.DPadLeft] = Input.LEFT,
	[K.DPadRight] = Input.RIGHT,
	[K.DPadUp] = Input.UP,
	[K.DPadDown] = Input.DOWN,
}
local PADS = { Enum.UserInputType.Gamepad1, Enum.UserInputType.Gamepad2 }

local presses = { 0, 0 }
local touchBits = 0
local touchPresses = 0
local menuEdges = 0 -- buttons pressed since the last menu poll (any device)
local started = false
local lastDevice = "keyboard"

InputController.Keys = KEYS
InputController.Pad = PAD

local function padSlot(t: Enum.UserInputType): number?
	for i, p in PADS do
		if p == t then
			return i
		end
	end
	return nil
end

function InputController.start()
	if started then
		return
	end
	started = true
	UserInputService.InputBegan:Connect(function(io: InputObject, processed: boolean)
		if io.UserInputType == Enum.UserInputType.Keyboard then
			if processed and UserInputService:GetFocusedTextBox() then
				return
			end
			lastDevice = "keyboard"
			for slot = 1, 2 do
				local b = KEYS[slot][io.KeyCode]
				if b then
					presses[slot] = bit32.bor(presses[slot], b)
					menuEdges = bit32.bor(menuEdges, b)
				end
			end
			if io.KeyCode == K.Return or io.KeyCode == K.KeypadEnter then
				menuEdges = bit32.bor(menuEdges, Input.LIGHT)
			elseif io.KeyCode == K.Escape or io.KeyCode == K.Backspace then
				menuEdges = bit32.bor(menuEdges, Input.MEDIUM)
			end
		else
			local slot = padSlot(io.UserInputType)
			if slot then
				lastDevice = "gamepad"
				local b = PAD[io.KeyCode]
				if b then
					presses[slot] = bit32.bor(presses[slot], b)
					menuEdges = bit32.bor(menuEdges, b)
				end
				if io.KeyCode == K.ButtonA then
					menuEdges = bit32.bor(menuEdges, Input.LIGHT)
				end
			elseif io.UserInputType == Enum.UserInputType.Touch then
				lastDevice = "touch"
			elseif io.UserInputType == Enum.UserInputType.MouseButton1 and not processed then
				-- left click = light attack (clicks on GUI buttons are "processed" and ignored)
				presses[1] = bit32.bor(presses[1], Input.LIGHT)
			end
		end
	end)
end

function InputController.lastDevice(): string
	return lastDevice
end

local function stickBits(slot: number): number
	local bits = 0
	local ok, state = pcall(function()
		return UserInputService:GetGamepadState(PADS[slot])
	end)
	if not ok or not state then
		return 0
	end
	for _, io in state do
		if io.KeyCode == K.Thumbstick1 then
			local p = io.Position
			if p.X < -0.5 then
				bits += Input.LEFT
			elseif p.X > 0.5 then
				bits += Input.RIGHT
			end
			if p.Y > 0.6 then
				bits += Input.UP
			elseif p.Y < -0.5 then
				bits += Input.DOWN
			end
		end
	end
	return bits
end

-- Held bits for a player this frame.
function InputController.held(slot: number, includeTouch: boolean?): number
	local bits = 0
	if not UserInputService:GetFocusedTextBox() then
		for key, b in KEYS[slot] do
			if UserInputService:IsKeyDown(key) then
				bits = bit32.bor(bits, b)
			end
		end
	end
	local pad = PADS[slot]
	if UserInputService:GetGamepadConnected(pad) then
		for key, b in PAD do
			local ok, down = pcall(function()
				return UserInputService:IsGamepadButtonDown(pad, key)
			end)
			if ok and down then
				bits = bit32.bor(bits, b)
			end
		end
		bits = bit32.bor(bits, stickBits(slot))
	end
	if includeTouch then
		bits = bit32.bor(bits, touchBits)
	end
	return Input.sanitize(bits)
end

-- Buttons pressed since the last call (catches taps shorter than a frame).
function InputController.takePresses(slot: number, includeTouch: boolean?): number
	local p = presses[slot]
	presses[slot] = 0
	if includeTouch then
		p = bit32.bor(p, touchPresses)
		touchPresses = 0
	end
	return p
end

-- Menu navigation edges from any device.
function InputController.takeMenu(): number
	local e = bit32.bor(menuEdges, touchPresses)
	menuEdges = 0
	return e
end

-- Touch controls report here (see UI/MobileControls).
function InputController.setTouch(held: number, pressed: number)
	touchBits = held
	touchPresses = bit32.bor(touchPresses, pressed)
end

function InputController.clear()
	presses[1], presses[2] = 0, 0
	touchPresses = 0
	menuEdges = 0
end

function InputController.isTouchDevice(): boolean
	return UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
end

return InputController
