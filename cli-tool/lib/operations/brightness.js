const { NodeIO } = require('@gltf-transform/core');
const sharp = require('sharp');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const path = require('path');

async function runBrightnessOperation(inputFile, fileInfo) {
    console.log(chalk.cyan('\n💡 Brightness & Saturation'));
    console.log(chalk.cyan('━'.repeat(70)));

    // Get brightness adjustment
    const { brightnessPercent } = await inquirer.prompt([
        {
            type: 'number',
            name: 'brightnessPercent',
            message: 'Brightness adjustment (-50 to +50, 0 = no change):',
            default: 0,
            validate: (input) => {
                if (input < -50 || input > 50) return 'Must be between -50 and +50';
                return true;
            }
        }
    ]);

    // Get saturation adjustment
    const { saturationPercent } = await inquirer.prompt([
        {
            type: 'number',
            name: 'saturationPercent',
            message: 'Saturation adjustment (-50 to +50, 0 = no change):',
            default: 0,
            validate: (input) => {
                if (input < -50 || input > 50) return 'Must be between -50 and +50';
                return true;
            }
        }
    ]);

    if (brightnessPercent === 0 && saturationPercent === 0) {
        console.log(chalk.yellow('\n⚠️  No changes specified. Exiting.'));
        process.exit(0);
    }

    // Process the model
    const spinner = ora('Processing...').start();

    try {
        spinner.text = 'Loading GLB...';
        const io = new NodeIO();
        const document = await io.read(inputFile);
        const root = document.getRoot();

        // Calculate modulation values
        const brightnessFactor = 1 + (brightnessPercent / 100);
        const saturationFactor = 1 + (saturationPercent / 100);

        // Adjust textures
        const textures = root.listTextures();
        spinner.text = `Adjusting ${textures.length} texture(s)...`;

        for (let i = 0; i < textures.length; i++) {
            const texture = textures[i];
            const imageData = texture.getImage();

            const adjustedImage = await sharp(Buffer.from(imageData))
                .modulate({
                    brightness: brightnessFactor,
                    saturation: saturationFactor
                })
                .png()
                .toBuffer();

            texture.setImage(new Uint8Array(adjustedImage));
            texture.setMimeType('image/png');
        }

        // Adjust materials
        spinner.text = 'Updating materials...';
        const materials = root.listMaterials();
        materials.forEach(mat => {
            const oldColor = mat.getBaseColorFactor();
            const newColor = [
                Math.min(oldColor[0] * brightnessFactor, 1.0),
                Math.min(oldColor[1] * brightnessFactor, 1.0),
                Math.min(oldColor[2] * brightnessFactor, 1.0),
                oldColor[3]
            ];
            mat.setBaseColorFactor(newColor);
        });

        // Generate suggested output filename
        const dir = path.dirname(inputFile);
        const basename = path.basename(inputFile, '.glb');
        const suffix = brightnessPercent > 0 ? `bright${brightnessPercent}` :
                       brightnessPercent < 0 ? `dark${Math.abs(brightnessPercent)}` :
                       `sat${saturationPercent}`;
        const suggestedName = `${basename}-${suffix}.glb`;

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

        spinner.succeed(chalk.green('Adjustment complete!'));

        console.log(chalk.gray(`\n   Brightness: ${brightnessPercent > 0 ? '+' : ''}${brightnessPercent}%`));
        console.log(chalk.gray(`   Saturation: ${saturationPercent > 0 ? '+' : ''}${saturationPercent}%`));

        return outputPath;
    } catch (error) {
        spinner.fail('Adjustment failed');
        throw error;
    }
}

module.exports = { runBrightnessOperation };
