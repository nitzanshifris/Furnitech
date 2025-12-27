/**
 * Test Texture Generator for Wallpaper System
 * Creates realistic mosaic texture maps for testing purposes
 */

export class TestTextureGenerator {
    /**
     * Generate a complete set of PBR textures for a mosaic pattern
     * @param {Object} options - Generation options
     * @param {number} options.size - Texture resolution (default: 512)
     * @param {number} options.tileSize - Size of individual tiles (default: 32px)
     * @param {number} options.groutSize - Width of grout lines (default: 2px)
     * @param {Array} options.colors - Array of tile colors (default: earth tones)
     * @returns {Promise<Object>} Object containing all texture data URLs
     */
    static async generateMosaicTextures(options = {}) {
        const {
            size = 512,
            tileSize = 32,
            groutSize = 2,
            colors = ['#8B4513', '#CD853F', '#DEB887', '#F4A460', '#D2B48C', '#BC8F8F', '#A0522D']
        } = options;

        console.log('🎨 Generating mosaic textures...', { size, tileSize, groutSize, colors: colors.length });

        const textures = {};

        // Generate Albedo (Base Color) Texture
        textures.albedo = await this.generateAlbedoTexture(size, tileSize, groutSize, colors);
        
        // Generate Normal Map
        textures.normal = await this.generateNormalTexture(size, tileSize, groutSize);
        
        // Generate Roughness Map
        textures.roughness = await this.generateRoughnessTexture(size, tileSize, groutSize);
        
        // Generate Height Map
        textures.height = await this.generateHeightTexture(size, tileSize, groutSize);
        
        // Generate Ambient Occlusion Map
        textures.ao = await this.generateAOTexture(size, tileSize, groutSize);

        console.log('✅ Generated all mosaic textures');
        return textures;
    }

