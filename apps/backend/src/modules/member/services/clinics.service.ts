import { Injectable } from "@nestjs/common";
import { ClinicsRepository } from "../repositories/clinics.repository";
import { RegisterClinicDto } from "../dto/register-clinic.dto";

@Injectable()
export class ClinicsService {
  constructor(private readonly repository: ClinicsRepository) {}

  clinicRegister(dto: RegisterClinicDto, tenantId: string, userId: string) {
    return this.repository.create({
      tenant_id: tenantId,
      name: dto.name,
      english_name: dto.englishName,
      category: dto.category,
      location: dto.location,
      medical_subjects: dto.medicalSubjects,
      description: dto.description,
      license_type: dto.licenseType,
      license_number: dto.licenseNumber,
      document_issue_number: dto.documentIssueNumber,
      document_image_urls: dto.documentImageUrls ?? [],
      created_by: userId,
    });
  }
}

