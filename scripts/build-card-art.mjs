// Generates simple, original SVG faces for modifier cards into public/assets/cards/.
// File names must match `faceKey()` in src/module/rules/modifier.ts.
// These are placeholders: drop scanned/official art with the same names to replace them.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "public", "assets", "cards");
mkdirSync(OUT, { recursive: true });

const W = 250, H = 350;
const C = { parchment: "#f3e6c9", border: "#5b3a1a", ink: "#2b1d10", gold: "#d9a441", grey: "#8c7a64",
  green: "#2e8b57", red: "#c0392b", purple: "#7d4fa3", dark: "#3a2a1a", bless: "#e0b84a", curse: "#6c3483" };

const hexPoints = (cx, cy, r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");

function card({ circle, label, attr, border = C.border, tag = "" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="18" fill="${C.parchment}" stroke="${border}" stroke-width="8"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="10" fill="none" stroke="${border}" stroke-opacity="0.35" stroke-width="2"/>
  ${tag ? `<text x="${W / 2}" y="62" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="bold" fill="${border}">${tag}</text>` : ""}
  <circle cx="${W / 2}" cy="${H / 2}" r="72" fill="${circle}" stroke="${C.ink}" stroke-opacity="0.4" stroke-width="6"/>
  <text x="${W / 2}" y="${H / 2 + 24}" text-anchor="middle" font-family="Georgia, serif" font-size="68" font-weight="bold" fill="white">${label}</text>
  ${attr ? `<polygon points="${hexPoints(W - 52, H - 52, 30)}" fill="${C.gold}" stroke="${C.ink}" stroke-opacity="0.5" stroke-width="3"/>
  <text x="${W - 52}" y="${H - 40}" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="bold" fill="${C.ink}">${attr}</text>` : ""}
</svg>
`;
}

const write = (key, svg) => writeFileSync(join(OUT, `${key}.svg`), svg);
let n = 0;

// Numeric cards: attack -3..+4 (perks go beyond the base -2..+2), attribute 0..6 (0 = none).
for (let atk = -3; atk <= 4; atk++) {
  for (let attr = 0; attr <= 6; attr++) {
    const key = `atk-${atk >= 0 ? "p" : "m"}${Math.abs(atk)}-attr${attr}`;
    const circle = atk > 0 ? C.green : atk < 0 ? C.red : C.grey;
    write(key, card({ circle, label: atk >= 0 ? `+${atk}` : `${atk}`, attr }));
    n++;
  }
}
write("critical", card({ circle: C.purple, label: "×2" }));
write("null", card({ circle: C.dark, label: "Ø" }));
// Perk cards can be Critical/Null with an attribute value (e.g. a "×2 / 4" card).
for (let attr = 1; attr <= 6; attr++) {
  write(`critical-attr${attr}`, card({ circle: C.purple, label: "×2", attr }));
  write(`null-attr${attr}`, card({ circle: C.dark, label: "Ø", attr }));
  n += 2;
}
write("bless", card({ circle: C.purple, label: "×2", border: C.bless, tag: "BLESS" }));
write("curse", card({ circle: C.dark, label: "Ø", border: C.curse, tag: "CURSE" }));
write("back", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="18" fill="${C.border}" stroke="${C.ink}" stroke-width="8"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="10" fill="none" stroke="${C.gold}" stroke-width="4"/>
  <polygon points="${hexPoints(W / 2, H / 2, 60)}" fill="none" stroke="${C.gold}" stroke-width="6"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="28" fill="${C.gold}"/>
</svg>
`);
console.log(`Wrote ${n + 5} card faces to ${OUT}`);
