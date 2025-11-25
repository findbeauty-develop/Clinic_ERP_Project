"use client";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">대시보드</h1>
      </div>
      <div className="p-4 space-y-4">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-900">주문 현황</h2>
          <p className="text-slate-600">대기 중인 주문: 0건</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-900">제품 현황</h2>
          <p className="text-slate-600">등록된 제품: 0개</p>
        </div>
      </div>
    </div>
  );
}
