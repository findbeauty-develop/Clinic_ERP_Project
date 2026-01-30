"use client";

import KoreanClockWidget from "@/components/watch";
import { apiGet } from "@/lib/api";
import { duration } from "html2canvas/dist/types/css/property-descriptors/duration";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [currentBannerSlide, setCurrentBannerSlide] = useState(0);
  const [currentNewsTab, setCurrentNewsTab] = useState(
    searchParams.get("tab") || "추천"
  );
  const [currentProductSlide, setCurrentProductSlide] = useState(0);
  const [newsArticlesState, setNewsArticlesState] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  // Weather state
  const [weatherData, setWeatherData] = useState<any>(null);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [airQualityData, setAirQualityData] = useState<any>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [selectedCity, setSelectedCity] = useState("seoul");
  const [scheduleType, setScheduleType] = useState("프로젝트 일정");

  const [particlePositions, setParticlePositions] = useState<
    Array<{
      left: number;
      top: number;
      duration: number;
    }>
  >([]);

  useEffect(() => {
    setParticlePositions(
      Array.from({ length: 6 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        duration: 3 + Math.random() * 2,
      }))
    );
  }, []);

  const monthInputValue = useMemo(() => {
    const date = selectedDate || currentDate;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, [selectedDate, currentDate]);

  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "https://api.jaclit.com",
    []
  );

  // Add mock order data (after line 56, before newsTabs)
  const mockOrders = [
    {
      id: 1,
      company: "A사",
      status: "접수대기",
      statusColor: "bg-green-600",
    },
    {
      id: 2,
      company: "B사",
      status: "진행중",
      statusColor: "bg-orange-500",
    },
    {
      id: 3,
      company: "C사",
      status: "거절",
      statusColor: "bg-red-500",
    },
    {
      id: 4,
      company: "D사",
      status: "완료",
      statusColor: "bg-gray-500",
    },
  ];

  // Mock data
  const bannerSlides = [
    {
      id: 1,
      title: "프리미엄 스킨케어 제품 신규 입고",
      subtitle: "유럽 최고급 브랜드의 안티에이징 제품군을 만나보세요",
      imageUrl: "/images/baner1.jpg",
      bgImage: "bg-gradient-to-r from-purple-600 to-indigo-600",
    },
    {
      id: 2,
      title: "여름 특가 세일 진행중",
      subtitle: "최대 50% 할인 혜택을 놓치지 마세요",
      imageUrl: "/images/baner2.JPG",
      bgImage: "bg-gradient-to-r from-pink-500 to-rose-500",
    },
    {
      id: 3,
      title: "신제품 런칭 이벤트",
      subtitle: "첫 구매 고객에게 특별 혜택을 드립니다",
      imageUrl: "/images/baner3.jpg",
      bgImage: "bg-gradient-to-r from-blue-500 to-cyan-500",
    },
  ];

  const newsTabs = [
    "추천",
    "건강",
    "비즈니스",
    "기술",
    "과학",
    "스포츠",
    "엔터테인먼트",
  ];

  // Sync URL param with state when URL changes
  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && newsTabs.includes(tabFromUrl)) {
      setCurrentNewsTab(tabFromUrl);
    } else if (!tabFromUrl) {
      setCurrentNewsTab("추천");
    }
  }, [searchParams]);

  // Category to keywords mapping
  // Category to keywords mapping
  const categoryKeywords: Record<string, string[]> = {
    "의료·헬스케어": ["의료", "헬스케어", "건강"],
    "제약·바이오": ["제약", "바이오", "약품"],
    의료기기: ["의료기기", "의료장비"],
    "병원·클리닉 운영": ["병원", "클리닉", "의원"],
    "정책·규제": ["의료정책", "보건정책", "규제"],
    "보험·수가": ["건강보험", "수가", "의료보험"],
    "보안·개인정보": ["의료정보", "개인정보", "보안"],
    "AI·기술": ["의료AI", "디지털헬스", "의료기술"],
    "리콜·안전": ["의료기기리콜", "안전"],
    "시장·산업 동향": ["의료시장", "헬스케어산업"],
  };

  // const newsArticles = [
  //   {
  //     id: 1,
  //     title: "결국 사실로 밝혀진 호주의 6m 왕도마 뱀 목격담",
  //     source: "탐사튜브",
  //     image: "bg-gradient-to-br from-green-400 to-emerald-600",
  //     category: "의료·헬스케어",
  //   },
  //   {
  //     id: 2,
  //     title: "하버드대가 발표한 '은근 매력적인 사람' 특징 5가지",
  //     source: "오분서가",
  //     image: "bg-gradient-to-br from-purple-400 to-pink-600",
  //     category: "제약·바이오",
  //   },
  //   {
  //     id: 3,
  //     title: "북한에서 김일성을 우상시하는 전투가 있다?",
  //     source: "역사돋보기",
  //     image: "bg-gradient-to-br from-blue-400 to-indigo-600",
  //     category: "의료기기",
  //     isVideo: true,
  //     duration: "01:02",
  //   },
  //   {
  //     id: 4,
  //     title: "4살 준이와 앞이 보이지 않는... 신장투석 중인 할머니 곁을 지...",
  //     source: "밀알복지재단",
  //     image: "bg-gradient-to-br from-orange-400 to-red-600",
  //     category: "병원·클리닉 운영",
  //     isAd: true,
  //   },
  //   {
  //     id: 5,
  //     title: "친구로도 지내선 안 되는 사람 특징 5",
  //     source: "부크럼",
  //     image: "bg-gradient-to-br from-yellow-400 to-orange-600",
  //     category: "정책·규제",
  //   },
  //   {
  //     id: 6,
  //     title: "센스 있다고 난리난 김호영 거절법 ㄷㄷ",
  //     source: "피카 출판사",
  //     image: "bg-gradient-to-br from-teal-400 to-cyan-600",
  //     category: "보험·수가",
  //   },
  //   {
  //     id: 7,
  //     title: "센스 있다고 난리난 김호영 거절법 ㄷㄷ",
  //     source: "피카 출판사",
  //     image: "bg-gradient-to-br from-teal-400 to-cyan-600",
  //     category: "보안·개인정보",
  //   },
  //   {
  //     id: 8,
  //     title: "센스 있다고 난리난 김호영 거절법 ㄷㄷ",
  //     source: "피카 출판사",
  //     image: "bg-gradient-to-br from-teal-400 to-cyan-600",
  //     category: "AI·기술",
  //   },
  //   {
  //     id: 9,
  //     title: "센스 있다고 난리난 김호영 거절법 ㄷㄷ",
  //     source: "피카 출판사",
  //     image: "bg-gradient-to-br from-teal-400 to-cyan-600",
  //     category: "리콜·안전",
  //   },
  //   {
  //     id: 10,
  //     title: "센스 있다고 난리난 김호영 거절법 ㄷㄷ",
  //     source: "피카 출판사",
  //     image: "bg-gradient-to-br from-teal-400 to-cyan-600",
  //     category: "시장·산업 동향",
  //   },
  // ];

  const productRecommendations = [
    {
      id: 1,
      name: "뉴라미스 하트 필러/1cc×1S/1박스",
      image: "/images/ads_1.png",
      isAd: true,
    },
    {
      id: 2,
      name: "뉴라미스 스킨 인헨서 필러/1cc×1S",
      image: "/images/ads_2.png",
      isAd: true,
    },
    {
      id: 3,
      name: "특가)뉴럭스주100",
      image: "/images/ads_3.png",
      isAd: true,
    },
    {
      id: 4,
      name: "스킨바이브/1cc×2S/1박스",
      image: "/images/ads_4.png",
      isAd: true,
    },
    {
      id: 5,
      name: "쥬베룩_볼륨",
      image: "/images/ads_5.png",
      isAd: true,
    },
    {
      id: 6,
      name: "PD NANO Cannula",
      image: "/images/ads_6.jpg",
      isAd: true,
    },
  ];

  // Fetch weather data - parallelized for better performance
  useEffect(() => {
    const fetchWeatherData = async () => {
      setLoadingWeather(true);
      try {
        // Fetch all weather data in parallel
        const [
          currentWeatherResult,
          forecastResult,
          hourlyResult,
          airQualityResult,
        ] = await Promise.allSettled([
          apiGet(`/api/weather/current/${selectedCity}`),
          apiGet(`/api/weather/forecast/${selectedCity}?days=7`),
          apiGet(`/api/weather/hourly/${selectedCity}`),
          apiGet(`/api/weather/air-quality/${selectedCity}`),
        ]);

        // Process current weather
        if (currentWeatherResult.status === "fulfilled") {
          setWeatherData(currentWeatherResult.value);
        } else {
          setWeatherData({
            temperature: 6.2,
            condition: "맑음",
            conditionEn: "Clear",
          });
        }

        // Process forecast
        if (forecastResult.status === "fulfilled") {
          const forecast = forecastResult.value;
          if (
            forecast &&
            forecast.forecast &&
            Array.isArray(forecast.forecast)
          ) {
            setForecastData(forecast.forecast);
          } else if (forecast && Array.isArray(forecast)) {
            setForecastData(forecast);
          } else {
            setForecastData([]);
          }
        } else {
          setForecastData([]);
        }

        // Process hourly forecast
        if (hourlyResult.status === "fulfilled") {
          const hourly = hourlyResult.value;
          if (hourly && hourly.hourly) {
            setHourlyData(hourly.hourly.slice(0, 6)); // First 6 hours
          } else {
            setHourlyData([]);
          }
        } else {
          setHourlyData([]);
        }

        // Process air quality
        if (airQualityResult.status === "fulfilled") {
          const airQuality = airQualityResult.value;
          if (airQuality && airQuality.airQuality) {
            setAirQualityData(airQuality.airQuality);
          } else {
            setAirQualityData({ fine: "좋음", ultrafine: "좋음" });
          }
        } else {
          setAirQualityData({ fine: "좋음", ultrafine: "좋음" });
        }
      } catch (error) {
        // Fallback to mock data
        setWeatherData({
          temperature: 6.2,
          condition: "맑음",
          conditionEn: "Clear",
        });
        setForecastData([]);
        setHourlyData([]);
        setAirQualityData({ fine: "좋음", ultrafine: "좋음" });
      } finally {
        setLoadingWeather(false);
      }
    };

    fetchWeatherData();
    // Refresh every 30 minutes
    const interval = setInterval(fetchWeatherData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedCity, apiUrl]);

  // Get weather icon based on condition
  const getWeatherIcon = (condition: string) => {
    const cond = condition?.toLowerCase() || "";
    if (cond.includes("맑음") || cond.includes("clear")) {
      return "☀️";
    } else if (cond.includes("구름") || cond.includes("cloud")) {
      return "☁️";
    } else if (cond.includes("비") || cond.includes("rain")) {
      return "🌧️";
    } else if (cond.includes("눈") || cond.includes("snow")) {
      return "❄️";
    } else if (cond.includes("흐림") || cond.includes("overcast")) {
      return "🌫️";
    }
    return "☀️";
  };

  // Get weather gradient based on condition
  const getWeatherGradient = (condition: string) => {
    const cond = condition?.toLowerCase() || "";
    if (cond.includes("맑음") || cond.includes("clear")) {
      return "from-yellow-400 to-orange-300";
    } else if (cond.includes("구름") || cond.includes("cloud")) {
      return "from-blue-300 to-gray-400";
    } else if (cond.includes("비") || cond.includes("rain")) {
      return "from-blue-500 to-indigo-600";
    } else if (cond.includes("눈") || cond.includes("snow")) {
      return "from-gray-200 to-blue-200";
    }
    return "from-blue-400 to-cyan-300";
  };

  // const scheduleEvents = [
  //   {
  //     id: 1,
  //     title: "개발팀 회의",
  //     date: "2025-12-11",
  //     day: "목",
  //     time: "15:00 ~ 16:30",
  //   },
  // ];

  // Fetch holidays from backend
  useEffect(() => {
    const fetchHolidays = async () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      setLoadingHolidays(true);
      try {
        const response = await apiGet(
          `/api/calendar/holidays/${year}/${month}`
        );

        if (response && response.holidays) {
          setHolidays(response.holidays);
        } else {
        }
      } catch (error) {
        setHolidays([]);
      } finally {
        setLoadingHolidays(false);
      }
    };

    fetchHolidays();
  }, [currentDate, apiUrl]);

  // Calendar navigation functions
  const goToPreviousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
  };

  const goToNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get calendar days for current month
  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: Array<{
      date: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isHoliday: boolean;
      isSunday: boolean; // ✅ Qo'shildi
      holidayName?: string;
      fullDate?: Date;
    }> = [];

    // Fill empty cells before first day
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({
        date: 0,
        isCurrentMonth: false,
        isToday: false,
        isHoliday: false,
        isSunday: false, // ✅ Qo'shildi
      });
    }

    // Fill days of current month
    const today = new Date();
    for (let date = 1; date <= daysInMonth; date++) {
      const cellDate = new Date(year, month, date);
      const isToday =
        cellDate.getDate() === today.getDate() &&
        cellDate.getMonth() === today.getMonth() &&
        cellDate.getFullYear() === today.getFullYear();

      // Check if this date is Sunday (0 = Sunday in JavaScript Date)
      const isSunday = cellDate.getDay() === 0;

      // Check if this date is a holiday
      const holiday = holidays.find((h) => {
        if (!h.date) return false;

        // Handle both Date objects and date strings from backend
        let holidayDate: Date;
        if (h.date instanceof Date) {
          holidayDate = h.date;
        } else if (typeof h.date === "string") {
          // Parse ISO date string (e.g., "2026-01-01T00:00:00.000Z" or "2026-01-01")
          holidayDate = new Date(h.date);
        } else {
          return false;
        }

        // Check if date is valid
        if (isNaN(holidayDate.getTime())) {
          return false;
        }

        // Normalize dates to midnight for accurate comparison (avoid timezone issues)
        const normalizedHolidayDate = new Date(
          holidayDate.getFullYear(),
          holidayDate.getMonth(),
          holidayDate.getDate()
        );
        const normalizedCellDate = new Date(year, month, date);

        // Compare dates properly (ignore time)
        const isMatch =
          normalizedHolidayDate.getFullYear() ===
            normalizedCellDate.getFullYear() &&
          normalizedHolidayDate.getMonth() === normalizedCellDate.getMonth() &&
          normalizedHolidayDate.getDate() === normalizedCellDate.getDate();

        return isMatch;
      });

      days.push({
        date,
        isCurrentMonth: true,
        isToday,
        isHoliday: !!holiday,
        isSunday, // ✅ Qo'shildi
        holidayName: holiday?.name,
        fullDate: cellDate,
      });
    }

    // Fill remaining cells to make 35 cells total (5 rows x 7 days)
    const remainingCells = 35 - days.length;
    for (let i = 0; i < remainingCells; i++) {
      days.push({
        date: 0,
        isCurrentMonth: false,
        isToday: false,
        isHoliday: false,
        isSunday: false, // ✅ Qo'shildi
      });
    }

    return days;
  };

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

  // Fetch Korean government news from data.go.kr API
  useEffect(() => {
    const fetchNews = async () => {
      setLoadingNews(true);
      try {
        // Backend API endpoint: /news/latest (RSS feeds with category filtering)
        const categoryParam =
          currentNewsTab && currentNewsTab !== "추천"
            ? `&category=${encodeURIComponent(currentNewsTab)}`
            : "";
        const apiEndpoint = `/news/latest?numOfRows=6${categoryParam}`;

        const response = await apiGet<{
          resultCode: string;
          resultMsg: string;
          totalCount: number;
          items: any[];
          pageNo: number;
          numOfRows: number;
        }>(apiEndpoint);

        if (response && response.items && Array.isArray(response.items)) {
          if (response.items.length === 0) {
            setNewsArticlesState([]);
            return;
          }

          const formattedNews = response.items.map(
            (item: any, index: number) => {
              // Format date
              const publishedDate = item.publishDate
                ? new Date(item.publishDate).toLocaleDateString("ko-KR", {
                    month: "short",
                    day: "numeric",
                  })
                : "";

              // Handle image URL - filter out placeholder images
              let imageUrl = item.imageUrl || item.thumbnailUrl || null;
              // Don't show placeholder images - show fallback UI instead
              if (
                imageUrl &&
                (imageUrl.includes("placeholder") ||
                  imageUrl.includes("via.placeholder"))
              ) {
                imageUrl = null; // Filter out placeholder URLs
              }

              return {
                id: item.detailUrl || `news-${index}`,
                title: item.title || "제목 없음",
                description: item.department || "",
                source: item.department || "과학기술정보통신부",
                image: imageUrl,
                category: currentNewsTab,
                url: item.detailUrl,
                publishedAt: item.publishDate,
                publishedDate: publishedDate,
                author: item.manager,
                contact: item.contact,
                attachments: item.attachments || [],
              };
            }
          );

          // Limit to 6 items for dashboard
          setNewsArticlesState(formattedNews.slice(0, 6));
        } else {
          setNewsArticlesState([]);
        }
      } catch (error: any) {
        setNewsArticlesState([]);
      } finally {
        setLoadingNews(false);
      }
    };

    if (currentNewsTab) {
      fetchNews();
    }
  }, [apiUrl, currentNewsTab]);

  const nextBannerSlide = () => {
    setCurrentBannerSlide((prev) => (prev + 1) % bannerSlides.length);
  };

  const prevBannerSlide = () => {
    setCurrentBannerSlide(
      (prev) => (prev - 1 + bannerSlides.length) % bannerSlides.length
    );
  };

  const nextProductSlide = () => {
    setCurrentProductSlide((prev) => {
      const maxSlide = Math.max(0, productRecommendations.length - 3);
      return prev >= maxSlide ? 0 : prev + 3;
    });
  };

  const prevProductSlide = () => {
    setCurrentProductSlide((prev) => {
      const maxSlide = Math.max(0, productRecommendations.length - 3);
      return prev <= 0 ? maxSlide : prev - 3;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      {/* Header */}
      {/* <div className="mb-6">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          대시보드
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          클리닉의 재고 현황을 한눈에 확인하세요
        </p>
      </div> */}

      {/* Top Banner Carousel */}
      <div className="relative mb-6 h-[280px] rounded-2xl overflow-hidden shadow-lg">
        <div className="relative h-full">
          {bannerSlides.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-500 ${
                index === currentBannerSlide ? "opacity-100" : "opacity-0"
              }`}
            >
              {/* Background Image */}
              {slide.imageUrl ? (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${slide.imageUrl})` }}
                ></div>
              ) : (
                <div className={`absolute inset-0 ${slide.bgImage}`}></div>
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-black/30"></div>

              {/* Content */}
              <div className="relative h-full flex items-center justify-start px-12">
                <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-xl p-6 max-w-md">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {slide.title}
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300">
                    {slide.subtitle}
                  </p>
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </button>
        <button
          onClick={nextBannerSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 rounded-full p-2 shadow-lg transition-all"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>

        {/* Dots Indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {bannerSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentBannerSlide(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentBannerSlide
                  ? "w-8 bg-white"
                  : "w-2 bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>
      {/* Quick Actions - After Banner, Before Main Content */}
      {/* <div className="mb-6">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
    빠른 작업
  </h2>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {/* 제품 가격 관리 Card */}
      {/* <Link
      href="/inventory/products/pricing"
      className="group bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105 border border-gray-100 dark:border-gray-800"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl group-hover:scale-110 transition-transform">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <span className="font-semibold text-gray-900 dark:text-white">
          제품 가격 관리
        </span>
      </div>
    </Link> */}

      {/* 협력업체 관리 Card */}
      {/* <Link
      href="/suppliers"
      className="group bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105 border border-gray-100 dark:border-gray-800"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="p-4 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl group-hover:scale-110 transition-transform">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
            />
          </svg>
        </div>
        <span className="font-semibold text-gray-900 dark:text-white">
          협력업체 관리
        </span>
      </div>
    </Link> */}

      {/* 재고 현황 Card */}
      {/* <Link
      href="/inventory"
      className="group bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105 border border-gray-100 dark:border-gray-800"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            />
          </svg>
        </div>
        <span className="font-semibold text-gray-900 dark:text-white">
          재고 현황
        </span>
      </div>
    </Link> */}

      {/* 주문 관리 Card */}
      {/* <Link
      href="/order"
      className="group bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105 border border-gray-100 dark:border-gray-800"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="p-4 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl group-hover:scale-110 transition-transform">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h11.25c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
            />
          </svg>
        </div>
        <span className="font-semibold text-gray-900 dark:text-white">
          주문 관리
        </span>
      </div>
    </Link> */}
      {/* </div>
</div> */}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 ">
        {/* Left Column (70%) */}
        <div className="lg:col-span-7 space-y-6 ">
          {/* News Section - Enhanced Design */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-400 dark:border-gray-700">
            {/* Header with Gradient */}
            <div className="bg-white from-indigo-600 via-purple-600 to-pink-600 p-6 text-white">
              <div className="flex items-center justify-between">
                {/* <div>
                  <h2 className="text-2xl font-bold mb-1">최신 뉴스</h2>
                  <p className="text-sm opacity-90">
                    실시간으로 업데이트되는 뉴스를 확인하세요
                  </p>
                </div> */}
                {/* <div className="hidden md:flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span className="text-sm font-semibold">실시간</span>
                </div> */}
              </div>

              {/* News Tabs - Text-based with slashes */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-2 mr-8 text-3xl font-bold text-black dark:text-white py-2">
                  <img
                    src="/images/news.svg"
                    alt="news"
                    className="w-16 h-16"
                  />
                  <span className="text-3xl font-bold text-black dark:text-white">
                    뉴스
                  </span>
                </div>
                {newsTabs.map((tab, index) => {
                  const isActive = currentNewsTab === tab;
                  return (
                    <div key={tab} className="flex items-center gap-2">
                      <Link
                        href={`/dashboard?tab=${encodeURIComponent(tab)}`}
                        onClick={() => setCurrentNewsTab(tab)}
                        className={`font-bold text-xl whitespace-nowrap transition-colors ${
                          isActive
                            ? "text-black dark:text-white"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        }`}
                      >
                        {tab}
                      </Link>
                      {index < newsTabs.length - 1 && (
                        <span className="text-gray-300 dark:text-gray-600 font-bold">
                          /
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* News Articles Grid - Horizontal Layout with 2 Columns */}
            <div className="p-2 max-h-[750px] overflow-y-auto">
              {loadingNews ? (
                <div className="grid grid-cols-2 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse bg-white dark:bg-gray-800  overflow-hidden flex flex-row border border-gray-200 dark:border-gray-700"
                    >
                      <div className="w-40 h-28 bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
                      <div className="flex-1 p-3 space-y-2">
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : newsArticlesState.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {newsArticlesState.map((article, index) => {
                    // Format timestamp (relative time)
                    const formatTimeAgo = (dateString?: string) => {
                      if (!dateString) return "";
                      try {
                        const date = new Date(dateString);
                        const now = new Date();
                        const diffMs = now.getTime() - date.getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMins / 60);
                        const diffDays = Math.floor(diffHours / 24);

                        if (diffMins < 1) return "방금 전";
                        if (diffMins < 60) return `${diffMins}분 전`;
                        if (diffHours < 24) return `${diffHours}시간 전`;
                        if (diffDays < 7) return `${diffDays}일 전`;
                        return date.toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        });
                      } catch {
                        return "";
                      }
                    };

                    return (
                      <div
                        key={article.id || index}
                        onClick={() => {
                          // Open news detail page in new tab when clicking card
                          if (article.url) {
                            window.open(
                              article.url,
                              "_blank",
                              "noopener,noreferrer"
                            );
                          }
                        }}
                        className="group cursor-pointer overflow-hidden bg-white dark:bg-gray-900 hover:shadow-lg transition-all duration-300 border border-gray-200 dark:border-gray-700 flex flex-row"
                      >
                        {/* Image Section - Left Side */}
                        <div className="relative w-40 h-28 flex-shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-800 ">
                          {article.image &&
                          !article.image.includes("placeholder") &&
                          !article.image.includes("via.placeholder") ? (
                            <img
                              src={article.image}
                              alt={article.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                // Hide failed image and show fallback
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                // Check if fallback already exists
                                const parent = target.parentElement;
                                if (
                                  parent &&
                                  !parent.querySelector(".image-fallback")
                                ) {
                                  const fallback =
                                    document.createElement("div");
                                  fallback.className =
                                    "image-fallback w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800";
                                  fallback.innerHTML = `
                                    <svg class="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path>
                                    </svg>
                                  `;
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                              <svg
                                className="w-10 h-10 text-gray-300 dark:text-gray-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                                />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Content Section - Right Side */}
                        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                          <div className="flex-1">
                            {/* Title - Can be 2 lines */}
                            <h3 className="font-bold text-gray-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors text-sm leading-tight mb-2">
                              {article.title}
                            </h3>
                          </div>

                          <div className="flex flex-col gap-1 mt-auto">
                            {/* Source/Subtitle */}
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 bg-black dark:bg-white rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-white dark:text-black text-[9px] font-bold">
                                  {article.source?.charAt(0) ||
                                    article.category?.charAt(0) ||
                                    "N"}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-600 dark:text-gray-400 font-medium truncate">
                                {article.source || article.category || "뉴스"}
                              </p>
                            </div>

                            {/* Timestamp */}
                            {/* {(article.publishedDate || article.publishedAt) && (
                              <p className="text-[10px] text-gray-500 dark:text-gray-500">
                                {formatTimeAgo(article.publishedDate || article.publishedAt)}
                              </p>
                            )} */}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <svg
                    className="w-24 h-24 text-gray-300 dark:text-gray-700 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                    />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-lg font-semibold mb-2">
                    뉴스를 불러올 수 없습니다
                  </p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm">
                    잠시 후 다시 시도해주세요
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 h-[340px] rounded-2xl shadow-lg p-4 flex flex-col border border-gray-400 dark:border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  일정
                </h2>

                <div className="relative">
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value)}
                    className="appearance-none bg-transparent border-none text-gray-700 dark:text-gray-300 font-medium cursor-pointer pr-6 focus:outline-none text-sm"
                  >
                    <option value="개인 일정">개인 일정</option>
                    <option value="회의 일정">회의 일정</option>
                  </select>
                  <svg
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={goToToday}
                  className="text-xs bg-indigo-600 text-white rounded-lg px-2.5 py-1 hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 bg-white rounded-full"></span>
                  오늘
                </button>
              </div>
            </div>

            {/* Calendar and Order List Grid */}
            <div className="grid grid-cols-[1fr_auto] gap-4 flex-1 min-h-0">
              {/* Calendar Section */}
              <div className="flex flex-col flex-1 min-h-0">
                {/* Month Nav */}
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <button
                    onClick={goToPreviousMonth}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 19.5L8.25 12l7.5-7.5"
                      />
                    </svg>
                  </button>

                  <div className="relative">
                    <input
                      type="month"
                      value={monthInputValue}
                      onChange={(e) => {
                        if (e.target.value) {
                          const [year, month] = e.target.value
                            .split("-")
                            .map(Number);
                          setCurrentDate(new Date(year, month - 1, 1));
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-1 cursor-pointer text-sm pointer-events-none">
                      {(selectedDate || currentDate).getFullYear()} -{" "}
                      {(selectedDate || currentDate).getMonth() + 1}월 -{" "}
                      {(selectedDate || currentDate).getDate()}일{" "}
                      <svg
                        className="w-4 h-4 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>

                  <button
                    onClick={goToNextMonth}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </button>
                </div>

                {/* Weekdays */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-600 dark:text-gray-400 mb-1 shrink-0">
                  {["일", "월", "화", "수", "목", "금", "토"].map(
                    (day, index) => (
                      <div
                        key={day}
                        className={`py-0.5 font-medium ${index === 0 ? "text-red-600 dark:text-red-400" : ""}`}
                      >
                        {day}
                      </div>
                    )
                  )}
                </div>

                {/* Days Grid (fills remaining height) */}
                <div
                  className="grid grid-cols-7 gap-1 flex-1 min-h-0"
                  style={{ gridAutoRows: "1fr" }}
                >
                  {getCalendarDays().map((day, i) => {
                    if (!day.isCurrentMonth) {
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-center text-xs rounded-lg text-gray-400 dark:text-gray-600"
                        />
                      );
                    }

                    const isSelected =
                      selectedDate &&
                      day.fullDate &&
                      selectedDate.getDate() === day.fullDate.getDate() &&
                      selectedDate.getMonth() === day.fullDate.getMonth() &&
                      selectedDate.getFullYear() === day.fullDate.getFullYear();

                    // Check if should be marked in red (holiday or Sunday)
                    const isRedDay = day.isHoliday || day.isSunday;

                    let className =
                      "flex flex-col items-center justify-center text-xs rounded-lg cursor-pointer transition-all ";

                    if (day.isToday && isRedDay) {
                      // Today + Holiday/Sunday: Indigo background with red text
                      className +=
                        "bg-indigo-600 text-red-200 font-semibold border-2 border-red-400 ";
                    } else if (day.isToday) {
                      className += "bg-indigo-600 text-white font-semibold ";
                    } else if (isSelected && isRedDay) {
                      // Selected + Holiday/Sunday: Red background with white text
                      className +=
                        "bg-red-600 text-white font-semibold ring-2 ring-red-400 ";
                    } else if (isSelected) {
                      className += "bg-purple-600 text-white font-semibold ";
                    } else if (isRedDay) {
                      // Holiday/Sunday: Red background and text
                      className +=
                        "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold hover:bg-red-200 dark:hover:bg-red-900/40 ";
                    } else {
                      className +=
                        "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 ";
                    }

                    return (
                      <div
                        key={i}
                        onClick={() => {
                          if (day.fullDate) {
                            setSelectedDate(day.fullDate);
                            setCurrentDate(
                              new Date(
                                day.fullDate.getFullYear(),
                                day.fullDate.getMonth(),
                                1
                              )
                            );
                          }
                        }}
                        className={className}
                        title={
                          day.isHoliday
                            ? day.holidayName
                            : day.fullDate?.toLocaleDateString("ko-KR")
                        }
                      >
                        <span className="font-medium leading-none">
                          {day.date}
                        </span>

                        {day.isHoliday && (
                          <span className="text-[7px] mt-0.5 truncate w-full px-0.5 text-center leading-none">
                            {day.holidayName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order List Section - Right side */}
            </div>
          </div>
        </div>

        {/* Right Column (30%) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Weather Widget - Enhanced Design */}
          {/* Korean Clock Widgate
          <KoreanClockWidget /> */}
          <div
            className={`relative overflow-hidden rounded-2xl shadow-lg bg-gradient-to-br ${getWeatherGradient(
              weatherData?.condition || "맑음"
            )} p-4 text-white transition-all duration-500 hover:shadow-xl hover:scale-[1.01] group`}
          >
            {/* Animated Background Pattern */}
            <div className="absolute inset-0 opacity-10 overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white rounded-full -mr-24 -mt-24 animate-pulse"></div>
              <div className="absolute bottom-0 left-0 w-36 h-36 bg-white rounded-full -ml-18 -mb-18 animate-pulse delay-300"></div>
              <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white rounded-full opacity-50 animate-pulse delay-700"></div>
              <div className="absolute top-1/3 left-1/3 w-16 h-16 bg-white rounded-full opacity-30 animate-pulse delay-1000"></div>
            </div>

            {/* Floating Particles Effect */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {particlePositions.map((particle, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 bg-white rounded-full opacity-20 animate-float"
                  style={{
                    left: `${particle.left}%`,
                    top: `${particle.top}%`,
                    animationDelay: `${i * 0.5}s`,
                    animationDuration: `${particle.duration}s`,
                  }}
                ></div>
              ))}
            </div>

            <div className="relative z-10">
              {/* Header with Enhanced Design */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-2">
                    <div className="p-1 bg-white/20 backdrop-blur-sm rounded-lg">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-[10px] font-semibold opacity-90">
                        {weatherData?.city || weatherData?.nameKo || "서울"}
                      </h3>
                      <p className="text-[8px] opacity-70">
                        {new Date().toLocaleDateString("ko-KR", {
                          month: "long",
                          day: "numeric",
                          weekday: "long",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <div className="text-4xl font-extrabold tracking-tight drop-shadow-lg">
                      {loadingWeather ? (
                        <span className="animate-pulse">--</span>
                      ) : (
                        `${Math.round(weatherData?.temperature || 0)}`
                      )}
                    </div>
                    <div className="text-xl font-bold opacity-80">°</div>
                  </div>

                  {/* Additional Weather Details */}
                  {weatherData && !loadingWeather && (
                    <div className="flex items-center gap-3 text-[10px] opacity-80">
                      {weatherData.humidity && (
                        <div className="flex items-center gap-0.5">
                          <svg
                            className="w-2 h-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                            />
                          </svg>
                          <span>습도 {weatherData.humidity}%</span>
                        </div>
                      )}
                      {weatherData.windSpeed && (
                        <div className="flex items-center gap-0.5">
                          <svg
                            className="w-2 h-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          <span>풍속 {weatherData.windSpeed}m/s</span>
                        </div>
                      )}
                      {weatherData.precipitation !== undefined && (
                        <div className="flex items-center gap-0.5">
                          <svg
                            className="w-2 h-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                            />
                          </svg>
                          <span>강수 {weatherData.precipitation}mm</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-5xl drop-shadow-xl transform transition-transform duration-500 group-hover:scale-105 group-hover:rotate-6">
                  {getWeatherIcon(weatherData?.condition || "맑음")}
                </div>
              </div>

              {/* 7-Day Forecast - Compact Grid */}
              {forecastData && forecastData.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-white/30">
                  <div className="flex items-center gap-1 mb-2">
                    <svg
                      className="w-2 h-2 opacity-80"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-[10px] opacity-90 font-semibold">
                      7일 예보
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 min-w-full">
                    {(forecastData.length >= 7
                      ? forecastData.slice(0, 7)
                      : forecastData.concat(
                          Array.from(
                            { length: 7 - forecastData.length },
                            (_, i) => ({
                              dayOfWeek: [
                                "일",
                                "월",
                                "화",
                                "수",
                                "목",
                                "금",
                                "토",
                              ][
                                (new Date().getDay() +
                                  forecastData.length +
                                  i) %
                                  7
                              ],
                              condition: "맑음",
                              maxTemp: 20,
                              minTemp: 10,
                              precipitationProbability: 0,
                            })
                          )
                        )
                    ).map((day: any, index: number) => (
                      <div
                        key={index}
                        className="flex flex-col items-center bg-white/15 backdrop-blur-sm rounded-lg p-1 border border-white/20 hover:bg-white/25 transition-all duration-300 group min-w-0"
                      >
                        {/* Day Name */}
                        <div className="text-[8px] font-semibold opacity-90 mb-1">
                          {day.dayOfWeek}
                        </div>

                        {/* Weather Icon */}
                        <div className="text-xl mb-1 transform group-hover:scale-110 transition-transform duration-300">
                          {getWeatherIcon(day.condition || "맑음")}
                        </div>

                        {/* Temperatures */}
                        <div className="flex flex-col items-center gap-0.5 w-full">
                          {/* High Temperature */}
                          <div className="text-[8px] font-bold text-black-300">
                            {Math.round(day.maxTemp || 0)}°
                          </div>
                          {/* Low Temperature */}
                          <div className="text-[8px] opacity-75 text-black-200">
                            {Math.round(day.minTemp || 0)}°
                          </div>
                        </div>

                        {/* Precipitation Probability (if available) */}
                        {day.precipitationProbability !== undefined &&
                          day.precipitationProbability > 0 && (
                            <div className="text-[6px] opacity-90 mt-0.5"></div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-white/30">
                  <div className="text-[10px] opacity-70 text-center py-4">
                    {loadingWeather ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>예보를 불러오는 중...</span>
                      </div>
                    ) : (
                      <span>예보 데이터가 없습니다</span>
                    )}
                  </div>
                </div>
              )}

              {/* Loading State */}
              {loadingWeather && !weatherData && (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  <span className="text-[10px] opacity-80">
                    날씨 정보를 불러오는 중...
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Add CSS for floating animation */}
          <style jsx global>{`
            @keyframes float {
              0%,
              100% {
                transform: translateY(0px) translateX(0px);
                opacity: 0.2;
              }
              25% {
                transform: translateY(-20px) translateX(10px);
                opacity: 0.4;
              }
              50% {
                transform: translateY(-40px) translateX(-10px);
                opacity: 0.3;
              }
              75% {
                transform: translateY(-20px) translateX(5px);
                opacity: 0.35;
              }
            }
            .animate-float {
              animation: float 4s ease-in-out infinite;
            }
          `}</style>

          {/* Product Recommendations (Ads) */}
          <div className="bg-white h-[230px] flex flex-row dark:bg-gray-900 rounded-2xl shadow-lg p-3 border border-gray-400 dark:border-gray-700">
            {/* Header */}
            <div className="mb-3 flex flex-col justify-start items-center">
              <h2 className="font-bold text-2xl text-gray-900 dark:text-white">
                주목할 만한 상품 추천
              </h2>
              <span className="text-[10px]  font-bold mt-20 text-gray-500 dark:text-gray-400 block">
                AD
              </span>
            </div>

            {/* Carousel Container */}
            <div className="relative">
              {/* Product Cards */}
              <div className="overflow-hidden w-[490px] mx-auto rounded-xl">
                <div
                  className="flex transition-transform duration-300 ease-in-out"
                  style={{
                    transform: `translateX(-${(currentProductSlide / 3) * 100}%)`,
                  }}
                >
                  {productRecommendations.map((product, index) => (
                    <div
                      key={product.id}
                      className="min-w-[33.333%] flex-shrink-0 cursor-pointer group"
                      style={{
                        paddingRight:
                          index < productRecommendations.length - 1
                            ? "0.5rem"
                            : "0",
                      }}
                      onClick={() => {
                        // Handle product click
                        console.log("Product clicked:", product.id);
                      }}
                    >
                      <div className="relative   ">
                        {/* Product Image */}
                        <div className="relative w-full h-36 overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <img
                            src={product.image}
                            alt={product.name}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              // Hide failed image and show fallback
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                              // Check if fallback already exists
                              const parent = target.parentElement;
                              if (
                                parent &&
                                !parent.querySelector(".image-fallback")
                              ) {
                                const fallback = document.createElement("div");
                                fallback.className =
                                  "image-fallback w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800";
                                fallback.innerHTML = `
                                  <svg class="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                  </svg>
                                `;
                                parent.appendChild(fallback);
                              }
                            }}
                          />
                          {/* AD Badge */}
                          {product.isAd && (
                            <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                              AD
                            </div>
                          )}
                        </div>

                        {/* Product Title */}
                        <div className="p-2">
                          <h3 className="text-[10px] font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-tight">
                            {product.name}
                          </h3>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation Arrows */}
              {productRecommendations.length > 3 && (
                <>
                  <button
                    onClick={prevProductSlide}
                    className="absolute left-0 top-1/3 -translate-y-1/4 transform -translate-x-1/2 bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 rounded-full p-1.5 shadow-md transition-all z-10"
                    aria-label="Previous product"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 19.5L8.25 12l7.5-7.5"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={nextProductSlide}
                    className="absolute right-0 top-1/3 -translate-y-1/4 transform translate-x-1/4 bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 rounded-full p-1.5 shadow-md transition-all z-10"
                    aria-label="Next product"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Messages/Notifications */}
          <div className="bg-gray-200 dark:bg-gray-800 rounded-2xl shadow-lg p-3 h-[340px] flex flex-col border border-gray-400 dark:border-gray-700 relative">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2 shrink-0">
              쪽지함
            </h2>

            {/* Development Notice */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                  개발 중입니다
                </p>
              </div>
            </div>

            <div className="space-y-1 flex-1 overflow-hidden opacity-20">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="flex items-center justify-between p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-[10px]">
                        {message.clinic.charAt(0)}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate text-xs">
                        {message.clinic}
                      </div>
                      <div className="text-[10px] text-gray-600 dark:text-gray-400 truncate">
                        {message.sender}
                      </div>
                    </div>
                  </div>

                  {message.unread > 0 && (
                    <div className="flex-shrink-0">
                      <div className="bg-red-500 text-white text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center">
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
