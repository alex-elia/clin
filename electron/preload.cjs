const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("clinDesktop", {
  platform: process.platform,
});

