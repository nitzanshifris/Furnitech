# Targeted Color Change - Improvements

## Summary

Based on Gemini's insights about PBR masking and best practices, we've implemented three key improvements to the Targeted Color Change tool to make it easier to get perfect results.

## Problem Identified

**Root Cause**: AI-generated GLB models (from Trellis/Replicate) don't have `metallicRoughnessTexture` data, which would provide a perfect mask for separating materials like fabric from metal legs.

**Result**: We must use "best guess" heuristics (color clustering, brightness thresholds) instead of semantic material information.

## Improvements Implemented

### 1. **Smart Tolerance Calculation** ✅

**Problem**: Fixed tolerance (20) doesn't account for how close/far apart the color groups are.

**Solution**: Calculate recommended tolerance based on actual color distance between selected and unselected groups.

```javascript
function calculateRecommendedTolerance(selectedGroups, unselectedGroups, colorGroups) {
    // Find minimum distance between selected and unselected groups
    let minDistance = Infinity;

    for (const selectedIdx of selectedGroups) {
        for (const unselectedIdx of unselectedGroups) {
            const dist = colorDistance(selected.color, unselected.color);
            minDistance = Math.min(minDistance, dist);
        }
    }

    // Use 40% of the color gap as tolerance
    const normalizedGap = (minDistance / maxDistance) * 100;
    const recommendedTolerance = Math.max(10, Math.min(30, normalizedGap * 0.4));

    return Math.round(recommendedTolerance);
}
```

**User Experience**:
```
⚡ Recommended tolerance: 14
   (Calculated based on color distance between your selected and unselected groups)

? Color matching tolerance (0-100, lower = more precise): (14)
```

**Benefits**:
- If groups are far apart (e.g., black legs vs light fabric) → suggests higher tolerance (safe)
- If groups are close (e.g., dark brown vs black) → suggests lower tolerance (precise)
- User can still override if needed

---

### 2. **Preview Before Processing** ✅

**Problem**: No way to know if settings are correct before processing (which takes time).

**Solution**: Simulate the transformation to show exactly how many pixels will change.

```javascript
async function simulateTransformation(imageData, selectionCriteria) {
    // Loop through all pixels and count matches WITHOUT applying transformation
    let matchedPixels = 0;
    let totalPixels = data.length / 3;

    for (let i = 0; i < data.length; i += 3) {
        if (pixelMatchesCriteria(...)) {
            matchedPixels++;
        }
    }

    return { matchedPixels, matchedPercent, unmatchedPixels, unmatchedPercent };
}
```

**User Experience**:
```
🔍 Preview
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔ Preview ready

   ✓ Will change: 245,382 pixels (87.3%)
   • Keep unchanged: 35,618 pixels (12.7%)
   • Total pixels: 281,000

? Does this look right? Proceed with transformation? (Y/n)
```

**Benefits**:
- Catch mistakes BEFORE processing (e.g., if 98% would change, tolerance is too high)
- Fast feedback loop (simulation is much faster than full transformation)
- User can cancel and adjust settings without wasting time

---

### 3. **Material Type Hints** ✅

**Problem**: User has to guess which groups are legs vs fabric based only on hex codes and brightness numbers.

**Solution**: Show likely material type based on brightness heuristics.

```javascript
const likelyMaterial = group.brightness < 40
    ? '(Likely: Legs/Frame/Shadows)'
    : '(Likely: Fabric/Surface)';
```

**User Experience**:
```
📊 Detected Color Groups:

  1. Dark - #100800 (Likely: Legs/Frame/Shadows)
     Coverage: 12.3% of texture
     Brightness: 8/255

  2. Medium - #392306 (Likely: Fabric/Surface)
     Coverage: 44.5% of texture
     Brightness: 33/255

  3. Light - #623e11 (Likely: Fabric/Surface)
     Coverage: 43.2% of texture
     Brightness: 59/255
```

**Benefits**:
- Easier to understand what each group represents
- Reduces user error (less likely to accidentally select legs)
- Makes the tool more intuitive for non-technical users

---

## Complete Workflow Example

```bash
cd glb-wizard
node index.js

# Select: Groove_camel.glb
# Choose: 🎯 Targeted color change

📊 Detected Color Groups:

  1. Dark - #100800 (Likely: Legs/Frame/Shadows)
     Coverage: 12.3%
     Brightness: 8/255

  2. Medium - #392306 (Likely: Fabric/Surface)
     Coverage: 44.5%
     Brightness: 33/255

  3. Light - #623e11 (Likely: Fabric/Surface)
     Coverage: 43.2%
     Brightness: 59/255

? How do you want to select which colors to change?
  📊 Pick from detected groups (recommended)

? Which color groups to change?
  ◯ Dark #100800 (Likely: Legs/Frame/Shadows) (12.3%)
  ◉ Medium #392306 (Likely: Fabric/Surface) (44.5%)
  ◉ Light #623e11 (Likely: Fabric/Surface) (43.2%)

⚡ Recommended tolerance: 14
   (Calculated based on color distance between selected and unselected groups)

? Color matching tolerance (0-100): (14)

🔍 Preview
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ✓ Will change: 245,382 pixels (87.3%)
   • Keep unchanged: 35,618 pixels (12.7%)

? Does this look right? Proceed with transformation? Yes

? Replace with color (hex): #f6efe5
? Transformation mode: ✨ Smart Replace

✔ Targeted color change complete!
```

---

## Why No PBR Masking?

Gemini's chat mentioned the industry-standard approach: using the `metallicRoughnessTexture` as a perfect mask.

**We checked your models**:
```
✅ baseColorTexture: YES (color)
❌ metallicRoughnessTexture: NO (would be perfect mask)
❌ normalTexture: NO
❌ occlusionTexture: NO
```

**Conclusion**: AI-generated models are "baked" with only a color texture. PBR masking is not possible.

---

## Future Enhancements

If you ever get professional models with PBR data, we could add:

```javascript
// Detect if PBR data exists
const metallicTexture = material.getMetallicRoughnessTexture();

if (metallicTexture) {
    console.log('✅ Found metallic/roughness map!');

    // TIER 1: Use metallic channel as perfect mask (100% accurate)
    // - Black = fabric (change)
    // - White = metal (keep)

} else {
    // TIER 2: Use our clustering/brightness approach (best guess)
}
```

But for now, the clustering approach with these three improvements is the best solution available.

---

## Files Modified

1. **`lib/color-analyzer.js`**
   - Added `calculateRecommendedTolerance()` function
   - Added `simulateTransformation()` function
   - Exported new functions

2. **`lib/operations/targeted-color.js`**
   - Import new functions
   - Show material type hints in color group display
   - Calculate and show recommended tolerance
   - Add preview step with confirmation before processing
   - Fixed duplicate `unselectedGroups` declaration

---

## Result

The tool is now significantly easier to use and more likely to produce perfect results on the first try!
