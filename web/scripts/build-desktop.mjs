import { spawn } from "node:child_process";
import path from "node:path";

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    CLIN_DESKTOP_STANDALONE: "1",
  },
});

child.on("exit", (code, signal) => {
  if (typeof code === "number") process.exit(code);
  process.exit(signal ? 1 : 0);
});

