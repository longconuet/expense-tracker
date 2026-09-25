import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../app.js";
import { prisma } from "../prisma.js";

const PASSWORD = "matkhau123";

let app: Express;

interface Actor {
  userId: string;
  username: string;
  token: string;
}

async function registerActor(name: string, username: string): Promise<Actor> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, username, password: PASSWORD });
  expect(res.status).toBe(201);
  return { userId: res.body.data.user.id, username, token: res.body.data.accessToken };
}

async function createFamily(actor: Actor, name: string) {
  const res = await request(app)
    .post("/api/families")
    .set("Authorization", `Bearer ${actor.token}`)
    .send({ name });
  expect(res.status).toBe(201);
  return res.body.data.family;
}

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/families — tạo family", () => {
  it("tạo family: user thành OWNER, có mã 6 ký tự, seed 7 preset categories", async () => {
    const actor = await registerActor("Chủ Gia", "fam_owner");

    const family = await createFamily(actor, "Nhà Mình");

    expect(family.name).toBe("Nhà Mình");
    expect(family.inviteCode).toMatch(/^[A-HJ-MN-Z2-9]{6}$/);
    expect(family.myRole).toBe("OWNER");
    expect(family.memberCount).toBe(1);
    expect(family.members).toHaveLength(1);
    expect(family.members[0]).toMatchObject({ userId: actor.userId, name: "Chủ Gia", role: "OWNER" });

    const categoryCount = await prisma.category.count({ where: { familyId: family.id } });
    expect(categoryCount).toBe(7);
  });

  it("từ chối tên quá ngắn với 400", async () => {
    const actor = await registerActor("Tên Ngắn", "fam_short");

    const res = await request(app)
      .post("/api/families")
      .set("Authorization", `Bearer ${actor.token}`)
      .send({ name: "A" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/families/join — vào bằng mã mời", () => {
  it("member mới vào bằng mã (không phân biệt hoa thường) → MEMBER", async () => {
    const owner = await registerActor("Chủ B", "fam_b_owner");
    const family = await createFamily(owner, "Gia Đình B");

    const member = await registerActor("Thành Viên B", "fam_b_member");
    const res = await request(app)
      .post("/api/families/join")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ code: family.inviteCode.toLowerCase() });

    expect(res.status).toBe(201);
    expect(res.body.data.family.myRole).toBe("MEMBER");
    expect(res.body.data.family.memberCount).toBe(2);
    expect(res.body.data.family.ownerName).toBe("Chủ B");
  });

  it("mã không tồn tại → 404 FAMILY_NOT_FOUND", async () => {
    const actor = await registerActor("Người Lạ", "fam_stranger");

    const res = await request(app)
      .post("/api/families/join")
      .set("Authorization", `Bearer ${actor.token}`)
      .send({ code: "ZZZZZZ" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("FAMILY_NOT_FOUND");
  });

  it("vào family đã là thành viên → 409 ALREADY_MEMBER", async () => {
    const owner = await registerActor("Chủ C", "fam_c_owner");
    const family = await createFamily(owner, "Gia Đình C");

    const res = await request(app)
      .post("/api/families/join")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ code: family.inviteCode });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_MEMBER");
  });
});

describe("GET /api/families/:id — chi tiết family", () => {
  it("thành viên xem được family + danh sách thành viên", async () => {
    const owner = await registerActor("Chủ D", "fam_d_owner");
    const family = await createFamily(owner, "Gia Đình D");

    const member = await registerActor("Thành Viên D", "fam_d_member");
    await request(app)
      .post("/api/families/join")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ code: family.inviteCode });

    const res = await request(app)
      .get(`/api/families/${family.id}`)
      .set("Authorization", `Bearer ${member.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.family.name).toBe("Gia Đình D");
    expect(res.body.data.family.members).toHaveLength(2);
  });

  it("người ngoài → 403 NOT_FAMILY_MEMBER", async () => {
    const owner = await registerActor("Chủ E", "fam_e_owner");
    const family = await createFamily(owner, "Gia Đình E");
    const stranger = await registerActor("Người Ngoài", "fam_e_stranger");

    const res = await request(app)
      .get(`/api/families/${family.id}`)
      .set("Authorization", `Bearer ${stranger.token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_FAMILY_MEMBER");
  });
});

