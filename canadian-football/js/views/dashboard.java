/**
 * @name views.dashboard
 * @namespace Dashboard.
 */
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class Dashboard {

    public CompletableFuture<DashboardData> updateDashboard(List<Object> inputs, List<Object> updateEvents) {
        CompletableFuture<DashboardData> future = new CompletableFuture<>();

        DatabaseManager dbManager = Globals.getDbManager();
        dbManager.transaction("leagues").objectStore("leagues").getAll().onsuccess(event -> {
            int i;
            List<League> leagues = event.getTarget().getResult();

            for (i = 0; i < leagues.size(); i++) {
                if (leagues.get(i).getTeamRegion() == null) {
                    leagues.get(i).setTeamRegion("???");
                }
                if (leagues.get(i).getTeamName() == null) {
                    leagues.get(i).setTeamName("???");
                }
                leagues.get(i).setTid(null); // Assuming tid is a field to be deleted
            }

            future.complete(new DashboardData(leagues));
        });

        return future;
    }

    public void uiFirst(ViewModel viewModel) {
        UI.title("Dashboard");
    }

    public static DashboardConfig init() {
        return new DashboardConfig("dashboard", ViewHelpers.beforeNonLeague, List.of(Dashboard::updateDashboard), Dashboard::uiFirst);
    }
}

class DashboardData {
    private List<League> leagues;

    public DashboardData(List<League> leagues) {
        this.leagues = leagues;
    }

    public List<League> getLeagues() {
        return leagues;
    }
}

class League {
    private String teamRegion;
    private String teamName;
    private Integer tid;

    public String getTeamRegion() {
        return teamRegion;
    }

    public void setTeamRegion(String teamRegion) {
        this.teamRegion = teamRegion;
    }

    public String getTeamName() {
        return teamName;
    }

    public void setTeamName(String teamName) {
        this.teamName = teamName;
    }

    public void setTid(Integer tid) {
        this.tid = tid;
    }
}
