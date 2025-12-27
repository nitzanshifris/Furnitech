#!/usr/bin/env python3
"""
Fix hole in bottom of GLB model by filling open edges.

This script:
1. Imports the GLB
2. Selects all open edges/boundaries
3. Fills holes
4. Exports back to GLB

Usage:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python fix_bottom_hole.py -- <input.glb> <output.glb>
"""

import bpy
import sys
import os

def fix_bottom_hole(input_path, output_path):
    """Fix holes in GLB model."""

    print(f"📦 Loading: {input_path}")

    # Clear scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    # Import GLB
    bpy.ops.import_scene.gltf(filepath=input_path)

    # Get all mesh objects
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']

    if not mesh_objects:
        print("❌ No mesh objects found!")
        return False

    print(f"🔧 Processing {len(mesh_objects)} mesh(es)...")

    for obj in mesh_objects:
        print(f"\n   Processing: {obj.name}")

        # Select and make active
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        # Enter edit mode
        bpy.ops.object.mode_set(mode='EDIT')

        # Select all
        bpy.ops.mesh.select_all(action='SELECT')

        # Remove doubles (merge vertices that are very close)
        bpy.ops.mesh.remove_doubles(threshold=0.0001)

        # Select all again
        bpy.ops.mesh.select_all(action='SELECT')

        # Recalculate normals (make them consistent)
        bpy.ops.mesh.normals_make_consistent(inside=False)

        # Deselect all
        bpy.ops.mesh.select_all(action='DESELECT')

        # Select non-manifold edges (boundaries/holes)
        bpy.ops.mesh.select_non_manifold(
            extend=False,
            use_wire=False,
            use_boundary=True,  # Select open edges
            use_multi_face=False,
            use_non_contiguous=False,
            use_verts=False
        )

        # Count selected edges
        bpy.ops.object.mode_set(mode='OBJECT')
        selected_edges = sum(1 for e in obj.data.edges if e.select)

        if selected_edges > 0:
            print(f"   Found {selected_edges} boundary edges (holes)")

            # Back to edit mode
            bpy.ops.object.mode_set(mode='EDIT')

            # Fill holes
            bpy.ops.mesh.edge_face_add()

            # Recalculate normals again
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.normals_make_consistent(inside=False)

            print(f"   ✓ Filled holes")
        else:
            print(f"   ✓ No holes found (already closed)")

        # Return to object mode
        bpy.ops.object.mode_set(mode='OBJECT')

    print(f"\n💾 Saving: {output_path}")

    # Export GLB
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False
    )

    print("✅ Complete!")
    return True

def main():
    """Main entry point."""
    # Get arguments after "--"
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        print("Usage: blender --background --python fix_bottom_hole.py -- <input.glb> <output.glb>")
        return

    if len(argv) < 2:
        print("Error: Need input and output file paths")
        print("Usage: blender --background --python fix_bottom_hole.py -- <input.glb> <output.glb>")
        return

    input_path = argv[0]
    output_path = argv[1]

    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return

    fix_bottom_hole(input_path, output_path)

if __name__ == "__main__":
    main()