describe("POST /api/families/:id/regenerate-code", () => {
  it("owner đổi được mã, member không được (403)", async () => {
    const owner = await registerActor("Chủ F", "fam_f_owner");
    const family = await createFamily(owner, "Gia Đình F");
    const member = await registerActor("Thành Viên F", "fam_f_member");
    await request(app)
      .post("/api/families/join")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ code: family.inviteCode });

    const memberRes = await request(app)
      .post(`/api/families/${family.id}/regenerate-code`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(memberRes.status).toBe(403);
    expect(memberRes.body.error.code).toBe("OWNER_ONLY");

    const ownerRes = await request(app)
      .post(`/api/families/${family.id}/regenerate-code`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.inviteCode).toMatch(/^[A-HJ-MN-Z2-9]{6}$/);
    expect(ownerRes.body.data.inviteCode).not.toBe(family.inviteCode);
  });
});

describe("DELETE /api/families/:id/members/:userId — xoá thành viên", () => {
  it("owner xoá member: member mất quyền truy cập", async () => {
    const owner = await registerActor("Chủ G", "fam_g_owner");
    const family = await createFamily(owner, "Gia Đình G");
    const member = await registerActor("Thành Viên G", "fam_g_member");
    await request(app)
      .post("/api/families/join")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ code: family.inviteCode });

    const res = await request(app)
      .delete(`/api/families/${family.id}/members/${member.userId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);

    const after = await request(app)
      .get(`/api/families/${family.id}`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(after.status).toBe(403);
  });

  it("member không xoá được member khác (403), owner không tự rời (400)", async () => {
    const owner = await registerActor("Chủ H", "fam_h_owner");
    const family = await createFamily(owner, "Gia Đình H");
    const m1 = await registerActor("Member 1", "fam_h_m1");
    const m2 = await registerActor("Member 2", "fam_h_m2");
    for (const m of [m1, m2]) {
      await request(app)
        .post("/api/families/join")
        .set("Authorization", `Bearer ${m.token}`)
        .send({ code: family.inviteCode });
    }

    const memberKick = await request(app)
      .delete(`/api/families/${family.id}/members/${m2.userId}`)
      .set("Authorization", `Bearer ${m1.token}`);
    expect(memberKick.status).toBe(403);
    expect(memberKick.body.error.code).toBe("OWNER_ONLY");

    const ownerLeave = await request(app)
      .delete(`/api/families/${family.id}/members/${owner.userId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ownerLeave.status).toBe(400);
    expect(ownerLeave.body.error.code).toBe("OWNER_CANNOT_LEAVE");

    // member tự rời được
    const selfLeave = await request(app)
      .delete(`/api/families/${family.id}/members/${m1.userId}`)
      .set("Authorization", `Bearer ${m1.token}`);
    expect(selfLeave.status).toBe(200);
  });
});

describe("DELETE /api/families/:id — xoá family", () => {
  it("có thành viên khác → 409; không còn ai → 200 và /me sạch", async () => {
    const owner = await registerActor("Chủ I", "fam_i_owner");
    const family = await createFamily(owner, "Gia Đình I");
    const member = await registerActor("Thành Viên I", "fam_i_member");
    await request(app)
      .post("/api/families/join")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ code: family.inviteCode });

    const notEmpty = await request(app)
      .delete(`/api/families/${family.id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(notEmpty.status).toBe(409);
    expect(notEmpty.body.error.code).toBe("FAMILY_NOT_EMPTY");

    // member tự rời
    await request(app)
      .delete(`/api/families/${family.id}/members/${member.userId}`)
      .set("Authorization", `Bearer ${member.token}`);

    const ok = await request(app)
      .delete(`/api/families/${family.id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ok.status).toBe(200);

    const me = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(me.body.data.families).toEqual([]);
  });

  it("member không xoá được family (403)", async () => {
    const owner = await registerActor("Chủ J", "fam_j_owner");
    const family = await createFamily(owner, "Gia Đình J");
    const member = await registerActor("Thành Viên J", "fam_j_member");
    await request(app)
      .post("/api/families/join")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ code: family.inviteCode });

    const res = await request(app)
      .delete(`/api/families/${family.id}`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OWNER_ONLY");
  });
});
