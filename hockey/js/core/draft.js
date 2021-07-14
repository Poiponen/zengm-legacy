/**
 * @name core.draft
 * @namespace The annual draft of new prospects.
 */
define(["dao", "globals", "ui", "core/finances", "core/player", "core/team", "lib/bluebird", "util/eventLog", "util/helpers", "util/random"], function (dao, g, ui, finances, player, team, Promise, eventLog, helpers, random) {
    "use strict";

    /**
     * Retrieve the current remaining draft order.
     *
     * @memberOf core.draft
     * @param {IDBTransaction|null} tx An IndexedDB transaction on draftOrder.
     * @return {Promise} Resolves to an ordered array of pick objects.
     */
    function getOrder(tx) {
        return dao.draftOrder.get({ot: tx, key: 0}).then(function (row) {
            return row.draftOrder;
        });
    }

     /**
     * Save draft order for future picks to the database.
     *
     * @memberOf core.draft
     * @param {IDBTransaction|null} tx An IndexedDB transaction on draftOrder, readwrite.	 
     * @param {Array.<Object>} draftOrder Ordered array of pick objects, as generated by genOrder.
     * @return {Promise}
     */
    function setOrder(tx, draftOrder) {
        return dao.draftOrder.put({
            ot: tx,
            value: {
                rid: 0,
                draftOrder: draftOrder
            }
        });
    }

    /**
     * Generate a set of draft prospects.
     *
     * This is called after draft classes are moved up a year, to create the new UNDRAFTED_3 class. It's also called 3 times when a new league starts, to create all 3 draft classes.
     *
     * @memberOf core.draft
     * @param {IDBTransaction|null} ot An IndexedDB transaction on players (and teams if scoutingRank is not set), readwrite; if null is passed, then a new transaction will be used.
     * @param {number} tid Team ID number for the generated draft class. Should be g.PLAYER.UNDRAFTED, g.PLAYER.UNDRAFTED_2, or g.PLAYER.UNDRAFTED_3.
     * @param {?number=} scoutingRank Between 1 and g.numTeams, the rank of scouting spending, probably over the past 3 years via core.finances.getRankLastThree. If null, then it's automatically found.
     * @param {?number=} numPlayers The number of prospects to generate. Default value is 70.
     * @return {Promise}
     */
    function genPlayers(ot, tid, scoutingRank, numPlayers) {
        scoutingRank = scoutingRank !== undefined ? scoutingRank : null;
		var draftSize;

        if (numPlayers === null || numPlayers === undefined) {
			draftSize = (100+g.gameType*30);
            numPlayers = Math.round(draftSize * g.numTeams / 30); // 70 scaled by number of teams
        }

        return Promise.try(function () {
            // If scoutingRank is not supplied, have to hit the DB to get it
            if (scoutingRank === null) {
                return dao.teams.get({ot: ot, key: g.userTid}).then(function (t) {
                    return finances.getRankLastThree(t, "expenses", "scouting");
                });
            }

            return scoutingRank;
        }).then(function (scoutingRank) {
            var agingYears, baseAge, baseRating, draftYear, i, p,  pot, profile, profiles, promises;



//            profiles = ["Point", "Wing", "Big", "Big", ""];
            profiles = ["Goalie", "Center", "RWing", "LWing", "RDefender", "LDefender", ""];
            promises = [];			
            for (i = 0; i < numPlayers; i++) {
			
				if (g.leagueType == 0) {	
//					baseRating = random.randInt(8-g.gameType*4, 31);
//					pot = Math.round(helpers.bound(random.realGauss(58, 17-g.gameType*4), baseRating, 90));
					baseRating = random.randInt(8-g.gameType*3, 31);
					pot = Math.round(helpers.bound(random.realGauss(41-g.gameType*4, 17), baseRating, 90));
				//	baseRating -= g.gameType*5;
					//pot -= g.gameType*4;
				} else {
//					baseRating = random.randInt(8-g.gameType*4, 21);
//					pot = Math.round(helpers.bound(random.realGauss(48, 7-g.gameType*4), baseRating, 80));
					baseRating = random.randInt(8-g.gameType*3, 21);
					pot = Math.round(helpers.bound(random.realGauss(31-g.gameType*4, 17), baseRating, 80));
				//	baseRating -= g.gameType*5;
					//pot -= g.gameType*4;
				}
				
                profile = profiles[random.randInt(0, profiles.length - 1)];
				if (Math.random() < .50) {
					agingYears = 0;
				} else {
					agingYears = random.randInt(1, 2);
				}
                draftYear = g.season;

                baseAge = 17;
                if (g.season === g.startingSeason && g.phase < g.PHASE.DRAFT) {
                    // New league, creating players for draft in same season and following 2 seasons
                    if (tid === g.PLAYER.UNDRAFTED_2) {
                        baseAge -= 1;
                        draftYear += 1;
                    } else if (tid === g.PLAYER.UNDRAFTED_3) {
                        baseAge -= 2;
                        draftYear += 2;
                    }
                } else if (tid === g.PLAYER.UNDRAFTED_3) {
                    // Player being generated after draft ends, for draft in 3 years
                    baseAge -= 3;
                    draftYear += 3;
                }

				//baseRating -= 25;
                p = player.generate(tid, baseAge, profile, baseRating, pot, draftYear, false, scoutingRank);
                p = player.develop(p, agingYears, true);

                // Update player values after ratings changes
                 promises.push(player.updateValues(ot, p, []).then(function (p) {
                    return dao.players.put({ot: ot, value: p});
                }));
            }

            return Promise.all(promises);

        });
    }

    /**
     * Sets draft order and save it to the draftOrder object store.
     *
     * This is currently based on an NBA-like lottery, where the first 3 picks can be any of the non-playoff teams (with weighted probabilities).
     *
     * @memberOf core.draft
     * @param {IDBTransaction|null} ot An IndexedDB transaction on draftOrder, draftPicks, and teams, readwrite; if null is passed, then a new transaction will be used.
     * @return {Promise}
     */
    function genOrder(tx) {
        tx = dao.tx(["draftOrder", "draftPicks", "teams"], "readwrite", tx);

        return team.filter({
            ot: tx,
            attrs: ["tid", "cid"],
            seasonAttrs: ["winp", "playoffRoundsWon","points"],
            season: g.season
        }).then(function (teams) {
            var chances, draw, firstThree, i, pick;

             // Sort teams by making playoffs (NOT playoff performance) and winp, for first round
            teams.sort(function (a, b) {
                if ((a.playoffRoundsWon >= 0) && !(b.playoffRoundsWon >= 0)) {
                    return 1;
                }
                if (!(a.playoffRoundsWon >= 0) && (b.playoffRoundsWon >= 0)) {
                    return -1;
                }
                return a.winp - b.winp;
            });

            // Draft lottery
         /*   chances = [250, 199, 156, 119, 88, 63, 43, 28, 17, 11, 8, 7, 6, 5];
            // cumsum
            for (i = 1; i < chances.length; i++) {
                chances[i] = chances[i] + chances[i - 1];
            }*/
            // Pick first three picks based on chances
          /*  firstThree = [];
            while (firstThree.length < 3) {
                draw = random.randInt(1, 1000);
                for (i = 0; i < chances.length; i++) {
                    if (chances[i] > draw) {
                        break;
                    }
                }
                if (firstThree.indexOf(i) < 0) {
                    firstThree.push(i);
                }
            }*/

            return dao.draftPicks.getAll({
                ot: tx,				
                index: "season",
                key: g.season
            }).then(function (draftPicks) {
                var draftPickStore, draftOrder, draftPicksIndexed, i,j, tid;


                // Reorganize this to an array indexed on originalTid and round
                draftPicksIndexed = [];
				//console.log(draftPicks.length);
                for (i = 0; i < draftPicks.length; i++) {
                    tid = draftPicks[i].originalTid;
                    // Initialize to an array
                    if (draftPicksIndexed.length < tid || draftPicksIndexed[tid] === undefined) {
                        draftPicksIndexed[tid] = [];
                    }
                    draftPicksIndexed[tid][draftPicks[i].round] = {
                        tid: draftPicks[i].tid
                    };
                }
				//console.log(draftPicksIndexed);
                draftOrder = [];
                // First round - lottery winners
        /*        for (i = 0; i < firstThree.length; i++) {
                    tid = draftPicksIndexed[teams[firstThree[i]].tid][1].tid;
                    draftOrder.push({
                        round: 1,
                        pick: i + 1,
                        tid: tid,
                        originalTid: teams[firstThree[i]].tid
                    });
                } */

                teams.sort(function (a, b) { return a.points - b.points; });
				
                // First round - everyone else
               // pick = 1;
			   
                for (i = 0; i < teams.length; i++) {
                 //   if (firstThree.indexOf(i) < 0) {
                        tid = draftPicksIndexed[teams[i].tid][1].tid;
                        draftOrder.push({
                            round: 1,
                            pick: i+1,
                            tid: tid,
                            originalTid: teams[i].tid
                        });
                  //      pick += 1;
                  //  }
                }

                // Sort teams by winp only, for second round
//                teams.sort(function (a, b) { return a.winp - b.winp; });

                // Second round
                for (i = 0; i < teams.length; i++) {
                    tid = draftPicksIndexed[teams[i].tid][2].tid;
                    draftOrder.push({
                        round: 2,
                        pick: i + 1,
                        tid: tid,
                        originalTid: teams[i].tid
                    });
                }

				// rest of rounds
				for (j = 0; j < g.gameType; j++) {
					for (i = 0; i < teams.length; i++) {
						tid = draftPicksIndexed[teams[i].tid][j+3].tid;
						draftOrder.push({
							round: j+3,
							pick: i + 1,
							tid: tid,
							originalTid: teams[i].tid
						});
					}
				}
				
                 // Delete from draftPicks object store so that they are completely untradeable
                return Promise.map(draftPicks, function (draftPick) {
                    return dao.draftPicks.delete({
                        ot: tx,
                        key: draftPick.dpid
                    });
                }).then(function () {
                    return setOrder(tx, draftOrder);
                });
            });
        });
    }

    /**
     * Sets fantasy draft order and save it to the draftOrder object store.
     *
     * Randomize team order and then snake for 12 rounds.
     *
     * @memberOf core.draft
     * @param {IDBTransaction} ot An IndexedDB transaction on draftOrder, readwrite.	 
     * @return {Promise}
     */
    function genOrderFantasy(tx, position) {
        var draftOrder, i, round, tids;
		var maxRounds;
        // Randomly-ordered list of tids
        tids = [];
        for (i = 0; i < g.numTeams; i++) {
            tids.push(i);
        }
        random.shuffle(tids);
        if (position >= 1 && position <= g.numTeams) {
            i = 0;
            while (tids[position - 1] !== g.userTid && i < 1000) {
                random.shuffle(tids);
                i += 1;
            }
        }

        // Set total draft order: 12 rounds, snake
        draftOrder = [];
		if (g.gameType == 0) {
			maxRounds = 23+0; // Total number allowed
		} else if (g.gameType == 1) {
			maxRounds = 23+5; // Total number allowed
		} else if (g.gameType == 2) {
			maxRounds = 23+10; // Total number allowed
		} else if (g.gameType == 3) {
			maxRounds = 23+15; // Total number allowed
		} else if (g.gameType == 4) {
			maxRounds = 23+20; // Total number allowed
		} else {
			maxRounds = 23+23; // Total number allowed
		}
        for (round = 1; round <= maxRounds; round++) {
            for (i = 0; i < tids.length; i++) {
                draftOrder.push({
                    round: round,
                    pick: i + 1,
                    tid: tids[i],
                    originalTid: tids[i]
                });
            }

            tids.reverse(); // Snake
        }

        return setOrder(tx, draftOrder);
    }

    /**
     * Get a list of rookie salaries for all players in the draft.
     *
     * By default there are 60 picks, but some are added/removed if there aren't 30 teams.
     *
     * @memberOf core.draft
     * @return {Array.<number>} Array of salaries, in thousands of dollars/year.
     */
    function getRookieSalaries() {
        var rookieSalaries;

        // Default for 60 picks
		
		rookieSalaries = [5000, 4500, 4000, 3500, 3000, 2750, 2500, 2250, 2000, 1900, 1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500];		
		
		
        while (g.numTeams * (g.gameType+2) > rookieSalaries.length) {
            // Add min contracts on to end
            rookieSalaries.push(500);
        }
        while (g.numTeams * (g.gameType+2) < rookieSalaries.length) {
            // Remove smallest salaries
            rookieSalaries.pop();
        }

        return rookieSalaries;
    }

    /**
     * Select a player for the current drafting team.
     *
     * This can be called in response to the user clicking the "draft" button for a player, or by some other function like untilUserOrEnd.
     *
     * @memberOf core.draft
     * @param {object} pick Pick object, like from getOrder, that contains information like the team, round, etc.
     * @param {number} pid Integer player ID for the player to be drafted.
      * @return {Promise}
     */
    function selectPlayer(pick, pid) {
        var tx;

        tx = dao.tx(["players", "playerStats"], "readwrite");

        dao.players.get({
            ot: tx,
            key: pid
        }).then(function (p) {
            var draftName, i, rookieSalaries, years;

            // Draft player
            p.tid = pick.tid;
            if (g.phase !== g.PHASE.FANTASY_DRAFT) {
                p.draft = {
                    round: pick.round,
                    pick: pick.pick,
                    tid: pick.tid,
                    year: g.season,
                    originalTid: pick.originalTid,
                    pot: p.ratings[0].pot,
                    ovr: p.ratings[0].ovr,
                    skills: p.ratings[0].skills
                };
            }

            // Contract
            if (g.phase !== g.PHASE.FANTASY_DRAFT) {
                rookieSalaries = getRookieSalaries();
                i = pick.pick - 1 + g.numTeams * (pick.round - 1);
				if  (pick.round == 1) {
					years = 5;  // 2 years for 2nd round, 3 years for 1st round;
				} else if  (pick.round == 2) {
					years = 5;  // 2 years for 2nd round, 3 years for 1st round;
				} else if  (pick.round == 3) {
					years = 5;  // 2 years for 2nd round, 3 years for 1st round;
				} else if  (pick.round == 4) {
					years = 5;  // 2 years for 2nd round, 3 years for 1st round;
				} else if  (pick.round == 5) {
					years = 5;  // 2 years for 2nd round, 3 years for 1st round;
				} else {
					years = 5;  // 2 years for 2nd round, 3 years for 1st round;
				}
                p = player.setContract(p, {
                    amount: rookieSalaries[i],
                    exp: g.season + years
                }, true);
            }

            // Add stats row if necessary (fantasy draft in ongoing season)
            if (g.phase === g.PHASE.FANTASY_DRAFT && g.nextPhase  <= g.PHASE.PLAYOFFS) {
                p = player.addStatsRow(tx, p, g.nextPhase === g.PHASE.PLAYOFFS);
            }
			
            if (g.phase === g.PHASE.FANTASY_DRAFT) {
                draftName = g.season + ' fantasy draft';
            } else {
                draftName = g.season + ' draft';
            }
            eventLog.add(null, {
                type: "draft",
                text: 'The <a href="' + helpers.leagueUrl(["roster", g.teamAbbrevsCache[pick.tid], g.season]) + '">' + g.teamNamesCache[pick.tid] + '</a> selected <a href="' + helpers.leagueUrl(["player", p.pid]) + '">' + p.name + '</a> with the ' + helpers.ordinal(pick.pick + (pick.round - 1) * 30) + ' pick in the <a href="' +  helpers.leagueUrl(["draft_summary", g.season]) + '">' + draftName + '</a>.',
                showNotification: false,
                pids: [p.pid],
                tids: [p.tid]
            });			
			
             dao.players.put({ot: tx, value: p});
        });

        return tx.complete();
    }

    /**
     * Simulate draft picks until it's the user's turn or the draft is over.
     *
     * This could be made faster by passing a transaction around, so all the writes for all the picks are done in one transaction. But when calling selectPlayer elsewhere (i.e. in testing or in response to the user's pick), it needs to be sure that the transaction is complete before continuing. So I would need to create a special case there to account for it. Given that this isn't really *that* slow now, that probably isn't worth the complexity. Although... team.rosterAutoSort does precisely this... so maybe it would be a good idea...
     *
     * @memberOf core.draft
     * @return {Promise.[Array.<Object>, Array.<number>]} Resolves to array. First argument is the list of draft picks (from getOrder). Second argument is a list of player IDs who were drafted during this function call, in order.
     */
    function untilUserOrEnd() {
        var pids;

        pids = [];

        return Promise.all([
            dao.players.getAll({
                index: "tid",
                key: g.PLAYER.UNDRAFTED
            }),
            getOrder()
        ]).spread(function (playersAll, draftOrder) {
            var afterDoneAuto, autoSelectPlayer, pick, pid, selection;

            playersAll.sort(function (a, b) { return b.value - a.value; });

            // Called after either the draft is over or it's the user's pick
            afterDoneAuto = function (draftOrder, pids) {
                return setOrder(null, draftOrder).then(function () {
                    var phase, tx;

                    // Is draft over?;
                    if (draftOrder.length === 0) {
                        phase = require("core/phase"); // Circular reference

                        // Fantasy draft special case!
                        if (g.phase === g.PHASE.FANTASY_DRAFT) {
                            tx = dao.tx(["players", "teams"], "readwrite");

                            // Undrafted players become free agents
                            return player.genBaseMoods(tx).then(function (baseMoods) {
                                return dao.players.iterate({
                                    ot: tx,
                                    index: "tid",
                                    key: g.PLAYER.UNDRAFTED,
                                    callback: function (p) {
                                        return player.addToFreeAgents(tx, p, g.PHASE.FREE_AGENCY, baseMoods);
                                    }
                                });
                            }).then(function () {
                                // Swap back in normal draft class
                                return dao.players.iterate({
                                    ot: tx,
                                    index: "tid",
                                    key: g.PLAYER.UNDRAFTED_FANTASY_TEMP,
                                    callback: function (p) {
                                        p.tid = g.PLAYER.UNDRAFTED;

                                        return p;
                                    }
                                });
                            }).then(function () {
                                return require("core/league").setGameAttributesComplete({
                                    phase: g.nextPhase,
                                    nextPhase: null
                                }).then(function () {
                                    ui.updatePhase(g.season + " " + g.PHASE_TEXT[g.phase]);
                                    return ui.updatePlayMenu(null).then(function () {
                                        require("core/league").updateLastDbChange();
                                        return pids;
                                    });
                                });
                            });
                        }

                        // Non-fantasy draft
                        return phase.newPhase(g.PHASE.AFTER_DRAFT).then(function () {
                            return pids;
                        });
                    }

                    // Draft is not over, so continue
                    require("core/league").updateLastDbChange();
                    return pids;
                });
            };

            // This will actually draft "untilUserOrEnd"
            autoSelectPlayer = function () {
                if (draftOrder.length > 0) {
                    pick = draftOrder.shift();

                    // noAutoPick is for people who want to switch to each AI team and control
                    // their selection, like someone manually running a multiplayer league.
                    // Eventually this should have a better implementation.
                    if (g.userTids.indexOf(pick.tid) >= 0 && g.autoPlaySeasons === 0) {
                        draftOrder.unshift(pick);
                        return afterDoneAuto(draftOrder, pids);
                    }

                    selection = Math.floor(Math.abs(random.gauss(0, 2)));  // 0=best prospect, 1=next best prospect, etc.
                    pid = playersAll[selection].pid;
                    return selectPlayer(pick, pid).then(function () {
                        pids.push(pid);
                        playersAll.splice(selection, 1);  // Delete from the list of undrafted players

                        return autoSelectPlayer();
                    });
                }

                return afterDoneAuto(draftOrder, pids);
            };

            return autoSelectPlayer();
        });
    }

    return {
        getOrder: getOrder,
        setOrder: setOrder,
        genPlayers: genPlayers,
        genOrder: genOrder,
        genOrderFantasy: genOrderFantasy,
        untilUserOrEnd: untilUserOrEnd,
        getRookieSalaries: getRookieSalaries,
        selectPlayer: selectPlayer
    };
});