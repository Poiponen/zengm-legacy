/**
 * @name views.exportRosters
 * @namespace Export rosters.
 */
use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use serde_json::json;

#[wasm_bindgen]
pub fn export_rosters(req: Request) {
    let download_link = web_sys::window().unwrap().document().unwrap().get_element_by_id("download-link").unwrap();
    download_link.set_inner_html("Generating...");

    let object_stores: Vec<&str> = req.params.object_stores.join(",").split(",").collect();

    league::export_(object_stores, |data| {
        let json = serde_json::to_string_pretty(&data).unwrap();
        let blob = web_sys::Blob::new_with_u8_array(&js_sys::Uint8Array::new(&json.as_bytes())).unwrap();
        let url = web_sys::Url::create_object_url_with_blob(&blob).unwrap();
        let file_name = match data.meta {
            Some(ref meta) => meta.name.clone(),
            None => "League".to_string(),
        };
        let anchor = web_sys::document().unwrap().create_element("a").unwrap();
        anchor.set_attribute("download", &format!("CFL - {}.json", file_name)).unwrap();
        anchor.set_attribute("href", &url).unwrap();
        anchor.set_inner_html("Download Exported League File");
        anchor.set_attribute("data-no-davis", "true").unwrap();
        download_link.set_inner_html("");
        download_link.append_child(&anchor).unwrap();
        
        let closure = Closure::wrap(Box::new(move || {
            web_sys::Url::revoke_object_url(&url).unwrap();
            download_link.set_inner_html("Download link expired."); // Remove expired link
        }) as Box<dyn FnMut()>);
        wasm_bindgen_futures::spawn_local(async {
            wasm_timer::Delay::new(std::time::Duration::from_secs(60)).await.unwrap();
            closure();
        });
        closure.forget();
    });
}

pub fn update_export_league(inputs: &HashMap<String, String>, update_events: Vec<String>, vm: &ViewModel) -> Option<HashMap<String, Vec<Category>>> {
    if update_events.contains(&"firstRun".to_string()) {
        let categories = vec![
            Category {
                object_stores: "players,releasedPlayers,awards".to_string(),
                name: "Players".to_string(),
                desc: "All player info, stats, ratings, and awards.".to_string(),
                checked: true,
            },
            Category {
                object_stores: "teams".to_string(),
                name: "Teams".to_string(),
                desc: "All team info and stats.".to_string(),
                checked: true,
            },
            Category {
                object_stores: "schedule,playoffSeries".to_string(),
                name: "Schedule".to_string(),
                desc: "Current regular season schedule and playoff series.".to_string(),
                checked: true,
            },
            Category {
                object_stores: "draftPicks".to_string(),
                name: "Draft Picks".to_string(),
                desc: "Traded draft picks.".to_string(),
                checked: true,
            },
            Category {
                object_stores: "trade,negotiations,gameAttributes,draftOrder,messages,events".to_string(),
                name: "Game State".to_string(),
                desc: "Interactions with the owner, current contract negotiations, current game phase, etc. Useful for saving or backing up a game, but not for creating custom rosters.".to_string(),
                checked: true,
            },
            Category {
                object_stores: "games".to_string(),
                name: "Box Scores".to_string(),
                desc: "<span class=\"text-danger\">If you've played more than a few seasons, this takes up a ton of space!</span>".to_string(),
                checked: false,
            }
        ];
        return Some(HashMap::from([("categories".to_string(), categories)]));
    }
    None
}

pub fn ui_first() {
    ui::title("Export League");
}

pub fn init() -> View {
    bbgm_view::init(ViewOptions {
        id: "exportLeague".to_string(),
        post: export_rosters,
        run_before: vec![update_export_league],
        ui_first: ui_first,
    })
}
