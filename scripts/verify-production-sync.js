#!/usr/bin/env node

const target = String(process.env.LAUNCHFLOW_VERIFY_TARGET || "https://glasscopipeline.vercel.app").replace(/\/$/, "");
const adminEmail = String(process.env.LAUNCHFLOW_VERIFY_ADMIN_EMAIL || "chaim@glasscosupplies.com").trim().toLowerCase();
const adminPassword = String(process.env.LAUNCHFLOW_VERIFY_ADMIN_PASSWORD || "");
const requestTimeoutMs = Math.max(30000, Number(process.env.LAUNCHFLOW_VERIFY_TIMEOUT_MS || 90000) || 90000);

if (!adminPassword) {
  console.error("Set LAUNCHFLOW_VERIFY_ADMIN_PASSWORD before running this production verifier.");
  process.exit(1);
}

const stamp = Date.now().toString(36);
const testUserEmail = `codex.sync.${stamp}@example.com`;
const testUserPassword = `CodexSync-${stamp}!`;
const testUserName = `Codex Sync ${stamp}`;
const testProductId = `codex_sync_product_${stamp}`;
const adminProductName = `Codex Sync Admin ${stamp}`;
const userProductName = `Codex Sync User ${stamp}`;

let adminToken = "";
let userToken = "";
let testUserId = "";

function timeoutSignal(ms = requestTimeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

async function request(path, { token = "", method = "GET", body } = {}) {
  const timeout = timeoutSignal();
  const response = await fetch(`${target}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: timeout.signal,
  }).finally(timeout.clear);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with HTTP ${response.status}: ${payload.error || text.slice(0, 240)}`);
  }
  return payload;
}

async function login(email, password) {
  const payload = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!payload.token) throw new Error(`Login did not return a token for ${email}.`);
  return payload;
}

async function getWorkspace(token) {
  return request("/api/workspace-state", { token });
}

