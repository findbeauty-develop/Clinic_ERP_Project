import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ClinicsRepository } from "../repositories/clinics.repository";
import { RegisterClinicDto } from "../dto/register-clinic.dto";
import {
  getUploadRoot,
  saveBase64Images,
} from "../../../common/utils/upload.utils";
import { GoogleVisionService } from "./google-vision.service";
import { CertificateParserService } from "./certificate-parser.service";
import { VerifyCertificateResponseDto } from "../dto/verify-certificate-response.dto";
import { HiraService, HiraVerificationResult } from "../../hira/services/hira.service";
import { StorageService } from "../../../core/storage/storage.service";
import { join } from "path";
import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";
import { Clinic } from "../../../../node_modules/.prisma/client-backend";

/** RegisterClinicDto dan tenant / audit maydonlari ajratilgandagi shakl. */
type RecognizedClinicPayload = Omit<
  RegisterClinicDto,
  "tenantId" | "createdBy"
>;

const CERTIFICATE_REQUIRED_FIELD_KEYS = [
  "clinicName",
  "address",
  "doctorName",
] as const;

const CERTIFICATE_OPTIONAL_WARNING_KEYS = [
  "clinicType",
  "department",
  "openDate",
  "doctorLicenseNo",
  "licenseType",
] as const;

@Injectable()
export class ClinicsService {
  private readonly logger = new Logger(ClinicsService.name);

  constructor(
    private readonly repository: ClinicsRepository,
    private readonly googleVisionService: GoogleVisionService,
    private readonly certificateParserService: CertificateParserService,
    private readonly hiraService: HiraService,
    private readonly storageService: StorageService
  ) {}

