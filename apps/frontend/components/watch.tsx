import React, { useState, useEffect } from "react";

export default function KoreanClockWidget() {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
    setTime(new Date());

    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Hydration mismatch'ni oldini olish
  if (!mounted || !time) {
    return (
      <div className="relative w-80 h-80 flex items-center justify-center">
        <div className="text-white">로딩 중...</div>
      </div>
    );
  }

  // Convert to Korean time (KST = UTC+9)
  const koreanTime = new Date(
    time.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );

  const hours = koreanTime.getHours();
  const minutes = koreanTime.getMinutes();
  const seconds = koreanTime.getSeconds();

  // Calculate angles for clock hands and progress
  const secondAngle = seconds * 6; // 6 degrees per second
  const minuteAngle = minutes * 6 + seconds * 0.1; // 6 degrees per minute
  const hourAngle = (hours % 12) * 30 + minutes * 0.5; // 30 degrees per hour

  // Calculate progress percentage for the animated ring
  const progress =
    (((hours % 12) * 3600 + minutes * 60 + seconds) / 43200) * 100;

  // Format digital time
  const formatTime = (num: number) => String(num).padStart(2, "0");

  // Get date info
  const day = koreanTime.getDate();
  const weekday = koreanTime
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();

  // Calculate circumference for SVG circle
  const radius = 145;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative">
      {/* Main clock container */}
      <div className="relative w-80 h-80 flex items-center justify-center">
        {/* Animated progress ring */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 300 300"
        >
          <circle
            cx="150"
            cy="150"
            r={radius}
            fill="none"
            stroke="rgba(185, 21, 21, 0.48)"
            strokeWidth="3"
          />
          <circle
            cx="150"
            cy="150"
            r={radius}
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>

        {/* Clock face */}
        <div className="relative w-64 h-64 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center">
          {/* Digital time display - Center */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-6xl font-light text-white tracking-tight">
                {formatTime(hours)}
              </span>
              <span className="text-6xl font-light text-white">:</span>
              <span className="text-6xl font-light text-white tracking-tight">
                {formatTime(minutes)}
              </span>
            </div>

            <div className="flex items-center gap-3 text-white/70">
              <span className="text-xl font-light">{day}</span>
              <span className="text-lg font-light">|</span>
              <span className="text-lg font-light tracking-wider">
                {weekday}
              </span>
            </div>
          </div>

          {/* Second hand - thin line at top */}
          <div
            className="absolute w-0.5 bg-white rounded-full origin-bottom transition-transform duration-1000 ease-linear"
            style={{
              height: "115px",
              left: "50%",
              bottom: "50%",
              transform: `translateX(-50%) rotate(${secondAngle}deg)`,
            }}
          />

          {/* Center dot */}
          <div className="absolute w-2.5 h-2.5 bg-white rounded-full z-30"></div>
        </div>
      </div>
    </div>
  );
}
