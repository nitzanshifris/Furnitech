#!/usr/bin/env python3
"""
Aggressively fix holes in GLB model.

This script:
1. Imports the GLB
2. Removes duplicate vertices
3. Fills ALL holes multiple times
4. Uses grid fill for better results
5. Recalculates normals properly
6. Exports back to GLB

Usage:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python fix_holes_aggressive.py -- <input.glb> <output.glb>
"""

import bpy
import sys
import os

def fix_holes_aggressive(input_path, output_path):
    """Aggressively fix all holes in GLB model."""

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

        # Step 1: Clean up geometry
        print(f"   Step 1: Cleaning geometry...")
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=0.0001)
        bpy.ops.mesh.delete_loose()  # Remove loose vertices/edges

        # Step 2: Recalculate normals first time
        print(f"   Step 2: Fixing normals...")
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)

        # Step 3: Fill holes multiple times (iterative approach)
        print(f"   Step 3: Filling holes (multiple passes)...")

        for pass_num in range(3):  # 3 passes to catch all holes
            # Deselect all
            bpy.ops.mesh.select_all(action='DESELECT')

            # Select boundary edges (open holes)
            bpy.ops.mesh.select_non_manifold(
                extend=False,
                use_wire=False,
                use_boundary=True,
                use_multi_face=False,
                use_non_contiguous=False,
                use_verts=False
            )

            # Count selected edges
            bpy.ops.object.mode_set(mode='OBJECT')
            selected_edges = sum(1 for e in obj.data.edges if e.select)
            bpy.ops.object.mode_set(mode='EDIT')

            if selected_edges > 0:
                print(f"      Pass {pass_num + 1}: Found {selected_edges} boundary edges")

                # Try grid fill first (better for rectangular holes)
                try:
                    bpy.ops.mesh.fill_grid()
                    print(f"      Pass {pass_num + 1}: Used grid fill")
                except:
                    # If grid fill fails, use simple fill
                    bpy.ops.mesh.edge_face_add()
                    print(f"      Pass {pass_num + 1}: Used simple fill")

                # Recalculate normals after filling
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.mesh.normals_make_consistent(inside=False)
            else:
                print(f"      Pass {pass_num + 1}: No holes found")
                break

        # Step 4: Final cleanup
        print(f"   Step 4: Final cleanup...")
        bpy.ops.mesh.select_all(action='SELECT')

        # Remove doubles again (filling might create duplicates)
        bpy.ops.mesh.remove_doubles(threshold=0.0001)

        # Final normal recalculation
        bpy.ops.mesh.normals_make_consistent(inside=False)

        # Smooth shading for better appearance
        bpy.ops.mesh.faces_shade_smooth()

        # Step 5: Check final state
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.mesh.select_non_manifold(
            extend=False,
            use_wire=False,
            use_boundary=True,
            use_multi_face=False,
            use_non_contiguous=False,
            use_verts=False
        )

        bpy.ops.object.mode_set(mode='OBJECT')
        remaining_holes = sum(1 for e in obj.data.edges if e.select)

        if remaining_holes == 0:
            print(f"   ✅ All holes closed successfully!")
        else:
            print(f"   ⚠️  {remaining_holes} boundary edges remain (complex holes)")

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
        print("Usage: blender --background --python fix_holes_aggressive.py -- <input.glb> <output.glb>")
        return

    if len(argv) < 2:
        print("Error: Need input and output file paths")
        print("Usage: blender --background --python fix_holes_aggressive.py -- <input.glb> <output.glb>")
        return

    input_path = argv[0]
    output_path = argv[1]

    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return

    fix_holes_aggressive(input_path, output_path)

if __name__ == "__main__":
    main()
