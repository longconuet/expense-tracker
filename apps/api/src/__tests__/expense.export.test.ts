import type { IncomingHttpHeaders } from "node:http";
// Default import — nhất quán với lib/expenseExport.ts (exceljs là CJS,
// Node ESM không hỗ trợ named import "exceljs")
import exceljs from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { buildExpenseCsv, type ExportRow } from "../lib/expenseExport.js";

// Hạ EXPORT_MAX_ROWS về 3 để test được cap 409 — phải set TRƯỚC khi import app
// (import ESM bị hoist → dynamic import sau khi gán env)
process.env.EXPORT_MAX_ROWS = "3";

const { createApp } = await import("../app.js");
const { prisma } = await import("../prisma.js");

const PASSWORD = "matkhau123";

let app: Express;
let owner: { userId: string; name: string; token: string };
let member: { userId: string; name: string; token: string };
let stranger: { userId: string; token: string };
let familyId: string;
let eatCategoryId: string; // "Ăn uống"

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function register(name: string, username: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, username, password: PASSWORD });
  expect(res.status).toBe(201);
  return { userId: res.body.data.user.id, name, token: res.body.data.accessToken };
}

async function createExpense(
  actor: { token: string },
  data: { familyId: string; categoryId: string; amount: number; date: string; note?: string },
) {
  return request(app).post("/api/expenses").set(auth(actor.token)).send(data);
}

/**
 * GET file export và gom byte thô thành Buffer — parser mặc định của
 * superagent coi MIME không thuộc {json, text, image, audio...} (VD xlsx)
 * là text → res.body không phải Buffer. Custom parser để đọc byte thật.
 */
async function getExportBuffer(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
  const res = await request(app)
    .get(url)
    .set(headers)
    .buffer(true)
    .parse((stream, callback) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => callback(null, Buffer.concat(chunks)));
      stream.on("error", (err: Error) => callback(err, undefined));
    });
  return { status: res.status, headers: res.headers, body: res.body as Buffer };
}

type ExcelWorksheet = NonNullable<
  ReturnType<InstanceType<typeof exceljs.Workbook>["getWorksheet"]>
>;

