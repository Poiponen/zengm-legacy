/**
 * @name views.manual
 * @namespace Manual pages.
 */
import java.util.HashMap;

public class ManualView {
    public static void main(String[] args) {
        // Entry point for manual view
    }

    public static String templateString(String page) {
        int index;
        StringBuilder output = new StringBuilder("manual");
        boolean upperNext = true;

        for (index = 0; index < page.length(); index++) {
            if (upperNext) {
                output.append(Character.toUpperCase(page.charAt(index)));
                upperNext = false;
            } else if (page.charAt(index) == '_') {
                upperNext = true;
            } else {
                output.append(page.charAt(index));
            }
        }

        return output.toString();
    }

    public static HashMap<String, String> get(Request req) {
        HashMap<String, String> response = new HashMap<>();
        response.put("page", req.params.get("page") != null ? req.params.get("page") : "overview");
        return response;
    }

    public static HashMap<String, String> updateManual(HashMap<String, String> inputs, Object updateEvents) {
        HashMap<String, String> response = new HashMap<>();
        response.put("page", inputs.get("page"));
        return response;
    }

    public static void uiFirst(ViewModel vm) {
        ui.title("Manual");
    }

    public static void uiEvery(Object updateEvents, ViewModel vm) {
        ui.update(new HashMap<String, String>() {{
            put("container", "manual-content");
            put("template", templateString(vm.page()));
        }});
    }

    public static void init() {
        // Initialization logic here
    }
}
