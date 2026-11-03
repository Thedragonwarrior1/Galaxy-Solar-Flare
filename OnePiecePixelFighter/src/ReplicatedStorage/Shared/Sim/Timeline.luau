--!strict
-- Maps simulation time onto animation rows from a character's FrameData.
--
-- State animations play by their own per-frame durations.
-- Attack animations are mapped *by phase*: the move's startup frames are
-- spread over the animation's startup rows, the active frames over its active
-- rows, and so on. The sprite showing the strike is therefore on screen exactly
-- while the move's hitbox is live, whatever the move's frame data is tuned to.

local Timeline = {}

export type Row = {
	f: number,
	d: number,
	p: string?,
	hurt: { { number } }?,
	hit: { { number } }?,
	anc: { [string]: { number } }?,
}

export type Anim = {
	sheet: string,
	loop: boolean,
	kind: string,
	speedRef: number?,
	frames: { Row },
}

type PhaseInfo = { rows: { number }, cum: { number }, total: number }
type Prepared = { total: number, cum: { number }, s: PhaseInfo, a: PhaseInfo, r: PhaseInfo }

local cache: { [any]: Prepared } = setmetatable({}, { __mode = "k" }) :: any

local function phaseInfo(): PhaseInfo
	return { rows = {}, cum = {}, total = 0 }
end

local function prepare(anim: Anim): Prepared
	local p = cache[anim]
	if p then
		return p
	end
	local prep: Prepared = { total = 0, cum = {}, s = phaseInfo(), a = phaseInfo(), r = phaseInfo() }
	for i, row in anim.frames do
		prep.total += row.d
		prep.cum[i] = prep.total
		local ph = row.p
		if ph then
			local info = (prep :: any)[ph] :: PhaseInfo
			table.insert(info.rows, i)
			info.total += row.d
			table.insert(info.cum, info.total)
		end
	end
	-- an attack animation missing a phase borrows the neighbouring phase
	if #prep.a.rows == 0 then
		prep.a = if #prep.s.rows > 0 then prep.s else prep.r
	end
	if #prep.s.rows == 0 then
		prep.s = prep.a
	end
	if #prep.r.rows == 0 then
		prep.r = prep.a
	end
	cache[anim] = prep
	return prep
end

function Timeline.length(anim: Anim): number
	return prepare(anim).total
end

-- Row index for a state animation t frames after it started.
function Timeline.stateRow(anim: Anim, t: number): number
	local prep = prepare(anim)
	local n = #anim.frames
	if n == 0 or prep.total <= 0 then
		return 1
	end
	if anim.loop then
		t = t % prep.total
	elseif t >= prep.total then
		return n
	end
	for i = 1, n do
		if t < prep.cum[i] then
			return i
		end
	end
	return n
end

local function pick(info: PhaseInfo, progress: number, loopDur: boolean, localFrame: number): number
	local rows = info.rows
	if #rows == 0 then
		return 1
	end
	if loopDur then
		-- play rows at their authored speed, cycling (multi-hit flurries)
		local t = localFrame % math.max(1, info.total)
		for k = 1, #rows do
			if t < info.cum[k] then
				return rows[k]
			end
		end
		return rows[#rows]
	end
	local target = math.clamp(progress, 0, 0.9999) * info.total
	for k = 1, #rows do
		if target < info.cum[k] then
			return rows[k]
		end
	end
	return rows[#rows]
end

-- Row index for an attack: f = frames since the move started (0-based).
function Timeline.moveRow(anim: Anim, startup: number, active: number, recovery: number, f: number, activeLoop: boolean?): number
	local prep = prepare(anim)
	if f < startup then
		return pick(prep.s, f / math.max(1, startup), false, f)
	end
	f -= startup
	if f < active then
		return pick(prep.a, f / math.max(1, active), activeLoop == true, f)
	end
	f -= active
	return pick(prep.r, f / math.max(1, recovery), false, f)
end

return Timeline
