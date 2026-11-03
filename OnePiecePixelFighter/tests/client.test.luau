--!nonstrict
-- Headless client run: boots the real App against the strict Roblox mock and
-- drives it through every screen, then plays online against the real server
-- services wired through mock remotes.
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local T = require("./t")
local Mock = require("./robloxmock")
local H = require("./harness")

local K = roblox.Enum.KeyCode
local function frames(n, dt)
	for _ = 1, n do
		Mock.RunService.RenderStepped:Fire(dt or 1 / 60)
	end
end
local function findButton(root, text)
	local found = nil
	local function walk(inst)
		if found then return end
		if rawget(inst, "__props") and inst.__props.Text == text and inst.__class == "TextButton" then
			found = inst
			return
		end
		local kids = rawget(inst, "__children")
		if kids then
			for _, c in kids do walk(c) end
		end
	end
	walk(root)
	return found
end
local function click(text)
	local b = findButton(Mock.playerGui, text)
	assert(b, "button not found: " .. text)
	b.Activated:Fire()
end
local function dump(name)
	local img = Mock.images[1]
	fs.writeFile("tests/out/client_" .. name .. ".rgba", buffer.tostring(img.last))
end
local function noWarnings(where)
	T.eq(Mock.warnings or 0, 0, "warnings during " .. where)
end

local App
local me = Mock.Players.LocalPlayer
local rival = Mock.newInstance("Player", { DisplayName = "Rival", UserId = 2 })
me.Parent = Mock.Players
rival.Parent = Mock.Players
local rivalInbox = {}
local remotes
T.test("server boots and creates remotes", function()
	Mock.isServer = true
	H.require("ServerScriptService.Main")
	Mock.isServer = false
	local rf = Mock.remotes
	remotes = {
		Match = rf:FindFirstChild("MatchRemote"),
		Input = rf:FindFirstChild("InputRemote"),
		State = rf:FindFirstChild("StateRemote"),
		Combat = rf:FindFirstChild("CombatRemote"),
	}
	T.ok(remotes.Match and remotes.State and remotes.Input and remotes.Combat, "server created remotes")
	T.eq(remotes.State.ClassName, "UnreliableRemoteEvent")
	Mock.Players.PlayerAdded:Fire(me)
	Mock.Players.PlayerAdded:Fire(rival)
	Mock.toServer = function(remote, ...)
		remote.OnServerEvent:Fire(me, ...)
	end
	Mock.toClient = function(remote, player, ...)
		if player == me then
			remote.OnClientEvent:Fire(...)
		else
			table.insert(rivalInbox, { remote.Name, ... })
		end
	end
end)

T.test("client boots into the main menu with an attract match", function()
	App = H.require("StarterPlayer.StarterPlayerScripts.App")
	App.start()
	frames(240)
	noWarnings("menu")
	T.ok(Mock.images[1].writes >= 200, "canvas presented " .. Mock.images[1].writes .. " frames")
	T.ok(findButton(Mock.playerGui, "ONLINE 1V1"))
	T.ok(findButton(Mock.playerGui, "TRAINING"))
	T.ok(findButton(Mock.playerGui, "LOCAL TEST MATCH"))
	T.ok(findButton(Mock.playerGui, "CHARACTER SELECT"))
	dump("menu")
end)

T.test("character select (inspect) cycles previews and move list", function()
	click("CHARACTER SELECT")
	frames(200)
	click("MOVE LIST")
	frames(30)
	Mock.press(K.D) Mock.release(K.D)
	frames(20)
	noWarnings("inspect")
	click("BACK")
	frames(5)
	T.ok(findButton(Mock.playerGui, "TRAINING"), "back to menu")
end)

