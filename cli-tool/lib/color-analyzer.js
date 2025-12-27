const sharp = require('sharp');

/**
 * Analyzes texture and finds distinct color groups
 */
async function analyzeColorGroups(imageData, numGroups = 3) {
    const { data, info } = await sharp(imageData).raw().toBuffer({ resolveWithObject: true });

    // Sample pixels for analysis (every 200th pixel for speed)
    const samples = [];
    for (let i = 0; i < data.length; i += 3 * 200) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        samples.push({ r, g, b });
    }

    // Simple k-means clustering
    const clusters = kMeansClustering(samples, numGroups);

    // Calculate statistics for each cluster
    const groups = clusters.map((cluster, idx) => {
        const avgR = Math.round(cluster.centroid.r);
        const avgG = Math.round(cluster.centroid.g);
        const avgB = Math.round(cluster.centroid.b);
        const brightness = Math.round((avgR + avgG + avgB) / 3);
        const hex = rgbToHex(avgR, avgG, avgB);
        const percentage = ((cluster.pixels.length / samples.length) * 100).toFixed(1);

        return {
            id: idx,
            color: { r: avgR, g: avgG, b: avgB },
            hex,
            brightness,
            percentage: parseFloat(percentage),
            pixelCount: cluster.pixels.length
        };
    });

    // Sort by percentage (most common first)
    groups.sort((a, b) => b.percentage - a.percentage);

    return groups;
}

/**
 * Simple k-means clustering implementation
 */
function kMeansClustering(pixels, k, maxIterations = 10) {
    // Initialize centroids randomly
    const centroids = [];
    for (let i = 0; i < k; i++) {
        const randomIdx = Math.floor(Math.random() * pixels.length);
        centroids.push({ ...pixels[randomIdx] });
    }

    let iterations = 0;
    let changed = true;

    while (changed && iterations < maxIterations) {
        // Assign pixels to nearest centroid
        const clusters = centroids.map(() => ({ pixels: [], centroid: null }));

        for (const pixel of pixels) {
            let minDist = Infinity;
            let clusterIdx = 0;

            for (let i = 0; i < centroids.length; i++) {
                const dist = colorDistance(pixel, centroids[i]);
                if (dist < minDist) {
                    minDist = dist;
                    clusterIdx = i;
                }
            }

            clusters[clusterIdx].pixels.push(pixel);
        }

        // Update centroids
        changed = false;
        for (let i = 0; i < clusters.length; i++) {
            if (clusters[i].pixels.length === 0) continue;

            const newCentroid = {
                r: clusters[i].pixels.reduce((sum, p) => sum + p.r, 0) / clusters[i].pixels.length,
                g: clusters[i].pixels.reduce((sum, p) => sum + p.g, 0) / clusters[i].pixels.length,
                b: clusters[i].pixels.reduce((sum, p) => sum + p.b, 0) / clusters[i].pixels.length
            };

            if (colorDistance(centroids[i], newCentroid) > 1) {
                changed = true;
            }

            centroids[i] = newCentroid;
            clusters[i].centroid = newCentroid;
        }

        iterations++;
    }

    // Final assignment
    const finalClusters = centroids.map(() => ({ pixels: [], centroid: null }));
    for (const pixel of pixels) {
        let minDist = Infinity;
        let clusterIdx = 0;

        for (let i = 0; i < centroids.length; i++) {
            const dist = colorDistance(pixel, centroids[i]);
            if (dist < minDist) {
                minDist = dist;
                clusterIdx = i;
            }
        }

        finalClusters[clusterIdx].pixels.push(pixel);
    }

    for (let i = 0; i < finalClusters.length; i++) {
        finalClusters[i].centroid = centroids[i];
    }

    return finalClusters;
}

/**
 * Calculate Euclidean distance between two colors in RGB space
 */
