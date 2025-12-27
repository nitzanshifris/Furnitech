const { NodeIO } = require('@gltf-transform/core');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const path = require('path');

async function runScaleOperation(inputFile, fileInfo) {
    console.log(chalk.cyan('\n📏 Scale to Real Dimensions'));
    console.log(chalk.cyan('━'.repeat(70)));

    console.log(chalk.gray(`Current dimensions: ${fileInfo.width}cm × ${fileInfo.height}cm × ${fileInfo.depth}cm\n`));

    // Step 1: Choose scaling method
    const { scalingMethod } = await inquirer.prompt([
        {
            type: 'list',
            name: 'scalingMethod',
            message: 'Choose scaling method:',
            choices: [
                { name: '⚖️  Uniform scaling (maintains proportions)', value: 'uniform' },
                { name: '📐 Non-uniform scaling (independent X, Y, Z)', value: 'nonuniform' },
                { name: '📋 Copy dimensions from another GLB model', value: 'copy' }
            ]
        }
    ]);

    let scaleX, scaleY, scaleZ;
    let targetWidth, targetHeight, targetDepth;

    if (scalingMethod === 'uniform') {
        // Step 2: Choose which dimension to base scaling on
        const { baseDimension } = await inquirer.prompt([
            {
                type: 'list',
                name: 'baseDimension',
                message: 'Base uniform scaling on which dimension?',
                choices: [
                    { name: `Width (X) - currently ${fileInfo.width}cm`, value: 'x' },
                    { name: `Height (Y) - currently ${fileInfo.height}cm`, value: 'y' },
                    { name: `Depth (Z) - currently ${fileInfo.depth}cm`, value: 'z' }
                ]
            }
        ]);

        // Get target dimension
        const dimensionName = baseDimension === 'x' ? 'width' : baseDimension === 'y' ? 'height' : 'depth';
        const currentValue = baseDimension === 'x' ? fileInfo.width : baseDimension === 'y' ? fileInfo.height : fileInfo.depth;

        const { targetDimension } = await inquirer.prompt([
            {
                type: 'number',
                name: 'targetDimension',
                message: `Target ${dimensionName} in cm:`,
                validate: (input) => {
                    if (input <= 0) return 'Must be positive';
                    return true;
                }
            }
        ]);

        // Calculate ABSOLUTE scale factor based on raw mesh dimensions
        // target_cm / 100 = target_meters
        // target_meters / raw_dimension = absolute_scale
        const rawDimension = baseDimension === 'x' ? fileInfo.rawWidth :
                             baseDimension === 'y' ? fileInfo.rawHeight :
                             fileInfo.rawDepth;

        const targetMeters = targetDimension / 100;  // Convert cm to meters
        const absoluteScale = targetMeters / rawDimension;

        scaleX = scaleY = scaleZ = absoluteScale;

        // Calculate resulting dimensions
        targetWidth = (fileInfo.rawWidth * absoluteScale * 100).toFixed(1);
        targetHeight = (fileInfo.rawHeight * absoluteScale * 100).toFixed(1);
        targetDepth = (fileInfo.rawDepth * absoluteScale * 100).toFixed(1);

        console.log(chalk.yellow(`\n⚡ Absolute scale: ${absoluteScale.toFixed(4)}`));
        console.log(chalk.gray(`   Result: ${targetWidth}cm × ${targetHeight}cm × ${targetDepth}cm\n`));

        // Ask if user wants to refine with non-uniform scaling
        const { refine } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'refine',
                message: 'Adjust further with non-uniform scaling?',
                default: false
            }
        ]);

        if (refine) {
            console.log(chalk.cyan('\n📐 Non-uniform adjustment'));
            console.log(chalk.gray(`Current result: ${targetWidth}cm × ${targetHeight}cm × ${targetDepth}cm\n`));

            const adjustments = await inquirer.prompt([
                {
                    type: 'number',
                    name: 'adjWidth',
                    message: 'Target width (X) in cm:',
                    default: parseFloat(targetWidth),
                    validate: (input) => input > 0 ? true : 'Must be positive'
                },
                {
                    type: 'number',
                    name: 'adjHeight',
                    message: 'Target height (Y) in cm:',
                    default: parseFloat(targetHeight),
                    validate: (input) => input > 0 ? true : 'Must be positive'
                },
                {
                    type: 'number',
                    name: 'adjDepth',
                    message: 'Target depth (Z) in cm:',
                    default: parseFloat(targetDepth),
                    validate: (input) => input > 0 ? true : 'Must be positive'
                }
            ]);

            // Recalculate ABSOLUTE scale with adjustments
            scaleX = (adjustments.adjWidth / 100) / fileInfo.rawWidth;
            scaleY = (adjustments.adjHeight / 100) / fileInfo.rawHeight;
            scaleZ = (adjustments.adjDepth / 100) / fileInfo.rawDepth;

            targetWidth = adjustments.adjWidth.toFixed(1);
            targetHeight = adjustments.adjHeight.toFixed(1);
            targetDepth = adjustments.adjDepth.toFixed(1);

            console.log(chalk.yellow(`\n⚡ Applying non-uniform absolute scale:`));
            console.log(chalk.gray(`   X: ${fileInfo.width}cm → ${targetWidth}cm (scale=${scaleX.toFixed(4)})`));
            console.log(chalk.gray(`   Y: ${fileInfo.height}cm → ${targetHeight}cm (scale=${scaleY.toFixed(4)})`));
            console.log(chalk.gray(`   Z: ${fileInfo.depth}cm → ${targetDepth}cm (scale=${scaleZ.toFixed(4)})`));
        }
    } else if (scalingMethod === 'nonuniform') {
        // Non-uniform scaling from the start
        const dimensions = await inquirer.prompt([
            {
                type: 'number',
                name: 'targetWidth',
                message: 'Target width (X) in cm:',
                validate: (input) => input > 0 ? true : 'Must be positive'
            },
            {
                type: 'number',
                name: 'targetHeight',
                message: 'Target height (Y) in cm:',
                validate: (input) => input > 0 ? true : 'Must be positive'
            },
            {
                type: 'number',
                name: 'targetDepth',
                message: 'Target depth (Z) in cm:',
                validate: (input) => input > 0 ? true : 'Must be positive'
            }
        ]);

        // Calculate ABSOLUTE scale for non-uniform
        scaleX = (dimensions.targetWidth / 100) / fileInfo.rawWidth;
        scaleY = (dimensions.targetHeight / 100) / fileInfo.rawHeight;
        scaleZ = (dimensions.targetDepth / 100) / fileInfo.rawDepth;

        targetWidth = dimensions.targetWidth.toFixed(1);
        targetHeight = dimensions.targetHeight.toFixed(1);
        targetDepth = dimensions.targetDepth.toFixed(1);

        console.log(chalk.yellow(`\n⚡ Applying non-uniform absolute scale:`));
        console.log(chalk.gray(`   X: ${fileInfo.width}cm → ${targetWidth}cm (scale=${scaleX.toFixed(4)})`));
        console.log(chalk.gray(`   Y: ${fileInfo.height}cm → ${targetHeight}cm (scale=${scaleY.toFixed(4)})`));
        console.log(chalk.gray(`   Z: ${fileInfo.depth}cm → ${targetDepth}cm (scale=${scaleZ.toFixed(4)})`));
    } else {
        // Copy dimensions from another GLB model
        console.log(chalk.cyan('\n📋 Copy Dimensions from Another Model\n'));

        // Ask user to select a reference GLB file
        const { referenceSelectionMethod } = await inquirer.prompt([
            {
                type: 'list',
                name: 'referenceSelectionMethod',
                message: 'How would you like to select the reference GLB file?',
                choices: [
                    { name: '🗂️  Browse files (navigate with arrow keys)', value: 'browse' },
                    { name: '⌨️  Enter file path manually', value: 'manual' }
                ]
            }
        ]);

        let referenceFile;
        if (referenceSelectionMethod === 'browse') {
            const { browseForFile } = require('../file-browser');
            referenceFile = await browseForFile(path.dirname(inputFile));
        } else {
            const fs = require('fs');
            const result = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'referenceFile',
                    message: '📁 Enter path to reference GLB file:',
                    validate: (input) => {
                        if (!input) return 'Please provide a file path';
                        if (!fs.existsSync(input)) return 'File does not exist';
                        if (!input.endsWith('.glb')) return 'File must be a .glb file';
                        return true;
                    }
                }
            ]);
            referenceFile = result.referenceFile;
        }

        // Analyze the reference file
        const refSpinner = ora('Analyzing reference GLB file...').start();
        const { analyzeGLB } = require('../analyzer');
        let referenceInfo;
        try {
            referenceInfo = await analyzeGLB(referenceFile);
            refSpinner.succeed('Reference GLB analyzed');

            console.log(chalk.cyan('\n📏 Reference Model Dimensions:'));
            console.log(chalk.gray(`   Width:  ${referenceInfo.width}cm`));
            console.log(chalk.gray(`   Height: ${referenceInfo.height}cm`));
            console.log(chalk.gray(`   Depth:  ${referenceInfo.depth}cm\n`));
        } catch (error) {
            refSpinner.fail('Failed to analyze reference GLB');
            throw error;
        }

        // Ask which scaling approach to use
        const { copyMethod } = await inquirer.prompt([
            {
                type: 'list',
                name: 'copyMethod',
                message: 'How should dimensions be copied?',
                choices: [
                    { name: '📋 Copy all dimensions exactly (non-uniform scaling)', value: 'exact' },
                    { name: '⚖️  Match one dimension, scale uniformly', value: 'uniform' }
                ]
            }
        ]);

        if (copyMethod === 'exact') {
            // Copy all dimensions exactly
            targetWidth = parseFloat(referenceInfo.width).toFixed(1);
            targetHeight = parseFloat(referenceInfo.height).toFixed(1);
            targetDepth = parseFloat(referenceInfo.depth).toFixed(1);

            // Calculate ABSOLUTE scale for each axis
            scaleX = (parseFloat(targetWidth) / 100) / fileInfo.rawWidth;
            scaleY = (parseFloat(targetHeight) / 100) / fileInfo.rawHeight;
            scaleZ = (parseFloat(targetDepth) / 100) / fileInfo.rawDepth;

            console.log(chalk.yellow(`\n⚡ Copying exact dimensions:`));
            console.log(chalk.gray(`   X: ${fileInfo.width}cm → ${targetWidth}cm (scale=${scaleX.toFixed(4)})`));
            console.log(chalk.gray(`   Y: ${fileInfo.height}cm → ${targetHeight}cm (scale=${scaleY.toFixed(4)})`));
            console.log(chalk.gray(`   Z: ${fileInfo.depth}cm → ${targetDepth}cm (scale=${scaleZ.toFixed(4)})`));
        } else {
            // Match one dimension, scale uniformly
            const { matchDimension } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'matchDimension',
                    message: 'Which dimension should match the reference model?',
                    choices: [
                        { name: `Width (X) - reference: ${referenceInfo.width}cm`, value: 'x' },
                        { name: `Height (Y) - reference: ${referenceInfo.height}cm`, value: 'y' },
                        { name: `Depth (Z) - reference: ${referenceInfo.depth}cm`, value: 'z' }
                    ]
                }
            ]);

            const targetDimension = matchDimension === 'x' ? parseFloat(referenceInfo.width) :
                                   matchDimension === 'y' ? parseFloat(referenceInfo.height) :
                                   parseFloat(referenceInfo.depth);

            const rawDimension = matchDimension === 'x' ? fileInfo.rawWidth :
                                matchDimension === 'y' ? fileInfo.rawHeight :
                                fileInfo.rawDepth;

            const targetMeters = targetDimension / 100;
            const absoluteScale = targetMeters / rawDimension;

            scaleX = scaleY = scaleZ = absoluteScale;

            // Calculate resulting dimensions
            targetWidth = (fileInfo.rawWidth * absoluteScale * 100).toFixed(1);
            targetHeight = (fileInfo.rawHeight * absoluteScale * 100).toFixed(1);
            targetDepth = (fileInfo.rawDepth * absoluteScale * 100).toFixed(1);

            const dimName = matchDimension === 'x' ? 'width' : matchDimension === 'y' ? 'height' : 'depth';
            console.log(chalk.yellow(`\n⚡ Uniform scale based on ${dimName}: ${absoluteScale.toFixed(4)}`));
            console.log(chalk.gray(`   Result: ${targetWidth}cm × ${targetHeight}cm × ${targetDepth}cm`));
        }
    }

    // Process the model
    const spinner = ora('Processing...').start();

    try {
        spinner.text = 'Loading GLB...';
        const io = new NodeIO();
        const document = await io.read(inputFile);
        const root = document.getRoot();

        spinner.text = 'Applying scale...';

        // Apply scale to ROOT NODES ONLY (not all children recursively)
        // This matches the Python script behavior and prevents conflicts
        const scenes = root.listScenes();
        const defaultScene = scenes[0];

        if (!defaultScene) {
            throw new Error('No scene found in GLB file');
        }

        const rootNodes = defaultScene.listChildren();
        console.log(`\n   Scaling ${rootNodes.length} root node(s)...`);

        rootNodes.forEach((node, idx) => {
            const currentScale = node.getScale();

            // Preserve sign (for mirrored models with negative scale)
            const signX = currentScale[0] < 0 ? -1 : 1;
            const signY = currentScale[1] < 0 ? -1 : 1;
            const signZ = currentScale[2] < 0 ? -1 : 1;

            // SET absolute scale (not multiply)
            node.setScale([
                signX * scaleX,
                signY * scaleY,
                signZ * scaleZ
            ]);

            console.log(`   ✓ Root node ${idx}: scale = [${node.getScale()[0].toFixed(4)}, ${node.getScale()[1].toFixed(4)}, ${node.getScale()[2].toFixed(4)}]`);
        });

        // Generate suggested output filename
        const dir = path.dirname(inputFile);
        const basename = path.basename(inputFile, '.glb');
        const suggestedName = `${basename}-scaled.glb`;

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

        spinner.succeed(chalk.green('Scaling complete!'));

        console.log(chalk.gray(`\n   Final dimensions: ${targetWidth}cm × ${targetHeight}cm × ${targetDepth}cm`));
        if (scaleX === scaleY && scaleY === scaleZ) {
            console.log(chalk.gray(`   Uniform scale: ${scaleX.toFixed(4)}x`));
        } else {
            console.log(chalk.gray(`   Scale factors: X=${scaleX.toFixed(4)}x, Y=${scaleY.toFixed(4)}x, Z=${scaleZ.toFixed(4)}x`));
        }

        return outputPath;
    } catch (error) {
        spinner.fail('Scaling failed');
        throw error;
    }
}

module.exports = { runScaleOperation };
