"use client";

import { useState, useEffect } from "react";

export default function DashboardPage() {
  const [currentBannerSlide, setCurrentBannerSlide] = useState(0);
  const [currentNewsTab, setCurrentNewsTab] = useState("추천");
  const [currentProductSlide, setCurrentProductSlide] = useState(0);

  // Mock data
  const bannerSlides = [
    {
      id: 1,
      title: "프리미엄 스킨케어 제품 신규 입고",
      subtitle: "유럽 최고급 브랜드의 안티에이징 제품군을 만나보세요",
      bgImage: "bg-gradient-to-r from-purple-600 to-indigo-600",
    },
    {
      id: 2,
      title: "여름 특가 세일 진행중",
      subtitle: "최대 50% 할인 혜택을 놓치지 마세요",
      bgImage: "bg-gradient-to-r from-pink-500 to-rose-500",
    },
    {
      id: 3,
      title: "신제품 런칭 이벤트",
      subtitle: "첫 구매 고객에게 특별 혜택을 드립니다",
      bgImage: "bg-gradient-to-r from-blue-500 to-cyan-500",
    },
  ];

  const newsTabs = ["추천", "카테크", "웹툰", "패션뷰티", "리빙푸드", "책방", "지식", "건강", "게임"];

  const newsArticles = [
    {
      id: 1,
      title: "결국 사실로 밝혀진 호주의 6m 왕도마 뱀 목격담",
      source: "탐사튜브",
      image: "bg-gradient-to-br from-green-400 to-emerald-600",
      category: "지식",
    },
    {
      id: 2,
      title: "하버드대가 발표한 '은근 매력적인 사람' 특징 5가지",
      source: "오분서가",
      image: "bg-gradient-to-br from-purple-400 to-pink-600",
      category: "지식",
    },
    {
      id: 3,
      title: "북한에서 김일성을 우상시하는 전투가 있다?",
      source: "역사돋보기",
      image: "bg-gradient-to-br from-blue-400 to-indigo-600",
      category: "지식",
      isVideo: true,
      duration: "01:02",
    },
    {
      id: 4,
      title: "4살 준이와 앞이 보이지 않는... 신장투석 중인 할머니 곁을 지...",
      source: "밀알복지재단",
      image: "bg-gradient-to-br from-orange-400 to-red-600",
      category: "지식",
      isAd: true,
    },
    {
      id: 5,
      title: "친구로도 지내선 안 되는 사람 특징 5",
      source: "부크럼",
      image: "bg-gradient-to-br from-yellow-400 to-orange-600",
      category: "지식",
    },
    {
      id: 6,
      title: "센스 있다고 난리난 김호영 거절법 ㄷㄷ",
      source: "피카 출판사",
      image: "bg-gradient-to-br from-teal-400 to-cyan-600",
      category: "지식",
    },
  ];

  const productRecommendations = [
    {
      id: 1,
      name: "대웅제약 밀크씨 슬 간 건강 실...",
      image: "bg-gradient-to-br from-red-400 to-red-600",
      isAd: true,
    },
    {
      id: 2,
      name: "로킷아메리카 NMN 프테로스...",
      image: "bg-gradient-to-br from-blue-400 to-blue-600",
      isAd: true,
    },
    {
      id: 3,
      name: "[2개월] 더작 유기농 양배추즙",
      image: "bg-gradient-to-br from-green-400 to-green-600",
      isAd: true,
    },
  ];

  const weatherData = {
    current: 6.2,
    condition: "구름많음",
    min: -3,
    max: 7,
    airQuality: { fine: "좋음", ultrafine: "좋음" },
    hourly: [
      { time: "18시", temp: 3, icon: "cloud" },
      { time: "20", temp: 3, icon: "cloud" },
      { time: "22", temp: 3, icon: "cloud" },
      { time: "0", temp: 3, icon: "cloud" },
      { time: "2", temp: 3, icon: "cloud" },
    ],
  };

  const scheduleEvents = [
    {
      id: 1,
      title: "개발팀 회의",
      date: "2025-12-11",
      day: "목",
      time: "15:00 ~ 16:30",
    },
  ];

  const messages = [
    {
      id: 1,
      clinic: "XXX Clinic",
      sender: "김원장",
      unread: 5,
    },
    {
      id: 2,
      clinic: "YYY Clinic",
      sender: "이원장",
      unread: 2,
    },
    {
      id: 3,
      clinic: "ZZZ Clinic",
      sender: "박원장",
      unread: 0,
    },
    {
      id: 4,
      clinic: "AAA Clinic",
      sender: "최원장",
      unread: 1,
    },
  ];

  // Auto-rotate banner
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBannerSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const nextBannerSlide = () => {
    setCurrentBannerSlide((prev) => (prev + 1) % bannerSlides.length);
  };

  const prevBannerSlide = () => {
    setCurrentBannerSlide((prev) => (prev - 1 + bannerSlides.length) % bannerSlides.length);
  };

  const nextProductSlide = () => {
    setCurrentProductSlide((prev) => (prev + 1) % productRecommendations.length);
  };

  const prevProductSlide = () => {
    setCurrentProductSlide((prev) => (prev - 1 + productRecommendations.length) % productRecommendations.length);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">대시보드</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">클리닉의 재고 현황을 한눈에 확인하세요</p>
      </div>

      {/* Top Banner Carousel */}
      <div className="relative mb-6 h-64 rounded-2xl overflow-hidden shadow-lg">
        <div className="relative h-full">
          {bannerSlides.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-500 ${
                index === currentBannerSlide ? "opacity-100" : "opacity-0"
              } ${slide.bgImage}`}
            >
              <div className="absolute inset-0 bg-black/20"></div>
              <div className="relative h-full flex items-center justify-start px-12">
                <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-xl p-6 max-w-md">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{slide.title}</h2>
                  <p className="text-gray-700 dark:text-gray-300">{slide.subtitle}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={prevBannerSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 rounded-full p-2 shadow-lg transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button
          onClick={nextBannerSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 rounded-full p-2 shadow-lg transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Dots Indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {bannerSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentBannerSlide(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentBannerSlide ? "w-8 bg-white" : "w-2 bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Left Column (70%) */}
        <div className="lg:col-span-7 space-y-6">
          {/* News Section */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
            {/* News Tabs */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {newsTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCurrentNewsTab(tab)}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                      currentNewsTab === tab
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <a href="#" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap">
                구독홈 &gt;
              </a>
            </div>

            {/* News Articles Grid */}
            <div className="grid grid-cols-2 gap-4">
              {newsArticles.map((article) => (
                <div
                  key={article.id}
                  className="group cursor-pointer rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800 hover:shadow-lg transition-all"
                >
                  <div className={`h-32 ${article.image} relative`}>
                    {article.isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-black/50 rounded-full p-3">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="white" viewBox="0 0 24 24" className="w-6 h-6">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                          {article.duration}
                        </span>
                      </div>
                    )}
                    {article.isAd && (
                      <span className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
                        AD
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{article.source}</p>
                    {article.isAd && (
                      <a href="#" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-2 inline-block">
                        더 알아보기 &gt;
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Product Recommendations (Ads) */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">주목할 만한 상품 추천</h2>
              <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded">AD</span>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-xl">
                <div
                  className="flex transition-transform duration-300 ease-in-out"
                  style={{ transform: `translateX(-${currentProductSlide * 100}%)` }}
                >
                  {productRecommendations.map((product) => (
                    <div key={product.id} className="min-w-full flex-shrink-0">
                      <div className="flex gap-4 items-center bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl p-4">
                        <div className={`w-24 h-24 ${product.image} rounded-lg flex-shrink-0`}></div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{product.name}</h3>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product Carousel Navigation */}
              <button
                onClick={prevProductSlide}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 rounded-full p-2 shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={nextProductSlide}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 rounded-full p-2 shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (30%) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Weather Widget */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-4xl font-bold text-gray-900 dark:text-white">{weatherData.current}°</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{weatherData.condition}</div>
              </div>
              <div className="text-4xl">☁️</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
              <span>최저 {weatherData.min}°</span>
              <span>/</span>
              <span>최고 {weatherData.max}°</span>
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">미세</span>
                <span className="text-green-600 dark:text-green-400 font-medium">{weatherData.airQuality.fine}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">초미세</span>
                <span className="text-green-600 dark:text-green-400 font-medium">{weatherData.airQuality.ultrafine}</span>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pt-2 border-t border-gray-200 dark:border-gray-700">
              {weatherData.hourly.map((hour, index) => (
                <div key={index} className="flex-shrink-0 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{hour.time}</div>
                  <div className="text-lg mb-1">☁️</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{hour.temp}°</div>
                </div>
              ))}
            </div>
          </div>

          {/* Calendar/Schedule */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">일정</h2>
              <div className="flex gap-2">
                <select className="text-sm bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1 border-0">
                  <option>프로젝트 일정</option>
                </select>
                <button className="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1 hover:bg-indigo-700">
                  오늘
                </button>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <div className="font-semibold text-gray-900 dark:text-white">2025 - 12월</div>
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-600 dark:text-gray-400 mb-2">
                {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                  <div key={day} className="py-1 font-medium">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }, (_, i) => {
                  const date = i + 1;
                  const isToday = date === 11;
                  return (
                    <div
                      key={i}
                      className={`aspect-square flex items-center justify-center text-sm rounded-lg ${
                        isToday
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      {date <= 31 ? date : ""}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              {scheduleEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                  <div className="text-indigo-600 dark:text-indigo-400 mt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-white">{event.title}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {event.date} ({event.day}), {event.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Messages/Notifications */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">쪽지함</h2>
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                        {message.clinic.charAt(0)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate">{message.clinic}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 truncate">{message.sender}</div>
                    </div>
                  </div>
                  {message.unread > 0 && (
                    <div className="flex-shrink-0">
                      <div className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {message.unread}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
