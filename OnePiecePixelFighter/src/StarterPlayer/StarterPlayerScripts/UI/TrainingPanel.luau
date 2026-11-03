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
	local root = Widgets.frame(parent, {
		Name = "Training",
		Size = UDim2.fromScale(0.24, 0.5),
		Position = UDim2.fromScale(0.99, 0.24),
		AnchorPoint = Vector2.new(1, 0),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.25,
		ZIndex = 20,
	})
	Widgets.stroke(root, C.gold, 1)
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0.015, 0)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = root
	local self = setmetatable({ root = root, session = session, renderer = renderer, dummyIndex = 1 }, TrainingPanel)
	local function btn(text: string, order: number, fn: () -> ()): TextButton
		return Widgets.button(
			root,
			text,
			{ Size = UDim2.fromScale(1, 0.1), LayoutOrder = order, ZIndex = 21, TextXAlignment = Enum.TextXAlignment.Left },
			fn
		)
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
	btn("RESET POSITIONS (R)", 5, function()
		session:resetPositions()
	end)
	self.info = Widgets.text(root, "", {
		Size = UDim2.fromScale(1, 0.4),
		LayoutOrder = 6,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
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
	self.boxBtn.Text = "HITBOXES: " .. (if self.renderer.hitboxes then "ON" else "OFF") .. " (H)"
	self.hpBtn.Text = "INFINITE HEALTH: " .. (if t.infiniteHealth then "ON" else "OFF")
	self.meterBtn.Text = "INFINITE METER: " .. (if t.infiniteMeter then "ON" else "OFF")
end

function TrainingPanel.update(self: any)
	local m = self.session.match
	local me, dummy = m.fighters[1], m.fighters[2]
	local mv = me.move
	local lines = {}
	if mv then
		local hit, blk = AttackDefinitions.advantage(mv)
		table.insert(lines, string.upper(mv.name))
		table.insert(lines, string.format("startup %d  active %d  recov %d", mv.startup, mv.active, mv.recovery))
		table.insert(lines, string.format("on hit %+d  on block %+d", hit, blk))
		table.insert(lines, string.format("frame %d / %d", me.curFrame + 1, mv.startup + mv.active + mv.recovery))
	else
		table.insert(lines, "LAST: " .. string.upper(me.lastMoveName ~= "" and me.lastMoveName or "-"))
	end
	table.insert(lines, string.format("combo %d hits  %d dmg", dummy.combo, dummy.comboDamage))
	table.insert(lines, string.format("dummy hp %d / %d", dummy.hp, dummy.maxHp))
	table.insert(lines, "state " .. me.state .. "  meter " .. math.floor(me.meter))
	self.info.Text = table.concat(lines, "\n")
end

function TrainingPanel.destroy(self: any)
	self.root:Destroy()
end

return TrainingPanel
