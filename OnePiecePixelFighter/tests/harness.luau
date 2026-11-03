--!nonstrict
-- Lune test harness: emulates the Roblox instance tree that Rojo builds from
-- default.project.json, so `require(script.Parent.X)` works unchanged.

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")

local Harness = {}

local ROOT = process.cwd
if string.sub(ROOT, -1) ~= "/" then
	ROOT ..= "/"
end

local Node = {}
Node.__index = function(self, k)
	local m = rawget(Node, k)
	if m then
		return m
	end
	local kids = rawget(self, "_children")
	if kids and kids[k] then
		return kids[k]
	end
	return nil
end

local function newNode(name, class, path, parent)
	local n = setmetatable({ Name = name, ClassName = class, _path = path, _children = {}, Parent = parent }, Node)
	if parent then
		parent._children[name] = n
	end
	return n
end

function Node:GetChildren()
	local out = {}
	for _, c in self._children do
		table.insert(out, c)
	end
	table.sort(out, function(a, b)
		return a.Name < b.Name
	end)
	return out
end
function Node:FindFirstChild(name)
	return self._children[name]
end
function Node:WaitForChild(name)
	local c = self._children[name]
	assert(c, "WaitForChild: no child " .. name .. " under " .. self.Name)
	return c
end
function Node:GetService(name)
	return self:WaitForChild(name)
end
function Node:IsA(class)
	return self.ClassName == class or (class == "LuaSourceContainer" and self._path ~= nil)
end
function Node:GetFullName()
	local parts = {}
	local n = self
	while n do
		table.insert(parts, 1, n.Name)
		n = n.Parent
	end
	return table.concat(parts, ".")
end

local function stripExt(name)
	for _, ext in { ".server.luau", ".client.luau", ".luau", ".lua" } do
		if string.sub(name, -#ext) == ext then
			return string.sub(name, 1, -#ext - 1), ext
		end
	end
	return nil
end

local function build(dir, parent)
	for _, entry in fs.readDir(dir) do
		local full = dir .. "/" .. entry
		if fs.isDir(full) then
			local init = nil
			for _, cand in { "init.luau", "init.lua", "init.server.luau", "init.client.luau" } do
				if fs.isFile(full .. "/" .. cand) then
					init = full .. "/" .. cand
				end
			end
			local n = newNode(entry, if init then "ModuleScript" else "Folder", init, parent)
			build(full, n)
		else
			local base, ext = stripExt(entry)
			if base and base ~= "init" then
				local class = if ext == ".server.luau" then "Script" elseif ext == ".client.luau" then "LocalScript" else "ModuleScript"
				newNode(base, class, full, parent)
			end
		end
	end
end

local game = newNode("game", "DataModel", nil, nil)
for _, svc in { "ReplicatedStorage", "ServerScriptService", "StarterPlayer" } do
	local n = newNode(svc, "Folder", nil, game)
	if fs.isDir(ROOT .. "src/" .. svc) then
		build(ROOT .. "src/" .. svc, n)
	end
end
Harness.game = game

local cache = {}
local requireNode

local function makeEnv(node)
	local env = {}
	for k, v in Harness.globals do
		env[k] = v
	end
	env.script = node
	env.require = function(target)
		return requireNode(target)
	end
	env.game = game
	return setmetatable(env, { __index = function(_, k)
		return Harness.globals[k]
	end })
end

Harness.globals = {
	math = math, string = string, table = table, buffer = buffer, bit32 = bit32, utf8 = utf8,
	os = os, coroutine = coroutine, debug = debug,
	pairs = pairs, ipairs = ipairs, next = next, select = select, type = type, typeof = typeof,
	tostring = tostring, tonumber = tonumber, error = error, assert = assert, pcall = pcall, xpcall = xpcall,
	setmetatable = setmetatable, getmetatable = getmetatable, rawget = rawget, rawset = rawset,
	rawequal = rawequal, rawlen = rawlen, print = print, warn = print, unpack = table.unpack,
}

function requireNode(node)
	assert(type(node) == "table" and node._path, "require: not a module: " .. tostring(node and node.Name))
	local c = cache[node]
	if c ~= nil then
		return c.value
	end
	local src = fs.readFile(node._path)
	local fn = luau.load(src, { debugName = node:GetFullName(), environment = makeEnv(node) })
	local value = fn()
	cache[node] = { value = value }
	return value
end

function Harness.require(path)
	local n = game
	for part in string.gmatch(path, "[^%.]+") do
		n = n:WaitForChild(part)
	end
	return requireNode(n)
end

return Harness
