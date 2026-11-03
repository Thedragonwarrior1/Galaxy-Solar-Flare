--!strict
-- The game is drawn entirely in 2D on a ScreenGui. The 3D camera is locked
-- (Scriptable, fixed) so nothing in the 3D world moves behind the UI, and the
-- default Roblox HUD is hidden.

local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")
local RunService = game:GetService("RunService")

local CameraController = {}

function CameraController.start()
	local cam = workspace.CurrentCamera
	local function lock()
		cam = workspace.CurrentCamera
		if cam then
			cam.CameraType = Enum.CameraType.Scriptable
			cam.CFrame = CFrame.new(0, 500, 0) * CFrame.Angles(-math.pi / 2, 0, 0)
			cam.FieldOfView = 30
		end
	end
	lock()
	workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(lock)
	-- something (character scripts) may reset the camera; keep it locked
	RunService:BindToRenderStep("FighterCameraLock", Enum.RenderPriority.Camera.Value + 1, function()
		if cam and cam.CameraType ~= Enum.CameraType.Scriptable then
			lock()
		end
	end)
	for _, t in { Enum.CoreGuiType.Backpack, Enum.CoreGuiType.Health, Enum.CoreGuiType.PlayerList, Enum.CoreGuiType.EmotesMenu } do
		pcall(function()
			StarterGui:SetCoreGuiEnabled(t, false)
		end)
	end
	task.spawn(function()
		for _ = 1, 10 do
			local ok = pcall(function()
				StarterGui:SetCore("ResetButtonCallback", false)
			end)
			if ok then
				break
			end
			task.wait(0.5)
		end
	end)
	local player = Players.LocalPlayer
	player.CameraMode = Enum.CameraMode.Classic
end

return CameraController
