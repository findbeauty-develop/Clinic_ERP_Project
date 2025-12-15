import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ClinicsRepository } from "../repositories/clinics.repository";
import { RegisterClinicDto } from "../dto/register-clinic.dto";
import { saveBase64Images } from "../../../common/utils/upload.utils";
import { GoogleVisionService } from "./google-vision.service";
import { CertificateParserService } from "./certificate-parser.service";
import { VerifyCertificateResponseDto } from "../dto/verify-certificate-response.dto";
import { join } from "path";
import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class ClinicsService {
  constructor(
    private readonly repository: ClinicsRepository,
    private readonly googleVisionService: GoogleVisionService,
    private readonly certificateParserService: CertificateParserService
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
        console.error("Failed to save certificate file:", error);
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

    // Step 5: Determine validity
    const isValid = missingFields.length === 0;

    // Step 6: Calculate confidence
    // Simple scoring: 0.8 if valid, 0.2 if invalid
    // Could be enhanced with more sophisticated scoring
    const confidence = isValid ? 0.8 : 0.2;

    // Step 7: Generate warnings
    const warnings: string[] = [];
    if (missingFields.length > 0) {
      warnings.push(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Check for other optional but important fields
    const optionalFields = ["clinicType", "department", "openDate", "doctorLicenseNo"];
    optionalFields.forEach((field) => {
      if (!fields[field as keyof typeof fields] || fields[field as keyof typeof fields] === "") {
        warnings.push(`Missing optional field: ${field}`);
      }
    });

    // Map parsed fields to RegisterClinicDto format
    const mappedData = {
      name: fields.clinicName || "", // 명칭 -> name
      category: fields.clinicType || "", // 종류 -> category
      location: fields.address || "", // 소재지 -> location
      medicalSubjects: fields.department || "", // 진료과목 -> medicalSubjects
      openDate: fields.openDate || undefined, // 개설신고일자 -> openDate
      doctorName: fields.doctorName || undefined, // 성명 -> doctorName
      licenseType: "의사면허", // Default, can be enhanced
      licenseNumber: fields.doctorLicenseNo || "", // 면허번호 -> licenseNumber
      documentIssueNumber: fields.reportNumber || "", // 문서발급번호 -> documentIssueNumber
    };

    return {
      isValid,
      confidence,
      fields: {
        clinicName: fields.clinicName,
        clinicType: fields.clinicType,
        address: fields.address,
        department: fields.department,
        openDate: fields.openDate,
        doctorName: fields.doctorName,
        doctorLicenseNo: fields.doctorLicenseNo,
        reportNumber: fields.reportNumber,
      },
      mappedData, // Add mapped data for RegisterClinicDto
      rawText: fields.rawText,
      warnings,
      fileUrl: fileUrl || undefined,
    };
  }
}

