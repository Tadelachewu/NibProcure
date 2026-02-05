
type EventHandler = (data: any) => void;

class EventBus {
  private listeners: Record<string, EventHandler[]> = {};

  on(event: string, callback: EventHandler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event: string, callback: EventHandler) {
    if (!this.listeners[event]) return;

    this.listeners[event] = this.listeners[event].filter(
      (listener) => listener !== callback
    );
  }

  emit(event: string, data: any) {
    if (!this.listeners[event]) return;

    this.listeners[event].forEach((listener) => listener(data));
  }
}

export const workflowEventBus = new EventBus();
