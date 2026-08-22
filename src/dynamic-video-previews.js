/**
 * Dynamic Video Preview Component
 * Generates video previews from time-lapse artifact sequences
 */

class VideoPreviewGenerator {
  constructor(options = {}) {
    this.canvas = options.canvas || document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.frameDuration = options.frameDuration || 100; // milliseconds
    this.width = options.width || 640;
    this.height = options.height || 480;
    this.isPlaying = false;
    this.currentFrame = 0;
    this.frames = [];
    
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  /**
   * Load images from artifact sequence
   * @param {Array<string>} imageUrls - Array of image URLs in sequence order
   */
  async loadFrames(imageUrls) {
    this.frames = [];
    const promises = imageUrls.map((url, index) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          this.frames[index] = img;
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });
    });

    try {
      await Promise.all(promises);
      console.log(`Loaded ${this.frames.length} frames`);
      return true;
    } catch (error) {
      console.error('Error loading frames:', error);
      return false;
    }
  }

  /**
   * Draw current frame to canvas
   */
  drawFrame() {
    if (this.frames.length === 0) return;

    const frame = this.frames[this.currentFrame];
    this.context.clearRect(0, 0, this.width, this.height);
    this.context.drawImage(frame, 0, 0, this.width, this.height);
  }

  /**
   * Start playing the video preview
   */
  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.animate();
  }

  /**
   * Stop playing the video preview
   */
  stop() {
    this.isPlaying = false;
    this.currentFrame = 0;
    this.drawFrame();
  }

  /**
   * Animation loop
   */
  animate() {
    if (!this.isPlaying) return;

    this.drawFrame();
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;

    setTimeout(() => this.animate(), this.frameDuration);
  }

  /**
   * Pause the video preview
   */
  pause() {
    this.isPlaying = false;
  }

  /**
   * Resume playing from current frame
   */
  resume() {
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.animate();
    }
  }

  /**
   * Set playback speed (frames per second)
   * @param {number} fps - Frames per second
   */
  setSpeed(fps) {
    this.frameDuration = 1000 / fps;
  }

  /**
   * Jump to specific frame
   * @param {number} frameIndex - Frame index to jump to
   */
  jumpToFrame(frameIndex) {
    if (frameIndex >= 0 && frameIndex < this.frames.length) {
      this.currentFrame = frameIndex;
      this.drawFrame();
    }
  }

  /**
   * Get total number of frames
   */
  getFrameCount() {
    return this.frames.length;
  }

  /**
   * Get current frame index
   */
  getCurrentFrame() {
    return this.currentFrame;
  }
}

// Export for use in modules or global scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VideoPreviewGenerator;
}
