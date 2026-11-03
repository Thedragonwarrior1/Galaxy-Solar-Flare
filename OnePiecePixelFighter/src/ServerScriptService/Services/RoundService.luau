--!strict
-- Watches match phases and reports round/match results to players
-- (and keeps a simple Wins leaderstat).

local Players = game:GetService("Players")

local RoundService = {}
local remotes: any

function RoundService.init(r: any)
	remotes = r
	Players.PlayerAdded:Connect(function(p: Player)
		local ls = Instance.new("Folder")
		ls.Name = "leaderstats"
		local wins = Instance.new("IntValue")
		wins.Name = "Wins"
		wins.Parent = ls
		ls.Parent = p
	end)
end

-- called by CombatService after each step
function RoundService.observe(entry: any)
	local m = entry.match
	if m.phase ~= entry.lastPhase then
		entry.lastPhase = m.phase
		if m.phase == "matchEnd" and not entry.reported then
			entry.reported = true
			local winner = m.result
			for slot, p in entry.players do
				if p.Parent then
					remotes.Match:FireClient(p, { op = "ended", result = winner, you = slot })
					if winner == slot then
						local ls = p:FindFirstChild("leaderstats")
						local w = ls and ls:FindFirstChild("Wins")
						if w then
							(w :: IntValue).Value += 1
						end
					end
				end
			end
		end
	end
end

return RoundService
