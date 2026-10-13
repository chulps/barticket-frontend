/** Keep creator labels compact on mobile without changing the underlying identity. */
export function creatorDisplayName(name: string, maxLength = 7): string {
    const characters = Array.from(name);
    if (characters.length <= maxLength) return name;
    if (maxLength <= 1) return "…";
    return characters.slice(0, maxLength - 1).join("") + "…";
}
