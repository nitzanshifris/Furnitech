/**
 * Server-side Wallpaper Generator
 * Creates GLB files from texture maps using Node.js compatible Three.js
 * Converts PBR texture maps into AR-ready wallpaper planes
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import sharp from 'sharp';

/**
 * Create a wallpaper plane GLB from texture buffers
 * @param {Object} textureBuffers - Object containing texture data as buffers
 * @param {Buffer} textureBuffers.albedo - Base color texture buffer (required)
 * @param {Buffer} textureBuffers.normal - Normal map texture buffer
 * @param {Buffer} textureBuffers.roughness - Roughness texture buffer  
 * @param {Buffer} textureBuffers.height - Height/displacement texture buffer
 * @param {Object} options - Configuration options
 * @param {number} options.width - Width in meters (default: 2.44)
 * @param {number} options.height - Height in meters (default: 2.44)
 * @param {number} options.tileRepeat - Texture tiling factor (default: 4)
 * @param {string} options.title - Wallpaper title
 * @returns {Promise<Buffer>} GLB file as buffer
 */
export async function createWallpaperPlane(textureBuffers, options = {}) {
  const {
    width = 2.44,
    height = 2.44,
    tileRepeat = 4,
    title = 'Wallpaper'
  } = options;

  console.log(`🧱 Generating wallpaper: ${title} (${width}x${height}m, ${tileRepeat}x repeat)`);

  // Validate required textures
  if (!textureBuffers.albedo) {
    throw new Error('Albedo texture is required for wallpaper generation');
  }

  // Create scene
  const scene = new THREE.Scene();
  scene.name = 'WallpaperScene';

  // Create high-resolution plane geometry for quality displacement
  const segments = Math.min(Math.floor(Math.max(width, height) * 50), 512); // Adaptive resolution
  const geometry = new THREE.PlaneGeometry(width, height, segments, segments);
  
  console.log(`📐 Creating geometry: ${width}m × ${height}m with ${segments}×${segments} segments`);

  // Process and load textures
  const loadedTextures = {};
  const texturePromises = [];

  // Process albedo texture (required)
  texturePromises.push(
    createTextureFromBuffer(textureBuffers.albedo, 'albedo', tileRepeat)
      .then(texture => { loadedTextures.map = texture; })
  );

  // Process optional textures
  if (textureBuffers.normal) {
    texturePromises.push(
      createTextureFromBuffer(textureBuffers.normal, 'normal', tileRepeat)
        .then(texture => {
          loadedTextures.normalMap = texture;
          loadedTextures.normalScale = new THREE.Vector2(1, 1);
        })
    );
  }

  if (textureBuffers.roughness) {
    texturePromises.push(
      createTextureFromBuffer(textureBuffers.roughness, 'roughness', tileRepeat)
        .then(texture => {
          loadedTextures.roughnessMap = texture;
          loadedTextures.roughness = 1.0;
        })
    );
  }

  if (textureBuffers.height) {
    texturePromises.push(
      createTextureFromBuffer(textureBuffers.height, 'height', tileRepeat)
        .then(texture => {
          loadedTextures.displacementMap = texture;
          loadedTextures.displacementScale = 0.02; // Subtle displacement for realism
        })
    );
  }

  // Wait for all textures to load
  await Promise.all(texturePromises);
  
  console.log(`🎨 Loaded ${Object.keys(loadedTextures).length} texture properties`);

  // Create PBR material optimized for AR wallpapers
  const material = new THREE.MeshStandardMaterial({
    ...loadedTextures,
    metalness: 0.0, // Wallpapers are non-metallic
    side: THREE.DoubleSide, // Ensure visibility from both sides
    transparent: false,
    alphaTest: 0.1,
    name: `${title}_Material`
  });

  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${title}_Plane`;
  
  // Position the plane vertically for wall mounting
  mesh.rotation.x = 0; // Flat against wall
  mesh.position.set(0, 0, 0); // Centered
  
  scene.add(mesh);

  // Add appropriate lighting for PBR materials
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  ambientLight.name = 'WallpaperAmbientLight';
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  directionalLight.name = 'WallpaperDirectionalLight';
  scene.add(directionalLight);

  // Export to GLB format
  console.log('🔧 Exporting to GLB format...');
  const glbBuffer = await exportSceneToGLB(scene);
  
  console.log(`✅ GLB generated successfully: ${(glbBuffer.length / 1024 / 1024).toFixed(2)}MB`);
  
  return glbBuffer;
}

/**
 * Create a Three.js texture from buffer data
 * @param {Buffer} buffer - Image buffer
 * @param {string} type - Texture type for optimization
 * @param {number} tileRepeat - UV repeat factor
 * @returns {Promise<THREE.Texture>} Configured texture
 */
async function createTextureFromBuffer(buffer, type, tileRepeat) {
  try {
    // Process image with Sharp for optimization and format consistency
    let processedBuffer;
    
    if (type === 'normal') {
      // Ensure normal maps are processed correctly
      processedBuffer = await sharp(buffer)
        .resize(1024, 1024, { fit: 'fill' })
        .jpeg({ quality: 90 })
        .toBuffer();
    } else {
      // Standard texture processing
      processedBuffer = await sharp(buffer)
        .resize(1024, 1024, { fit: 'fill' })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    // Convert to data URL for Three.js TextureLoader
    const base64 = processedBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    
    // Create texture
    const loader = new THREE.TextureLoader();
    const texture = loader.load(dataUrl);
    
    // Configure texture properties for tiling
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(tileRepeat, tileRepeat);
    
    // Set appropriate color space
    if (type === 'albedo') {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else {
      texture.colorSpace = THREE.LinearSRGBColorSpace;
    }

    // Optimize for AR usage
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.flipY = false; // Important for GLB export

    console.log(`✅ Created ${type} texture (${tileRepeat}x repeat)`);
    
    return texture;
    
  } catch (error) {
    console.error(`❌ Failed to create ${type} texture:`, error);
    throw new Error(`Failed to process ${type} texture: ${error.message}`);
  }
}

/**
 * Export Three.js scene to GLB buffer
 * @param {THREE.Scene} scene - Scene to export
 * @returns {Promise<Buffer>} GLB file buffer
 */
function exportSceneToGLB(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    
    const exportOptions = {
      binary: true,
      embedImages: true,
      maxTextureSize: 1024, // Balance quality vs file size
      includeCustomExtensions: false,
      forcePowerOfTwoTextures: false,
      truncateDrawRange: true
    };
    
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          const buffer = Buffer.from(result);
          console.log(`📦 GLB export completed: ${(buffer.length / 1024).toFixed(1)}KB`);
          resolve(buffer);
        } else {
          reject(new Error('GLB export did not return binary data'));
        }
      },
      (error) => {
        console.error('❌ GLB export failed:', error);
        reject(new Error(`GLB export failed: ${error.message}`));
      },
      exportOptions
    );
  });
}

/**
 * Generate a test wallpaper with procedural textures (for testing)
 * @param {Object} options - Generation options
 * @returns {Promise<Buffer>} Test wallpaper GLB
 */
export async function generateTestWallpaper(options = {}) {
  console.log('🧪 Generating test mosaic wallpaper...');
  
  // Generate simple test albedo texture
  const canvas = Buffer.alloc(1024 * 1024 * 3); // RGB buffer
  
  // Create simple mosaic pattern
  const tileSize = 32;
  const groutSize = 4;
  const colors = [
    [139, 69, 19],   // Brown
    [205, 133, 63],  // Peru  
    [222, 184, 135], // Burlywood
    [244, 164, 96],  // Sandy brown
    [210, 180, 140]  // Tan
  ];
  
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 1024; x++) {
      const tileX = Math.floor(x / (tileSize + groutSize));
      const tileY = Math.floor(y / (tileSize + groutSize));
      const localX = x % (tileSize + groutSize);
      const localY = y % (tileSize + groutSize);
      
      let color;
      if (localX < groutSize || localY < groutSize) {
        // Grout
        color = [42, 42, 42];
      } else {
        // Tile
        const colorIndex = (tileX + tileY) % colors.length;
        color = colors[colorIndex];
      }
      
      const index = (y * 1024 + x) * 3;
      canvas[index] = color[0];
      canvas[index + 1] = color[1]; 
      canvas[index + 2] = color[2];
    }
  }
  
  // Convert to JPEG buffer
  const textureBuffer = await sharp(canvas, {
    raw: { width: 1024, height: 1024, channels: 3 }
  }).jpeg().toBuffer();
  
  // Generate wallpaper with test texture
  return createWallpaperPlane({
    albedo: textureBuffer
  }, {
    width: 2.44,
    height: 2.44,
    tileRepeat: 4,
    title: 'Test Mosaic',
    ...options
  });
}