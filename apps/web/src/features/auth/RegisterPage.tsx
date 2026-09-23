import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { AuthLayout, FormError } from "./AuthLayout";
import { completeAfterAuth } from "./afterAuth";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const status = useAuthStore((s) => s.status);
  const families = useAuthStore((s) => s.families);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  // code: mã mời được mang theo khi user vào /join mà chưa đăng nhập
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");

  // Đã đăng nhập thì không cần màn đăng ký nữa
  if (status === "authenticated") {
    return <Navigate to={families.length > 0 ? "/" : "/onboarding"} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate(await completeAfterAuth(code), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Tạo tài khoản" subtitle="Chỉ mất 1 phút — cùng quản lý chi tiêu cho cả nhà.">
      <form onSubmit={handleSubmit}>
        <FormError message={error} />

        <Input
          label="Họ và tên"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nguyễn Văn A"
          autoComplete="name"
          minLength={2}
          maxLength={50}
          required
        />
        <div className="mt-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@gmail.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="mt-4">
          <Input
            label="Mật khẩu"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={8}
            required
            hint="Tối thiểu 8 ký tự."
          />
        </div>

        <div className="mt-6">
          <Button type="submit" loading={submitting} className="w-full">
            Đăng ký
          </Button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Đã có tài khoản?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthLayout>
  );
}
