--!strict
-- Training mode controls and readouts: dummy behaviour, hitbox display,
-- infinite health/meter, position reset, and live frame data of your last move.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local AttackDefinitions = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("AttackDefinitions"))
local Widgets = require(script.Parent:WaitForChild("Widgets"))
local C = Widgets.Colors

local TrainingPanel = {}
TrainingPanel.__index = TrainingPanel

local DUMMY_MODES = { "stand", "crouch", "jump", "block", "cpu" }

function TrainingPanel.new(parent: Instance, session: any, renderer: any)
	-- compact bar along the bottom edge, below the fighters' feet
	local root = Widgets.frame(parent, {
		Name = "Training",
		Size = UDim2.fromScale(0.98, 0.12),
		Position = UDim2.fromScale(0.01, 0.87),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.25,
		ZIndex = 20,
	})
	Widgets.stroke(root, C.gold, 1)
	local row = Widgets.frame(
		root,
		{ BackgroundTransparency = 1, Size = UDim2.fromScale(0.62, 0.8), Position = UDim2.fromScale(0.01, 0.1), ZIndex = 21 }
	)
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.Padding = UDim.new(0.01, 0)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = row
	local self = setmetatable({ root = root, session = session, renderer = renderer, dummyIndex = 1 }, TrainingPanel)
	local function btn(text: string, order: number, fn: () -> ()): TextButton
		return Widgets.button(row, text, { Size = UDim2.fromScale(0.192, 1), LayoutOrder = order, ZIndex = 22 }, fn)
	end
	self.dummyBtn = btn("", 1, function()
		self:cycleDummy()
	end)
	self.boxBtn = btn("", 2, function()
		self:toggleBoxes()
	end)
	self.hpBtn = btn("", 3, function()
		local t = session.match.training
		t.infiniteHealth = not t.infiniteHealth
		self:refresh()
	end)
	self.meterBtn = btn("", 4, function()
		local t = session.match.training
		t.infiniteMeter = not t.infiniteMeter
		self:refresh()
	end)
	btn("RESET (R)", 5, function()
		session:resetPositions()
	end)
	self.info = Widgets.text(root, "", {
		Size = UDim2.fromScale(0.35, 0.9),
		Position = UDim2.fromScale(0.64, 0.05),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Center,
		Font = Enum.Font.Code,
		TextStrokeTransparency = 1,
		ZIndex = 21,
	})
	self:refresh()
	return self
end

function TrainingPanel.cycleDummy(self: any)
	self.dummyIndex = self.dummyIndex % #DUMMY_MODES + 1
	self.session.ai2.mode = DUMMY_MODES[self.dummyIndex]
	self:refresh()
end

function TrainingPanel.toggleBoxes(self: any)
	self.renderer.hitboxes = not self.renderer.hitboxes
	self:refresh()
end

function TrainingPanel.refresh(self: any)
	local t = self.session.match.training
	self.dummyBtn.Text = "DUMMY: " .. string.upper(DUMMY_MODES[self.dummyIndex]) .. " (T)"
	self.boxBtn.Text = "BOXES: " .. (if self.renderer.hitboxes then "ON" else "OFF") .. " (H)"
	self.hpBtn.Text = "INF HP: " .. (if t.infiniteHealth then "ON" else "OFF")
	self.meterBtn.Text = "INF METER: " .. (if t.infiniteMeter then "ON" else "OFF")
end

function TrainingPanel.update(self: any)
	local m = self.session.match
	local me, dummy = m.fighters[1], m.fighters[2]
	local mv = me.move
	local lines = {}
	if mv then
		local hit, blk = AttackDefinitions.advantage(mv)
		table.insert(
			lines,
			string.format(
				"%s  %d/%d/%d  hit %+d blk %+d  f%d",
				string.upper(mv.name),
				mv.startup,
				mv.active,
				mv.recovery,
				hit,
				blk,
				me.curFrame + 1
			)
		)
	else
		table.insert(
			lines,
			"LAST: " .. string.upper(me.lastMoveName ~= "" and me.lastMoveName or "-") .. "   STATE " .. string.upper(me.state)
		)
	end
	table.insert(lines, string.format("COMBO %d HITS  %d DMG   DUMMY %d/%d", dummy.combo, dummy.comboDamage, dummy.hp, dummy.maxHp))
	self.info.Text = table.concat(lines, "\n")
end

function TrainingPanel.destroy(self: any)
	self.root:Destroy()
end

return TrainingPanel
