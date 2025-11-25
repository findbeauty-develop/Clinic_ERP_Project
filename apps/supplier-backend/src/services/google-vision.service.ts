import { Injectable, Logger } from "@nestjs/common";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { resolve } from "path";
import { existsSync } from "fs";

@Injectable()
export class GoogleVisionService {
  private readonly logger = new Logger(GoogleVisionService.name);
  private client: ImageAnnotatorClient | null = null;

  constructor() {
    try {
      // Check if GOOGLE_APPLICATION_CREDENTIALS is set
      let credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      if (!credentialsPath) {
        this.logger.warn("GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. OCR will not be available.");
        return;
      }

      // Resolve relative paths to absolute paths
      if (!credentialsPath.startsWith("/")) {
        credentialsPath = resolve(process.cwd(), credentialsPath);
      }

      // Verify the file exists
      if (!existsSync(credentialsPath)) {
        this.logger.error(`Google Cloud Vision credentials file not found at: ${credentialsPath}`);
        return;
      }

      // Set environment variable to absolute path
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

      // Initialize client - same as clinic backend (let it use env var)
      this.client = new ImageAnnotatorClient();
      
      this.logger.log(`Google Cloud Vision client initialized successfully with credentials: ${credentialsPath}`);
    } catch (error) {
      this.logger.error("Failed to initialize Google Cloud Vision client", error);
      if (error instanceof Error) {
        this.logger.error(`Error details: ${error.message}`);
      }
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
      throw new Error("Google Cloud Vision service is not available. Please check GOOGLE_APPLICATION_CREDENTIALS environment variable.");
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

      this.logger.log(`Successfully extracted ${extractedText.length} characters from image`);
      return extractedText;
    } catch (error) {
      this.logger.error("Error during OCR text extraction", error);
      throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}