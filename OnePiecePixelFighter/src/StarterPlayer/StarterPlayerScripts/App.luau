--!strict
-- Client application: screen flow + the per-frame loop.
--
--   MAIN MENU (attract match behind) -> CHARACTER SELECT -> FIGHT -> RESULTS
--
-- Sessions (local or online) produce Views; the Renderer draws them into the
-- pixel Canvas and the HUD reads them. Nothing here decides game outcomes.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local CombatConfig = require(Shared:WaitForChild("CombatConfig"))
local CharacterData = require(Shared:WaitForChild("CharacterData"))
local Input = require(Shared:WaitForChild("Sim"):WaitForChild("Input"))

local Render = script.Parent:WaitForChild("Render")
local Canvas = require(Render:WaitForChild("Canvas"))
local Renderer = require(Render:WaitForChild("Renderer"))
local SpriteLibrary = require(Render:WaitForChild("SpriteLibrary"))
local UI = script.Parent:WaitForChild("UI")
local Widgets = require(UI:WaitForChild("Widgets"))
local MainMenu = require(UI:WaitForChild("MainMenu"))
local CharacterSelect = require(UI:WaitForChild("CharacterSelect"))
local FightingHUD = require(UI:WaitForChild("FightingHUD"))
local ResultsScreen = require(UI:WaitForChild("ResultsScreen"))
local TrainingPanel = require(UI:WaitForChild("TrainingPanel"))
local PauseMenu = require(UI:WaitForChild("PauseMenu"))
local MobileControls = require(UI:WaitForChild("MobileControls"))
local Controllers = script.Parent:WaitForChild("Controllers")
local InputController = require(Controllers:WaitForChild("InputController"))
local CameraController = require(Controllers:WaitForChild("CameraController"))
local AudioController = require(Controllers:WaitForChild("AudioController"))
local Sessions = script.Parent:WaitForChild("Sessions")
local LocalSession = require(Sessions:WaitForChild("LocalSession"))
local OnlineSession = require(Sessions:WaitForChild("OnlineSession"))

local App = {}

local state: any = {
	screen = "boot",
	session = nil,
	renderer = nil,
	hud = nil,
	results = nil,
	training = nil,
	pause = nil,
	menu = nil,
	select = nil,
	lastSetup = nil,
	stats = { best = { 0, 0 } },
	renderCost = 0,
	skipToggle = false,
}

local gui: ScreenGui
local canvas: any
local mobile: any
local remotes: any

local function clearScreen()
	InputController.clear()
	for _, k in { "hud", "results", "training", "pause", "menu", "select" } do
		if state[k] then
			state[k]:destroy()
			state[k] = nil
		end
	end
end

local function endSession()
	if state.session then
		state.session:destroy()
		state.session = nil
	end
end

local function layout()
	local abs = gui.AbsoluteSize
	if canvas then
		canvas:fit(abs, 0)
		if mobile then
			mobile:layout(abs, canvas.frame.AbsoluteSize)
		end
	end
end

local function setMobile(visible: boolean)
	if mobile then
		mobile:setVisible(visible and UserInputService.TouchEnabled)
	end
end

local function startSession(session: any, stage: string)
	endSession()
	clearScreen()
	state.session = session
	state.stats = { best = { 0, 0 } }
	if not state.renderer then
		state.renderer = Renderer.new(canvas.surface, stage, canvas.R)
	else
		state.renderer:setStage(stage)
		state.renderer.hitboxes = false
	end
	canvas.frame.Visible = true
end

