#!/usr/bin/env python3
"""
Fix UV mapping on bottom faces to match texture properly.

After fixing normals, the bottom faces may have incorrect/missing UV coordinates,
causing wrong texture appearance.

Usage:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python fix_bottom_uvs.py -- <input.glb> <output.glb>
"""

import bpy
import sys
import os
import mathutils
import bmesh

def fix_bottom_uvs(input_path, output_path):
    """Fix UV mapping on bottom faces."""

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

        # Get BMesh
        bm = bmesh.from_edit_mesh(obj.data)
        uv_layer = bm.loops.layers.uv.verify()

        # Select bottom faces
        threshold_y = min_y + (max_y - min_y) * 0.15  # Bottom 15%

        bottom_faces_count = 0
        for face in bm.faces:
            # Get face center in world space
            face_center_local = face.calc_center_median()
            face_center_world = obj.matrix_world @ face_center_local

            if face_center_world.y <= threshold_y:
                face.select = True
                bottom_faces_count += 1
            else:
                face.select = False

        bmesh.update_edit_mesh(obj.data)

        print(f"   Found {bottom_faces_count} bottom faces")

        if bottom_faces_count > 0:
            # Option 1: Smart UV Project for bottom faces
            print(f"   Applying smart UV projection to bottom...")

            try:
                bpy.ops.uv.smart_project(
                    angle_limit=66.0,
                    island_margin=0.02,
                    area_weight=0.0,
                    correct_aspect=True,
                    scale_to_bounds=False
                )
                print(f"   ✓ Applied smart UV projection")
            except Exception as e:
                print(f"   ⚠️  Smart UV failed: {e}")

                # Fallback: Use simple projection
                print(f"   Trying simple projection...")
                try:
                    bpy.ops.uv.project_from_view(
                        camera_bounds=False,
                        correct_aspect=True,
                        scale_to_bounds=False
                    )
                    print(f"   ✓ Applied view projection")
                except Exception as e2:
                    print(f"   ⚠️  Projection failed: {e2}")

        # Clean up BMesh
        bm.free()

        # Select all and recalculate normals one more time
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)

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
        print("Usage: blender --background --python fix_bottom_uvs.py -- <input.glb> <output.glb>")
        return

    if len(argv) < 2:
        print("Error: Need input and output file paths")
        return

    input_path = argv[0]
    output_path = argv[1]

    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return

    fix_bottom_uvs(input_path, output_path)

if __name__ == "__main__":
    main()
