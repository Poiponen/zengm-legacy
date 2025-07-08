/**
 * @name views.manual
 * @namespace Manual pages.
 */
use ui;
use util::bbgm_view;
use util::view_helpers;

fn template_string(page: &str) -> String {
    let mut output = String::from("manual");
    let mut upper_next = true;

    for character in page.chars() {
        if upper_next {
            output.push(character.to_uppercase().next().unwrap());
            upper_next = false;
        } else if character == '_' {
            upper_next = true;
        } else {
            output.push(character);
        }
    }

    output
}

fn get(req: &Request) -> HashMap<String, String> {
    let mut response = HashMap::new();
    response.insert("page".to_string(), req.params.get("page").unwrap_or(&"overview".to_string()).clone());
    response
}

fn update_manual(inputs: &HashMap<String, String>, _update_events: &UpdateEvents) -> HashMap<String, String> {
    let mut response = HashMap::new();
    response.insert("page".to_string(), inputs.get("page").unwrap().clone());
    response
}

fn ui_first(_vm: &ViewModel) {
    ui::title("Manual");
}

fn ui_every(update_events: &UpdateEvents, vm: &ViewModel) {
    ui::update(UpdateOptions {
        container: "manual-content".to_string(),
        template: template_string(&vm.page()),
    });
}

bbgm_view::init(ViewOptions {
    id: "manual".to_string(),
    before_req: view_helpers::before_non_league,
    get: get,
    run_before: vec![update_manual],
    ui_first: ui_first,
    ui_every: ui_every,
});
