;; 
;; @name views.teamStats
;; @namespace Team stats table.
;;

(ns views.team-stats
  (:require [globals :as g]
            [ui :as ui]
            [core.team :as team]
            [lib.jquery :as $]
            [lib.knockout :as ko]
            [lib.underscore :as _]
            [views.components :as components]
            [util.bbgmView :as bbgmView]
            [util.helpers :as helpers]
            [util.viewHelpers :as viewHelpers]))

(defn get [req]
  {:season (helpers/validate-season (:season (:params req)))})

(defn init-view-model []
  (let [view-model (atom {})]
    (swap! view-model assoc :season (ko/observable))
    view-model))

(def mapping
  {:teams {:create (fn [options] (:data options))}})

(defn update-teams [inputs update-events vm]
  (let [deferred (atom nil)]
    (when (or (some #(= % "dbChange") update-events)
              (and (= (:season inputs) g/season)
                   (or (some #(= % "gameSim") update-events)
                       (some #(= % "playerMovement") update-events)))
              (not= (:season inputs) @(:season vm)))
      (reset! deferred (promise))
      (team/filter
        {:attrs ["abbrev"]
         :season-attrs ["won" "lost"]
         :stats ["gp" "fg" "fga" "fgp" "tp" "tpa" "tpp" "ft" "fta" "ftp" "orb" "drb" "trb" "ast" "tov" "stl" "blk" "pf" "pts" "oppPts" "diff" "ty" "ruya" "pya" "fgAtRim" "fgaAtRim" "fgpAtRim" "inter" "ytp" "prp" "fdt" "fdp" "fdr" "turn"]
         :season (:season inputs)}
        (fn [teams]
          (deliver @deferred {:season (:season inputs) :teams teams})))
      @deferred)))

(defn ui-first [vm]
  (ko/computed
    (fn []
      (ui/title (str "Team Stats - " @(:season vm))))
    {:throttle 1})

  (ko/computed
    (fn []
      (let [season @(:season vm)]
        (ui/datatable-single-page 
          $("#team-stats") 
          2 
          (map (fn [t]
                 [(str "<a href=\"" (helpers/league-url ["roster" (:abbrev t) season]) "\">" (:abbrev t) "</a>")
                  (str (:gp t))
                  (str (:won t))
                  (str (:lost t))
                  (helpers/round (:ty t) 0)
                  (helpers/round (:prp t) 0)
                  (helpers/round (:ytp t) 1)
                  (helpers/round (:fdt t) 0)
                  (helpers/round (:turn t) 1)
                  (helpers/round (:fg t) 0)
                  (helpers/round (:fga t) 0)
                  (helpers/round (:fgp t) 1)
                  (helpers/round (:stl t) 0)
                  (helpers/round (:pya t) 1)
                  (helpers/round (:blk t) 1)
                  (helpers/round (:inter t) 1)
                  (helpers/round (:fdp t) 0)
                  (helpers/round (:tov t) 0)
                  (helpers/round (:drb t) 0)
                  (helpers/round (:ruya t) 1)
                  (helpers/round (:fdr t) 0)
                  (helpers/round (:fgAtRim t) 1)
                  (helpers/round (:fgaAtRim t) 1)
                  (helpers/round (:fgpAtRim t) 1)
                  (helpers/round (:pts t) 1)
                  (helpers/round (:oppPts t) 1)
                  (helpers/round (:diff t) 1)])
               (@(:teams vm)))
          {:fnRowCallback (fn [nRow aData]
                            ;; Show point differential in green or red for positive or negative
                            (if (> (last aData) 0)
                              (-> nRow .-childNodes (.item (dec (count aData))) .-classList (.add "text-success"))
                              (when (< (last aData) 0)
                                (-> nRow .-childNodes (.item (dec (count aData))) .-classList (.add "text-danger")))))})
        ))
    {:throttle 1})

  (ui/table-clickable-rows $("#team-stats")))

(defn ui-every [update-events vm]
  (components/dropdown "team-stats-dropdown" ["seasons"] [@(:season vm)] update-events))

(def team-stats-view
  (bbgmView/init
    {:id "teamStats"
     :get get
     :InitViewModel init-view-model
     :mapping mapping
     :runBefore [update-teams]
     :uiFirst ui-first
     :uiEvery ui-every}))
