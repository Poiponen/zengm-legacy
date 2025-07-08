--[[
 * @name views.manual
 * @namespace Manual pages.
]]

local ui = require("ui")
local bbgmView = require("util.bbgmView")
local viewHelpers = require("util.viewHelpers")

local function templateString(page)
    local output = "manual"
    local upperNext = true

    for i = 1, #page do
        local char = page:sub(i, i)
        if upperNext then
            output = output .. char:upper()
            upperNext = false
        elseif char == "_" then
            upperNext = true
        else
            output = output .. char
        end
    end

    return output
end

local function get(req)
    return {
        page = req.params.page or "overview"
    }
end

local function updateManual(inputs, updateEvents)
    return {
        page = inputs.page
    }
end

local function uiFirst(vm)
    ui.title("Manual")
end

local function uiEvery(updateEvents, vm)
    ui.update({
        container = "manual-content",
        template = templateString(vm.page())
    })
end

return bbgmView.init({
    id = "manual",
    beforeReq = viewHelpers.beforeNonLeague,
    get = get,
    runBefore = { updateManual },
    uiFirst = uiFirst,
    uiEvery = uiEvery
})
