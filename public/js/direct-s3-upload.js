/**
 * Direct S3 upload handler for large files (up to 100MB)
 * Bypasses Vercel's 4.5MB function payload limit
 */

async function uploadToS3Direct(file, metadata = {}) {
    try {
        // Step 1: Get presigned upload URL from our API
        console.log('📤 Requesting S3 upload URL...');
        console.log('File details:', {
            name: file.name,
            type: file.type,
            size: file.size,
            sizeMB: (file.size / (1024 * 1024)).toFixed(2) + 'MB'
        });

        const urlResponse = await fetch('/api/get-upload-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: file.name,
                fileType: file.type || 'model/gltf-binary',
                fileSize: file.size
            })
        }).catch(err => {
            console.error('Network error calling /api/get-upload-url:', err);
            throw new Error('Network error: Could not connect to server');
        });

        if (!urlResponse.ok) {
            const error = await urlResponse.json();
            throw new Error(error.error || 'Failed to get upload URL');
        }

        const { uploadUrl, modelId, finalUrl } = await urlResponse.json();
        console.log('✅ Got S3 presigned URL, model ID:', modelId);

        // Step 2: Upload directly to S3
        console.log('☁️ Uploading to S3...');
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'model/gltf-binary'
                // Note: Content-Length is automatically set by browser
            },
            body: file
        });

        if (!uploadResponse.ok) {
            throw new Error(`S3 upload failed: ${uploadResponse.statusText}`);
        }
        console.log('✅ File uploaded to S3 successfully');

        // Step 3: Save metadata to our database
        console.log('💾 Saving metadata...');
        const metadataResponse = await fetch('/api/save-model-metadata', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                modelId,
                awsUrl: finalUrl,
                fileSize: file.size,
                ...metadata
            })
        });

        if (!metadataResponse.ok) {
            const error = await metadataResponse.json();
            throw new Error(error.error || 'Failed to save metadata');
        }

        const result = await metadataResponse.json();
        console.log('✅ Upload complete:', result);

        return {
            success: true,
            ...result,
            modelId,
            awsUrl: finalUrl
        };

    } catch (error) {
        console.error('❌ Upload failed:', error);
        throw error;
    }
}

// Helper function to update progress (can be customized)
function updateUploadProgress(percent, status) {
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const uploadStatus = document.getElementById('uploadStatus');

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercentage) progressPercentage.textContent = `${percent}%`;
    if (uploadStatus) uploadStatus.textContent = status;
}

// Export for use in admin.html
window.uploadToS3Direct = uploadToS3Direct;
window.updateUploadProgress = updateUploadProgress;