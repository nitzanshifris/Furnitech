const { NodeIO } = require('@gltf-transform/core');
const sharp = require('sharp');
const path = require('path');

async function makeLegsBlack(inputFile, outputFile) {
    console.log('📦 Loading model...');
    const io = new NodeIO();
    const document = await io.read(inputFile);
    const root = document.getRoot();

    const textures = root.listTextures();
    if (textures.length === 0) {
        console.log('❌ No textures found');
        return;
    }

    const texture = textures[0];
    const imageData = texture.getImage();

    console.log('🎨 Processing texture...');

    // Convert image to raw pixel data
    const { data, info } = await sharp(imageData).raw().toBuffer({ resolveWithObject: true });
    const outputData = Buffer.alloc(data.length);

    // Target: Make DARK pixels black (legs)
    // Keep LIGHT pixels unchanged (beige fabric)

    let darkPixels = 0;
    let lightPixels = 0;

    for (let i = 0; i < data.length; i += 3) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;

        // If dark (legs) - make black
        // Increased threshold to catch all legs including lighter ones
        if (brightness < 120) {  // Threshold for "dark" - catches more legs
            outputData[i] = 0;       // Black R
            outputData[i + 1] = 0;   // Black G
            outputData[i + 2] = 0;   // Black B
            darkPixels++;
        } else {
            // Keep original (fabric)
            outputData[i] = r;
            outputData[i + 1] = g;
            outputData[i + 2] = b;
            lightPixels++;
        }
    }

    const totalPixels = data.length / 3;
    console.log(`   Dark pixels (made black): ${darkPixels} (${(darkPixels/totalPixels*100).toFixed(1)}%)`);
    console.log(`   Light pixels (kept): ${lightPixels} (${(lightPixels/totalPixels*100).toFixed(1)}%)`);

    // Convert back to PNG
    const newImage = await sharp(outputData, {
        raw: { width: info.width, height: info.height, channels: 3 }
    }).png().toBuffer();

    texture.setImage(new Uint8Array(newImage));
    texture.setMimeType('image/png');

    // Update material base color to not interfere
    const materials = root.listMaterials();
    materials.forEach(mat => {
        mat.setBaseColorFactor([1.0, 1.0, 1.0, 1.0]);  // Neutral white
    });

    console.log('💾 Saving...');
    await io.write(outputFile, document);
    console.log('✅ Done!');
}

// Get input/output from command line
const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
    console.log('Usage: node make_legs_black.js <input.glb> <output.glb>');
    process.exit(1);
}

makeLegsBlack(inputFile, outputFile).catch(console.error);
