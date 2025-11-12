import { Injectable } from "@nestjs/common";
import { ClinicsRepository } from "../repositories/clinics.repository";
import { RegisterClinicDto } from "../dto/register-clinic.dto";
import { saveBase64Images } from "../../../common/utils/upload.utils";

@Injectable()
export class ClinicsService {
  constructor(private readonly repository: ClinicsRepository) {}

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
    const storedUrls = await saveBase64Images("clinic", documentUrls);

    return this.repository.create({
      tenant_id: tenantId,
      name: recognized.name,
      english_name: recognized.englishName,
      category: recognized.category,
      location: recognized.location,
      medical_subjects: recognized.medicalSubjects,
      description: recognized.description,
      license_type: recognized.licenseType,
      license_number: recognized.licenseNumber,
      document_issue_number: recognized.documentIssueNumber,
      document_image_urls: storedUrls,
      created_by: userId ?? null,
    });
  }

  getClinics(tenantId: string) {
    return this.repository.findByTenant(tenantId);
  }
}