-- ---------------------------------------------------------------------------
-- screens
-- ---------------------------------------------------------------------------
function App.showMenu()
	endSession()
	clearScreen()
	state.screen = "menu"
	setMobile(false)
	local ids = CharacterData.Order
	local a, b = ids[math.random(1, #ids)], ids[math.random(1, #ids)]
	local stages = { "Harbour", "Storm", "SkyIsland" }
	local stage = stages[math.random(1, #stages)]
	startSession(LocalSession.new({ mode = "attract", p1 = a, p2 = b, stage = stage }), stage)
	state.screen = "menu"
	state.menu = MainMenu.new(gui, {
		online = function()
			App.showSelect("online")
		end,
		training = function()
			App.showSelect("training")
		end,
		versus = function()
			App.showSelect("versus")
		end,
		inspect = function()
			App.showSelect("inspect")
		end,
	})
	AudioController.music("menu")
end

function App.showSelect(mode: string)
	endSession()
	clearScreen()
	setMobile(false)
	state.screen = "select"
	canvas.frame.Visible = false
	local initial = state.lastSetup and { state.lastSetup.p1, state.lastSetup.p2 } or nil
	state.select = CharacterSelect.new(gui, {
		mode = mode,
		initial = initial,
		onBack = function()
			if mode == "online" and remotes then
				remotes.Match:FireServer({ op = "cancel" })
			end
			App.showMenu()
		end,
		onConfirm = function(p1: string, p2: string, stage: string, p2Human: boolean)
			if mode == "online" then
				state.select:setStatus("SEARCHING FOR AN OPPONENT...")
				if remotes then
					remotes.Match:FireServer({ op = "queue", char = p1 })
				else
					state.select:setStatus("ONLINE IS UNAVAILABLE (NO SERVER REMOTES)")
				end
				state.pendingOnline = { p1 = p1 }
				return
			end
			local m = if mode == "inspect" then "training" else mode
			App.startLocal({ mode = m, p1 = p1, p2 = p2, stage = stage, p2Human = p2Human })
		end,
	})
end

function App.startLocal(setup: any)
	state.lastSetup = setup
	state.lastMode = setup.mode
	SpriteLibrary.preload(setup.p1)
	SpriteLibrary.preload(setup.p2)
	local session = LocalSession.new(setup)
	startSession(session, setup.stage)
	state.screen = "fight"
	state.hud = FightingHUD.new(canvas.frame, session:getView(), session.labels)
	if setup.mode == "training" then
		state.training = TrainingPanel.new(canvas.frame, session, state.renderer)
	end
	setMobile(true)
	AudioController.music("fight")
end

function App.startOnline(start: any)
	SpriteLibrary.preload(start.p1)
	SpriteLibrary.preload(start.p2)
	local session = OnlineSession.new(remotes, start)
	startSession(session, start.stage)
	state.screen = "fight"
	state.lastMode = "online"
	state.lastSetup = { p1 = if start.slot == 1 then start.p1 else start.p2, p2 = if start.slot == 1 then start.p2 else start.p1 }
	state.waitingHud = true
	setMobile(true)
	AudioController.music("fight")
end

function App.showResults(view: any)
	if state.results then
		return
	end
	local session = state.session
	local online = session and session.kind == "online"
	state.results = ResultsScreen.new(canvas.frame, view, session and session.labels or { "P1", "P2" }, state.stats, {
		rematch = function()
			if online then
				remotes.Match:FireServer({ op = "rematch" })
				state.results:setStatus("WAITING FOR OPPONENT...")
			else
				App.startLocal(state.lastSetup)
			end
		end,
		select = function()
			if online then
				remotes.Match:FireServer({ op = "leave" })
			end
			App.showSelect(if online then "online" else (state.lastMode or "versus"))
		end,
		menu = function()
			if online then
				remotes.Match:FireServer({ op = "leave" })
			end
			App.showMenu()
		end,
	})
	setMobile(false)
end

function App.togglePause()
	local s = state.session
	if state.screen ~= "fight" or not s or s.kind ~= "local" or state.results then
		return
	end
	if state.pause then
		state.pause:destroy()
		state.pause = nil
		s.paused = false
		return
	end
	s.paused = true
	state.pause = PauseMenu.new(canvas.frame, {
		resume = function()
			App.togglePause()
		end,
		select = function()
			App.showSelect(state.lastMode or "versus")
		end,
		menu = function()
			App.showMenu()
		end,
	})
end

-- ---------------------------------------------------------------------------
-- online messages from MatchService
-- ---------------------------------------------------------------------------
local function onMatchMessage(msg: any)
	if type(msg) ~= "table" then
		return
	end
	local op = msg.op
	if op == "queued" then
		if state.select then
			state.select:setStatus("SEARCHING FOR AN OPPONENT...  (" .. tostring(msg.waiting or 1) .. " IN QUEUE)")
		end
	elseif op == "start" then
		App.startOnline(msg)
	elseif op == "opponentLeft" then
		if state.session and state.session.kind == "online" then
			local v = state.session:getView()
			if v then
				v.result = state.session.slot
				App.showResults(v)
			end
			if state.results then
				state.results:setStatus("YOUR OPPONENT LEFT - YOU WIN BY FORFEIT")
				state.results.rematch.Visible = false
			end
		end
	elseif op == "rematch" then
		if state.results then
			state.results:setStatus(if msg.status == "waiting" then "OPPONENT WANTS A REMATCH!" else "REMATCH ACCEPTED")
		end
	elseif op == "error" then
		if state.select then
			state.select:setStatus(string.upper(tostring(msg.message)))
		end
	end
end

-- ---------------------------------------------------------------------------
-- frame loop
-- ---------------------------------------------------------------------------
local function frame(dt: number)
	local s = state.session
	if state.menu then
		state.menu:nav(InputController.takeMenu(), Input)
	end
	if not s then
		return
	end
	s:update(dt)
	if s.restarted then
		s.restarted = false
		state.renderer:setStage(s.opts.stage)
	end
	local view = s:getView()
	if not view then
		return
	end
	if state.waitingHud then
		state.waitingHud = false
		state.hud = FightingHUD.new(canvas.frame, view, s.labels)
	end
	-- adaptive frame skip: if drawing costs too much on this device, draw at 30 Hz
	local t0 = os.clock()
	local skip = state.renderCost > 0.011 and state.skipToggle
	state.skipToggle = not state.skipToggle
	if not skip then
		state.renderer:draw(view)
		canvas:present()
		state.renderCost = state.renderCost * 0.9 + (os.clock() - t0) * 0.1
	else
		-- keep VFX/event bookkeeping in step even on skipped frames
		state.renderer:onEvents(view)
	end
	if state.hud then
		state.hud:update(view)
	end
	AudioController.events(view.events)
	for i = 1, 2 do
		state.stats.best[3 - i] = math.max(state.stats.best[3 - i], view.fighters[i].combo)
	end
	if state.training then
		state.training:update()
	end
	if state.screen == "fight" and view.phase == "matchEnd" and view.phaseFrame > 100 and not state.results then
		App.showResults(view)
	end
end

local function showFatal(msg: string)
	local f = Widgets.frame(gui, { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(16, 10, 28), ZIndex = 100 })
	Widgets.text(f, "PIXEL RENDERER UNAVAILABLE", {
		Size = UDim2.fromScale(0.8, 0.1),
		Position = UDim2.fromScale(0.1, 0.25),
		Font = Widgets.TitleFont,
		TextColor3 = Widgets.Colors.gold,
		ZIndex = 101,
	})
	Widgets.text(f, msg, {
		Size = UDim2.fromScale(0.8, 0.3),
		Position = UDim2.fromScale(0.1, 0.4),
		TextWrapped = true,
		Font = Enum.Font.GothamBold,
		TextStrokeTransparency = 1,
		ZIndex = 101,
	})
end

function App.start()
	local player = Players.LocalPlayer
	gui = Instance.new("ScreenGui")
	gui.Name = "OnePieceFighter"
	gui.IgnoreGuiInset = true
	gui.ResetOnSpawn = false
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.DisplayOrder = 10
	gui.Parent = player:WaitForChild("PlayerGui")
	local bg =
		Widgets.frame(gui, { Name = "Letterbox", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(8, 6, 14), ZIndex = 0 })
	bg.ZIndex = 0

	CameraController.start()
	InputController.start()
	AudioController.start()

	local err
	canvas, err = Canvas.new(gui, CombatConfig.ScreenWidth, CombatConfig.ScreenHeight, "Screen")
	if not canvas then
		showFatal(
			"EditableImage could not be created ("
				.. tostring(err)
				.. ").\n\nIn Roblox Studio open Game Settings > Security and enable "
				.. '"Allow Mesh / Image APIs", then publish again. Studio play-tests support it by default.'
		)
		return
	end
	mobile = MobileControls.new(gui)
	gui:GetPropertyChangedSignal("AbsoluteSize"):Connect(layout)
	layout()

	local rf = ReplicatedStorage:WaitForChild("Remotes", 10)
	if rf then
		remotes = {
			Match = rf:WaitForChild("MatchRemote"),
			Input = rf:WaitForChild("InputRemote"),
			State = rf:WaitForChild("StateRemote"),
			Combat = rf:WaitForChild("CombatRemote"),
		}
		remotes.Match.OnClientEvent:Connect(onMatchMessage)
	end

	UserInputService.InputBegan:Connect(function(io: InputObject, processed: boolean)
		if processed and UserInputService:GetFocusedTextBox() then
			return
		end
		local k = io.KeyCode
		if k == Enum.KeyCode.P or k == Enum.KeyCode.ButtonStart then
			App.togglePause()
		elseif state.training then
			if k == Enum.KeyCode.H then
				state.training:toggleBoxes()
			elseif k == Enum.KeyCode.T then
				state.training:cycleDummy()
			elseif k == Enum.KeyCode.R then
				state.session:resetPositions()
			end
		end
	end)

	App.showMenu()
	RunService.RenderStepped:Connect(function(dt)
		local ok, e = pcall(frame, math.min(dt, 0.1))
		if not ok then
			warn("[OnePieceFighter] frame error: " .. tostring(e))
		end
	end)
end

return App
