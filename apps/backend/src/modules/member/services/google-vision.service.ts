import { Injectable, Logger } from "@nestjs/common";
import { ImageAnnotatorClient } from "@google-cloud/vision";

@Injectable()
export class GoogleVisionService {
  private readonly logger = new Logger(GoogleVisionService.name);
  private client: ImageAnnotatorClient | null = null;

  constructor() {
    try {
      // Google Cloud Vision client will use GOOGLE_APPLICATION_CREDENTIALS env var
      this.client = new ImageAnnotatorClient();
    } catch (error) {
      this.logger.error(
        "Failed to initialize Google Cloud Vision client",
        error
      );
      // Client will be null, methods will handle this gracefully
    }
  }

  /**
   * Extract text from image buffer using Google Cloud Vision OCR
   * @param buffer Image buffer
   * @returns Extracted text or empty string if OCR fails
   */
  async extractTextFromBuffer(buffer: Buffer): Promise<string> {
    if (!this.client) {
      this.logger.error("Google Cloud Vision client is not initialized");
      throw new Error(
        "Google Cloud Vision service is not available. Please check GOOGLE_APPLICATION_CREDENTIALS environment variable."
      );
    }

    try {
      const [result] = await this.client.textDetection({
        image: { content: buffer },
      });

      const detections = result.textAnnotations;
      if (!detections || detections.length === 0) {
        this.logger.warn("No text detected in image");
        return "";
      }

      // The first annotation contains the full text
      const fullTextAnnotation = detections[0];
      const extractedText = fullTextAnnotation.description || "";

      return extractedText;
    } catch (error) {
      this.logger.error("Error during OCR text extraction", error);
      throw new Error(
        `Failed to extract text from image: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
