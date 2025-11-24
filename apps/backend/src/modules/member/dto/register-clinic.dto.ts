import { IsArray, IsDateString, IsOptional, IsString } from "class-validator";

export class RegisterClinicDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsString()
  name!: string; // 명칭

  @IsOptional()
  @IsString()
  englishName?: string; // 영어이름

  @IsString()
  category!: string; // 종류

  @IsString()
  location!: string; // 소재지

  @IsString()
  medicalSubjects!: string; // 진료과목

  @IsOptional()
  @IsString()
  description?: string; // 설명(법인명)

  @IsString()
  licenseType!: string; // 면허종류

  @IsString()
  licenseNumber!: string; // 면호번호

  @IsString()
  documentIssueNumber!: string; // 문서발급번호

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentImageUrls?: string[]; // document-img

  @IsOptional()
  @IsDateString()
  openDate?: string; // 개설신고일자 (Open date from OCR)

  @IsOptional()
  @IsString()
  doctorName?: string; // 성명 (Doctor name from OCR)
}

