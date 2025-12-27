const { NodeIO } = require('@gltf-transform/core');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const path = require('path');

async function runMirrorOperation(inputFile, fileInfo) {
    console.log(chalk.cyan('\n🪞 Mirror/Flip Model'));
    console.log(chalk.cyan('━'.repeat(70)));

    // Get mirror axis
    const { axis } = await inquirer.prompt([
        {
            type: 'list',
            name: 'axis',
            message: 'Mirror axis:',
            choices: [
                { name: 'X-axis (left ↔ right)', value: 'x' },
                { name: 'Y-axis (top ↔ bottom)', value: 'y' },
                { name: 'Z-axis (front ↔ back)', value: 'z' }
            ]
        }
    ]);

    // Process the model
    const spinner = ora('Processing...').start();

    try {
        spinner.text = 'Loading GLB...';
        const io = new NodeIO();
        const document = await io.read(inputFile);
        const root = document.getRoot();

        spinner.text = `Mirroring on ${axis.toUpperCase()}-axis...`;

        // Mirror by negating scale on chosen axis
        const scenes = root.listScenes();
        scenes.forEach(scene => {
            scene.listChildren().forEach(node => {
                const scale = node.getScale();
                if (axis === 'x') {
                    node.setScale([-scale[0], scale[1], scale[2]]);
                } else if (axis === 'y') {
                    node.setScale([scale[0], -scale[1], scale[2]]);
                } else if (axis === 'z') {
                    node.setScale([scale[0], scale[1], -scale[2]]);
                }
            });
        });

        // Fix face winding
        spinner.text = 'Fixing face winding...';
        const meshes = root.listMeshes();
        meshes.forEach(mesh => {
            mesh.listPrimitives().forEach(prim => {
                const indices = prim.getIndices();
                if (indices) {
                    const indexArray = indices.getArray();

                    // Reverse triangle winding
                    for (let i = 0; i < indexArray.length; i += 3) {
                        const temp = indexArray[i + 1];
                        indexArray[i + 1] = indexArray[i + 2];
                        indexArray[i + 2] = temp;
                    }

                    indices.setArray(indexArray);
                }

                // Make double-sided
                const material = prim.getMaterial();
                if (material) {
                    material.setDoubleSided(true);
                }
            });
        });

        // Generate suggested output filename
        const dir = path.dirname(inputFile);
        const basename = path.basename(inputFile, '.glb');
        const suggestedName = `${basename}-mirrored-${axis}.glb`;

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

        spinner.succeed(chalk.green('Mirroring complete!'));

        console.log(chalk.gray(`\n   Mirrored on ${axis.toUpperCase()}-axis`));
        console.log(chalk.gray(`   Face winding: Fixed`));
        console.log(chalk.gray(`   Materials: Set to double-sided`));

        return outputPath;
    } catch (error) {
        spinner.fail('Mirroring failed');
        throw error;
    }
}

module.exports = { runMirrorOperation };
