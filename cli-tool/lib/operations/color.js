const { NodeIO } = require('@gltf-transform/core');
const sharp = require('sharp');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const path = require('path');

async function runColorOperation(inputFile, fileInfo) {
    console.log(chalk.cyan('\n🎨 Color Operations'));
    console.log(chalk.cyan('━'.repeat(70)));

    // Choose color transformation mode
    const { transformMode } = await inquirer.prompt([
        {
            type: 'list',
            name: 'transformMode',
            message: 'Choose color transformation mode:',
            choices: [
                { name: '✨ Smart Replace (any color → any color, works with dark/light)', value: 'replace' },
                { name: '🎨 Tint (preserves darkness, good for similar brightness)', value: 'tint' }
            ]
        }
    ]);

    // Get color input
    const { colorChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'colorChoice',
            message: 'Choose color option:',
            choices: [
                { name: '⌨️  Enter hex code', value: 'hex' },
                { name: '🎨 Pick from palette', value: 'palette' }
            ]
        }
    ]);

    let targetHex;
    if (colorChoice === 'hex') {
        const { hexInput } = await inquirer.prompt([
            {
                type: 'input',
                name: 'hexInput',
                message: 'Enter hex color (e.g., #69624f):',
                validate: (input) => {
                    if (!/^#[0-9A-Fa-f]{6}$/.test(input)) {
                        return 'Invalid hex color. Format: #RRGGBB';
                    }
                    return true;
                }
            }
        ]);
        targetHex = hexInput;
    } else {
        const { paletteChoice } = await inquirer.prompt([
            {
                type: 'list',
                name: 'paletteChoice',
                message: 'Select color:',
                choices: [
                    { name: 'Olive (#69624f)', value: '#69624f' },
                    { name: 'Burgundy (#763442)', value: '#763442' },
                    { name: 'Beige (#ebd7d0)', value: '#ebd7d0' },
                    { name: 'Grey (#808080)', value: '#808080' },
                    { name: 'Black (#000000)', value: '#000000' },
                    { name: 'White (#ffffff)', value: '#ffffff' }
                ]
            }
        ]);
        targetHex = paletteChoice;
    }

    // Get brightness adjustment
    const { brightnessAdjust } = await inquirer.prompt([
        {
            type: 'number',
            name: 'brightnessAdjust',
            message: 'Brightness adjustment (-50 to +50, 0 = no change):',
            default: 0,
            validate: (input) => {
                if (input < -50 || input > 50) return 'Must be between -50 and +50';
                return true;
            }
        }
    ]);

    // Get saturation adjustment
    const { saturationAdjust } = await inquirer.prompt([
        {
            type: 'number',
            name: 'saturationAdjust',
            message: 'Saturation adjustment (-50 to +50, 0 = no change):',
            default: 0,
            validate: (input) => {
                if (input < -50 || input > 50) return 'Must be between -50 and +50';
                return true;
            }
        }
    ]);

    // Process the model
    const spinner = ora('Processing...').start();

    try {
        // Parse hex color
        const hex = targetHex.replace('#', '');
        const targetR = parseInt(hex.substr(0, 2), 16);
        const targetG = parseInt(hex.substr(2, 2), 16);
        const targetB = parseInt(hex.substr(4, 2), 16);
        const targetColor = [targetR / 255, targetG / 255, targetB / 255, 1.0];

        spinner.text = 'Loading GLB...';
        const io = new NodeIO();
        const document = await io.read(inputFile);
        const root = document.getRoot();

        // Calculate modulation values
        const brightnessFactor = 1 + (brightnessAdjust / 100);
        const saturationFactor = 1 + (saturationAdjust / 100);

        // Recolor textures
        const textures = root.listTextures();
        spinner.text = `Recoloring ${textures.length} texture(s)...`;

        for (let i = 0; i < textures.length; i++) {
            const texture = textures[i];
            const imageData = texture.getImage();

            let recoloredImage;

            if (transformMode === 'replace') {
                // SMART REPLACE MODE: Can go from any color to any color
                // Uses linear transformation: output = input × multiply + add

                // Calculate transformation based on target brightness
                const targetBrightness = (targetR + targetG + targetB) / 3;
                const isTargetLight = targetBrightness > 180;

                if (isTargetLight) {
                    // Target is light - use additive approach
                    const saturationFactor = 1 + (saturationAdjust / 100);
                    recoloredImage = await sharp(Buffer.from(imageData))
                        .modulate({
                            saturation: Math.max(0.1, saturationFactor * 0.2),
                            hue: 30  // Warm tones
                        })
                        .linear(
                            [0.2, 0.2, 0.18],  // Small multiply factor
                            [targetR * 0.92, targetG * 0.90, targetB * 0.88]  // Large add offset
                        )
                        .png()
                        .toBuffer();
                } else {
                    // Target is dark - use multiplicative tint
                    recoloredImage = await sharp(Buffer.from(imageData))
                        .modulate({
                            brightness: brightnessFactor,
                            saturation: saturationFactor
                        })
                        .tint({ r: targetR, g: targetG, b: targetB })
                        .png()
                        .toBuffer();
                }
            } else {
                // TINT MODE: Traditional multiplicative tinting
                recoloredImage = await sharp(Buffer.from(imageData))
                    .modulate({
                        brightness: brightnessFactor,
                        saturation: saturationFactor
                    })
                    .tint({ r: targetR, g: targetG, b: targetB })
                    .png()
                    .toBuffer();
            }

            texture.setImage(new Uint8Array(recoloredImage));
            texture.setMimeType('image/png');
        }

        // Update materials
        spinner.text = 'Updating materials...';
        const materials = root.listMaterials();
        materials.forEach(mat => mat.setBaseColorFactor(targetColor));

        // Generate suggested output filename
        const dir = path.dirname(inputFile);
        const basename = path.basename(inputFile, '.glb');
        const colorName = targetHex.replace('#', '');
        const suggestedName = `${basename}-${colorName}.glb`;

        spinner.stop();

        // Ask user for output filename
        const { outputFilename } = await inquirer.prompt([
            {
                type: 'input',
                name: 'outputFilename',
                message: '💾 Output filename:',
                default: suggestedName,
                validate: (input) => {
                    if (!input) return 'Filename cannot be empty';
                    if (!input.endsWith('.glb')) return 'Filename must end with .glb';
                    return true;
                }
            }
        ]);

        const outputPath = path.join(dir, outputFilename);

        spinner.start('Saving GLB...');
        await io.write(outputPath, document);

        spinner.succeed(chalk.green('Recoloring complete!'));

        console.log(chalk.gray(`\n   Mode: ${transformMode === 'replace' ? '✨ Smart Replace' : '🎨 Tint'}`));
        console.log(chalk.gray(`   Color: ${targetHex}`));
        console.log(chalk.gray(`   Brightness: ${brightnessAdjust > 0 ? '+' : ''}${brightnessAdjust}%`));
        console.log(chalk.gray(`   Saturation: ${saturationAdjust > 0 ? '+' : ''}${saturationAdjust}%`));

        return outputPath;
    } catch (error) {
        spinner.fail('Recoloring failed');
        throw error;
    }
}

module.exports = { runColorOperation };
