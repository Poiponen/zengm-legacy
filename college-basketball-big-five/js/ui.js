/**
 * @name ui
 * @namespace Anything that directly updates the UI.
 */
define(["dao", "globals", "templates", "lib/bluebird", "lib/davis", "lib/jquery", "lib/knockout", "util/helpers", "util/lock"], function (dao, g, templates, Promise, Davis, $, ko, helpers, lock) {
    "use strict";

    /**
     * Smartly update the currently loaded view or redirect to a new one.
     *
     * This will only refresh or redirect to in-league URLs (and a couple out of league). Otherwise, the callback is just called immediately.
     *
     * @memberOf ui
     * @param {Array.<string>=} updateEvents Optional array of strings containing information about what caused this update, e.g. "gameSim" or "playerMovement".
     * @param {string=} url Optional URL to redirect to. The current URL is used if this is not defined. If this URL is either undefined or the same as location.pathname, it is considered to be an "refresh" and no entry in the history or stat tracker is made. Otherwise, it's considered to be a new pageview.
     * @param {function()=} cb Optional callback that will run after the page updates.
     * @param {Object=} raw Optional object passed through to Davis's req.raw.
     */
    function realtimeUpdate(updateEvents, url, cb, raw) {
        var inLeague, refresh;

//debugger;
        updateEvents = updateEvents !== undefined ? updateEvents : [];
        url = url !== undefined ? url : location.pathname + location.search;
        raw = raw !== undefined ? raw : {};

        inLeague = url.substr(0, 3) === "/l/"; // Check the URL to be redirected to, not the current league (g.lid)
        refresh = url === location.pathname && inLeague;

        // If tracking is enabled, don't track realtime updates for refreshes
        if (Davis.Request.prototype.noTrack !== undefined && refresh) {
            Davis.Request.prototype.noTrack();
        }

        raw.updateEvents = updateEvents;
        raw.cb = cb;

        // This prevents the Create New League form from inappropriately refreshing after it is submitted
        if (refresh) {
            Davis.location.replace(new Davis.Request(url, raw));
        } else if (inLeague || url === "/" || url.indexOf("/account") === 0) {
            Davis.location.assign(new Davis.Request(url, raw));
        } else if (cb !== undefined) {
            cb();
        }
    }

    // Things to do on initial page load
    function init() {
        var $playMenuDropdown, api, playMenu, playMenuOptions, topMenuCollapse;

        ko.applyBindings(g.vm.topMenu, document.getElementById("top-menu"));

        // Handle clicks from play menu
        api = require("api");
        playMenu = $("#play-menu");
        playMenu.on("click", "#play-menu-stop", function () {
            api.play("stop");
            return false;
        });
        playMenu.on("click", "#play-menu-day", function () {
            api.play("day");
            return false;
        });
        playMenu.on("click", "#play-menu-week", function () {
            api.play("week");
            return false;
        });
        playMenu.on("click", "#play-menu-month", function () {
            api.play("month");
            return false;
        });
        playMenu.on("click", "#play-menu-until-playoffs", function () {
            api.play("untilPlayoffs");
            return false;
        });
        playMenu.on("click", "#play-menu-through-playoffs", function () {
            api.play("throughPlayoffs");
            return false;
        });
        playMenu.on("click", "#play-menu-view-playoffs64", function () {
            api.play("viewPlayoffs64");
            return false;
        });
        playMenu.on("click", "#play-menu-through-playoffs64", function () {
            api.play("throughPlayoffs64");
            return false;
        });
		
        playMenu.on("click", "#play-menu-until-draft", function () {
            api.play("untilDraft");
            return false;
        });
        playMenu.on("click", "#play-menu-until-resign-players", function () {
            api.play("untilResignPlayers");
            return false;
        });
        playMenu.on("click", "#play-menu-until-free-agency", function () {
            api.play("untilFreeAgency");
            return false;
        });
        playMenu.on("click", "#play-menu-until-preseason", function () {
            api.play("untilPreseason");
            return false;
        });
        playMenu.on("click", "#play-menu-until-regular-season", function () {
            api.play("untilRegularSeason");
            return false;
        });

        // Bootstrap's collapsable nav doesn't play nice with single page apps
        // unless you manually close it when a link is clicked. However, I need
        // this to run only on real links, not "dropdown" links (#).
        topMenuCollapse = $("#top-menu-collapse");
        topMenuCollapse.on("click", "a:not([href='#'])", function () {
            // Only run when collapsable is open
            if (topMenuCollapse.hasClass("in")) {
                topMenuCollapse.collapse("hide");
            }
        });

        // HACK: close bootstrap popovers on click outside of help box
        $(document).on("click", ".help-icon, .popover", function (event) {
            event.stopPropagation();
        });
        $(document).on("click", function () {
            $(".help-icon").popover("hide");

            // Only run when collapsable is open
            if (topMenuCollapse.hasClass("in")) {
                topMenuCollapse.collapse("hide");
            }
        });

        // When a dropdown at the top is open, use hover to move between items,
        // like in a normal menubar.
        $("#nav-primary .dropdown-toggle").on("mouseenter", function () {
            var foundOpen, i, liHover, liOpen, lis;

            if (!topMenuCollapse.hasClass("in")) {
                liHover = this.parentNode;

                // Is any dropdown open?
                foundOpen = false;
                lis = document.getElementById("nav-primary").children;
                for (i = 0; i < lis.length; i++) {
                    if (lis[i].classList.contains("open")) {
                        foundOpen = true;
                        liOpen = lis[i];
                        if (liOpen === liHover) {
                            // The hovered menu is already open
                            return;
                        }
                    }
                }

                // If no dropdown is open, do nothing
                if (!foundOpen) {
                    return;
                }

                // If a dropdown is open and another one is hovered over, open the hovered one and close the other
                $(liHover.children[0]).dropdown("toggle");
            }
        });

        // Keyboard shortcut
        $playMenuDropdown = $("#play-menu a.dropdown-toggle");
        playMenuOptions = document.getElementById("play-menu-options");
        document.addEventListener("keyup", function (e) {
            // alt + p
            if (e.altKey && e.keyCode === 80) {
                // ul -> first li -> a -> click
                playMenuOptions.firstElementChild.firstElementChild.click();

                // If play menu is open, close it
                if (playMenuOptions.parentElement.classList.contains("open")) {
                    $playMenuDropdown.dropdown("toggle");
                }
            }
        });

        // Watch list toggle
        $(document).on("click", ".watch", function () {
            var pid, watchEl;

            watchEl = this;
            pid = parseInt(watchEl.dataset.pid, 10);

            dao.players.get({key: pid}).then(function (p) {
                if (watchEl.classList.contains("watch-active")) {
                    p.watch = false;
                    watchEl.classList.remove("watch-active");
                    watchEl.title = "Add to Watch List";
                } else {
                    p.watch = true;
                    watchEl.classList.add("watch-active");
                    watchEl.title = "Remove from Watch List";
                }

                return dao.players.put({value: p});
            }).then(function () {
                return require("core/league").setGameAttributes({lastDbChange: Date.now()});
            }).then(function () {
                realtimeUpdate(["watchList"]);
            });
        });
    }

    /**
     * Updates the title.
     * @param {string} text New title.
     */
    function title(text) {
        if (g.lid !== null) {
            text += " - " + g.leagueName;
        }
        document.title = text + " - College Basketball Coach Big Five";
    }

    /**
     * Replaces the displayed HTML content.
     *
     * After this is called, ko.applyBindings probably needs to be called to hook up Knockout.
     *
     * @memberOf ui
     * @param  {Object} data An object with several properties: "template" the name of the HTML template file in the templates folder; "container" is the id of the container div (probably content or league_content).
     */
    function update(data) {
        var containerEl, contentEl, rendered;

        rendered = templates[data.template];
        containerEl = document.getElementById(data.container);
        containerEl.innerHTML = rendered;

        if (data.container === "league_content") {
            contentEl = document.getElementById("content");
            if (contentEl) {
                contentEl.dataset.idLoaded = "league";
                contentEl.dataset.idLoading = "";
            }
        }
        containerEl.dataset.idLoaded = data.template;
    }

    // Data tables
    // fnStateSave and fnStateLoad are based on http://www.datatables.net/blog/localStorage_for_state_saving except the id of the table is used in the key. This means that whatever you do to a table (sorting, viewing page, etc) will apply to every identical table in other leagues.
    function datatable(table, sortCol, data, extraOptions) {
        var options;

        options = $.extend({
            aaData: data,
            aaSorting: [[sortCol, "desc"]],
            bDestroy: true,
            bDeferRender: true,
            bStateSave: true,
            fnStateSave: function (oSettings, oData) {
                localStorage.setItem("DataTables_" + table[0].id, JSON.stringify(oData));
            },
            fnStateLoad: function () {
                return JSON.parse(localStorage.getItem("DataTables_" + table[0].id));
            },
            sPaginationType: "bootstrap",
            oLanguage: {
                sLengthMenu: "_MENU_ per page",
                sInfo: "_START_ to _END_ of _TOTAL_",
                sInfoEmpty: "",
                sInfoFiltered: "(filtered from _MAX_)"
            }
        }, extraOptions);

        table.dataTable(options);
    }
    function datatableSinglePage(table, sortCol, data, extraOptions) {
        var options;

        options = $.extend({
            aaData: data,
            aaSorting: [[sortCol, "desc"]],
            bDestroy: true,
            bFilter: false,
            bInfo: false,
            bPaginate: false,
            bStateSave: true,
            fnStateSave: function (oSettings, oData) {
                localStorage.setItem("DataTables_" + table[0].id, JSON.stringify(oData));
            },
            fnStateLoad: function () {
                return JSON.parse(localStorage.getItem("DataTables_" + table[0].id));
            }
        }, extraOptions);

        table.dataTable(options);
    }

    function tableClickableRows(tableEl) {
        tableEl.addClass("table-hover");
        tableEl.on("click", "tbody tr", function () {
            // Toggle highlight
            if (this.classList.contains("warning")) {
                this.classList.remove("warning");
            } else {
                this.classList.add("warning");
            }
        });
    }

    // For dropdown menus to change team/season/whatever
    // This should be cleaned up, but it works for now.
    function dropdown(select1, select2, select3, select4) {
        var handleDropdown;

        handleDropdown = function (select) {
            select.off("change");
            select.change(function () {
                var args, extraParam, leaguePage, seasonsDropdown, url;

                // UGLY HACK: Stop event handling if it looks like this is a season dropdown and a new season is starting. Otherwise you get double refreshes, often pointing to the previous year, since updating the season dropdown is interpreted as a "change"
                seasonsDropdown = document.querySelector(".bbgm-dropdown .seasons");
                if (seasonsDropdown && parseInt(seasonsDropdown.lastChild.value, 10) < g.season) {
                    return;
                }

                extraParam = select.parent()[0].dataset.extraParam;

                // Name of the page (like "standings"), with # and ? stuff removed
                leaguePage = document.URL.split("/", 6)[5].split("#")[0].split("?")[0];

                args = [leaguePage, select1.val()];
                if (select2 !== undefined) {
                    args.push(select2.val());
                }
                if (select3 !== undefined) {
                    args.push(select3.val());
                }
                if (select4 !== undefined) {
                    args.push(select4.val());
                }
                url = helpers.leagueUrl(args);

                if (extraParam !== undefined && extraParam !== null && extraParam !== "") {
                    url += "/" + extraParam;
                }

                realtimeUpdate([], url);
            });
        };

        handleDropdown(select1);
        if (select2 !== undefined) {
            handleDropdown(select2);
        }
        if (select3 !== undefined) {
            handleDropdown(select3);
        }
        if (select4 !== undefined) {
            handleDropdown(select4);
        }
    }

   /**
     * Update play menu options based on game state.
     *
     * @memberOf ui
     * @param {IDBTransaction|null} ot An IndexedDB transaction on gameAttributes, messages, and negotiations; if null is passed, then a new transaction will be used.
     * @return {Promise}
     */
    function updatePlayMenu(ot) {
        var allOptions, keys;

        allOptions = [{id: "play-menu-stop", url: "", label: "Stop"},
                      {id: "play-menu-day", url: "", label: "One day"},
                      {id: "play-menu-week", url: "", label: "One week"},
                      {id: "play-menu-month", url: "", label: "One month"},
                      {id: "play-menu-until-playoffs", url: "", label: "Until conference tournaments"},
                      {id: "play-menu-through-playoffs", url: "", label: "Through conference tournaments"},
                      {id: "play-menu-view-playoffs64", url: "", label: "View national tournament"},
                      {id: "play-menu-through-playoffs64", url: "", label: "Through national tournament"},
                      {id: "play-menu-day-live", url: helpers.leagueUrl(["live"]), label: "One day (live)"},
//                      {id: "play-menu-until-draft", url: "", label: "Until draft"},
                      {id: "play-menu-until-draft", url: "", label: "Until recruiting - through draft"},
                      {id: "play-menu-view-draft", url: helpers.leagueUrl(["draft"]), label: "View draft"},
                      {id: "play-menu-until-resign-players", url: "", label: "Re-sign players with expiring contracts"},
                      {id: "play-menu-until-free-agency", url: "", label: "Until recruiting"},
                      {id: "play-menu-until-preseason", url: "", label: "Until preseason"},
                      {id: "play-menu-until-regular-season", url: "", label: "Until regular season"},
                      {id: "play-menu-contract-negotiation", url: helpers.leagueUrl(["negotiation"]), label: "Continue recruiting player"},
                      {id: "play-menu-contract-negotiation-list", url: helpers.leagueUrl(["negotiation"]), label: "Continue re-signing players"},
                      {id: "play-menu-message", url: helpers.leagueUrl(["message"]), label: "Read new message"},
                      {id: "play-menu-new-league", url: "/new_league", label: "Try again in a new association"},
                      {id: "play-menu-new-team", url: helpers.leagueUrl(["new_team"]), label: "Try again with a new team"}];

        if (g.phase === g.PHASE.PRESEASON) {
            // Preseason
            keys = ["play-menu-until-regular-season"];
        } else if (g.phase === g.PHASE.REGULAR_SEASON) {
            // Regular season - pre trading deadline
            keys = ["play-menu-day", "play-menu-day-live", "play-menu-week", "play-menu-month", "play-menu-until-playoffs"];
        } else if (g.phase === g.PHASE.AFTER_TRADE_DEADLINE) {
            // Regular season - post trading deadline
            keys = ["play-menu-day", "play-menu-day-live", "play-menu-week", "play-menu-month", "play-menu-until-playoffs"];
        } else if (g.phase === g.PHASE.PLAYOFFS) {
            // Playoffs
            keys = ["play-menu-day", "play-menu-day-live", "play-menu-week", "play-menu-month", "play-menu-through-playoffs"];
        } else if (g.phase === g.PHASE.BEFORE_PLAYOFFS64) {
            // Conference Playoff Summary
//            keys = ["play-menu-day", "play-menu-day-live", "play-menu-week", "play-menu-month", "play-menu-through-playoffs64"];
			//console.log("got here");
            keys = ["play-menu-view-playoffs64"];
        } else if (g.phase === g.PHASE.PLAYOFFS64) {
            // Playoffs
		//	console.log("got to menu");
			//console.log("got here2");		
            keys = ["play-menu-day", "play-menu-day-live", "play-menu-week", "play-menu-month", "play-menu-through-playoffs64"];
        } else if (g.phase === g.PHASE.BEFORE_DRAFT) {
            // Offseason - pre draft
            keys = ["play-menu-until-free-agency"];
    //        keys = ["play-menu-until-draft"];
//            keys = ["play-menu-until-draft"];
  //          keys = ["play-menu-day", "play-menu-week", "play-menu-month", "play-menu-until-preseason"];
//            keys = ["play-menu-until-draft"];
        } else if (g.phase === g.PHASE.DRAFT || g.phase === g.PHASE.FANTASY_DRAFT) {
            // Draft
 //           keys = ["play-menu-day", "play-menu-week", "play-menu-month", "play-menu-until-preseason"];
            keys = ["play-menu-view-draft"];
        } else if (g.phase === g.PHASE.AFTER_DRAFT) {
            // Offseason - post draft
 //           keys = ["play-menu-day", "play-menu-week", "play-menu-month", "play-menu-until-preseason"];
            keys = ["play-menu-until-resign-players"];
        } else if (g.phase === g.PHASE.RESIGN_PLAYERS) {
            // Offseason - re-sign players
 //           keys = ["play-menu-day", "play-menu-week", "play-menu-month", "play-menu-until-preseason"];
            keys = ["play-menu-contract-negotiation-list", "play-menu-until-free-agency"];
        } else if (g.phase === g.PHASE.FREE_AGENCY) {
            // Offseason - free agency
            keys = ["play-menu-day", "play-menu-week", "play-menu-month", "play-menu-until-preseason"];
        }

        return Promise.all([
            lock.unreadMessage(ot),
            lock.gamesInProgress(ot),
            lock.negotiationInProgress(ot)
        ]).spread(function (unreadMessage, gamesInProgress, negotiationInProgress) {
            var i, ids, j, someOptions;

            if (unreadMessage) {
                keys = ["play-menu-message"];
            }
            if (gamesInProgress) {
                keys = ["play-menu-stop"];
            }
            if (negotiationInProgress && g.phase !== g.PHASE.RESIGN_PLAYERS) {
                keys = ["play-menu-contract-negotiation"];
            }

            // If there is an unread message, it's from the owner saying the player is fired, so let the user see that first.
            if (g.gameOver && !unreadMessage) {
                keys = ["play-menu-new-team", "play-menu-new-league"];
            }

            // This code is very ugly. Basically I just want to filter all_options into
            // some_options based on if the ID matches one of the keys.
            ids = [];
            for (i = 0; i < allOptions.length; i++) {
                ids.push(allOptions[i].id);
            }
            someOptions = [];
            for (i = 0; i < keys.length; i++) {
                for (j = 0; j < ids.length; j++) {
                    if (ids[j] === keys[i]) {
                        someOptions.push(allOptions[j]);
                        break;
                    }
                }
            }

            if (someOptions.length > 0) {
                someOptions[0].label += ' <span class="text-muted kbd">Alt+P</span>';
            }

            g.vm.topMenu.options(someOptions);
        });
    }

    /*Save status to database and push to client.

    If no status is given, load the last status from the database and push that
    to the client.

    Args:
        status: A string containing the current status message to be pushed to
            the client.
    */
    function updateStatus(statusText) {
        var oldStatus;

        oldStatus = g.statusText;
        if (statusText === undefined) {
            g.vm.topMenu.statusText(oldStatus);
        } else if (statusText !== oldStatus) {
            require("core/league").setGameAttributes({statusText: statusText}).then(function () {
                g.vm.topMenu.statusText(statusText);
//                console.log("Set status: " + statusText);
            });
        }
    }

    /*Save phase text to database and push to client.

    If no phase text is given, load the last phase text from the database and
    push that to the client.

    Args:
        phaseText: A string containing the current phase text to be pushed to
            the client.
    */
    function updatePhase(phaseText) {
        var oldPhaseText;

        oldPhaseText = g.phaseText;
        if (phaseText === undefined) {
            g.vm.topMenu.phaseText(oldPhaseText);
        } else if (phaseText !== oldPhaseText) {
            require("core/league").setGameAttributes({phaseText: phaseText}).then(function () {
                g.vm.topMenu.phaseText(phaseText);
//                console.log("Set phase: " + phaseText);
            });

            // Update phase in meta database. No need to have this block updating the UI or anything.
            dao.leagues.get({key: g.lid}).then(function (l) {
                l.phaseText = phaseText;
                dao.leagues.put({value: l});
            });
        }
    }

    function highlightPlayButton() {
        var playButtonLink;

        playButtonLink = $("#play-button-link");

        playButtonLink.popover({
            trigger: "manual",
            placement: "bottom",
            title: "Welcome to College Basketball Coach Big Five!",
            content: "To advance through the game, use the Play button at the top. The options shown will change depending on the current state of the game.",
            template: '<div class="popover popover-play"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'
        });

        // If the user finds the play button first, don't show the popover
        playButtonLink.on("click", function() {
            playButtonLink.popover("hide");
        });

        setTimeout(function () {
            playButtonLink.popover("show");

            // Only do this after showing button, so a quick click doesn't close it early
            $(document).on("click", function () {
                playButtonLink.popover("hide");
            });
        }, 1000);
    }

    return {
        init: init,
        datatable: datatable,
        datatableSinglePage: datatableSinglePage,
        tableClickableRows: tableClickableRows,
        dropdown: dropdown,
        realtimeUpdate: realtimeUpdate,
        title: title,
        update: update,
        updatePhase: updatePhase,
        updatePlayMenu: updatePlayMenu,
        updateStatus: updateStatus,
        highlightPlayButton: highlightPlayButton
    };
});