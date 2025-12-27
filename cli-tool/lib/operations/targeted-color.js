const { NodeIO } = require('@gltf-transform/core');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const path = require('path');
const {
    analyzeColorGroups,
    applySelectiveTransformation,
    calculateRecommendedTolerance,
    simulateTransformation
} = require('../color-analyzer');

async function runTargetedColorOperation(inputFile, fileInfo) {
    console.log(chalk.cyan('\n🎯 Targeted Color Change'));
    console.log(chalk.cyan('━'.repeat(70)));
    console.log(chalk.gray('Change only specific colors while keeping others unchanged\n'));

    // Load model and texture
    const spinner = ora('Analyzing texture...').start();

    try {
        const io = new NodeIO();
        const document = await io.read(inputFile);
        const root = document.getRoot();
        const textures = root.listTextures();

        if (textures.length === 0) {
            spinner.fail('No textures found in model');
            return;
        }

        const texture = textures[0];
        const imageData = texture.getImage();

        // Analyze color groups
        const colorGroups = await analyzeColorGroups(imageData, 3);

        spinner.succeed('Texture analyzed');

        // Display found color groups with likely material type
        console.log(chalk.cyan('\n📊 Detected Color Groups:\n'));
        colorGroups.forEach((group, idx) => {
            const brightLabel = group.brightness < 40 ? 'Dark' : group.brightness < 120 ? 'Medium' : 'Light';
            const likelyMaterial = group.brightness < 40 ? '(Likely: Legs/Frame/Shadows)' : '(Likely: Fabric/Surface)';

            console.log(chalk.gray(`  ${idx + 1}. ${brightLabel} - ${group.hex} ${likelyMaterial}`));
            console.log(chalk.gray(`     Coverage: ${group.percentage}% of texture`));
            console.log(chalk.gray(`     Brightness: ${group.brightness}/255\n`));
        });

        // Step 1: Selection method
        const { selectionMethod } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectionMethod',
                message: 'How do you want to select which colors to change?',
                choices: [
                    { name: '📊 Pick from detected groups (recommended)', value: 'groups' },
                    { name: '🎨 Enter specific hex code (precise)', value: 'hex' },
                    { name: '💡 Use brightness threshold (simple)', value: 'brightness' }
                ]
            }
        ]);

        let selectionCriteria = {};

        if (selectionMethod === 'groups') {
            // Pick from detected groups (multi-select)
            const choices = colorGroups.map((group, idx) => {
                const brightLabel = group.brightness < 40 ? 'Dark' : group.brightness < 120 ? 'Medium' : 'Light';
                return {
                    name: `${brightLabel} ${group.hex} (${group.percentage}% of texture)`,
                    value: idx
                };
            });

            const { selectedGroups } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'selectedGroups',
                    message: 'Which color groups to change? (use space to select, enter to confirm)',
                    choices,
                    validate: (input) => {
                        if (input.length === 0) return 'Please select at least one group';
                        return true;
                    }
                }
            ]);

            // Calculate smart tolerance based on color distance between groups
            const unselectedGroups = colorGroups
                .map((g, idx) => idx)
                .filter(idx => !selectedGroups.includes(idx));

            const recommendedTolerance = calculateRecommendedTolerance(
                selectedGroups,
                unselectedGroups,
                colorGroups
            );

            console.log(chalk.yellow(`\n⚡ Recommended tolerance: ${recommendedTolerance}`));
            console.log(chalk.gray('   (Calculated based on color distance between your selected and unselected groups)\n'));

            const { tolerance } = await inquirer.prompt([
                {
                    type: 'number',
                    name: 'tolerance',
                    message: 'Color matching tolerance (0-100, lower = more precise):',
                    default: recommendedTolerance,
                    validate: (input) => {
                        if (input < 0 || input > 100) return 'Must be between 0 and 100';
                        return true;
                    }
                }
            ]);

            console.log(chalk.gray('\nTolerance guide:'));
            console.log(chalk.gray('  0-15: Very precise (only exact cluster colors)'));
            console.log(chalk.gray('  15-25: Recommended (catches variations)'));
            console.log(chalk.gray('  25-40: Loose (may catch nearby groups)'));
            console.log(chalk.gray('  40+: Very loose (not recommended)\n'));

            // Store multiple groups
            selectionCriteria = {
                type: 'clusters',  // plural
                values: selectedGroups.map(idx => colorGroups[idx].color),
                threshold: tolerance
            };

            const selectedHexes = selectedGroups.map(idx => colorGroups[idx].hex).join(', ');
            const unselectedHexes = unselectedGroups.map(idx => colorGroups[idx].hex).join(', ');

            console.log(chalk.yellow(`\n⚡ Will change ${selectedGroups.length} color group(s): ${selectedHexes}`));

            if (unselectedGroups.length > 0) {
                console.log(chalk.green(`✓ Will keep unchanged: ${unselectedHexes}`));
            }

        } else if (selectionMethod === 'hex') {
            // User enters specific hex
            const { sourceHex } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'sourceHex',
                    message: 'Enter the color to replace (hex):',
                    validate: (input) => {
                        if (!/^#[0-9A-Fa-f]{6}$/.test(input)) {
                            return 'Invalid hex color. Format: #RRGGBB';
                        }
                        return true;
                    }
                }
            ]);

            const { tolerance } = await inquirer.prompt([
                {
                    type: 'number',
                    name: 'tolerance',
                    message: 'Color similarity tolerance (0-100):',
                    default: 25,
                    validate: (input) => {
                        if (input < 0 || input > 100) return 'Must be between 0 and 100';
                        return true;
                    }
                }
            ]);

            const r = parseInt(sourceHex.substr(1, 2), 16);
            const g = parseInt(sourceHex.substr(3, 2), 16);
            const b = parseInt(sourceHex.substr(5, 2), 16);

            selectionCriteria = {
                type: 'color-match',
                value: { r, g, b },
                threshold: tolerance
            };

            console.log(chalk.yellow(`\n⚡ Will change colors similar to ${sourceHex} (tolerance: ${tolerance})`));

        } else if (selectionMethod === 'brightness') {
            // Brightness threshold
            console.log(chalk.cyan('\nBrightness values from your texture:'));
            colorGroups.forEach((group, idx) => {
                console.log(chalk.gray(`  Group ${idx + 1}: brightness ${group.brightness}/255`));
            });
            console.log();

            const { brightnessMode } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'brightnessMode',
                    message: 'Change pixels with brightness:',
                    choices: [
                        { name: 'Above threshold (keep dark areas like legs)', value: 'above' },
                        { name: 'Below threshold (keep light areas)', value: 'below' },
                        { name: 'Between range (change mid-tones only)', value: 'between' }
                    ]
                }
            ]);

            if (brightnessMode === 'between') {
                const { minBright, maxBright } = await inquirer.prompt([
                    {
                        type: 'number',
                        name: 'minBright',
                        message: 'Minimum brightness (0-255):',
                        default: 40,
                        validate: (input) => input >= 0 && input <= 255 ? true : 'Must be 0-255'
                    },
                    {
                        type: 'number',
                        name: 'maxBright',
                        message: 'Maximum brightness (0-255):',
                        default: 120,
                        validate: (input) => input >= 0 && input <= 255 ? true : 'Must be 0-255'
                    }
                ]);

                selectionCriteria = {
                    type: 'brightness-between',
                    value: { min: minBright, max: maxBright }
                };

                console.log(chalk.yellow(`\n⚡ Will change pixels with brightness ${minBright}-${maxBright}`));
            } else {
                const { threshold } = await inquirer.prompt([
                    {
                        type: 'number',
                        name: 'threshold',
                        message: 'Brightness threshold (0-255):',
                        default: 40,
                        validate: (input) => input >= 0 && input <= 255 ? true : 'Must be 0-255'
                    }
                ]);

                selectionCriteria = {
                    type: brightnessMode === 'above' ? 'brightness-above' : 'brightness-below',
                    value: threshold
                };

                console.log(chalk.yellow(`\n⚡ Will change pixels ${brightnessMode} brightness ${threshold}`));
            }
        }

        // Step 2: Target color
        console.log();
        const { targetHex } = await inquirer.prompt([
            {
                type: 'input',
                name: 'targetHex',
                message: 'Replace with color (hex):',
                validate: (input) => {
                    if (!/^#[0-9A-Fa-f]{6}$/.test(input)) {
                        return 'Invalid hex color. Format: #RRGGBB';
                    }
                    return true;
                }
            }
        ]);

        // Step 3: Preview transformation
        console.log(chalk.cyan('\n🔍 Preview'));
        console.log(chalk.cyan('━'.repeat(70)));

        const previewSpinner = ora('Analyzing what will change...').start();
        const preview = await simulateTransformation(imageData, selectionCriteria);
        previewSpinner.succeed('Preview ready');

        console.log(chalk.green(`\n   ✓ Will change: ${preview.matchedPixels.toLocaleString()} pixels (${preview.matchedPercent}%)`));
        console.log(chalk.gray(`   • Keep unchanged: ${preview.unmatchedPixels.toLocaleString()} pixels (${preview.unmatchedPercent}%)`));
        console.log(chalk.gray(`   • Total pixels: ${preview.totalPixels.toLocaleString()}\n`));

        const { proceed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'proceed',
                message: 'Does this look right? Proceed with transformation?',
                default: true
            }
        ]);

        if (!proceed) {
            console.log(chalk.yellow('\n❌ Transformation cancelled. Run again to adjust settings.'));
            return;
        }

        // Step 4: Transformation mode
        const { transformMode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'transformMode',
                message: 'Transformation mode:',
                choices: [
                    { name: '✨ Smart Replace (works with any color)', value: 'replace' },
                    { name: '🎨 Tint (preserves relative brightness)', value: 'tint' }
                ]
            }
        ]);

        // Apply transformation
        const processingSpinner = ora('Processing texture...').start();

        const transformedImage = await applySelectiveTransformation(
            imageData,
            selectionCriteria,
            { hex: targetHex },
            transformMode
        );

        texture.setImage(new Uint8Array(transformedImage));
        texture.setMimeType('image/png');

        // Update material base color
        const materials = root.listMaterials();
        const targetR = parseInt(targetHex.substr(1, 2), 16);
        const targetG = parseInt(targetHex.substr(3, 2), 16);
        const targetB = parseInt(targetHex.substr(5, 2), 16);
        materials.forEach(mat => {
            mat.setBaseColorFactor([targetR / 255, targetG / 255, targetB / 255, 1.0]);
        });

        processingSpinner.succeed('Transformation complete');

        // Save file
        const dir = path.dirname(inputFile);
        const basename = path.basename(inputFile, '.glb');
        const suggestedName = `${basename}-targeted-${targetHex.replace('#', '')}.glb`;

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

        const saveSpinner = ora('Saving GLB...').start();
        await io.write(outputPath, document);
        saveSpinner.succeed(chalk.green('Targeted color change complete!'));

        console.log(chalk.gray(`\n   Target color: ${targetHex}`));
        console.log(chalk.gray(`   Mode: ${transformMode === 'replace' ? 'Smart Replace' : 'Tint'}`));

        return outputPath;

    } catch (error) {
        spinner.fail('Operation failed');
        throw error;
    }
}

module.exports = { runTargetedColorOperation };
