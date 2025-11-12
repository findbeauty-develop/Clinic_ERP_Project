"use client";

import { useEffect, useMemo, useState } from "react";

type Clinic = {
  id: string;
  name: string;
  english_name?: string | null;
  category: string;
  location: string;
  medical_subjects: string;
  description?: string | null;
  license_type: string;
  license_number: string;
  document_issue_number: string;
  document_image_urls: string[];
  created_at: string;
};

export default function ClinicRegisterCompletePage() {
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL ?? "", []);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClinics = async () => {
      if (!apiUrl) {
        setError("API 주소가 설정되지 않았습니다.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiUrl}/iam/members/clinics`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body?.message === "string"
              ? body.message
              : "클리닉 정보를 불러오지 못했습니다."
          );
        }
        const data = (await response.json()) as Clinic[];
        setClinics(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "클리닉 정보를 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchClinics();
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="text-center space-y-4">
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
            클리닉 인증 완료
          </h1>
          <p className="text-sm text-slate-500 md:text-base">
            입력하신 정보로 등록된 클리닉을 확인하세요.
          </p>
        </header>

        <section className="mx-auto w-full max-w-3xl rounded-3xl border border-white bg-white shadow-[0px_24px_60px_rgba(15,23,42,0.08)] p-6 md:p-10">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              클리닉 정보를 불러오는 중입니다...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-500">{error}</div>
          ) : clinics.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              등록된 클리닉이 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {clinics.map((clinic) => (
                <article
                  key={clinic.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold text-slate-900">
                        {clinic.name}
                      </h2>
                      {clinic.english_name && (
                        <p className="text-sm text-slate-500">
                          {clinic.english_name}
                        </p>
                      )}
                      <div className="flex gap-2 text-xs text-indigo-500">
                        <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium">
                          {clinic.category}
                        </span>
                        <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium">
                          {clinic.license_type}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      등록일: {new Date(clinic.created_at).toLocaleString()}
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <div>
                      <dt className="font-medium text-slate-500">소재지</dt>
                      <dd>{clinic.location}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">진료과목</dt>
                      <dd>{clinic.medical_subjects}</dd>
                    </div>
                    {clinic.description && (
                      <div className="md:col-span-2">
                        <dt className="font-medium text-slate-500">설명 (법인명)</dt>
                        <dd>{clinic.description}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="font-medium text-slate-500">면허번호</dt>
                      <dd>{clinic.license_number}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">문서발급번호</dt>
                      <dd>{clinic.document_issue_number}</dd>
                    </div>
                  </dl>

                 
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6">
          <div className="flex w-full items-center justify-center gap-3 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-medium text-green-600 shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-5 w-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            클리닉 인증 완료
          </div>
          <button
            type="button"
            className="rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-indigo-600 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            다음
          </button>
        </footer>
      </div>
    </div>
  );
}

