import { axiosClient } from "@/lib/axios";
import type { User, UserGender, ApiSuccessEnvelope } from "@/types/api";

export interface SigninDto {
  email: string;
  password: string;
}

export interface SignupDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  gender: UserGender;
  dob?: string;
}

export interface AuthSessionResponse {
  token?: string;
  accessToken?: string;
  user: User;
}

export const authService = {
  async signin(dto: SigninDto): Promise<AuthSessionResponse> {
    const res = await axiosClient.post<ApiSuccessEnvelope<AuthSessionResponse> | AuthSessionResponse>(
      "/auth/signin",
      dto,
    );
    const data = "data" in res.data && res.data.success ? res.data.data : (res.data as AuthSessionResponse);
    if (typeof window !== "undefined" && (data.token || data.accessToken)) {
      localStorage.setItem("vion_token", data.token || data.accessToken || "");
    }
    return data;
  },

  async signup(dto: SignupDto): Promise<AuthSessionResponse> {
    const res = await axiosClient.post<ApiSuccessEnvelope<AuthSessionResponse> | AuthSessionResponse>(
      "/auth/signup",
      dto,
    );
    const data = "data" in res.data && res.data.success ? res.data.data : (res.data as AuthSessionResponse);
    return data;
  },

  async google(idToken: string): Promise<AuthSessionResponse> {
    const res = await axiosClient.post<ApiSuccessEnvelope<AuthSessionResponse> | AuthSessionResponse>(
      "/auth/google",
      { idToken },
    );
    const data = "data" in res.data && res.data.success ? res.data.data : (res.data as AuthSessionResponse);
    if (typeof window !== "undefined" && (data.token || data.accessToken)) {
      localStorage.setItem("vion_token", data.token || data.accessToken || "");
    }
    return data;
  },

  async me(): Promise<User> {
    const res = await axiosClient.get<ApiSuccessEnvelope<User> | User>("/users/me");
    return "data" in res.data && res.data.success ? res.data.data : (res.data as User);
  },

  async signout(): Promise<void> {
    try {
      await axiosClient.post("/auth/signout");
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("vion_token");
      }
    }
  },
};
