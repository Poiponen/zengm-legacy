/**
 * @name views.dashboard
 * @namespace Dashboard.
 */
import globals.Globals;
import ui.UI;
import lib.jquery.JQuery;
import util.bbgmView.BbgmView;
import util.helpers.Helpers;
import util.viewHelpers.ViewHelpers;

class Dashboard {
    public function new() {}

    public static function updateDashboard(inputs:Dynamic, updateEvents:Dynamic):Promise<Dynamic> {
        var deferred = new haxe.ds.Promise();

        Globals.dbm.transaction("leagues").objectStore("leagues").getAll().onsuccess = function (event:Dynamic) {
            var leagues:Array<Dynamic> = event.target.result;
            for (i in 0...leagues.length) {
                if (leagues[i].teamRegion == null) {
                    leagues[i].teamRegion = "???";
                }
                if (leagues[i].teamName == null) {
                    leagues[i].teamName = "???";
                }
                delete leagues[i].tid;
            }

            deferred.resolve({
                leagues: leagues
            });
        };

        return deferred.promise();
    }

    public static function uiFirst(vm:Dynamic):Void {
        UI.title("Dashboard");
    }

    public static function init():Dynamic {
        return BbgmView.init({
            id: "dashboard",
            beforeReq: ViewHelpers.beforeNonLeague,
            runBefore: [updateDashboard],
            uiFirst: uiFirst
        });
    }
}
