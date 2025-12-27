/**
 * Wallpaper Plane Generator
 * Converts texture maps (Albedo, Normal, Roughness, Height, AO) into a GLB file
 * with a plane geometry suitable for wall AR visualization
 */

export class WallpaperGenerator {
    constructor() {
        this.THREE = null;
        this.GLTFExporter = null;
        this.scene = null;
        this.initialized = false;
    }

    /**
     * Initialize Three.js components
     */
    async init() {
        if (this.initialized) return;

        // Load Three.js modules
        const [THREE_module, GLTFExporter_module] = await Promise.all([
            import('https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js'),
            import('https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/exporters/GLTFExporter.js')
        ]);

        this.THREE = THREE_module;
        this.GLTFExporter = GLTFExporter_module.GLTFExporter;
        this.scene = new this.THREE.Scene();
        this.initialized = true;
    }

    /**
     * Create a wallpaper plane with PBR materials
     * @param {Object} textures - Object containing texture URLs or data
     * @param {string} textures.albedo - Base color texture (required)
     * @param {string} textures.normal - Normal map texture
     * @param {string} textures.roughness - Roughness texture
     * @param {string} textures.height - Height/displacement map
     * @param {string} textures.ao - Ambient occlusion texture
     * @param {Object} options - Configuration options
     * @param {number} options.width - Width of the plane in meters (default: 2)
     * @param {number} options.height - Height of the plane in meters (default: 2.5)
     * @param {number} options.tileX - Horizontal tiling factor (default: 1)
     * @param {number} options.tileY - Vertical tiling factor (default: 1)
     * @param {number} options.displacementScale - Height displacement intensity (default: 0.05)
     * @returns {Promise<Blob>} GLB file as blob
     */
    async createWallpaperPlane(textures, options = {}) {
        await this.init();

        const {
            width = 2,
            height = 2.5,
            tileX = 1,
            tileY = 1,
            displacementScale = 0.05
        } = options;

        // Clear scene
        this.scene.clear();

        // Create plane geometry with high resolution for displacement
        const geometry = new this.THREE.PlaneGeometry(width, height, 256, 256);
        
        // Load textures
        const textureLoader = new this.THREE.TextureLoader();
        const loadedTextures = {};

        // Configure texture tiling and wrapping
        const configureTexture = (texture) => {
            texture.wrapS = this.THREE.RepeatWrapping;
            texture.wrapT = this.THREE.RepeatWrapping;
            texture.repeat.set(tileX, tileY);
            texture.colorSpace = this.THREE.SRGBColorSpace;
            return texture;
        };

        // Load albedo texture (required)
        if (!textures.albedo) {
            throw new Error('Albedo texture is required');
        }
        
        loadedTextures.map = configureTexture(
            await this.loadTexture(textureLoader, textures.albedo)
        );

        // Load optional textures
        if (textures.normal) {
            loadedTextures.normalMap = configureTexture(
                await this.loadTexture(textureLoader, textures.normal)
            );
            loadedTextures.normalScale = new this.THREE.Vector2(1, 1);
        }

        if (textures.roughness) {
            loadedTextures.roughnessMap = configureTexture(
                await this.loadTexture(textureLoader, textures.roughness)
            );
            loadedTextures.roughness = 1.0;
        }

        if (textures.height) {
            loadedTextures.displacementMap = configureTexture(
                await this.loadTexture(textureLoader, textures.height)
            );
            loadedTextures.displacementScale = displacementScale;
        }

        if (textures.ao) {
            loadedTextures.aoMap = configureTexture(
                await this.loadTexture(textureLoader, textures.ao)
            );
            loadedTextures.aoMapIntensity = 1.0;
            
            // AO map requires second UV set
            geometry.setAttribute('uv2', geometry.attributes.uv);
        }

        // Create PBR material optimized for wallpapers
        const material = new this.THREE.MeshStandardMaterial({
            ...loadedTextures,
            metalness: 0.0, // Wallpapers are non-metallic
            side: this.THREE.FrontSide, // Only front side needed for walls
            transparent: false,
            alphaTest: 0.1
        });

        // Create mesh
        const mesh = new this.THREE.Mesh(geometry, material);
        mesh.name = 'WallpaperPlane';
        
        // Position for wall mounting (vertical orientation)
        mesh.rotation.x = 0;
        mesh.position.set(0, height/2, 0); // Center vertically
        
        this.scene.add(mesh);

        // Add lighting for realistic PBR rendering
        const ambientLight = new this.THREE.AmbientLight(0xffffff, 0.4);
        ambientLight.name = 'AmbientLight';
        this.scene.add(ambientLight);

        const directionalLight = new this.THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(2, 2, 2);
        directionalLight.name = 'DirectionalLight';
        this.scene.add(directionalLight);

        // Export to GLB
        return this.exportToGLB();
    }

