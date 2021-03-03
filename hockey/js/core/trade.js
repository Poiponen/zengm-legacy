/**
 * @name core.trade
 * @namespace Trades between the user's team and other teams.
 */
define(["dao", "globals", "core/league", "core/player", "core/team", "lib/bluebird", "lib/underscore", "util/eventLog", "util/helpers"], function (dao, g, league, player, team, Promise, _, eventLog, helpers) {

    "use strict";

    /**
     * Get the contents of the current trade from the database.
     *
     * @memberOf core.trade
     * @param {Promise.<Array.<Object>>} Resolves to an array of objects containing the assets for the two teams in the trade. The first object is for the user's team and the second is for the other team. Values in the objects are tid (team ID), pids (player IDs) and dpids (draft pick IDs).
     */
    function get(ot) {
        return dao.trade.get({ot: ot, key: 0}).then(function (tr) {
            return tr.teams;
        });
    }

    /**
     * Start a new trade with a team.
     *
     * @memberOf core.trade
     * @param {Array.<Object>} teams Array of objects containing the assets for the two teams in the trade. The first object is for the user's team and the second is for the other team. Values in the objects are tid (team ID), pids (player IDs) and dpids (draft pick IDs). If the other team's tid is null, it will automatically be determined from the pids.
     * @return {Promise}
     */
    function create(teams) {
        return get().then(function (oldTeams) {
            // If nothing is in this trade, it's just a team switch, so keep the old stuff from the user's team
            if (teams[0].pids.length === 0 && teams[1].pids.length === 0 && teams[0].dpids.length === 0 && teams[1].dpids.length === 0) {
                teams[0].pids = oldTeams[0].pids;
                teams[0].dpids = oldTeams[0].dpids;
            }

            // Make sure tid is set
            return Promise.try(function () {
                if (teams[1].tid === undefined || teams[1].tid === null) {
                    return dao.players.get({key: teams[1].pids[0]}).then(function (p) {
                        teams[1].tid = p.tid;
                    });
                }
            }).then(function () {
                var tx;

                tx = dao.tx("trade", "readwrite");
                dao.trade.put({
                    ot: tx,
                    value: {
                        rid: 0,
                        teams: teams
                    }
                });
                return tx.complete().then(function () {
                    league.updateLastDbChange();
                });
            });
        });
    }

    /**
     * Gets the team ID for the team that the user is trading with.
     *
     * @memberOf core.trade
     * @return {er} Resolves to the other team's team ID.
     */
    function getOtherTid() {
        return get().then(function (teams) {
            return teams[1].tid;
        });
    }

    /**
     * Filter untradable players.
     *
     * If a player is not tradable, set untradable flag in the root of the object.
     *
     * @memberOf core.trade
     * @param {Array.<Object>} players Array of player objects or partial player objects
     * @return {Array.<Object>} Processed input
     */
    function filterUntradable(players) {
        var i;

        for (i = 0; i < players.length; i++) {
            if (players[i].contract.exp <= g.season && g.phase > g.PHASE.PLAYOFFS && g.phase < g.PHASE.FREE_AGENCY) {
                // If the season is over, can't trade players whose contracts are expired
                players[i].untradable = true;
                players[i].untradableMsg = "Cannot trade expired contracts";
            } else if (players[i].gamesUntilTradable > 0) {
                // Can't trade players who recently were signed or traded
                players[i].untradable = true;
                players[i].untradableMsg = "Cannot trade recently-acquired player for " + players[i].gamesUntilTradable + " more games";
            } else {
                players[i].untradable = false;
                players[i].untradableMsg = "";
            }
        }

        return players;
    }

    /**
     * Is a player untradable.
     *
     * Just calls filterUntradable and discards everything but the boolean.
     *
     * @memberOf core.trade
     * @param {<Object>} players Player object or partial player objects
     * @return {boolean} Processed input
     */
    function isUntradable(player) {
        return filterUntradable([player])[0].untradable;
    }

    /**
     * Validates that players are allowed to be traded and updates the database.
     *
     * If any of the player IDs submitted do not correspond with the two teams that are trading, they will be ignored.
     *
     * @memberOf core.trade
     * @param {Array.<Object>} teams Array of objects containing the assets for the two teams in the trade. The first object is for the user's team and the second is for the other team. Values in the objects are tid (team ID), pids (player IDs) and dpids (draft pick IDs).
     * @return {Promise.<Array.<Object>>} Resolves to an array taht's the same as the input, but with invalid entries removed.
     */
    function updatePlayers(teams) {
        var promises, tx;

        // This is just for debugging
        team.valueChange(teams[1].tid, teams[0].pids, teams[1].pids, teams[0].dpids, teams[1].dpids, null).then(function (dv) {
            console.log(dv);
        });

        tx = dao.tx(["draftPicks", "players"]);

        // Make sure each entry in teams has pids and dpids that actually correspond to the correct tid
        promises = [];
        teams.forEach(function (t) {
            // Check players
            promises.push(dao.players.getAll({
                ot: tx,
                index: "tid",
                key: t.tid
            }).then(function (players) {
                var j, pidsGood;

                pidsGood = [];
                for (j = 0; j < players.length; j++) {
                    // Also, make sure player is not untradable
                    if (t.pids.indexOf(players[j].pid) >= 0 && !isUntradable(players[j])) {
                        pidsGood.push(players[j].pid);
                    }
                }
                t.pids = pidsGood;
            }));

            // Check draft picks
            promises.push(dao.draftPicks.getAll({
                ot: tx,
                index: "tid",
                key: t.tid
            }).then(function (dps) {
                var dpidsGood, j;

                dpidsGood = [];
                for (j = 0; j < dps.length; j++) {
                    if (t.dpids.indexOf(dps[j].dpid) >= 0) {
                        dpidsGood.push(dps[j].dpid);
                    }
                }
                t.dpids = dpidsGood;
            }));
        });

        return Promise.all(promises).then(function () {
            var tx, updated;

            updated = false; // Has the trade actually changed?

            tx = dao.tx("trade", "readwrite");
            get(tx).then(function (oldTeams) {
                var i;

                for (i = 0; i < 2; i++) {
                    if (teams[i].tid !== oldTeams[i].tid) {
                        updated = true;
                        break;
                    }
                    if (teams[i].pids.toString() !== oldTeams[i].pids.toString()) {
                        updated = true;
                        break;
                    }
                    if (teams[i].dpids.toString() !== oldTeams[i].dpids.toString()) {
                        updated = true;
                        break;
                    }
                }

                if (updated) {
                    dao.trade.put({
                        ot: tx,
                        value: {
                            rid: 0,
                            teams: teams
                        }
                    });
                }
            });

            return tx.complete().then(function () {
                if (updated) {
                    league.updateLastDbChange();
                }
            });
        }).then(function () {
            return teams;
        });
    }


    /**
     * Create a summary of the trade, for eventual display to the user.
     *
     * @memberOf core.trade
     * @param {Array.<Object>} teams Array of objects containing the assets for the two teams in the trade. The first object is for the user's team and the second is for the other team. Values in the objects are tid (team ID), pids (player IDs) and dpids (draft pick IDs).
     * @return {Promise.Object} Resolves to an object contianing the trade summary.
     */
    function summary(teams) {
        var dpids, i, pids, players, promises, s, tids, tx;

        tids = [teams[0].tid, teams[1].tid];
        pids = [teams[0].pids, teams[1].pids];
        dpids = [teams[0].dpids, teams[1].dpids];

        s = {teams: [], warning: null};
        for (i = 0; i < 2; i++) {
            s.teams.push({trade: [], total: 0, payrollAfterTrade: 0, name: ""});
        }

        tx = dao.tx(["draftPicks", "players", "releasedPlayers"]);

        // Calculate properties of the trade
        players = [[], []];
        promises = [];
        [0, 1].forEach(function (i) {
            promises.push(dao.players.getAll({
                ot: tx,
                index: "tid",
                key: tids[i]
            }).then(function (playersTemp) {
                players[i] = player.filter(playersTemp, {
                    attrs: ["pid", "name", "contract"],
                    season: g.season,
                    tid: tids[i],
                    showRookies: true
                });
                s.teams[i].trade = players[i].filter(function (player) { return pids[i].indexOf(player.pid) >= 0; });
                s.teams[i].total = s.teams[i].trade.reduce(function (memo, player) { return memo + player.contract.amount; }, 0);
            }));

            promises.push(dao.draftPicks.getAll({
                ot: tx,
                index: "tid",
                key: tids[i]
            }).then(function (picks) {
                var j;

                s.teams[i].picks = [];
                for (j = 0; j < picks.length; j++) {
                    if (dpids[i].indexOf(picks[j].dpid) >= 0) {
						if (picks[j].round == 1) {
							s.teams[i].picks.push({desc: picks[j].season + " " + (picks[j].round === 1 ? "1st" : "2nd") + " round pick (" + g.teamAbbrevsCache[picks[j].originalTid] + ")"});
						} else if (picks[j].round == 2) {								
							s.teams[i].picks.push({desc: picks[j].season + " " + (picks[j].round === 1 ? "1st" : "2nd") + " round pick (" + g.teamAbbrevsCache[picks[j].originalTid] + ")"});
						} else if (picks[j].round == 3) {								
							s.teams[i].picks.push({desc: picks[j].season + " " + "3rd"+ " round pick (" + g.teamAbbrevsCache[picks[j].originalTid] + ")"});
						} else if (picks[j].round == 4) {								
							s.teams[i].picks.push({desc: picks[j].season + " " + "4th" + " round pick (" + g.teamAbbrevsCache[picks[j].originalTid] + ")"});
						} else if (picks[j].round == 5) {								
							s.teams[i].picks.push({desc: picks[j].season + " " + "5th" + " round pick (" + g.teamAbbrevsCache[picks[j].originalTid] + ")"});
						} else if (picks[j].round == 6) {								
							s.teams[i].picks.push({desc: picks[j].season + " " + "6th" + " round pick (" + g.teamAbbrevsCache[picks[j].originalTid] + ")"});
						} else  {								
							s.teams[i].picks.push({desc: picks[j].season + " " + "7th" + " round pick (" + g.teamAbbrevsCache[picks[j].originalTid] + ")"});
						}					
					
                        //s.teams[i].picks.push({desc: picks[j].season + " " + (picks[j].round === 1 ? "1st" : "2nd") + " round pick (" + g.teamAbbrevsCache[picks[j].originalTid] + ")"});
                    }
                }
            }));
        });

        return Promise.all(promises).then(function () {
            var overCap, ratios;

            // Test if any warnings need to be displayed
            overCap = [false, false];
            ratios = [0, 0];
            return Promise.map([0, 1], function (j) {
                var k;
                if (j === 0) {
                    k = 1;
                } else if (j === 1) {
                    k = 0;
                }

                s.teams[j].name = g.teamRegionsCache[tids[j]] + " " + g.teamNamesCache[tids[j]];

                if (s.teams[j].total > 0) {
                    ratios[j] = Math.floor((100 * s.teams[k].total) / s.teams[j].total);
                } else if (s.teams[k].total > 0) {
                    ratios[j] = Infinity;
                } else {
                    ratios[j] = 100;
                }

                return team.getPayroll(tx, tids[j]).get(0).then(function (payroll) {
                    s.teams[j].payrollAfterTrade = payroll / 1000 + s.teams[k].total - s.teams[j].total;
                    if (s.teams[j].payrollAfterTrade > g.salaryCap / 1000) {
                        overCap[j] = true;
                    }
                });
            }).then(function () {
                var j;

                if ((ratios[0] > 125 && overCap[0] === true) || (ratios[1] > 125 && overCap[1] === true)) {
                    // Which team is at fault?;
                    if (ratios[0] > 125) {
                        j = 0;
                    } else {
                        j = 1;
                    }
                    s.warning = "The " + s.teams[j].name + " are over the salary cap, so the players it receives must have a combined salary of less than 125% of the salaries of the players it trades away.  Currently, that value is " + ratios[j] + "%.";
                }

                return s;
            });
        });
    }


    /**
     * Remove all players currently added to the trade.
     *
     * @memberOf core.trade
     * @return {Promise}
     */
    function clear() {
        var tx;

        tx = dao.tx("trade", "readwrite");
        dao.trade.get({ot: tx, key: 0}).then(function (tr) {
            var i;

            for (i = 0; i < tr.teams.length; i++) {
                tr.teams[i].pids = [];
                tr.teams[i].dpids = [];
            }

            dao.trade.put({ot: tx, value: tr});
        });
        return tx.complete().then(function () {
            league.updateLastDbChange();
        });
    }

    /**
     * Proposes the current trade in the database.
     *
     * Before proposing the trade, the trade is validated to ensure that all player IDs match up with team IDs.
     *
     * @memberOf core.trade
     * @param {boolean} forceTrade When true (like in God Mode), this trade is accepted regardless of the AI
     * @return {Promise.<boolean, string>} Resolves to an array. The first argument is a boolean for whether the trade was accepted or not. The second argument is a string containing a message to be dispalyed to the user.
     */
    function propose(forceTrade) {
        forceTrade = forceTrade !== undefined ? forceTrade : false;

        if (g.phase >= g.PHASE.AFTER_TRADE_DEADLINE && g.phase <= g.PHASE.PLAYOFFS) {
            return Promise.resove([false, "Error! You're not allowed to make trades now."]);
        }

        return get().then(function (teams) {
            var dpids, pids, tids;

            tids = [teams[0].tid, teams[1].tid];
            pids = [teams[0].pids, teams[1].pids];
            dpids = [teams[0].dpids, teams[1].dpids];

            // The summary will return a warning if (there is a problem. In that case,
            // that warning will already be pushed to the user so there is no need to
            // return a redundant message here.
            return summary(teams).then(function (s) {
                var outcome;

                if (s.warning && !forceTrade) {
                    return [false, null];
                }

                outcome = "rejected"; // Default

                return team.valueChange(teams[1].tid, teams[0].pids, teams[1].pids, teams[0].dpids, teams[1].dpids, null).then(function (dv) {
                    var formatAssetsEventLog, tx;

                    tx = dao.tx(["draftPicks", "players", "playerStats"], "readwrite");

					console.log(dv);
                    if (dv > 0 || forceTrade) {
                        // Trade players
                        outcome = "accepted";
                        [0, 1].forEach(function (j) {
                            var k;

                            if (j === 0) {
                                k = 1;
                            } else if (j === 1) {
                                k = 0;
                            }

                            pids[j].forEach(function (pid) {
                                dao.players.get({
                                    ot: tx,
                                    key: pid
                                }).then(function (p) {
                                    p.tid = tids[k];
                                    // Don't make traded players untradable
                                    //p.gamesUntilTradable = 15;
                                    p.ptModifier = 1; // Reset
                                    if (g.phase <= g.PHASE.PLAYOFFS) {
                                        p = player.addStatsRow(tx, p, g.phase === g.PHASE.PLAYOFFS);
                                    }
                                    dao.players.put({ot: tx, value: p});
                                });
                            });

                            dpids[j].forEach(function (dpid) {
                                dao.draftPicks.get({
                                    ot: tx,
                                    key: dpid
                                }).then(function (dp) {
                                    dp.tid = tids[k];
                                    dp.abbrev = g.teamAbbrevsCache[tids[k]];
                                    dao.draftPicks.put({ot: tx, value: dp});
                                });
                            });
                        });
                         // Log event
                        formatAssetsEventLog = function (t) {
                            var i, strings, text;

                            strings = [];

                            t.trade.forEach(function (p) {
                                strings.push('<a href="' + helpers.leagueUrl(["player", p.pid]) + '">' + p.name + '</a>');
                            });
                            t.picks.forEach(function (dp) {
                                strings.push('a ' + dp.desc);
                            });

                            if (strings.length === 0) {
                                text = "nothing";
                            } else if (strings.length === 1) {
                                text = strings[0];
                            } else if (strings.length === 2) {
                                text = strings[0] + " and " + strings[1];
                            } else {
                                text = strings[0];
                                for (i = 1; i < strings.length; i++) {
                                    if (i === strings.length - 1) {
                                        text += ", and " + strings[i];
                                    } else {
                                        text += ", " + strings[i];
                                    }
                                }
                            }

                            return text;
                        };

                        eventLog.add(null, {
                            type: "trade",
                            text: 'The <a href="' + helpers.leagueUrl(["roster", g.teamAbbrevsCache[tids[0]], g.season]) + '">' + g.teamNamesCache[tids[0]] + '</a> traded ' + formatAssetsEventLog(s.teams[0]) + ' to the <a href="' + helpers.leagueUrl(["roster", g.teamAbbrevsCache[tids[1]], g.season]) + '">' + g.teamNamesCache[tids[1]] + '</a> for ' + formatAssetsEventLog(s.teams[1]) + '.',
                            showNotification: false,
                            pids: pids[0].concat(pids[1]),
                            tids: tids
                        });
                    }


                    return tx.complete().then(function () {
                        if (outcome === "accepted") {
                            return clear().then(function () { // This includes dbChange
                                // Auto-sort CPU team roster
                                if (g.userTids.indexOf(tids[1]) < 0) {
                                    return team.rosterAutoSort(null, tids[1]);
                                }
                            }).then(function () {
                                return [true, 'Trade accepted! "Nice doing business with you!"'];
                            });
                        }

                        return [false, 'Trade rejected! "What, are you crazy?"'];
                    });
                });
            });
        });
    }

    /**
     * Make a trade work
     *
     * Have the AI add players/picks until they like the deal. Uses forward selection to try to find the first deal the AI likes.
     *
     * @memberOf core.trade
     * @param {Array.<Object>} teams Array of objects containing the assets for the two teams in the trade. The first object is for the user's team and the second is for the other team. Values in the objects are tid (team ID), pids (player IDs) and dpids (draft pick IDs).
     * @param {boolean} holdUserConstant If true, then players/picks will only be added from the other team. This is useful for the trading block feature.
     * @param {?Object} estValuesCached Estimated draft pick values from trade.getPickValues, or null. Only pass if you're going to call this repeatedly, then it'll be faster if you cache the values up front.
     * @return {Promise.[boolean, Object]} Resolves to an array with one or two elements. First is a boolean indicating whether "make it work" was successful. If true, then the second argument is set to a teams object (similar to first input) with the "made it work" trade info.
     */
    function makeItWork(teams, holdUserConstant, estValuesCached) {
        var added, initialSign, testTrade, tryAddAsset;

        added = 0;

        // Add either the highest value asset or the lowest value one that makes the trade good for the AI team.
        tryAddAsset = function () {
            var assets, tx;

            assets = [];

            tx = dao.tx(["draftPicks", "players"]);

            if (!holdUserConstant) {
                // Get all players not in userPids
                dao.players.iterate({
                    ot: tx,
                    index: "tid",
                    key: teams[0].tid,
                    callback: function (p) {
                        if (teams[0].pids.indexOf(p.pid) < 0 && !isUntradable(p)) {
                            assets.push({
                                type: "player",
                                pid: p.pid,
                                tid: teams[0].tid
                            });
                        }
                    }
                });
            }

            // Get all players not in otherPids
            dao.players.iterate({
                ot: tx,
                index: "tid",
                key: teams[1].tid,
                callback: function (p) {
                    if (teams[1].pids.indexOf(p.pid) < 0 && !isUntradable(p)) {
                        assets.push({
                            type: "player",
                            pid: p.pid,
                            tid: teams[1].tid
                        });
                    }
                }
            });

            if (!holdUserConstant) {
                // Get all draft picks not in userDpids
                dao.draftPicks.iterate({
                    ot: tx,
                    index: "tid",
                    key: teams[0].tid,
                    callback: function (dp) {
                        if (teams[0].dpids.indexOf(dp.dpid) < 0) {
                            assets.push({
                                type: "draftPick",
                                dpid: dp.dpid,
                                tid: teams[0].tid
                            });
                        }
                    }
                });
            }

            // Get all draft picks not in otherDpids
            dao.draftPicks.iterate({
                ot: tx,
                index: "tid",
                key: teams[1].tid,
                callback: function (dp) {
                    if (teams[1].dpids.indexOf(dp.dpid) < 0) {
                        assets.push({
                            type: "draftPick",
                            dpid: dp.dpid,
                            tid: teams[1].tid
                        });
                    }
                }
            });

            return tx.complete().then(function () {
                var otherDpids, otherPids, userDpids, userPids;

                // If we've already added 5 assets or there are no more to try, stop
                if (initialSign === -1 && (assets.length === 0 || added >= 5)) {
                    return [false];
                }

                // Calculate the value for each asset added to the trade, for use in forward selection
                return Promise.map(assets, function (asset) {
                    userPids = teams[0].pids.slice();
                    otherPids = teams[1].pids.slice();
                    userDpids = teams[0].dpids.slice();
                    otherDpids = teams[1].dpids.slice();

                    if (asset.type === "player") {
                        if (asset.tid === g.userTid) {
                            userPids.push(asset.pid);
                        } else {
                            otherPids.push(asset.pid);
                        }
                    } else {
                        if (asset.tid === g.userTid) {
                            userDpids.push(asset.dpid);
                        } else {
                            otherDpids.push(asset.dpid);
                        }
                    }
                    return team.valueChange(teams[1].tid, userPids, otherPids, userDpids, otherDpids, estValuesCached).then(function (dv) {
                        asset.dv = dv;
                    });
                }).then(function () {
                    var asset, j;

                    assets.sort(function (a, b) { return b.dv - a.dv; });

                    // Find the asset that will push the trade value the smallest amount above 0
                    for (j = 0; j < assets.length; j++) {
                        if (assets[j].dv < 0) {
                            break;
                        }
                    }
                    if (j > 0) {
                        j -= 1;
                    }
                    asset = assets[j];
                    if (asset.type === "player") {
                        if (asset.tid === g.userTid) {
                            teams[0].pids.push(asset.pid);
                        } else {
                            teams[1].pids.push(asset.pid);
                        }
                    } else {
                        if (asset.tid === g.userTid) {
                            teams[0].dpids.push(asset.dpid);
                        } else {
                            teams[1].dpids.push(asset.dpid);
                        }
                    }

                    added += 1;

                    return testTrade();
                });
            });
        };

        // See if the AI team likes the current trade. If not, try adding something to it.
        testTrade = function () {
            return team.valueChange(teams[1].tid, teams[0].pids, teams[1].pids, teams[0].dpids, teams[1].dpids, estValuesCached).then(function (dv) {
                if (dv > 0 && initialSign === -1) {
                    return [true, teams];
                }

                if ((added > 2 || (added > 0 && Math.random() > 0.5)) && initialSign === 1) {
                    if (dv > 0) {
                        return [true, teams];
                    }

                    return [false];
                }

                return tryAddAsset();
            });
        };

        return team.valueChange(teams[1].tid, teams[0].pids, teams[1].pids, teams[0].dpids, teams[1].dpids, estValuesCached).then(function (dv) {
            if (dv > 0) {
                // Try to make trade better for user's team
                initialSign = 1;
            } else {
                // Try to make trade better for AI team
                initialSign = -1;
            }

            return testTrade();
        });
    }

    /**
     * Estimate draft pick values, based on the generated draft prospects in the database.
     *
     * This was made for team.valueChange, so it could be called once and the results cached.
     *
     * @memberOf core.trade
     * @param {IDBObjectStore|IDBTransaction|null} ot An IndexedDB object store or transaction on players; if null is passed, then a new transaction will be used.
     * @return {Promise.Object} Resolves to estimated draft pick values.
     */
    function getPickValues(ot) {
        var estValues, i, promises;

     /*   estValues = {
            default: [75, 73, 71, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 50, 50, 49, 49, 49, 48, 48, 48, 47, 47, 47, 46, 46, 46, 45, 45, 45, 44, 44, 44, 43, 43, 43, 42, 42, 42, 41, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37] // This is basically arbitrary
        };*/
		if (g.gameType == 0) {
			// two rounds
			estValues = {
				default: [75, 73, 71, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 50, 50, 49, 49, 49, 48, 48, 48, 47, 47, 47, 46, 46, 46, 45, 45, 45, 44, 44, 44, 43, 43, 43, 42, 42, 42, 41, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37] // This is basically arbitrary
			};
		} else if (g.gameType == 1) {
			// three rounds
			estValues = {
				default: [75, 73, 71, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 50, 50, 49, 49, 49, 48, 48, 48, 47, 47, 47, 46, 46, 46, 45, 45, 45, 44, 44, 44, 43, 43, 43, 42, 42, 42, 41, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37,36,35.75,35.5,35.25,35,34.75,34.5,34.25,34,33.75,33.5,33.25,33,32.75,32.5,32.25,32,31.75,31.5,31.25,31,30.75,30.5,30.25,30,29.75,29.5,29.25,29,28.75] // This is basically arbitrary
			};
		} else if (g.gameType == 2) {
			// four rounds
			estValues = {
				default: [75, 73, 71, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 50, 50, 49, 49, 49, 48, 48, 48, 47, 47, 47, 46, 46, 46, 45, 45, 45, 44, 44, 44, 43, 43, 43, 42, 42, 42, 41, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37,36,35.75,35.5,35.25,35,34.75,34.5,34.25,34,33.75,33.5,33.25,33,32.75,32.5,32.25,32,31.75,31.5,31.25,31,30.75,30.5,30.25,30,29.75,29.5,29.25,29,28.75,28.65,28.55,28.45,28.35,28.25,28.15,28.05,27.95,27.85,27.75,27.65,27.55,27.45,27.35,27.25,27.15,27.05,26.95,26.85,26.75,26.65,26.55,26.45,26.35,26.25,26.15,26.05,25.95,25.85,25.75] // This is basically arbitrary
			};
		} else if (g.gameType == 3) {
			// five rounds
			estValues = {
				default: [75, 73, 71, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 50, 50, 49, 49, 49, 48, 48, 48, 47, 47, 47, 46, 46, 46, 45, 45, 45, 44, 44, 44, 43, 43, 43, 42, 42, 42, 41, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37,36,35.75,35.5,35.25,35,34.75,34.5,34.25,34,33.75,33.5,33.25,33,32.75,32.5,32.25,32,31.75,31.5,31.25,31,30.75,30.5,30.25,30,29.75,29.5,29.25,29,28.75,28.65,28.55,28.45,28.35,28.25,28.15,28.05,27.95,27.85,27.75,27.65,27.55,27.45,27.35,27.25,27.15,27.05,26.95,26.85,26.75,26.65,26.55,26.45,26.35,26.25,26.15,26.05,25.95,25.85,25.75,25.65	,	25.55	,	25.45	,	25.35	,	25.25	,	25.15	,	25.05	,	24.95	,	24.85	,	24.75	,	24.65	,	24.55	,	24.45	,	24.35	,	24.25	,	24.15	,	24.05	,	23.95	,	23.85	,	23.75	,	23.65	,	23.55	,	23.45	,	23.35	,	23.25	,	23.15	,	23.05	,	22.95	,	22.85	,	22.75] // This is basically arbitrary
			};
		} else if (g.gameType == 4) {
			// six rounds
			estValues = {
				default: [75, 73, 71, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 50, 50, 49, 49, 49, 48, 48, 48, 47, 47, 47, 46, 46, 46, 45, 45, 45, 44, 44, 44, 43, 43, 43, 42, 42, 42, 41, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37,36,35.75,35.5,35.25,35,34.75,34.5,34.25,34,33.75,33.5,33.25,33,32.75,32.5,32.25,32,31.75,31.5,31.25,31,30.75,30.5,30.25,30,29.75,29.5,29.25,29,28.75,28.65,28.55,28.45,28.35,28.25,28.15,28.05,27.95,27.85,27.75,27.65,27.55,27.45,27.35,27.25,27.15,27.05,26.95,26.85,26.75,26.65,26.55,26.45,26.35,26.25,26.15,26.05,25.95,25.85,25.75,25.65	,	25.55	,	25.45	,	25.35	,	25.25	,	25.15	,	25.05	,	24.95	,	24.85	,	24.75	,	24.65	,	24.55	,	24.45	,	24.35	,	24.25	,	24.15	,	24.05	,	23.95	,	23.85	,	23.75	,	23.65	,	23.55	,	23.45	,	23.35	,	23.25	,	23.15	,	23.05	,	22.95	,	22.85	,	22.75,22.65	,	22.55	,	22.45	,	22.35	,	22.25	,	22.15	,	22.05	,	21.95	,	21.85	,	21.75	,	21.65	,	21.55	,	21.45	,	21.35	,	21.25	,	21.15	,	21.05	,	20.95	,	20.85	,	20.75	,	20.65	,	20.55	,	20.45	,	20.35	,	20.25	,	20.15	,	20.05	,	19.95	,	19.85	,	19.75] // This is basically arbitrary
			};
		} else if (g.gameType == 5) {
			// seven rounds
			estValues = {
				default: [75, 73, 71, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 50, 50, 49, 49, 49, 48, 48, 48, 47, 47, 47, 46, 46, 46, 45, 45, 45, 44, 44, 44, 43, 43, 43, 42, 42, 42, 41, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37,36,35.75,35.5,35.25,35,34.75,34.5,34.25,34,33.75,33.5,33.25,33,32.75,32.5,32.25,32,31.75,31.5,31.25,31,30.75,30.5,30.25,30,29.75,29.5,29.25,29,28.75,28.65,28.55,28.45,28.35,28.25,28.15,28.05,27.95,27.85,27.75,27.65,27.55,27.45,27.35,27.25,27.15,27.05,26.95,26.85,26.75,26.65,26.55,26.45,26.35,26.25,26.15,26.05,25.95,25.85,25.75,25.65	,	25.55	,	25.45	,	25.35	,	25.25	,	25.15	,	25.05	,	24.95	,	24.85	,	24.75	,	24.65	,	24.55	,	24.45	,	24.35	,	24.25	,	24.15	,	24.05	,	23.95	,	23.85	,	23.75	,	23.65	,	23.55	,	23.45	,	23.35	,	23.25	,	23.15	,	23.05	,	22.95	,	22.85	,	22.75,22.65	,	22.55	,	22.45	,	22.35	,	22.25	,	22.15	,	22.05	,	21.95	,	21.85	,	21.75	,	21.65	,	21.55	,	21.45	,	21.35	,	21.25	,	21.15	,	21.05	,	20.95	,	20.85	,	20.75	,	20.65	,	20.55	,	20.45	,	20.35	,	20.25	,	20.15	,	20.05	,	19.95	,	19.85	,	19.75,19.65	,	19.55	,	19.45	,	19.35	,	19.25	,	19.15	,	19.05	,	18.95	,	18.85	,	18.75	,	18.65	,	18.55	,	18.45	,	18.35	,	18.25	,	18.15	,	18.05	,	17.95	,	17.85	,	17.75	,	17.65	,	17.55	,	17.45	,	17.35	,	17.25	,	17.15	,	17.05	,	16.95	,	16.85	,	16.75] // This is basically arbitrary
//				default: [75, 74, 73, 72, 71, 70, 69, 6865, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 50, 50, 49, 49, 49, 48, 48, 48, 47, 47, 47, 46, 46, 46, 45, 45, 45, 44, 44, 44, 43, 43, 43, 42, 42, 42, 41, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37,36,35.75,35.5,35.25,35,34.75,34.5,34.25,34,33.75,33.5,33.25,33,32.75,32.5,32.25,32,31.75,31.5,31.25,31,30.75,30.5,30.25,30,29.75,29.5,29.25,29,28.75,28.65,28.55,28.45,28.35,28.25,28.15,28.05,27.95,27.85,27.75,27.65,27.55,27.45,27.35,27.25,27.15,27.05,26.95,26.85,26.75,26.65,26.55,26.45,26.35,26.25,26.15,26.05,25.95,25.85,25.75,25.65	,	25.55	,	25.45	,	25.35	,	25.25	,	25.15	,	25.05	,	24.95	,	24.85	,	24.75	,	24.65	,	24.55	,	24.45	,	24.35	,	24.25	,	24.15	,	24.05	,	23.95	,	23.85	,	23.75	,	23.65	,	23.55	,	23.45	,	23.35	,	23.25	,	23.15	,	23.05	,	22.95	,	22.85	,	22.75,22.65	,	22.55	,	22.45	,	22.35	,	22.25	,	22.15	,	22.05	,	21.95	,	21.85	,	21.75	,	21.65	,	21.55	,	21.45	,	21.35	,	21.25	,	21.15	,	21.05	,	20.95	,	20.85	,	20.75	,	20.65	,	20.55	,	20.45	,	20.35	,	20.25	,	20.15	,	20.05	,	19.95	,	19.85	,	19.75,19.65	,	19.55	,	19.45	,	19.35	,	19.25	,	19.15	,	19.05	,	18.95	,	18.85	,	18.75	,	18.65	,	18.55	,	18.45	,	18.35	,	18.25	,	18.15	,	18.05	,	17.95	,	17.85	,	17.75	,	17.65	,	17.55	,	17.45	,	17.35	,	17.25	,	17.15	,	17.05	,	16.95	,	16.85	,	16.75] // This is basically arbitrary
			};
		}		
		//console.log(estValues);

        // Look up to 4 season in the future, but depending on whether this is before or after the draft, the first or last will be empty/incomplete
        promises = [];
        for (i = g.season; i < g.season + 4; i++) {
            promises.push(dao.players.getAll({
                ot: ot,
                index: "draft.year",
                key: i
            }).then(function (players) {
                if (players.length > 0) {
                    for (i = 0; i < players.length; i++) {
                        players[i].value += 4; // +4 is to generally make picks more valued
                    }
                    players.sort(function (a, b) { return b.value - a.value; });
                    estValues[players[0].draft.year] = _.pluck(players, "value");
               } else {
					if (estValues[g.season+2].length > 0) {
						for (i = 0; i < estValues[g.season+2].length; i++) {
							estValues.default[i] = estValues[g.season+2][i] - 1;
						}							
					}
				}
            }));
        }

		//console.log(estValues);
        return Promise.all(promises).then(function () {
            return estValues;
        });
    }

    /**
     * Make a trade work
     *
     * This should be called for a trade negotiation, as it will update the trade objectStore.
     *
     * @memberOf core.trade
     * @return {Promise.string} Resolves to a string containing a message to be dispalyed to the user, as if it came from the AI GM.
     */
    function makeItWorkTrade() {
        return Promise.all([
            getPickValues(),
            get()
        ]).spread(function (estValues, teams0) {
            return makeItWork(helpers.deepCopy(teams0), false, estValues).spread(function (found, teams) {
                if (!found) {
                    return g.teamRegionsCache[teams0[1].tid] + ' GM: "I can\'t afford to give up so much."';
                }

                return summary(teams).then(function (s) {
                    var i, updated;

                    // Store AI's proposed trade in database, if it's different
                    updated = false;

                    for (i = 0; i < 2; i++) {
                        if (teams[i].tid !== teams0[i].tid) {
                            updated = true;
                            break;
                        }
                        if (teams[i].pids.toString() !== teams0[i].pids.toString()) {
                            updated = true;
                            break;
                        }
                        if (teams[i].dpids.toString() !== teams0[i].dpids.toString()) {
                            updated = true;
                            break;
                        }
                    }

                    return Promise.try(function () {
                        var tx;

                        if (updated) {
                            tx = dao.tx("trade", "readwrite");
                            dao.trade.put({
                                ot: tx,
                                value: {
                                    rid: 0,
                                    teams: teams
                                }
                            });
                            return tx.complete();
                        }
                    }).then(function () {
                        if (s.warning) {
                            return g.teamRegionsCache[teams[1].tid] + ' GM: "Something like this would work if you can figure out how to get it done without breaking the salary cap rules."';
                        }

                        return g.teamRegionsCache[teams[1].tid] + ' GM: "How does this sound?"';
                    });
                });
            });
        });
    }

    return {
        get: get,
        create: create,
        updatePlayers: updatePlayers,
        getOtherTid: getOtherTid,
        summary: summary,
        clear: clear,
        propose: propose,
        makeItWork: makeItWork,
        makeItWorkTrade: makeItWorkTrade,
        filterUntradable: filterUntradable,
        getPickValues: getPickValues
    };
});