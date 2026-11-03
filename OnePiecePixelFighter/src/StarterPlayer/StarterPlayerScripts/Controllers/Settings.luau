--!strict
-- Player settings (client only, per session).

local Settings = {
	screenShake = true,
	renderer = "auto", -- "auto" | "gui"
	cpuDifficulty = 0.6,
	roundTime = 99,
	showHints = true,
}

local listeners: { () -> () } = {}

function Settings.set(key: string, value: any)
	(Settings :: any)[key] = value
	for _, fn in listeners do
		pcall(fn)
	end
end

function Settings.onChanged(fn: () -> ())
	table.insert(listeners, fn)
end

return Settings
