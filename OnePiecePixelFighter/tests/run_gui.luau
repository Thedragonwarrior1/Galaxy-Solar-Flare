-- Same headless client run, but with EditableImage unavailable (as in a
-- published game whose owner is not ID verified): exercises the GUI-frame renderer.
local process = require("@lune/process")
local Mock = require("./robloxmock")
Mock.noEditable = true
local T = require("./t")
T.filter = process.args[1]
print("suite ./client.test (GUI fallback renderer)")
require("./client.test")
local ok = T.run()
print("GUI instances created:", Mock.created)
process.exit(if ok then 0 else 1)
