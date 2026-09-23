import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { AuthLayout, FormError } from "./AuthLayout";
import { completeAfterAuth } from "./afterAuth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const status = useAuthStore((s) => s.status);
  const families = useAuthStore((s) => s.families);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  // code: mã mời được mang theo khi user vào /join mà chưa đăng nhập
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");

  // Đã đăng nhập thì không cần màn login nữa
  if (status === "authenticated") {
    return <Navigate to={families.length > 0 ? "/" : "/onboarding"} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(await completeAfterAuth(code), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Đăng nhập" subtitle="Chào mừng trở lại! Nhập email và mật khẩu của bạn.">
      <form onSubmit={handleSubmit}>
        <FormError message={error} />

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@gmail.com"
          autoComplete="email"
          required
        />
        <div className="mt-4">
          <Input
            label="Mật khẩu"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="mt-6">
          <Button type="submit" loading={submitting} className="w-full">
            Đăng nhập
          </Button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Chưa có tài khoản?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Đăng ký ngay
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-ink-muted">
        Có mã mời gia đình?{" "}
        <Link to="/join" className="font-medium text-primary hover:underline">
          Tham gia
        </Link>
      </p>
    </AuthLayout>
  );
}
