import { ApiProperty } from "@nestjs/swagger";

export class VerifyCertificateResponseDto {
  @ApiProperty({ description: "Whether the certificate is valid" })
  isValid!: boolean;

  @ApiProperty({ description: "Confidence score (0.0 to 1.0)" })
  confidence!: number;

  @ApiProperty({ description: "Parsed fields from certificate" })
  fields!: {
    clinicName?: string;
    clinicType?: string;
    address?: string;
    department?: string;
    openDate?: string;
    doctorName?: string;
    doctorLicenseNo?: string;
    reportNumber?: string;
  };

  @ApiProperty({ description: "Raw OCR text" })
  rawText!: string;

  @ApiProperty({ description: "Warnings about missing or invalid fields", type: [String] })
  warnings!: string[];

  @ApiProperty({ description: "Uploaded file URL (if saved)", required: false })
  fileUrl?: string;

  @ApiProperty({ 
    description: "Mapped data ready for RegisterClinicDto",
    required: false,
    example: {
      name: "닥터정리반의원",
      category: "의원",
      location: "서울특별시 강남구 압구정로 320, 극동Gallery 4층 (신사동)",
      medicalSubjects: "피부과",
      openDate: "2020-09-04",
      doctorName: "정연호",
      licenseType: "의사면허",
      licenseNumber: "53132",
      documentIssueNumber: "21132-21421-00430-04009"
    }
  })
  mappedData?: {
    name: string;
    category: string;
    location: string;
    medicalSubjects: string;
    openDate?: string;
    doctorName?: string;
    licenseType: string;
    licenseNumber: string;
    documentIssueNumber: string;
  };

  @ApiProperty({ 
    description: "HIRA verification result",
    required: false,
    example: {
      isValid: true,
      confidence: 0.9,
      matches: {
        nameMatch: true,
        addressMatch: true,
        typeMatch: true,
        dateMatch: false
      },
      hiraData: {
        yadmNm: "닥터정리반의원",
        addr: "서울특별시 강남구 압구정로 320",
        clcdNm: "의원",
        telno: "02-1234-5678"
      },
      warnings: []
    }
  })
  hiraVerification?: {
    isValid: boolean;
    confidence: number;
    matches: {
      nameMatch: boolean;
      addressMatch: boolean;
      typeMatch: boolean;
      dateMatch: boolean;
    };
    hiraData?: {
      yadmNm?: string;
      addr?: string;
      clcdNm?: string;
      estbDd?: string;
      telno?: string;
      clCd?: string;
      ykiho?: string;
    };
    warnings: string[];
  };
}

