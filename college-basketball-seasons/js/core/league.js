/**
 * @name core.league
 * @namespace Creating and removing leagues.
 */
define(["dao", "db", "globals", "ui", "core/draft", "core/finances", "core/player", "core/season", "core/team", "lib/bluebird", "lib/jquery", "lib/underscore", "util/helpers", "util/random"], function (dao, db, g, ui, draft, finances, player, season, team, Promise, $, _, helpers, random) {
    "use strict";

    // x and y are both arrays of objects with the same length. For each object, any properties in y but not x will be copied over to x.
    function merge(x, y) {
        var i, prop;

        for (i = 0; i < x.length; i++) {
            // Fill in default values as needed
            for (prop in y[i]) {
                if (y[i].hasOwnProperty(prop) && !x[i].hasOwnProperty(prop)) {
                    x[i][prop] = y[i][prop];
                }
            }
        }

        return x;
    }

    /**
     * Set values in the gameAttributes objectStore and update the global variable g.
     *
     * Items stored in gameAttributes are globally available through the global variable g. If a value is a constant across all leagues/games/whatever, it should just be set in globals.js instead.
     *
     * @param {Object} gameAttributes Each property in the object will be inserted/updated in the database with the key of the object representing the key in the database.
     * @returns {Promise} Promise for when it finishes.
     */
    function setGameAttributes(gameAttributes) {
        var key, toUpdate, tx;

        toUpdate = [];
        for (key in gameAttributes) {
            if (gameAttributes.hasOwnProperty(key)) {
                if (g[key] !== gameAttributes[key]) {
                    toUpdate.push(key);
                }
            }
        }

        tx = dao.tx("gameAttributes", "readwrite");

        toUpdate.forEach(function (key) {
            dao.gameAttributes.put({
                ot: tx,
                value: {
                    key: key,
                    value: gameAttributes[key]
                }
            }).then(function () {
                g[key] = gameAttributes[key];
            });

            // Trigger a signal for the team finances view. This is stupid.
            if (key === "gamesInProgress") {
                if (gameAttributes[key]) {
                    $("#finances-settings, #free-agents, #live-games-list").trigger("gameSimulationStart");
                } else {
                    $("#finances-settings, #free-agents, #live-games-list").trigger("gameSimulationStop");
                }
            }
        });

        return tx.complete().then(function () {
            // Trigger signal for the team finances view again, or else sometimes it gets stuck. This is even more stupid.
            if (gameAttributes.hasOwnProperty("gamesInProgress") && gameAttributes.gamesInProgress) {
                $("#finances-settings, #free-agents, #live-games-list").trigger("gameSimulationStart");
            } else if (gameAttributes.hasOwnProperty("gamesInProgress") && !gameAttributes.gamesInProgress) {
                $("#finances-settings, #free-agents, #live-games-list").trigger("gameSimulationStop");
            }
        });
    }

    /**
     * Create a new league.
     *
     * @memberOf core.league
     * @param {string} name The name of the league.
     * @param {number} tid The team ID for the team the user wants to manage (or -1 for random).
     */
    function create(name, tid, leagueFile, startingSeason, randomizeRosters) {
        var phaseText, skipNewPhase, teams, teamsDefault;

        // Any user input?
        if (!leagueFile) {
            leagueFile = {}; // Allow checking of properties
        }

        // Default teams
        teamsDefault = helpers.getTeamsDefault();

        // Any custom teams?
        if (leagueFile.hasOwnProperty("teams")) {
            teams = merge(leagueFile.teams, teamsDefault);

            // Add in popRanks
            teams = helpers.addPopRank(teams);
        } else {
            teams = teamsDefault;
        }

	/*	console.log(teams[0].region);
		console.log(teams[0].city);
		console.log(teams[0].state);		
		console.log(teams[0].longitude);		
		console.log(teams[0].latitude);		*/
        // Handle random team
        if (tid === -1) {
            tid = random.randInt(0, teams.length - 1);
        }

        if (leagueFile.hasOwnProperty("meta") && leagueFile.meta.hasOwnProperty("phaseText")) {
            phaseText = leagueFile.meta.phaseText;
        } else {
            phaseText = "";
        }

        // Record in meta db
        return dao.leagues.add({
            value: {
                name: name,
                tid: tid,
                phaseText: phaseText,
                teamName: teams[tid].name,
                teamRegion: teams[tid].region
            }
        }).then(function (lid) {
            g.lid = lid;

            // Create new league database
            return db.connectLeague(g.lid);
        }).then(function () {
            var gameAttributes, i;

            // Default values
            gameAttributes = {
                userTid: tid,
                season: startingSeason,
                startingSeason: startingSeason,
                phase: 0,
                nextPhase: null, // Used only for fantasy draft
                daysLeft: 0, // Used only for free agency
                gamesInProgress: false,
                stopGames: false,
                lastDbChange: 0,
                leagueName: name,
                ownerMood: {
                    wins: 0,
                    playoffs: 0,
                    money: 0
                },
                gameOver: false,
                teamAbbrevsCache: _.pluck(teams, "abbrev"),
                teamRegionsCache: _.pluck(teams, "region"),
                teamNamesCache: _.pluck(teams, "name"),
                teamLongitudeCache: _.pluck(teams, "longitude"),
                teamLatitudeCache: _.pluck(teams, "latitude"),
                showFirstOwnerMessage: true, // true when user starts with a new team, so initial owner message can be shown
                gracePeriodEnd: startingSeason + 2, // Can't get fired for the first two seasons
                numTeams: teams.length // Will be 30 if the user doesn't supply custom rosters
            };

            // gameAttributes from input
            skipNewPhase = false;
            if (leagueFile.hasOwnProperty("gameAttributes")) {
                for (i = 0; i < leagueFile.gameAttributes.length; i++) {
                    // Set default for anything except team ID and name, since they can be overwritten by form input.
                    if (leagueFile.gameAttributes[i].key !== "userTid" && leagueFile.gameAttributes[i].key !== "leagueName") {
                        gameAttributes[leagueFile.gameAttributes[i].key] = leagueFile.gameAttributes[i].value;
                    }

                    if (leagueFile.gameAttributes[i].key === "phase") {
                        skipNewPhase = true;
                    }
                }
            }

            // Clear old game attributes from g, to make sure the new ones are saved to the db in setGameAttributes
            helpers.resetG();

            return setGameAttributes(gameAttributes);
        }).then(function () {
            var i, j, round, scoutingRank, t, toMaybeAdd, tx;

            // Probably is fastest to use this transaction for everything done to create a new league
            tx = dao.tx(["draftPicks", "draftOrder", "players", "playerStats", "teams", "trade", "releasedPlayers", "awards", "schedule", "playoffSeries", "playoffSeries64", "negotiations", "messages", "games"], "readwrite");

            // Draft picks for the first 4 years, as those are the ones can be traded initially
            if (leagueFile.hasOwnProperty("draftPicks")) {
                for (i = 0; i < leagueFile.draftPicks.length; i++) {
                    dao.draftPicks.add({ot: tx, value: leagueFile.draftPicks[i]});
                }
            } else {
                for (i = 0; i < 4; i++) {
                    for (t = 0; t < g.numTeams; t++) {
                        for (round = 1; round <= 2; round++) {
                            dao.draftPicks.add({
                                ot: tx,
                                value: {
                                    tid: t,
                                    originalTid: t,
                                    round: round,
                                    season: g.startingSeason + i
                                }
                            });
                        }
                    }
                }
            }

            // Initialize draft order object store for later use
            if (leagueFile.hasOwnProperty("draftOrder")) {
                for (i = 0; i < leagueFile.draftOrder.length; i++) {
                    dao.draftOrder.add({ot: tx, value: leagueFile.draftOrder[i]});
                }
            } else {
                dao.draftOrder.add({
                    ot: tx,
                    value: {
                        rid: 1,
                        draftOrder: []
                    }
                });
            }

            // teams already contains tid, cid, did, region, name, and abbrev. Let's add in the other keys we need for the league.
            for (i = 0; i < g.numTeams; i++) {
                t = team.generate(teams[i]);
                dao.teams.add({ot: tx, value: t});

                // Save scoutingRank for later
                if (i === g.userTid) {
                    scoutingRank = finances.getRankLastThree(t, "expenses", "scouting");
                }
            }

            if (leagueFile.hasOwnProperty("trade")) {
                for (i = 0; i < leagueFile.trade.length; i++) {
                    dao.trade.add({ot: tx, value: leagueFile.trade[i]});
                }
            } else {
                dao.trade.add({
                    ot: tx,
                    value: {
                        rid: 0,
                        teams: [
                            {
                                tid: tid,
                                pids: [],
                                dpids: []
                            },
                            {
                                tid: tid === 0 ? 1 : 0,  // Load initial trade view with the lowest-numbered non-user team (so, either 0 or 1).
                                pids: [],
                                dpids: []
                            }
                        ]
                    }
                });
            }

            // These object stores are blank by default
            toMaybeAdd = ["releasedPlayers", "awards", "schedule", "playoffSeries", "playoffSeries", "negotiations", "messages", "games"];
            for (j = 0; j < toMaybeAdd.length; j++) {
                if (leagueFile.hasOwnProperty(toMaybeAdd[j])) {
                    for (i = 0; i < leagueFile[toMaybeAdd[j]].length; i++) {
                        dao[toMaybeAdd[j]].add({
                            ot: tx,
                            value: leagueFile[toMaybeAdd[j]][i]
                        });
                    }
                }
            }

            return player.genBaseMoods(tx).then(function (baseMoods) {
                var agingYears, baseRatings, draftYear, goodNeutralBad, i, n, p, playerTids, players, pots, profile, profiles, t, t2,t3;
				var adjustment;
				var tAdj;
                // Either add players from league file or generate them

                if (leagueFile.hasOwnProperty("players")) {
                    // Use pre-generated players, filling in attributes as needed
                    players = leagueFile.players;

                    // Does the player want the rosters randomized?
                    if (randomizeRosters) {
                        // Assign the team ID of all players to the 'playerTids' array.
                        // Check tid to prevent draft prospects from being swapped with established players
                        playerTids = _.pluck(players.filter(function (p) { return p.tid >= g.PLAYER.FREE_AGENT; }), "tid");

                        // Shuffle the teams that players are assigned to.
                        random.shuffle(playerTids);
                        for (i = 0; i < players.length; i++) {
                            if (players[i].tid >= g.PLAYER.FREE_AGENT) {
                                players[i].tid = playerTids.pop();
                            }
                        }
                    }

                    players.forEach(function (p) {
                        var playerStats;

                        p = player.augmentPartialPlayer(p, scoutingRank);

                        // Separate out stats
                        playerStats = p.stats;
                        delete p.stats;

                        player.updateValues(tx, p, playerStats.reverse()).then(function (p) {
                            dao.players.put({ot: tx, value: p}).then(function (pid) {
                                var addStatsRows;

                                // When adding a player, this is the only way to know the pid
                                p.pid = pid;

                                // If no stats in League File, create blank stats rows for active players if necessary
                                if (playerStats.length === 0) {
                                    if (p.tid >= 0) {
                                        // Needs pid, so must be called after put. It's okay, statsTid was already set in player.augmentPartialPlayer
                                        p = player.addStatsRow(tx, p, g.phase === g.PHASE.PLAYOFFS);
                                    }
                                } else {
                                    // If there are stats in the League File, add them to the database
                                    addStatsRows = function () {
                                        var ps;

                                        ps = playerStats.pop();

                                        // Augment with pid, if it's not already there - can't be done in player.augmentPartialPlayer because pid is not known at that point
                                        ps.pid = p.pid;

                                        // Could be calculated correctly if I wasn't lazy
                                        if (!ps.hasOwnProperty("yearsWithTeam")) {
                                            ps.yearsWithTeam = 1;
                                        }

                                        // Delete psid because it can cause problems due to interaction addStatsRow above
                                        delete ps.psid;

                                        dao.playerStats.add({ot: tx, value: ps}).then(function () {
                                            // On to the next one
                                            if (playerStats.length > 0) {
                                                addStatsRows();
                                            }
                                        });
                                    };
                                    addStatsRows();
                                }
                            });
                        });
                    });
                } else {
                    // No players in league file, so generate new players
                    profiles = ["Point", "Wing", "Big", ""];
//                    baseRatings = [37, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 26, 26, 26];
//                    pots = [75, 65, 55, 55, 60, 50, 70, 40, 55, 50, 60, 60, 45, 45];
                    
					
                    baseRatings = [37, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 26,31];
                    pots = [75, 65, 55, 55, 60, 50, 70, 40, 55, 50, 60, 45,55];					

//                    for (t = -20; t < teams.length; t++) {
                    for (t = -20; t < teams.length; t++) {
                        // Create multiple "teams" worth of players for the free agent pool
                        if (t < 0) {
                            t2 = g.PLAYER.FREE_AGENT;
//							adjustment = -30;
							adjustment = -50;
							baseRatings = [37+adjustment, 37+adjustment, 36+adjustment, 35+adjustment, 34+adjustment, 33+adjustment, 32+adjustment, 31+adjustment, 30+adjustment, 29+adjustment, 28+adjustment, 26+adjustment, 31+adjustment];
							pots = [75+adjustment, 65+adjustment, 55+adjustment, 55+adjustment, 60+adjustment, 50+adjustment, 70+adjustment, 40+adjustment, 55+adjustment, 50+adjustment, 60+adjustment, 45+adjustment, 55+adjustment];  							
                        } else {
                            t2 = t;
							adjustment = (1-(teams[t2].pop/teams.length))*(-40)+20;
							
							//adjustment = 0;
							
/*							for (tAdj = 1; tAdj < 20; tAdj++) {							    
							    
								if (t2< 16*tAdj) {
								   adjustment = 10;
								} else if (t2<32*tAdj) {
								   adjustment = 5;							
								} else if (t2<48*tAdj) {
								   adjustment = 0;							
								} else if (t2<64*tAdj) {
								   adjustment = -5;							
								} else {
								   adjustment = -10;							
								}
							
							}*/
							//// between conference adjustment
							//// +25 to +20 (power),0 to -25 (rest)
						/*	adjustment += Math.round(teams.length/16) - Math.round((t2-7.5)/16)- 25 ;
							if (t2<80) {
							   adjustment += 30;
							} 							  */
							//// within conference adjustment
							//// plus 4 to neg 4 within conference
//							tAdj = Math.round((t2-7.5)/16);
//							adjustment += Math.round( ((tAdj*16 - t2)+8)/2 );
							/*if ((tAdj*8 - t2)<) {
								adjustment += 1;
							} else {
								adjustment += -1;
							}*/																								
																						
							baseRatings = [37+adjustment, 37+adjustment, 36+adjustment, 35+adjustment, 34+adjustment, 33+adjustment, 32+adjustment, 31+adjustment, 30+adjustment, 29+adjustment, 28+adjustment, 26+adjustment, 31+adjustment];
							pots = [75+adjustment, 65+adjustment, 55+adjustment, 55+adjustment, 60+adjustment, 50+adjustment, 70+adjustment, 40+adjustment, 55+adjustment, 50+adjustment, 60+adjustment, 45+adjustment, 55+adjustment];  														
                        }
				//	console.log("tid?: "+t);
				//	console.log("tid2?: "+t2);

                        goodNeutralBad = random.randInt(-1, 1);  // determines if this will be a good team or not
                        random.shuffle(pots);
                        agingYears = -1;
                        for (n = 0; n < 13; n++) {
                            agingYears += 1;
							if (agingYears>3) {
							  agingYears = 0;
							}
                            profile = profiles[random.randInt(0, profiles.length - 1)];
//                            agingYears = random.randInt(0, 3);
                            draftYear = g.startingSeason - 1 - agingYears;

                            p = player.generate(t2, 19, profile, baseRatings[n], pots[n], draftYear, true, scoutingRank);
                            p = player.develop(p, agingYears, true);
							
							//// add player distance for each team
	//	console.log("p.latitude: "+ p.latitude + " p.longitude: "+ p.longitude);
	//	console.log("teams[0].latitude: "+ teams[teams.length-1].latitude + " teams[0].longitude: "+ teams[teams.length-1].longitude);
							
							
							//http://stackoverflow.com/questions/27928/how-do-i-calculate-distance-between-two-latitude-longitude-points
							/*	Number.prototype.toRad = function() {
								   return this * Math.PI / 180;
								}

								var lat2 = 42.741; 
								var lon2 = -71.3161; 
								var lat1 = 42.806911; 
								var lon1 = -71.290611; 

								var R = 6371; // km 
								//has a problem with the .toRad() method below.
								var x1 = lat2-lat1;
								var dLat = x1.toRad();  
								var x2 = lon2-lon1;
								var dLon = x2.toRad();  
								var a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
												Math.cos(lat1.toRad()) * Math.cos(lat2.toRad()) * 
												Math.sin(dLon/2) * Math.sin(dLon/2);  
								var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
								var d = R * c; 

								alert(d);							*/
							
							var lat1,lon1,lat2,lon2,R,a,kilometers;
							for (t3 = 0; t3 < teams.length; t3++) {							
	
								lat1 = 	teams[t3].latitude;			
								lon1 = 	teams[t3].longitude;			
								lat2 = 	p.latitude;								
								lon2 = 	p.longitude;	
                                R = 6371;								
	                            a = 0.5 - Math.cos((lat2 - lat1) * Math.PI / 180)/2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *  (1 - Math.cos((lon2 - lon1) * Math.PI / 180))/2;
								
							    kilometers = R * 2 * Math.asin(Math.sqrt(a));
								p.miles[t3] = 0.621371*kilometers;
							}
							/*	console.log("Math.cos(4): "+ Math.cos(4) );
								console.log("Math.PI: "+ Math.PI  );
								console.log("Math.asin(0): "+ Math.asin(0)  );
								console.log("Math.sqrt(4): "+ Math.sqrt(4)  );
								console.log("lat1: "+ lat1 );
								console.log("lon1: "+ lon1 );
								console.log("lat2: "+ lat2 );
								console.log("lon2: "+ lon2 );
								console.log("a: "+ a );
								console.log("R: "+ R );
								console.log("kilometers: "+ kilometers );
								console.log("p.miles: "+ p.miles[teams.length-1] ); */
							
                            if (n < 5) {
                                p = player.bonus(p, goodNeutralBad * random.randInt(0, 20));
                            } else {
                                p = player.bonus(p, 0);
                            }
                            if (t2 === g.PLAYER.FREE_AGENT) {  // Free agents
                                p = player.bonus(p, -15);
                            }

                            // Hack to account for player.addStatsRow being called after dao.players.put - manually assign statsTids
                            if (p.tid >= 0) {
                                p.statsTids = [p.tid];
                            }

                            // Update player values after ratings changes
                            player.updateValues(tx, p, []).then(function (p) {
                                var randomizeExp;

                                // Randomize contract expiration for players who aren't free agents, because otherwise contract expiration dates will all be synchronized
                                randomizeExp = (p.tid !== g.PLAYER.FREE_AGENT);

                                // Update contract based on development. Only write contract to player log if not a free agent.
                                p = player.setContract(p, player.genContract(p, randomizeExp), p.tid >= 0);

                                // Save to database
                                if (p.tid === g.PLAYER.FREE_AGENT) {
                                    player.addToFreeAgents(tx, p, null, baseMoods);
                                } else {
                                    dao.players.put({ot: tx, value: p}).then(function (pid) {
                                        // When adding a player, this is the only way to know the pid
                                        p.pid = pid;

                                        // Needs pid, so must be called after put. It's okay, statsTid was already set above
                                        p = player.addStatsRow(tx, p, g.phase === g.PHASE.PLAYOFFS);
                                    });
                                }
                            });
                        }

                        // Initialize rebuilding/contending, when possible
                        if (t2 >= 0) {
                            dao.teams.get({ot: tx, key: t2}).then(function (t) {
//                                t.startegy = goodNeutralBad === 1 ? "contendeing" : "rebuilding";
                                t.strategy = goodNeutralBad === 1 ? "contending" : "rebuilding";
                                dao.teams.put({ot: tx, value: t});
                            });
                        }
                    }
                }

                return tx.complete().then(function () {
                    return players;
                });
            }).then(function (players) {
                var createUndrafted1, createUndrafted2, createUndrafted3, i, tx;

                // Use a new transaction so there is no race condition with generating draft prospects and regular players (PIDs can seemingly collide otherwise, if it's an imported roster)
//                tx = dao.tx(["players", "playerStats"], "readwrite");
                tx = dao.tx(["players", "playerStats","teams"], "readwrite");

                // See if imported roster has draft picks included. If so, create less than 70 (scaled for number of teams)
                createUndrafted1 = Math.round(150 * g.numTeams / 30);  // was 70, but want 5 players a year, not 2
                createUndrafted2 = Math.round(150 * g.numTeams / 30);
                createUndrafted3 = Math.round(150 * g.numTeams / 30);
//                createUndrafted1 = Math.round(120 * g.numTeams / 30);  // was 70, but want 5 players a year, not 2
 //               createUndrafted2 = Math.round(120 * g.numTeams / 30);
  //              createUndrafted3 = Math.round(120 * g.numTeams / 30);
                if (players !== undefined) {
                    for (i = 0; i < players.length; i++) {
                        if (players[i].tid === g.PLAYER.UNDRAFTED) {
                            createUndrafted1 -= 1;
                        } else if (players[i].tid === g.PLAYER.UNDRAFTED_2) {
                            createUndrafted2 -= 1;
                        } else if (players[i].tid === g.PLAYER.UNDRAFTED_3) {
                            createUndrafted3 -= 1;
                        }
                    }
                }
                // If the draft has already happened this season but next year's class hasn't been bumped up, don't create any g.PLAYER.UNDRAFTED
				team.filter({
						ot: tx,					
						attrs: ["tid","city","state","longitude","latitude"],
						seasonAttrs: ["pop"],
						season: g.season
				}).then(function (t) {		
			
			
					if (createUndrafted1 && (g.phase <= g.PHASE.BEFORE_DRAFT || g.phase >= g.PHASE.FREE_AGENCY)) {
							draft.genPlayers(tx, g.PLAYER.UNDRAFTED, scoutingRank, createUndrafted1,t);					
					}
					if (createUndrafted2) {
						draft.genPlayers(tx, g.PLAYER.UNDRAFTED_2, scoutingRank, createUndrafted2,t);
						
					}
					if (createUndrafted3) {
						draft.genPlayers(tx, g.PLAYER.UNDRAFTED_3, scoutingRank, createUndrafted3,t);
					}

				});		
				

                return tx.complete().then(function () {
                    if (skipNewPhase) {
                        // Game already in progress, just start it
                        return g.lid;
                    }

                    // Make schedule, start season
                    return season.newPhase(g.PHASE.REGULAR_SEASON).then(function () {
                        var lid;

                        ui.updateStatus("Idle");

                        lid = g.lid; // Otherwise, g.lid can be overwritten before the URL redirects, and then we no longer know the league ID

                        helpers.bbgmPing("league");

                        // Auto sort player's roster (other teams will be done in season.newPhase(g.PHASE.REGULAR_SEASON))
                        return team.rosterAutoSort(null, g.userTid).then(function () {
                            return lid;
                        });
                    });
                });
            });
        });
    }

    /**
     * Delete an existing league.
     *
     * @memberOf core.league
     * @param {number} lid League ID.
     * @param {function()=} cb Optional callback.
     */
    function remove(lid) {
        return new Promise(function (resolve, reject) {
            var request;

            if (g.dbl !== undefined) {
                g.dbl.close();
            }

            dao.leagues.delete({key: lid});
            request = indexedDB.deleteDatabase("league" + lid);
            request.onsuccess = function () {
                console.log("Database league" + lid + " successfully deleted");
                resolve();
            };
            request.onfailure = function (event) {
                reject(event);
            };
            request.onblocked = function (event) {
                reject(event);
            };
        });
    }


    /**
     * Export existing active league.
     *
     * @memberOf core.league
     * @param {string[]} stores Array of names of objectStores to include in export
     * @return {Promise} Resolve to all the exported league data.
     */
    function exportLeague(stores) {
        var exportedLeague;

        exportedLeague = {};

        // Row from leagueStore in meta db.
        // phaseText is needed if a phase is set in gameAttributes.
        // name is only used for the file name of the exported roster file.
        exportedLeague.meta = {phaseText: g.phaseText, name: g.leagueName};

		
               /*dao.players.getAll({
                    index: "retiredYear",
                    key: inputs.season
                }),		*/
		console.log(stores);
		console.log(stores.length);
		console.log(stores[0]);		
	//	console.log(stores[1]);				
		if ( (stores[0] == "players") && (stores.length == 1) ) {

		   var draftYear;
		   
		   if (g.phase >= g.PHASE.BEFORE_DRAFT) {
				draftYear = g.season;
		   } else {
				draftYear = g.season-1;
		   }

		   
			return Promise.map(stores, function (store) {
			/*	if ( (stores[0] == "players") && (stores.length == 1) ) {
				   return dao.players.getAll({
						index: "retiredYear",
						key: inputs.season
						}).then(function(contents) {
				} else {		*/
				return dao[store].getAll({
						index: "retiredYear",
//						key: inputs.season
//						key: g.season
						key: draftYear
//						g.season
//						}).then(function (contents) {
						}).then(function (contents) {
			//	}
						//	var contentFiltered;
						   contents = player.filter(contents, {
//								attrs: ["pid", "name", "tid", "abbrev", "draft"],
//								attrs: ["pid", "name", "tid", "pos", "age", "hgtFt", "hgtIn", "weight", "born", "face", "imgURL"],
								attrs: ["name",  "age","tid","pos", "hgt","hgtFt", "hgtIn", "weight","tidLast", "teamRegion", "teamName", "born","city","state", "face", "imgURL","awards"],
								ratings: ["age","pot","hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "blk", "stl", "drb", "pss", "reb", "skills"],
//								attrs: ["pid", "name", "tid", "pos", "age", "hgtFt", "hgtIn", "weight", "born", "face", "imgURL"],
//								ratings: ["age", "ovr", "pot", "hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "blk", "stl", "drb", "pss", "reb", "skills"]
//								season: g.season
								season: draftYear
							});			
			
			
							exportedLeague[store] = contents;
//							exportedLeague[store] = contentFiltered;
						});
			}).then(function () {
				// Move playerStats to players object, similar to old DB structure. Makes editing JSON output nicer.
				var i, j, pid;

				/*if (stores.indexOf("playerStats") >= 0) {
					for (i = 0; i < exportedLeague.playerStats.length; i++) {
						pid = exportedLeague.playerStats[i].pid;

						// Find player corresponding with that stats row
						for (j = 0; j < exportedLeague.players.length; j++) {
							console.log(exportedLeague.players[j].pid);
							console.log(exportedLeague.players[j].tid);
							
							if (exportedLeague.players[j].pid === pid) {
								if (!exportedLeague.players[j].hasOwnProperty("stats")) {
									exportedLeague.players[j].stats = [];
								}

								exportedLeague.players[j].stats.push(exportedLeague.playerStats[i]);

								break;
							}
						}
					}

					delete exportedLeague.playerStats;
				}*/
			  var ratingsToArray;
   			  for (i = 0; i < exportedLeague.players.length; i++) {
				  
				  exportedLeague.players[i].born.loc = exportedLeague.players[i].city+", "+exportedLeague.players[i].state;
				  exportedLeague.players[i].college = g.teamRegionsCache[exportedLeague.players[i].tidLast];
				  
				  if (typeof(exportedLeague.players[i].awards.length) == 'undefined') {
				  } else if (exportedLeague.players[i].awards.length > 0) {
					  for (j = 0; j < exportedLeague.players[i].awards.length; j++) {
						//	console.log(exportedLeague.players[i].awards[j].type);
							exportedLeague.players[i].awards[j].type = "College - " + exportedLeague.players[i].awards[j].type;
						//	console.log(exportedLeague.players[i].awards[j].type);						
					  }
				  }				  
				  
				  exportedLeague.players[i].tid = -2;				  

				  exportedLeague.players[i].ratings.skills = [];
				  exportedLeague.players[i].ratings.stre = Math.round(Math.pow((exportedLeague.players[i].ratings.stre-random.randInt(2, 5))/100,5.5)*100);
			//	  exportedLeague.players[i].ratings.hgt *= 3;
				  exportedLeague.players[i].ratings.fg = Math.round(Math.pow((exportedLeague.players[i].ratings.fg-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.spd = Math.round(Math.pow((exportedLeague.players[i].ratings.spd-random.randInt(2, 5))/100,5.5)*100);			  			
				  exportedLeague.players[i].ratings.dnk = Math.round(Math.pow((exportedLeague.players[i].ratings.dnk-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.jmp = Math.round(Math.pow((exportedLeague.players[i].ratings.jmp-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.ins = Math.round(Math.pow((exportedLeague.players[i].ratings.ins-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.endu = Math.round(Math.pow((exportedLeague.players[i].ratings.endu-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.ft = Math.round(Math.pow((exportedLeague.players[i].ratings.ft-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.tp = Math.round(Math.pow((exportedLeague.players[i].ratings.tp-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.blk = Math.round(Math.pow((exportedLeague.players[i].ratings.blk-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.stl = Math.round(Math.pow((exportedLeague.players[i].ratings.stl-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.drb = Math.round(Math.pow((exportedLeague.players[i].ratings.drb-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.pss = Math.round(Math.pow((exportedLeague.players[i].ratings.pss-random.randInt(2, 5))/100,5.5)*100);
				  exportedLeague.players[i].ratings.reb = Math.round(Math.pow((exportedLeague.players[i].ratings.reb-random.randInt(2, 5))/100,5.5)*100);
				  
				  exportedLeague.players[i].ratings.pot = Math.round(Math.pow((exportedLeague.players[i].ratings.pot-random.randInt(2, 5))/100,2)*100);

			/*	  exportedLeague.players[i].ratings.stre -= 200;
				//  exportedLeague.players[i].ratings.hgt -= 200;
				  exportedLeague.players[i].ratings.dnk -= 200;
				  exportedLeague.players[i].ratings.jmp -= 200;
				  exportedLeague.players[i].ratings.ins -= 200;
				  exportedLeague.players[i].ratings.endu -= 200;
				  exportedLeague.players[i].ratings.ft -= 200;
				  exportedLeague.players[i].ratings.tp -= 200;
				  exportedLeague.players[i].ratings.blk -= 200;
				  exportedLeague.players[i].ratings.stl -= 200;
				  exportedLeague.players[i].ratings.drb -= 200;
				  exportedLeague.players[i].ratings.pss -= 200;
				  exportedLeague.players[i].ratings.reb -= 200;
				  
				  exportedLeague.players[i].ratings.pot -= 200;


				 if (exportedLeague.players[i].ratings.stre < 0) {
					 exportedLeague.players[i].ratings.stre = 0
				 }
				 if (exportedLeague.players[i].ratings.dnk < 0) {
					 exportedLeague.players[i].ratings.dnk = 0
				 }
				 if (exportedLeague.players[i].ratings.jmp < 0) {
					 exportedLeague.players[i].ratings.jmp = 0
				 }
				 if (exportedLeague.players[i].ratings.ins < 0) {
					 exportedLeague.players[i].ratings.ins = 0
				 }
				 if (exportedLeague.players[i].ratings.endu < 0) {
					 exportedLeague.players[i].ratings.endu = 0
				 }
				 if (exportedLeague.players[i].ratings.ft < 0) {
					 exportedLeague.players[i].ratings.ft = 0
				 }
				 if (exportedLeague.players[i].ratings.tp < 0) {
					 exportedLeague.players[i].ratings.tp = 0
				 }
				 if (exportedLeague.players[i].ratings.blk < 0) {
					 exportedLeague.players[i].ratings.blk = 0
				 }
				 if (exportedLeague.players[i].ratings.stl < 0) {
					 exportedLeague.players[i].ratings.stl = 0
				 }
				 if (exportedLeague.players[i].ratings.drb < 0) {
					 exportedLeague.players[i].ratings.drb = 0
				 }
				 if (exportedLeague.players[i].ratings.pss < 0) {
					 exportedLeague.players[i].ratings.pss = 0
				 }
				 if (exportedLeague.players[i].ratings.reb < 0) {
					 exportedLeague.players[i].ratings.reb = 0
				 }
				 if (exportedLeague.players[i].ratings.pot < 0) {
					 exportedLeague.players[i].ratings.pot = 0
				 }*/

				  exportedLeague.players[i].ratings.age = exportedLeague.players[i].age;

				  ratingsToArray = exportedLeague.players[i].ratings;
				  
				  if (exportedLeague.players[i].ratings.pot<50) {
					  exportedLeague.players[i] = [];
				  } else {
				  
					  delete exportedLeague.players[i].ratings;
					  exportedLeague.players[i].ratings = [];
					  exportedLeague.players[i].ratings[0] = ratingsToArray;
			      }
			  }
				
			}).then(function () {
				return exportedLeague;
			});		   
		} else {
			return Promise.map(stores, function (store) {
			/*	if ( (stores[0] == "players") && (stores.length == 1) ) {
				   return dao.players.getAll({
						index: "retiredYear",
						key: inputs.season
						}).then(function(contents) {
				} else {		*/
				return dao[store].getAll().then(function (contents) {
			//	}
					exportedLeague[store] = contents;
				});
			}).then(function () {
				// Move playerStats to players object, similar to old DB structure. Makes editing JSON output nicer.
				var i, j, pid;

				if (stores.indexOf("playerStats") >= 0) {
					for (i = 0; i < exportedLeague.playerStats.length; i++) {
						pid = exportedLeague.playerStats[i].pid;

						// Find player corresponding with that stats row
						for (j = 0; j < exportedLeague.players.length; j++) {
							if (exportedLeague.players[j].pid === pid) {
								if (!exportedLeague.players[j].hasOwnProperty("stats")) {
									exportedLeague.players[j].stats = [];
								}

								exportedLeague.players[j].stats.push(exportedLeague.playerStats[i]);

								break;
							}
						}
					}

					delete exportedLeague.playerStats;
				}
			}).then(function () {
				return exportedLeague;
			});
		}
    }
	
    function updateMetaNameRegion(name, region) {
        return dao.leagues.get({key: g.lid}).then(function (l) {
            l.teamName = name;
            l.teamRegion = region;
            return dao.leagues.put({value: l});
        });
    }
    /**
     * Load a game attribute from the database and update the global variable g.
     *
     * @param {(IDBObjectStore|IDBTransaction|null)} ot An IndexedDB object store or transaction on gameAttributes; if null is passed, then a new transaction will be used.
     * @param {string} key Key in gameAttributes to load the value for.
     * @return {Promise}
     */
    function loadGameAttribute(ot, key) {
        return dao.gameAttributes.get({ot: ot, key: key}).then(function (gameAttribute) {
            if (gameAttribute === undefined) {
                // Default values for old leagues - see also loadGameAttributes
                if (key === "numTeams") {
                    g.numTeams = 30;
                } else if (key === "godMode") {
                    g.godMode = false;
                } else if (key === "godModeInPast") {
                    g.godModeInPast = false;
                } else {
                    throw new Error("Unknown game attribute: " + key);
                }
            } else {
                g[key] = gameAttribute.value;
            }

            // Make sure God Mode is correctly recognized for the UI - see also loadGameAttribute
            if (key === "godMode") {
                g.vm.topMenu.godMode(g.godMode);
            }
        });
    }

    /**
     * Load game attributes from the database and update the global variable g.
     *
     * @param {(IDBObjectStore|IDBTransaction|null)} ot An IndexedDB object store or transaction on gameAttributes; if null is passed, then a new transaction will be used.
     * @return {Promise}
     */
    function loadGameAttributes(ot) {
        return dao.gameAttributes.getAll({ot: ot}).then(function (gameAttributes) {
            var i;

            for (i = 0; i < gameAttributes.length; i++) {
                g[gameAttributes[i].key] = gameAttributes[i].value;
            }

            // Default values for old leagues - see also loadGameAttribute
            if (g.numTeams === undefined) {
                g.numTeams = 30;
            }
            if (g.godMode === undefined) {
                g.godMode = false;
            }
            if (g.godModeInPast === undefined) {
                g.godModeInPast = false;
            }

            // Make sure God Mode is correctly recognized for the UI - see also loadGameAttribute
            g.vm.topMenu.godMode(g.godMode);
        });
    }

    return {
        create: create,
        exportLeague: exportLeague,
        remove: remove,
        setGameAttributes: setGameAttributes,
        updateMetaNameRegion: updateMetaNameRegion,
        loadGameAttribute: loadGameAttribute,
        loadGameAttributes: loadGameAttributes
    };
});