#lang racket

;; Manual pages.
(define (template-string page)
  (define output "manual")
  (define upper-next #t)

  (for ([i (in-range (string-length page))])
    (define char (string-ref page i))
    (cond
      [(equal? upper-next #t)
       (set! output (string-append output (string-upcase char)))
       (set! upper-next #f)]
      [(equal? char #\_)
       (set! upper-next #t)]
      [else
       (set! output (string-append output (string char)))]))

  output)

(define (get req)
  (hash 'page (if (hash-ref req 'params 'page) 
                  (hash-ref req 'params 'page) 
                  "overview")))

(define (update-manual inputs update-events)
  (hash 'page (hash-ref inputs 'page)))

(define (ui-first vm)
  (ui-title "Manual"))

(define (ui-every update-events vm)
  (ui-update (hash 'container "manual-content"
                   'template (template-string (vm-page vm)))))

(define bbgm-view
  (bbgm-view-init
   (hash 'id "manual"
         'before-req view-helpers-before-non-league
         'get get
         'run-before (list update-manual)
         'ui-first ui-first
         'ui-every ui-every)))
