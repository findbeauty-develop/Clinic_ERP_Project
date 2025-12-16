"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiDelete } from "../../lib/api";

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

export default function SettingsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [editingPosition, setEditingPosition] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);

  // Form states
  const [position, setPosition] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
    // TODO: Implement PUT endpoint later
    alert("직함 수정 기능은 곧 제공될 예정입니다.");
    setEditingPosition(false);
  };

  const handlePhoneSave = async () => {
    // Validate phone number format (01012345678)
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      alert("올바른 전화번호 형식을 입력하세요 (예: 01012345678)");
      return;
    }

    // TODO: Implement PUT endpoint later
    alert("전화번호 수정 기능은 곧 제공될 예정입니다.");
    setEditingPhone(false);
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
      setEditingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Failed to change password", err);
      alert(`비밀번호 변경에 실패했습니다: ${err?.message || "Unknown error"}`);
    }
  };

  const handleWithdraw = async () => {
    if (!confirm("정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }

    try {
      await apiDelete(`/supplier/manager/withdraw`);
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
      <div className="bg-white px-4 py-4 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">설정</h1>
        <p className="mt-1 text-sm text-slate-600">
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
                {editingPosition ? (
                  <>
                    <select
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="">선택하세요</option>
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handlePositionSave}
                      className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditingPosition(false);
                        setPosition(profile.manager.position || "");
                      }}
                      className="rounded bg-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-400"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-slate-900">
                      {profile.manager.position || "—"}
                    </span>
                    <button
                      onClick={() => setEditingPosition(true)}
                      className="rounded bg-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-300"
                    >
                      수정
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">핸드폰 번호</span>
              <div className="flex items-center gap-2">
                {editingPhone ? (
                  <>
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="01012345678"
                      className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={handlePhoneSave}
                      className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditingPhone(false);
                        setPhoneNumber(profile.manager.phone_number || "");
                      }}
                      className="rounded bg-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-400"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-slate-900">
                      {formatPhoneNumber(profile.manager.phone_number)}
                    </span>
                    <button
                      onClick={() => setEditingPhone(true)}
                      className="rounded bg-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-300"
                    >
                      수정
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">비밀번호</span>
              {editingPassword ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="현재 비밀번호"
                    className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="새 비밀번호"
                    className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="새 비밀번호 확인"
                    className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handlePasswordSave}
                      className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditingPassword(false);
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                      }}
                      className="rounded bg-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-400"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditingPassword(true)}
                  className="rounded bg-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-300"
                >
                  재설정
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">회원탈퇴</span>
              <button
                onClick={handleWithdraw}
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
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
                onClick={() => alert("소속 변경 기능은 곧 제공될 예정입니다.")}
                className="rounded bg-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-300"
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
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"
              >
                <span className="text-slate-600">{item.label}</span>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={notificationSettings[item.key as keyof typeof notificationSettings]}
                    onChange={(e) => {
                      setNotificationSettings((prev) => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }));
                      // TODO: Implement PUT endpoint later
                      alert("알림 설정 저장 기능은 곧 제공될 예정입니다.");
                    }}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* 거래처 데이터 관리 (Client Data Management) */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            거래처 데이터 관리
          </h2>
          <button
            onClick={() => alert("거래처 데이터 관리 기능은 곧 제공될 예정입니다.")}
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
            onClick={() => alert("고객센터 기능은 곧 제공될 예정입니다.")}
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
    </div>
  );
}