async function patchWorkspace(token, baseUpdatedAt, state, reason) {
  return request("/api/workspace-state", {
    token,
    method: "PATCH",
    body: { baseUpdatedAt, reason, state },
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function ensureWorkspaceShape(state) {
  state.userProducts = Array.isArray(state.userProducts) ? state.userProducts : [];
  state.productSettings = state.productSettings && typeof state.productSettings === "object" ? state.productSettings : {};
  state.productSettings.edits = state.productSettings.edits && typeof state.productSettings.edits === "object" ? state.productSettings.edits : {};
  state.productSettings.deletedProductIds = Array.isArray(state.productSettings.deletedProductIds) ? state.productSettings.deletedProductIds : [];
  state.productSettings.deletedProductSnapshots = Array.isArray(state.productSettings.deletedProductSnapshots) ? state.productSettings.deletedProductSnapshots : [];
  state.productSettings.purgedProductHistoryIds = Array.isArray(state.productSettings.purgedProductHistoryIds) ? state.productSettings.purgedProductHistoryIds : [];
  state.workspaceDetails = state.workspaceDetails && typeof state.workspaceDetails === "object" ? state.workspaceDetails : {};
  state.workspaceDetails.products = state.workspaceDetails.products && typeof state.workspaceDetails.products === "object" ? state.workspaceDetails.products : {};
  state.workspaceDetails.stageFieldTemplates = state.workspaceDetails.stageFieldTemplates && typeof state.workspaceDetails.stageFieldTemplates === "object" ? state.workspaceDetails.stageFieldTemplates : {};
  state.workspaceDetails.fieldHistory = Array.isArray(state.workspaceDetails.fieldHistory) ? state.workspaceDetails.fieldHistory : [];
  state.workspaceDetails.productHistory = Array.isArray(state.workspaceDetails.productHistory) ? state.workspaceDetails.productHistory : [];
  return state;
}

function getFirstVisibleStageId(state) {
  const stageSettings = state.stageSettings && typeof state.stageSettings === "object" ? state.stageSettings : {};
  const order = Array.isArray(stageSettings.order) ? stageSettings.order : ["product-research"];
  const hiddenStageIds = new Set(Array.isArray(stageSettings.hiddenStageIds) ? stageSettings.hiddenStageIds : []);
  return order.find((stageId) => !hiddenStageIds.has(stageId)) || "product-research";
}

function removeTestProduct(state) {
  ensureWorkspaceShape(state);
  state.userProducts = state.userProducts.filter((product) => product?.id !== testProductId);
  delete state.workspaceDetails.products[testProductId];
  delete state.productSettings.edits[testProductId];
  state.productSettings.deletedProductIds = state.productSettings.deletedProductIds.filter((productId) => productId !== testProductId);
  state.productSettings.deletedProductSnapshots = state.productSettings.deletedProductSnapshots.filter((entry) => entry?.productId !== testProductId);
  state.workspaceDetails.productHistory = state.workspaceDetails.productHistory.filter((entry) => entry?.productId !== testProductId);
  return state;
}

async function patchWithLatest(token, reason, transform) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await getWorkspace(token);
    const state = transform(ensureWorkspaceShape(clone(latest.state)));
    try {
      return await patchWorkspace(token, latest.updatedAt, state, reason);
    } catch (error) {
      lastError = error;
      if (!/HTTP 409/.test(error.message)) throw error;
    }
  }
  throw lastError;
}

function findProduct(state) {
  return (Array.isArray(state?.userProducts) ? state.userProducts : []).find((product) => product?.id === testProductId) ?? null;
}

function assertSameCanonicalWorkspace(adminState, userState) {
  const adminProducts = JSON.stringify(adminState.userProducts ?? []);
  const userProducts = JSON.stringify(userState.userProducts ?? []);
  if (adminProducts !== userProducts) throw new Error("Admin and USER product lists differ after refresh.");

  const adminStageSettings = JSON.stringify(adminState.stageSettings ?? {});
  const userStageSettings = JSON.stringify(userState.stageSettings ?? {});
  if (adminStageSettings !== userStageSettings) throw new Error("Admin and USER stage settings differ after refresh.");
}

async function cleanup() {
  if (adminToken) {
    try {
      await patchWithLatest(adminToken, "codex-sync-verification-cleanup", (state) => removeTestProduct(state));
      console.log("Cleaned up temporary sync product.");
    } catch (error) {
      console.warn(`Temporary product cleanup failed: ${error.message}`);
    }
  }
  if (adminToken && testUserId) {
    try {
      await request(`/api/users?id=${encodeURIComponent(testUserId)}`, { token: adminToken, method: "DELETE" });
      console.log("Cleaned up temporary sync user.");
    } catch (error) {
      console.warn(`Temporary user cleanup failed: ${error.message}`);
    }
  }
}

async function main() {
  console.log(`Verifying shared workspace sync against ${target}`);
  const adminLogin = await login(adminEmail, adminPassword);
  adminToken = adminLogin.token;
  console.log(`Admin login ok: ${adminLogin.user?.email || adminEmail}`);

  const createdUsersPayload = await request("/api/users", {
    token: adminToken,
    method: "POST",
    body: {
      name: testUserName,
      email: testUserEmail,
      role: "USER",
      password: testUserPassword,
      jobTitle: "Codex sync verification",
    },
  });
  const createdUser = (createdUsersPayload.users ?? []).find((user) => user.email === testUserEmail);
  if (!createdUser?.id) throw new Error("Temporary USER account was not returned by /api/users.");
  testUserId = createdUser.id;
  console.log(`Temporary USER created: ${testUserEmail}`);

  const userLogin = await login(testUserEmail, testUserPassword);
  userToken = userLogin.token;
  console.log("Temporary USER login ok.");

  const addPayload = await patchWithLatest(adminToken, "codex-sync-verification-admin-add", (state) => {
    removeTestProduct(state);
    const stageId = getFirstVisibleStageId(state);
    state.userProducts.push({
      id: testProductId,
      name: adminProductName,
      sku: "",
      asin: "",
      stageId,
      readinessPercent: 0,
    });
    state.workspaceDetails.products[testProductId] = {
      imageDataUrl: "",
      imageStoragePath: "",
      imageUrl: "",
      stages: {},
      chatReadBy: {},
      chatMessages: [],
    };
    return state;
  });
  if (!findProduct(addPayload.state)) throw new Error("Admin save response did not include the temporary product.");
  console.log("Admin product add saved.");

  const userAfterAdminAdd = await getWorkspace(userToken);
  const userVisibleProduct = findProduct(userAfterAdminAdd.state);
  if (!userVisibleProduct || userVisibleProduct.name !== adminProductName) {
    throw new Error("USER did not see the product added by admin.");
  }
  console.log("USER sees admin-added product.");

  const userEditPayload = await patchWithLatest(userToken, "codex-sync-verification-user-edit", (state) => {
    const product = findProduct(state);
    if (!product) throw new Error("Temporary product missing from USER workspace before edit.");
    product.name = userProductName;
    return state;
  });
  if (findProduct(userEditPayload.state)?.name !== userProductName) {
    throw new Error("USER save response did not include edited product name.");
  }
  console.log("USER product edit saved.");

  const adminAfterUserEdit = await getWorkspace(adminToken);
  const adminVisibleProduct = findProduct(adminAfterUserEdit.state);
  if (!adminVisibleProduct || adminVisibleProduct.name !== userProductName) {
    throw new Error("Admin did not see the product edited by USER.");
  }
  assertSameCanonicalWorkspace(adminAfterUserEdit.state, userEditPayload.state);
  console.log("Admin sees USER-edited product and canonical state matches.");
}

main()
  .then(cleanup)
  .then(() => {
    console.log("Production shared workspace sync verification passed.");
  })
  .catch(async (error) => {
    console.error(error.message);
    await cleanup();
    process.exit(1);
  });
