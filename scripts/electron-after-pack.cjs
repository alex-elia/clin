const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * macOS codesign rejects symlinks in the app bundle that resolve outside it.
 * Next standalone can leave traced native deps as symlinks; flatten any that
 * survive packaging before signing.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const desktopAppPath = path.join(appPath, "Contents", "Resources", "desktop-app");

  try {
    await fs.access(desktopAppPath);
  } catch {
    return;
  }

  await flattenSymlinks(desktopAppPath, appPath);
};

async function flattenSymlinks(dir, appPath) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await fs.readlink(fullPath);
      const resolved = path.resolve(path.dirname(fullPath), target);
      const outsideBundle =
        resolved !== appPath &&
        !resolved.startsWith(`${appPath}${path.sep}`);

      if (!outsideBundle) continue;

      const stat = await fs.stat(resolved);
      await fs.rm(fullPath);
      if (stat.isDirectory()) {
        await fs.cp(resolved, fullPath, { recursive: true, force: true, dereference: true });
        await flattenSymlinks(fullPath, appPath);
      } else {
        await fs.copyFile(resolved, fullPath);
      }
      console.log(`[desktop] Flattened external symlink: ${fullPath}`);
      continue;
    }

    if (entry.isDirectory()) {
      await flattenSymlinks(fullPath, appPath);
    }
  }
}
