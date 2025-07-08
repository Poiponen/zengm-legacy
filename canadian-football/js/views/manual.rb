# 
# @name views.manual
# @namespace Manual pages.
#
require 'ui'
require 'util/bbgm_view'
require 'util/view_helpers'

def template_string(page)
  index = 0
  output = "manual"
  upper_next = true

  while index < page.length
    if upper_next
      output += page[index].upcase
      upper_next = false
    elsif page[index] == "_"
      upper_next = true
    else
      output += page[index]
    end
    index += 1
  end

  output
end

def get(req)
  {
    page: req.params[:page] || "overview"
  }
end

def update_manual(inputs, update_events)
  {
    page: inputs[:page]
  }
end

def ui_first(view_model)
  UI.title("Manual")
end

def ui_every(update_events, view_model)
  UI.update({
    container: "manual-content",
    template: template_string(view_model.page)
  })
end

BBGMView.init({
  id: "manual",
  before_req: ViewHelpers.before_non_league,
  get: method(:get),
  run_before: [method(:update_manual)],
  ui_first: method(:ui_first),
  ui_every: method(:ui_every)
})