/** Đọc lại buffer xlsx trả về thành sheet để verify nội dung. */
async function readXlsxSheet(data: Uint8Array): Promise<ExcelWorksheet> {
  const workbook = new exceljs.Workbook();
  // exceljs khai báo interface `Buffer` riêng trong d.ts — cast về ArrayBuffer
  // (jszip bên trong exceljs hỗ trợ thẳng ArrayBuffer)
  await workbook.xlsx.load(data as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Lịch sử chi tiêu");
  if (!sheet) {
    throw new Error("Không tìm thấy sheet 'Lịch sử chi tiêu' trong file xlsx");
  }
  return sheet;
}

beforeAll(async () => {
  app = createApp();

  owner = await register("Chủ Export", "expexp_owner");
  const fam = await request(app)
    .post("/api/families")
    .set(auth(owner.token))
    .send({ name: "Gia Đình Export" });
  familyId = fam.body.data.family.id;

  member = await register("Member Export", "expexp_member");
  await request(app)
    .post("/api/families/join")
    .set(auth(member.token))
    .send({ code: fam.body.data.family.inviteCode });

  stranger = await register("Người Lạ Export", "expexp_stranger");

  const cats = await request(app)
    .get(`/api/families/${familyId}/categories`)
    .set(auth(owner.token));
  eatCategoryId = cats.body.data.categories.find((c: { name: string }) => c.name === "Ăn uống").id;

  // Data cố định: 3 món tháng 9 (09-20 owner "Cà phê", 09-21 member note chứa , và ",
  // 09-22 owner) + 1 món tháng 8 (08-15 owner) — tất cả cùng danh mục "Ăn uống"
  const fixtures = [
    { amount: 10000, date: "2026-08-15", actor: owner },
    { amount: 20000, date: "2026-09-20", actor: owner, note: "Cà phê" },
    { amount: 30000, date: "2026-09-21", actor: member, note: 'đi chợ, mua "cá tươi"' },
    { amount: 40000, date: "2026-09-22", actor: owner },
  ];
  for (const fixture of fixtures) {
    const res = await createExpense(fixture.actor, {
      familyId,
      categoryId: eatCategoryId,
      amount: fixture.amount,
      date: fixture.date,
      note: fixture.note,
    });
    expect(res.status).toBe(201);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/families/:id/expenses/export.xlsx", () => {
  it("member export theo month: xlsx hợp lệ, đúng header + filter + sort date DESC", async () => {
    // Arrange + Act
    const res = await getExportBuffer(
      `/api/families/${familyId}/expenses/export.xlsx?month=2026-09`,
      auth(member.token),
    );

    // Assert — headers
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers["content-disposition"]).toMatch(
      /^attachment; filename="chi-tieu-2026-09-\d{14}\.xlsx"$/,
    );
    const buffer = res.body;
    expect(buffer.subarray(0, 2).toString("hex")).toBe("504b"); // magic ZIP — xlsx hợp lệ
    expect(Number(res.headers["content-length"])).toBe(buffer.length);

    // Assert — nội dung sheet (column: 1=Ngày 2=Số tiền 3=Danh mục 4=Ghi chú
    // 5=Người tạo 6=Ngày tạo — file xlsx không lưu column key nên đọc theo số cột)
    const sheet = await readXlsxSheet(buffer);
    expect(sheet.actualRowCount).toBe(4); // header + 3 món tháng 9
    expect(sheet.getRow(1).getCell(1).value).toBe("Ngày");
    expect(sheet.getRow(1).getCell(2).value).toBe("Số tiền (VNĐ)");
    expect(sheet.getRow(1).getCell(5).value).toBe("Người tạo");
    // Dòng đầu = 09-22 (date DESC), amount là number, note rỗng
    expect(sheet.getRow(2).getCell(1).value).toBe("2026-09-22");
    expect(sheet.getRow(2).getCell(2).value).toBe(40000);
    expect(sheet.getRow(2).getCell(4).value ?? "").toBe("");
    expect(sheet.getRow(2).getCell(5).value).toBe("Chủ Export");
    // Dòng 09-21 của member có note chứa dấu , và "
    expect(sheet.getRow(3).getCell(1).value).toBe("2026-09-21");
    expect(sheet.getRow(3).getCell(4).value).toBe('đi chợ, mua "cá tươi"');
    expect(sheet.getRow(3).getCell(5).value).toBe("Member Export");
    expect(sheet.getRow(4).getCell(1).value).toBe("2026-09-20");
  });

  it("filter userId: chỉ trả khoản do member đó nhập; filter date: đúng 1 ngày", async () => {
    const byMember = await getExportBuffer(
      `/api/families/${familyId}/expenses/export.xlsx?month=2026-09&userId=${member.userId}`,
      auth(owner.token),
    );
    expect(byMember.status).toBe(200);
    let sheet = await readXlsxSheet(byMember.body);
    expect(sheet.actualRowCount).toBe(2); // header + 1 món của member
    expect(sheet.getRow(2).getCell(4).value).toBe('đi chợ, mua "cá tươi"');

    const byDate = await getExportBuffer(
      `/api/families/${familyId}/expenses/export.xlsx?date=2026-09-21`,
      auth(owner.token),
    );
    expect(byDate.status).toBe(200);
    expect(byDate.headers["content-disposition"]).toMatch(
      /^attachment; filename="chi-tieu-2026-09-21-\d{14}\.xlsx"$/,
    );
    sheet = await readXlsxSheet(byDate.body);
    expect(sheet.actualRowCount).toBe(2);
    expect(sheet.getRow(2).getCell(1).value).toBe("2026-09-21");
  });

  it("filter không có khoản → 200 xlsx chỉ có header", async () => {
    const res = await getExportBuffer(
      `/api/families/${familyId}/expenses/export.xlsx?date=2026-01-01`,
      auth(owner.token),
    );
    expect(res.status).toBe(200);
    const sheet = await readXlsxSheet(res.body);
    expect(sheet.actualRowCount).toBe(1);
  });
});

describe("GET /api/families/:id/expenses/export.csv", () => {
  it('CSV hợp lệ: BOM, header, quote field chứa , và ", amount không phân nghìn', async () => {
    // Arrange + Act
    const res = await request(app)
      .get(`/api/families/${familyId}/expenses/export.csv?month=2026-09`)
      .set(auth(owner.token));

    // Assert — headers
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toMatch(
      /^attachment; filename="chi-tieu-2026-09-\d{14}\.csv"$/,
    );

    // Assert — nội dung
    const text = res.text as string;
    expect(text.codePointAt(0)).toBe(0xfeff); // BOM UTF-8
    const lines = text.slice(1).split("\r\n");
    expect(lines).toHaveLength(4); // header + 3 dòng
    expect(lines[0]).toBe("Ngày,Số tiền (VNĐ),Danh mục,Ghi chú,Người tạo,Ngày tạo (UTC)");
    // Dòng 09-22 (DESC đầu tiên): không note, amount thuần, Ngày tạo UTC
    expect(lines[1]).toMatch(
      /^2026-09-22,40000,Ăn uống,,Chủ Export,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
    // Dòng 09-21: note chứa , và " → bọc "...", dấu " bên trong nhân đôi
    expect(lines[2]).toMatch(
      /^2026-09-21,30000,Ăn uống,"đi chợ, mua ""cá tươi""",Member Export,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
    expect(lines[3]).toMatch(
      /^2026-09-20,20000,Ăn uống,Cà phê,Chủ Export,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
    // Amount không được phân nghìn
    expect(text).not.toContain("40.000");
  });

  it("filter date: chỉ 1 dòng tương ứng", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/expenses/export.csv?date=2026-09-21`)
      .set(auth(owner.token));
    expect(res.status).toBe(200);
    const lines = (res.text as string).slice(1).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^2026-09-21,30000,/);
  });
});

describe("buildExpenseCsv — chống CSV formula injection", () => {
  it("field bắt đầu bằng = / - được thêm tiền tố ' → Excel/Sheets không chạy làm công thức", () => {
    // Arrange
    const rows: ExportRow[] = [
      {
        date: "2026-09-01",
        amount: 1000,
        note: '=HYPERLINK("https://evil.example")',
        category: "Ăn uống",
        createdByName: "-An",
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ];

    // Act
    const csv = buildExpenseCsv(rows);

    // Assert — note + người tạo có tiền tố ' (phần còn lại escape đúng RFC 4180)
    const line = csv.slice(1).split("\r\n")[1];
    expect(line).toBe(
      '2026-09-01,1000,Ăn uống,"\'=HYPERLINK(""https://evil.example"")",\'-An,2026-09-01 10:00',
    );
  });
});

describe("Export — phân quyền + validation (chung 2 route)", () => {
  it("không có token → 401 UNAUTHORIZED (cả xlsx lẫn csv)", async () => {
    for (const format of ["xlsx", "csv"] as const) {
      const res = await request(app).get(`/api/families/${familyId}/expenses/export.${format}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("người ngoài family → 403 NOT_FAMILY_MEMBER", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/expenses/export.xlsx?month=2026-09`)
      .set(auth(stranger.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_FAMILY_MEMBER");
  });

  it("month sai định dạng → 400 (xlsx); date không tồn tại → 400 (csv)", async () => {
    const badMonth = await request(app)
      .get(`/api/families/${familyId}/expenses/export.xlsx?month=2026-13`)
      .set(auth(owner.token));
    expect(badMonth.status).toBe(400);
    expect(badMonth.body.error.code).toBe("VALIDATION_ERROR");

    const badDate = await request(app)
      .get(`/api/families/${familyId}/expenses/export.csv?date=2026-02-30`)
      .set(auth(owner.token));
    expect(badDate.status).toBe(400);
    expect(badDate.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("categoryId không thuộc family → 404 CATEGORY_NOT_FOUND", async () => {
    const res = await request(app)
      .get(`/api/families/${familyId}/expenses/export.csv?categoryId=khong-thuoc-family`)
      .set(auth(owner.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });

  it("vượt EXPORT_MAX_ROWS (4 dòng > cap 3) → 409 EXPORT_LIMIT_EXCEEDED (envelope JSON)", async () => {
    const xlsx = await request(app)
      .get(`/api/families/${familyId}/expenses/export.xlsx`)
      .set(auth(owner.token));
    expect(xlsx.status).toBe(409);
    expect(xlsx.body.error.code).toBe("EXPORT_LIMIT_EXCEEDED");
    expect(xlsx.body.error.message).toContain("3");

    const csv = await request(app)
      .get(`/api/families/${familyId}/expenses/export.csv`)
      .set(auth(owner.token));
    expect(csv.status).toBe(409);
    expect(csv.body.error.code).toBe("EXPORT_LIMIT_EXCEEDED");
  });
});
