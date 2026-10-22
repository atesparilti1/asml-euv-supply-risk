export const eur = (x: number, d = 0) => `€${x.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const eurM = (x: number, d = 0) => `${x < 0 ? "−" : ""}€${Math.abs(x).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d })}m`;
export const signedM = (x: number, d = 0) => `${x >= 0 ? "+" : "−"}€${Math.abs(x).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d })}m`;
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const num = (x: number, d = 0) => {
  const r = Number(x.toFixed(d));
  return (r === 0 ? 0 : r).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const MONTHS = Array.from({ length: 48 }, (_, t) =>
  `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t % 12]} ${2027 + Math.floor(t / 12)}`);
