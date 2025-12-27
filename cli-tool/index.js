#!/usr/bin/env node

const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const { analyzeGLB } = require('./lib/analyzer');
const { showWelcome, showSuccess } = require('./lib/ui');
const { runColorOperation } = require('./lib/operations/color');
const { runBrightnessOperation } = require('./lib/operations/brightness');
const { runScaleOperation } = require('./lib/operations/scale');
const { runMirrorOperation } = require('./lib/operations/mirror');
const { runTargetedColorOperation } = require('./lib/operations/targeted-color');

async function main() {
    console.clear();
    showWelcome();

    // Step 1: File Selection - Choose method
    const { selectionMethod } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectionMethod',
            message: 'How would you like to select the GLB file?',
            choices: [
                { name: '🗂️  Browse files (navigate with arrow keys)', value: 'browse' },
                { name: '⌨️  Enter file path manually', value: 'manual' }
            ]
        }
    ]);

    let inputFile;
    if (selectionMethod === 'browse') {
        const { browseForFile } = require('./lib/file-browser');
        inputFile = await browseForFile(process.cwd());
    } else {
        const result = await inquirer.prompt([
            {
                type: 'input',
                name: 'inputFile',
                message: '📁 Enter path to GLB file:',
                validate: (input) => {
                    if (!input) return 'Please provide a file path';
                    if (!fs.existsSync(input)) return 'File does not exist';
                    if (!input.endsWith('.glb')) return 'File must be a .glb file';
                    return true;
                }
            }
        ]);
        inputFile = result.inputFile;
    }

    // Analyze the file
    const spinner = ora('Analyzing GLB file...').start();
    let fileInfo;
    try {
        fileInfo = await analyzeGLB(inputFile);
        spinner.succeed('GLB file loaded');

        console.log(chalk.cyan('\n📊 Model Information:'));
        console.log(chalk.gray(`   Size: ${fileInfo.fileSizeMB} MB`));
        console.log(chalk.gray(`   Dimensions: ${fileInfo.width}cm × ${fileInfo.height}cm × ${fileInfo.depth}cm`));
        console.log(chalk.gray(`   Materials: ${fileInfo.materialCount}`));
        console.log(chalk.gray(`   Textures: ${fileInfo.textureCount}`));
        console.log();
    } catch (error) {
        spinner.fail('Failed to analyze GLB');
        console.error(chalk.red(error.message));
        process.exit(1);
    }

    // Step 2: Operation Selection
    const { operation } = await inquirer.prompt([
        {
            type: 'list',
            name: 'operation',
            message: 'What would you like to do?',
            choices: [
                { name: '🎨 Change color', value: 'color' },
                { name: '🎯 Targeted color change (selective)', value: 'targeted' },
                { name: '💡 Adjust brightness/darkness', value: 'brightness' },
                { name: '📏 Scale to real dimensions', value: 'scale' },
                { name: '🪞 Mirror/flip model', value: 'mirror' },
                new inquirer.Separator(),
                { name: '📊 Just analyze/inspect', value: 'inspect' },
                { name: '❌ Exit', value: 'exit' }
            ]
        }
    ]);

    if (operation === 'exit') {
        console.log(chalk.yellow('👋 Goodbye!'));
        process.exit(0);
    }

    if (operation === 'inspect') {
        console.log(chalk.green('\n✅ Analysis complete. See information above.'));
        process.exit(0);
    }

    // Execute selected operation
    let outputPath;
    try {
        switch (operation) {
            case 'color':
                outputPath = await runColorOperation(inputFile, fileInfo);
                break;
            case 'targeted':
                outputPath = await runTargetedColorOperation(inputFile, fileInfo);
                break;
            case 'brightness':
                outputPath = await runBrightnessOperation(inputFile, fileInfo);
                break;
            case 'scale':
                outputPath = await runScaleOperation(inputFile, fileInfo);
                break;
            case 'mirror':
                outputPath = await runMirrorOperation(inputFile, fileInfo);
                break;
        }

        if (outputPath) {
            showSuccess(outputPath);
        }
    } catch (error) {
        console.error(chalk.red('\n❌ Error:'), error.message);
        process.exit(1);
    }
}

// Run the wizard
main().catch(console.error);
