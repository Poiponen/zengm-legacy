/**
 * @name views.newLeague
 * @namespace Create new league form.
 */
define(["dao", "ui", "core/league", "lib/bluebird", "lib/jquery", "lib/knockout", "lib/knockout.mapping", "util/bbgmView", "util/helpers", "util/viewHelpers"], function (dao, ui, league, Promise, $, ko, komapping, bbgmView, helpers, viewHelpers) {

    "use strict";


    function InitViewModel() {
        this.invalidLeagueFile = ko.observable(false);
        this.uploadSelected = ko.observable(false);
        this.disableSubmit = ko.computed(function () {
            return this.invalidLeagueFile() && this.uploadSelected();
        }, this);
    }

    // Keep only relevant information, otherwise Knockout has to do extra work creating all kinds of observables
    function removeUnneededTeamProps(teams) {
        var i, prop, propsToKeep;

        // These are used in newLeague.html and updatePopText
        propsToKeep = ["name", "pop", "popRank", "region", "tid"];

        for (i = 0; i < teams.length; i++) {
            // Remove unneeded properties
            for (prop in teams[i]) {
                if (teams[i].hasOwnProperty(prop)) {
                    if (propsToKeep.indexOf(prop) === -1) {
                        delete teams[i][prop];
                    }
                }
            }
        }

        return teams;
    }



    function post(req) {
        Promise.try(function () {
			var file,startingSeason, tid,typeid,leagueid;


            document.getElementById("create-new-league").disabled = true;

        startingSeason = 2019;

            tid = parseInt(req.params.tid, 10);
            localStorage.lastSelectedTid = tid;
			typeid = parseInt(req.params.typeid, 10);
			leagueid = parseInt(req.params.leagueid, 10);

            // Davis.js can't handle file uploads, so do this manually first
            if (req.params.rosters === "custom-rosters") {
                file = document.getElementById("custom-rosters-file").files[0];
                if (file !== undefined) {
                    return new Promise(function (resolve, reject) {
                        var reader;

                        reader = new window.FileReader();
                        reader.readAsText(file);
                        reader.onload = function (event) {
                            var leagueFile, randomizeRosters;

                            leagueFile = JSON.parse(event.target.result);

                            startingSeason = leagueFile.startingSeason !== undefined ? leagueFile.startingSeason : startingSeason;

                            randomizeRosters = req.params.hasOwnProperty("randomize-rosters");

                            league.create(req.params.name, tid,leagueid,typeid, leagueFile, startingSeason, randomizeRosters).then(resolve);
                        };
                    });
                }
            }

            return league.create(req.params.name, tid,leagueid,typeid, null, startingSeason, false);
        }).then(function (lid) {
            ui.realtimeUpdate([], "/l/" + lid, function () {
                // Show helpful information if this is the first league
                if (lid === 1) {
                    ui.highlightPlayButton();
                }
            });
        });
    }


    function updateNewLeague() {
        var newLid;

        newLid = null;

        // Find most recent league and add one to the LID
        return dao.leagues.iterate({
            direction: "prev",
            callback: function (l, shortCircuit) {
                newLid = l.lid + 1;
                shortCircuit();
            }
        }).then(function () {
            var teams,gameType,leagueType;

            if (newLid === null) {
                newLid = 1;
            }

			gameType = helpers.getGameType();
			leagueType = helpers.getLeagueType();

            teams = removeUnneededTeamProps(helpers.getTeamsDefault());
            teams.unshift({
                tid: -1,
                region: "Random",
                name: "Team"
            });

            return {
                name: "League " + newLid,
                teams: teams,
                gameType: gameType,
                leagueType: leagueType,
                lastSelectedTid: parseInt(localStorage.lastSelectedTid, 10)
            };
        });
    }

    function uiFirst(vm) {
        var fileEl,leagueTypeEl,newLeagueRostersEl, selectRosters, selectTeam,selectGameType,selectLeagueType, setTeams, updatePopText, updateShowUploadForm, useCustomTeams;

        ui.title("Create New League");

        updatePopText = function () {
            var difficulty, team;

            team = vm.teams()[parseInt(selectTeam.val(), 10) + 1];

            if (team.tid() >= 0) {
                if (team.popRank() <= 3) {
                    difficulty = "very easy";
                } else if (team.popRank() <= 8) {
                    difficulty = "easy";
                } else if (team.popRank() <= 16) {
                    difficulty = "normal";
                } else if (team.popRank() <= 24) {
                    difficulty = "hard";
                } else {
                    difficulty = "very hard";
                }

                document.getElementById("pop-text").innerHTML = "Region fans: " + team.pop() + " million, #" + team.popRank() + " leaguewide<br>Difficulty: " + difficulty;
            } else {
                document.getElementById("pop-text").innerHTML = "Region fans: ?<br>Difficulty: ?";
            }
        };

		selectGameType = $("select[name='typeid']");
		selectLeagueType = $("select[name='leagueid']");
      //  selectGameType.change(updateShowUploadForm2);

        selectTeam = $("select[name='tid']");
        selectTeam.change(updatePopText);
        selectTeam.keyup(updatePopText);

        updateShowUploadForm = function () {
            if (selectRosters.val() === "custom-rosters") {
                $("#custom-rosters").show();
                $("#randomize-rosters").show();
                vm.uploadSelected(true);
            } else {
                $("#custom-rosters").hide();
                $("#randomize-rosters").hide();
                vm.uploadSelected(false);
            }
        };

        selectRosters = $("select[name='rosters']");
        selectRosters.change(updateShowUploadForm);
        selectRosters.keyup(updateShowUploadForm);

        updatePopText();
        updateShowUploadForm();

        // Handle custom roster teams
        setTeams = function (newTeams) {
            var i, propsToKeep;

            if (newTeams !== undefined) {
                for (i = 0; i < newTeams.length; i++) {
                    // Is pop hidden in season, like in editTeamInfo import?
                    if (!newTeams[i].hasOwnProperty("pop") && newTeams[i].hasOwnProperty("seasons")) {
                        newTeams[i].pop = newTeams[i].seasons[newTeams[i].seasons.length - 1].pop;
                    }

                    newTeams[i].pop = helpers.round(newTeams[i].pop, 2);
                }

                newTeams = helpers.addPopRank(newTeams);

                newTeams = removeUnneededTeamProps(newTeams);
                // Add random team
                newTeams.unshift({
                    tid: -1,
                    region: "Random",
                    name: "Team"
                });

                komapping.fromJS({teams: newTeams}, vm);
            }

            updatePopText();
        };
        useCustomTeams = function () {
            var file, reader;

            if (fileEl.files.length) {
                vm.invalidLeagueFile(false);

                file = fileEl.files[0];

                reader = new window.FileReader();
                reader.readAsText(file);
                reader.onload = function (event) {
                    var newTeams, leagueFile;

                    try {
                        leagueFile = JSON.parse(event.target.result);
                    } catch (e) {
                        vm.invalidLeagueFile(true);
                        return;
                    }
                    newTeams = leagueFile.teams;
                    setTeams(newTeams);

                    // Is a userTid specified?
                    if (leagueFile.hasOwnProperty("gameAttributes")) {
                        leagueFile.gameAttributes.some(function (attribute) {
                            if (attribute.key === "userTid") {
                                // Set it to select the userTid entry
                                document.getElementById("new-league-tid").value = attribute.value;
                                updatePopText(); // Not caught by event handlers for some reason
                                return true;
                            }
                        });
                    }
                };
            }
        };

        leagueTypeEl = document.getElementById("new-league-leagueid");
		leagueTypeEl.addEventListener("change", function () {
		console.log(this.value);
			if (this.value == 0) {
				setTeams(helpers.getTeamsDefault());
			} else {
				setTeams(helpers.getTeamsRussia());
			}

		});

        fileEl = document.getElementById("custom-rosters-file");
        fileEl.addEventListener("change", useCustomTeams);
        // Handle switch away from custom roster teams
        newLeagueRostersEl = document.getElementById("new-league-rosters");
        newLeagueRostersEl.addEventListener("change", function () {
            if (this.value === "custom-rosters") {
                useCustomTeams();
            } else {
					console.log(selectLeagueType.val() );
				if (selectLeagueType.val()  == 0) {
		//			setTeams(helpers.getTeamsNADefault(),1);

					setTeams(helpers.getTeamsDefault());
				} else {
					setTeams(helpers.getTeamsRussia());
				}
//                setTeams(helpers.getTeamsDefault());
            }
        });
    }

    return bbgmView.init({
        id: "newLeague",
        beforeReq: viewHelpers.beforeNonLeague,
        InitViewModel: InitViewModel,
        post: post,
        runBefore: [updateNewLeague],
        uiFirst: uiFirst
    });
});
