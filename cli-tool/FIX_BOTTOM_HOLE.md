# Fix Bottom Hole in GLB Models

## Problem

AI-generated 3D models (from Trellis/Replicate) often have **holes in the bottom** because they're generated from 2D images (front, side views) and the AI doesn't "see" the bottom of the furniture.

**Result**: When viewing the model from below, you can see through it (black hole).

## Solution

Created a Blender script that:

1. **Removes duplicate vertices** (23,246 duplicates found)
2. **Selects bottom vertices** (lowest 5% in Y-axis)
3. **Fills holes** by creating faces between open edges
4. **Recalculates normals** to face outward correctly
5. **Exports clean GLB**

## Usage

### Script 1: Basic Hole Fixing (fix_bottom_hole.py)

Automatically detects and fills any holes in the mesh:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python fix_bottom_hole.py -- \
  input.glb output.glb
```

### Script 2: Bottom Closing (close_bottom.py)

Specifically targets the bottom of the model:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python close_bottom.py -- \
  input.glb output-closed.glb
```

## Example

```bash
# Original model has hole in bottom
input: Untitled.1glb.glb (4.8 MB)

# Run fix
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python close_bottom.py -- \
  "Untitled.1glb.glb" "Untitled.1glb-closed.glb"

# Output:
   Info: Removed 23246 vertices (duplicates)
   Selected 821 bottom vertices
   ✓ Closed bottom

output: Untitled.1glb-closed.glb (4.8 MB) ✅
```

## What Each Script Does

### fix_bottom_hole.py

1. Import GLB
2. Remove duplicate vertices (merge by distance)
3. Recalculate normals (face outward)
4. **Select non-manifold edges** (open boundaries)
5. **Fill holes** with `edge_face_add()`
6. Export GLB

**Best for**: General hole fixing anywhere in the model

### close_bottom.py

1. Import GLB
2. Remove duplicate vertices
3. Calculate bounding box
4. **Select bottom vertices** (lowest 5% of height)
5. **Fill bottom** by connecting edges
6. Recalculate normals
7. Export GLB

**Best for**: Specifically closing the bottom of furniture

## Technical Details

**Why holes exist:**
- AI generates 3D from 2D images (front, side, back)
- Bottom is not visible in training images
- Model has open edges at bottom perimeter

**How filling works:**
- Blender detects boundary edges (edges with only 1 face)
- `edge_face_add()` creates faces to close loops
- Normals are recalculated to face outward

**Mesh cleaning:**
- Removes duplicate vertices (threshold: 0.0001 units)
- Makes normals consistent (all face same direction)
- Preserves UVs, materials, and textures

## Files Created

- **`fix_bottom_hole.py`** - General hole fixer
- **`close_bottom.py`** - Bottom-specific closer
- **`Untitled.1glb-fixed.glb`** - Result from fix_bottom_hole
- **`Untitled.1glb-closed.glb`** - Result from close_bottom ✅

## Result

✅ **`Untitled.1glb-closed.glb`** is now ready to use with no visible holes!

The model:
- Has a closed bottom
- Proper normals (faces outward)
- No duplicate vertices
- Same textures and materials
- Same file size (~4.8 MB)

You can now use this model in AR viewers, 3D viewers, or any application without the bottom hole being visible.
