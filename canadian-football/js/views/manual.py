# /**
#  * @name views.manual
#  * @namespace Manual pages.
#  */
def template_string(page):
    output = "manual"
    upper_next = True

    for char in page:
        if upper_next:
            output += char.upper()
            upper_next = False
        elif char == "_":
            upper_next = True
        else:
            output += char

    return output

def get(req):
    return {
        "page": req.params.page if req.params.page is not None else "overview"
    }

def update_manual(inputs, update_events):
    return {
        "page": inputs.page
    }

def ui_first(vm):
    ui.title("Manual")

def ui_every(update_events, vm):
    ui.update({
        "container": "manual-content",
        "template": template_string(vm.page())
    })

return bbgmView.init({
    "id": "manual",
    "beforeReq": viewHelpers.beforeNonLeague,
    "get": get,
    "runBefore": [update_manual],
    "uiFirst": ui_first,
    "uiEvery": ui_every
})
