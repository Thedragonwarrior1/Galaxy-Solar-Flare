--!nonstrict
-- Tiny test framework.
local T = { tests = {}, failures = 0 }
function T.test(name, fn)
	table.insert(T.tests, { name = name, fn = fn })
end
function T.ok(v, msg)
	if not v then
		error("assertion failed: " .. tostring(msg or "expected truthy"), 2)
	end
end
function T.eq(a, b, msg)
	if a ~= b then
		error(string.format("expected %s, got %s %s", tostring(b), tostring(a), msg and ("(" .. msg .. ")") or ""), 2)
	end
end
function T.run()
	local passed = 0
	for _, t in T.tests do
		if T.filter and not string.find(t.name, T.filter, 1, true) then
			continue
		end
		local ok, err = pcall(t.fn)
		if ok then
			passed += 1
			print("  ok   " .. t.name)
		else
			T.failures += 1
			print("  FAIL " .. t.name .. "\n       " .. tostring(err))
		end
	end
	print(string.format("%d/%d passed", passed, #T.tests))
	T.tests = {}
	return T.failures == 0
end
return T
