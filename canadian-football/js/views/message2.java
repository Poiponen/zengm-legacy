/**
 * @name views.message
 * @namespace View a single message.
 */
import java.util.concurrent.CompletableFuture;

public class MessageView {
    
    public static MessageRequest get(Request req) {
        return new MessageRequest(req.getParams().get("mid") != null ? Integer.parseInt(req.getParams().get("mid")) : null);
    }

    public static CompletableFuture<MessageResponse> updateMessage(MessageInputs inputs, List<String> updateEvents, ViewModel vm) {
        CompletableFuture<MessageResponse> deferred = new CompletableFuture<>();
        Map<String, Object> vars = new HashMap<>();

        if (updateEvents.contains("dbChange") || updateEvents.contains("firstRun") || !vm.getMessage().getMid().equals(inputs.getMid())) {
            Transaction tx = Globals.getDb().transaction("messages", "readwrite");

            // If mid is null, this will open the message with the highest mid
            tx.objectStore("messages").openCursor(inputs.getMid(), "prev").onsuccess = event -> {
                Cursor cursor = event.getTarget().getResult();
                Message message = cursor.getValue();

                if (!message.isRead()) {
                    message.setRead(true);
                    cursor.update(message);

                    tx.oncomplete = () -> {
                        Database.setGameAttributes(Map.of("lastDbChange", System.currentTimeMillis()), () -> {
                            if (Globals.isGameOver()) {
                                UI.updateStatus("You're fired!");
                            }

                            UI.updatePlayMenu(null, () -> {
                                vars.put("message", message);
                                deferred.complete(new MessageResponse(vars));
                            });
                        });
                    };
                } else {
                    vars.put("message", message);
                    deferred.complete(new MessageResponse(vars));
                }
            };

            return deferred;
        }
        return CompletableFuture.completedFuture(null);
    }

    public static void uiFirst(ViewModel vm) {
        new Computed(() -> UI.title("Message From " + vm.getMessage().getFrom())).extend(new Throttle(1));
    }
}