    /**
     * Load texture with error handling and fallbacks
     */
    async loadTexture(loader, url) {
        return new Promise((resolve, reject) => {
            loader.load(
                url,
                (texture) => {
                    console.log(`✅ Loaded texture: ${url}`);
                    resolve(texture);
                },
                (progress) => {
                    console.log(`📁 Loading texture progress: ${(progress.loaded / progress.total * 100)}%`);
                },
                (error) => {
                    console.warn(`❌ Failed to load texture: ${url}`, error);
                    reject(new Error(`Failed to load texture: ${url}`));
                }
            );
        });
    }

    /**
     * Export scene to GLB format with optimization
     */
    exportToGLB() {
        return new Promise((resolve, reject) => {
            const exporter = new this.GLTFExporter();
            
            exporter.parse(
                this.scene,
                (gltf) => {
                    const blob = new Blob([gltf], { type: 'model/gltf-binary' });
                    console.log(`✅ GLB exported successfully, size: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
                    resolve(blob);
                },
                (error) => {
                    console.error('❌ GLB export failed:', error);
                    reject(error);
                },
                {
                    binary: true,
                    embedImages: true,
                    maxTextureSize: 2048, // Optimize for mobile
                    includeCustomExtensions: false
                }
            );
        });
    }

    /**
     * Create a test wallpaper with procedural mosaic pattern
     */
    async createTestMosaic(options = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Create mosaic tile pattern
        const tileSize = 32;
        const groutSize = 2;
        
        // Base color (grout)
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, 512, 512);

        // Tile colors
        const colors = ['#8B4513', '#CD853F', '#DEB887', '#F4A460', '#D2B48C'];
        
        for (let x = 0; x < 512; x += tileSize + groutSize) {
            for (let y = 0; y < 512; y += tileSize + groutSize) {
                const color = colors[Math.floor(Math.random() * colors.length)];
                ctx.fillStyle = color;
                ctx.fillRect(x + groutSize/2, y + groutSize/2, tileSize, tileSize);
                
                // Add slight variation
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.1})`;
                ctx.fillRect(x + groutSize/2, y + groutSize/2, tileSize, tileSize);
            }
        }

        const testTexture = canvas.toDataURL('image/jpeg', 0.9);

        // Create simple normal map
        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = 512;
        normalCanvas.height = 512;
        const normalCtx = normalCanvas.getContext('2d');
        
        // Blue base (flat normal)
        normalCtx.fillStyle = '#8080FF';
        normalCtx.fillRect(0, 0, 512, 512);
        
        // Add tile edges in normal map
        for (let x = 0; x < 512; x += tileSize + groutSize) {
            for (let y = 0; y < 512; y += tileSize + groutSize) {
                // Edge highlights
                normalCtx.fillStyle = '#9090FF';
                normalCtx.fillRect(x + groutSize/2, y + groutSize/2, 2, tileSize);
                normalCtx.fillRect(x + groutSize/2, y + groutSize/2, tileSize, 2);
            }
        }

        const normalTexture = normalCanvas.toDataURL('image/jpeg', 0.9);

        return this.createWallpaperPlane({
            albedo: testTexture,
            normal: normalTexture
        }, options);
    }
}

/**
 * Utility function to convert multiple texture files into a wallpaper GLB
 * @param {FileList|Array} files - Array of texture files
 * @param {Object} options - Generation options
 * @returns {Promise<{blob: Blob, info: Object}>} GLB blob and generation info
 */
export async function createWallpaperFromFiles(files, options = {}) {
    const textures = {};
    const detectedTypes = [];
    
    // Map file names to texture types based on common naming conventions
    const texturePatterns = {
        'albedo': /albedo|diffuse|color|base|_d\./i,
        'normal': /normal|norm|nrm|_n\./i,
        'roughness': /roughness|rough|_r\.|smoothness/i,
        'height': /height|displacement|disp|bump|_h\./i,
        'ao': /ao|ambient|occlusion|_ao\./i
    };

    // Process each file
    for (const file of files) {
        const fileName = file.name.toLowerCase();
        
        // Determine texture type from filename
        for (const [type, pattern] of Object.entries(texturePatterns)) {
            if (pattern.test(fileName)) {
                const url = URL.createObjectURL(file);
                textures[type] = url;
                detectedTypes.push({ type, filename: file.name });
                console.log(`🎨 Detected ${type} texture: ${file.name}`);
                break;
            }
        }
    }

    // Validate we have required textures
    if (!textures.albedo) {
        throw new Error('Missing required albedo/base color texture. Please include a file with "albedo", "diffuse", "color", or "base" in the name.');
    }

    // Create wallpaper generator
    const generator = new WallpaperGenerator();
    
    try {
        const glbBlob = await generator.createWallpaperPlane(textures, options);
        
        // Clean up object URLs
        Object.values(textures).forEach(url => {
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });
        
        return {
            blob: glbBlob,
            info: {
                detectedTypes,
                dimensions: `${options.width || 2}m x ${options.height || 2.5}m`,
                tiling: `${options.tileX || 1} x ${options.tileY || 1}`,
                size: `${(glbBlob.size / 1024 / 1024).toFixed(2)}MB`
            }
        };
    } catch (error) {
        // Clean up object URLs on error
        Object.values(textures).forEach(url => {
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });
        
        console.error('Error creating wallpaper GLB:', error);
        throw error;
    }
}

/**
 * Validate texture files for wallpaper creation
 * @param {FileList|Array} files - Files to validate
 * @returns {Object} Validation result
 */
export function validateTextureFiles(files) {
    const result = {
        isValid: false,
        hasAlbedo: false,
        detectedTextures: [],
        errors: [],
        warnings: []
    };

    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxFileSize = 10 * 1024 * 1024; // 10MB per file
    
    const texturePatterns = {
        'albedo': /albedo|diffuse|color|base|_d\./i,
        'normal': /normal|norm|nrm|_n\./i,
        'roughness': /roughness|rough|_r\.|smoothness/i,
        'height': /height|displacement|disp|bump|_h\./i,
        'ao': /ao|ambient|occlusion|_ao\./i
    };

    for (const file of files) {
        // Check file type
        if (!validImageTypes.includes(file.type)) {
            result.errors.push(`${file.name}: Unsupported file format. Use JPG, PNG, or WebP.`);
            continue;
        }

        // Check file size
        if (file.size > maxFileSize) {
            result.warnings.push(`${file.name}: Large file size (${(file.size / 1024 / 1024).toFixed(1)}MB). Consider compressing for faster loading.`);
        }

        const fileName = file.name.toLowerCase();
        let detectedType = 'unknown';
        
        // Detect texture type
        for (const [type, pattern] of Object.entries(texturePatterns)) {
            if (pattern.test(fileName)) {
                detectedType = type;
                if (type === 'albedo') {
                    result.hasAlbedo = true;
                }
                break;
            }
        }
        
        result.detectedTextures.push({ 
            type: detectedType, 
            file: file.name,
            size: `${(file.size / 1024 / 1024).toFixed(1)}MB`
        });
    }

    // Check for required albedo texture
    if (!result.hasAlbedo) {
        result.errors.push('Missing required base color texture. Include a file with "albedo", "diffuse", "color", or "base" in the filename.');
    }

    // Check for recommended textures
    const hasNormal = result.detectedTextures.some(t => t.type === 'normal');
    const hasRoughness = result.detectedTextures.some(t => t.type === 'roughness');
    
    if (!hasNormal) {
        result.warnings.push('No normal map detected. Normal maps create realistic surface depth and detail.');
    }
    
    if (!hasRoughness) {
        result.warnings.push('No roughness map detected. Roughness maps control surface shine and reflection.');
    }

    result.isValid = result.hasAlbedo && result.errors.length === 0;

    return result;
}