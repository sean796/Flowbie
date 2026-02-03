/**
 * WordPress Media Routes
 * POST /upload-media - Upload media to WordPress
 */

const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { normalizeUrl, getAuthConfig } = require('./utils');

const router = express.Router();

/**
 * Upload media to WordPress
 * POST /upload-media
 */
router.post('/upload-media', async (req, res) => {
  try {
    const { siteUrl, username, appPassword, imageBase64, filename, title, alt } = req.body;
    const altText = typeof alt === 'string' ? alt.trim() : (req.body.altText && typeof req.body.altText === 'string' ? req.body.altText.trim() : null);
    
    if (!siteUrl || !username || !appPassword || !imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, imageBase64'
      });
    }
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(siteUrl);
    
    // Extract base64 data (remove data URL prefix if present)
    let base64Data = imageBase64;
    let mimeType = 'image/png';
    
    if (base64Data.includes(',')) {
      const parts = base64Data.split(',');
      const dataPart = parts[1];
      const headerPart = parts[0];
      
      // Extract mime type from data URL
      const mimeMatch = headerPart.match(/data:([^;]+)/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
      base64Data = dataPart;
    }
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Determine file extension from mime type
    let extension = 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      extension = 'jpg';
    } else if (mimeType.includes('webp')) {
      extension = 'webp';
    } else if (mimeType.includes('gif')) {
      extension = 'gif';
    }
    
    const finalFilename = filename || `image-${Date.now()}.${extension}`;
    
    console.log(`[WordPress] Uploading media: ${finalFilename} (${imageBuffer.length} bytes)`);
    
    try {
      // WordPress REST API media endpoint
      const mediaUrl = `${normalizedUrl}/wp-json/wp/v2/media`;
      
      // Create FormData-like multipart/form-data request
      const form = new FormData();
      
      form.append('file', imageBuffer, {
        filename: finalFilename,
        contentType: mimeType,
      });
      
      if (title) {
        form.append('title', title);
      }
      
      const authConfig = getAuthConfig(username, appPassword, {
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      
      const response = await axios.post(mediaUrl, form, {
        ...authConfig,
        headers: {
          ...authConfig.headers,
          ...form.getHeaders(),
          'Content-Disposition': `attachment; filename="${finalFilename}"`,
        },
      });
      
      if (response.status === 201 || response.status === 200) {
        const media = response.data;
        console.log(`[WordPress] Media uploaded successfully: ID ${media.id}`);

        // Rank Math: set alt text (Focus Keyword in alt) via PATCH if provided
        if (altText) {
          try {
            const patchUrl = `${normalizedUrl}/wp-json/wp/v2/media/${media.id}`;
            await axios.patch(patchUrl, { alt_text: altText }, getAuthConfig(username, appPassword, { timeout: 10000 }));
            console.log(`[WordPress] Media alt text set for ID ${media.id}`);
          } catch (patchErr) {
            console.warn('[WordPress] Failed to set media alt text (upload succeeded):', patchErr.message || patchErr);
          }
        }

        res.json({
          success: true,
          mediaId: media.id,
          url: media.source_url || media.url,
          link: media.link,
          title: media.title?.rendered || media.title || title || finalFilename,
        });
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          return res.json({
            success: false,
            error: 'Authentication failed. Please verify your username and application password.'
          });
        } else if (error.response.status === 413) {
          return res.json({
            success: false,
            error: 'File too large. WordPress may have upload size limits.'
          });
        } else {
          return res.json({
            success: false,
            error: `WordPress API error: ${error.response.status} ${error.response.statusText}`
          });
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return res.json({
          success: false,
          error: 'Cannot reach WordPress site. Please check the URL.'
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('[WordPress] Upload media error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while uploading media'
    });
  }
});

module.exports = router;



