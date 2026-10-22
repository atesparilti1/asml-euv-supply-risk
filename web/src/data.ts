import results from "./data/results.json";

export const R = results;
export const MODULE_LABEL: Record<string, string> = { optics: "Projection optics (Zeiss)", source: "Light source (Cymer)", laser: "Drive laser (Trumpf)" };
export const SHORT_MODULE: Record<string, string> = { optics: "optics", source: "light sources", laser: "drive lasers" };
export const REPO = "https://github.com/atesparilti1/asml-euv-supply-risk";
export const DCF_SITE = "https://atesparilti1.github.io/asml-dcf-valuation/";
export const AUTHOR_SITE = "https://atesparilti.com";

/** "2 NXE light sources, 5 NXE + 1 EXE drive lasers" style description of a buffer policy. */
export function describePolicy(b: Record<string, number[]>): string {
  const parts = Object.entries(b)
    .filter(([, v]) => v[0] + v[1] > 0)
    .map(([m, [nxe, exe]]) => {
      const units = [nxe ? `${nxe} NXE` : "", exe ? `${exe} EXE` : ""].filter(Boolean).join(" + ");
      return `${units} ${SHORT_MODULE[m]}`;
    });
  return parts.length ? parts.join(", ") : "no buffer";
}
