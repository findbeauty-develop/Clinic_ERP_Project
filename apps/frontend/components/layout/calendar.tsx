import React, { useState } from "react";

export default function KoreanCalendarWidget() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Korean holidays (example - add more as needed)
  const holidays = {
    "2025-1-1": "신정",
    "2025-1-28": "설날",
    "2025-1-29": "설날",
    "2025-1-30": "설날",
    "2025-3-1": "삼일절",
    "2025-5-5": "어린이날",
    "2025-6-6": "현충일",
    "2025-8-15": "광복절",
    "2025-10-3": "개천절",
    "2025-10-9": "한글날",
    "2025-12-25": "크리스마스",
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

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

  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        date: prevMonthLastDay - i,
        isCurrentMonth: false,
        fullDate: null,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const fullDate = new Date(year, month, i);
      fullDate.setHours(0, 0, 0, 0);
      const dateKey = `${year}-${month + 1}-${i}`;
      const holidayName = (holidays as Record<string, string>)[dateKey];

      days.push({
        date: i,
        isCurrentMonth: true,
        isToday: fullDate.getTime() === today.getTime(),
        isHoliday: !!holidayName,
        holidayName: holidayName,
        fullDate: fullDate,
      });
    }

    // Next month days
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: i,
        isCurrentMonth: false,
        fullDate: null,
      });
    }

    return days;
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              일정
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              프로젝트 일정
            </span>
          </div>
          <button
            onClick={goToToday}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-full px-4 py-2 hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            <span className="w-2 h-2 bg-white rounded-full"></span>
            오늘
          </button>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={goToPreviousMonth}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-gray-600 dark:text-gray-300"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              {currentDate.getFullYear()} - {currentDate.getMonth() + 1}월
            </span>
            <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4 text-gray-600 dark:text-gray-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>
          </div>

          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-gray-600 dark:text-gray-300"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        </div>

        {/* Calendar Grid */}
        <div>
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-2 mb-3">
            {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
              <div
                key={day}
                className={`text-center text-sm font-semibold py-2 ${
                  index === 0
                    ? "text-red-500"
                    : index === 6
                      ? "text-blue-500"
                      : "text-gray-600 dark:text-gray-400"
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-2">
            {getCalendarDays().map((day, i) => {
              if (!day.isCurrentMonth) {
                return (
                  <div
                    key={i}
                    className="aspect-square flex items-center justify-center text-sm text-gray-300 dark:text-gray-600"
                  >
                    {day.date}
                  </div>
                );
              }

              const isSelected =
                selectedDate &&
                day.fullDate &&
                selectedDate.getDate() === day.fullDate.getDate() &&
                selectedDate.getMonth() === day.fullDate.getMonth() &&
                selectedDate.getFullYear() === day.fullDate.getFullYear();

              const dayOfWeek = day.fullDate ? day.fullDate.getDay() : null;

              let className =
                "aspect-square flex items-center justify-center text-base rounded-xl cursor-pointer transition-all font-medium ";

              if (day.isToday) {
                className +=
                  "bg-indigo-600 text-white shadow-lg shadow-indigo-300 dark:shadow-indigo-900 ";
              } else if (isSelected) {
                className +=
                  "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white ring-2 ring-indigo-500 ";
              } else if (day.isHoliday || dayOfWeek === 0) {
                className +=
                  "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 ";
              } else if (dayOfWeek === 6) {
                className +=
                  "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 ";
              } else {
                className +=
                  "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 ";
              }

              return (
                <div
                  key={i}
                  onClick={() => {
                    if (day.fullDate) {
                      setSelectedDate(day.fullDate);
                    }
                  }}
                  className={className}
                  title={day.isHoliday ? day.holidayName : ""}
                >
                  {day.date}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
