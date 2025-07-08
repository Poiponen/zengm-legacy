# 
# @name views.dashboard
# @namespace Dashboard.
#
define ["globals", "ui", "lib/jquery", "util/bbgmView", "util/helpers", "util/viewHelpers"], (globals, ui, jQuery, bbgmView, helpers, viewHelpers) ->
    "use strict"

    updateDashboard = (inputs, updateEvents) ->
        deferred = jQuery.Deferred()

        globals.dbm.transaction("leagues").objectStore("leagues").getAll().onsuccess = (event) ->
            leagues = event.target.result

            for i in [0...leagues.length]
                if leagues[i].teamRegion == undefined
                    leagues[i].teamRegion = "???"
                if leagues[i].teamName == undefined
                    leagues[i].teamName = "???"
                delete leagues[i].tid

            deferred.resolve leagues: leagues

        return deferred.promise()

    uiFirst = (viewModel) ->
        ui.title("Dashboard")

    return bbgmView.init
        id: "dashboard"
        beforeReq: viewHelpers.beforeNonLeague
        runBefore: [updateDashboard]
        uiFirst: uiFirst
