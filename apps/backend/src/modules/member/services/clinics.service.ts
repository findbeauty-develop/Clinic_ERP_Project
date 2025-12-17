import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ClinicsRepository } from "../repositories/clinics.repository";
import { RegisterClinicDto } from "../dto/register-clinic.dto";
import { saveBase64Images } from "../../../common/utils/upload.utils";
import { GoogleVisionService } from "./google-vision.service";
import { CertificateParserService } from "./certificate-parser.service";
import { VerifyCertificateResponseDto } from "../dto/verify-certificate-response.dto";
import { HiraService } from "../../hira/services/hira.service";
import { join } from "path";
import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class ClinicsService {
  constructor(
    private readonly repository: ClinicsRepository,
    private readonly googleVisionService: GoogleVisionService,
    private readonly certificateParserService: CertificateParserService,
    private readonly hiraService: HiraService
  ) {}

  async clinicRegister(
    dto: RegisterClinicDto,
    tenantId: string,
    userId: string
  ) {
    const {
      tenantId: _ignoredTenant,
      createdBy: _ignoredCreatedBy,
      ...recognized
    } = dto;

    // Check for duplicate clinic (same name and document_issue_number)
    const existingClinic = await this.repository.findByDocumentIssueNumberAndName(
      recognized.documentIssueNumber,
      recognized.name
    );

    if (existingClinic) {
      throw new BadRequestException(
        `이미 등록된 클리닉입니다.`
      );
    }

    const documentUrls = recognized.documentImageUrls ?? [];
    const storedUrls = await saveBase64Images("clinic", documentUrls, tenantId);

    const clinic = await this.repository.create({
      tenant_id: tenantId,
      name: recognized.name,
      english_name: recognized.englishName,
      category: recognized.category,
      location: recognized.location,
      medical_subjects: recognized.medicalSubjects,
      license_type: recognized.licenseType,
      license_number: recognized.licenseNumber,
      document_issue_number: recognized.documentIssueNumber,
      document_image_urls: storedUrls,
      open_date: recognized.openDate ? new Date(recognized.openDate) : null,
      doctor_name: recognized.doctorName || null,
      created_by: userId ?? null,
    });

    // Return clinic with tenant_id so frontend can use it
    return clinic;
  }

  async getClinics(tenantId: string) {
    return this.repository.findByTenant(tenantId);
  }

  /**
   * Update clinic settings (privacy and disclosure settings)
   */
  async updateClinicSettings(
    tenantId: string,
    settings: { allow_company_search?: boolean; allow_info_disclosure?: boolean }
  ) {
    const clinics = await this.repository.findByTenant(tenantId);
    if (clinics.length === 0) {
      throw new BadRequestException("Clinic not found for this tenant");
    }

    // Update the first clinic (should be only one per tenant)
    const clinic = clinics[0] as any;
    
    // Preserve existing values - only update fields that are provided
    const updateData: any = {
      updated_at: new Date(),
    };

    // Only update fields that are explicitly provided (not undefined)
    if (settings.allow_company_search !== undefined) {
      updateData.allow_company_search = settings.allow_company_search;
    } else {
      // Preserve existing value
      updateData.allow_company_search = clinic.allow_company_search ?? false;
    }
    
    if (settings.allow_info_disclosure !== undefined) {
      updateData.allow_info_disclosure = settings.allow_info_disclosure;
    } else {
      // Preserve existing value
      updateData.allow_info_disclosure = clinic.allow_info_disclosure ?? false;
    }

    return this.repository.update(clinic.id, updateData, tenantId);
  }

  async updateClinic(
    id: string,
    dto: RegisterClinicDto,
    tenantId: string,
    userId: string
  ) {
    const {
      tenantId: _ignoredTenant,
      createdBy: _ignoredCreatedBy,
      ...recognized
    } = dto;

    // Check if clinic exists and belongs to tenant
    const existingClinic = await this.repository.findById(id, tenantId);
    if (!existingClinic) {
      throw new NotFoundException("Clinic not found");
    }

    // Process new images (base64) and keep existing URLs
    const documentUrls = recognized.documentImageUrls ?? [];
    const newBase64Images = documentUrls.filter((url) =>
      url.startsWith("data:")
    );
    const existingUrls = documentUrls.filter(
      (url) => !url.startsWith("data:")
    );
    const storedNewUrls = await saveBase64Images("clinic", newBase64Images, tenantId);
    const allUrls = [...existingUrls, ...storedNewUrls];

    return this.repository.update(
      id,
      {
        name: recognized.name,
        english_name: recognized.englishName,
        category: recognized.category,
        location: recognized.location,
        medical_subjects: recognized.medicalSubjects,
        license_type: recognized.licenseType,
        license_number: recognized.licenseNumber,
        document_issue_number: recognized.documentIssueNumber,
        document_image_urls: allUrls,
        open_date: recognized.openDate ? new Date(recognized.openDate) : null,
        doctor_name: recognized.doctorName || null,
        updated_by: userId ?? null,
      },
      tenantId
    );
  }

  /**
   * Verify clinic certificate using OCR and parse fields
   * @param buffer Image buffer of the certificate
   * @param tenantId Optional tenant ID for file storage
   * @param mimetype Optional file mimetype for proper extension
   * @returns Verification result with parsed fields and file URL
   */
  async verifyCertificate(
    buffer: Buffer,
    tenantId?: string,
    mimetype?: string
  ): Promise<VerifyCertificateResponseDto> {
    // Step 1: Save file and get URL
    let fileUrl: string | null = null;
    if (tenantId) {
      try {
        const UPLOAD_ROOT = join(process.cwd(), "uploads");
        const categoryDir = join(UPLOAD_ROOT, "clinic", tenantId);
        await fs.mkdir(categoryDir, { recursive: true });
        
        // Determine file extension from mimetype
        let extension = ".jpg"; // default
        if (mimetype) {
          if (mimetype === "image/png") extension = ".png";
          else if (mimetype === "image/jpeg" || mimetype === "image/jpg") extension = ".jpg";
          else if (mimetype === "image/webp") extension = ".webp";
        }
        
        const filename = `${uuidv4()}${extension}`;
        const filePath = join(categoryDir, filename);
        await fs.writeFile(filePath, buffer);
        fileUrl = `/uploads/clinic/${tenantId}/${filename}`;
      } catch (error) {
        // Continue without saving file URL
      }
    }

    // Step 2: Extract text using OCR
    const rawText = await this.googleVisionService.extractTextFromBuffer(buffer);

    // Step 3: Parse fields from OCR text
    const fields = this.certificateParserService.parseKoreanClinicCertificate(rawText);

    // Step 4: Validate required fields
    const requiredFields = ["clinicName", "address", "doctorName"];
    const missingFields = requiredFields.filter(
      (field) => !fields[field as keyof typeof fields] || fields[field as keyof typeof fields] === ""
    );

    // Step 5: HIRA verification (MANDATORY if clinic name is available)
    let hiraVerification = null;
    if (fields.clinicName) {
      try {
        hiraVerification = await this.hiraService.verifyClinicInfo({
          clinicName: fields.clinicName,
          address: fields.address,
          clinicType: fields.clinicType,
          openDate: fields.openDate, // Now in YYYYMMDD format
        });
      } catch (error) {
        // HIRA verification failed - treat as invalid
        hiraVerification = {
          isValid: false,
          confidence: 0,
          matches: {
            nameMatch: false,
            addressMatch: false,
            typeMatch: false,
            dateMatch: false,
          },
          warnings: [`HIRA verification failed: ${typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : 'Unknown error'}`],
        };
      }
    } else {
      // If clinic name is missing, HIRA verification cannot proceed
      hiraVerification = {
        isValid: false,
        confidence: 0,
        matches: {
          nameMatch: false,
          addressMatch: false,
          typeMatch: false,
          dateMatch: false,
        },
        warnings: ['Clinic name is required for HIRA verification'],
      };
    }

    // Step 6: Determine validity (HIRA verification is MANDATORY)
    const ocrValid = missingFields.length === 0;
    const hiraValid = hiraVerification?.isValid ?? false; // Changed: default to false if HIRA fails
    const isValid = ocrValid && hiraValid; // Both must be valid

    // Step 7: Calculate combined confidence
    let confidence = ocrValid ? 0.8 : 0.2;
    
    // If HIRA verification succeeded, combine confidence scores
    if (hiraVerification && hiraVerification.isValid) {
      // Weighted average: 40% OCR, 60% HIRA
      confidence = (confidence * 0.4) + (hiraVerification.confidence * 0.6);
    } else if (hiraVerification && !hiraVerification.isValid) {
      // If HIRA verification failed, set confidence to 0
      confidence = 0;
    }

    // Step 8: Generate warnings
    const warnings: string[] = [];
    if (missingFields.length > 0) {
      warnings.push(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Check for other optional but important fields
    const optionalFields = ["clinicType", "department", "openDate", "doctorLicenseNo", "licenseType"];
    optionalFields.forEach((field) => {
      if (!fields[field as keyof typeof fields] || fields[field as keyof typeof fields] === "") {
        warnings.push(`Missing optional field: ${field}`);
      }
    });

    // Add HIRA warnings
    if (hiraVerification && hiraVerification.warnings.length > 0) {
      warnings.push(...hiraVerification.warnings);
    }

    // Add specific error message if HIRA verification failed
    if (hiraVerification && !hiraVerification.isValid) {
      if (hiraVerification.warnings.some(w => w.includes('not found in HIRA database'))) {
        warnings.push('이 의료기관은 국가에서 인정하지 않은 병원이거나 의료기관개설신고증을 다시 확인해주세요.');
      }
    }

    // Map parsed fields to RegisterClinicDto format
    const mappedData = {
      name: fields.clinicName || "",
      category: fields.clinicType || "",
      location: fields.address || "",
      medicalSubjects: fields.department || "", // Can be comma-separated
      openDate: fields.openDate ? `${fields.openDate.substring(0, 4)}-${fields.openDate.substring(4, 6)}-${fields.openDate.substring(6, 8)}` : undefined, // Convert YYYYMMDD to YYYY-MM-DD for DTO
      doctorName: fields.doctorName || undefined,
      licenseType: fields.licenseType || "의사면허", // Use extracted license type or default
      licenseNumber: fields.doctorLicenseNo || "",
      documentIssueNumber: fields.reportNumber || "",
    };

    return {
      isValid,
      confidence,
      fields: {
        clinicName: fields.clinicName,
        clinicType: fields.clinicType,
        address: fields.address,
        department: fields.department,
        openDate: fields.openDate, // Keep as YYYYMMDD in fields
        doctorName: fields.doctorName,
        doctorLicenseNo: fields.doctorLicenseNo,
        licenseType: fields.licenseType, // Add license type to fields
        reportNumber: fields.reportNumber,
      },
      mappedData,
      rawText: fields.rawText,
      warnings,
      fileUrl: fileUrl || undefined,
      hiraVerification: hiraVerification ? {
        isValid: hiraVerification.isValid,
        confidence: hiraVerification.confidence,
        matches: hiraVerification.matches,
        hiraData: hiraVerification.hiraData,
        warnings: hiraVerification.warnings,
      } : undefined,
    };
  }
}

