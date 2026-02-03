/**
 * Google Maps Image Generation Routes
 * POST /api/google-maps-image/generate - Generate Google Maps screenshot for entity
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const router = express.Router();

/**
 * Generate Google Maps screenshot for an entity
 * POST /api/google-maps-image/generate
 * Body: { entity: string }
 * Returns: { success: boolean, imageBase64?: string, error?: string }
 */
router.post('/generate', async (req, res) => {
  try {
    const { entity } = req.body;
    
    if (!entity || !entity.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: entity'
      });
    }
    
    const entityName = entity.trim();
    
    // Path to Python script
    const scriptPath = path.join(__dirname, 'google-maps-image', 'google_maps_screenshot.py');
    
    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({
        success: false,
        error: 'Google Maps screenshot script not found. Please ensure the script is installed.'
      });
    }
    
    console.log(`[Google Maps Image] Generating screenshot for entity: ${entityName}`);
    
    // Spawn Python process (try python3 first, fallback to python for Windows)
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    const pythonProcess = spawn(pythonCommand, [scriptPath, entityName], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    // Collect stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    // Collect stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Wait for process to complete
    const exitCode = await new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        resolve(code);
      });
      
      pythonProcess.on('error', (error) => {
        console.error('[Google Maps Image] Python process error:', error);
        stderr += error.message;
        resolve(1);
      });
    });
    
    // Try to parse JSON output from stdout
    // Python script outputs JSON, but may have other output mixed in
    let result;
    try {
      // Clean stdout - remove any leading/trailing whitespace and try to extract JSON
      const cleanStdout = stdout.trim();
      
      // Try to find JSON object in output (handles case where there's extra output)
      const jsonMatch = cleanStdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else if (cleanStdout.length > 0) {
        // If no JSON match but there's output, try parsing directly
        result = JSON.parse(cleanStdout);
      } else {
        throw new Error('No output from Python script');
      }
    } catch (parseError) {
      // If parsing fails, check exit code and stderr
      const errorMessage = stderr.trim() || stdout.trim() || 'Unknown error occurred';
      
      console.error('[Google Maps Image] Failed to parse Python output:', {
        exitCode,
        stdout: stdout.substring(0, 500),
        stderr: stderr.substring(0, 500),
        parseError: parseError.message
      });
      
      return res.status(500).json({
        success: false,
        error: `Failed to generate Google Maps image: ${errorMessage}`
      });
    }
    
    // Check if Python script returned an error
    if (exitCode !== 0 || !result.success) {
      const errorMessage = result.error || stderr.trim() || 'Unknown error occurred';
      console.error('[Google Maps Image] Python script returned error:', errorMessage);
      return res.status(500).json({
        success: false,
        error: errorMessage || 'Failed to generate Google Maps image'
      });
    }
    
    if (!result.imageBase64) {
      console.error('[Google Maps Image] No image data in Python script output');
      return res.status(500).json({
        success: false,
        error: 'Image generated but no base64 data returned'
      });
    }
    
    console.log(`[Google Maps Image] Successfully generated image for entity: ${entityName} (${result.imageBase64.length} bytes base64)`);
    
    res.json({
      success: true,
      imageBase64: result.imageBase64,
      mimeType: result.mimeType || 'image/jpeg'
    });
    
  } catch (error) {
    console.error('[Google Maps Image] Error generating image:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while generating Google Maps image'
    });
  }
});

module.exports = router;

