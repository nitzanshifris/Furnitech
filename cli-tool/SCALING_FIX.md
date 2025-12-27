# Scaling Fix - Absolute vs Relative Scale

## Problem

When scaling a GLB model using the wizard, the dimensions weren't changing as expected:

```
User: Scale width to 300cm
Tool: ✓ Scaling complete!

User: Check dimensions
Tool: Dimensions: 99.0cm × 27.6cm × 64.9cm  ❌ (unchanged!)
```

## Root Cause

The scaling operation had **two major issues**:

### Issue 1: Analyzer Ignored Node Transforms

The analyzer (`lib/analyzer.js`) was reading **raw mesh vertex positions** and ignoring the node scale transform:

```javascript
// BEFORE (wrong):
const width = ((maxX - minX) * 100).toFixed(1);  // Only raw mesh size
```

This meant it was showing the unscaled geometry dimensions, not the actual AR-visible dimensions.

### Issue 2: Relative vs Absolute Scaling

The scale operation was applying a **relative multiplier** instead of setting an **absolute scale**:

```javascript
// BEFORE (wrong):
const scaleFactor = targetDimension / currentValue;  // 300 / 99 = 3.03x
node.setScale([currentScale[0] * scaleFactor, ...]);  // Multiply existing scale

// Problem:
// - Original model: rawWidth=0.99m, nodeScale=3.03 → displays as 99cm ✓
// - User scales to 300cm: scaleFactor = 300/99 = 3.03x
// - New nodeScale = 3.03 * 3.03 = 9.18 → displays as 909cm ❌ (3x too large!)
```

The tool was **multiplying** the scale instead of **replacing** it.

## Solution

### Fix 1: Analyzer Accounts for Node Scale

Updated `lib/analyzer.js` to apply node transforms when calculating dimensions:

```javascript
// Get root node scale (this is what AR sees!)
let scaleX = 1, scaleY = 1, scaleZ = 1;
const rootNodes = defaultScene.listChildren();
if (rootNodes.length > 0) {
    const rootScale = rootNodes[0].getScale();
    scaleX = Math.abs(rootScale[0]);
    scaleY = Math.abs(rootScale[1]);
    scaleZ = Math.abs(rootScale[2]);
}

// Apply scale to dimensions
const width = ((maxX - minX) * scaleX * 100).toFixed(1);  // ✓ Includes transform
```

### Fix 2: Absolute Scale Calculation

Updated `lib/operations/scale.js` to calculate and **set** absolute scale:

```javascript
// Return both scaled AND raw dimensions from analyzer
return {
    width: 99.0,      // Displayed dimension (with scale)
    height: 27.6,
    depth: 64.9,
    rawWidth: 0.99,   // Raw mesh dimension (no scale)
    rawHeight: 0.276,
    rawDepth: 0.649,
    currentScale: { x: 3.03, y: 3.03, z: 3.03 }
};

// Calculate absolute scale needed
const targetMeters = 300 / 100;  // 3.0 meters
const absoluteScale = targetMeters / rawWidth;  // 3.0 / 0.99 = 3.03

// SET scale (not multiply)
node.setScale([
    signX * absoluteScale,  // ✓ Replace with absolute value
    signY * absoluteScale,
    signZ * absoluteScale
]);
```

**Key difference:**
- **BEFORE**: `newScale = oldScale × multiplier` (relative)
- **AFTER**: `newScale = targetSize / rawSize` (absolute)

### Fix 3: Preserve Sign for Mirrored Models

Some models use negative scale for mirroring (e.g., `-3.03` for X-axis flip):

```javascript
// Preserve sign (for mirrored models)
const signX = currentScale[0] < 0 ? -1 : 1;
const signY = currentScale[1] < 0 ? -1 : 1;
const signZ = currentScale[2] < 0 ? -1 : 1;

node.setScale([
    signX * absoluteScale,  // Keeps negative if originally negative
    signY * absoluteScale,
    signZ * absoluteScale
]);
```

## Result

Now the scaling works correctly:

```
📏 Current dimensions: 99.0cm × 27.6cm × 64.9cm
? Target width: 300cm

⚡ Absolute scale: 3.0303
   Result: 300.0cm × 83.6cm × 196.7cm

✔ Scaling complete!

📊 Verify:
   Dimensions: 300.0cm × 83.6cm × 196.7cm  ✅ (correct!)
```

## Files Modified

1. **`lib/analyzer.js`**
   - Added node scale reading (lines 21-31)
   - Applied scale to dimension calculations (line 57-59)
   - Return raw dimensions and current scale (lines 61-78)

2. **`lib/operations/scale.js`**
   - Calculate absolute scale from raw dimensions (lines 60-70)
   - Use absolute scale for non-uniform adjustments (lines 118-121, 155-158)
   - SET scale instead of multiplying (lines 201-206)
   - Preserve sign for mirrored models (lines 196-199)

## Technical Details

**Why this matters for AR:**

iPhone Quick Look (and Android Scene Viewer) **ignore** the `ar-scale` attribute in model-viewer. They only respect the **actual node scale** in the GLB file.

So when we scale a model for AR:
- ❌ Setting `<model-viewer ar-scale="300">` → ignored by iOS
- ✅ Setting `node.scale = [3.03, 3.03, 3.03]` → works everywhere

This is why we need to modify the GLB file itself, and why getting the scale calculation right is critical for AR applications.
