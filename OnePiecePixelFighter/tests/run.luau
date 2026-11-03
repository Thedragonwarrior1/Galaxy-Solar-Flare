local process = require("@lune/process")
local T = require("./t")
local suites = { "./sim.test", "./match.test", "./protocol.test", "./client.test" }
local args = process.args
for _, s in suites do
	print("suite " .. s)
	require(s)
	T.run()
end
process.exit(if T.failures == 0 then 0 else 1)
