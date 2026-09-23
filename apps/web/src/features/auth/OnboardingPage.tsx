import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "../../core/api";
import { useAuthStore } from "../../core/authStore";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Input } from "../../shared/ui/Input";
import { AuthLayout } from "./AuthLayout";

const INVITE_CODE_PATTERN = /^[A-HJ-MN-Z2-9]{6}$/;
const FALLBACK_ERROR = "Có lỗi xảy ra, vui lòng thử lại.";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : FALLBACK_ERROR;
}

/**
 * Màn onboarding cho user chưa thuộc family nào:
 * tạo gia đình mới HOẶC nhập mã mời để tham gia.
 * Sau khi tạo/join thành công, store có family → tự chuyển về trang chủ.
 */
export default function OnboardingPage() {
  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"create" | "join" | null>(null);

  const families = useAuthStore((s) => s.families);
  const createFamily = useAuthStore((s) => s.createFamily);
  const joinFamily = useAuthStore((s) => s.joinFamily);

  // Đã vào được family (từ luồng khác) thì không cần onboarding
  if (families.length > 0) {
    return <Navigate to="/" replace />;
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setNameError(null);
    if (familyName.trim().length < 2) {
      setNameError("Tên gia đình phải có ít nhất 2 ký tự.");
      return;
    }
    setSubmitting("create");
    try {
      await createFamily(familyName.trim());
      // Store đã cập nhật — component tự chuyển về trang chủ
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setCodeError(null);
    if (!INVITE_CODE_PATTERN.test(code)) {
      setCodeError("Mã mời phải gồm 6 ký tự chữ/số (không có số 0, 1 và chữ I, O).");
      return;
    }
    setSubmitting("join");
    try {
      await joinFamily(code);
      // Store đã cập nhật — component tự chuyển về trang chủ
    } catch (err) {
      setCodeError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <AuthLayout title="Bắt đầu" subtitle="Tạo một gia đình mới, hoặc tham gia bằng mã mời.">
      <Card>
        <h2 className="font-semibold text-ink">Tạo gia đình mới</h2>
        <p className="mt-1 text-sm text-ink-muted">Bạn sẽ là chủ gia đình và mời thành viên bằng mã.</p>

        <form onSubmit={handleCreate} className="mt-4">
          <Input
            label="Tên gia đình"
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Nhà Mình"
            maxLength={50}
            error={nameError}
          />
          <div className="mt-4">
            <Button type="submit" loading={submitting === "create"} className="w-full">
              Tạo gia đình
            </Button>
          </div>
        </form>
      </Card>

      <div className="my-5 flex items-center gap-3 text-sm text-ink-muted">
        <span className="h-px flex-1 bg-border" />
        hoặc
        <span className="h-px flex-1 bg-border" />
      </div>

      <Card>
        <h2 className="font-semibold text-ink">Tham gia gia đình có sẵn</h2>
        <p className="mt-1 text-sm text-ink-muted">Nhập mã mời 6 ký tự mà chủ gia đình chia sẻ.</p>

        <form onSubmit={handleJoin} className="mt-4">
          <Input
            label="Mã mời"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="ABC123"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            error={codeError}
            className="text-center text-2xl font-bold uppercase tracking-[0.4em]"
          />
          <div className="mt-4">
            <Button type="submit" loading={submitting === "join"} className="w-full">
              Tham gia
            </Button>
          </div>
        </form>
      </Card>
    </AuthLayout>
  );
}