T.test("training: pick fighters, attack, toggle hitboxes, reset, pause", function()
	click("TRAINING")
	frames(5)
	Mock.press(K.J) Mock.release(K.J) -- P1 pick
	frames(5)
	Mock.press(K.D) Mock.release(K.D)
	Mock.press(K.J) Mock.release(K.J) -- dummy pick
	frames(10)
	T.ok(findButton(Mock.playerGui, "RESET POSITIONS (R)"), "training panel visible")
	Mock.press(K.H) Mock.release(K.H)
	for _ = 1, 6 do
		Mock.keysDown[K.D] = true
		frames(20)
		Mock.keysDown[K.D] = nil
		for _, k in { K.J, K.K, K.L, K.U } do
			Mock.press(k) frames(2) Mock.release(k) frames(14)
		end
	end
	Mock.press(K.T) Mock.release(K.T)
	Mock.press(K.R) Mock.release(K.R)
	frames(30)
	dump("training")
	Mock.press(K.P) Mock.release(K.P)
	frames(10)
	T.ok(findButton(Mock.playerGui, "RESUME"), "pause menu")
	click("RESUME")
	frames(10)
	noWarnings("training")
	Mock.press(K.P) Mock.release(K.P)
	click("MAIN MENU")
	frames(10)
end)

T.test("local test match vs CPU plays to the results screen and rematches", function()
	click("LOCAL TEST MATCH")
	frames(5)
	click("FIGHT!")
	frames(5)
	-- mash attacks until the match is decided
	local guard = 0
	while not findButton(Mock.playerGui, "REMATCH") and guard < 60 * 60 * 7 do
		guard += 1
		if guard % 9 == 0 then
			Mock.press(K.J)
		elseif guard % 9 == 3 then
			Mock.release(K.J)
			Mock.press(K.K)
		elseif guard % 9 == 6 then
			Mock.release(K.K)
		end
		Mock.keysDown[K.D] = guard % 120 < 50
		frames(1)
		if guard == 900 then dump("versus") end
	end
	Mock.keysDown[K.D] = nil
	T.ok(findButton(Mock.playerGui, "REMATCH"), "results never appeared")
	dump("results")
	noWarnings("versus")
	click("REMATCH")
	frames(60)
	T.ok(not findButton(Mock.playerGui, "REMATCH"), "rematch restarts the fight")
	Mock.press(K.P) Mock.release(K.P)
	click("MAIN MENU")
	frames(5)
end)

T.test("online 1v1 against the real server services through mock remotes", function()
	-- the App connected to remotes at boot before they existed; rebind like a fresh client
	click("ONLINE 1V1")
	frames(5)
	-- App.start grabbed remotes only if they existed at boot: make sure it can queue
	Mock.press(K.J) Mock.release(K.J)
	frames(5)
	-- rival queues directly
	remotes.Match.OnServerEvent:Fire(rival, { op = "queue", char = "Katakuri" })
	-- rival sends garbage + floods inputs (must be ignored safely)
	remotes.Input.OnServerEvent:Fire(rival, "x", {}, nil)
	for i = 1, 500 do
		remotes.Input.OnServerEvent:Fire(rival, i, 2 ^ 40, -1)
	end
	local seq = 1000
	for i = 1, 60 * 40 do
		Mock.RunService.Heartbeat:Fire(1 / 60)
		if i % 2 == 0 then
			seq += 1
			remotes.Input.OnServerEvent:Fire(rival, seq, if i % 40 < 3 then 16 else 0, 0)
		end
		Mock.keysDown[K.D] = i % 100 < 40
		if i % 15 == 0 then Mock.press(K.J) elseif i % 15 == 2 then Mock.release(K.J) end
		frames(1)
		if i == 1200 then dump("online") end
	end
	Mock.keysDown[K.D] = nil
	local started = false
	for _, m in rivalInbox do
		if m[1] == "MatchRemote" and m[2].op == "start" then started = true end
	end
	T.ok(started, "server never started the match")
	noWarnings("online")
	-- rival disconnects -> forfeit
	Mock.Players.PlayerRemoving:Fire(rival)
	frames(10)
	T.ok(findButton(Mock.playerGui, "MAIN MENU"), "results after forfeit")
	click("MAIN MENU")
	frames(5)
end)

return T
