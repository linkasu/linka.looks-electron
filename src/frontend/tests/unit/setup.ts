const mocks = vi.hoisted(() => ({
  electron: {
    app: {
      isPackaged: false,
      getPath: vi.fn(() => "/tmp/linka-look-tests")
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => null)
    },
    dialog: {
      showOpenDialog: vi.fn(),
      showErrorBox: vi.fn()
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn()
    },
    ipcRenderer: {
      invoke: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn(),
      send: vi.fn()
    },
    shell: {
      showItemInFolder: vi.fn(),
      trashItem: vi.fn(() => Promise.resolve())
    }
  },
  electronStoreData: new Map<string, unknown>()
}));

vi.mock("electron", () => mocks.electron);

vi.mock("electron-store", () => ({
  default: class Store {
    static initRenderer = vi.fn();

    get = vi.fn((key: string, defaultValue?: unknown) => {
      return mocks.electronStoreData.has(key) ? mocks.electronStoreData.get(key) : defaultValue;
    });

    set = vi.fn((key: string, value: unknown) => {
      mocks.electronStoreData.set(key, value);
    });

    has = vi.fn((key: string) => mocks.electronStoreData.has(key));

    delete = vi.fn((key: string) => {
      mocks.electronStoreData.delete(key);
    });
  }
}));

class MockAudio {
  currentTime = 0;
  oncanplay: (() => void | Promise<void>) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onpause: (() => void) | null = null;
  pause = vi.fn(() => {
    this.onpause?.();
  });
  play = vi.fn(() => Promise.resolve());
  src = "";
}

vi.stubGlobal("Audio", MockAudio);

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:unit-test");
}

beforeEach(() => {
  mocks.electronStoreData.clear();
  vi.clearAllMocks();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:unit-test");
});

afterEach(() => {
  vi.restoreAllMocks();
});
