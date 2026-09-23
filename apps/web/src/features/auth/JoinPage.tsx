import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { AuthLayout, FormError } from "./AuthLayout";

// Alphabet mã mời: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (không có 0, 1, I, O)
const INVITE_CODE_PATTERN = /^[A-HJ-MN-Z2-9]{6}$/;

export default function JoinPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const status = useAuthStore((s) => s.status);
  const joinFamily = useAuthStore((s) => s.joinFamily);
  const navigate = useNavigate();

  function handleChange(value: string) {
    // Chỉ giữ chữ số thuộc alphabet, tự uppercase, tối đa 6 ký tự
    setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!INVITE_CODE_PATTERN.test(code)) {
      setError("Mã mời phải gồm 6 ký tự chữ/số (không có số 0, 1 và chữ I, O).");
      return;
    }

    // Chưa đăng nhập → mang mã qua luồng đăng ký (tự join sau khi đăng nhập/đăng ký)
    if (status !== "authenticated") {
      navigate(`/register?code=${encodeURIComponent(code)}`);
      return;
    }

    setSubmitting(true);
    try {
      await joinFamily(code);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Tham gia gia đình" subtitle="Nhập mã mời 6 ký tự mà chủ gia đình chia sẻ với bạn.">
      <form onSubmit={handleSubmit}>
        <FormError message={error} />

        <Input
          label="Mã mời"
          type="text"
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="ABC123"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className="text-center text-2xl font-bold uppercase tracking-[0.4em]"
        />

        <div className="mt-6">
          <Button type="submit" loading={submitting} className="w-full">
            Tham gia gia đình
          </Button>
        </div>
      </form>

      {status !== "authenticated" && (
        <div className="mt-6 rounded-xl bg-card px-4 py-3 text-sm text-ink-muted shadow-sm">
          Bạn cần đăng nhập hoặc tạo tài khoản trước khi tham gia — mã sẽ được giữ lại.
          <div className="mt-2 flex gap-4">
            <Link
              to={`/login?code=${encodeURIComponent(code)}`}
              className="font-medium text-primary hover:underline"
            >
              Đăng nhập
            </Link>
            <Link
              to={`/register?code=${encodeURIComponent(code)}`}
              className="font-medium text-primary hover:underline"
            >
              Tạo tài khoản
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
