"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPut, apiDelete } from "../../lib/api";

type Manager = {
  id: string;
  manager_id: string;
  name: string;
  phone_number: string;
  email1: string;
  position: string | null;
  manager_address: string | null;
  responsible_products: string[];
  public_contact_name: boolean;
  allow_hospital_search: boolean;
  receive_kakaotalk: boolean;
  receive_sms: boolean;
  receive_email: boolean;
  status: string;
  created_at: string;
};

type Supplier = {
  id: string;
  tenant_id: string | null;
  company_name: string;
  business_number: string;
  company_phone: string | null;
  company_email: string;
  company_address: string | null;
  product_categories: string[];
};

type ProfileData = {
  manager: Manager;
  supplier: Supplier;
};

const POSITIONS = ["사원", "주임", "대리", "과장", "차장", "부장"];

const PRODUCT_CATEGORIES = [
  "코스메슈티컬",
  "주사 재료",
  "일회용품",
  "건강기능식품",
  "청소용품",
  "레이저 소모품",
  "의료기기",
  "스킨케어 제품",
  "장비 부품",
  "기타",
];

export default function SettingsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAffiliationModal, setShowAffiliationModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [showCustomerCenterModal, setShowCustomerCenterModal] = useState(false);
  
  // Withdrawal states
  const [withdrawalStep, setWithdrawalStep] = useState(1); // 1: warnings, 2: password
  const [withdrawalAgreement, setWithdrawalAgreement] = useState(false);
  const [withdrawalReasons, setWithdrawalReasons] = useState<string[]>([]);
  const [withdrawalOtherReason, setWithdrawalOtherReason] = useState("");
  const [withdrawalPassword, setWithdrawalPassword] = useState("");
  
  // Affiliation change states
  const [affiliationStep, setAffiliationStep] = useState(1); // 1: warnings, 2: certificate, 3: form
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePreview, setCertificatePreview] = useState<string | null>(null);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [affiliationForm, setAffiliationForm] = useState({
    company_name: "",
    business_number: "",
    company_phone: "",
    company_email: "",
    company_address: "",
    product_categories: [] as string[],
  });

  // Form states
  const [position, setPosition] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [customerInquiryMemo, setCustomerInquiryMemo] = useState("");
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);

  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    public_contact_name: false,
    allow_hospital_search: false,
    receive_kakaotalk: false,
    receive_sms: false,
    receive_email: false,
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<ProfileData>(`/supplier/manager/profile`);
      setProfile(data);
      setPosition(data.manager.position || "");
      setPhoneNumber(data.manager.phone_number || "");
      setNotificationSettings({
        public_contact_name: data.manager.public_contact_name,
        allow_hospital_search: data.manager.allow_hospital_search,
        receive_kakaotalk: data.manager.receive_kakaotalk,
        receive_sms: data.manager.receive_sms,
        receive_email: data.manager.receive_email,
      });
    } catch (err: any) {
      console.error("Failed to load profile", err);
      setError("프로필 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handlePositionSave = async () => {
    if (!position) {
      alert("직함을 선택해주세요.");
      return;
    }

    try {
      await apiPut(`/supplier/manager/profile`, { position });
      alert("직함이 변경되었습니다.");
      setShowPositionModal(false);
      fetchProfile(); // Refresh profile data
    } catch (err: any) {
      console.error("Failed to update position", err);
      alert(`직함 변경에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  const handleSendVerificationCode = async () => {
    // Validate phone number format (01012345678)
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      alert("올바른 전화번호 형식을 입력하세요 (예: 01012345678)");
      return;
    }

    // Check if it's the same as current phone
    if (profile?.manager.phone_number && cleanPhone === profile.manager.phone_number.replace(/[^0-9]/g, "")) {
      alert("현재 사용 중인 전화번호와 동일합니다.");
      return;
    }

    setIsSendingCode(true);
    try {
      const response = await apiPost<{ message?: string }>(`/supplier/manager/send-phone-verification`, {
        phone_number: cleanPhone,
      });
      alert(response.message || "인증번호가 전송되었습니다.");
    } catch (err: any) {
      console.error("Failed to send verification code", err);
      alert(`인증번호 전송에 실패했습니다: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      alert("6자리 인증번호를 입력하세요.");
      return;
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
    setIsVerifyingCode(true);
    try {
      const response = await apiPost<{ verified: boolean; success: boolean }>(`/supplier/manager/verify-phone-code`, {
        phone_number: cleanPhone,
        code: verificationCode,
      });
      if (response.verified) {
        setIsPhoneVerified(true);
        alert("인증이 완료되었습니다.");
      } else {
        alert("인증번호가 올바르지 않습니다.");
      }
    } catch (err: any) {
      console.error("Failed to verify code", err);
      alert(`인증에 실패했습니다: ${err?.message || "Unknown error"}`);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handlePhoneSave = async () => {
    if (!isPhoneVerified) {
      alert("전화번호 인증을 완료해주세요.");
      return;
    }

    // Validate phone number format (01012345678)
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      alert("올바른 전화번호 형식을 입력하세요 (예: 01012345678)");
      return;
    }

    try {
      await apiPut(`/supplier/manager/profile`, { phone_number: cleanPhone });
      alert("전화번호가 변경되었습니다.");
      setShowPhoneModal(false);
      setPhoneNumber("");
      setVerificationCode("");
      setIsPhoneVerified(false);
      fetchProfile(); // Refresh profile data
    } catch (err: any) {
      console.error("Failed to update phone", err);
      alert(`전화번호 변경에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  const handlePasswordSave = async () => {
    if (newPassword !== confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword.length < 6) {
      alert("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }
    if (!currentPassword) {
      alert("현재 비밀번호를 입력해주세요.");
      return;
    }

    try {
      await apiPost(`/supplier/manager/change-password`, {
        currentPassword,
        newPassword,
      });
      alert("비밀번호가 변경되었습니다.");
      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Failed to change password", err);
      alert(`비밀번호 변경에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  const handleWithdrawStart = () => {
    setWithdrawalStep(1);
    setWithdrawalAgreement(false);
    setWithdrawalReasons([]);
    setWithdrawalOtherReason("");
    setWithdrawalPassword("");
    setShowWithdrawalModal(true);
  };

  const handleWithdrawalNext = () => {
    if (withdrawalStep === 1) {
      if (!withdrawalAgreement) {
        alert("유의사항에 동의해주세요.");
        return;
      }
      setWithdrawalStep(2);
    }
  };

  const handleWithdrawalBack = () => {
    if (withdrawalStep > 1) {
      setWithdrawalStep(withdrawalStep - 1);
    }
  };

  const handleWithdrawalReasonToggle = (reason: string) => {
    if (reason === "기타") {
      // Toggle "기타" - if already selected, remove it; otherwise add it
      if (withdrawalReasons.includes("기타")) {
        setWithdrawalReasons(withdrawalReasons.filter((r) => r !== "기타"));
        setWithdrawalOtherReason("");
      } else {
        setWithdrawalReasons([...withdrawalReasons, "기타"]);
      }
    } else {
      // Toggle other reasons
      setWithdrawalReasons((prev) =>
        prev.includes(reason)
          ? prev.filter((r) => r !== reason)
          : [...prev, reason]
      );
    }
  };

  const handleWithdrawExecute = async () => {
    if (!withdrawalPassword) {
      alert("비밀번호를 입력해주세요.");
      return;
    }

    try {
      // Build withdrawal reason string
      let withdrawalReasonText = "";
      if (withdrawalReasons.length > 0) {
        const reasons = withdrawalReasons.filter((r) => r !== "기타");
        if (reasons.length > 0) {
          withdrawalReasonText = reasons.join(", ");
        }
        if (withdrawalReasons.includes("기타") && withdrawalOtherReason) {
          if (withdrawalReasonText) {
            withdrawalReasonText += `, 기타: ${withdrawalOtherReason}`;
          } else {
            withdrawalReasonText = `기타: ${withdrawalOtherReason}`;
          }
        }
      }

      await apiDelete(`/supplier/manager/withdraw`, {
        password: withdrawalPassword,
        withdrawal_reason: withdrawalReasonText || undefined,
      } as any);

      alert("탈퇴가 완료되었습니다.");
      // Clear localStorage and redirect to login
      localStorage.removeItem("supplier_access_token");
      localStorage.removeItem("supplier_manager_data");
      router.push("/login");
    } catch (err: any) {
      console.error("Failed to withdraw", err);
      alert(`탈퇴에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  const handleCustomerInquirySubmit = async () => {
    if (!customerInquiryMemo || customerInquiryMemo.trim().length === 0) {
      alert("문의 내용을 입력해주세요.");
      return;
    }

    setIsSubmittingInquiry(true);
    try {
      const response = await apiPost<{ message: string }>(
        `/supplier/manager/contact-support`,
        {
          memo: customerInquiryMemo.trim(),
        }
      );
      alert(response.message || "문의가 성공적으로 전송되었습니다.");
      setShowCustomerCenterModal(false);
      setCustomerInquiryMemo("");
    } catch (err: any) {
      console.error("Failed to send inquiry", err);
      alert(`문의 전송에 실패했습니다: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSubmittingInquiry(false);
    }
  };

  const handleAffiliationStart = () => {
    // Initialize form with current supplier data
    if (profile) {
      setAffiliationForm({
        company_name: profile.supplier.company_name,
        business_number: profile.supplier.business_number,
        company_phone: profile.supplier.company_phone || "",
        company_email: profile.supplier.company_email,
        company_address: profile.supplier.company_address || "",
        product_categories: profile.supplier.product_categories || [],
      });
    }
    setAffiliationStep(1);
    setAgreementChecked(false);
    setCertificateFile(null);
    setCertificatePreview(null);
    setCertificateUrl(null);
    setShowAffiliationModal(true);
  };

  const handleAffiliationNext = () => {
    if (affiliationStep === 1) {
      if (!agreementChecked) {
        alert("유의사항에 동의해주세요.");
        return;
      }
      setAffiliationStep(2);
    } else if (affiliationStep === 2) {
      // Certificate upload is required, but we'll allow proceeding if file is selected
      if (!certificateFile && !certificateUrl) {
        alert("사업자등록증을 업로드해주세요.");
        return;
      }
      setAffiliationStep(3);
    }
  };

  const handleAffiliationBack = () => {
    if (affiliationStep > 1) {
      setAffiliationStep(affiliationStep - 1);
    }
  };

  const handleCertificateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    setCertificateFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setCertificatePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002"}/supplier/manager/upload-certificate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("supplier_access_token")}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("파일 업로드에 실패했습니다.");
      }

      const result = await response.json();
      setCertificateUrl(result.fileUrl);
    } catch (err: any) {
      console.error("Failed to upload certificate", err);
      alert(`파일 업로드에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  const handleAffiliationSave = async () => {
    // Validate required fields
    if (!affiliationForm.company_name || !affiliationForm.business_number || 
        !affiliationForm.company_phone || !affiliationForm.company_email) {
      alert("필수 항목을 모두 입력해주세요.");
      return;
    }

    if (affiliationForm.product_categories.length === 0) {
      alert("최소 1개 이상의 제품 카테고리를 선택해주세요.");
      return;
    }

    try {
      await apiPut(`/supplier/manager/change-affiliation`, {
        ...affiliationForm,
        certificate_image_url: certificateUrl || undefined,
      });
      alert("소속 정보가 변경되었습니다. 관리자 승인이 필요할 수 있습니다.");
      setShowAffiliationModal(false);
      fetchProfile(); // Refresh profile data
    } catch (err: any) {
      console.error("Failed to change affiliation", err);
      alert(`소속 변경에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  const handleCategoryToggle = (category: string) => {
    setAffiliationForm((prev) => ({
      ...prev,
      product_categories: prev.product_categories.includes(category)
        ? prev.product_categories.filter((c) => c !== category)
        : [...prev.product_categories, category],
    }));
  };

  const formatPhoneNumber = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, "");
    if (clean.length === 11) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
    } else if (clean.length === 10) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return phone;
  };

  const formatBusinessNumber = (number: string) => {
    if (number.length === 10) {
      return `${number.slice(0, 3)}-${number.slice(3, 5)}-${number.slice(5)}`;
    }
    return number;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-600">로딩 중...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-red-600">{error || "프로필을 불러올 수 없습니다."}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white px-4 py-4 shadow-sm">
        <h1 className="text-xl ml-14 mt-2 font-bold text-slate-900">설정</h1>
        <p className="mt-4 text-sm text-slate-600">
          사용 환경 설정 및 문제 해결 지원
        </p>
      </div>

      <div className="space-y-4 p-4">
        {/* 계정 관리 (Account Management) */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">계정 관리</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">이름</span>
              <span className="font-medium text-slate-900">{profile.manager.name}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">담당자 ID</span>
              <span className="font-medium text-slate-900">
                {profile.manager.manager_id}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">직함</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">
                  {profile.manager.position || "—"}
                </span>
                <button
                  onClick={() => {
                    setPosition(profile.manager.position || "");
                    setShowPositionModal(true);
                  }}
                  className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg"
                >
                  수정
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">핸드폰 번호</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">
                  {formatPhoneNumber(profile.manager.phone_number)}
                </span>
                <button
                  onClick={() => {
                    setPhoneNumber(profile.manager.phone_number || "");
                    setShowPhoneModal(true);
                  }}
                  className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg"
                >
                  수정
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">비밀번호</span>
              <button
                onClick={() => {
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setShowPasswordModal(true);
                }}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg"
              >
                재설정
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">회원탈퇴</span>
              <button
                onClick={handleWithdrawStart}
                className="rounded-lg bg-gradient-to-r from-red-500 to-pink-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:from-red-600 hover:to-pink-700 hover:shadow-lg"
              >
                탈퇴하기
              </button>
            </div>
          </div>
        </div>

        {/* 소속 관리 (Affiliation Management) */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">소속 관리</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">회사명</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">
                  {profile.supplier.company_name}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-4 w-4 text-slate-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 15.75l7.5-7.5 7.5 7.5"
                  />
                </svg>
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">사업자 등록번호</span>
              <span className="font-medium text-slate-900">
                {formatBusinessNumber(profile.supplier.business_number)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">회사 주소</span>
              <span className="font-medium text-slate-900">
                {profile.supplier.company_address || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">회사 전화번호</span>
              <span className="font-medium text-slate-900">
                {profile.supplier.company_phone
                  ? formatPhoneNumber(profile.supplier.company_phone)
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">회사 이메일</span>
              <span className="font-medium text-slate-900">
                {profile.supplier.company_email}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">이메일</span>
              <span className="font-medium text-slate-900">
                {profile.manager.email1 || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">담당 지역</span>
              <span className="font-medium text-slate-900">
                {profile.manager.manager_address || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">담당 제품</span>
              <span className="font-medium text-slate-900">
                {profile.manager.responsible_products.length > 0
                  ? profile.manager.responsible_products.join(", ")
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">소속 변경</span>
              <button
                onClick={handleAffiliationStart}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg"
              >
                소속 변경
              </button>
            </div>
          </div>
        </div>

        {/* 알람 (Alarm/Notifications) */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">알람</h2>
          <div className="space-y-3">
            {[
              { key: "public_contact_name", label: "담당자 이름 공개" },
              { key: "allow_hospital_search", label: "병의원 검색 허용" },
              { key: "receive_kakaotalk", label: "카톡 알림 받기" },
              { key: "receive_sms", label: "문자(SMS) 알림 받기" },
              { key: "receive_email", label: "이메일 알림 받기" },
            ].map((item) => {
              const settingKey = item.key as keyof typeof notificationSettings;
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"
                >
                  <span className="text-slate-600">{item.label}</span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={notificationSettings[settingKey]}
                      onChange={async (e) => {
                        const newValue = e.target.checked;
                        // Optimistic update
                        const previousValue = notificationSettings[settingKey];
                        setNotificationSettings((prev) => ({
                          ...prev,
                          [settingKey]: newValue,
                        }));

                        try {
                          // Save to backend
                          await apiPut(`/supplier/manager/profile`, {
                            [settingKey]: newValue,
                          });
                        } catch (err: any) {
                          console.error("Failed to update notification setting", err);
                          // Revert on error
                          setNotificationSettings((prev) => ({
                            ...prev,
                            [settingKey]: previousValue,
                          }));
                          alert(`설정 저장에 실패했습니다: ${err?.message || "Unknown error"}`);
                        }
                      }}
                      className="peer sr-only"
                    />
                    <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* 거래처 데이터 관리 (Client Data Management) */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            거래처 데이터 관리
          </h2>
          <button
            onClick={() => router.push("/settings/clinics")}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left text-slate-700 hover:bg-slate-50"
          >
            <span>거래처데이터관리</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5 text-slate-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        </div>

        {/* 고객센터 (Customer Center) */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">고객센터</h2>
          <button
            onClick={() => {
              setCustomerInquiryMemo("");
              setShowCustomerCenterModal(true);
            }}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left text-slate-700 hover:bg-slate-50"
          >
            <span>고객센터</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5 text-slate-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        </div>

        {/* 로그아웃 (Logout) */}
        <button
          onClick={() => {
            localStorage.removeItem("supplier_access_token");
            localStorage.removeItem("supplier_manager_data");
            router.push("/login");
          }}
          className="w-full rounded-lg bg-red-600 px-4 py-3 text-center font-semibold text-white shadow-sm hover:bg-red-700"
        >
          로그아웃
        </button>
      </div>

      {/* 직함 수정 Modal */}
      {showPositionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-white to-slate-50 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">직함 수정</h3>
              <button
                onClick={() => {
                  setShowPositionModal(false);
                  setPosition(profile?.manager.position || "");
                }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
              >
                취소
              </button>
            </div>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                직함
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">선택하세요</option>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handlePositionSave}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {/* 핸드폰 번호 수정 Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-white to-slate-50 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">핸드폰 번호 수정</h3>
              <button
                onClick={() => {
                  setShowPhoneModal(false);
                  setPhoneNumber("");
                  setVerificationCode("");
                  setIsPhoneVerified(false);
                }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
              >
                취소
              </button>
            </div>
            <div className="mb-4">
              <p className="text-sm text-slate-600">
                전화번호를 수정하기 위해 인증절차가 필요합니다.
              </p>
              <div className="my-4 h-px bg-slate-200"></div>
              <p className="text-sm text-slate-700">
                사용중 번호:{" "}
                <span className="font-semibold">
                  {profile?.manager.phone_number
                    ? formatPhoneNumber(profile.manager.phone_number).replace(
                        /(\d{3}-\d)\d{2}(\d{2}-\d)\d{2}/,
                        "$1***-$2***"
                      )
                    : "—"}
                </span>
              </p>
            </div>
            <div className="mb-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  전화번호
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setIsPhoneVerified(false);
                      setVerificationCode("");
                    }}
                    placeholder="01012345678"
                    disabled={isPhoneVerified}
                    className="flex-1 rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <button
                    onClick={handleSendVerificationCode}
                    disabled={isSendingCode || isPhoneVerified || !phoneNumber}
                    className="rounded-lg bg-indigo-500 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    {isSendingCode ? "전송 중..." : "인증"}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  인증번호
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                      setVerificationCode(value);
                    }}
                    placeholder="인증번호"
                    disabled={isPhoneVerified || !phoneNumber}
                    className="flex-1 rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <button
                    onClick={handleVerifyCode}
                    disabled={isVerifyingCode || isPhoneVerified || !verificationCode || verificationCode.length !== 6}
                    className="rounded-lg bg-indigo-500 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    {isVerifyingCode ? "확인 중..." : "확인"}
                  </button>
                </div>
                {isPhoneVerified && (
                  <p className="mt-2 text-sm text-green-600">✓ 인증이 완료되었습니다.</p>
                )}
              </div>
            </div>
            <button
              onClick={handlePhoneSave}
              disabled={!isPhoneVerified}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              변경
            </button>
          </div>
        </div>
      )}

      {/* 비밀번호 재설정 Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-white to-slate-50 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">비밀번호 재설정</h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
              >
                취소
              </button>
            </div>
            <p className="mb-6 text-sm text-slate-600">
              안전한 사용하기 위해 비밀번호를 다시 한번 입력해 주세요.
            </p>
            <div className="mb-4 space-y-4">
              <div>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새로운 비밀번호"
                  className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새로운 비밀번호 확인"
                  className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>
            <button
              onClick={handlePasswordSave}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 소속 변경 Multi-step Modal */}
      {showAffiliationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-gradient-to-br from-white to-slate-50 p-6 shadow-2xl">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">
                소속(회사) 변경 시 유의사항
              </h3>
              <button
                onClick={() => {
                  setShowAffiliationModal(false);
                  setAffiliationStep(1);
                  setAgreementChecked(false);
                }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
              >
                취소
              </button>
            </div>

            {/* Step 1: Warnings */}
            {affiliationStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-3 text-sm text-slate-700">
                  <div className="flex gap-3">
                    <span className="font-semibold text-indigo-600">1.</span>
                    <p>
                      소속 변경 후 담당자의 이름, 직함, 연락처 등 계정 정보는 새 회사
                      기준으로 업데이트됩니다.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-semibold text-indigo-600">2.</span>
                    <p>
                      이전 회사에서 담당자가 처리한 주문·출고·반품·정산·거래처 이력은
                      해당 회사의 업무 기록으로 분류되며, 관련 법령에 따라 보관되며
                      수정되거나 삭제되지 않습니다.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-semibold text-indigo-600">3.</span>
                    <p>
                      이전 회사에서 보유하던 모든 권한과 설정값은 해제되거나
                      초기화됩니다.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-semibold text-indigo-600">4.</span>
                    <p>
                      새 회사 소속으로 활동하기 위해서는{" "}
                      <span className="font-semibold underline">
                        관리자 승인이 필요할 수 있으며, 승인 완료 전까지 일부 기능
                        이용이 제한될 수 있습니다.
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-semibold text-indigo-600">5.</span>
                    <p>
                      동일 이메일은 여러 회사 소속 계정에서 동시에 사용할 수 없으며,
                      계속 사용하려면 이전 회사에서의 권한 해제가 필요합니다.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="agreement"
                    checked={agreementChecked}
                    onChange={(e) => setAgreementChecked(e.target.checked)}
                    className="h-5 w-5 rounded border-2 border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                  />
                  <label
                    htmlFor="agreement"
                    className="text-sm text-slate-700"
                  >
                    위 내용을 모두 확인하였으며, 이에 동의합니다.
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleAffiliationNext}
                    disabled={!agreementChecked}
                    className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    다음단계
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Certificate Upload */}
            {affiliationStep === 2 && (
              <div className="space-y-4">
                <div className="mb-6 flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
                  {certificatePreview ? (
                    <img
                      src={certificatePreview}
                      alt="Certificate preview"
                      className="h-full w-full rounded-lg object-contain"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-slate-200"></div>
                      <p className="text-sm text-slate-600">
                        사업자등록증 이미지를 업로드하세요
                      </p>
                    </div>
                  )}
                </div>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCertificateUpload}
                    className="hidden"
                  />
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                        fileInput?.click();
                      }}
                      className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-600 px-6 py-3 font-medium text-white shadow-md transition-all hover:from-blue-600 hover:to-cyan-700 hover:shadow-lg"
                    >
                      사업자등록증 업데이트
                    </button>
                  </div>
                </label>
                <div className="flex justify-between">
                  <button
                    onClick={handleAffiliationBack}
                    className="rounded-lg bg-slate-200 px-6 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-300"
                  >
                    이전
                  </button>
                  <button
                    onClick={handleAffiliationNext}
                    disabled={!certificateFile && !certificateUrl}
                    className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    다음 단계
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Company Information Form */}
            {affiliationStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      회사명 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={affiliationForm.company_name}
                      onChange={(e) =>
                        setAffiliationForm((prev) => ({
                          ...prev,
                          company_name: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      사업자 등록번호 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={affiliationForm.business_number}
                      onChange={(e) =>
                        setAffiliationForm((prev) => ({
                          ...prev,
                          business_number: e.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      placeholder="1234567890"
                      maxLength={10}
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      회사 전화번호 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={affiliationForm.company_phone}
                      onChange={(e) =>
                        setAffiliationForm((prev) => ({
                          ...prev,
                          company_phone: e.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      placeholder="01012345678"
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      회사 이메일 주소 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={affiliationForm.company_email}
                      onChange={(e) =>
                        setAffiliationForm((prev) => ({
                          ...prev,
                          company_email: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      회사 주소
                    </label>
                    <input
                      type="text"
                      value={affiliationForm.company_address}
                      onChange={(e) =>
                        setAffiliationForm((prev) => ({
                          ...prev,
                          company_address: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      취급 제품 카테고리{" "}
                      <span className="text-red-500">*</span> (중복 선택 가능)
                    </label>
                    <div className="grid grid-cols-2 gap-3 rounded-lg border-2 border-slate-300 bg-white p-4">
                      {PRODUCT_CATEGORIES.map((category) => (
                        <label
                          key={category}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={affiliationForm.product_categories.includes(
                              category
                            )}
                            onChange={() => handleCategoryToggle(category)}
                            className="h-5 w-5 rounded border-2 border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-slate-700">{category}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={handleAffiliationBack}
                    className="rounded-lg bg-slate-200 px-6 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-300"
                  >
                    이전
                  </button>
                  <button
                    onClick={handleAffiliationSave}
                    className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl"
                  >
                    저장
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 회원 탈퇴 Multi-step Modal */}
      {showWithdrawalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-gradient-to-br from-white to-slate-50 p-6 shadow-2xl">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">회원 탈퇴</h3>
              <button
                onClick={() => {
                  setShowWithdrawalModal(false);
                  setWithdrawalStep(1);
                  setWithdrawalAgreement(false);
                }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
              >
                취소
              </button>
            </div>

            {/* Step 1: Warnings and Reasons */}
            {withdrawalStep === 1 && (
              <div className="space-y-6">
                {/* Section 1: 탈퇴 시 즉시 삭제되는 정보 */}
                <div>
                  <h4 className="mb-3 text-lg font-semibold text-slate-900">
                    1. 탈퇴 시 즉시 삭제되는 정보
                  </h4>
                  <ul className="ml-6 list-disc space-y-2 text-sm text-slate-700">
                    <li>담당자 이름, 직함, 연락처 등 개인 정보</li>
                    <li>계정 설정 및 알림 설정</li>
                    <li>로그인 기록</li>
                  </ul>
                </div>

                {/* Section 2: 법적 보관이 필요한 정보 */}
                <div>
                  <h4 className="mb-3 text-lg font-semibold text-slate-900">
                    2. 법적 보관이 필요한 정보
                  </h4>
                  <p className="mb-3 text-sm text-slate-700">
                    다음 정보는 관련 법령(전자상거래법, 세무법 등)에 따라 최대 5년간
                    보관되며, 법적 목적 외에는 사용되지 않습니다.
                  </p>
                  <ul className="ml-6 list-disc space-y-2 text-sm text-slate-700">
                    <li>병·의원 ↔ 기업 간의 주문/출고/반품/정산 이력</li>
                    <li>세금계산서, 영수증 등 회계 자료</li>
                  </ul>
                  <p className="mt-3 text-xs text-slate-500">
                    ※ 보관 기간 종료 후 안전하게 파기됩니다.
                  </p>
                </div>

                {/* Section 3: 탈퇴 후 이용 제한 */}
                <div>
                  <h4 className="mb-3 text-lg font-semibold text-slate-900">
                    3. 탈퇴 후 이용 제한
                  </h4>
                  <ul className="ml-6 list-disc space-y-2 text-sm text-slate-700">
                    <li>플랫폼 로그인 및 서비스 이용이 중단됩니다.</li>
                    <li>
                      동일 전화번호/이메일로 즉시 재가입이 제한될 수 있습니다.
                    </li>
                    <li>
                      저장된 모든 설정 값은 초기화되며 복원되지 않습니다.
                    </li>
                  </ul>
                </div>

                {/* Section 4: 주의사항 */}
                <div>
                  <h4 className="mb-3 text-lg font-semibold text-slate-900">
                    4. 주의사항
                  </h4>
                  <ul className="ml-6 list-disc space-y-2 text-sm text-slate-700">
                    <li>
                      탈퇴 완료 후에는 개인 정보를 근거로 한 본인 확인이 불가능하여
                    </li>
                    <li>추가적인 삭제 요청을 처리할 수 없습니다.</li>
                    <li>
                      병원/기업과의 거래가 진행 중일 경우, 담당자 변경 후 탈퇴하는 것을
                      권장합니다.
                    </li>
                  </ul>
                </div>

                {/* Section 5: 탈퇴 사유 */}
                <div>
                  <h4 className="mb-3 text-lg font-semibold text-slate-900">
                    5. 탈퇴 사유 (선택)
                  </h4>
                  <div className="space-y-2">
                    {[
                      "사용이 불편함",
                      "필요한 기능 부족",
                      "타 시스템 사용",
                      "계정 변경",
                      "기타",
                    ].map((reason) => (
                      <label
                        key={reason}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={withdrawalReasons.includes(reason)}
                          onChange={() => handleWithdrawalReasonToggle(reason)}
                          className="h-5 w-5 rounded border-2 border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-700">{reason}</span>
                        {reason === "기타" && withdrawalReasons.includes("기타") && (
                          <input
                            type="text"
                            value={withdrawalOtherReason}
                            onChange={(e) => setWithdrawalOtherReason(e.target.value)}
                            placeholder="직접 입력"
                            className="ml-2 flex-1 rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Agreement Checkbox */}
                <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
                  <input
                    type="checkbox"
                    id="withdrawal-agreement"
                    checked={withdrawalAgreement}
                    onChange={(e) => setWithdrawalAgreement(e.target.checked)}
                    className="h-5 w-5 rounded border-2 border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                  />
                  <label
                    htmlFor="withdrawal-agreement"
                    className="text-sm text-slate-700"
                  >
                    위 내용을 모두 확인하였으며, 이에 동의합니다.
                  </label>
                </div>

                {/* Next Step Button */}
                <div className="flex justify-end">
                  <button
                    onClick={handleWithdrawalNext}
                    disabled={!withdrawalAgreement}
                    className="rounded-lg bg-gradient-to-r from-red-500 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-pink-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    다음단계
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Password Reconfirmation */}
            {withdrawalStep === 2 && (
              <div className="space-y-4">
                <p className="mb-6 text-sm text-slate-600">
                  안전한 사용하기 위해 비밀번호를 다시 한번 입력해 주세요.
                </p>
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    전화번호
                  </label>
                  <input
                    type="text"
                    value={profile?.manager.phone_number ? formatPhoneNumber(profile.manager.phone_number) : ""}
                    disabled
                    className="w-full rounded-lg border-2 border-slate-300 bg-slate-100 px-4 py-3 text-slate-600 shadow-sm"
                  />
                </div>
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    value={withdrawalPassword}
                    onChange={(e) => setWithdrawalPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={handleWithdrawalBack}
                    className="rounded-lg bg-slate-200 px-6 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-300"
                  >
                    이전
                  </button>
                  <button
                    onClick={handleWithdrawExecute}
                    disabled={!withdrawalPassword}
                    className="rounded-lg bg-gradient-to-r from-red-500 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-pink-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    확인
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 고객센터 Modal */}
      {showCustomerCenterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-white to-slate-50 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-slate-900">고객센터</h3>
              <button
                onClick={() => {
                  setShowCustomerCenterModal(false);
                  setCustomerInquiryMemo("");
                }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
              >
                취소
              </button>
            </div>
            <p className="mb-6 text-sm text-slate-600">
              문의 내용을 남겨주시면 담당자가 확인 후 연락드리겠습니다.
            </p>
            <div className="mb-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  회사명
                </label>
                <input
                  type="text"
                  value={profile?.supplier.company_name || "—"}
                  disabled
                  className="w-full rounded-lg border-2 border-slate-300 bg-slate-100 px-4 py-3 text-slate-900 shadow-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  이름
                </label>
                <input
                  type="text"
                  value={profile?.manager.name || "—"}
                  disabled
                  className="w-full rounded-lg border-2 border-slate-300 bg-slate-100 px-4 py-3 text-slate-900 shadow-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  연락처
                </label>
                <input
                  type="text"
                  value={
                    profile?.manager.phone_number
                      ? formatPhoneNumber(profile.manager.phone_number)
                      : "—"
                  }
                  disabled
                  className="w-full rounded-lg border-2 border-slate-300 bg-slate-100 px-4 py-3 text-slate-900 shadow-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  문의 내용 남겨주세요
                </label>
                <textarea
                  value={customerInquiryMemo}
                  onChange={(e) => setCustomerInquiryMemo(e.target.value)}
                  placeholder="문의 내용을 입력해주세요"
                  rows={6}
                  className="w-full rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>
            <button
              onClick={handleCustomerInquirySubmit}
              disabled={!customerInquiryMemo.trim() || isSubmittingInquiry}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {isSubmittingInquiry ? "전송 중..." : "확인"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

