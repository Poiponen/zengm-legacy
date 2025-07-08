# /**
#  * @name views.teamStats
#  * @namespace Team stats table.
#  */

define ["globals", "ui", "core/team", "lib/jquery", "lib/knockout", "lib/underscore", "views/components", "util/bbgmView", "util/helpers", "util/viewHelpers"], (globals, ui, team, $, ko, _, components, bbgmView, helpers, viewHelpers) ->
    "use strict"

    mapping = {}

    get = (req) ->
        season: helpers.validateSeason(req.params.season)

    InitViewModel = ->
        @season = ko.observable()

    mapping = 
        teams: 
            create: (options) ->
                options.data

    updateTeams = (inputs, updateEvents, viewModel) ->
        deferred = null

        if updateEvents.indexOf("dbChange") >= 0 or (inputs.season is globals.season and (updateEvents.indexOf("gameSim") >= 0 or updateEvents.indexOf("playerMovement") >= 0)) or inputs.season isnt viewModel.season()
            deferred = $.Deferred()

            team.filter
                attrs: ["abbrev"]
                seasonAttrs: ["won", "lost"]
                stats: ["gp", "fg", "fga", "fgp", "tp", "tpa", "tpp", "ft", "fta", "ftp", "orb", "drb", "trb", "ast", "tov", "stl", "blk", "pf", "pts", "oppPts", "diff", "ty", "ruya", "pya", "fgAtRim", "fgaAtRim", "fgpAtRim", "inter", "ytp", "prp", "fdt", "fdp", "fdr", "turn"]
                season: inputs.season
                (teams) ->
                    deferred.resolve
                        season: inputs.season
                        teams: teams

            return deferred.promise()

    uiFirst = (viewModel) ->
        ko.computed ->
            ui.title("Team Stats - " + viewModel.season()).extend {throttle: 1}

        ko.computed ->
            season = viewModel.season()
            ui.datatableSinglePage $("#team-stats"), 2, _.map(viewModel.teams(), (team) ->
                ['<a href="' + helpers.leagueUrl(["roster", team.abbrev, season]) + '">' + team.abbrev + '</a>', String(team.gp), String(team.won), String(team.lost), helpers.round(team.ty, 0), helpers.round(team.prp, 0), helpers.round(team.ytp, 1), helpers.round(team.fdt, 0), helpers.round(team.turn, 1), helpers.round(team.fg, 0), helpers.round(team.fga, 0), helpers.round(team.fgp, 1), helpers.round(team.stl, 0), helpers.round(team.pya, 1), helpers.round(team.blk, 1), helpers.round(team.inter, 1), helpers.round(team.fdp, 0), helpers.round(team.tov, 0), helpers.round(team.drb, 0), helpers.round(team.ruya, 1), helpers.round(team.fdr, 0), helpers.round(team.fgAtRim, 1), helpers.round(team.fgaAtRim, 1), helpers.round(team.fgpAtRim, 1), helpers.round(team.pts, 1), helpers.round(team.oppPts, 1), helpers.round(team.diff, 1)]
            ), 
                fnRowCallback: (nRow, rowData) ->
                    # Show point differential in green or red for positive or negative
                    if rowData[rowData.length - 1] > 0
                        nRow.childNodes[nRow.childNodes.length - 1].classList.add("text-success")
                    else if rowData[rowData.length - 1] < 0
                        nRow.childNodes[nRow.childNodes.length - 1].classList.add("text-danger")
            ).extend {throttle: 1}

        ui.tableClickableRows $("#team-stats")

    uiEvery = (updateEvents, viewModel) ->
        components.dropdown("team-stats-dropdown", ["seasons"], [viewModel.season()], updateEvents)

    return bbgmView.init
        id: "teamStats"
        get: get
        InitViewModel: InitViewModel
        mapping: mapping
        runBefore: [updateTeams]
        uiFirst: uiFirst
        uiEvery: uiEvery
