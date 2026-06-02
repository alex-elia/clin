const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CLIN_PORT = Number(process.env.CLIN_DESKTOP_PORT || 3000);
const CLIN_HOST = "127.0.0.1";
const APP_URL = `http://${CLIN_HOST}:${CLIN_PORT}`;

let mainWindow = null;
let serverProc = null;
let isQuitting = false;

function getServerScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "desktop-app", "server.js");
  }
  return path.join(app.getAppPath(), "desktop-app", "server.js");
}

function ensureDbPath() {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "clin.db");
}

function startServer() {
  const serverScript = getServerScriptPath();
  if (!fs.existsSync(serverScript)) {
    throw new Error(
      `Missing packaged server runtime at ${serverScript}. Run desktop build first.`,
    );
  }

  const dbPath = ensureDbPath();
  serverProc = spawn(process.execPath, [serverScript], {
    cwd: path.dirname(serverScript),
    stdio: "pipe",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: CLIN_HOST,
      PORT: String(CLIN_PORT),
      CLIN_DB_PATH: dbPath,
      NODE_ENV: "production",
    },
  });

  serverProc.stdout.on("data", (buf) => {
    process.stdout.write(`[clin-server] ${buf}`);
  });
  serverProc.stderr.on("data", (buf) => {
    process.stderr.write(`[clin-server] ${buf}`);
  });

  serverProc.on("exit", (code) => {
    if (!isQuitting && code !== 0) {
      dialog.showErrorBox(
        "Clin server stopped",
        `The local Clin server exited unexpectedly (code ${code ?? "unknown"}).`,
      );
    }
  });
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  let lastError = "No response yet";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${APP_URL}/api/health`);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Server startup timeout: ${lastError}`);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(APP_URL);
}

async function bootstrap() {
  try {
    startServer();
    await waitForServer();
    createMainWindow();
  } catch (err) {
    dialog.showErrorBox(
      "Clin failed to start",
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
  }
}

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

