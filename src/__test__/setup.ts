import { vi, beforeEach } from "vitest";

function createEvent() {
  return { addListener: vi.fn() };
}

function createChromeMock() {
  return {
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      remove: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      move: vi.fn().mockResolvedValue({}),
      group: vi.fn().mockResolvedValue(1),
      onUpdated: createEvent(),
      onCreated: createEvent(),
      onMoved: createEvent(),
      onRemoved: createEvent(),
    },
    tabGroups: {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      onCreated: createEvent(),
      onUpdated: createEvent(),
      onRemoved: createEvent(),
    },
    windows: {
      getAll: vi.fn().mockResolvedValue([]),
      onCreated: createEvent(),
      onRemoved: createEvent(),
    },
    storage: {
      sync: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: createEvent(),
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: createEvent(),
      openOptionsPage: vi.fn(),
    },
    action: {
      onClicked: createEvent(),
    },
  };
}

(globalThis as any).chrome = createChromeMock();

beforeEach(() => {
  (globalThis as any).chrome = createChromeMock();
});
