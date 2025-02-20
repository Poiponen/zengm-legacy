/**
 * @name core.team
 * @namespace Functions operating on team objects, parts of team objects, or arrays of team objects.
 */
define(["dao", "globals", "core/player", "lib/bluebird", "lib/underscore", "util/helpers", "util/random"], function (dao, g, player, Promise, _, helpers, random) {


    "use strict";

    /**
     * Add a new row of season attributes to a team object.
	 
	 
     * 
     * There should be one season attributes row for each year, and a new row should be added for each team at the start of a season.
     *
     * @memberOf core.team
     * @param {Object} t Team object.
     * @return {Object} Updated team object.
     */
    function addSeasonRow(t) {
        var newSeason, s;

        s = t.seasons.length - 1; // Most recent season

        // Make sure this isn't a duplicate season
        if (s >= 0 && t.seasons[s].season === g.season) {
            console.log("Attempting to add duplicate team season record!");
            return t;
        }

        // Initial entry
        newSeason = {
            season: g.season,
            gp: 0,
            att: 0,
            cash: 10000,
            won: 0,
            lost: 0,
            wonHome: 0,
            lostHome: 0,
            wonAway: 0,
            lostAway: 0,
            wonDiv: 0,
            lostDiv: 0,
            wonConf: 0,
            lostConf: 0,
            lastTen: [],
            streak: 0,
            playoffRoundsWon: -1,  // -1: didn't make playoffs. 0: lost in first round. ... 4: won championship
            hype: Math.random(),
            pop: 0,  // Needs to be set somewhere!
            tvContract: {
                amount: 0,
                exp: 0
            },
            revenues: {
                merch: {
                    amount: 0,
                    rank: 15.5
                },
                sponsor: {
                    amount: 0,
                    rank: 15.5
                },
                ticket: {
                    amount: 0,
                    rank: 15.5
                },
                nationalTv: {
                    amount: 0,
                    rank: 15.5
                },
                localTv: {
                    amount: 0,
                    rank: 15.5
                }
            },
            expenses: {
                salary: {
                    amount: 0,
                    rank: 15.5
                },
                luxuryTax: {
                    amount: 0,
                    rank: 15.5
                },
                minTax: {
                    amount: 0,
                    rank: 15.5
                },
                buyOuts: {
                    amount: 0,
                    rank: 15.5
                },
                scouting: {
                    amount: 0,
                    rank: 15.5
                },
                coaching: {
                    amount: 0,
                    rank: 15.5
                },
                health: {
                    amount: 0,
                    rank: 15.5
                },
                facilities: {
                    amount: 0,
                    rank: 15.5
                }
            },
            payrollEndOfSeason: -1
        };

        if (s >= 0) {
            // New season, carrying over some values from the previous season
            newSeason.pop = t.seasons[s].pop * random.uniform(0.98, 1.02);  // Mean population should stay constant, otherwise the economics change too much
            newSeason.hype = t.seasons[s].hype;
            newSeason.cash = t.seasons[s].cash;
            newSeason.tvContract = t.seasons[s].tvContract;
        }

        t.seasons.push(newSeason);

        return t;
    }

    /**
     * Add a new row of stats to a team object.
     * 
     * A row contains stats for unique values of (season, playoffs). So new rows need to be added when a new season starts or when a team makes the playoffs.
     *
     * @memberOf core.team
     * @param {Object} t Team object.
     * @param {=boolean} playoffs Is this stats row for the playoffs or not? Default false.
     * @return {Object} Updated team object.
     */
    function addStatsRow(t, playoffs) {
        var i;		
        playoffs = playoffs !== undefined ? playoffs : false;

        // If there is already an entry for this season+playoffs, do nothing
        for (i = 0; i < t.stats.length; i++) {
            if (t.stats[i].season === g.season && t.stats[i].playoffs === playoffs) {
                return t;
            }
        }		
		
        t.stats.push({
            season: g.season,
            playoffs: playoffs,
            gp: 0,
            min: 0,
            fg: 0,
            fga: 0,
            fgAtRim: 0,
            fgaAtRim: 0,
            fgLowPost: 0,
            fgaLowPost: 0,
            fgMidRange: 0,
            fgaMidRange: 0,
            tp: 0,
            tpa: 0,
            ft: 0,
            fta: 0,
            orb: 0,
            drb: 0,
            trb: 0,
            ast: 0,
            tov: 0,
            stl: 0,
            blk: 0,
            pf: 0,
            pts: 0,
            babipP: 0,
            babip: 0,			
            gbp: 0,			
            fbp: 0,									
			war:0,
			warP:0,
			warH:0,			
            oppPts: 0,
								
            save: 0,
			errors:0,
			earnedRuns:0,
			fieldAttempts:0,
			pitcherGS:0,
			ld:0,
			gb:0,
			fb:0,
			errorsp:0,
			abP:0,
			ISO:0,
			wOBA:0,
			warS:0,
			pfE:0,		
			warF:0
			
			
			
			
        });

        return t;
    }

    /**
     * Create a new team object.
     * 
     * @memberOf core.team
     * @param {Object} tm Team metadata object, likely from core.league.create.
     * @return {Object} Team object to insert in the database.
     */
    function generate(tm) {
        var strategy, t;

        if (tm.hasOwnProperty("strategy")) {
            strategy = tm.strategy;
        } else {
            strategy = Math.random() > 0.5 ? "contending" : "rebuilding";
        }

        t = {
            tid: tm.tid,
            cid: tm.cid,
            did: tm.did,
            region: tm.region,
            name: tm.name,
            abbrev: tm.abbrev,
            imgURL: tm.imgURL !== undefined ? tm.imgURL : "",
            stats: tm.hasOwnProperty("stats") ? tm.stats : [],
            seasons: tm.hasOwnProperty("seasons") ? tm.seasons : [],
            budget: {
                ticketPrice: {
                    amount: tm.hasOwnProperty("budget") ? tm.budget.ticketPrice.amount : helpers.round(25 + 25 * (g.numTeams - tm.popRank) / (g.numTeams - 1), 2),
                    rank: tm.hasOwnProperty("budget") ? tm.budget.ticketPrice.rank  : tm.popRank
                },
                scouting: {
                    amount: tm.hasOwnProperty("budget") ? tm.budget.scouting.amount : helpers.round(900 + 900 * (g.numTeams - tm.popRank) / (g.numTeams - 1)) * 10,
                    rank: tm.hasOwnProperty("budget") ? tm.budget.scouting.rank  : tm.popRank
                },
                coaching: {
                    amount: tm.hasOwnProperty("budget") ? tm.budget.coaching.amount : helpers.round(900 + 900 * (g.numTeams - tm.popRank) / (g.numTeams - 1)) * 10,
                    rank: tm.hasOwnProperty("budget") ? tm.budget.coaching.rank  : tm.popRank
                },
                health: {
                    amount: tm.hasOwnProperty("budget") ? tm.budget.health.amount : helpers.round(900 + 900 * (g.numTeams - tm.popRank) / (g.numTeams - 1)) * 10,
                    rank: tm.hasOwnProperty("budget") ? tm.budget.health.rank  : tm.popRank
                },
                facilities: {
                    amount: tm.hasOwnProperty("budget") ? tm.budget.facilities.amount : helpers.round(900 + 900 * (g.numTeams - tm.popRank) / (g.numTeams - 1)) * 10,
                    rank: tm.hasOwnProperty("budget") ? tm.budget.facilities.rank  : tm.popRank
                }
            },
            strategy: strategy
        };

        if (!tm.hasOwnProperty("seasons")) {
            t = addSeasonRow(t);
            t.seasons[0].pop = tm.pop;
        }
        if (!tm.hasOwnProperty("stats")) {
            t = addStatsRow(t);
        }

        return t;
    }

	 function switchPlayer(players,i,j) {
	 var tempPlayer;
	 				tempPlayer = players[i];
					players[i] = players[j]
					players[j] = tempPlayer;
		return;
	 }
	

     /**
     * Sort a team's roster based on player ratings and stats.
     *
     * @memberOf core.team
     * @param {IDBTransaction|null} tx An IndexedDB transaction on players readwrite; if null is passed, then a new transaction will be used.
     * @param {number} tid Team ID.
     * @return {Promise}
     */
    function rosterAutoSort(tx, tid) {
        if (tx === null) {
            tx = dao.tx("players", "readwrite");
        }

        // Get roster and sort by value (no potential included)
        return dao.players.getAll({
            ot: tx,
            index: "tid",
            key: tid
        }).then(function (players) {
            var i,k;
			var tempPlayer;
			var weakestPitcher;

            players = player.filter(players, {
                attrs: ["pid", "valueNoPot","pos","active","tid","teamRegion","hgtIn","valueNoPotFuzz"],
               // attrs: ["pid", "valueNoPot","pos","active","hgtIn"],
				ratings: ["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "blk", "stl", "drb", "pss", "reb"],
                showNoStats: true,
                showRookies: true
            });
			
            // Fuzz only for user's team
            if (tid === g.userTid) {
                players.sort(function (a, b) { return b.valueNoPotFuzz - a.valueNoPotFuzz; });
            } else {
                players.sort(function (a, b) { return b.valueNoPot - a.valueNoPot; });
            }
			
				
			
			// organizes roster
			// top 8 lineup
			// next 5 starters
			// next 1 closer
			// then RP
			// then extra hitters

			weakestPitcher = 12;	
			var maxPlayers;
			if (players.length>25) {
			  maxPlayers = 25;
			} else {
			  maxPlayers = players.length;
			}
			
            for (i = 0; i < maxPlayers; i++) {
				//console.log("pos: "+ players[i].pos);
//			    if ((i==0) && (players[i].ratings[players[i].ratings.length - 1].fg  80)) {
			    if (((players[i].pos == "RP") || (players[i].pos == "SP") || (players[i].pos == "CL")) && (i<8)) {
					for (k = (i+1); k < players.length; k++) {
						//console.log("pos: "+ players[k].pos);
					
						if ((players[k].pos != "RP") && (players[k].pos != "SP") && (players[k].pos != "CL")) {				    
							switchPlayer(players,i,k);	
							k = players.length;
						}
					//tempPlayer = players[1];
					//players[1] = players[0]
					//players[0] = tempPlayer;		
					}
				}  else if (((players[i].pos != "RP") && (players[i].pos != "SP") && (players[i].pos != "CL")) && ((i>7) && (i<13))) {
					for (k = (i+1); k < players.length; k++) {
						//console.log("pos: "+ players[k].pos);
						//	console.log(k+ " "+players[k].tid+" , "+players[k].teamRegion+" , "+ players[k].hgtIn);						
					
						if ((players[k].pos == "RP") || (players[k].pos == "SP") || (players[k].pos == "CL")) {				    
							switchPlayer(players,i,k);	
							k = players.length;							
						}
					//tempPlayer = players[1];
					//players[1] = players[0]
					//players[0] = tempPlayer;		
					}
				}
				if ((i>7) && (i<14)) {
					for (k = (i+1); k < maxPlayers; k++) {		
//					for (k = (i+1); k < maxPlayers; k++) {		
              //          console.log(k +" "+players[k].pos);					
				//			console.log(k+ " "+players[k].tid+" , "+players[k].teamRegion+" , "+players[k].hgtIn);						
						if (((players[k].pos == "RP") || (players[k].pos == "SP") || (players[k].pos == "CL")) && (players[i].valueNoPot < players[k].valueNoPot) ) {
							switchPlayer(players,i,k);	
						//	k = 21;							                             							
						}
					}
				}
				
				if ((i>13) && (i<maxPlayers)) {
					if ((players[i].pos != "RP") && (players[i].pos != "SP") && (players[i].pos != "CL")) {
						for (k = (i+1); k < maxPlayers; k++) {	
					//		console.log(k+ " "+players[k].tid+" , "+players[k].teamRegion"						
							if (((players[k].pos == "RP") || (players[k].pos == "SP") || (players[k].pos == "CL")) ) {
								switchPlayer(players,i,k);	
								k = players.length;							                             							
								weakestPitcher = i;								
							}										
						//	k = 21;							                             							
						}				
					} else {
					  weakestPitcher = i;
					}
				}	

				
            }				 
		//		console.log("weakestPitcher: "+weakestPitcher);
				
	/*		players[8].pos = "SP";
			players[9].pos = "SP";
			players[10].pos = "SP";
			players[11].pos = "SP";
			players[12].pos = "SP";
			players[13].pos = "CL";*/
			
			
			// ensures team has a few extra pitchers
			for (i = weakestPitcher; i < 17; i++) {				
//			while (weakestPitcher <= 17) {
			//	console.log("i: "+i);			    
					if ((players[i].pos != "RP") && (players[i].pos != "SP") && (players[i].pos != "CL")) {
						for (k = (i+1); k < players.length; k++) {				
							if (((players[k].pos == "RP") || (players[k].pos == "SP") || (players[k].pos == "CL")) ) {
								switchPlayer(players,i,k);	
								k = players.length;							                             							
							}										
						//	k = 21;							                             							
						}				
					} 
			}
			
			// ensures team has a few extra hitters
			for (i = 20; i < maxPlayers; i++) {				
//			while (weakestPitcher <= 17) {
			//	console.log("i: "+i);			    
					if ((players[i].pos == "RP") || (players[i].pos == "SP") || (players[i].pos == "CL")) {
						for (k = (i+1); k < players.length; k++) {				
							if (((players[k].pos != "RP") || (players[k].pos != "SP") || (players[k].pos != "CL")) ) {
								switchPlayer(players,i,k);	
								k = players.length;							                             							
							}										
						//	k = 21;							                             							
						}				
					} 
			}			
			 
			 var compareHitters = [0,0,0,0,0,0,0,0];
			 var bestHitter;
			// Find leadoff man 
			
			bestHitter = 0;
			i = 0;
			compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*2 + players[i].ratings[players[i].ratings.length - 1].ins - players[i].ratings[players[i].ratings.length - 1].dnk*3;			
            for (i = 1; i < 8; i++) {
			  compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*2 + players[i].ratings[players[i].ratings.length - 1].ins - players[i].ratings[players[i].ratings.length - 1].dnk*3;
			  if (compareHitters[i]>compareHitters[bestHitter]) {
			     bestHitter = i;
			  }
			}
			if (bestHitter != 0) {
					switchPlayer(players,0,bestHitter);				
			}

			// 2nd hitter
			compareHitters = [0,0,0,0,0,0,0,0];
			bestHitter = 1;
			i = 1;
			compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*.5 + players[i].ratings[players[i].ratings.length - 1].ins+ players[i].ratings[players[i].ratings.length - 1].dnk*.1;			
            for (i = 2; i < 8; i++) {
			  compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*.5 + players[i].ratings[players[i].ratings.length - 1].ins + players[i].ratings[players[i].ratings.length - 1].dnk*.1;
			  if (compareHitters[i]>compareHitters[bestHitter]) {
			     bestHitter = i;
			  }
			}
			if (bestHitter != 1) {
					switchPlayer(players,1,bestHitter);				
			}
			
			// 3rd hitter
			compareHitters = [0,0,0,0,0,0,0,0];
			bestHitter = 2;
			i = 2;
			compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*.1 + players[i].ratings[players[i].ratings.length - 1].ins + players[i].ratings[players[i].ratings.length - 1].dnk;			
            for (i = 3; i < 8; i++) {
			  compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*.1 + players[i].ratings[players[i].ratings.length - 1].ins + players[i].ratings[players[i].ratings.length - 1].dnk;
			  if (compareHitters[i]>compareHitters[bestHitter]) {
			     bestHitter = i;
			  }
			}
			if (bestHitter != 2) {
					switchPlayer(players,2,bestHitter);				
			}			

			// 4th hitter
			compareHitters = [0,0,0,0,0,0,0,0];
			bestHitter = 3;
			i = 3;
			compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*0 + players[i].ratings[players[i].ratings.length - 1].ins + players[i].ratings[players[i].ratings.length - 1].dnk*1.5;			
            for (i = 4; i < 8; i++) {
			  compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*0 + players[i].ratings[players[i].ratings.length - 1].ins + players[i].ratings[players[i].ratings.length - 1].dnk*1.5;
			  if (compareHitters[i]>compareHitters[bestHitter]) {
			     bestHitter = i;
			  }
			}
			if (bestHitter != 3) {
					switchPlayer(players,3,bestHitter);				
			}		

			// 5th hitter
			compareHitters = [0,0,0,0,0,0,0,0];
			bestHitter = 4;
			i = 4;
			compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*0 + players[i].ratings[players[i].ratings.length - 1].ins + players[i].ratings[players[i].ratings.length - 1].dnk*3;			
            for (i = 5; i < 8; i++) {
			  compareHitters[i] = players[i].ratings[players[i].ratings.length - 1].fg*0 + players[i].ratings[players[i].ratings.length - 1].ins + players[i].ratings[players[i].ratings.length - 1].dnk*3;
			  if (compareHitters[i]>compareHitters[bestHitter]) {
			     bestHitter = i;
			  }
			}
			if (bestHitter != 4) {
					switchPlayer(players,4,bestHitter);				
			}		


//// sort bench			
			
			for (i = 14; i < maxPlayers; i++) {				
//			while (weakestPitcher <= 17) {
			//	console.log("i: "+i);			    
					if ((players[i].pos == "RP") || (players[i].pos == "SP") || (players[i].pos == "CL")) {
						for (k = (i+1); k < players.length; k++) {				
							if (((players[k].pos == "RP") || (players[k].pos == "SP") || (players[k].pos == "CL")) && (players[i].valueNoPot < players[k].valueNoPot) ) {
								switchPlayer(players,i,k);	
								//k = players.length;							                             							
							}										
						//	k = 21;							                             							
						}				
					} 
			}
			
			for (i = 14; i < maxPlayers; i++) {				
//			while (weakestPitcher <= 17) {
			//	console.log("i: "+i);			    
					if ((players[i].pos != "RP") || (players[i].pos != "SP") || (players[i].pos != "CL")) {
						for (k = (i+1); k < players.length; k++) {				
							if (((players[k].pos != "RP") || (players[k].pos != "SP") || (players[k].pos != "CL")) && (players[i].valueNoPot < players[k].valueNoPot) ) {
								switchPlayer(players,i,k);	
								//k = players.length;							                             							
							}										
						//	k = 21;							                             							
						}				
					} 
			}
			
			
         /*   for (i = 0; i < players.length; i++) {
//			    if ((i==0) && (players[i].ratings[players[i].ratings.length - 1].fg  80)) {
			    if ((players[i].ratings[players[i].ratings.length - 1].fg) > (players[0].ratings[players[0].ratings.length - 1].fg )) {
				//	console.log("start: "+ i);
				//	console.log(players[i].ratings.length);
				//	console.log(players[i].ratings[players[i].ratings.length - 1].fg);
					switchPlayer(players,0,i);
					//tempPlayer = players[1];
					//players[1] = players[0]
					//players[0] = tempPlayer;
				//	console.log("end: "+ i);
				//	console.log(players[i].ratings.length);
				//	console.log(players[i].ratings[players[i].ratings.length - 1].fg);
					
					
				}                
            }	*/		 
			 /*if (players[i].ratings[players[i].ratings.length - 1].fg>80) {
			  console.log(players[i].ratings[players[i].ratings.length - 1].fg);
			 }*/
			 

            for (i = 0; i < players.length; i++) {
                players[i].rosterOrder = i;
            }

            // Update rosterOrder
            return dao.players.iterate({
                ot: tx,
                index: "tid",
                key: tid,
                callback: function (p) {
                    var i;
                    for (i = 0; i < players.length; i++) {
                        if (players[i].pid === p.pid) {
						
							if (i<maxPlayers) {
	//							players[i].active = true;

								p.active = true;
							} else {
	//							players[i].active = false;
								p.active = false;
							}								
                            p.rosterOrder = players[i].rosterOrder;
                            break;
                        }
                    }

                    return p;
                }
            });
        });
    }

    /**
    * Gets all the contracts a team owes.
    *
    * This includes contracts for players who have been released but are still owed money.
    *
    * @memberOf core.team
    * @param {IDBTransaction|null} tx An IndexedDB transaction on players and releasedPlayers; if null is passed, then a new transaction will be used.
    * @param {number} tid Team ID.
    * @returns {Promise.Array} Array of objects containing contract information.
    */
    function getContracts(tx, tid) {
        var contracts;

        tx = dao.tx(["players", "releasedPlayers"], "readonly", tx);

        // First, get players currently on the roster
        return dao.players.getAll({
            ot: tx,
            index: "tid",
            key: tid
        }).then(function (players) {
            var i;

            contracts = [];
            for (i = 0; i < players.length; i++) {
                contracts.push({
                    pid: players[i].pid,
                    name: players[i].name,
                    skills: players[i].ratings[players[i].ratings.length - 1].skills,
                    injury: players[i].injury,
                    watch: players[i].watch !== undefined ? players[i].watch : false, // undefined check is for old leagues, can delete eventually
                    amount: players[i].contract.amount,
                    exp: players[i].contract.exp,
                    released: false
                });
            }

            // Then, get any released players still owed money
            return dao.releasedPlayers.getAll({
                ot: tx,
                index: "tid",
                key: tid
            });
        }).then(function (releasedPlayers) {
            if (releasedPlayers.length === 0) {
                return contracts;
            }

            return Promise.map(releasedPlayers, function (releasedPlayer) {
                return dao.players.get({
                    ot: tx,
                    key: releasedPlayer.pid
                }).then(function (p) {
                    if (p !== undefined) { // If a player is deleted, such as if the user deletes retired players to improve performance, this will be undefined
                        contracts.push({
                            pid: releasedPlayer.pid,
                            name: p.name,
                            skills: p.ratings[p.ratings.length - 1].skills,
                            injury: p.injury,
                            amount: releasedPlayer.contract.amount,
                            exp: releasedPlayer.contract.exp,
                            released: true
                        });
                    } else {
                        contracts.push({
                            pid: releasedPlayer.pid,
                            name: "Deleted Player",
                            skills: [],
                            amount: releasedPlayer.contract.amount,
                            exp: releasedPlayer.contract.exp,
                            released: true
                        });
                    }
                });
            }).then(function () {
                return contracts;
            });
        });
    }

    /**
     * Get the total current payroll for a team.
     *
     * This includes players who have been released but are still owed money from their old contracts.
     *
     * @memberOf core.team
     * @param {IDBTransaction|null} tx An IndexedDB transaction on players and releasedPlayers; if null is passed, then a new transaction will be used.
     * @param {number} tid Team ID.
     * @return {Promise.<number, Array=>} Resolves to an array; first argument is the payroll in thousands of dollars, second argument is the array of contract objects from dao.contracts.getAll.
     */
    function getPayroll(tx, tid) {
        tx = dao.tx(["players", "releasedPlayers"], "readonly", tx);

        return getContracts(tx, tid).then(function (contracts) {
            var i, payroll;

            payroll = 0;
            for (i = 0; i < contracts.length; i++) {
                payroll += contracts[i].amount;  // No need to check exp, since anyone without a contract for the current season will not have an entry
            }

            return [payroll, contracts];
        });
    }

    /**
     * Get the total current payroll for every team team.
     *
     * @memberOf core.team
     * @param {IDBTransaction|null} ot An IndexedDB transaction on players and releasedPlayers; if null is passed, then a new transaction will be used.
     * @return {Promise} Resolves to an array of payrolls, ordered by team id.
     */
    function getPayrolls(tx) {
        var promises, tid;

        tx = dao.tx(["players", "releasedPlayers"], "readonly", tx);

        promises = [];
        for (tid = 0; tid < g.numTeams; tid++) {
            promises.push(getPayroll(tx, tid).get(0));
        }

        return Promise.all(promises);
    }	
	
    /**
     * Retrieve a filtered team object (or an array of player objects) from the database by removing/combining/processing some components.
     *
     * This can be used to retrieve information about a certain season, compute average statistics from the raw data, etc.
     *
     * This is similar to player.filter, but has some differences. If only one season is requested, the attrs, seasonAttrs, and stats properties will all be merged on the root filtered team object for each team. "stats" is broken out into its own property only when multiple seasons are requested (options.season is undefined). "seasonAttrs" should behave similarly, but it currently doesn't because it just hasn't been used that way anywhere yet.
     * 
     * @memberOf core.team
     * @param {Object} options Options, as described below.
     * @param {number=} options.season Season to retrieve stats/ratings for. If undefined, return stats for all seasons in a list called "stats".
     * @param {number=} options.tid Team ID. Set this if you want to return only one team object. If undefined, an array of all teams is returned, ordered by tid by default.
     * @param {Array.<string>=} options.attrs List of team attributes to include in output (e.g. region, abbrev, name, ...).
     * @param {Array.<string>=} options.seasonAttrs List of seasonal team attributes to include in output (e.g. won, lost, payroll, ...).
     * @param {Array.<string=>} options.stats List of team stats to include in output (e.g. fg, orb, ast, blk, ...).
     * @param {boolean=} options.totals Boolean representing whether to return total stats (true) or per-game averages (false); default is false.
     * @param {boolean=} options.playoffs Boolean representing whether to return playoff stats or not; default is false. Unlike player.filter, team.filter returns either playoff stats or regular season stats, never both.
     * @param {string=} options.sortby Sorting method. "winp" sorts by descending winning percentage. If undefined, then teams are returned in order of their team IDs (which is alphabetical, currently).
     * @param {IDBTransaction|null=} options.ot An IndexedDB transaction on players, releasedPlayers, and teams; if null/undefined, then a new transaction will be used.
     * @return {Promise.(Object|Array.<Object>)} Filtered team object or array of filtered team objects, depending on the inputs.
     */
    function filter(options) {
        var filterAttrs, filterSeasonAttrs, filterStats, filterStatsPartial;

if (arguments[1] !== undefined) { throw new Error("No cb should be here"); }

        options = options !== undefined ? options : {};
        options.season = options.season !== undefined ? options.season : null;
        options.tid = options.tid !== undefined ? options.tid : null;
        options.attrs = options.attrs !== undefined ? options.attrs : [];
        options.seasonAttrs = options.seasonAttrs !== undefined ? options.seasonAttrs : [];
        options.stats = options.stats !== undefined ? options.stats : [];
        options.totals = options.totals !== undefined ? options.totals : false;
        options.playoffs = options.playoffs !== undefined ? options.playoffs : false;
        options.sortBy = options.sortBy !== undefined ? options.sortBy : "";

        // Copys/filters the attributes listed in options.attrs from p to fp.
        filterAttrs = function (ft, t, options) {
            var j;

            for (j = 0; j < options.attrs.length; j++) {
                if (options.attrs[j] === "budget") {
                    ft.budget = helpers.deepCopy(t.budget);
                    _.each(ft.budget, function (value, key) {
                        if (key !== "ticketPrice") {  // ticketPrice is the only thing in dollars always
                            value.amount /= 1000;
                        }
                    });
                } else {
                    ft[options.attrs[j]] = t[options.attrs[j]];
                }
            }
        };

        // Copys/filters the seasonal attributes listed in options.seasonAttrs from p to fp.
        filterSeasonAttrs = function (ft, t, options) {
            var j, lastTenLost, lastTenWon, tsa;

            if (options.seasonAttrs.length > 0) {
                for (j = 0; j < t.seasons.length; j++) {
                    if (t.seasons[j].season === options.season) {
                        tsa = t.seasons[j];
                        break;
                    }
                }
// Sometimes get an error when switching to team finances page
//if (tsa.revenues === undefined) { debugger; }
                // Revenue and expenses calculation
                tsa.revenue = _.reduce(tsa.revenues, function (memo, revenue) { return memo + revenue.amount; }, 0);
                tsa.expense = _.reduce(tsa.expenses, function (memo, expense) { return memo + expense.amount; }, 0);

                for (j = 0; j < options.seasonAttrs.length; j++) {
                    if (options.seasonAttrs[j] === "winp") {
                        ft.winp = 0;
                        if (tsa.won + tsa.lost > 0) {
                            ft.winp = tsa.won / (tsa.won + tsa.lost);
                        }
                    } else if (options.seasonAttrs[j] === "att") {
                        ft.att = 0;
                        if (tsa.gp > 0) {
                            ft.att = tsa.att / (tsa.wonHome + tsa.lostHome);
                        }
                    } else if (options.seasonAttrs[j] === "cash") {
                        ft.cash = tsa.cash / 1000;  // [millions of dollars]
                    } else if (options.seasonAttrs[j] === "revenue") {
                        ft.revenue = tsa.revenue / 1000;  // [millions of dollars]
                    } else if (options.seasonAttrs[j] === "profit") {
                        ft.profit = (tsa.revenue - tsa.expense) / 1000;  // [millions of dollars]
                    } else if (options.seasonAttrs[j] === "salaryPaid") {
                        ft.salaryPaid = tsa.expenses.salary.amount / 1000;  // [millions of dollars]
                    } else if (options.seasonAttrs[j] === "payroll") {
                        // Handled later
                        ft.payroll = null;
                    } else if (options.seasonAttrs[j] === "lastTen") {
                        lastTenWon = _.reduce(tsa.lastTen, function (memo, num) { return memo + num; }, 0);
                        lastTenLost = tsa.lastTen.length - lastTenWon;
                        ft.lastTen = lastTenWon + "-" + lastTenLost;
                    } else if (options.seasonAttrs[j] === "streak") {  // For standings
                        if (tsa.streak === 0) {
                            ft.streak = "None";
                        } else if (tsa.streak > 0) {
                            ft.streak = "Won " + tsa.streak;
                        } else if (tsa.streak < 0) {
                            ft.streak = "Lost " + Math.abs(tsa.streak);
                        }
                    } else if (options.seasonAttrs[j] === "streakLong") {  // For dashboard
                        if (tsa.streak === 0) {
                            ft.streakLong = null;
                        } else if (tsa.streak === 1) {
                            ft.streakLong = "won last game";
                        } else if (tsa.streak > 1) {
                            ft.streakLong = "won last " + tsa.streak + " games";
                        } else if (tsa.streak === -1) {
                            ft.streakLong = "lost last game";
                        } else if (tsa.streak < -1) {
                            ft.streakLong = "lost last " + Math.abs(tsa.streak) + " games";
                        }
                    } else {
                        ft[options.seasonAttrs[j]] = tsa[options.seasonAttrs[j]];
                    }
                }
            }
        };

        // Filters s by stats (which should be options.stats) into ft. This is to do one season of stats filtering.
        filterStatsPartial = function (ft, s, stats) {
            var j;
            var row,difference,difference2;
			var singles,onbaseper,slugging;
			var fip,warPadj,warPrep,warP,wOBA,warHadj,warHrep,warH,warSadj,warSrep,warS,warF,warHFS,war,warFadj,warFrep;
 						 
            row = {};
			
            if (s !== undefined && s.gp > 0) {
                for (j = 0; j < stats.length; j++) {
                    if (stats[j] === "gp") {
                        ft.gp = s.gp;
           /*         } else if (stats[j] === "fgp") {
                        if (s.fga > 0) {
                            ft.fgp = 100 * s.fg / s.fga;
                        } else {
                            ft.fgp = 0;
                        }
                    } else if (stats[j] === "fgpAtRim") {
                        if (s.fgaAtRim > 0) {
                            ft.fgpAtRim = 100 * s.fgAtRim / s.fgaAtRim;
                        } else {
                            ft.fgpAtRim = 0;
                        }
                    } else if (stats[j] === "fgpLowPost") {
                        if (s.fgaLowPost > 0) {
                            ft.fgpLowPost = 100 * s.fgLowPost / s.fgaLowPost;
                        } else {
                            ft.fgpLowPost = 0;
                        }
                    } else if (stats[j] === "fgpMidRange") {
                        if (s.fgaMidRange > 0) {
                            ft.fgpMidRange = 100 * s.fgMidRange / s.fgaMidRange;
                        } else {
                            ft.fgpMidRange = 0;
                        }
                    } else if (stats[j] === "tpp") {
                        if (s.tpa > 0) {
                            ft.tpp = 100 * s.tp / s.tpa;
                        } else {
                            ft.tpp = 0;
                        }
                    } else if (stats[j] === "ftp") {
                        if (s.fta > 0) {
                            ft.ftp = 100 * s.ft / s.fta;
                        } else {
                            ft.ftp = 0;
                        }*/
                   } else if (stats[j] === "errors") {     // E%
					   if (s.fieldAttempts==0) {
//						[stats[j]] = 0;
						ft.errors = 0;
					   } else {
					   ft.errors = s[stats[j]]  /  s.fieldAttempts;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                   } else if (stats[j] === "fgAtRim") {     // converts SO to SO/9
					   if (s.fta==0) {
//						[stats[j]] = 0;
						ft.fgAtRim = 0;
					   } else {
					   ft.fgAtRim = s[stats[j]] * 9 /  s.fta;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                    } else if (stats[j] === "trb") {     // batting average
					   if (s.fga==0) {
						ft.trb = 0; // changed
					   } else {
						ft.trb = s.fg/s.fga; // changed
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                    } else if (stats[j] === "drb") {     // OBP
					   if (s.fga==0) {
						ft.drb = 0;
					   } else {
						ft.drb = ((s.fg+s.ast)/s.fga);
					   onbaseper = ft.drb ;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                    } else if (stats[j] === "ftp") {     // SLG
					   if (s.fga==0) {
						ft.ftp = 0;
					   } else {
					   singles = s.fg-s.ft-s.orb-s.blk;
						ft.ftp = ((singles+s.ft*2+s.orb*3+s.blk*4)/s.fga);
					   slugging = ft.ftp;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;												
                    } else if (stats[j] === "tpp") {     // OPS
					   if (s.fga==0) {
						ft.tpp = 0;
					   } else {					   
					   singles = s.fg-s.ft-s.orb-s.blk;
					   onbaseper =  ((s.fg+s.ast)/s.fga);
					   slugging  = ((singles+s.ft*2+s.orb*3+s.blk*4)/s.fga);				   
						ft.tpp = slugging+onbaseper;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;												
                    } else if (stats[j] === "fgaMidRange") {     // FIP
					   if (s.fta==0) {
						ft.fgaMidRange = 0;
					   } else {					   
						ft.fgaMidRange = ((13*s.fgLowPost)+(3*(s.fgaAtRim))-(2*s.fgAtRim))/s.fta + 3.20;  // ((13*HR)+(3*(BB+HBP))-(2*K))/IP + constant (constant around 3.2)
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;												

					} else if (stats[j] === "pf") {     // converts R to ERA
					   if (s.pf==0) {
						ft.pf = 0;
					   } else {
						ft.pf = s[stats[j]] * 9 /  s.fta;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;
                    } else if (stats[j] === "fgaAtRim") {     // converts BB to BB/9
					   if (s.fta==0) {
						ft.fgaAtRim = 0;
					   } else {
						ft.fgaAtRim = s[stats[j]] * 9 /  s.fta;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "babipP") {     // babipP not working right
					   if (s.fta==0) {
						ft.babipP = 0;
					   } else {
					     difference = helpers.round(s.fgLowPost,3)-helpers.round(s.fgLowPost,0);
						 difference2 = helpers.round(s.fgAtRim,3)-helpers.round(s.fgAtRim,0);
						 if ((difference==0) && (difference2 == 0)) {
						ft.babipP = (s.drb-s.fgLowPost)/(s.abP-s.fgAtRim-s.fgLowPost)  ;
						} else if (difference2 == 0) {
						ft.babipP = (s.drb-s.fgLowPost/9*s.fta)/(s.abP-s.fgAtRim-s.fgLowPost/9*s.fta)  ;						
						} else if (difference2 == 0) {
						ft.babipP = (s.drb-s.fgLowPost)/(s.abP-s.fgAtRim/9*s.fta-s.fgLowPost)  ;						
						} else {
						ft.babipP = (s.drb-s.fgLowPost/9*s.fta)/(s.abP-s.fgAtRim/9*s.fta-s.fgLowPost/9*s.fta)  ;												
						}
//						row[stats[j]] = (s.drb-s.fgLowPost/9*s.fta)/(s.abP-s.fgAtRim-s.fgLowPost/9*s.fta)  ;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "fgLowPost") {     // converts HR to HR/9
					   if (s.fta==0) {
						ft.fgLowPost = 0;
					   } else {
						ft.fgLowPost = s[stats[j]] * 9 /  s.fta;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "gbp") {     // Percentage ground balls
					   if (s.fta==0) {
						ft.gbp = 0;
					   } else {
						ft.gbp = s.gb/(s.gb+s.ld+s.fb);
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "fbp") {     // HR to fly balls
					   if (s.fta==0) {
						ft.fbp = 0;
					   } else {
						ft.fbp = s.fgLowPost/(s.fb);
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "babip") {     // babip
					   if (s.fga==0) {
						ft.babip = 0;
					   } else {
						ft.babip = (s.fg-s.blk)/(s.fga-s.tov-s.blk)   ;
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "warP") {     // warP
					   if (s.fta==0) {
						ft.warP = 0;
					   } else {
					   

   					     fip = ((13*s.fgLowPost)+(3*(s.fgaAtRim))-(2*s.fgAtRim))/s.fta + 3.20;  // ((13*HR)+(3*(BB+HBP))-(2*K))/IP + constant (constant around 3.2)
						 warPadj = 6.60;
						 warPrep = 4.50;
                         warP = (warPrep-fip)/9*s.fta/warPadj;
						ft.warP = warP;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;		
                    } else if (stats[j] === "ISO") {     // ISO
					   if (s.fga==0) {
						ft.ISO = 0;
					   } else {
					   

						ft.ISO = (s.ft*2 + s.orb*3 + s.blk*4) / (s.fga) ;
						 
//ISO = ((2B) + (2*3B) + (3*HR)) / AB
//ISO = Extra Bases / At-Bats 
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;		

						
                    } else if (stats[j] === "wOBA") {     // warH // wOBA
					   if (s.fga==0) {
						ft.wOBA = 0;
					   } else {
					   

  					     singles = s.fg-s.ft-s.orb-s.blk;
						 wOBA = (0.691*s.ast + 0.884*singles + 1.257*s.ft + 1.593*s.orb + 2.058*s.blk) / (s.fga + s.ast ) ;
						ft.wOBA = wOBA;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
						
                    } else if (stats[j] === "warH") {     // warH
					   if (s.fga==0) {
						ft.warH = 0;
					   } else {
					   

  					     singles = s.fg-s.ft-s.orb-s.blk;
						 wOBA = (0.691*s.ast + 0.884*singles + 1.257*s.ft + 1.593*s.orb + 2.058*s.blk) / (s.fga + s.ast ) ;
						 
					//	 if ((p.pos == "SP") || (p.pos == "RP") || (p.pos == "CL") ) {
	//						 warHadj = 7.00;
					//		 warHadj = 8.00;
	//						 warHrep = 0.2750;
					//		 warHrep = 0.100;
						 
						 
					//	 } else {
	//						 warHadj = 7.00;
							 warHadj = 8.80;
	//						 warHrep = 0.2750;
//							 warHrep = 0.2900;
							 warHrep = 0.2630;
						 
					//	 }						 
	                     warH = (wOBA-warHrep)*s.fga/warHadj;;
						ft.warH = warH;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
                    } else if (stats[j] === "warS") {     // warS
					   if (s.tpa==0) {
						ft.warS = 0;
					   } else {
					   

						 warSadj = 20.00;
						 warSrep = 0.500;
						 warS = (s.tp/s.tpa-warSrep)*s.tpa/warSadj;
						ft.warS = warS;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
						
						
                    } else if (stats[j] === "war") {     // war
					   if (s.fga==0) {
						ft.war = 0;
					   } else {
					   
						if (s.fta==0) {
							warP = 0;
						} else {
                       
							fip = ((13*s.fgLowPost)+(3*(s.fgaAtRim))-(2*s.fgAtRim))/s.fta + 3.20;  // ((13*HR)+(3*(BB+HBP))-(2*K))/IP + constant (constant around 3.2)
							warPadj = 6.60;
							warPrep = 4.50;
							warP = (warPrep-fip)/9*s.fta/warPadj;
						}
							
						 //warbabip = (s.fg-s.blk)/(s.fga-s.tov-s.blk) ;
						 //warnormhits = (s.fga-s.tov-s.blk)*.300;
						 //warnormave = warnormhits+s.blk+s.orb+s.ft-s.tov+s.ast-s.fga+s.tp-s.tpa; // need to include errors
  					     singles = s.fg-s.ft-s.orb-s.blk;
						 wOBA = (0.691*s.ast + 0.884*singles + 1.257*s.ft + 1.593*s.orb + 2.058*s.blk) / (s.fga + s.ast ) ;
					//	 if ((p.pos == "SP") || (p.pos == "RP") || (p.pos == "CL") ) {
	//						 warHadj = 7.00;
					//		 warHadj = 8.00;
	//						 warHrep = 0.2750;
					//		 warHrep = 0.100;
						 
						 
					//	 } else {
	//						 warHadj = 7.00;
							 warHadj = 8.00;
	//						 warHrep = 0.2750;
							//warHrep = 0.2900;
							 warHrep = 0.263000;
						 
					//	 }
	                     warH = (wOBA-warHrep)*s.fga/warHadj;
						if (s.tpa==0) {
						 warS = 0;
						} else {
						 warSadj = 20.00;
						 warSrep = 0.500;
						 warS = (s.tp/s.tpa-warSrep)*s.tpa/warSadj;
						}
					//	 warF = 0.00;
						 
					//	 row[stats[j]] = warF;
						 
					   if (s.fieldAttempts==0) {
//						[stats[j]] = 0;
						warF = 0;
					   } else {
 						 warFadj = 20.00;
						 warFrep = 0.015;
						 warF = (s.errors/s.fieldAttempts-warFrep)*s.fieldAttempts/warFadj*(-1);
			//		   ft.errors = s[stats[j]]  /  s.fieldAttempts;
					   }						 
						 
						 
						 warHFS = warH+warS+warF;
						 war = warHFS+warP;
						ft.war = war;
						 
//wOBA = (0.691�uBB + 0.722�HBP + 0.884�1B + 1.257�2B + 1.593�3B +
//2.058�HR) / (AB + BB � IBB + SF + HBP)					  
					   }
//					   row[stats[j]] = s[stats[j]] * 9 /  s["fta"];
                        //row.gs = s.gs;						
					} else if (stats[j] === "gs") {
                        ft.gs = s.gs;
                    } else if (stats[j] === "fgp") {
                        if (s.fga > 0) {
                            ft.fgp = 100 * s.fg / s.fga;
                        } else {
                            ft.fgp = 0;
                        }
                    } else if (stats[j] === "fgpAtRim") {
                        if (s.fgaAtRim > 0) {
                            ft.fgpAtRim = 100 * s.fgAtRim / s.fgaAtRim;
                        } else {
                            ft.fgpAtRim = 0;
                        }
                    } else if (stats[j] === "fgpLowPost") {
                        if (s.fgaLowPost > 0) {
                            ft.fgpLowPost = 100 * s.fgLowPost / s.fgaLowPost;
                        } else {
                            ft.fgpLowPost = 0;
                        }
                    } else if (stats[j] === "fgpMidRange") {
                        if (s.fgaMidRange > 0) {
                            ft.fgpMidRange = 100 * s.fgMidRange / s.fgaMidRange;
                        } else {
                            ft.fgpMidRange = 0;
                        }
                    } else if (stats[j] === "tpp") {
                        if (s.tpa > 0) {
                            ft.tpp = 100 * s.tp / s.tpa;
                        } else {
                            ft.tpp = 0;
                        }
                    } else if (stats[j] === "ftp") {
                        if (s.fta > 0) {
                            ft.ftp = 100 * s.ft / s.fta;
                        } else {
                            ft.ftp = 0;
                        }
 						
                    } else if (stats[j] === "diff") {
                        ft.diff = ft.pts - ft.oppPts;
                    } else if (stats[j] === "season") {
                        ft.season = s.season;
                    } else {
                        if (options.totals) {
                            ft[stats[j]] = s[stats[j]];
                        } else {
                            ft[stats[j]] = s[stats[j]];
//                            ft[stats[j]] = s[stats[j]] / s.gp;
                        }
                    }
                }
            } else {
                for (j = 0; j < stats.length; j++) {
                    if (stats[j] === "season") {
                        ft.season = s.season;
                    } else {
                        ft[stats[j]] = 0;
                    }
                }
            }

            return ft;
        };

        // Copys/filters the stats listed in options.stats from p to fp.
        filterStats = function (ft, t, options) {
            var i, j, ts;

            if (options.stats.length > 0) {
                if (options.season !== null) {
                    // Single season
                    for (j = 0; j < t.stats.length; j++) {
                        if (t.stats[j].season === options.season && t.stats[j].playoffs === options.playoffs) {
                            ts = t.stats[j];
                            break;
                        }
                    }
                } else {
                    // Multiple seasons
                    ts = [];
                    for (j = 0; j < t.stats.length; j++) {
                        if (t.stats[j].playoffs === options.playoffs) {
                            ts.push(t.stats[j]);
                        }
                    }
                }
            }

            if (ts !== undefined && ts.length >= 0) {
                ft.stats = [];
                // Multiple seasons
                for (i = 0; i < ts.length; i++) {
                    ft.stats.push(filterStatsPartial({}, ts[i], options.stats));
                }
            } else {
                // Single seasons - merge stats with root object
                ft = filterStatsPartial(ft, ts, options.stats);
            }
        };

        return dao.teams.getAll({ot: options.ot, key: options.tid}).then(function (t) {
            var ft, fts, i, returnOneTeam, savePayroll, sortBy;

            // t will be an array of g.numTeams teams (if options.tid is null) or an array of 1 team. If 1, then we want to return just that team object at the end, not an array of 1 team.
            returnOneTeam = false;
            if (t.length === 1) {
                returnOneTeam = true;
            }

            fts = [];

            for (i = 0; i < t.length; i++) {
                ft = {};
                filterAttrs(ft, t[i], options);
                filterSeasonAttrs(ft, t[i], options);
                filterStats(ft, t[i], options);
                fts.push(ft);
            }

            if (Array.isArray(options.sortBy)) {
                // Sort by multiple properties
                sortBy = options.sortBy.slice();
                fts.sort(function (a, b) {
                    var result;

                    for (i = 0; i < sortBy.length; i++) {
                        result = (sortBy[i].indexOf("-") === 1) ? a[sortBy[i]] - b[sortBy[i]] : b[sortBy[i]] - a[sortBy[i]];

                        if (result || i === sortBy.length - 1) {
                            return result;
                        }
                    }
                });
            } else if (options.sortBy === "winp") {
                // Sort by winning percentage, descending
                fts.sort(function (a, b) { return b.winp - a.winp; });
            }

            // If payroll for the current season was requested, find the current payroll for each team. Otherwise, don't.
            if (options.seasonAttrs.indexOf("payroll") < 0 || options.season !== g.season) {
                return returnOneTeam ? fts[0] : fts;
            } else {
                savePayroll = function (i) {
                    return getPayroll(options.ot, t[i].tid).get(0).then(function (payroll) {
                        fts[i].payroll = payroll / 1000;
                        if (i === fts.length - 1) {
                            return returnOneTeam ? fts[0] : fts;
                        }

                        return savePayroll(i + 1);
                    });
                };
                return savePayroll(0);
            }
        });
    }

    // estValuesCached is either a copy of estValues (defined below) or null. When it's cached, it's much faster for repeated calls (like trading block).
    function valueChange(tid, pidsAdd, pidsRemove, dpidsAdd, dpidsRemove, estValuesCached) {
        var add, getPicks, getPlayers, gpAvg, payroll, pop, remove, roster, strategy, tx;

        // UGLY HACK: Don't include more than 2 draft picks in a trade for AI team
//        if (dpidsRemove.length > 2) {
        if (dpidsRemove.length > 0) {
            return -1;
        }

        // Get value and skills for each player on team or involved in the proposed transaction
        roster = [];
        add = [];
        remove = [];

        tx = dao.tx(["draftPicks", "players", "releasedPlayers", "teams"]);

        // Get players
        getPlayers = function () {
            var fudgeFactor, i;

            // Fudge factor for AI overvaluing its own players
            if (tid !== g.userTid) {
                fudgeFactor = 1.05;
            } else {
                fudgeFactor = 1;
            }
            //console.log(fudgeFactor);
            // Get roster and players to remove			
            dao.players.getAll({
                ot: tx,
                index: "tid",
                key: tid
            }).then(function (players) {
                var i, p;

                for (i = 0; i < players.length; i++) {
                    p = players[i];

                    if (pidsRemove.indexOf(p.pid) < 0) {
                        roster.push({
                            value: p.value,
                            skills: _.last(p.ratings).skills,
                            contract: p.contract,
                            worth: player.genContract(p, false, false, true),
                            injury: p.injury,
				//			position: p.pos,                       //
						    energy: p.energy,	
                            age: g.season - p.born.year
                        });
                    } else {
                        remove.push({
                            value: p.value* fudgeFactor,
                            skills: _.last(p.ratings).skills,
                            contract: p.contract,
                            worth: player.genContract(p, false, false, true),
                            injury: p.injury,
						    energy: p.energy,	
							
					//		position: p.pos,                       //
							
                            age: g.season - p.born.year
                        });
                    }
                }
            });
            // Get players to add
            for (i = 0; i < pidsAdd.length; i++) {
                 dao.players.get({
                    ot: tx,
                    key: pidsAdd[i]
                }).then(function (p) {

                    add.push({
                        value: p.valueWithContract,
                        skills: _.last(p.ratings).skills,
                        contract: p.contract,
                        worth: player.genContract(p, false, false, true),
                        injury: p.injury,
                        energy: p.energy,						
                        age: g.season - p.born.year
                    });
                });
            }
        };

        getPicks = function () {
            // For each draft pick, estimate its value based on the recent performance of the team
            if (dpidsAdd.length > 0 || dpidsRemove.length > 0) {
                // Estimate the order of the picks by team
				dao.teams.getAll({ot: tx}).then(function (teams) {
                    var estPicks, estValues, gp, i, rCurrent, rLast, rookieSalaries, s, sorted, t,  withEstValues, wps;



                    // This part needs to be run every time so that gpAvg is available
                    wps = []; // Contains estimated winning percentages for all teams by the end of the season
                    for (i = 0; i < teams.length; i++) {
                        t = teams[i];
                        s = t.seasons.length;
                        if (t.seasons.length === 1) {
                            // First season
                            if (t.seasons[0].won + t.seasons[0].lost > 15) {
                                rCurrent = [t.seasons[0].won, t.seasons[0].lost];
                            } else {
                                // Fix for new leagues - don't base this on record until we have some games played, and don't let the user's picks be overvalued
                                if (i === g.userTid) {
                                    rCurrent = [82, 0];
                                } else {
                                    rCurrent = [0, 82];
                                }
                            }
                            if (i === g.userTid) {
                                rLast = [50, 32];
                            } else {
                                rLast = [32, 50]; // Assume a losing season to minimize bad trades
                            }
                        } else {
                            // Second (or higher) season
                            rCurrent = [t.seasons[s - 1].won, t.seasons[s - 1].lost];
                            rLast = [t.seasons[s - 2].won, t.seasons[s - 2].lost];
                        }

                        gp = rCurrent[0] + rCurrent[1]; // Might not be "real" games played

                        // If we've played half a season, just use that as an estimate. Otherwise, take a weighted sum of this and last year
                        if (gp >= 41) {
                            wps.push(rCurrent[0] / gp);
                        } else if (gp > 0) {
                            wps.push((gp / 41 * rCurrent[0] / gp + (41 - gp) / 41 * rLast[0] / 82));
                        } else {
                            wps.push(rLast[0] / 82);
                        }
                    }

                    // Get rank order of wps http://stackoverflow.com/a/14834599/786644
                    sorted = wps.slice().sort(function (a, b) { return a - b; });
                    estPicks = wps.slice().map(function (v) { return sorted.indexOf(v) + 1; }); // For each team, what is their estimated draft position?

//                    rookieSalaries = [5000, 4500, 4000, 3500, 3000, 2750, 2500, 2250, 2000, 1900, 1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]; // Keep in sync with core.draft
                     // now 5 rounds
                    //rookieSalaries = [5000, 4500, 4000, 3500, 3000, 2750, 2500, 2250, 2000, 1900, 1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500,500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500,500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500,500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]; // Keep in sync with core.draft
					rookieSalaries = require("core/draft").getRookieSalaries();
 
                    // Actually add picks after some stuff below is done
                    withEstValues = function () {
                        var i;

                        for (i = 0; i < dpidsAdd.length; i++) {
                             dao.draftPicks.get({ot: tx, key: dpidsAdd[i]}).then(function (dp) {
                                var estPick, seasons, value;
                                estPick = estPicks[dp.originalTid];

                                // For future draft picks, add some uncertainty
                                seasons = dp.season - g.season;
                                estPick = Math.round(estPick * (5 - seasons) / 5 + 15 * seasons / 5);

                                // No fudge factor, since this is coming from the user's team (or eventually, another AI)
                                if (estValues[dp.season]) {
//                                    value = estValues[dp.season][estPick - 1 + 30 * (dp.round - 1)];
//                                    value = estValues[dp.season][estPick - 1 + 30 * (dp.round - 1)];
                                    value = 0;
                                }
                                if (!value) {
//                                  value = estValues.default[estPick - 1 + 30 * (dp.round - 1)];
                                  value = 0;
  //                                    value = estValues.default[estPick - 1 + 30 * (dp.round - 1)];
                                }

                                add.push({
                                    value: value,
                                    skills: [],
                                    contract: {
                                        amount: rookieSalaries[estPick - 1 + g.numTeams * (dp.round - 1)],
                                       	exp: dp.season + 2 + (2 - dp.round) // 3 for first round, 2 for second
                                    },
                                    worth: {
                                        amount: rookieSalaries[estPick - 1 + g.numTeams * (dp.round - 1)],
                                        exp: dp.season + 2 + (2 - dp.round) // 3 for first round, 2 for second
                                    },
                                    injury: {type: "Healthy", gamesRemaining: 0},
                                    age: 17,
									energy: 100,
                                    draftPick: true
                                });
							});
                        }

                        for (i = 0; i < dpidsRemove.length; i++) {
                             dao.draftPicks.get({ot: tx, key: dpidsRemove[i]}).then(function (dp) {
                                var estPick, fudgeFactor, seasons, value;
                                estPick = estPicks[dp.originalTid];

                                // For future draft picks, add some uncertainty
                                seasons = dp.season - g.season;
                                estPick = Math.round(estPick * (5 - seasons) / 5 + 15 * seasons / 5);

                                // Set fudge factor with more confidence if it's the current season
                                if (seasons === 0 && gp >= 81) {
                                    fudgeFactor = (1 - gp / 162) * 5;
                                } else {
                                    fudgeFactor = 5;
                                }

                                // Use fudge factor: AI teams like their own picks
                                if (estValues[dp.season]) {
//                                    value = estValues[dp.season][estPick - 1 + 30 * (dp.round - 1)] + (tid !== g.userTid) * fudgeFactor;
                                    value = 0;
//console.log([estPick, estValues[dp.season][estPick - 1 + 30 * (dp.round - 1)] + (tid !== g.userTid) * fudgeFactor]);
                                }
                                if (!value) {
//                                    value = estValues.default[estPick - 1 + 30 * (dp.round - 1)] + (tid !== g.userTid) * fudgeFactor;
                                    value = 0;
                                }
//console.log([estPick, estValues.default[estPick - 1 + 30 * (dp.round - 1)] + (tid !== g.userTid) * fudgeFactor]);

                                remove.push({
                                    value: value,
                                    skills: [],
                                    contract: {
                                        amount: rookieSalaries[estPick - 1 + g.numTeams * (dp.round - 1)] / 1000,
                                        exp: dp.season + 2 + (2 - dp.round) // 3 for first round, 2 for second
                                    },
                                    worth: {
                                        amount: rookieSalaries[estPick - 1 + g.numTeams * (dp.round - 1)] / 1000,
                                        exp: dp.season + 2 + (2 - dp.round) // 3 for first round, 2 for second
                                    },
                                    injury: {type: "Healthy", gamesRemaining: 0},
									energy: 100,
                                    age: 17,
                                    draftPick: true
                                });
                            });
                        }
                    };

                    if (estValuesCached) {
                        estValues = estValuesCached;
                        withEstValues();
                    } else {
                        require("core/trade").getPickValues(tx).then(function (newEstValues) {

                            estValues = newEstValues;
                            withEstValues();
                        });
                    }
                 });
            }
        };

        // Get team strategy and population, for future use
        filter({
            attrs: ["strategy"],
            seasonAttrs: ["pop"],
            stats: ["gp"],
            season: g.season,
            tid: tid,
            ot: tx
        }).then(function (t) {
            strategy = t.strategy;
            pop = t.pop;
            if (pop > 20) {
                pop = 20;
            }
            gpAvg = t.gp; // Ideally would be done separately for each team, but close enough

            getPlayers();
            getPicks();
        });

        getPayroll(tx, tid).then(function (payrollLocal) {
            payroll = payrollLocal;
        });

        return tx.complete().then(function () {
            var contractsFactor, base, doSkillBonuses, dv,  rosterAndAdd, rosterAndRemove, salaryAddedThisSeason, salaryRemoved, skillsNeeded, sumContracts, sumValues;

            gpAvg = helpers.bound(gpAvg, 0, 82);

/*            // Handle situations where the team goes over the roster size limit
            if (roster.length + remove.length > 15) {
                // Already over roster limit, so don't worry unless this trade actually makes it worse
                needToDrop = (roster.length + add.length) - (roster.length + remove.length);
            } else {
                needToDrop = (roster.length + add.length) - 15;
            }
            roster.sort(function (a, b) { return a.value - b.value; }); // Sort by value, ascending
            add.sort(function (a, b) { return a.value - b.value; }); // Sort by value, ascending
            while (needToDrop > 0) {
                // Find lowest value player, from roster or add. Delete him and move his salary to the second lowest value player.
                if (roster[0].value < add[0].value) {
                    if (roster[1].value < add[0].value) {
                        roster[1].contract.amount += roster[0].contract.amount;
                    } else {
                        add[0].contract.amount += roster[0].contract.amount;
                    }
                    roster.shift(); // Remove from value calculation
                } else {
                    if (add.length > 1 && add[1].value < roster[0].value) {
                        add[1].contract.amount += add[0].contract.amount;
                    } else {
                        roster[0].contract.amount += add[0].contract.amount;
                    }
                    add.shift(); // Remove from value calculation
                }

                needToDrop -= 1;
            }*/

            // This roughly corresponds with core.gameSim.updateSynergy
            skillsNeeded = {
                St: 1,
                L: 2,
                Pp: 4,
                Di: 3,
                Do: 2,
                H: 3,
                Ph: 3,
                Fp: 4,
                Cl: 1				
            };

            doSkillBonuses = function (test, roster) {
                var i, j, rosterSkills, rosterSkillsCount, s;

                // What are current skills?
                rosterSkills = [];
                for (i = 0; i < roster.length; i++) {
                    if (roster[i].value >= 45) {
                        rosterSkills.push(roster[i].skills);
                    }
                }
                rosterSkills = _.flatten(rosterSkills);
                rosterSkillsCount = _.countBy(rosterSkills);

                // Sort test by value, so that the highest value players get bonuses applied first
                test.sort(function (a, b) { return b.value - a.value; });

                for (i = 0; i < test.length; i++) {
                    if (test.value >= 45) {
                        for (j = 0; j < test[i].skills.length; j++) {
                            s = test[i].skills[j];

                            if (rosterSkillsCount[s] <= skillsNeeded[s] - 2) {
                                // Big bonus
                                test.value *= 1.1;
                            } else if (rosterSkillsCount[s] <= skillsNeeded[s] - 1) {
                                // Medium bonus
                                test.value *= 1.05;
                            } else if (rosterSkillsCount[s] <= skillsNeeded[s]) {
                                // Little bonus
                                test.value *= 1.025;
                            }

                            // Account for redundancy in test
                            rosterSkillsCount[s] += 1;
                        }
                    }
                }

                return test;
            };

            // Apply bonuses based on skills coming in and leaving
            rosterAndRemove = roster.concat(remove);
            rosterAndAdd = roster.concat(add);
            add = doSkillBonuses(add, rosterAndRemove);
            remove = doSkillBonuses(remove, rosterAndAdd);

            base = 1.25;

            sumValues = function (players, includeInjuries) {
                var exponential;

                includeInjuries = includeInjuries !== undefined ? includeInjuries : false;

                if (players.length === 0) {
                    return 0;
                }

                exponential = _.reduce(players, function (memo, p) {
                    var contractSeasonsRemaining, contractValue, playerValue, value;

                    playerValue = p.value;

                    if (strategy === "rebuilding") {
                        // Value young/cheap players and draft picks more. Penalize expensive/old players
                        if (p.draftPick) {
                            playerValue *= 1.15;
                        } else {
                            if (p.age <= 19) {
                                playerValue *= 1.15;
                            } else if (p.age === 20) {
                                playerValue *= 1.1;
                            } else if (p.age === 21) {
                                playerValue *= 1.075;
                            } else if (p.age === 22) {
                                playerValue *= 1.05;
                            } else if (p.age === 23) {
                                playerValue *= 1.025;
                            } else if (p.age === 27) {
                                playerValue *= 0.975;
                            } else if (p.age === 28) {
                                playerValue *= 0.95;
                            } else if (p.age >= 29) {
                                playerValue *= 0.9;
                            }
                        }
                    }

                    // Anything below 45 is pretty worthless
                    playerValue -= 45;

                    // Normalize for injuries
                    if (includeInjuries && tid !== g.userTid) {
                        if (p.injury.gamesRemaining > 75) {
                            playerValue -= playerValue * 0.75;
                        } else {
                            playerValue -= playerValue * p.injury.gamesRemaining / 100;
                        }
                    }

                    contractValue = (p.worth.amount - p.contract.amount) / 1000;

                    // Account for duration
                    contractSeasonsRemaining = player.contractSeasonsRemaining(p.contract.exp, 82 - gpAvg);
                    if (contractSeasonsRemaining > 1) {
                        // Don't make it too extreme
                        contractValue *= Math.pow(contractSeasonsRemaining, 0.25);
                    } else {
                        // Raising < 1 to < 1 power would make this too large
                        contractValue *= contractSeasonsRemaining;
                    }

                    // Really bad players will just get no PT
                    if (playerValue < 0) {
                        playerValue = 0;
                    }
//console.log([playerValue, contractValue]);

                    value = playerValue + 0.5 * contractValue;

                    if (value === 0) {
                        return memo;
                    }
                    return memo + Math.pow(Math.abs(value), base) * Math.abs(value) / value;
                }, 0);

                if (exponential === 0) {
                    return exponential;
                }
                return Math.pow(Math.abs(exponential), 1 / base) * Math.abs(exponential) / exponential;
            };

            // Sum of contracts
            // If onlyThisSeason is set, then amounts after this season are ignored and the return value is the sum of this season's contract amounts in millions of dollars
            sumContracts = function (players, onlyThisSeason) {
                var sum;

                onlyThisSeason = onlyThisSeason !== undefined ? onlyThisSeason : false;

                if (players.length === 0) {
                    return 0;
                }

                sum = _.reduce(players, function (memo, p) {
                    if (p.draftPick) {
                        return memo;
                    }

                    return memo + p.contract.amount / 1000 * Math.pow(player.contractSeasonsRemaining(p.contract.exp, 82 - gpAvg), 0.25 - (onlyThisSeason ? 0.25 : 0));
                }, 0);

                return sum;
            };

            if (strategy === "rebuilding") {
                contractsFactor = 0.3;
            } else {
                contractsFactor = 0.1;
            }

            salaryRemoved = sumContracts(remove) - sumContracts(add);

            dv = sumValues(add, true) - sumValues(remove) + contractsFactor * salaryRemoved;
/*console.log("Added players/picks: " + sumValues(add, true));
console.log("Removed players/picks: " + (-sumValues(remove)));
console.log("Added contract quality: -" + contractExcessFactor + " * " + sumContractExcess(add));
console.log("Removed contract quality: -" + contractExcessFactor + " * " + sumContractExcess(remove));
console.log("Total contract amount: " + contractsFactor + " * " + salaryRemoved);*/

            // Aversion towards losing cap space in a trade during free agency
            if (g.phase >= g.PHASE.RESIGN_PLAYERS || g.phase <= g.PHASE.FREE_AGENCY) {
                // Only care if cap space is over 2 million
                if (payroll + 2000 < g.salaryCap) {
                    salaryAddedThisSeason = sumContracts(add, true) - sumContracts(remove, true);
                    // Only care if cap space is being used
                    if (salaryAddedThisSeason > 0) {
//console.log("Free agency penalty: -" + (0.2 + 0.8 * g.daysLeft / 30) * salaryAddedThisSeason);
                        dv -= (0.2 + 0.8 * g.daysLeft / 30) * salaryAddedThisSeason; // 0.2 to 1 times the amount, depending on stage of free agency
                    }
                }
            }

 
            // Normalize for number of players, since 1 really good player is much better than multiple mediocre ones
            // This is a fudge factor, since it's one-sided to punish the player
            if (add.length > remove.length) {
                dv *= Math.pow(0.9, add.length - remove.length);
            }

             return dv;
/*console.log('---');
console.log([sumValues(add), sumContracts(add)]);
console.log([sumValues(remove), sumContracts(remove)]);
console.log(dv);*/

        });
    }

    /**
     * Update team strategies (contending or rebuilding) for every team in the league.
     *
     * Basically.. switch to rebuilding if you're old and your success is fading, and switch to contending if you have a good amount of young talent on rookie deals and your success is growing.
     * 
     * @memberOf core.team
     * @return {Promise}
     */
    function updateStrategies() {
        var tx;

        // For
         tx = dao.tx(["players", "playerStats", "teams"], "readwrite");
        dao.teams.iterate({
            ot: tx,
            callback: function (t) {
                var dWon, s, won;

                // Skip user's team
                if (t.tid === g.userTid) {
                    return;
                }

                // Change in wins				
                s = t.seasons.length - 1;
                won = t.seasons[s].won;
                if (s > 0) {
                    dWon = won - t.seasons[s - 1].won;
                } else {
                    dWon = 0;
                }

                // Young stars
                return dao.players.getAll({

                    ot: tx,
                    index: "tid",
                    key: t.tid,
					statsSeasons: [g.season],
					statsTid: t.tid
                }).then(function (players) {					
                    var age, denominator, i, numerator, players, score, updated, youngStar;

                    players = player.filter(players, {
                        season: g.season,
                        tid: t.tid,
                        attrs: ["age", "value", "contract"],
                        stats: ["min"]
                    });

                    youngStar = 0; // Default value

                    numerator = 0; // Sum of age * mp
                    denominator = 0; // Sum of mp
                    for (i = 0; i < players.length; i++) {
                        numerator += players[i].age * players[i].stats.min;
                        denominator += players[i].stats.min;

                        // Is a young star about to get a pay raise and eat up all the cap after this season?
                        if (players[i].value > 65 && players[i].contract.exp === g.season + 1 && players[i].contract.amount <= 5 && players[i].age <= 25) {
                            youngStar += 1;
                        }
                    }

                    // Average age, weighted by minutes played
                    age = numerator / denominator;

//console.log([t.abbrev, 0.8 * dWon, (won - 41), 5 * (26 - age), youngStar * 20])
                    score = 0.8 * dWon + (won - 81) + 5 * (26 - age) + youngStar * 20;

                    updated = false;
                    if (score > 20 && t.strategy === "rebuilding") {
//console.log(t.abbrev + " switch to contending")
                        t.strategy = "contending";
                        updated = true;
                    } else if (score < -20 && t.strategy === "contending") {
//console.log(t.abbrev + " switch to rebuilding")
                        t.strategy = "rebuilding";
                        updated = true;
                    }

                    if (updated) {
                        return t;
                    }
                });
            }
        });

        return tx.complete();
    }


	
    /**
     * Check roster size limits
     *
     * If any AI team is over the maximum roster size, cut their worst players.
     * If any AI team is under the minimum roster size, sign minimum contract
     * players until the limit is reached. If the user's team is breaking one of
     * these roster size limits, display a warning.
     * 
     * @memberOf core.team
     * @return {Promise.?string} Resolves to null if there is no error, or a string with the error message otherwise.
     */
    function checkRosterSizes() {

        var checkRosterSize, minFreeAgents,maxPFreeAgents, tx, userTeamSizeError;

        checkRosterSize = function (tid) {
                dao.players.getAll({ot: tx, index: "tid", key: tid}).then(function (players) {
 
                var i, numPlayersOnRoster, p;
				var numActivePlayersOnRoster,numActivePitcherOnRoster;
				
               
                numPlayersOnRoster = players.length;
				
				if (g.phase < g.PHASE.PLAYOFFS) {
						

					numActivePlayersOnRoster = 0;
					numActivePitcherOnRoster  = 0;
					for (i = 0; i < (numPlayersOnRoster); i++) {
	//                        for (i = 0; i < (numPlayersOnRoster - 15); i++) {
						
						if (players[i].active == true) {
							numActivePlayersOnRoster += 1;
							if ((players[i].pos == "CL") || (players[i].pos == "SP") || (players[i].pos == "RP")) {
								numActivePitcherOnRoster += 1;
							}
						//	console.log("i: "+i+"position : "+players[i].pos);
							//			console.log("i: "+i+" true players[i].active: "+players[i].active); // true/false
							
						} else {
				//			console.log("i: "+i+" false players[i].active: "+players[i].active); // true/false
						}
						 
					}
					
					
					//// make 40 new limit, not 15;
					if (numPlayersOnRoster > 40) {
						if (tid === g.userTid) {
							userTeamSizeError = 'Your team currently has more than the maximum number of players (40). You must remove players (by <a href="' + helpers.leagueUrl(["roster"]) + '">releasing them from your roster</a> or through <a href="' + helpers.leagueUrl(["trade"]) + '">trades</a>) before continuing.';
						} else {
							// Automatically drop lowest value players until we reach 15
							players.sort(function (a, b) { return a.value - b.value; }); // Lowest first
							//// make 40 new limit
							for (i = 0; i < (numPlayersOnRoster - 40); i++) {
								player.release(tx, players[i], false);
							}
						}
					} else if (numPlayersOnRoster < g.minRosterSize) {
						if (tid === g.userTid) {
							userTeamSizeError = 'Your team currently has less than the minimum number of players (' + g.minRosterSize + '). You must add players (through <a href="' + helpers.leagueUrl(["free_agents"]) + '">free agency</a> or <a href="' + helpers.leagueUrl(["trade"]) + '">trades</a>) before continuing.';
						} else {
							// Auto-add players
	//console.log([tid, minFreeAgents.length, numPlayersOnRoster]);
							while (numPlayersOnRoster < g.minRosterSize) {
								//console.log(minFreeAgents.length+" "+numPlayersOnRoster);
								
								p = minFreeAgents.shift();
								p.tid = tid;
								p = player.addStatsRow(tx, p, g.phase === g.PHASE.PLAYOFFS);
									p = player.setContract(p, p.contract, true);
									p.gamesUntilTradable = 15;
									dao.players.put({ot: tx, value: p});

								numPlayersOnRoster += 1;
							}
	//console.log([tid, minFreeAgents.length, numPlayersOnRoster]);
						}
					//}
				   } else if (numActivePlayersOnRoster != 25 && numActivePlayersOnRoster != 0) {
	//               } else if (numActivePlayersOnRoster != 25) {
						if (tid === g.userTid) {
							if (numActivePlayersOnRoster > 25) {
							//	console.log("too many"+numActivePlayersOnRoster);
								userTeamSizeError = 'Your team currently has more than the required number of active players (25). You can fix this at the roster page by moving players from active to inactive.';
							} else {
								userTeamSizeError = 'Your team currently has less than the required number of active players (25). You can fix this at the roster page by moving players from inactive to active.';
							//	console.log("too few"+numActivePlayersOnRoster);
							}
						} else {

							//// this should never happen, as long as there are enough players, the AI roster should always have enough active players and never too many
							//rosterAutoSort(tx, tid);
							//console.log("AI teams active roster # wrong, this should never happen: "+numActivePlayersOnRoster);

							
							// Automatically drop lowest value players until we reach 15
							/*players.sort(function (a, b) { return player.value(a) - player.value(b); }); // Lowest first
							for (i = 0; i < (numPlayersOnRoster - 53); i++) {
	//                        for (i = 0; i < (numPlayersOnRoster - 15); i++) {
								player.release(tx, players[i], false);
							}*/
						}
				   }  

					// Auto sort rosters (except player's team)
	/*                if (tid !== g.userTid) {
						rosterAutoSort(tx, tid);
					}*/
				   
				   if (numActivePitcherOnRoster < 9 && numActivePitcherOnRoster != 0) {
							while (numActivePitcherOnRoster < 9) {
								//console.log(maxPFreeAgents.length+" "+numActivePitcherOnRoster);
								p = maxPFreeAgents.shift();
								p.tid = tid;
								p = player.addStatsRow(tx, p, g.phase === g.PHASE.PLAYOFFS);
									p = player.setContract(p, p.contract, true);
									p.gamesUntilTradable = 15;
									dao.players.put({ot: tx, value: p});


								numActivePitcherOnRoster += 1;
							}				   
					   
				   }  	

				   if (numActivePitcherOnRoster > 13 && numActivePitcherOnRoster != 0) {
							while (numActivePitcherOnRoster > 13) {
								//console.log(minFreeAgents.length+" "+numActivePitcherOnRoster);
								p = minFreeAgents.shift();
								p.tid = tid;
								p = player.addStatsRow(tx, p, g.phase === g.PHASE.PLAYOFFS);
									p = player.setContract(p, p.contract, true);
									p.gamesUntilTradable = 15;
									dao.players.put({ot: tx, value: p});


								numActivePitcherOnRoster -= 1;
							}				   
					   
				   }  						   
				}
                // Auto sort rosters (except player's team)
                if (tid !== g.userTid) {
                    rosterAutoSort(tx, tid);
				}
			});
		};


        tx = dao.tx(["players", "playerStats", "releasedPlayers", "teams"], "readwrite");


        userTeamSizeError = null;

		dao.players.getAll({ot: tx, index: "tid", key: g.PLAYER.FREE_AGENT}).then(function (players) {

            var i, players;

        //    players = event.target.result;

            // List of free agents looking for minimum contracts, sorted by value. This is used to bump teams up to the minimum roster size.
            minFreeAgents = [];
            for (i = 0; i < players.length; i++) {
//                if ( (players[i].contract.amount === 500) && ((players[i].pos != "CL") && (players[i].pos != "SP") && (players[i].pos != "RP")) ) {
                if ( ((players[i].pos != "CL") && (players[i].pos != "SP") && (players[i].pos != "RP")) ) {
                    minFreeAgents.push(players[i]);
                }
            }
            minFreeAgents.sort(function (a, b) { return b.value - a.value; });


            // List of free agents looking for minimum contracts, sorted by value. This is used to bump teams up to the minimum roster size.
            maxPFreeAgents = [];
            for (i = 0; i < players.length; i++) {
//                if ( (players[i].contract.amount >= 500) && ((players[i].pos == "CL") || (players[i].pos == "SP") || (players[i].pos == "RP")) ) {
                if ( ((players[i].pos == "CL") || (players[i].pos == "SP") || (players[i].pos == "RP")) ) {
                    maxPFreeAgents.push(players[i]);
                }
            }
            maxPFreeAgents.sort(function (a, b) { return b.value - a.value; });
			
            // Make sure teams are all within the roster limits
            for (i = 0; i < g.numTeams; i++) {
                checkRosterSize(i);
                }
            });

        return tx.complete().then(function () {
            return userTeamSizeError;
        });
    }
	


    return {
        addSeasonRow: addSeasonRow,
        addStatsRow: addStatsRow,
        generate: generate,
        rosterAutoSort: rosterAutoSort,
        filter: filter,
        valueChange: valueChange,
        updateStrategies: updateStrategies,
        checkRosterSizes: checkRosterSizes,
        getPayroll: getPayroll,
        getPayrolls: getPayrolls
    };
});