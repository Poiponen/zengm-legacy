/**
 * @name util.account
 * @namespace Functions for accessing account crap.
 */
define(["dao", "globals", "core/team", "lib/bluebird", "lib/jquery", "lib/underscore", "util/eventLog"], function (dao, g, team, Promise, $, _, eventLog) {

    "use strict";

    var allAchievements, checkAchievement;

    // IF YOU ADD TO THIS you also need to add to the whitelist in add_achievements.php
    allAchievements = [{
        //slug: "participation",
       // name: "Participation",
      //  desc: "You get an achievement just for creating an account, you special snowflake!"
//}, {
        slug: "fo_fo_fo",
        name: "Fo Fo Fo",
        desc: "Go 16-0 in the playoffs."
    }, {
        slug: "septuawinarian",
        name: "95-96 Red Wings",
        desc: "Win 62+ games in the regular season."
    }, {
        slug: "mostPoints",
        name: "76-77 Canadiens",
        desc: "Get 132+ points in the regular season."
    }, {
        slug: "98_degrees",
        name: "98 Degrees",
        desc: "Go 98-0 in the playoffs and regular season."
    }, {
        slug: "dynasty",
        name: "50-55 Red Wings",
        desc: "Win 4 championships in 6 years."
    }, {
        slug: "dynasty_2",
        name: "53-60 Canadiens",
        desc: "Win 6 championships in 8 years."
    }, {
        slug: "dynasty_3",
        name: "65-79 Canadiens",
        desc: "Win 10 championships in 15 years."
    }, {
        slug: "dynasty_4",
        name: "47-49 Maple Leafs",
        desc: "Win 3 championships in a row."
    }, {
        slug: "dynasty_5",
        name: "56-60 Canadiens",
        desc: "Win 5 championships in a row."
    }, {
        slug: "moneyball",
        name: "Moneyball",
        desc: "Win a title with a payroll under $62 million."
    }, {
        slug: "moneyball_2",
        name: "Moneyball 2",
        desc: "Win a title with a payroll under $57 million."
    }, {
        slug: "hardware_store",
        name: "Hardware Store",
        desc: "Players on your team win MVP, DPOY, GOY, ROY, and Playoff MVP in the same season."
    }, {
        slug: "small_market",
        name: "Small Market",
        desc: "Win a title in a city with under 350k avid fans."
    }, {
        slug: "sleeper_pick",
        name: "Sleeper Pick",
        desc: "Use a non top 14 pick to draft the ROY."
    }, {
        slug: "hacker",
        name: "Hacker",
        desc: 'Privately <a href="http://zengm.com/contact/">report</a> a security issue in <a href="https://bitbucket.org/dumbmatter/bbgm-account">the account system</a> or some other part of the site.'
    }];


    /**
     * Records one or more achievements.
     *
     * If logged in, try to record remotely and fall back to IndexedDB if necessary. If not logged in, just write to IndexedDB. Then, create a notification.
     * 
     * @memberOf util.helpers
     * @param {Array.<string>} achievements Array of achievement IDs (see allAchievements above).
     * @param {boolean=} silent If true, don't show any notifications (like if achievements are only being moved from IDB to remote). Default false.
     * @return {Promise}
     */
    function addAchievements(achievements, silent) {
        var addToIndexedDB, notify;

        silent = silent !== undefined ? silent : false;

        notify = function (slug) {
            var i;

            if (silent) {
                return;
            }

            // Find name of achievement
            for (i = 0; i < allAchievements.length; i++) {
                if (allAchievements[i].slug === slug) {
                    eventLog.add(null, {
                        type: "achievement",
                        text: '"' + allAchievements[i].name + '" achievement awarded! <a href="/account">View all achievements.</a>'
                    });
                    break;
                }
            }
        };

        addToIndexedDB = function (achievements) {
            var i, tx;

            tx = dao.tx("achievements", "readwrite");
            for (i = 0; i < achievements.length; i++) {
                dao.achievements.add({
                    ot: tx,
                    value: {
                        slug: achievements[i]
                    }
                });
                notify(achievements[i]);
            }

            return tx.complete();
        };

        return Promise.resolve($.ajax({
            type: "POST",
            url: "http://account.zengm." + g.tld + "/add_achievements.php",
            data: {achievements: achievements, sport: g.sport},
            dataType: "json",
            xhrFields: {
                withCredentials: true
            }
        })).then(function (data) {
            var i;

            if (data.success) {
                for (i = 0; i < achievements.length; i++) {
                    notify(achievements[i]);
                }
            } else {
                return addToIndexedDB(achievements);
            }
        }).catch(function () {
            return addToIndexedDB(achievements);
        });
    }
	
	
    function check() {
        return Promise.resolve($.ajax({
            type: "GET",
            url: "http://account.zengm." + g.tld + "/user_info.php",
            data: "sport=" + g.sport,
            dataType: "json",
            xhrFields: {
                withCredentials: true
             }
        })).then(function (data) {
            var tx;

            // Save username for display
            g.vm.topMenu.username(data.username);

            // If user is logged in, upload any locally saved achievements
            if (data.username !== "") {
                tx = dao.tx("achievements", "readwrite");
                return dao.achievements.getAll({ot: tx}).then(function (achievements) {
                    achievements = _.pluck(achievements, "slug");

                    // If any exist, delete and upload
                    if (achievements.length > 0) {
                        dao.achievements.clear({ot: tx});
                        // If this fails to save remotely, will be added to IDB again
                        return addAchievements(achievements, true);
                    }
                });
            }
        }).catch(function () {});
    }

    function getAchievements() {
        var achievements;

        achievements = allAchievements.slice();

        return dao.achievements.getAll().then(function (achievementsLocal) {
            var i, j;

            // Initialize counts
            for (i = 0; i < achievements.length; i++) {
                achievements[i].count = 0;
            }

            // Handle any achivements stored in IndexedDB
            for (j = 0; j < achievementsLocal.length; j++) {
                for (i = 0; i < achievements.length; i++) {
                    if (achievements[i].slug === achievementsLocal[j].slug) {
                        achievements[i].count += 1;
                    }
                }
            }

            // Handle any achievements stored in the cloud
            return Promise.resolve($.ajax({
                type: "GET",
                url: "http://account.zengm." + g.tld + "/get_achievements.php",
                data: "sport=" + g.sport,
                dataType: "json",
                xhrFields: {
                    withCredentials: true
                }
            })).then(function (achievementsRemote) {
                var i;

                // Merge local and remote achievements
                for (i = 0; i < achievements.length; i++) {
                    achievements[i].count += achievementsRemote[achievements[i].slug] !== undefined ? achievementsRemote[achievements[i].slug] : 0;
                }

                return achievements;
            }).catch(function () {
                // No remote connection, just return local achievements
                return achievements;
            });
        });
    }



    // FOR EACH checkAchievement FUNCTION:
    // Returns a promise that resolves to true or false depending on whether the achievement was awarded.
    // HOWEVER, it's only saved to the database if saveAchievement is true (this is the default), but the saving happens asynchronously. It is theoretically possible that this could cause a notification to be displayed to the user about getting an achievement, but some error occurs when saving it.
    checkAchievement = {};

    checkAchievement.fo_fo_fo = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return dao.playoffSeries.get({key: g.season}).then(function (playoffSeries) {
            var found, i,  round, series;

            
            series = playoffSeries.series;

            for (round = 0; round < series.length; round++) {
                found = false;
                for (i = 0; i < series[round].length; i++) {
                    if (series[round][i].away.won === 4 && series[round][i].home.won === 0 && series[round][i].away.tid === g.userTid) {
                        found = true;
                        break;
                    }
                    if (series[round][i].home.won === 4 && series[round][i].away.won === 0 && series[round][i].home.tid === g.userTid) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    return false;
                }
            }

            if (saveAchievement) {
				if (saveAchievement) {													
					addAchievements(["fo_fo_fo"]);
				}
            }

            return true;
        });
    };

    checkAchievement.septuawinarian = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return team.filter({
            seasonAttrs: ["won"],
            season: g.season,
            tid: g.userTid
        }).then(function (t) {
            if (t.won >= 62) {
				if (saveAchievement) {													
					addAchievements(["septuawinarian"]);
				}
            } else {
				return false;
			}
			return true;
        });
    };
	
   checkAchievement.mostPoints = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return team.filter({
            seasonAttrs: ["points"],
            season: g.season,
            tid: g.userTid
        }).then(function (t) {
            if (t.points >= 132) {
				if (saveAchievement) {													
					addAchievements(["mostPoints"]);
				}
            } else {
				return false;
			}
			return true;
        });
    };	

    checkAchievement["98_degrees"] = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return checkAchievement.fo_fo_fo(function (awarded) {
            if (awarded) {
                return team.filter({
                    seasonAttrs: ["won", "lost"],
                    season: g.season,
                    tid: g.userTid
                }).then(function (t) {
                    if (t.won === 82 && t.lost === 0) {
						if (saveAchievement) {															
                            addAchievements(["98_degrees"]);
						}
                    } else {
						return false;
					}
					return true;
				});
            } else {
				return false;
			}
        });
    };

    function checkDynasty(titles, years, slug, saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return dao.teams.get({key: g.userTid}).then(function (t) {
            var i, titlesFound;


            titlesFound = 0;
            // Look over past years
            for (i = 0; i < years; i++) {
                // Don't overshoot
                if (t.seasons.length - 1 - i < 0) {
                    break;
                }

                // Won title?
                if (t.seasons[t.seasons.length - 1 - i].playoffRoundsWon === 4) {
                    titlesFound += 1;
                }
            }

            if (titlesFound >= titles) {
				if (saveAchievement) {													
					addAchievements([slug]);
				}
            } else {
				return false;
			}
			return true;
        });
    }

    checkAchievement.dynasty = function (saveAchievement) {
        return checkDynasty(4, 6, "dynasty", saveAchievement);
    };

    checkAchievement.dynasty_2 = function (saveAchievement) {
        return checkDynasty(6, 8, "dynasty_2", saveAchievement);
    };

    checkAchievement.dynasty_3 = function (saveAchievement) {
        return checkDynasty(10, 15, "dynasty_3", saveAchievement);
    };

    checkAchievement.dynasty_4 = function (saveAchievement) {
        return checkDynasty(3, 3, "dynasty_4", saveAchievement);
    };
	
    checkAchievement.dynasty_5 = function (saveAchievement) {
        return checkDynasty(5, 5, "dynasty_5", saveAchievement);
    };
	
    function checkMoneyball(maxPayroll, slug, saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return team.filter({
            seasonAttrs: ["expenses", "playoffRoundsWon"],
            season: g.season,
            tid: g.userTid
        }).then(function (t) {
            if (t.playoffRoundsWon === 4 && t.expenses.salary.amount <= maxPayroll) {
				if (saveAchievement) {													
					addAchievements([slug]);
				}
            } else {
				return false;
			}
			return true;
        });
    }

    checkAchievement.moneyball = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        checkMoneyball(62000, "moneyball", saveAchievement);
    };

    checkAchievement.moneyball_2 = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        checkMoneyball(57000, "moneyball_2", saveAchievement);
    };

    checkAchievement.hardware_store = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return dao.awards.get({key: g.season}).then(function (awards) {

            if (awards.mvp.tid === g.userTid && awards.dpoy.tid === g.userTid && awards.smoy.tid === g.userTid && awards.roy.tid === g.userTid && awards.finalsMvp.tid === g.userTid) {
				if (saveAchievement) {													
					addAchievements(["hardware_store"]);
				}
            } else {
				return false;
			}
			return true;
		});
    };

    checkAchievement.small_market = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return team.filter({
            seasonAttrs: ["playoffRoundsWon", "pop"],
            season: g.season,
            tid: g.userTid
        }).then(function (t) {
            if (t.playoffRoundsWon === 4 && t.pop <= 0.35) {
				if (saveAchievement) {													
					addAchievements(["small_market"]);
				}
            } else {
				return false;
			}
			return true;
        });
    };

    checkAchievement.sleeper_pick = function (saveAchievement) {
        saveAchievement = saveAchievement !== undefined ? saveAchievement : true;

        if (g.godModeInPast) {
            return Promise.resolve(false);
        }

        return dao.awards.get({key: g.season}).then(function (awards) {

            if (awards.roy.tid === g.userTid) {
                g.dbl.transaction("players").objectStore("players").get(awards.roy.pid).onsuccess = function (event) {
                    var p;

                    p = event.target.result;

                    if (p.tid === g.userTid && p.draft.tid === g.userTid && p.draft.year === g.season - 1 && (p.draft.round > 1 || p.draft.pick >= 15)) {
						if (saveAchievement) {															
                            addAchievements(["sleeper_pick"]);
						}
                    } else {
						return false;
					}
					return true;
                };
            } else {
				return false;
			}
		});
    };

    return {
        check: check,
        getAchievements: getAchievements,
        addAchievements: addAchievements,
        checkAchievement: checkAchievement
    };
});