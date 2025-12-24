import { Injectable } from "@nestjs/common";

export interface City {
  name: string;
  nameKo: string;
  region: string;
  nx: number; // KMA grid X coordinate
  ny: number; // KMA grid Y coordinate
}

@Injectable()
export class CityService {
  private readonly cities: City[] = [
    // Seoul
    { name: "seoul", nameKo: "서울", region: "seoul", nx: 60, ny: 127 },
    { name: "gangnam", nameKo: "강남", region: "seoul", nx: 61, ny: 126 },
    { name: "jongno", nameKo: "종로", region: "seoul", nx: 60, ny: 127 },

    // Gyeonggi
    { name: "incheon", nameKo: "인천", region: "gyeonggi", nx: 55, ny: 124 },
    { name: "suwon", nameKo: "수원", region: "gyeonggi", nx: 60, ny: 121 },
    { name: "seongnam", nameKo: "성남", region: "gyeonggi", nx: 63, ny: 124 },

    // Gangwon
    { name: "gangneung", nameKo: "강릉", region: "gangwon", nx: 92, ny: 131 },
    { name: "chuncheon", nameKo: "춘천", region: "gangwon", nx: 73, ny: 134 },

    // Chungcheong
    { name: "daejeon", nameKo: "대전", region: "chungcheong", nx: 67, ny: 100 },
    {
      name: "cheongju",
      nameKo: "청주",
      region: "chungcheong",
      nx: 69,
      ny: 106,
    },
    { name: "cheonan", nameKo: "천안", region: "chungcheong", nx: 63, ny: 112 },

    // Jeolla
    { name: "gwangju", nameKo: "광주", region: "jeolla", nx: 58, ny: 74 },
    { name: "jeonju", nameKo: "전주", region: "jeolla", nx: 63, ny: 89 },
    { name: "mokpo", nameKo: "목포", region: "jeolla", nx: 50, ny: 67 },

    // Gyeongsang
    { name: "busan", nameKo: "부산", region: "gyeongsang", nx: 98, ny: 76 },
    { name: "daegu", nameKo: "대구", region: "gyeongsang", nx: 89, ny: 90 },
    { name: "ulsan", nameKo: "울산", region: "gyeongsang", nx: 102, ny: 84 },
    { name: "pohang", nameKo: "포항", region: "gyeongsang", nx: 102, ny: 94 },
    { name: "changwon", nameKo: "창원", region: "gyeongsang", nx: 90, ny: 77 },

    // Jeju
    { name: "jeju", nameKo: "제주", region: "jeju", nx: 52, ny: 38 },
    { name: "seogwipo", nameKo: "서귀포", region: "jeju", nx: 52, ny: 33 },
  ];

  getCityByName(name: string): City | undefined {
    return this.cities.find(
      (city) =>
        city.name.toLowerCase() === name.toLowerCase() || city.nameKo === name
    );
  }

  getCitiesByRegion(region: string): City[] {
    return this.cities.filter(
      (city) => city.region.toLowerCase() === region.toLowerCase()
    );
  }

  getAllCities(): City[] {
    return this.cities;
  }

  getRegions(): string[] {
    return [...new Set(this.cities.map((city) => city.region))];
  }
}
