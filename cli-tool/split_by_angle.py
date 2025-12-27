#!/usr/bin/env python3
"""
Split GLB by Face Angle (Normal Vectors)
Separates vertical faces (legs) from angled/horizontal faces (fabric)
"""

import bpy
import bmesh
import sys
import math
import os

def split_by_angle(input_path, output_path, angle_threshold=30, z_threshold=0.5, height_percent=0.20):
    """
    Split GLB model by face angle AND position (hybrid approach).

    Args:
        input_path: Path to input GLB file
        output_path: Path to output GLB file
        angle_threshold: Angle tolerance in degrees (default: 30°)
        z_threshold: Z-component threshold for vertical detection (default: 0.5)
                    Lower = more vertical (0 = perfectly horizontal normal)
        height_percent: Bottom height percentage for legs (default: 0.20 = bottom 20%)
    """

    print(f"🔧 Split by Angle + Position (Hybrid)")
    print(f"📂 Input: {input_path}")
    print(f"📊 Settings:")
    print(f"   - Angle threshold: {angle_threshold}°")
    print(f"   - Z threshold: {z_threshold}")
    print(f"   - Height %: {height_percent*100:.0f}% (bottom portion)")
    print()

    # Clear scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    # Import GLB
    print("📥 Loading GLB...")
    bpy.ops.import_scene.gltf(filepath=input_path)

    # Get all mesh objects
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']

    if not mesh_objects:
        print("❌ No mesh objects found in GLB")
        sys.exit(1)

    print(f"✅ Found {len(mesh_objects)} mesh object(s)")

    total_legs_faces = 0
    total_fabric_faces = 0

    for obj in mesh_objects:
        print(f"\n🔍 Processing: {obj.name}")

        # Select and make active
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)

        # Enter edit mode
        bpy.ops.object.mode_set(mode='EDIT')

        # Get bmesh
        mesh = obj.data
        bm = bmesh.from_edit_mesh(mesh)

        # Ensure normals are updated
        bm.normal_update()

        # Deselect all
        bpy.ops.mesh.select_all(action='DESELECT')

        # Get model bounds to find bottom region
        verts = [v.co for v in bm.verts]
        z_coords = [v[2] for v in verts]
        min_z = min(z_coords)
        max_z = max(z_coords)
        z_range = max_z - min_z

        # Bottom 20% of model (where legs typically are)
        leg_height_threshold = min_z + (z_range * 0.20)

        print(f"   📐 Model bounds:")
        print(f"      Min Z: {min_z:.3f}")
        print(f"      Max Z: {max_z:.3f}")
        print(f"      Range: {z_range:.3f}")
        print(f"      Leg threshold: {leg_height_threshold:.3f} (bottom 20%)")

        # Analyze face normals AND position
        legs_faces = []
        fabric_faces = []

        for face in bm.faces:
            # Get face center position
            face_center = face.calc_center_median()

            # Get normal vector (in object space)
            normal = face.normal

            # A face is a leg if:
            # 1. It's in the bottom 20% of the model (position-based)
            # 2. AND it's mostly vertical (pointing sideways, angle-based)
            is_at_bottom = face_center.z < leg_height_threshold
            is_vertical = abs(normal.z) < z_threshold

            if is_at_bottom and is_vertical:
                legs_faces.append(face)
                face.select = True
            else:
                fabric_faces.append(face)

        print(f"   📊 Analysis:")
        print(f"      Vertical faces (legs): {len(legs_faces)}")
        print(f"      Angled faces (fabric): {len(fabric_faces)}")

        total_legs_faces += len(legs_faces)
        total_fabric_faces += len(fabric_faces)

        if len(legs_faces) == 0:
            print(f"   ⚠️  No vertical faces found - skipping material split")
            bpy.ops.object.mode_set(mode='OBJECT')
            continue

        # Create materials if they don't exist
        legs_mat = None
        fabric_mat = None

        for mat in bpy.data.materials:
            if mat.name == "legs":
                legs_mat = mat
            elif mat.name == "fabric":
                fabric_mat = mat

        if not legs_mat:
            legs_mat = bpy.data.materials.new(name="legs")
            legs_mat.use_nodes = True
            # Set to dark color for visibility
            if legs_mat.node_tree:
                bsdf = legs_mat.node_tree.nodes.get('Principled BSDF')
                if bsdf:
                    bsdf.inputs['Base Color'].default_value = (0.1, 0.1, 0.1, 1.0)

        if not fabric_mat:
            fabric_mat = bpy.data.materials.new(name="fabric")
            fabric_mat.use_nodes = True

        # Assign materials to object slots
        if len(obj.data.materials) == 0:
            obj.data.materials.append(fabric_mat)
            obj.data.materials.append(legs_mat)
        else:
            # Replace existing material with fabric
            obj.data.materials[0] = fabric_mat
            if len(obj.data.materials) == 1:
                obj.data.materials.append(legs_mat)
            else:
                obj.data.materials[1] = legs_mat

        legs_mat_index = 1
        fabric_mat_index = 0

        # Assign legs material to selected faces
        for face in legs_faces:
            face.material_index = legs_mat_index

        # Assign fabric material to other faces
        for face in fabric_faces:
            face.material_index = fabric_mat_index

        bmesh.update_edit_mesh(mesh)

        # Back to object mode
        bpy.ops.object.mode_set(mode='OBJECT')

        print(f"   ✅ Materials assigned:")
        print(f"      - 'legs' material: {len(legs_faces)} faces")
        print(f"      - 'fabric' material: {len(fabric_faces)} faces")

    # Export GLB
    print(f"\n💾 Exporting to: {output_path}")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_materials='EXPORT'
    )

    # Get file size
    file_size = os.path.getsize(output_path)
    size_mb = file_size / (1024 * 1024)

    print(f"\n✅ Success!")
    print(f"📊 Summary:")
    print(f"   Total vertical faces (legs): {total_legs_faces}")
    print(f"   Total angled faces (fabric): {total_fabric_faces}")
    print(f"   Output size: {size_mb:.2f} MB")
    print(f"   Materials: 2 (fabric, legs)")
    print()
    print(f"🎯 Next steps:")
    print(f"   1. Open in 3D viewer to verify")
    print(f"   2. Check that legs are separate material")
    print(f"   3. Adjust z_threshold if needed (currently {z_threshold})")

if __name__ == "__main__":
    # Parse arguments
    # Usage: blender --background --python split_by_angle.py -- input.glb output.glb [z_threshold]

    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        print("❌ Usage: blender --background --python split_by_angle.py -- input.glb output.glb [z_threshold]")
        sys.exit(1)

    if len(argv) < 2:
        print("❌ Error: Need input and output paths")
        print("Usage: blender --background --python split_by_angle.py -- input.glb output.glb [z_threshold]")
        sys.exit(1)

    input_path = argv[0]
    output_path = argv[1]
    z_threshold = float(argv[2]) if len(argv) > 2 else 0.5

    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        sys.exit(1)

    split_by_angle(input_path, output_path, z_threshold=z_threshold)
