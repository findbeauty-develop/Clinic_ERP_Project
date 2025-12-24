export interface PressRelease {
  title: string;
  detailUrl: string;
  department: string;
  manager: string;
  contact: string;
  publishDate: string;
  content?: string;
  attachments?: Attachment[];
  imageUrl?: string; // 🆕 Added image field
  thumbnailUrl?: string; // 🆕 Added thumbnail field
}

export interface Attachment {
  fileName: string;
  fileUrl: string;
}

export interface PressReleaseResponse {
  resultCode: string;
  resultMsg: string;
  totalCount: number;
  items: PressRelease[];
  pageNo: number;
  numOfRows: number;
}
