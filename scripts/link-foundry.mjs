// Symlinks dist/ into a Foundry user-data folder as Data/systems/gloomfoundry.
// Usage: npm run link -- /path/to/FoundryVTT        (the folder that contains Data/)
//    or set FOUNDRY_DATA, or write {"dataPath": "..."} to foundry.config.json (git-ignored).
import { existsSync, lstatSync, readFileSync, symlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configFile = join(root, "foundry.config.json");
const fromConfig = existsSync(configFile) ? JSON.parse(readFileSync(configFile, "utf8")).dataPath : undefined;
const dataPath = process.argv[2] ?? process.env.FOUNDRY_DATA ?? fromConfig;

if (!dataPath) {
  console.error("Missing Foundry user-data path. Pass it as an argument, set FOUNDRY_DATA, or create foundry.config.json.");
  process.exit(1);
}

const systems = join(resolve(dataPath), "Data", "systems");
const target = join(systems, "gloomfoundry");
const source = join(root, "dist");
mkdirSync(source, { recursive: true });
mkdirSync(systems, { recursive: true });

if (existsSync(target) || (() => { try { return lstatSync(target).isSymbolicLink(); } catch { return false; } })()) {
  console.log(`Already exists: ${target} (remove it first to relink)`);
} else {
  symlinkSync(source, target, "dir");
  console.log(`Linked ${target} -> ${source}`);
}
if (!fromConfig) writeFileSync(configFile, JSON.stringify({ dataPath: resolve(dataPath) }, null, 2) + "\n");
