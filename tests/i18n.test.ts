import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Tree = { [key: string]: string | Tree };
const load = (lang: string) => JSON.parse(readFileSync(new URL(`../public/lang/${lang}.json`, import.meta.url), "utf8")) as Tree;

function flatten(tree: Tree, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();

describe("translations", () => {
  const en = flatten(load("en"));
  for (const lang of ["fr"]) {
    const other = flatten(load(lang));
    it(`${lang} has every English key`, () => {
      expect(Object.keys(en).filter((k) => !(k in other))).toEqual([]);
    });
    it(`${lang} has no unknown keys`, () => {
      expect(Object.keys(other).filter((k) => !(k in en))).toEqual([]);
    });
    it(`${lang} keeps the placeholders`, () => {
      expect(Object.keys(en).filter((k) => k in other && placeholders(en[k]!).join() !== placeholders(other[k]!).join())).toEqual([]);
    });
  }
});