  async clinicRegister(
    dto: RegisterClinicDto,
    tenantId: string,
    userId: string
  ) {
    const recognized = this.stripRegisterDtoSystemFields(dto);

    await this.assertNoDuplicateClinicByDocumentAndName(
      recognized.documentIssueNumber,
      recognized.name
    );

    if (!recognized.englishName?.trim()) {
      throw new BadRequestException("영어이름 입력부탁드립니다");
    }

    const documentUrls = recognized.documentImageUrls ?? [];
    const storedUrls = await this.persistNewBase64DocumentImages(
      documentUrls,
      tenantId
    );

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
      terms_of_service_agreed: recognized.termsOfServiceAgreed ?? false,
    });

    return clinic;
  }

  async getClinics(tenantId: string) {
    return this.repository.findByTenant(tenantId);
  }

  async updateClinicSettings(
    tenantId: string,
    settings: {
      allow_company_search?: boolean;
      allow_info_disclosure?: boolean;
    }
  ) {
    const clinic = await this.getFirstClinicRowForSettingsOrThrow(tenantId);

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (settings.allow_company_search !== undefined) {
      updateData.allow_company_search = settings.allow_company_search;
    } else {
      updateData.allow_company_search = clinic.allow_company_search ?? false;
    }

    if (settings.allow_info_disclosure !== undefined) {
      updateData.allow_info_disclosure = settings.allow_info_disclosure;
    } else {
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
    const recognized = this.stripRegisterDtoSystemFields(dto);

    const existingClinic = await this.repository.findById(id, tenantId);
    if (!existingClinic) {
      throw new NotFoundException("Clinic not found");
    }

    await this.assertNoDuplicateClinicByDocumentAndName(
      recognized.documentIssueNumber,
      recognized.name,
      id
    );

    const documentUrls = recognized.documentImageUrls ?? [];
    const allUrls = await this.mergeDocumentUrlsForClinicUpdate(
      documentUrls,
      tenantId
    );

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
   * Sertifikatni OCR + HIRA orqali tekshirish. Oqim: disk → OCR → parse → HIRA →
   * ishonchlilik va ogohlantirishlar.
   */
  async verifyCertificate(
    buffer: Buffer,
    tenantId?: string,
    mimetype?: string
  ): Promise<VerifyCertificateResponseDto> {
    const fileUrl = await this.saveCertificateBufferToUploads(
      buffer,
      tenantId,
      mimetype
    );

    const ocrOutcome = await this.runCertificateOcr(buffer, fileUrl);
    if (!ocrOutcome.ok) {
      return ocrOutcome.response;
    }

    const fields =
      this.certificateParserService.parseKoreanClinicCertificate(
        ocrOutcome.rawText
      );

    const missingRequired =
      this.getMissingCertificateRequiredFieldNames(fields);

    const hiraVerification =
      await this.runHiraVerificationForCertificateFields(fields);

    const ocrValid = missingRequired.length === 0;
    const hiraValid = hiraVerification.isValid;
    const isValid = ocrValid && hiraValid;

    const confidence = this.computeCertificateConfidence(
      ocrValid,
      hiraVerification
    );

    const warnings = this.buildCertificateVerificationWarnings(
      fields,
      missingRequired,
      hiraVerification
    );

    const mappedData = this.mapParsedCertificateToRegisterDtoShape(fields);

    return {
      isValid,
      confidence,
      fields: this.mapParsedCertificateToResponseFields(fields),
      mappedData,
      rawText: fields.rawText,
      warnings,
      fileUrl: fileUrl || undefined,
      hiraVerification: this.mapHiraResultToVerifyResponse(hiraVerification),
    };
  }

  async updateClinicLogo(tenantId: string, logoUrl: string) {
    const firstClinic = await this.getFirstClinicRowForLogoOrThrow(tenantId);

    const updateData: Partial<Clinic> & { logo_url?: string } = {
      logo_url: logoUrl,
      updated_at: new Date(),
    };

    const updatedClinic = await this.repository.update(
      firstClinic.id,
      updateData,
      tenantId
    );

    return {
      success: true,
      logo_url: (updatedClinic as Clinic & { logo_url: string | null })
        .logo_url,
      message: "로고가 성공적으로 업데이트되었습니다.",
    };
  }

  async getClinicInfo(tenantId: string) {
    const clinics = await this.repository.findByTenant(tenantId);
    if (!clinics || clinics.length === 0) {
      return null;
    }

    const clinic = clinics[0];
    return {
      name: clinic.name,
      logo_url: (clinic as { logo_url?: string | null }).logo_url ?? null,
    };
  }

  async agreeTermsOfService(clinicId: string): Promise<Clinic> {
    const clinic = await this.repository.findById(clinicId, null as never);
    if (!clinic) {
      throw new NotFoundException("Clinic not found");
    }

    if ((clinic as { terms_of_service_agreed?: boolean }).terms_of_service_agreed === true) {
      throw new BadRequestException("Terms of service already agreed");
    }

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    if (clinic.created_at < fortyEightHoursAgo) {
      throw new BadRequestException(
        "Terms agreement period expired (48 hours after registration)"
      );
    }

    return this.repository.update(
      clinicId,
      {
        terms_of_service_agreed: true,
        updated_at: new Date(),
      },
      clinic.tenant_id
    );
  }

  async checkDuplicateClinic(
    documentIssueNumber?: string,
    licenseNumber?: string
  ): Promise<{ isDuplicate: boolean; message?: string }> {
    if (documentIssueNumber) {
      const existingByDocument =
        await this.repository.findByDocumentIssueNumber(documentIssueNumber);
      if (existingByDocument) {
        return {
          isDuplicate: true,
          message: "이미 등록된 문서발급번호입니다.",
        };
      }
    }

    if (licenseNumber) {
      const existingByLicense =
        await this.repository.findByLicenseNumber(licenseNumber);
      if (existingByLicense) {
        return {
          isDuplicate: true,
          message: "이미 등록된 면허번호입니다.",
        };
      }
    }

    return { isDuplicate: false };
  }

  async uploadToStorage(
    file: Express.Multer.File,
    storagePath: string,
    options?: {
      optimize?: boolean;
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
    }
  ): Promise<string> {
    return this.storageService.uploadFile(file, storagePath, options);
  }

  // --- Register / update helpers ---

  private stripRegisterDtoSystemFields(
    dto: RegisterClinicDto
  ): RecognizedClinicPayload {
    const { tenantId: _ignoredTenant, createdBy: _ignoredCreatedBy, ...rest } =
      dto;
    return rest;
  }

  private async assertNoDuplicateClinicByDocumentAndName(
    documentIssueNumber: string,
    name: string,
    excludeClinicId?: string
  ): Promise<void> {
    const duplicate = excludeClinicId
      ? await this.repository.findByDocumentIssueNumberAndNameExcludingId(
          documentIssueNumber,
          name,
          excludeClinicId
        )
      : await this.repository.findByDocumentIssueNumberAndName(
          documentIssueNumber,
          name
        );

    if (duplicate) {
      throw new BadRequestException(`이미 등록된 클리닉입니다.`);
    }
  }

  private persistNewBase64DocumentImages(
    documentUrls: string[],
    tenantId: string
  ): Promise<string[]> {
    return saveBase64Images(
      "clinic",
      documentUrls,
      tenantId,
      this.storageService
    );
  }

  private async mergeDocumentUrlsForClinicUpdate(
    documentUrls: string[],
    tenantId: string
  ): Promise<string[]> {
    const newBase64Images = documentUrls.filter((url) =>
      url.startsWith("data:")
    );
    const existingUrls = documentUrls.filter((url) => !url.startsWith("data:"));
    const storedNewUrls = await saveBase64Images(
      "clinic",
      newBase64Images,
      tenantId,
      this.storageService
    );
    return [...existingUrls, ...storedNewUrls];
  }

  /** Settings: tenant bo‘yicha birinchi klinika; yo‘q bo‘lsa BadRequest (oldingi xabar bilan). */
  private async getFirstClinicRowForSettingsOrThrow(
    tenantId: string
  ): Promise<Record<string, unknown> & { id: string }> {
    const clinics = await this.repository.findByTenant(tenantId);
    if (clinics.length === 0) {
      throw new BadRequestException("Clinic not found for this tenant");
    }
    return clinics[0] as Record<string, unknown> & { id: string };
  }

  /** Logo: birinchi klinika; yo‘q bo‘lsa NotFound (oldingi xabar bilan). */
  private async getFirstClinicRowForLogoOrThrow(
    tenantId: string
  ): Promise<{ id: string }> {
    const clinic = await this.repository.findByTenant(tenantId);
    if (!clinic || clinic.length === 0) {
      throw new NotFoundException("Clinic not found");
    }
    return clinic[0];
  }

  // --- Certificate verify helpers ---

  private async saveCertificateBufferToUploads(
    buffer: Buffer,
    tenantId?: string,
    mimetype?: string
  ): Promise<string | null> {
    if (!tenantId) {
      return null;
    }
    try {
      const uploadRoot = getUploadRoot();
      const categoryDir = join(uploadRoot, "clinic", tenantId);
      await fs.mkdir(categoryDir, { recursive: true });

      const extension = this.extensionFromImageMimetype(mimetype);
      const filename = `${uuidv4()}${extension}`;
      const filePath = join(categoryDir, filename);
      await fs.writeFile(filePath, buffer);
      return `/uploads/clinic/${tenantId}/${filename}`;
    } catch {
      return null;
    }
  }

  private extensionFromImageMimetype(mimetype?: string): string {
    if (!mimetype) {
      return ".jpg";
    }
    if (mimetype === "image/png") {
      return ".png";
    }
    if (mimetype === "image/jpeg" || mimetype === "image/jpg") {
      return ".jpg";
    }
    if (mimetype === "image/webp") {
      return ".webp";
    }
    return ".jpg";
  }

  private emptyMappedDataForOcrFailure(): NonNullable<
    VerifyCertificateResponseDto["mappedData"]
  > {
    return {
      name: "",
      category: "",
      location: "",
      medicalSubjects: "",
      licenseType: "의사면허",
      licenseNumber: "",
      documentIssueNumber: "",
    };
  }

  private buildFailedHiraVerificationState(
    warnings: string[]
  ): NonNullable<VerifyCertificateResponseDto["hiraVerification"]> {
    return {
      isValid: false,
      confidence: 0,
      matches: {
        nameMatch: false,
        addressMatch: false,
        typeMatch: false,
        dateMatch: false,
      },
      warnings,
    };
  }

  private buildOcrFailureVerifyResponse(
    fileUrl: string | null,
    error: unknown
  ): VerifyCertificateResponseDto {
    return {
      isValid: false,
      confidence: 0,
      fields: {},
      mappedData: this.emptyMappedDataForOcrFailure(),
      rawText: "",
      warnings: [
        "OCR 서비스에 연결할 수 없습니다. Google Cloud Vision API 설정을 확인해주세요.",
        error instanceof Error ? error.message : "Unknown OCR error",
      ],
      fileUrl: fileUrl || undefined,
      hiraVerification: this.buildFailedHiraVerificationState([
        "OCR failed, HIRA verification skipped",
      ]),
    };
  }

  private async runCertificateOcr(
    buffer: Buffer,
    fileUrl: string | null
  ): Promise<
    | { ok: true; rawText: string }
    | { ok: false; response: VerifyCertificateResponseDto }
  > {
    try {
      const rawText =
        await this.googleVisionService.extractTextFromBuffer(buffer);
      return { ok: true, rawText };
    } catch (error) {
      this.logger.error("OCR extraction failed:", error);
      return {
        ok: false,
        response: this.buildOcrFailureVerifyResponse(fileUrl, error),
      };
    }
  }

  private getMissingCertificateRequiredFieldNames(
    fields: ReturnType<
      CertificateParserService["parseKoreanClinicCertificate"]
    >
  ): string[] {
    return CERTIFICATE_REQUIRED_FIELD_KEYS.filter((field) => {
      const v = fields[field as keyof typeof fields];
      return !v || v === "";
    }) as string[];
  }

  private async runHiraVerificationForCertificateFields(
    fields: ReturnType<
      CertificateParserService["parseKoreanClinicCertificate"]
    >
  ): Promise<HiraVerificationResult> {
    if (!fields.clinicName) {
      return {
        isValid: false,
        confidence: 0,
        matches: {
          nameMatch: false,
          addressMatch: false,
          typeMatch: false,
          dateMatch: false,
        },
        warnings: ["Clinic name is required for HIRA verification"],
      };
    }

    try {
      return await this.hiraService.verifyClinicInfo({
        clinicName: fields.clinicName,
        address: fields.address,
        clinicType: fields.clinicType,
        openDate: fields.openDate,
      });
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Unknown error";
      return {
        isValid: false,
        confidence: 0,
        matches: {
          nameMatch: false,
          addressMatch: false,
          typeMatch: false,
          dateMatch: false,
        },
        warnings: [`HIRA verification failed: ${message}`],
      };
    }
  }

  private computeCertificateConfidence(
    ocrValid: boolean,
    hiraVerification: HiraVerificationResult
  ): number {
    let confidence = ocrValid ? 0.8 : 0.2;

    if (hiraVerification.isValid) {
      confidence = confidence * 0.4 + hiraVerification.confidence * 0.6;
    } else {
      confidence = 0;
    }

    return confidence;
  }

  private buildCertificateVerificationWarnings(
    fields: ReturnType<
      CertificateParserService["parseKoreanClinicCertificate"]
    >,
    missingRequired: string[],
    hiraVerification: HiraVerificationResult
  ): string[] {
    const warnings: string[] = [];

    if (missingRequired.length > 0) {
      warnings.push(`Missing required fields: ${missingRequired.join(", ")}`);
    }

    CERTIFICATE_OPTIONAL_WARNING_KEYS.forEach((field) => {
      const v = fields[field as keyof typeof fields];
      if (!v || v === "") {
        warnings.push(`Missing optional field: ${field}`);
      }
    });

    if (hiraVerification.warnings.length > 0) {
      warnings.push(...hiraVerification.warnings);
    }

    if (!hiraVerification.isValid) {
      if (
        hiraVerification.warnings.some((w) =>
          w.includes("not found in HIRA database")
        )
      ) {
        warnings.push(
          "이 의료기관은 국가에서 인정하지 않은 병원이거나 의료기관개설신고증을 다시 확인해주세요."
        );
      }
    }

    return warnings;
  }

  private mapParsedCertificateToRegisterDtoShape(
    fields: ReturnType<
      CertificateParserService["parseKoreanClinicCertificate"]
    >
  ): NonNullable<VerifyCertificateResponseDto["mappedData"]> {
    return {
      name: fields.clinicName || "",
      category: fields.clinicType || "",
      location: fields.address || "",
      medicalSubjects: fields.department || "",
      openDate: fields.openDate
        ? `${fields.openDate.substring(0, 4)}-${fields.openDate.substring(4, 6)}-${fields.openDate.substring(6, 8)}`
        : undefined,
      doctorName: fields.doctorName || undefined,
      licenseType: fields.licenseType || "의사면허",
      licenseNumber: fields.doctorLicenseNo || "",
      documentIssueNumber: fields.reportNumber || "",
    };
  }

  private mapParsedCertificateToResponseFields(
    fields: ReturnType<
      CertificateParserService["parseKoreanClinicCertificate"]
    >
  ): VerifyCertificateResponseDto["fields"] {
    return {
      clinicName: fields.clinicName,
      clinicType: fields.clinicType,
      address: fields.address,
      department: fields.department,
      openDate: fields.openDate,
      doctorName: fields.doctorName,
      doctorLicenseNo: fields.doctorLicenseNo,
      licenseType: fields.licenseType,
      reportNumber: fields.reportNumber,
    };
  }

  private mapHiraResultToVerifyResponse(
    hiraVerification: HiraVerificationResult
  ): NonNullable<VerifyCertificateResponseDto["hiraVerification"]> {
    return {
      isValid: hiraVerification.isValid,
      confidence: hiraVerification.confidence,
      matches: hiraVerification.matches,
      hiraData: hiraVerification.hiraData,
      warnings: hiraVerification.warnings,
    };
  }
}
