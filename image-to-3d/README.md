# Image to 3D Model Generator

A powerful, easy-to-use Python tool that automatically converts web images into high-quality 3D GLB models using AI. Perfect for creating 3D assets from product photos, furniture images, or any web content.

![Python Version](https://img.shields.io/badge/python-3.8+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Replicate](https://img.shields.io/badge/Replicate-Trellis-orange.svg)

## Features

- **Automatic Image Discovery**: Fetches all images from any webpage
- **Smart Downloading**: Filters and validates images by size and quality
- **AI-Powered 3D Generation**: Uses Replicate's Trellis model for high-quality results
- **Intelligent Image Selection**: Automatically picks the best angles for 3D reconstruction
- **Progress Tracking**: Clear visual feedback during all operations
- **Metadata Logging**: Saves generation parameters for reproducibility
- **Multiple Input Methods**: Works with URLs or local image files
- **Fully Configurable**: Control texture quality, mesh detail, and more

## Quick Start

### 1. Installation

```bash
# Clone or download this repository
cd image_to_3d

# Install dependencies
pip install -r requirements.txt
```

### 2. Get Your Replicate API Token

1. Sign up at [Replicate](https://replicate.com/)
2. Go to [Account Settings → API Tokens](https://replicate.com/account/api-tokens)
3. Copy your token

### 3. Set Your API Token

```bash
# Mac/Linux
export REPLICATE_API_TOKEN='your-token-here'

# Windows (PowerShell)
$env:REPLICATE_API_TOKEN='your-token-here'

# Or create a .env file
echo "REPLICATE_API_TOKEN=your-token-here" > .env
```

### 4. Generate Your First 3D Model

```bash
python image_to_3d.py https://example.com/product-page
```

That's it! Your 3D model will be saved in the `output/` directory.

## Usage Examples

### Basic Usage

```bash
# Generate 3D model from a webpage
python image_to_3d.py https://example.com/product
```

### Advanced Options

```bash
# High-quality model with custom settings
python image_to_3d.py https://example.com/product \
    --max-images 5 \
    --texture-size 2048 \
    --mesh-simplify 0.98 \
    --output my_furniture_model
```

### Using Local Images

```bash
# Generate from local image files
python image_to_3d.py \
    --images front.jpg side.jpg back.jpg \
    --output chair_model
```

### Custom Output Directory

```bash
# Save to a specific directory
python image_to_3d.py https://example.com/product \
    --output-dir ./my_3d_models \
    --output product_v1
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `--max-images` | Maximum images to use (1-5 recommended) | 5 |
| `--texture-size` | Texture resolution: 1024 or 2048 | 2048 |
| `--mesh-simplify` | Mesh detail: 0.9-0.99 (higher = more detail) | 0.95 |
| `--output` | Custom output filename (without .glb) | Auto-generated |
| `--output-dir` | Directory for outputs | `./output` |
| `--api-token` | Replicate API token (or use env var) | From `REPLICATE_API_TOKEN` |

## Output Structure

```
output/
├── model_20241227_143022.glb          # 3D model file
├── model_20241227_143022_metadata.json # Generation metadata
├── model_20241227_143022_01.jpg       # Downloaded image 1
├── model_20241227_143022_02.jpg       # Downloaded image 2
└── ...
```

## How It Works

### 1. Image Discovery
- Scans the webpage for all `<img>` tags
- Filters out icons, logos, and tiny images
- Validates image sizes (> 50KB by default)

### 2. Image Download
- Downloads validated images to local storage
- Preserves original quality
- Tracks progress with clear feedback

### 3. Smart Selection
- Picks the best images for 3D generation
- For multi-image: selects evenly distributed views
- Trellis works best with 1-5 images showing different angles

### 4. AI 3D Generation
- Uploads images to Replicate
- Runs Trellis model (takes 3-7 minutes)
- Downloads the generated GLB file
- Saves metadata for future reference

## Tips for Best Results

### Image Selection

**Good Images:**
- Clear, well-lit product photos
- Multiple angles (front, side, back)
- Consistent lighting
- Plain or simple backgrounds
- High resolution (500KB+)

**Avoid:**
- Blurry or low-resolution images
- Complex backgrounds
- Extreme angles or distortions
- Watermarked images

### Optimal Settings by Use Case

**High-Quality Models (for AR/Production):**
```bash
--texture-size 2048 --mesh-simplify 0.98
```

**Fast Preview (testing):**
```bash
--texture-size 1024 --mesh-simplify 0.90
```

**Balanced (recommended):**
```bash
--texture-size 2048 --mesh-simplify 0.95
```

## Advanced Usage

### Using as a Python Library

```python
from image_to_3d import ImageTo3DGenerator

# Initialize
generator = ImageTo3DGenerator(
    api_token="your-token",
    output_dir="my_models"
)

# Generate from URL
glb_path = generator.process_url(
    url="https://example.com/product",
    max_images=5,
    texture_size=2048,
    mesh_simplify=0.95
)

print(f"Model saved to: {glb_path}")
```

### Custom Image Processing

```python
from pathlib import Path
from image_to_3d import ImageTo3DGenerator

generator = ImageTo3DGenerator()

# Discover images
image_urls = generator.discover_images("https://example.com")

# Download specific images
paths = generator.download_images(image_urls[:3])

# Generate 3D model
glb = generator.generate_3d_model(
    image_paths=paths,
    output_name="custom_model"
)
```

## Viewing Your 3D Models

### Online Viewers
- [glTF Viewer](https://gltf-viewer.donmccurdy.com/) - Drag and drop your .glb file
- [Babylon.js Sandbox](https://sandbox.babylonjs.com/)
- [Three.js Editor](https://threejs.org/editor/)

### Desktop Software
- [Blender](https://www.blender.org/) - Free, professional 3D software
- [Autodesk FBX Review](https://www.autodesk.com/products/fbx/fbx-review)

### Mobile AR
- iPhone: Use [model-viewer](https://modelviewer.dev/) with AR Quick Look
- Android: Scene Viewer support
- See [CLAUDE.md](CLAUDE.md) for AR scaling instructions

## Troubleshooting

### "No images found on the page"
- The webpage may load images dynamically with JavaScript
- Try providing direct image URLs or use local files with `--images`

### "REPLICATE_API_TOKEN not set"
```bash
export REPLICATE_API_TOKEN='your-token-here'
```

### "Model generation failed"
- Check your Replicate account credits
- Verify images are valid (not corrupted)
- Try with fewer images or lower quality settings

### "Images are too small"
- Adjust the minimum size filter in the code
- Or manually download larger images

### Rate Limiting
- Replicate has usage limits on free tier
- Add delays between requests if needed
- Check your account at [replicate.com/account](https://replicate.com/account)

## Real-World Examples

### Furniture Cataloging
```bash
# Generate 3D models for an entire furniture catalog
python image_to_3d.py https://furniture-store.com/sofa-001
python image_to_3d.py https://furniture-store.com/chair-042
```

### E-commerce Integration
```bash
# Batch process product pages
for url in products.txt; do
    python image_to_3d.py "$url" --output-dir ./product_models
done
```

### Local Image Processing
```bash
# Process photos from a product photoshoot
python image_to_3d.py \
    --images photos/front.jpg photos/side.jpg photos/back.jpg \
    --output product_final \
    --texture-size 2048
```

## Technical Details

### Dependencies
- **replicate**: AI model API client
- **beautifulsoup4**: HTML parsing for image discovery
- **requests**: HTTP client for downloading
- **Pillow**: Image processing (optional)

### Trellis Model
- **Provider**: Replicate (firtoz/trellis)
- **Input**: 1-5 images (JPEG/PNG)
- **Output**: GLB file (3D model)
- **Processing Time**: 3-7 minutes
- **Quality**: Production-ready, AR-compatible

### Output Format
- **Format**: GLB (Binary glTF)
- **Compatibility**: Web, AR, Game Engines, 3D Software
- **Size**: Typically 2-8 MB depending on settings

## Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## License

MIT License - feel free to use this in your projects!

## Acknowledgments

- [Replicate](https://replicate.com/) for providing the Trellis AI model
- [Trellis](https://github.com/microsoft/TRELLIS) by Microsoft Research
- The open-source community for excellent Python libraries

## Support

- Issues: [GitHub Issues](https://github.com/your-repo/issues)
- Discussions: [GitHub Discussions](https://github.com/your-repo/discussions)
- Replicate Support: [replicate.com/docs](https://replicate.com/docs)

## Roadmap

- [ ] Batch processing from CSV/JSON
- [ ] Web UI interface
- [ ] Automatic AR scaling
- [ ] Quality comparison metrics
- [ ] Support for more AI models
- [ ] Cloud storage integration
- [ ] Docker container

---

**Made with care for the 3D community**

*Convert any image to 3D in minutes, not hours.*
