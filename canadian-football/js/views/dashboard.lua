--[[
 * @name views.dashboard
 * @namespace Dashboard.
]]

local g = require("globals")
local ui = require("ui")
local bbgmView = require("util.bbgmView")
local helpers = require("util.helpers")
local viewHelpers = require("util.viewHelpers")
local promise = require("promise") -- Assuming a promise library is available

local function updateDashboard(inputs, updateEvents)
    local deferred = promise.new()

    g.dbm.transaction("leagues").objectStore("leagues"):getAll():onsuccess(function(event)
        local leagues = event.target.result

        for i = 1, #leagues do
            if leagues[i].teamRegion == nil then
                leagues[i].teamRegion = "???"
            end
            if leagues[i].teamName == nil then
                leagues[i].teamName = "???"
            end
            leagues[i].tid = nil
        end

        deferred:resolve({
            leagues = leagues
        })
    end)

    return deferred:promise()
end

local function uiFirst(vm)
    ui.title("Dashboard")
end

return bbgmView.init({
    id = "dashboard",
    beforeReq = viewHelpers.beforeNonLeague,
    runBefore = {updateDashboard},
    uiFirst = uiFirst
})
