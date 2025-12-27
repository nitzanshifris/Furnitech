const { NodeIO } = require('@gltf-transform/core');
const fs = require('fs');

async function analyzeGLB(filePath) {
    const io = new NodeIO();
    const document = await io.read(filePath);
    const root = document.getRoot();

    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Get materials and textures
    const materials = root.listMaterials();
    const textures = root.listTextures();

    // Calculate bounding box with node transforms applied
    const scenes = root.listScenes();
    const defaultScene = scenes[0];

    // Get root node scale (this is what matters for AR!)
    let scaleX = 1, scaleY = 1, scaleZ = 1;
    if (defaultScene) {
        const rootNodes = defaultScene.listChildren();
        if (rootNodes.length > 0) {
            const rootScale = rootNodes[0].getScale();
            scaleX = Math.abs(rootScale[0]);
            scaleY = Math.abs(rootScale[1]);
            scaleZ = Math.abs(rootScale[2]);
        }
    }

    // Calculate raw mesh bounding box
    const meshes = root.listMeshes();
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    meshes.forEach(mesh => {
        mesh.listPrimitives().forEach(prim => {
            const positions = prim.getAttribute('POSITION');
            if (positions) {
                const posArray = positions.getArray();
                for (let i = 0; i < posArray.length; i += 3) {
                    minX = Math.min(minX, posArray[i]);
                    maxX = Math.max(maxX, posArray[i]);
                    minY = Math.min(minY, posArray[i + 1]);
                    maxY = Math.max(maxY, posArray[i + 1]);
                    minZ = Math.min(minZ, posArray[i + 2]);
                    maxZ = Math.max(maxZ, posArray[i + 2]);
                }
            }
        });
    });

    // Apply node scale to dimensions (this is what AR will see!)
    const width = ((maxX - minX) * scaleX * 100).toFixed(1);   // Convert to cm with scale
    const height = ((maxY - minY) * scaleY * 100).toFixed(1);
    const depth = ((maxZ - minZ) * scaleZ * 100).toFixed(1);

    // Also return raw dimensions (without scale) for accurate scaling operations
    const rawWidth = (maxX - minX);
    const rawHeight = (maxY - minY);
    const rawDepth = (maxZ - minZ);

    return {
        filePath,
        fileSizeMB,
        materialCount: materials.length,
        textureCount: textures.length,
        meshCount: meshes.length,
        width,
        height,
        depth,
        rawWidth,
        rawHeight,
        rawDepth,
        currentScale: { x: scaleX, y: scaleY, z: scaleZ },
        bounds: { minX, maxX, minY, maxY, minZ, maxZ },
        document  // Return document for reuse
    };
}

module.exports = { analyzeGLB };
