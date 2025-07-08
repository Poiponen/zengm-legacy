;; Export rosters namespace
(ns views.export-rosters
  (:require [globals :as g]
            [ui :as ui]
            [core.league :as league]
            [lib.jquery :as $]
            [util.bbgm-view :as bbgm-view]
            [util.helpers :as helpers]
            [util.view-helpers :as view-helpers]))

(defn post [req]
  (let [download-link (js/document.getElementById "download-link")
        object-stores (clojure.string/split (clojure.string/join "," (:objectStores (:params req))) #",")]
    (set! (.-innerHTML download-link) "Generating...")
    (league/export_ object-stores
      (fn [data]
        (let [json (js/JSON.stringify data nil 2)
              blob (js/Blob. (array json) #js {"type" "application/json"})
              url (.. js/window -URL (createObjectURL blob))
              file-name (if (some? (:meta data)) (:name (:meta data)) "League")
              anchor (doto (js/document.createElement "a")
                        (set! (.-download %) (str "CFL - " file-name ".json"))
                        (set! (.-href %) url)
                        (set! (.-textContent %) "Download Exported League File")
                        (set! (.-dataset.noDavis %) "true"))]
          (set! (.-innerHTML download-link) "")
          (.appendChild download-link anchor)
          (js/setTimeout (fn []
                           (.. js/window -URL (revokeObjectURL url))
                           (set! (.-innerHTML download-link) "Download link expired.")) 
                         (* 60 1000)))))))

(defn update-export-league [inputs update-events vm]
  (when (some #(= % "firstRun") update-events)
    (let [categories [{:objectStores "players,releasedPlayers,awards"
                       :name "Players"
                       :desc "All player info, stats, ratings, and awards."
                       :checked true}
                      {:objectStores "teams"
                       :name "Teams"
                       :desc "All team info and stats."
                       :checked true}
                      {:objectStores "schedule,playoffSeries"
                       :name "Schedule"
                       :desc "Current regular season schedule and playoff series."
                       :checked true}
                      {:objectStores "draftPicks"
                       :name "Draft Picks"
                       :desc "Traded draft picks."
                       :checked true}
                      {:objectStores "trade,negotiations,gameAttributes,draftOrder,messages,events"
                       :name "Game State"
                       :desc "Interactions with the owner, current contract negotiations, current game phase, etc. Useful for saving or backing up a game, but not for creating custom rosters."
                       :checked true}
                      {:objectStores "games"
                       :name "Box Scores"
                       :desc "<span class=\"text-danger\">If you've played more than a few seasons, this takes up a ton of space!</span>"
                       :checked false}]]
      {:categories categories})))

(defn ui-first []
  (ui/title "Export League"))

(def export-league (bbgm-view/init {:id "exportLeague"
                                     :post post
                                     :runBefore [update-export-league]
                                     :uiFirst ui-first}))
