const chalk = require('chalk');

function showWelcome() {
    console.log(chalk.cyan('━'.repeat(70)));
    console.log(chalk.cyan.bold('  🎨 GLB Wizard - Furniture 3D Model Editor'));
    console.log(chalk.cyan('━'.repeat(70)));
    console.log();
}

function showSuccess(outputPath) {
    const fs = require('fs');
    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log();
    console.log(chalk.green('━'.repeat(70)));
    console.log(chalk.green.bold('  ✅ Success!'));
    console.log(chalk.green('━'.repeat(70)));
    console.log();
    console.log(chalk.white(`  💾 Saved: ${outputPath}`));
    console.log(chalk.gray(`     Size: ${sizeMB} MB`));
    console.log();
    console.log(chalk.green('━'.repeat(70)));
}

module.exports = {
    showWelcome,
    showSuccess
};
