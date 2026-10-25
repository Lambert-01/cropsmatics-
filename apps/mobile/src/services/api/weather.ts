import type { WeatherContextResponse } from "../../types";
import { qs, request } from "./client";

export const weatherApi = {
  context: (districtCode: string) =>
    request<WeatherContextResponse>(
      `/context/weather${qs({ district_code: districtCode })}`,
    ),
};
