/**
 * Dynamic Video Preview System
 * Generates and manages video previews by extracting frames from video sources
 */

class DynamicVideoPreview {
  constructor(options = {}) {
    this.videoUrls = options.videoUrls || {};
    this.outputQuality = options.outputQuality || 'medium';
    this.previewDuration = options.previewDuration || 3000; // milliseconds
    this.frameRate = options.frameRate || 24;
    this.cache = new Map();
  }

  /**
   * Generate a preview video from a source video
   * @param {string} recordId - The record identifier
   * @param {string} videoUrl - URL to the source video
   * @param {Object} options - Preview generation options
   * @returns {Promise<Blob>} Preview video blob
   */
  async generatePreview(recordId, videoUrl, options = {}) {
    const cacheKey = `${recordId}_${this.outputQuality}`;
    
    // Return cached preview if available
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const preview = await this._createPreview(videoUrl, options);
      this.cache.set(cacheKey, preview);
      return preview;
    } catch (error) {
      console.error(`Failed to generate preview for ${recordId}:`, error);
      throw error;
    }
  }

  /**
   * Create a preview from video source
   * @private
   */
  async _createPreview(videoUrl, options = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const video = document.createElement('video');
    
    // Configure video element
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    
    return new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', async () => {
        try {
          const duration = options.duration || this.previewDuration;
          const startTime = options.startTime || Math.max(0, video.duration - 10);
          
          // Set canvas dimensions
          canvas.width = options.width || 640;
          canvas.height = options.height || 360;
          
          // Seek to start position
          video.currentTime = startTime;
          
          // Wait for frame to load
          await new Promise(r => {
            video.addEventListener('seeked', r, { once: true });
          });
          
          // Draw initial frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to blob
          canvas.toBlob(resolve, 'video/mp4');
        } catch (error) {
          reject(error);
        }
      });
      
      video.addEventListener('error', () => {
        reject(new Error(`Failed to load video: ${videoUrl}`));
      });
    });
  }

  /**
   * Extract a frame from a video at a specific time
   * @param {string} videoUrl - URL to the source video
   * @param {number} time - Time in seconds to extract frame
   * @returns {Promise<string>} Data URL of the frame
   */
  async extractFrame(videoUrl, time = 0) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const video = document.createElement('video');
    
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    
    return new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', async () => {
        try {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          video.currentTime = Math.min(time, video.duration - 0.1);
          
          await new Promise(r => {
            video.addEventListener('seeked', r, { once: true });
          });
          
          ctx.drawImage(video, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (error) {
          reject(error);
        }
      });
      
      video.addEventListener('error', () => {
        reject(new Error(`Failed to load video: ${videoUrl}`));
      });
    });
  }

  /**
   * Load preview into an element
   * @param {HTMLElement} element - Target element
   * @param {string} previewUrl - Preview URL or blob
   * @param {Object} options - Display options
   */
  loadPreviewInElement(element, previewUrl, options = {}) {
    const video = element.querySelector('video') || document.createElement('video');
    
    video.muted = true;
    video.autoplay = options.autoplay !== false;
    video.loop = options.loop !== false;
    video.playsinline = true;
    video.preload = options.preload || 'metadata';
    
    if (previewUrl instanceof Blob) {
      video.src = URL.createObjectURL(previewUrl);
    } else {
      video.src = previewUrl;
    }
    
    if (!element.contains(video)) {
      element.appendChild(video);
    }
  }

  /**
   * Clear cache to free memory
   */
  clearCache() {
    for (const [, blob] of this.cache) {
      if (blob instanceof Blob) {
        URL.revokeObjectURL(URL.createObjectURL(blob));
      }
    }
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

/**
 * Integration with existing preview shells
 */
class PreviewShellIntegration {
  constructor(previewSystem) {
    this.previewSystem = previewSystem;
    this.activeElements = new Set();
  }

  /**
   * Enhance a preview shell with dynamic video capabilities
   * @param {HTMLElement} shell - The preview shell element
   * @param {string} recordId - Record identifier
   * @param {string} videoUrl - Video source URL
   */
  async enhancePreviewShell(shell, recordId, videoUrl) {
    try {
      const frame = await this.previewSystem.extractFrame(videoUrl);
      const img = shell.querySelector('img') || document.createElement('img');
      
      img.src = frame;
      img.alt = `Preview for ${recordId}`;
      
      if (!shell.contains(img)) {
        shell.appendChild(img);
      }
      
      this.activeElements.add(shell);
    } catch (error) {
      console.warn(`Could not enhance preview for ${recordId}:`, error);
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.activeElements.forEach(el => {
      const video = el.querySelector('video');
      const img = el.querySelector('img');
      
      if (video && video.src) {
        URL.revokeObjectURL(video.src);
      }
      if (img && img.src.startsWith('blob:')) {
        URL.revokeObjectURL(img.src);
      }
    });
    
    this.activeElements.clear();
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DynamicVideoPreview, PreviewShellIntegration };
}
