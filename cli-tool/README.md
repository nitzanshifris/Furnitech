# GLB Wizard 🎨

Interactive CLI tool for GLB model manipulation - perfect for furniture catalog management.

## Installation

```bash
cd glb-wizard
npm install
```

## Usage

```bash
node index.js
```

Or make it globally available:

```bash
npm link
glb-wizard
```

## Features

✅ **Change Color** - Recolor models to any hex color with palette presets
✅ **Targeted Color Change (IMPROVED!)** - Selectively change specific colors while keeping others unchanged
  - 📊 Automatic color clustering detection with multi-select
  - 🎨 Precise hex-based color matching
  - 💡 Brightness-based selection
  - 🧠 **Smart tolerance calculation** - automatically recommends optimal tolerance based on color distance
  - 🔍 **Preview before processing** - see how many pixels will change before committing
  - 🏷️ **Material hints** - shows likely material type (Legs/Frame vs Fabric/Surface)
  - Select multiple color groups at once (e.g., light + medium fabric, keep dark legs)
  - Perfect for changing fabric while keeping legs/frame original color
✅ **Adjust Brightness** - Make models brighter or darker
✅ **Scale to Dimensions** - Scale to real-world AR dimensions (uniform or non-uniform)
  - Choose uniform scaling (maintains proportions) or non-uniform (independent X, Y, Z)
  - Base uniform scaling on any dimension (width, height, or depth)
  - Option to refine uniform scaling with non-uniform adjustments
  - Direct dimension input (no need to calculate scale factors)
  - **NEW**: Copy dimensions from another GLB model
    - 📋 Exact copy: Match all X, Y, Z dimensions (non-uniform)
    - ⚖️ Uniform match: Match one dimension and scale proportionally
    - Perfect for creating consistent sizes across product variants
✅ **Mirror/Flip** - Create left/right versions of furniture

## Example Workflow

1. Run `node index.js`
2. Enter path to your GLB file
3. Select operation (color, brightness, scale, mirror)
4. Answer the prompts
5. Get your processed model with automatic filename

## Tips

- Hex colors must be in format: #RRGGBB
- Brightness/saturation: -50 to +50 (0 = no change)
- Scaling maintains proportions automatically
- Mirror operation auto-fixes face winding

## Requirements

- Node.js 14+
- gltf-transform
- sharp (for image processing)
