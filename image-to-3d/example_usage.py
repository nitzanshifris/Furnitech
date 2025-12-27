#!/usr/bin/env python3
"""
Example Usage of Image to 3D Generator
======================================

This script demonstrates different ways to use the Image to 3D Generator
both as a command-line tool and as a Python library.

Run this after setting your REPLICATE_API_TOKEN environment variable.
"""

import os
from pathlib import Path
from image_to_3d import ImageTo3DGenerator


def example_1_basic_url():
    """
    Example 1: Basic usage with a URL

    This is the simplest way to generate a 3D model from a webpage.
    """
    print("\n" + "="*70)
    print("EXAMPLE 1: Basic URL Processing")
    print("="*70)

    generator = ImageTo3DGenerator(output_dir="example_output")

    # Replace with your actual URL
    url = "https://example.com/product"

    glb_path = generator.process_url(url)

    if glb_path:
        print(f"\nSuccess! Model saved to: {glb_path}")
    else:
        print("\nFailed to generate model")


def example_2_custom_settings():
    """
    Example 2: Custom quality settings

    Demonstrates how to control texture quality and mesh detail.
    """
    print("\n" + "="*70)
    print("EXAMPLE 2: Custom Quality Settings")
    print("="*70)

    generator = ImageTo3DGenerator(output_dir="example_output/high_quality")

    url = "https://example.com/product"

    # High quality settings
    glb_path = generator.process_url(
        url=url,
        max_images=5,              # Use up to 5 images
        texture_size=2048,         # Maximum texture resolution
        mesh_simplify=0.98,        # Maximum detail (less simplification)
        output_name="high_quality_model"
    )

    if glb_path:
        print(f"\nHigh-quality model saved to: {glb_path}")


def example_3_local_images():
    """
    Example 3: Using local image files

    Shows how to generate 3D models from images you already have.
    """
    print("\n" + "="*70)
    print("EXAMPLE 3: Local Images")
    print("="*70)

    generator = ImageTo3DGenerator(output_dir="example_output/from_local")

    # List your local image files
    image_paths = [
        Path("photos/front.jpg"),
        Path("photos/side.jpg"),
        Path("photos/back.jpg")
    ]

    # Check if files exist
    existing_images = [p for p in image_paths if p.exists()]

    if not existing_images:
        print("No local images found. Please place images in photos/ directory.")
        return

    print(f"Found {len(existing_images)} local images")

    glb_path = generator.generate_3d_model(
        image_paths=existing_images,
        output_name="from_local_images",
        texture_size=2048,
        mesh_simplify=0.95
    )

    if glb_path:
        print(f"\nModel from local images saved to: {glb_path}")


def example_4_step_by_step():
    """
    Example 4: Step-by-step processing

    Demonstrates fine-grained control over each step of the process.
    """
    print("\n" + "="*70)
    print("EXAMPLE 4: Step-by-Step Processing")
    print("="*70)

    generator = ImageTo3DGenerator(output_dir="example_output/step_by_step")

    url = "https://example.com/product"

    # Step 1: Discover images
    print("\nStep 1: Discovering images...")
    image_urls = generator.discover_images(url, min_size_kb=100)
    print(f"Found {len(image_urls)} images")

    if not image_urls:
        print("No images found")
        return

    # Step 2: Download images
    print("\nStep 2: Downloading images...")
    image_paths = generator.download_images(image_urls[:10], prefix="product")
    print(f"Downloaded {len(image_paths)} images")

    if not image_paths:
        print("Failed to download images")
        return

    # Step 3: Select best images
    print("\nStep 3: Selecting best images...")
    selected = generator.select_best_images(image_paths, max_images=3)
    print(f"Selected {len(selected)} images for 3D generation")

    # Step 4: Generate 3D model
    print("\nStep 4: Generating 3D model...")
    glb_path = generator.generate_3d_model(
        image_paths=selected,
        output_name="step_by_step_model"
    )

    if glb_path:
        print(f"\nFinal model saved to: {glb_path}")


def example_5_batch_processing():
    """
    Example 5: Batch processing multiple URLs

    Shows how to process multiple products in a loop.
    """
    print("\n" + "="*70)
    print("EXAMPLE 5: Batch Processing")
    print("="*70)

    generator = ImageTo3DGenerator(output_dir="example_output/batch")

    # List of product URLs to process
    product_urls = [
        "https://example.com/product1",
        "https://example.com/product2",
        "https://example.com/product3",
    ]

    results = []

    for i, url in enumerate(product_urls, 1):
        print(f"\n[{i}/{len(product_urls)}] Processing: {url}")

        try:
            glb_path = generator.process_url(
                url=url,
                output_name=f"product_{i:02d}",
                max_images=3,  # Use fewer images for faster processing
                texture_size=1024  # Lower quality for speed
            )

            results.append({
                'url': url,
                'success': glb_path is not None,
                'path': glb_path
            })

        except Exception as e:
            print(f"Error processing {url}: {e}")
            results.append({
                'url': url,
                'success': False,
                'error': str(e)
            })

    # Summary
    print("\n" + "="*70)
    print("BATCH PROCESSING SUMMARY")
    print("="*70)
    successful = sum(1 for r in results if r['success'])
    print(f"Processed: {len(results)} products")
    print(f"Successful: {successful}")
    print(f"Failed: {len(results) - successful}")


def example_6_error_handling():
    """
    Example 6: Proper error handling

    Shows how to handle errors gracefully in production code.
    """
    print("\n" + "="*70)
    print("EXAMPLE 6: Error Handling")
    print("="*70)

    try:
        # Check for API token
        if not os.environ.get('REPLICATE_API_TOKEN'):
            raise ValueError(
                "REPLICATE_API_TOKEN not set. "
                "Get your token at https://replicate.com/account/api-tokens"
            )

        generator = ImageTo3DGenerator(output_dir="example_output/with_errors")

        url = "https://example.com/product"

        # Attempt to process
        glb_path = generator.process_url(url)

        if glb_path and glb_path.exists():
            print(f"\nSuccess! Model saved to: {glb_path}")
            print(f"File size: {glb_path.stat().st_size / (1024*1024):.2f} MB")
        else:
            print("\nWarning: Model generation did not produce a file")

    except ValueError as e:
        print(f"\nConfiguration Error: {e}")
        print("Please set your API token and try again")

    except Exception as e:
        print(f"\nUnexpected Error: {e}")
        import traceback
        traceback.print_exc()


def main():
    """
    Main function - runs all examples or specific ones.

    Uncomment the examples you want to run.
    """
    print("\n" + "="*70)
    print("IMAGE TO 3D GENERATOR - USAGE EXAMPLES")
    print("="*70)
    print("\nThese examples demonstrate different ways to use the tool.")
    print("Uncomment the examples you want to run in the main() function.\n")

    # Check for API token
    if not os.environ.get('REPLICATE_API_TOKEN'):
        print("WARNING: REPLICATE_API_TOKEN not set!")
        print("Set it with: export REPLICATE_API_TOKEN='your-token-here'")
        print("\nMost examples will fail without a valid token.")
        print("="*70)

    # Uncomment the examples you want to run:

    # example_1_basic_url()
    # example_2_custom_settings()
    # example_3_local_images()
    # example_4_step_by_step()
    # example_5_batch_processing()
    example_6_error_handling()

    print("\n" + "="*70)
    print("Examples completed!")
    print("="*70)


if __name__ == "__main__":
    main()
