/* Small, browser-free array helpers shared by the shell and lazy features. */
export function setEq<T>(a: ArrayLike<T>, b: ArrayLike<T>) { if (a.length !== b.length)
    return false; for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i])
        return false; return true; }
export function isSubset<T>(a: readonly T[], b: readonly T[]) { return a.every((x) => b.includes(x)); }
export function randItem<T>(a: ArrayLike<T>) { return a[Math.floor(Math.random() * a.length)]; }
export function shuffle<T>(src: readonly T[]) { const a = src.slice(); for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
