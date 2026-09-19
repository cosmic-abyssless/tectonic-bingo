/** 1,250 */
export const formatPoints = (n: number): string => n.toLocaleString();

/** +15, −5 (a real minus sign), 0. */
export const formatSigned = (n: number): string => (n === 0 ? "0" : `${n > 0 ? "+" : "\u2212"}${Math.abs(n).toLocaleString()}`);
