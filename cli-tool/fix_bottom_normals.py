#!/usr/bin/env python3
"""
Fix bottom face normals (faces pointing inward instead of outward).

When faces point inward, they appear invisible/black from outside,
creating the appearance of a "hole".

Usage:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python fix_bottom_normals.py -- <input.glb> <output.glb>
"""

import bpy
import sys
import os
import mathutils

def fix_bottom_normals(input_path, output_path):
    """Fix normals on bottom faces."""

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
        min_y = min(v.y for v in bbox)
        max_y = max(v.y for v in bbox)

        print(f"   Y bounds: [{min_y:.3f}, {max_y:.3f}]")

        # Enter edit mode
        bpy.ops.object.mode_set(mode='EDIT')

        # Step 1: Clean geometry
        print(f"   Step 1: Cleaning geometry...")
        bpy.ops.mesh.select_all(action='SELECT')
        removed = bpy.ops.mesh.remove_doubles(threshold=0.0001)
        bpy.ops.mesh.delete_loose()

        # Step 2: Recalculate ALL normals consistently
        print(f"   Step 2: Recalculating all normals...")
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)

        # Step 3: Select bottom faces and flip if needed
        print(f"   Step 3: Checking bottom faces...")
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')

        # Find bottom faces (faces with center Y near min_y)
        threshold_y = min_y + (max_y - min_y) * 0.15  # Bottom 15%

        bottom_faces = []
        inverted_faces = []

        for poly in obj.data.polygons:
            # Get face center
            face_center = obj.matrix_world @ poly.center

            if face_center.y <= threshold_y:
                bottom_faces.append(poly)

                # Check if normal points downward (Y < 0 = pointing down)
                world_normal = obj.matrix_world.to_3x3() @ poly.normal
                if world_normal.y > 0:  # Should point down, but points up
                    inverted_faces.append(poly)
                    poly.select = True

        print(f"   Found {len(bottom_faces)} bottom faces")
        print(f"   Found {len(inverted_faces)} inverted bottom faces")

        if len(inverted_faces) > 0:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.flip_normals()
            print(f"   ✓ Flipped {len(inverted_faces)} face normals")
        else:
            print(f"   ✓ All normals already correct")

        # Step 4: Final consistency check
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)

        # Step 5: Apply smooth shading
        bpy.ops.mesh.faces_shade_smooth()

        # Return to object mode
        bpy.ops.object.mode_set(mode='OBJECT')

        print(f"   ✅ Complete")

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
        print("Usage: blender --background --python fix_bottom_normals.py -- <input.glb> <output.glb>")
        return

    if len(argv) < 2:
        print("Error: Need input and output file paths")
        return

    input_path = argv[0]
    output_path = argv[1]

    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return

    fix_bottom_normals(input_path, output_path)

if __name__ == "__main__":
    main()
