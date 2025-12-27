#!/usr/bin/env python3
"""
Make only the legs of furniture black by selecting leg geometry and applying black material.

This is the proper way - select geometry by position (bottom parts = legs),
then assign a separate black material to just those faces.

Usage:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python make_legs_black_geometry.py -- <input.glb> <output.glb>
"""

import bpy
import sys
import os
import mathutils

def make_legs_black(input_path, output_path):
    """Apply black material to leg geometry only."""

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
        max_y = max(v.y for v in bbox)
        min_z = min(v.z for v in bbox)
        max_z = max(v.z for v in bbox)

        width_x = max_x - min_x
        width_y = max_y - min_y
        width_z = max_z - min_z

        print(f"   Dimensions:")
        print(f"     X: {width_x:.3f}")
        print(f"     Y: {width_y:.3f}")
        print(f"     Z: {width_z:.3f}")

        # Determine which axis is "up" (the smallest dimension is usually height for furniture)
        # For sofas: width > depth > height
        # So the SMALLEST dimension is likely the vertical axis (legs)

        if width_y < width_x and width_y < width_z:
            # Y is the vertical axis (height)
            vertical_axis = 'y'
            vertical_min = min_y
            vertical_max = max_y
            vertical_range = width_y
            horizontal_1_range = width_x
            horizontal_2_range = width_z
            print(f"   Detected: Y is vertical (height: {vertical_range:.3f})")
        elif width_z < width_x and width_z < width_y:
            # Z is the vertical axis
            vertical_axis = 'z'
            vertical_min = min_z
            vertical_max = max_z
            vertical_range = width_z
            horizontal_1_range = width_x
            horizontal_2_range = width_y
            print(f"   Detected: Z is vertical (height: {vertical_range:.3f})")
        else:
            # X is the vertical axis
            vertical_axis = 'x'
            vertical_min = min_x
            vertical_max = max_x
            vertical_range = width_x
            horizontal_1_range = width_y
            horizontal_2_range = width_z
            print(f"   Detected: X is vertical (height: {vertical_range:.3f})")

        # Create black material for legs (PURE BLACK, no reflections)
        black_mat = bpy.data.materials.new(name="Black_Legs")
        black_mat.use_nodes = True
        bsdf = black_mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs['Base Color'].default_value = (0.0, 0.0, 0.0, 1.0)  # Pure black
        bsdf.inputs['Roughness'].default_value = 1.0  # Fully rough, no reflections
        bsdf.inputs['Metallic'].default_value = 0.0  # Not metallic
        bsdf.inputs['Specular IOR Level'].default_value = 0.0  # No specular highlights

        # Add black material to object
        if len(obj.data.materials) == 0:
            obj.data.materials.append(black_mat)
        else:
            obj.data.materials.append(black_mat)

        black_mat_index = len(obj.data.materials) - 1

        # Enter edit mode
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')

        # Select faces in bottom 18.5% of height (just the legs)
        leg_threshold = vertical_min + (vertical_range * 0.185)  # Bottom 18.5%

        leg_faces = []
        body_faces = []

        for poly in obj.data.polygons:
            # Get face center in world space
            face_center_local = poly.center
            face_center_world = obj.matrix_world @ face_center_local

            # Get the vertical coordinate based on detected axis
            if vertical_axis == 'y':
                vertical_coord = face_center_world.y
            elif vertical_axis == 'z':
                vertical_coord = face_center_world.z
            else:
                vertical_coord = face_center_world.x

            # Check if face is in leg region (bottom 15%)
            if vertical_coord <= leg_threshold:
                poly.select = True
                leg_faces.append(poly)
            else:
                body_faces.append(poly)

        print(f"   Found {len(leg_faces)} leg faces")
        print(f"   Found {len(body_faces)} body faces")

        if len(leg_faces) == 0:
            print(f"   ⚠️  No leg faces found - trying different approach...")

            # Fallback: Just select bottom faces regardless of X position
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='DESELECT')
            bpy.ops.object.mode_set(mode='OBJECT')

            for poly in obj.data.polygons:
                face_center_local = poly.center
                face_center_world = obj.matrix_world @ face_center_local

                if face_center_world.y <= leg_threshold_y:
                    poly.select = True
                    leg_faces.append(poly)

            print(f"   Found {len(leg_faces)} bottom faces (fallback)")

        # Apply black material to selected faces
        if len(leg_faces) > 0:
            bpy.ops.object.mode_set(mode='EDIT')

            # Assign black material to selection
            bpy.context.object.active_material_index = black_mat_index
            bpy.ops.object.material_slot_assign()

            print(f"   ✓ Applied black material to {len(leg_faces)} faces")

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
        print("Usage: blender --background --python make_legs_black_geometry.py -- <input.glb> <output.glb>")
        return

    if len(argv) < 2:
        print("Error: Need input and output file paths")
        return

    input_path = argv[0]
    output_path = argv[1]

    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return

    make_legs_black(input_path, output_path)

if __name__ == "__main__":
    main()
