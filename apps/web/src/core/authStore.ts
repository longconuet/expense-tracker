import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Family, FamilyMemberDto, User } from "@expense-tracker/shared";
import { getAccessToken, refreshAccessToken, setAccessToken, apiFetch } from "./api";

// ---------------------------------------------------------------------------
// Shape response API (phần FE dùng)
// ---------------------------------------------------------------------------

interface AuthSessionData {
  user: User;
  accessToken: string;
}

interface MeData {
  user: User;
  families: Family[];
}

/** Family trong response create/join kèm members — store chỉ giữ các field của Family. */
type FamilyDto = Family & { members: FamilyMemberDto[] };

function toFamily(dto: FamilyDto): Family {
  const { members: _members, ...family } = dto;
  return family;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type AuthStatus = "bootstrapping" | "guest" | "authenticated";

interface AuthState {
  user: User | null;
  families: Family[];
  activeFamilyId: string | null;
  status: AuthStatus;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  joinFamily: (code: string) => Promise<Family>;
  createFamily: (name: string) => Promise<Family>;
  refreshMe: () => Promise<void>;
  setActiveFamily: (id: string) => void;
  logout: () => Promise<void>;
  clearSession: () => void;
}

/** Giữ activeFamilyId nếu vẫn còn trong danh sách, nếu không chọn family đầu. */
function reconcileActiveFamily(current: string | null, families: Family[]): string | null {
  if (current && families.some((f) => f.id === current)) return current;
  return families[0]?.id ?? null;
}

// Chỉ chạy bootstrap 1 lần mỗi lần tải trang (StrictMode có thể mount effect 2 lần)
let bootstrapPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      families: [],
      activeFamilyId: null,
      status: "bootstrapping",

      /**
       * Khôi phục phiên khi tải trang:
       * - Chưa có access token in-memory → thử refresh qua cookie httpOnly
       * - Có token → gọi /me (401 hết hạn → api client tự refresh + retry)
       * - Không khôi phục được → guest
       */
      bootstrap: () => {
        if (!bootstrapPromise) {
          bootstrapPromise = (async () => {
            if (!getAccessToken()) {
              await refreshAccessToken();
            }
            if (!getAccessToken()) {
              set({ status: "guest", user: null, families: [] });
              return;
            }
            try {
              await get().refreshMe();
            } catch {
              setAccessToken(null);
              set({ status: "guest", user: null, families: [] });
            }
          })();
        }
        return bootstrapPromise;
      },

      login: async (email, password) => {
        const data = await apiFetch<AuthSessionData>("/api/auth/login", {
          method: "POST",
          body: { email, password },
          auth: false,
        });
        setAccessToken(data.accessToken);
        await get().refreshMe();
      },

      register: async (name, email, password) => {
        const data = await apiFetch<AuthSessionData>("/api/auth/register", {
          method: "POST",
          body: { name, email, password },
          auth: false,
        });
        setAccessToken(data.accessToken);
        await get().refreshMe();
      },

      refreshMe: async () => {
        const data = await apiFetch<MeData>("/api/me");
        set({
          user: data.user,
          families: data.families,
          activeFamilyId: reconcileActiveFamily(get().activeFamilyId, data.families),
          status: "authenticated",
        });
      },

      joinFamily: async (code) => {
        const data = await apiFetch<{ family: FamilyDto }>("/api/families/join", {
          method: "POST",
          body: { code: code.trim().toUpperCase() },
        });
        const family = toFamily(data.family);
        set((state) => ({
          families: [...state.families, family],
          activeFamilyId: family.id,
          status: "authenticated",
        }));
        return family;
      },

      createFamily: async (name) => {
        const data = await apiFetch<{ family: FamilyDto }>("/api/families", {
          method: "POST",
          body: { name },
        });
        const family = toFamily(data.family);
        set((state) => ({
          families: [...state.families, family],
          activeFamilyId: family.id,
          status: "authenticated",
        }));
        return family;
      },

      setActiveFamily: (id) => set({ activeFamilyId: id }),

      logout: async () => {
        try {
          // Xoá refresh cookie phía server — best effort
          await apiFetch("/api/auth/logout", { method: "POST", auth: false });
        } catch {
          // Lỗi mạng cũng xoá session local cho sạch
        }
        get().clearSession();
      },

      clearSession: () => {
        setAccessToken(null);
        set({ user: null, families: [], activeFamilyId: null, status: "guest" });
      },
    }),
    {
      name: "etracker-auth",
      // Chỉ persist activeFamilyId (1 id thuần — an toàn). user/families phải lấy từ API
      partialize: (state) => ({ activeFamilyId: state.activeFamilyId }),
    },
  ),
);
