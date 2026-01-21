import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class RegisterClinicDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsString()
  @IsNotEmpty()
  name!: string; // 명칭

  
  @IsString()
  @IsNotEmpty()
  englishName!: string; // 영어이름

  @IsString()
  @IsNotEmpty()
  category!: string; // 종류

  @IsString()
  @IsNotEmpty()
  location!: string; // 소재지

  @IsString()
  @IsNotEmpty()
  medicalSubjects!: string; // 진료과목

  @IsString()
  @IsNotEmpty()
  licenseType!: string; // 면허종류

  @IsString()
  @IsNotEmpty()
  licenseNumber!: string; // 면호번호

  @IsString()
  @IsNotEmpty()
  documentIssueNumber!: string; // 문서발급번호

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentImageUrls?: string[]; // document-img

  @IsOptional()
  @IsDateString()
  openDate?: string; // 개설신고일자 (Open date from OCR)


  @IsString()
  @IsNotEmpty()
  doctorName!: string; // 성명 (Doctor name from OCR)
}