function colorDistance(c1, c2) {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Convert RGB to hex
 */
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

/**
 * Check if a pixel matches a target color within threshold
 */
function colorMatches(pixel, targetColor, threshold) {
    const distance = colorDistance(pixel, targetColor);
    const maxDistance = Math.sqrt(255 * 255 * 3); // Max possible distance
    const normalizedDistance = (distance / maxDistance) * 100;
    return normalizedDistance <= threshold;
}

/**
 * Calculate recommended tolerance based on color distance between selected and unselected groups
 */
function calculateRecommendedTolerance(selectedGroups, unselectedGroups, colorGroups) {
    if (unselectedGroups.length === 0) {
        return 20; // Default if all groups selected
    }

    // Find minimum distance between selected and unselected groups
    let minDistance = Infinity;

    for (const selectedIdx of selectedGroups) {
        for (const unselectedIdx of unselectedGroups) {
            const selected = colorGroups[selectedIdx];
            const unselected = colorGroups[unselectedIdx];
            const dist = colorDistance(selected.color, unselected.color);
            minDistance = Math.min(minDistance, dist);
        }
    }

    // Convert to 0-100 scale, use 40% of the gap as tolerance
    const maxDistance = Math.sqrt(255 * 255 * 3); // ~441
    const normalizedGap = (minDistance / maxDistance) * 100;
    const recommendedTolerance = Math.max(10, Math.min(30, normalizedGap * 0.4));

    return Math.round(recommendedTolerance);
}

/**
 * Simulate transformation to preview how many pixels will change
 */
async function simulateTransformation(imageData, selectionCriteria) {
    const { data, info } = await sharp(imageData).raw().toBuffer({ resolveWithObject: true });
    const { type, value, values, threshold } = selectionCriteria;

    let matchedPixels = 0;
    let totalPixels = data.length / 3;

    for (let i = 0; i < data.length; i += 3) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;

        let shouldTransform = false;

        // Determine if this pixel should be transformed
        if (type === 'brightness-above') {
            shouldTransform = brightness >= value;
        } else if (type === 'brightness-below') {
            shouldTransform = brightness <= value;
        } else if (type === 'brightness-between') {
            shouldTransform = brightness >= value.min && brightness <= value.max;
        } else if (type === 'color-match') {
            shouldTransform = colorMatches({ r, g, b }, value, threshold);
        } else if (type === 'cluster') {
            shouldTransform = colorMatches({ r, g, b }, value, threshold || 30);
        } else if (type === 'clusters') {
            shouldTransform = values.some(clusterColor =>
                colorMatches({ r, g, b }, clusterColor, threshold || 30)
            );
        }

        if (shouldTransform) {
            matchedPixels++;
        }
    }

    const matchedPercent = ((matchedPixels / totalPixels) * 100).toFixed(1);
    const unmatchedPixels = totalPixels - matchedPixels;
    const unmatchedPercent = ((unmatchedPixels / totalPixels) * 100).toFixed(1);

    return {
        matchedPixels,
        matchedPercent,
        unmatchedPixels,
        unmatchedPercent,
        totalPixels
    };
}

/**
 * Apply selective color transformation to texture
 */
async function applySelectiveTransformation(imageData, selectionCriteria, targetColor, transformMode) {
    const { data, info } = await sharp(imageData).raw().toBuffer({ resolveWithObject: true });
    const outputData = Buffer.alloc(data.length);

    const { type, value, values, threshold } = selectionCriteria;

    // Parse target color
    const targetR = parseInt(targetColor.hex.substr(1, 2), 16);
    const targetG = parseInt(targetColor.hex.substr(3, 2), 16);
    const targetB = parseInt(targetColor.hex.substr(5, 2), 16);

    for (let i = 0; i < data.length; i += 3) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;

        let shouldTransform = false;

        // Determine if this pixel should be transformed
        if (type === 'brightness-above') {
            shouldTransform = brightness >= value;
        } else if (type === 'brightness-below') {
            shouldTransform = brightness <= value;
        } else if (type === 'brightness-between') {
            shouldTransform = brightness >= value.min && brightness <= value.max;
        } else if (type === 'color-match') {
            shouldTransform = colorMatches({ r, g, b }, value, threshold);
        } else if (type === 'cluster') {
            shouldTransform = colorMatches({ r, g, b }, value, threshold || 30);
        } else if (type === 'clusters') {
            // Multiple clusters - check if pixel matches ANY of them
            shouldTransform = values.some(clusterColor =>
                colorMatches({ r, g, b }, clusterColor, threshold || 30)
            );
        }

        if (shouldTransform) {
            // Apply transformation
            const targetBrightness = (targetR + targetG + targetB) / 3;
            const isTargetLight = targetBrightness > 180;

            if (transformMode === 'replace' && isTargetLight) {
                // Smart replace for light colors
                outputData[i] = Math.min(255, Math.round(r * 0.2 + targetR * 0.92));
                outputData[i + 1] = Math.min(255, Math.round(g * 0.2 + targetG * 0.90));
                outputData[i + 2] = Math.min(255, Math.round(b * 0.2 + targetB * 0.88));
            } else {
                // Tint mode (multiplicative)
                outputData[i] = Math.min(255, Math.round(r * (targetR / 255)));
                outputData[i + 1] = Math.min(255, Math.round(g * (targetG / 255)));
                outputData[i + 2] = Math.min(255, Math.round(b * (targetB / 255)));
            }
        } else {
            // Keep original
            outputData[i] = r;
            outputData[i + 1] = g;
            outputData[i + 2] = b;
        }
    }

    return sharp(outputData, {
        raw: { width: info.width, height: info.height, channels: 3 }
    }).png().toBuffer();
}

module.exports = {
    analyzeColorGroups,
    colorDistance,
    rgbToHex,
    colorMatches,
    applySelectiveTransformation,
    calculateRecommendedTolerance,
    simulateTransformation
};
