# 
# @name views.manual
# @namespace Manual pages.
#

define ["ui", "util/bbgmView", "util/viewHelpers"], (ui, bbgmView, viewHelpers) ->
    "use strict"

    templateString = (page) ->
        output = "manual"
        upperNext = true

        for i in [0...page.length]
            if upperNext
                output += page.charAt(i).toUpperCase()
                upperNext = false
            else if page.charAt(i) == "_"
                upperNext = true
            else
                output += page.charAt(i)

        output

    get = (req) ->
        page: if req.params.page? then req.params.page else "overview"

    updateManual = (inputs, updateEvents) ->
        page: inputs.page

    uiFirst = (vm) ->
        ui.title("Manual")

    uiEvery = (updateEvents, vm) ->
        ui.update
            container: "manual-content"
            template: templateString(vm.page())

    bbgmView.init
        id: "manual"
        beforeReq: viewHelpers.beforeNonLeague
        get: get
        runBefore: [updateManual]
        uiFirst: uiFirst
        uiEvery: uiEvery
