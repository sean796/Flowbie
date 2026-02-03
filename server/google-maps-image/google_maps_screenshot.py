#!/usr/bin/env python3
"""
Google Maps Screenshot Generator
Generates Google Maps screenshots for entity locations using Selenium
"""

import sys
import os
import json
import base64
import tempfile
import uuid
from pathlib import Path
from typing import Optional, Tuple

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from PIL import Image
    import time
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Missing required dependency: {str(e)}. Please install: selenium, Pillow"
    }), file=sys.stderr)
    sys.exit(1)


def sanitize_query(query: str) -> str:
    """Sanitize query for filename and URL encoding"""
    # Remove invalid filename characters
    invalid_chars = '<>:"/\\|?*,'
    sanitized = ''.join(c for c in query if c not in invalid_chars)
    # Convert to title case
    sanitized = sanitized.title()
    # Truncate to 100 characters max
    return sanitized[:100].strip()


def build_google_maps_url(query: str) -> str:
    """Build Google Maps search URL"""
    # Replace spaces with + for URL encoding
    encoded_query = query.replace(' ', '+')
    return f"https://www.google.com/maps/search/{encoded_query}"


def take_screenshot(url: str, output_path: str, headless: bool = True) -> bool:
    """Take screenshot of Google Maps page using Selenium"""
    driver = None
    try:
        chrome_options = Options()
        
        if headless:
            chrome_options.add_argument('--headless')
        
        # Disable notifications, extensions, plugins
        chrome_options.add_argument('--disable-notifications')
        chrome_options.add_argument('--disable-background-networking')
        chrome_options.add_argument('--disable-sync')
        chrome_options.add_argument('--disable-extensions')
        chrome_options.add_argument('--disable-plugins')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--no-first-run')
        chrome_options.add_argument('--no-default-browser-check')
        
        # Suppress logging
        chrome_options.add_argument('--log-level=3')
        chrome_options.add_argument('--silent')
        chrome_options.add_argument('--v=0')
        chrome_options.add_argument('--disable-logging')
        
        # Set window size for headless (4K resolution)
        if headless:
            chrome_options.add_argument('--window-size=3840,2160')
        else:
            chrome_options.add_argument('--start-maximized')
        
        # Disable automation detection
        chrome_options.add_experimental_option('excludeSwitches', ['enable-automation', 'enable-logging'])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        # Disable notifications and popups
        prefs = {
            'profile.default_content_setting_values.notifications': 2,
            'profile.default_content_setting_values.popups': 2
        }
        chrome_options.add_experimental_option('prefs', prefs)
        
        # Create driver
        driver = webdriver.Chrome(options=chrome_options)
        
        # Set window size explicitly if not maximized
        if headless:
            driver.set_window_size(3840, 2160)
        
        # Navigate to URL
        driver.get(url)
        
        # Wait for page to load (8 seconds total as per handoff sheet)
        time.sleep(6)
        time.sleep(2)
        
        # Small delay to avoid hover effects
        time.sleep(0.5)
        
        # Take screenshot
        driver.save_screenshot(output_path)
        
        return True
        
    except Exception as e:
        print(f"Error taking screenshot: {str(e)}", file=sys.stderr)
        return False
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass
            # Force kill remaining Chrome processes if needed
            try:
                import psutil
                for proc in psutil.process_iter(['pid', 'name']):
                    try:
                        if 'chrome' in proc.info['name'].lower():
                            proc.kill()
                    except:
                        pass
            except ImportError:
                pass  # psutil not available, skip cleanup


def process_image(input_path: str, output_path: str, target_size: Tuple[int, int] = (1200, 630)) -> bool:
    """
    Process image: crop center 60%, convert to JPG, resize to target size
    """
    try:
        # Open image
        img = Image.open(input_path)
        original_width, original_height = img.size
        
        # Step 1: Crop to center 60% (remove 20% from each side)
        crop_left = int(original_width * 0.2)
        crop_right = int(original_width * 0.8)
        cropped_img = img.crop((crop_left, 0, crop_right, original_height))
        
        # Step 2: Resize to target size (1200x630)
        target_width, target_height = target_size
        target_aspect = target_width / target_height
        
        cropped_width, cropped_height = cropped_img.size
        cropped_aspect = cropped_width / cropped_height
        
        if cropped_aspect > target_aspect:
            # Image is wider than target - crop width
            new_width = int(cropped_height * target_aspect)
            left_crop = (cropped_width - new_width) // 2
            cropped_img = cropped_img.crop((left_crop, 0, left_crop + new_width, cropped_height))
        elif cropped_aspect < target_aspect:
            # Image is taller than target - crop height
            new_height = int(cropped_width / target_aspect)
            top_crop = (cropped_height - new_height) // 2
            cropped_img = cropped_img.crop((0, top_crop, cropped_width, top_crop + new_height))
        
        # Resize to exact target dimensions
        final_img = cropped_img.resize(target_size, Image.Resampling.LANCZOS)
        
        # Convert to RGB if needed (for JPG)
        if final_img.mode in ('RGBA', 'LA', 'P'):
            rgb_img = Image.new('RGB', final_img.size, (255, 255, 255))
            if final_img.mode == 'P':
                final_img = final_img.convert('RGBA')
            rgb_img.paste(final_img, mask=final_img.split()[-1] if final_img.mode == 'RGBA' else None)
            final_img = rgb_img
        elif final_img.mode != 'RGB':
            final_img = final_img.convert('RGB')
        
        # Save as JPG with quality 90
        final_img.save(output_path, 'JPEG', quality=90, optimize=True)
        
        return True
        
    except Exception as e:
        print(f"Error processing image: {str(e)}", file=sys.stderr)
        return False


def generate_google_maps_image(entity: str, output_dir: Optional[str] = None) -> dict:
    """
    Main function to generate Google Maps image for an entity
    
    Returns:
        dict with 'success', 'imageBase64', and optionally 'error'
    """
    temp_files = []
    
    try:
        # Sanitize entity query
        sanitized_query = sanitize_query(entity)
        
        # Build Google Maps URL
        maps_url = build_google_maps_url(entity)
        
        # Create temp directory if not provided
        if output_dir is None:
            output_dir = tempfile.gettempdir()
        else:
            os.makedirs(output_dir, exist_ok=True)
        
        # Generate temp file paths
        temp_screenshot = os.path.join(output_dir, f"temp_screenshot_{uuid.uuid4().hex}.png")
        final_image = os.path.join(output_dir, f"{sanitized_query}_1200x630.jpg")
        
        temp_files = [temp_screenshot, final_image]
        
        # Take screenshot
        if not take_screenshot(maps_url, temp_screenshot, headless=True):
            return {
                "success": False,
                "error": "Failed to capture screenshot"
            }
        
        # Process image (crop, resize)
        if not process_image(temp_screenshot, final_image):
            return {
                "success": False,
                "error": "Failed to process image"
            }
        
        # Read image and convert to base64
        with open(final_image, 'rb') as f:
            image_data = f.read()
            image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Cleanup temp files
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except:
                pass
        
        return {
            "success": True,
            "imageBase64": image_base64,
            "mimeType": "image/jpeg"
        }
        
    except Exception as e:
        # Cleanup on error
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except:
                pass
        
        return {
            "success": False,
            "error": str(e)
        }


def main():
    """Main entry point - called from command line or Node.js"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Missing required argument: entity"
        }), file=sys.stderr)
        sys.exit(1)
    
    entity = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = generate_google_maps_image(entity, output_dir)
    
    # Output JSON result
    print(json.dumps(result))
    
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()