    /**
     * Generate albedo (base color) texture
     */
    static async generateAlbedoTexture(size, tileSize, groutSize, colors) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Fill with grout color
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, size, size);

        // Add tile pattern
        const tileStep = tileSize + groutSize;
        
        for (let x = 0; x < size; x += tileStep) {
            for (let y = 0; y < size; y += tileStep) {
                // Random tile color
                const color = colors[Math.floor(Math.random() * colors.length)];
                ctx.fillStyle = color;
                
                // Draw tile with slight padding for grout
                const tileX = x + groutSize / 2;
                const tileY = y + groutSize / 2;
                ctx.fillRect(tileX, tileY, tileSize, tileSize);
                
                // Add color variation within tile
                const variations = 3;
                for (let i = 0; i < variations; i++) {
                    const varX = tileX + Math.random() * tileSize;
                    const varY = tileY + Math.random() * tileSize;
                    const varSize = Math.random() * (tileSize * 0.3);
                    
                    ctx.fillStyle = this.adjustBrightness(color, -0.1 + Math.random() * 0.2);
                    ctx.beginPath();
                    ctx.arc(varX, varY, varSize, 0, 2 * Math.PI);
                    ctx.fill();
                }
                
                // Add highlight
                const gradient = ctx.createLinearGradient(tileX, tileY, tileX + tileSize, tileY + tileSize);
                gradient.addColorStop(0, `rgba(255, 255, 255, ${0.1 + Math.random() * 0.1})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(tileX, tileY, tileSize, tileSize);
            }
        }

        return canvas.toDataURL('image/jpeg', 0.9);
    }

    /**
     * Generate normal map texture (blue-based with tile edges)
     */
    static async generateNormalTexture(size, tileSize, groutSize) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base normal color (flat surface = blue)
        ctx.fillStyle = '#8080FF';
        ctx.fillRect(0, 0, size, size);

        const tileStep = tileSize + groutSize;
        
        for (let x = 0; x < size; x += tileStep) {
            for (let y = 0; y < size; y += tileStep) {
                const tileX = x + groutSize / 2;
                const tileY = y + groutSize / 2;
                
                // Tile center (slightly raised)
                ctx.fillStyle = '#8888FF';
                ctx.fillRect(tileX + 2, tileY + 2, tileSize - 4, tileSize - 4);
                
                // Tile edges (beveled effect)
                // Top edge
                const topGradient = ctx.createLinearGradient(tileX, tileY, tileX, tileY + 4);
                topGradient.addColorStop(0, '#9999FF');
                topGradient.addColorStop(1, '#8080FF');
                ctx.fillStyle = topGradient;
                ctx.fillRect(tileX, tileY, tileSize, 4);
                
                // Left edge
                const leftGradient = ctx.createLinearGradient(tileX, tileY, tileX + 4, tileY);
                leftGradient.addColorStop(0, '#9999FF');
                leftGradient.addColorStop(1, '#8080FF');
                ctx.fillStyle = leftGradient;
                ctx.fillRect(tileX, tileY, 4, tileSize);
                
                // Bottom edge
                const bottomGradient = ctx.createLinearGradient(tileX, tileY + tileSize - 4, tileX, tileY + tileSize);
                bottomGradient.addColorStop(0, '#8080FF');
                bottomGradient.addColorStop(1, '#7070FF');
                ctx.fillStyle = bottomGradient;
                ctx.fillRect(tileX, tileY + tileSize - 4, tileSize, 4);
                
                // Right edge
                const rightGradient = ctx.createLinearGradient(tileX + tileSize - 4, tileY, tileX + tileSize, tileY);
                rightGradient.addColorStop(0, '#8080FF');
                rightGradient.addColorStop(1, '#7070FF');
                ctx.fillStyle = rightGradient;
                ctx.fillRect(tileX + tileSize - 4, tileY, 4, tileSize);
            }
        }

        return canvas.toDataURL('image/jpeg', 0.9);
    }

    /**
     * Generate roughness texture (tiles = smooth, grout = rough)
     */
    static async generateRoughnessTexture(size, tileSize, groutSize) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Grout is rough (light gray)
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(0, 0, size, size);

        const tileStep = tileSize + groutSize;
        
        for (let x = 0; x < size; x += tileStep) {
            for (let y = 0; y < size; y += tileStep) {
                const tileX = x + groutSize / 2;
                const tileY = y + groutSize / 2;
                
                // Tiles are smoother (darker gray with variation)
                const baseRoughness = 0.2 + Math.random() * 0.3; // 0.2 to 0.5
                const roughnessColor = Math.floor(baseRoughness * 255);
                ctx.fillStyle = `rgb(${roughnessColor}, ${roughnessColor}, ${roughnessColor})`;
                ctx.fillRect(tileX, tileY, tileSize, tileSize);
                
                // Add some texture within tiles
                const dots = 5;
                for (let i = 0; i < dots; i++) {
                    const dotX = tileX + Math.random() * tileSize;
                    const dotY = tileY + Math.random() * tileSize;
                    const dotRoughness = Math.floor((baseRoughness + 0.1 + Math.random() * 0.2) * 255);
                    
                    ctx.fillStyle = `rgb(${dotRoughness}, ${dotRoughness}, ${dotRoughness})`;
                    ctx.beginPath();
                    ctx.arc(dotX, dotY, 1 + Math.random() * 2, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }

        return canvas.toDataURL('image/jpeg', 0.9);
    }

    /**
     * Generate height/displacement texture
     */
    static async generateHeightTexture(size, tileSize, groutSize) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Grout is low (dark)
        ctx.fillStyle = '#404040';
        ctx.fillRect(0, 0, size, size);

        const tileStep = tileSize + groutSize;
        
        for (let x = 0; x < size; x += tileStep) {
            for (let y = 0; y < size; y += tileStep) {
                const tileX = x + groutSize / 2;
                const tileY = y + groutSize / 2;
                
                // Tiles are raised (lighter)
                ctx.fillStyle = '#B0B0B0';
                ctx.fillRect(tileX, tileY, tileSize, tileSize);
                
                // Create radial gradient for rounded tile effect
                const centerX = tileX + tileSize / 2;
                const centerY = tileY + tileSize / 2;
                const radius = tileSize / 2;
                
                const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
                gradient.addColorStop(0, '#C0C0C0'); // Center highest
                gradient.addColorStop(0.7, '#B0B0B0'); // Mid height
                gradient.addColorStop(1, '#909090'); // Edges lower
                
                ctx.fillStyle = gradient;
                ctx.fillRect(tileX, tileY, tileSize, tileSize);
            }
        }

        return canvas.toDataURL('image/jpeg', 0.9);
    }

    /**
     * Generate ambient occlusion texture
     */
    static async generateAOTexture(size, tileSize, groutSize) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base white (no occlusion)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        const tileStep = tileSize + groutSize;
        
        for (let x = 0; x < size; x += tileStep) {
            for (let y = 0; y < size; y += tileStep) {
                const tileX = x + groutSize / 2;
                const tileY = y + groutSize / 2;
                
                // Grout lines have occlusion (darker)
                // Top grout line
                ctx.fillStyle = '#888888';
                ctx.fillRect(x, y, tileStep, groutSize / 2);
                
                // Left grout line
                ctx.fillRect(x, y, groutSize / 2, tileStep);
                
                // Tile edges have slight occlusion
                const edgeGradient = ctx.createLinearGradient(tileX, tileY, tileX + 4, tileY + 4);
                edgeGradient.addColorStop(0, '#DDDDDD');
                edgeGradient.addColorStop(1, '#FFFFFF');
                
                ctx.fillStyle = edgeGradient;
                ctx.fillRect(tileX, tileY, 4, 4);
                
                // Corner shadows
                ctx.fillStyle = '#CCCCCC';
                ctx.beginPath();
                ctx.arc(tileX + 2, tileY + 2, 3, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(tileX + tileSize - 2, tileY + 2, 2, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(tileX + 2, tileY + tileSize - 2, 2, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        return canvas.toDataURL('image/jpeg', 0.9);
    }

    /**
     * Utility function to adjust color brightness
     */
    static adjustBrightness(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + Math.floor(amount * 255)));
        const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + Math.floor(amount * 255)));
        const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + Math.floor(amount * 255)));
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * Create downloadable texture files for testing
     * @param {string} pattern - Pattern type ('mosaic', 'brick', 'stone')
     * @returns {Promise<Array>} Array of file objects with download links
     */
    static async createTestTextureFiles(pattern = 'mosaic') {
        const textures = await this.generateMosaicTextures();
        const files = [];

        for (const [type, dataUrl] of Object.entries(textures)) {
            // Convert data URL to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            
            // Create file object
            const file = new File([blob], `${pattern}_${type}.jpg`, { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            
            files.push({
                type,
                file,
                url,
                name: file.name,
                size: `${(file.size / 1024).toFixed(1)}KB`
            });
        }

        console.log('📁 Created test texture files:', files.map(f => f.name));
        return files;
    }
}

/**
 * Download all test textures as individual files
 */
export async function downloadTestTextures(pattern = 'mosaic') {
    try {
        const files = await TestTextureGenerator.createTestTextureFiles(pattern);
        
        // Download each file
        for (const fileData of files) {
            const a = document.createElement('a');
            a.href = fileData.url;
            a.download = fileData.name;
            a.click();
            
            // Clean up URL after download
            setTimeout(() => URL.revokeObjectURL(fileData.url), 1000);
        }
        
        console.log(`✅ Downloaded ${files.length} test texture files`);
        return files;
        
    } catch (error) {
        console.error('❌ Failed to download test textures:', error);
        throw error;
    }
}

/**
 * Generate and return test texture files for upload simulation
 */
export async function getTestTextureFiles(pattern = 'mosaic') {
    const files = await TestTextureGenerator.createTestTextureFiles(pattern);
    return files.map(f => f.file);
}