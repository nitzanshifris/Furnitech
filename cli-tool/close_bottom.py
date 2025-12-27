#!/usr/bin/env python3
"""
Close the bottom of furniture model by adding a solid base plane.

This ensures there are no visible holes when viewing from below.

Usage:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python close_bottom.py -- <input.glb> <output.glb>
"""

import bpy
import sys
import os
import mathutils

def close_bottom(input_path, output_path):
    """Add a solid bottom plane to close the model."""

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

        # Get bounding box
        bbox = [obj.matrix_world @ mathutils.Vector(corner) for corner in obj.bound_box]

        min_x = min(v.x for v in bbox)
        max_x = max(v.x for v in bbox)
        min_y = min(v.y for v in bbox)
        min_z = min(v.z for v in bbox)
        max_z = max(v.z for v in bbox)

        print(f"   Bounds: X[{min_x:.3f}, {max_x:.3f}] Y[{min_y:.3f}] Z[{min_z:.3f}, {max_z:.3f}]")

        # Enter edit mode
        bpy.ops.object.mode_set(mode='EDIT')

        # Clean up first
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=0.0001)
        bpy.ops.mesh.normals_make_consistent(inside=False)

        # Select bottom vertices (lowest 10% in Y)
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')

        threshold_y = min_y + (max_x - min_x) * 0.05  # 5% of width

        bottom_verts = []
        for v in obj.data.vertices:
            world_co = obj.matrix_world @ v.co
            if world_co.y <= threshold_y:
                v.select = True
                bottom_verts.append(v)

        print(f"   Selected {len(bottom_verts)} bottom vertices")

        bpy.ops.object.mode_set(mode='EDIT')

        if len(bottom_verts) > 0:
            # Fill bottom
            bpy.ops.mesh.edge_face_add()

            # Select all and recalculate normals
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.normals_make_consistent(inside=False)

            print(f"   ✓ Closed bottom")
        else:
            print(f"   ⚠️  No bottom vertices found")

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
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        print("Usage: blender --background --python close_bottom.py -- <input.glb> <output.glb>")
        return

    if len(argv) < 2:
        print("Error: Need input and output file paths")
        return

    input_path = argv[0]
    output_path = argv[1]

    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return

    close_bottom(input_path, output_path)

if __name__ == "__main__":
    main()
