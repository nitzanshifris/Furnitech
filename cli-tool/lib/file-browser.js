const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');

async function browseForFile(startPath = process.cwd()) {
    let currentPath = startPath;

    while (true) {
        // Read current directory
        const items = fs.readdirSync(currentPath, { withFileTypes: true });

        // Filter and format items
        const choices = [];

        // Add parent directory option if not at root
        if (currentPath !== '/') {
            choices.push({
                name: chalk.yellow('📁 ../ (go up)'),
                value: { type: 'parent' }
            });
        }

        // Add directories
        const dirs = items
            .filter(item => item.isDirectory() && !item.name.startsWith('.'))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(item => ({
                name: chalk.cyan(`📁 ${item.name}/`),
                value: { type: 'dir', name: item.name }
            }));

        // Add GLB files
        const glbFiles = items
            .filter(item => item.isFile() && item.name.endsWith('.glb'))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(item => {
                const stats = fs.statSync(path.join(currentPath, item.name));
                const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                return {
                    name: chalk.green(`📄 ${item.name}`) + chalk.gray(` (${sizeMB} MB)`),
                    value: { type: 'file', name: item.name }
                };
            });

        choices.push(...dirs, ...glbFiles);

        if (choices.length === 0 || (choices.length === 1 && choices[0].value.type === 'parent')) {
            console.log(chalk.red('\n❌ No GLB files or directories found here.'));
            currentPath = path.dirname(currentPath);
            continue;
        }

        // Show current path and prompt
        console.log(chalk.gray(`\n📂 Current: ${currentPath}`));

        const { selected } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selected',
                message: 'Select a GLB file or navigate to a folder:',
                choices,
                pageSize: 15
            }
        ]);

        if (selected.type === 'parent') {
            // Go up one directory
            currentPath = path.dirname(currentPath);
        } else if (selected.type === 'dir') {
            // Navigate into directory
            currentPath = path.join(currentPath, selected.name);
        } else if (selected.type === 'file') {
            // File selected, return full path
            return path.join(currentPath, selected.name);
        }
    }
}

module.exports = { browseForFile };
