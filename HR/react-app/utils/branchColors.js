// Stable color generator for branches
// Given a key (branch id or name), returns { bg, textColor }

const hashString = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0; // Convert to 32bit integer
    }
    return Math.abs(h);
};

export const getBranchColor = (branchKey) => {
    const key = String(branchKey || '');
    const hash = hashString(key + '::branch');

    // Golden ratio to spread colors
    const golden = 0.618033988749895;
    const fract = (hash * golden) % 1;
    const hue = Math.round(fract * 360);

    // Small variations for saturation and lightness based on hash
    const sat = 64 + (hash % 14); // 64-77
    const light = 38 + (hash % 18); // 38-55

    const bg = `hsl(${hue}, ${sat}%, ${light}%)`;
    const textColor = light > 55 ? '#111' : '#ffffff';

    return { bg, textColor, hue, sat, light };
};

export default getBranchColor;
