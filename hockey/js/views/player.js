/**
 * @name views.player
 * @namespace View a single message.
 */
//define(["dao","globals", "ui", "core/freeAgents", "core/player", "lib/faces", "lib/jquery", "lib/knockout", "lib/knockout.mapping", "util/bbgmView", "util/viewHelpers"], function (dao,g, ui, freeAgents, player, faces, $, ko, komapping, bbgmView, viewHelpers) {
define(["dao", "globals", "ui", "core/freeAgents", "core/player","core/trade", "lib/faces", "lib/jquery", "lib/knockout", "lib/knockout.mapping", "lib/bluebird", "util/bbgmView"], function (dao, g, ui, freeAgents, player, trade, faces, $, ko, komapping, Promise, bbgmView) {
	
    "use strict";

    var mapping;

    function get(req) {
        return {
            pid: req.params.pid !== undefined ? parseInt(req.params.pid, 10) : undefined
        };
    }


    function updatePlayer(inputs, updateEvents, vm) {
        if (updateEvents.indexOf("dbChange") >= 0 || updateEvents.indexOf("firstRun") >= 0 || !vm.retired()) {
            return Promise.all([
                dao.players.get({
                    key: inputs.pid,
                    statsSeasons: "all",
                    statsPlayoffs: true
                }),
                dao.events.getAll({
                    index: "pids",
                    key: inputs.pid
                })
            ]).spread(function (p, events) {
                var currentRatings;
				var feats;

                p = player.filter(p, {
                    attrs: ["pid", "name", "tid", "abbrev", "teamRegion", "teamName", "pos", "age", "hgtFt", "hgtIn", "weight", "born", "contract", "draft", "face", "mood", "injury", "salaries", "salariesTotal", "awardsGrouped", "freeAgentMood", "imgURL", "watch", "gamesUntilTradable"],
                    ratings: ["season", "abbrev", "age", "ovr", "pot", "hgt", "stre", "spd", "jmp","quik", "endu", "ins","hsd", "dnk", "ft", "fg", "tp", "blk", "stl", "drb", "pss", "reb","face", "skills"],
                    stats: ["season", "abbrev", "age", "gp", "gs", "min", "fg", "fga", "fgp", "tp", "tpa", "tpp", "ft", "fta", "ftp", "orb", "drb", "trb", "ast", "tov", "stl", "blk", "pf", "pts", "per", "ewa","plusminus","mfg","fgs","hits","ppmin","shmin","fow","fol","sfga","sfg","sfgs","sfgsp","pmin","fop"],
                    playoffs: true,
                    showNoStats: true,
                    showRookies: true,
                    fuzz: true
                });

                // Account for extra free agent demands
                if (p.tid === g.PLAYER.FREE_AGENT) {
                    p.contract.amount = freeAgents.amountWithMood(p.contract.amount, p.freeAgentMood[g.userTid]);
                }

                 feats = events.filter(function (event) {
                    if (event.type === "playerFeat") {
                        return true;
                    }

                    return false;
                }).map(function (event) {
                    return {
                        season: event.season,
                        text: event.text
                    };
                });
console.log(feats);

                events = events.filter(function (event) {
                    if (event.type === "award" || event.type === "injured" || event.type === "healed" || event.type === "hallOfFame" || event.type === "playerFeat") {
                        return false;
                    }

                    return true;
                }).map(function (event) {
                    return {
                        season: event.season,
                        text: event.text
                    };
                });			

                // Add untradable property
                p = trade.filterUntradable([p])[0];
				
				
                return {
                    player: p,
                    showTradeFor: p.tid !== g.userTid && p.tid >= 0,
                    freeAgent: p.tid === g.PLAYER.FREE_AGENT,
                    retired: p.tid === g.PLAYER.RETIRED,
                    showContract: p.tid !== g.PLAYER.UNDRAFTED && p.tid !== g.PLAYER.UNDRAFTED_2 && p.tid !== g.PLAYER.UNDRAFTED_3 && p.tid !== g.PLAYER.UNDRAFTED_FANTASY_TEMP && p.tid !== g.PLAYER.RETIRED,
                    injured: p.injury.type !== "Healthy",
                    godMode: g.godMode,
                    events: events,
                    feats: feats
                };
            });
        }
    }

    function uiFirst(vm) {
        ko.computed(function () {
            ui.title(vm.player.name());
        }).extend({throttle: 1});

        ko.computed(function () {
            var img, pic;

            // Manually clear picture, since we're not using Knockout for this
            pic = document.getElementById("picture");
            while (pic.firstChild) {
                pic.removeChild(pic.firstChild);
            }			
			
            // If playerImgURL is not an empty string, use it instead of the generated face
            if (vm.player.imgURL()) {
                img = document.createElement("img");
                img.src = vm.player.imgURL();
                img.style.maxHeight = "100%";
                img.style.maxWidth = "100%";
                pic.appendChild(img);
            } else {
                faces.display("picture",  komapping.toJS(vm.player.face));
            }
        }).extend({throttle: 1});

        ui.tableClickableRows($(".table-clickable-rows"));
    }

    return bbgmView.init({
        id: "player",
        get: get,
        runBefore: [updatePlayer],
        uiFirst: uiFirst
    });
});
