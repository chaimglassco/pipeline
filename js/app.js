import { LAUNCHFLOW_STAGES, MAX_STAGE_INDEX } from "./constants/stages.js";
import {
  NEW_PRODUCT_BLANK_TABLE_STAGE_IDS,
  applyProductTableRowLabels,
  blankNewProductTargetTable,
  collectUniqueVineEntries,
  getProductScopedVineEntries,
  initializeNewProductVineCollections,
  repairLegacyTargetTableDefaults,
  setProductScopedVineEntries,
  shouldRestoreDefaultTableRowLabels,
} from "./product-defaults.mjs";
import {
  COGS_ENTRY_BASES,
  COGS_MARKETPLACE_CURRENCY,
  calculateCogsBatchTotal,
  calculateCogsCostPerUnit,
  createBlankCogsBatchDraft,
  getCogsCostCategory,
  getLatestCogsBatch,
  hydrateCogsBatchDraft,
  isCogsCostElementActive,
  normalizeCogsBatch,
  normalizeCogsBatches,
  reconcileCogsBatchDraftWithTemplate,
  resetCogsCostElement,
  validateCogsBatchDraft,
} from "./cogs-calculator.mjs";
import {
  addCogsTemplateCategory,
  addCogsTemplateRow,
  cloneCogsTemplateSettings,
  createDefaultCogsTemplateSettings,
  deleteCogsTemplateCategory,
  deleteCogsTemplateRow,
  findCogsTemplateRow,
  getCogsTemplateRows,
  normalizeCogsTemplateSettings,
  renameCogsTemplateCategory,
  reorderCogsTemplateCategories,
  reorderCogsTemplateRows,
  updateCogsTemplateRow,
  validateCogsTemplateSettings,
} from "./cogs-template.mjs";
import {
  CUSTOM_FIELD_TYPES,
  addChecklistTask,
  addCustomField,
  advanceProductStage,
  calculateOverallPipelineProgress,
  calculateStageProgress,
  getActiveProduct,
  getStageBlock,
  getState,
  getVisibleStages,
  subscribe,
  toggleChecklistTask,
  updateCustomFieldValue,
} from "./store.js";

const uiState = {
  selectedStageId: "product-research",
  selectedProductId: null,
  activeView: "pipeline",
  expandedWorkspaceStageIds: new Set(["product-research"]),
  editingWorkspaceStageFieldIds: new Set(),
  editingWorkspaceTableStructureIds: new Set(),
  collapsedChecklistIds: new Set(),
  expandedChecklistIds: new Set(),
  hiddenCompletedChecklistIds: new Set(),
  paymentModal: null,
  cogsCalculatorModal: null,
  fieldModal: null,
  checklistNoteModal: null,
  campaignLinkModalOpen: false,
  keywordSpreadsheetEditing: false,
  keywordSpreadsheetEditingProductId: "",
  keywordSpreadsheetDraft: "",
  keywordEditingCell: null,
  keywordEditingHeader: null,
  vineEntryModal: null,
  launchEntryModal: null,
  launchPortfolioModalOpen: false,
  dashboardGoalModalOpen: false,
  dashboardBackgroundModalOpen: false,
  dashboardBackgroundDraft: [],
  dashboardBackgroundPendingFiles: [],
  dashboardBackgroundUploading: false,
  dashboardBackgroundUploadError: "",
  dashboardBackgroundBatchNotice: "",
  dashboardHistoryModalOpen: false,
  fieldHistoryModal: null,
  stageHistoryModal: null,
  deletedFieldHistoryModal: null,
  productHistoryModal: null,
  deletedProductHistoryModalOpen: false,
  deletedProductHistoryStageId: "",
  activityHistoryStartDate: "",
  activityHistoryEndDate: "",
  activeChatProductId: null,
  chatAssetsOpen: false,
  chatSearchOpen: false,
  chatSearchQuery: "",
  chatEmojiOpen: false,
  chatAttachmentPreview: null,
  chatReplyPreview: null,
  editingChatMessageId: null,
  replyingToChatMessageId: null,
  imageGalleryPreview: null,
  imageGalleryUploadingSlots: new Set(),
  imageGalleryUploadError: "",
  editingSheetEmbedIds: new Set(),
  editingTableLinkCell: "",
  pendingChatAttachments: [],
  chatUploadingFiles: false,
  chatSending: false,
  deletingChatMessageIds: new Set(),
  addProductModalOpen: false,
  editingProductId: null,
  productDeleteConfirmation: null,
  addStageModalOpen: false,
  stageEditorOpen: false,
  draggedStageId: null,
  draggedProductId: null,
  draggedChecklistTask: null,
  draggedTableSection: null,
  tableResizeCandidate: null,
  tableResizeDrag: null,
  draggedWorkspaceField: null,
  draggedDashboardSlideIndex: null,
  draggedCogsTemplateItem: null,
  settingsInviteModalOpen: false,
  editingTeamUserId: null,
  settingsUserNotice: "",
  settingsProfileNotice: "",
  settingsUserSearchQuery: "",
  settingsCategory: "profile",
  workspaceBackups: [],
  workspaceBackupsLoaded: false,
  workspaceBackupsLoading: false,
  workspaceBackupsNotice: "",
  sharedWorkspaceSaveStatus: "",
  sharedWorkspaceSaveNotice: "",
  pendingProductAction: null,
  authLoading: false,
  authError: "",
  loginDraft: { email: "", password: "", remember: false },
  showLoginPassword: false,
  copiedSkuProductId: null,
  skuCopyTimeoutId: null,
  searchQuery: "",
};


const SUPABASE_STORAGE_BUCKETS = Object.freeze({
  files: "files",
  productImages: "product-images",
  chatAttachments: "chat-attachments",
  profileAvatars: "profile-avatars",
  paymentDocuments: "payment-documents",
  imageGalleries: "image-galleries",
  dashboardSlides: "dashboard-slides",
});
const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const PRODUCT_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LOCAL_UPLOAD_URL_PREFIX = "launchflow-local://";
const LOCAL_UPLOAD_DB_NAME = "launchflow-local-uploads";
const LOCAL_UPLOAD_STORE_NAME = "uploads";
const localUploadObjectUrlCache = new Map();
const localUploadHydrationPromises = new Map();
const CANONICAL_SIDEBAR_STAGE_ORDER = Object.freeze([
  "product-research",
  "product-development",
  "keyword-research",
  "supplier-sourcing",
  "under-final-order",
  "shipping",
  "listing-creation",
  "image-planning",
  "campaign-prep",
  "enrolled-to-vines",
  "launch",
  "amazon-inbound",
  "optimization",
  "stable",
  "scaling",
]);
const LEGACY_SIDEBAR_STAGE_ORDER = Object.freeze([
  "product-research",
  "product-development",
  "supplier-sourcing",
  "under-final-order",
  "shipping",
  "keyword-research",
  "listing-creation",
  "image-planning",
  "campaign-prep",
  "amazon-inbound",
  "enrolled-to-vines",
  "launch",
  "optimization",
  "stable",
  "scaling",
]);

function getSupabaseStorageConfig() {
  const runtimeConfig = typeof window !== "undefined" ? window.LAUNCHFLOW_SUPABASE ?? {} : {};
  const url = String(runtimeConfig.url ?? runtimeConfig.supabaseUrl ?? "").replace(/\/$/, "");
  const anonKey = String(runtimeConfig.anonKey ?? runtimeConfig.supabaseAnonKey ?? "");
  const uploadProxyUrl = String(runtimeConfig.uploadProxyUrl ?? "/api/storage-upload");
  const allowLocalFallback = runtimeConfig.allowLocalFallback === true;
  return { url, anonKey, uploadProxyUrl, allowLocalFallback };
}

function getStorageAssetUrl(asset) {
  const storageUrl = String(asset?.storageUrl ?? asset?.url ?? asset?.avatarUrl ?? asset?.imageUrl ?? asset?.dataUrl ?? asset?.imageDataUrl ?? "");
  const productImageUrl = String(asset?.imageUrl ?? "").trim();
  if (productImageUrl.includes("/storage/v1/object/public/product-images/")) return productImageUrl;
  const databaseStorageUrl = getDatabaseStorageAssetUrl(asset);
  if (databaseStorageUrl && (storageUrl.startsWith(LOCAL_UPLOAD_URL_PREFIX) || storageUrl.startsWith("blob:") || storageUrl.includes("/storage/v1/object/public/") || !storageUrl)) {
    return databaseStorageUrl;
  }
  if (storageUrl.startsWith(LOCAL_UPLOAD_URL_PREFIX)) return getLocalBrowserUploadObjectUrl(storageUrl);
  if (storageUrl.startsWith("blob:")) return "";
  return storageUrl;
}

function getStorageAssetFallbackUrl(asset, primaryUrl = "") {
  const candidates = [
    asset?.storageUrl,
    asset?.url,
    asset?.avatarUrl,
    asset?.imageUrl,
    asset?.dataUrl,
    asset?.imageDataUrl,
  ].map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((url) => url !== primaryUrl)
    .filter((url) => !url.startsWith("blob:") && !url.startsWith(LOCAL_UPLOAD_URL_PREFIX));
  return candidates[0] ?? "";
}

function getDatabaseStorageAssetUrl(asset) {
  const storagePath = String(asset?.storagePath ?? asset?.imageStoragePath ?? asset?.avatarStoragePath ?? "").trim();
  if (!storagePath) return "";
  const bucket = String(asset?.bucket ?? (asset?.imageStoragePath ? SUPABASE_STORAGE_BUCKETS.productImages : "") ?? "").trim();
  if (!bucket) return "";
  return `/api/storage-asset?id=${encodeURIComponent(`${bucket}/${storagePath}`)}`;
}

function createStorageSafeFileName(name) {
  return String(name || "file")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "file";
}

function createStorageObjectPath(scope, file) {
  const safeName = createStorageSafeFileName(file?.name);
  return `${scope}/${new Date().toISOString().slice(0, 10)}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
}

async function uploadFileToSupabaseStorage(file, { bucket, scope }) {
  if (!(file instanceof File)) throw new Error("A file is required for Supabase Storage upload.");
  const { url, anonKey, uploadProxyUrl, allowLocalFallback } = getSupabaseStorageConfig();
  const storagePath = createStorageObjectPath(scope, file);
  if (uploadProxyUrl) return uploadFileToSupabaseStorageProxy(file, { bucket, storagePath, uploadProxyUrl, allowLocalFallback });
  if (!url || !anonKey) return uploadFileToSupabaseStorageProxy(file, { bucket, storagePath, uploadProxyUrl, allowLocalFallback });

  const uploadUrl = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });
  if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status}).`);
  return {
    bucket,
    storagePath,
    storageUrl: `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`,
  };
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to prepare file for upload.")));
    reader.readAsDataURL(file);
  });
}

async function uploadFileToSupabaseStorageProxy(file, { bucket, storagePath, uploadProxyUrl, allowLocalFallback }) {
  if (!uploadProxyUrl) {
    if (allowLocalFallback) return createLocalBrowserUpload(file, { bucket, storagePath });
    throw new Error("Remote Supabase Storage is not configured. Set the Vercel Supabase environment variables before uploading.");
  }
  const response = await fetch(uploadProxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authSession?.token ? { Authorization: `Bearer ${authSession.token}` } : {}),
    },
    body: JSON.stringify({
      bucket,
      storagePath,
      contentType: file.type || "application/octet-stream",
      fileBase64: await readFileAsBase64(file),
    }),
  }).catch(() => null);
  if (!response) {
    if (allowLocalFallback) return createLocalBrowserUpload(file, { bucket, storagePath });
    throw new Error("Remote upload service is unavailable. Check the /api/storage-upload deployment.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (String(payload?.error ?? "").toLowerCase().includes("supabase storage is not configured")) {
      if (allowLocalFallback) return createLocalBrowserUpload(file, { bucket, storagePath });
      throw new Error(payload.error);
    }
    throw new Error(payload?.error || `Supabase Storage upload failed (${response.status}).`);
  }
  return {
    bucket: payload.bucket ?? bucket,
    storagePath: payload.storagePath ?? storagePath,
    storageUrl: payload.storageUrl ?? "",
  };
}

function validateProductImageFile(file) {
  if (!(file instanceof File) || !PRODUCT_IMAGE_CONTENT_TYPES.has(String(file.type || "").toLowerCase())) {
    throw new Error("Please use a JPG, PNG, or WebP image.");
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error("Please choose an image smaller than 10 MB.");
  }
  if (file.size <= 0) {
    throw new Error("The selected image is empty. Please choose another image.");
  }
}

async function requestProductImageUploadStep(uploadProxyUrl, payload) {
  const response = await fetch(uploadProxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authSession?.token ? { Authorization: `Bearer ${authSession.token}` } : {}),
    },
    body: JSON.stringify(payload),
  }).catch(() => null);
  const responsePayload = await response?.json().catch(() => ({}));
  if (!response?.ok) {
    throw new Error(responsePayload?.error || "The image could not be uploaded. Please try again.");
  }
  return responsePayload;
}

async function reportProductImageDirectUploadFailure(uploadProxyUrl, requestDetails, response) {
  const payload = await response?.json().catch(() => ({}));
  await fetch(uploadProxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authSession?.token ? { Authorization: `Bearer ${authSession.token}` } : {}),
    },
    body: JSON.stringify({
      action: "report-product-image-upload-failure",
      ...requestDetails,
      status: Number(response?.status) || 0,
      code: String(payload?.code || payload?.error || payload?.statusCode || ""),
      requestId: String(
        response?.headers?.get?.("sb-request-id")
          || response?.headers?.get?.("x-request-id")
          || "",
      ),
    }),
  }).catch(() => null);
}

async function uploadProductImageMetadata(file, productId) {
  validateProductImageFile(file);
  const { uploadProxyUrl } = getSupabaseStorageConfig();
  if (!uploadProxyUrl) throw new Error("The image upload service is not configured.");

  const bucket = SUPABASE_STORAGE_BUCKETS.productImages;
  const storagePath = createStorageObjectPath(`products/${productId}`, file);
  const requestDetails = {
    bucket,
    storagePath,
    contentType: file.type.toLowerCase(),
    fileSize: file.size,
  };
  const signedUpload = await requestProductImageUploadStep(uploadProxyUrl, {
    action: "create-product-image-upload",
    ...requestDetails,
  });

  const uploadBody = new FormData();
  uploadBody.append("cacheControl", "3600");
  uploadBody.append("", file);
  const uploadResponse = await fetch(signedUpload.signedUploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body: uploadBody,
  }).catch(() => null);
  if (!uploadResponse?.ok) {
    await reportProductImageDirectUploadFailure(uploadProxyUrl, requestDetails, uploadResponse);
    throw new Error("The image could not be uploaded. Please try again.");
  }

  const finalized = await requestProductImageUploadStep(uploadProxyUrl, {
    action: "finalize-product-image-upload",
    ...requestDetails,
  });
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    bucket: finalized.bucket ?? bucket,
    storagePath: finalized.storagePath ?? storagePath,
    storageUrl: finalized.storageUrl ?? "",
    uploadedAt: new Date().toISOString(),
  };
}

async function createLocalBrowserUpload(file, { bucket, storagePath }) {
  console.warn("Supabase Storage is not configured. Using a browser-local IndexedDB preview URL for this upload.");
  const storageUrl = createLocalBrowserStorageUrl(storagePath);
  localUploadObjectUrlCache.set(storageUrl, URL.createObjectURL(file));
  await saveLocalBrowserUpload(storagePath, file).catch((error) => console.warn("LaunchFlow could not persist the local upload preview.", error));
  return {
    bucket,
    storagePath,
    storageUrl,
    localPreview: true,
  };
}

function createLocalBrowserStorageUrl(storagePath) {
  return `${LOCAL_UPLOAD_URL_PREFIX}${encodeURIComponent(storagePath)}`;
}

function getLocalBrowserStoragePath(storageUrl) {
  if (!storageUrl.startsWith(LOCAL_UPLOAD_URL_PREFIX)) return "";
  return decodeURIComponent(storageUrl.slice(LOCAL_UPLOAD_URL_PREFIX.length));
}

function getLocalBrowserUploadObjectUrl(storageUrl) {
  const cachedUrl = localUploadObjectUrlCache.get(storageUrl);
  if (cachedUrl) return cachedUrl;

  const storagePath = getLocalBrowserStoragePath(storageUrl);
  if (!storagePath) return "";
  hydrateLocalBrowserUpload(storageUrl, storagePath);
  return "";
}

function hydrateLocalBrowserUpload(storageUrl, storagePath) {
  if (localUploadHydrationPromises.has(storageUrl)) return;
  const hydrationPromise = getLocalBrowserUpload(storagePath).then((record) => {
    if (!record?.blob) return;
    localUploadObjectUrlCache.set(storageUrl, URL.createObjectURL(record.blob));
    renderFromCurrentState();
  }).catch((error) => console.warn("LaunchFlow could not load the local upload preview.", error)).finally(() => {
    localUploadHydrationPromises.delete(storageUrl);
  });
  localUploadHydrationPromises.set(storageUrl, hydrationPromise);
}

function openLocalUploadDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(LOCAL_UPLOAD_DB_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(LOCAL_UPLOAD_STORE_NAME, { keyPath: "storagePath" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("Unable to open local upload storage.")));
  });
}

async function saveLocalBrowserUpload(storagePath, file) {
  const db = await openLocalUploadDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_UPLOAD_STORE_NAME, "readwrite");
    transaction.objectStore(LOCAL_UPLOAD_STORE_NAME).put({
      storagePath,
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
      updatedAt: new Date().toISOString(),
    });
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Unable to save local upload.")));
  });
  db.close();
}

async function getLocalBrowserUpload(storagePath) {
  const db = await openLocalUploadDatabase();
  const record = await new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_UPLOAD_STORE_NAME, "readonly");
    const request = transaction.objectStore(LOCAL_UPLOAD_STORE_NAME).get(storagePath);
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("Unable to load local upload.")));
  });
  db.close();
  return record;
}

function reportStorageUploadError(error) {
  console.error(error);
}

async function uploadFileMetadata(file, options) {
  const upload = await uploadFileToSupabaseStorage(file, options);
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    bucket: upload.bucket,
    storagePath: upload.storagePath,
    storageUrl: upload.storageUrl,
    uploadedAt: new Date().toISOString(),
  };
}

async function prepareSharedWorkspaceSnapshotForSync({ strictImageMigration = false } = {}) {
  await migrateProductImagesToSharedStorage({ strict: strictImageMigration });
  return getRemoteWorkspaceSnapshot();
}

async function migrateProductImagesToSharedStorage({ strict = false } = {}) {
  if (!authSession?.token || typeof File === "undefined") return false;
  const { uploadProxyUrl } = getSupabaseStorageConfig();
  if (!uploadProxyUrl) return false;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  let didMigrate = false;
  const failedProductNames = [];
  for (const [productId, productDetails] of Object.entries(nextDetails.products ?? {})) {
    const imageUrl = String(productDetails?.imageUrl ?? "").trim();
    const existingStoragePath = String(productDetails?.imageStoragePath ?? "").trim();
    const imageIsAlreadyShared = imageUrl.startsWith("/api/storage-asset")
      || (existingStoragePath && !isBrowserLocalImageUrl(imageUrl));
    if (!imageUrl || imageIsAlreadyShared) continue;

    const imageFile = await getProductImageFileForSharedMigration(productId, productDetails).catch((error) => {
      console.warn(`LaunchFlow could not prepare shared product image for ${productId}.`, error);
      return null;
    });
    if (!imageFile) {
      if (isBrowserLocalImageUrl(imageUrl)) failedProductNames.push(getProductById(productId)?.name || productId);
      continue;
    }

    const storagePath = existingStoragePath || createStorageObjectPath(`products/${productId}`, imageFile);
    const upload = await uploadFileToSupabaseStorageProxy(imageFile, {
      bucket: SUPABASE_STORAGE_BUCKETS.productImages,
      storagePath,
      uploadProxyUrl,
      allowLocalFallback: false,
    });

    productDetails.imageDataUrl = "";
    productDetails.imageStoragePath = upload.storagePath;
    productDetails.imageUrl = upload.storageUrl;
    didMigrate = true;
  }

  if (strict && failedProductNames.length > 0) {
    throw new Error(`These product images are still browser-local and could not be moved online: ${failedProductNames.join(", ")}. Re-upload them once, then publish again.`);
  }
  if (!didMigrate) return false;
  workspaceDetails = normalizeWorkspaceDetails(nextDetails);
  persistRemoteWorkspaceSnapshotLocally();
  return true;
}

async function getProductImageFileForSharedMigration(productId, productDetails) {
  const imageUrl = String(productDetails?.imageUrl ?? "").trim();
  const storagePath = getLocalBrowserStoragePath(imageUrl) || String(productDetails?.imageStoragePath ?? "").trim();
  if (imageUrl.startsWith(LOCAL_UPLOAD_URL_PREFIX) && storagePath) {
    const localRecord = await getLocalBrowserUpload(storagePath);
    if (!localRecord?.blob) return null;
    return createFileFromBlob(localRecord.blob, localRecord.name || `${productId}-image`, localRecord.type);
  }
  if (imageUrl.startsWith("data:image/") || imageUrl.startsWith("blob:") || /^https?:\/\//i.test(imageUrl) || imageUrl.startsWith("/")) {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return createFileFromBlob(blob, `${productId}-image`, blob.type);
  }
  return null;
}

function createFileFromBlob(blob, name, type = "") {
  if (blob instanceof File) return blob;
  const extension = getImageFileExtension(type || blob?.type);
  const cleanName = createStorageSafeFileName(name || "product-image");
  const fileName = /\.[a-z0-9]+$/i.test(cleanName) ? cleanName : `${cleanName}${extension}`;
  return new File([blob], fileName, { type: type || blob?.type || "image/png" });
}

function getImageFileExtension(type = "") {
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  return ".png";
}

function isBrowserLocalImageUrl(url) {
  return url.startsWith(LOCAL_UPLOAD_URL_PREFIX) || url.startsWith("blob:") || url.startsWith("data:image/");
}


function getBrowserStorage(type = "local") {
  if (typeof window === "undefined") return null;
  try {
    return type === "session" ? window.sessionStorage : window.localStorage;
  } catch (error) {
    console.warn(`LaunchFlow ${type} storage is unavailable.`, error);
    return null;
  }
}

function safeGetStorageItem(key, type = "local") {
  try {
    return getBrowserStorage(type)?.getItem(key) ?? null;
  } catch (error) {
    console.warn(`LaunchFlow could not read ${key} from ${type} storage.`, error);
    return null;
  }
}

function safeSetStorageItem(key, value, type = "local") {
  try {
    getBrowserStorage(type)?.setItem(key, value);
  } catch (error) {
    console.warn(`LaunchFlow could not persist ${key} to ${type} storage.`, error);
  }
}

function safeRemoveStorageItem(key, type = "local") {
  try {
    getBrowserStorage(type)?.removeItem(key);
  } catch (error) {
    console.warn(`LaunchFlow could not remove ${key} from ${type} storage.`, error);
  }
}

const WORKSPACE_DETAILS_STORAGE_KEY = "launchflow.workspaceDetails.v1";
const COGS_TEMPLATE_SETTINGS_STORAGE_KEY = "launchflow.cogsTemplateSettings.v1";
const STAGE_SETTINGS_STORAGE_KEY = "launchflow.stageSettings.v1";
const UI_PREFERENCES_STORAGE_KEY = "launchflow.uiPreferences.v1";
const WORKSPACE_BRANDING_STORAGE_KEY = "launchflow.workspaceBranding.v1";
const DASHBOARD_SETTINGS_STORAGE_KEY = "launchflow.dashboardSettings.v1";
const ACTIVITY_LOG_STORAGE_KEY = "launchflow.activityLog.v1";
const CAMPAIGN_PREP_SETTINGS_STORAGE_KEY = "launchflow.campaignPrepSettings.v1";
const KEYWORD_RESEARCH_SETTINGS_STORAGE_KEY = "launchflow.keywordResearchSettings.v1";
const VINE_SETTINGS_STORAGE_KEY = "launchflow.vineSettings.v1";
const LAUNCH_MONITORING_STORAGE_KEY = "launchflow.launchMonitoring.v1";
const USER_PRODUCTS_STORAGE_KEY = "launchflow.userProducts.v1";
const PRODUCT_SETTINGS_STORAGE_KEY = "launchflow.productSettings.v1";
const TEAM_USERS_STORAGE_KEY = "launchflow.teamUsers.v1";
const MANUAL_ACCESS_STORAGE_KEY = "launchflow.manualAccess.v1";
const AUTH_SESSION_STORAGE_KEY = "launchflow.authSession.v1";
const GLASSCO_LOGOUT_STORAGE_KEY = "glassco.logout.v1";
const GLASSCO_AUTH_HANDOFF_STORAGE_KEY = "glassco.authHandoff.v1";
const GLASSCO_AUTH_HANDOFF_TTL_MS = 30_000;
const GLASSCO_APP_ROUTES_STORAGE_KEY = "glassco.appRoutes.v1";
const GLASSCO_DEFAULT_APP_ROUTES = Object.freeze({ pipeline: "/", ppc: "/ppc/library", ppcDashboard: "/ppc/dashboard" });
const RECOVERY_WORKSPACE_BUNDLE_STORAGE_KEY = "launchflow.recoveryWorkspaceBundle.v1";
const RECOVERY_NEEDS_REMOTE_PUSH_STORAGE_KEY = "launchflow.recoveryNeedsRemotePush.v1";
const ADMIN_OWNER_CREDENTIALS = Object.freeze({
  email: "chaim@glasscosupplies.com",
  password: "Cg.123456",
  name: "Chaim Glass",
  role: "ADMIN",
});

function getGlasscoAppRoutes() {
  const fallback = { ...GLASSCO_DEFAULT_APP_ROUTES };
  const stored = safeGetStorageItem(GLASSCO_APP_ROUTES_STORAGE_KEY);
  if (!stored) return fallback;

  try {
    const parsed = JSON.parse(stored);
    return {
      pipeline: isValidPipelineAppRoute(parsed?.pipeline) ? parsed.pipeline : fallback.pipeline,
      ppc: isValidSopLibraryRoute(parsed?.ppc) ? parsed.ppc : fallback.ppc,
      ppcDashboard: isValidPpcDashboardRoute(parsed?.ppcDashboard) ? parsed.ppcDashboard : fallback.ppcDashboard,
    };
  } catch {
    return fallback;
  }
}

function parseSafeGlasscoRoute(route) {
  if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//") || route.includes("\\")) return null;
  try {
    const parsed = new URL(route, window.location.origin);
    return parsed.origin === window.location.origin ? parsed : null;
  } catch {
    return null;
  }
}

function isValidPipelineAppRoute(route) {
  const parsed = parseSafeGlasscoRoute(route);
  return Boolean(parsed && !parsed.pathname.startsWith("/ppc"));
}

function isValidSopLibraryRoute(route) {
  const parsed = parseSafeGlasscoRoute(route);
  return Boolean(parsed && (parsed.pathname === "/ppc/library" || parsed.pathname.startsWith("/ppc/library/")));
}

function isValidPpcDashboardRoute(route) {
  const parsed = parseSafeGlasscoRoute(route);
  return Boolean(parsed && parsed.pathname === "/ppc/dashboard");
}

function rememberGlasscoAppRoute(app, route) {
  const routes = getGlasscoAppRoutes();
  if (app === "pipeline" && isValidPipelineAppRoute(route)) routes.pipeline = route;
  if (app === "ppc" && isValidSopLibraryRoute(route)) routes.ppc = route;
  if (app === "ppcDashboard" && isValidPpcDashboardRoute(route)) routes.ppcDashboard = route;
  safeSetStorageItem(GLASSCO_APP_ROUTES_STORAGE_KEY, JSON.stringify(routes));
  return routes;
}

function createGlasscoAuthHandoff(targetApp) {
  if (typeof window === "undefined" || !["pipeline", "ppc"].includes(targetApp)) return;
  if (safeGetStorageItem(AUTH_SESSION_STORAGE_KEY)) {
    safeRemoveStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
    return;
  }
  if (!authSession?.token || !authSession?.email || isAuthTokenExpired(authSession.token)) return;

  const expiresAt = Date.now() + GLASSCO_AUTH_HANDOFF_TTL_MS;
  safeSetStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY, JSON.stringify({ version: 1, targetApp, expiresAt, session: authSession }));
  window.setTimeout(() => {
    try {
      const current = JSON.parse(safeGetStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY) || "null");
      if (Number(current?.expiresAt) === expiresAt) safeRemoveStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
    } catch {
      safeRemoveStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
    }
  }, GLASSCO_AUTH_HANDOFF_TTL_MS);
}

function consumeGlasscoAuthHandoff(targetApp) {
  const rawHandoff = safeGetStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
  if (!rawHandoff) return null;

  try {
    const handoff = JSON.parse(rawHandoff);
    if (!handoff || typeof handoff !== "object" || handoff.version !== 1 || !["pipeline", "ppc"].includes(handoff.targetApp) || !Number.isFinite(Number(handoff.expiresAt))) {
      safeRemoveStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
      return null;
    }
    if (Number(handoff.expiresAt) <= Date.now()) {
      safeRemoveStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
      return null;
    }
    if (handoff.targetApp !== targetApp) return null;

    const session = handoff.session;
    safeRemoveStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
    if (!session?.token || !session?.email || isAuthTokenExpired(session.token)) return null;
    safeSetStorageItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session), "session");
    return session;
  } catch {
    safeRemoveStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
    return null;
  }
}

function getSafeGlasscoReturnRoute() {
  if (typeof window === "undefined") return null;
  const route = new URLSearchParams(window.location.search).get("returnTo");
  return isValidSopLibraryRoute(route) || isValidPpcDashboardRoute(route) ? route : null;
}

function redirectToGlasscoReturnRoute() {
  const returnRoute = getSafeGlasscoReturnRoute();
  if (!returnRoute) return false;
  window.location.replace(returnRoute);
  return true;
}
const WORKSPACE_CUSTOM_FIELD_TYPES = Object.freeze([
  { value: "HEADER_TITLE", label: "Header Title" },
  { value: "SHORT_TEXT", label: "Short Bar" },
  { value: "THREE_SHORT_BARS", label: "3 Short Bars" },
  { value: "FOUR_SHORT_BARS", label: "4 Short Bars" },
  { value: "LONG_BAR", label: "Long Bar" },
  { value: "HALF_LONG_TEXT", label: "Half Description" },
  { value: "LONG_TEXT", label: "Long Wide Description" },
  { value: "NUMBER", label: "Number (numbers only)" },
  { value: "CURRENCY", label: "Currency" },
  { value: "DATE", label: "Calendar Date" },
  { value: "LINK", label: "Link" },
  { value: "SHEET_EMBED", label: "Embedded Spreadsheet" },
  { value: "LISTING_CONTENT", label: "Listing Content Builder" },
  { value: "SHIPPING_TIMELINE", label: "Shipping Timeline" },
  { value: "SHIPMENT_TRACKER", label: "Track Shipment" },
  { value: "CUSTOM_DROPDOWN", label: "Custom Dropdown" },
  { value: "CUSTOM_TABLE", label: "Custom Table" },
  { value: "HALF_TABLE", label: "Mini Table" },
  { value: "FILE_UPLOAD", label: "File Upload" },
  { value: "IMAGE_GALLERY", label: "Image Gallery" },
  { value: "PAYMENT_STATUS", label: "Record Transaction" },
  { value: "CHECKLIST_NOTES", label: "Checklist + Notes" },
]);
const WORKSPACE_CUSTOM_FIELD_TYPE_VALUES = WORKSPACE_CUSTOM_FIELD_TYPES.map((fieldType) => fieldType.value);
const WORKSPACE_TABLE_FIELD_TYPES = Object.freeze(["CUSTOM_TABLE", "HALF_TABLE"]);
const WORKSPACE_FIELD_HISTORY_LIMIT = 1000;
const WORKSPACE_FIELD_HISTORY_EDIT_WINDOW_MS = 60000;
const TAB_EXPORT_FORMATS = Object.freeze([
  { value: "doc", label: "Docs" },
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
  { value: "xls", label: "Excel" },
]);
const IMAGE_GALLERY_FORMATS = Object.freeze([
  { value: "grid-5", label: "Grid 5", slots: 5, description: "Five equal image slots for a standard gallery." },
  { value: "hero-4", label: "Hero + 4", slots: 5, description: "One large hero image with four supporting slots." },
  { value: "grid-8", label: "Grid 8", slots: 8, description: "Eight equal image slots for larger image sets." },
  { value: "single-row", label: "Single Row", slots: 5, description: "A horizontal strip for quick side-by-side review." },
]);
const DEFAULT_CAMPAIGN_PREP_SETTINGS = Object.freeze({
  counts: Object.freeze({
    total: 0,
    sponsoredProducts: 0,
    sponsoredBrands: 0,
    sponsoredDisplay: 0,
    keywordTargets: 0,
    productTargeting: 0,
    videoAds: 0,
    autoCampaigns: 0,
  }),
  sheetButtonText: "Open Campaign Management Sheet",
  sheetUrl: "",
});
const LEGACY_DEMO_CAMPAIGN_PREP_COUNTS = Object.freeze({
  total: 24,
  sponsoredProducts: 14,
  sponsoredBrands: 6,
  sponsoredDisplay: 4,
});
const DEFAULT_KEYWORD_TABLE_COLUMNS = Object.freeze([
  { key: "keyword", label: "Keyword" },
  { key: "searchVolume", label: "Search Volume" },
  { key: "cpr", label: "CPR" },
  { key: "sales", label: "Keyword Sales" },
]);
const DEFAULT_KEYWORD_RESEARCH_SETTINGS = Object.freeze({
  spreadsheetUrl: "",
  columns: DEFAULT_KEYWORD_TABLE_COLUMNS,
  keywords: Object.freeze([
    Object.freeze({ keyword: "noise cancelling headphones", searchVolume: "124,500", cpr: "12", sales: "$42,500" }),
    Object.freeze({ keyword: "bluetooth over ear", searchVolume: "86,200", cpr: "8", sales: "$28,100" }),
    Object.freeze({ keyword: "travel wireless headsets", searchVolume: "12,400", cpr: "4", sales: "$5,200" }),
    Object.freeze({ keyword: "gaming anc bluetooth", searchVolume: "45,100", cpr: "10", sales: "$15,800" }),
  ]),
  keywordsByProductId: Object.freeze({}),
  keywordSpreadsheetUrlsByProductId: Object.freeze({}),
});
const DEFAULT_DASHBOARD_SETTINGS = Object.freeze({
  title: "Launch 50 Products in 2026",
  subtitle: "Launch 50 products by end of year to hit revenue targets",
  targetLaunches: 50,
  backgroundImages: Object.freeze([]),
});
const DEFAULT_WORKSPACE_BRANDING = Object.freeze({
  title: "LaunchPad Pro",
  subtitle: "Amazon Seller Tools",
});
const DASHBOARD_HERO_SLIDE_SECONDS = 3;
const DASHBOARD_HERO_MAX_SLIDES = 10;
const DEFAULT_VINE_SETTINGS = Object.freeze({
  metrics: Object.freeze({
    shippedUnits: 0,
    totalUnits: 0,
    reviewsReceived: 0,
    reviewGoal: 0,
    averageRating: 0,
  }),
  reviews: Object.freeze([
    Object.freeze({
      id: "vine_review_sound_quality",
      reviewer: "John D.",
      date: "Oct 12, 2023",
      rating: 5,
      title: "Incredible sound quality for the price point",
      body: "I’ve tested dozens of headphones and these specifically surprised me with the noise cancellation depth. The pairing was seamless and battery life holds up to the 40h claim. Highly recommend for frequent travelers.",
    }),
    Object.freeze({
      id: "vine_review_fit",
      reviewer: "TechGuru88",
      date: "Oct 10, 2023",
      rating: 3,
      title: "Good but ear cups are a bit tight",
      body: "The audio is crisp, but the clamping force on the ears is slightly higher than my Bose. If you have a larger head, you might find it uncomfortable after 3 hours of use. Build quality is solid though.",
    }),
  ]),
  feedback: Object.freeze([
    Object.freeze({
      id: "vine_feedback_comfort",
      issue: "Comfort",
      status: "Pending",
      body: "Ear cups are a bit tight... clamping force is high.",
      loggedAt: "Oct 10",
    }),
    Object.freeze({
      id: "vine_feedback_connectivity",
      issue: "Connectivity",
      status: "Resolved",
      body: "Dropped connection once in 5 hours.",
      loggedAt: "Oct 9",
    }),
  ]),
});
const LEGACY_DEMO_VINE_REVIEW_IDS = Object.freeze(["vine_review_sound_quality", "vine_review_fit"]);
const LEGACY_DEMO_VINE_FEEDBACK_IDS = Object.freeze(["vine_feedback_comfort", "vine_feedback_connectivity"]);
const LAUNCH_METRIC_MODES = Object.freeze(["daily", "weekly"]);
const LAUNCH_METRIC_FIELDS = Object.freeze([
  Object.freeze({ key: "periodNumber", label: "Daily / Weekly Number", type: "text", step: null }),
  Object.freeze({ key: "impressions", label: "Impressions", type: "number", step: "1" }),
  Object.freeze({ key: "clicks", label: "Clicks", type: "number", step: "1" }),
  Object.freeze({ key: "ctr", label: "CTR", type: "derived", format: "percent" }),
  Object.freeze({ key: "cpc", label: "CPC", type: "number", step: "0.01" }),
  Object.freeze({ key: "cvr", label: "CVR", type: "number", step: "0.01" }),
  Object.freeze({ key: "spend", label: "Spend", type: "number", step: "0.01" }),
  Object.freeze({ key: "sales", label: "Sales", type: "number", step: "0.01" }),
  Object.freeze({ key: "orders", label: "Order", type: "number", step: "1" }),
  Object.freeze({ key: "units", label: "Units", type: "number", step: "1" }),
  Object.freeze({ key: "acos", label: "ACOS", type: "number", step: "0.01" }),
  Object.freeze({ key: "totalUnits", label: "Total Units", type: "number", step: "1" }),
  Object.freeze({ key: "totalSales", label: "Total Sales", type: "number", step: "0.01" }),
  Object.freeze({ key: "organicSales", label: "Organic Sales", type: "derived", format: "currency" }),
  Object.freeze({ key: "tacos", label: "TACOS", type: "number", step: "0.01" }),
]);
const DEFAULT_LAUNCH_MONITORING_SETTINGS = Object.freeze({
  activeMode: "daily",
  launchPlan: Object.freeze({
    launchDate: "",
    launchPeriod: 0,
  }),
  portfolioButtonText: "Open Amazon Portfolio",
  portfolioUrl: "",
  chartMetrics: Object.freeze(["spend", "sales", "totalSales", "organicSales"]),
  entries: Object.freeze({
    daily: Object.freeze([
      Object.freeze({
        id: "launch_daily_1",
        periodNumber: 1,
        impressions: 12450,
        clicks: 382,
        cpc: 1.82,
        cvr: 12.6,
        spend: 695.24,
        sales: 2840.5,
        orders: 48,
        units: 54,
        acos: 24.5,
        totalUnits: 77,
        totalSales: 4085.25,
        tacos: 17,
      }),
    ]),
    weekly: Object.freeze([
      Object.freeze({
        id: "launch_weekly_1",
        periodNumber: 1,
        impressions: 68400,
        clicks: 2190,
        cpc: 1.76,
        cvr: 11.8,
        spend: 3854.4,
        sales: 15125,
        orders: 258,
        units: 302,
        acos: 25.5,
        totalUnits: 426,
        totalSales: 22480,
        tacos: 17.1,
      }),
    ]),
  }),
});
const LEGACY_DEMO_LAUNCH_ENTRY_IDS = Object.freeze(["launch_daily_1", "launch_weekly_1"]);
const BUILT_IN_STAGE_FIELD_TEMPLATES = Object.freeze({
  "under-final-order": [
    Object.freeze({
      fieldId: "built_in_under_final_order_payment_status",
      label: "Transaction Record",
      type: "PAYMENT_STATUS",
      value: null,
    }),
  ],
  shipping: [
    Object.freeze({
      fieldId: "built_in_shipping_timeline",
      label: "Shipping Timeline",
      type: "SHIPPING_TIMELINE",
      value: null,
    }),
  ],
  "listing-creation": [
    Object.freeze({
      fieldId: "built_in_listing_content_builder",
      label: "Listing Content Builder",
      type: "LISTING_CONTENT",
      value: null,
    }),
  ],
  "image-planning": [
    Object.freeze({
      fieldId: "built_in_main_image_requirements",
      label: "Main Image Requirements",
      type: "CUSTOM_TABLE",
      tableColumns: ["Image Style", "Image Header", "Message Priority", "Detailed Design Direction"],
      tableRows: ["01", "02", "03", "04", "05"],
      value: null,
    }),
    Object.freeze({
      fieldId: "built_in_image_inspiration",
      label: "Image Inspiration",
      type: "CUSTOM_TABLE",
      tableColumns: ["Image Style", "Image Link / Source"],
      tableRows: ["01", "02", "03"],
      value: null,
    }),
  ],
});
const OPTIMIZATION_WORKSPACE_STAGE = Object.freeze({
  stage_id: "optimization",
  stage_index: 13,
  label: "Optimization",
  phase: "optimization",
});
let workspaceDetails = loadWorkspaceDetails();
let cogsTemplateSettings = loadCogsTemplateSettings();
let workspaceBranding = loadWorkspaceBranding();
let dashboardSettings = loadDashboardSettings();
let activityLog = loadActivityLog();
let campaignPrepSettings = loadCampaignPrepSettings();
let keywordResearchSettings = loadKeywordResearchSettings();
let vineSettings = loadVineSettings();
let launchMonitoringSettings = loadLaunchMonitoringSettings();

const SIDEBAR_STAGE_TABS = CANONICAL_SIDEBAR_STAGE_ORDER.map((stageId) => {
  if (stageId === "optimization") return { id: "optimization", label: "Optimization", panelLabel: "Optimization Pipeline", icon: "trending_up" };
  const stage = LAUNCHFLOW_STAGES.find((item) => item.stage_id === stageId);
  return {
    id: stageId,
    label: stageId === "campaign-prep" ? "Campaign Preparation" : stage?.label ?? stageId,
    panelLabel: stageId === "product-research" ? "Research Pipeline" : `${stageId === "campaign-prep" ? "Campaign Preparation" : stage?.label ?? stageId} Pipeline`,
    icon: getStageIcon(stageId),
  };
});
const DEFAULT_HIDDEN_STAGE_IDS = Object.freeze(["amazon-inbound", "optimization", "stable", "scaling"]);

const USER_ROLES = Object.freeze(["ADMIN", "USER", "VIEWER"]);
const DEFAULT_TEAM_USERS = Object.freeze([
  {
    id: "team-chaim-glass",
    name: "Chaim Glass",
    email: "chaim@glasscosupplies.com",
    role: "ADMIN",
    status: "Active",
    password: "Cg.123456",
    jobTitle: "Workspace Owner",
    avatarDataUrl: "",
    inviteSentAt: null,
    lastLoginAt: null,
  },
]);

let stageSettings = loadStageSettings();
let userProducts = loadUserProducts();
let productSettings = loadProductSettings();
let teamUsers = loadTeamUsers();
let authSession = loadAuthSession();
let productDragGhost = null;
let productDropStageId = null;

let renderRecoveryAttempted = false;
let launchFlowBooted = false;
let remoteWorkspaceSyncTimeoutId = null;
let remoteWorkspacePollIntervalId = null;
let remoteWorkspaceSyncInFlight = false;
let remoteWorkspaceRefreshInFlight = false;
let remoteWorkspaceDirty = false;
let remoteWorkspaceSyncPendingAfterFlight = false;
let remoteWorkspaceImmediateSavePreparing = false;
let remoteWorkspaceHydrated = false;
let remoteWorkspaceUpdatedAt = null;
let remoteWorkspaceDirtyKeys = new Set();
let remoteWorkspaceDirtyProductIds = new Set();
let remoteWorkspaceDirtyTemplateStageIds = new Set();
let remoteWorkspaceDirtyProductStageIds = new Map();
let remoteWorkspaceDirtyProductFieldIds = new Map();
let remoteWorkspaceDirtyProductMetadataIds = new Set();
let remoteWorkspaceSyncIdleWaiters = [];
let remoteWorkspaceRenderDeferred = false;
let workspaceInteractionPauseUntil = 0;
let workspaceSelectInteractionActive = false;
let cogsModalNoticeTimeoutId = null;

const REMOTE_WORKSPACE_CHAT_POLL_INTERVAL_MS = 5000;
const REMOTE_WORKSPACE_SYNC_RETRY_DELAY_MS = 5000;
const COGS_SUCCESS_NOTICE_DURATION_MS = 2 * 60 * 1000;

const DUMMY_PRODUCTS = [
  {
    id: "dummy-stainless-steel-bottle",
    name: "Stainless Steel Bottle",
    sku: "SSB-77",
    stageId: "product-research",
    readinessPercent: 0,
  },
  {
    id: "dummy-silicone-lunch-box",
    name: "Silicone Lunch Box",
    sku: "SLB-24",
    stageId: "product-development",
    readinessPercent: 8,
  },
  {
    id: "dummy-bamboo-desk-lamp",
    name: "Bamboo Desk Lamp",
    sku: "BDL-18",
    stageId: "supplier-sourcing",
    readinessPercent: 14,
  },
  {
    id: "dummy-travel-cable-kit",
    name: "Travel Cable Kit",
    sku: "TCK-41",
    stageId: "under-final-order",
    readinessPercent: 21,
  },
  {
    id: "dummy-compression-packing-cubes",
    name: "Compression Packing Cubes",
    sku: "CPC-09",
    stageId: "shipping",
    readinessPercent: 29,
  },
  {
    id: "dummy-ceramic-matcha-set",
    name: "Ceramic Matcha Set",
    sku: "CMS-52",
    stageId: "keyword-research",
    readinessPercent: 36,
  },
  {
    id: "dummy-magnetic-spice-rack",
    name: "Magnetic Spice Rack",
    sku: "MSR-16",
    stageId: "listing-creation",
    readinessPercent: 43,
  },
  {
    id: "dummy-foldable-yoga-mat",
    name: "Foldable Yoga Mat",
    sku: "FYM-33",
    stageId: "image-planning",
    readinessPercent: 50,
  },
  {
    id: "dummy-pet-grooming-glove",
    name: "Pet Grooming Glove",
    sku: "PGG-71",
    stageId: "campaign-prep",
    readinessPercent: 57,
  },
  {
    id: "dummy-glass-food-containers",
    name: "Glass Food Containers",
    sku: "GFC-28",
    stageId: "amazon-inbound",
    readinessPercent: 64,
  },
  {
    id: "dummy-led-reading-light",
    name: "LED Reading Light",
    sku: "LRL-87",
    stageId: "enrolled-to-vines",
    readinessPercent: 71,
  },
  {
    id: "dummy-collapsible-water-bowl",
    name: "Collapsible Water Bowl",
    sku: "CWB-62",
    stageId: "launch",
    readinessPercent: 79,
  },
  {
    id: "dummy-microfiber-towel-set",
    name: "Microfiber Towel Set",
    sku: "MTS-44",
    stageId: "stable",
    readinessPercent: 88,
  },
  {
    id: "dummy-adjustable-phone-stand",
    name: "Adjustable Phone Stand",
    sku: "APS-05",
    stageId: "scaling",
    readinessPercent: 96,
  },
];

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootLaunchFlow, { once: true });
    scheduleLaunchFlowBootFallback();
  } else {
    deferLaunchFlowBoot();
  }
}

function bootLaunchFlow() {
  if (launchFlowBooted) return;
  launchFlowBooted = true;
  try {
    initializeApp();
  } catch (error) {
    renderBootError(error);
  }
}

function deferLaunchFlowBoot() {
  const scheduleBoot = typeof window !== "undefined" && typeof window.setTimeout === "function"
    ? window.setTimeout.bind(window)
    : setTimeout;
  scheduleBoot(bootLaunchFlow, 0);
}

function scheduleLaunchFlowBootFallback() {
  const scheduleBoot = typeof window !== "undefined" && typeof window.setTimeout === "function"
    ? window.setTimeout.bind(window)
    : setTimeout;
  scheduleBoot(() => {
    if (launchFlowBooted) return;
    if (typeof document !== "undefined" && document.readyState === "loading") {
      scheduleLaunchFlowBootFallback();
      return;
    }
    bootLaunchFlow();
  }, 50);
}

function initializeApp() {
  const shell = getShellElements();
  if (!shell) return;

  // Local recovery bundles must never overwrite a signed-in team's shared workspace.
  const appliedPendingRecoveryBundle = authSession?.token ? false : applyPendingRecoveryWorkspaceBundle();
  if (authSession?.token) clearRecoveryRemotePushMarker();
  restoreUiPreferences();
  applyProfileDeepLink();
  shell.appRoot.addEventListener("click", handleAppClick);
  shell.appRoot.addEventListener("pointerdown", handleGlasscoAppTabPointerDown);
  shell.appRoot.addEventListener("dblclick", handleAppDoubleClick);
  shell.appRoot.addEventListener("change", handleAppChange);
  shell.appRoot.addEventListener("focusin", handleAppFocusIn);
  shell.appRoot.addEventListener("focusout", handleAppFocusOut);
  shell.appRoot.addEventListener("input", handleAppInput);
  shell.appRoot.addEventListener("pointerdown", handleAppPointerDown);
  shell.appRoot.addEventListener("submit", handleAppSubmit);
  shell.appRoot.addEventListener("keydown", handleAppKeyDown);
  shell.appRoot.addEventListener("dragstart", handleAppDragStart);
  shell.appRoot.addEventListener("dragover", handleAppDragOver);
  shell.appRoot.addEventListener("drag", handleAppDragMove);
  shell.appRoot.addEventListener("drop", handleAppDrop);
  shell.appRoot.addEventListener("dragend", handleAppDragEnd);
  window.addEventListener("pointerup", handleWorkspaceTableResizeEnd);
  window.addEventListener("pointercancel", handleWorkspaceTableResizeEnd);
  window.addEventListener("pointermove", handleWorkspaceTableResizeMove);
  window.addEventListener("storage", handleGlasscoSharedLogout);
  ensureSelectedProductForStage();
  subscribe(() => safeRenderApp(shell));
  safeRenderApp(shell);
  if (authSession?.token) {
    startRemoteWorkspaceSync();
    return;
  }
  if (!appliedPendingRecoveryBundle && shouldAutoRecoverWorkspaceFromBundle()) {
    autoRecoverWorkspaceFromBundledFile(shell);
    return;
  }
  startRemoteWorkspaceSync();
}

function applyProfileDeepLink() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("open") !== "profile") return;
  uiState.activeView = "settings";
  uiState.settingsCategory = "profile";
  url.searchParams.delete("open");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function handleGlasscoSharedLogout(event) {
  if (event.key !== GLASSCO_LOGOUT_STORAGE_KEY || !event.newValue) return;
  clearAuthSession();
  renderFromCurrentState();
}

function getShellElements() {
  const appRoot = document.getElementById("app-root") ?? createMissingAppRoot();
  if (!appRoot) return null;

  const requiredShell = {
    header: document.getElementById("app-header"),
    sidebar: document.getElementById("app-sidebar"),
    productPanel: document.getElementById("app-product-panel"),
    workspace: document.getElementById("app-workspace"),
    contextPanel: document.getElementById("app-context-panel"),
  };

  if (Object.values(requiredShell).every(Boolean)) return { appRoot, ...requiredShell };

  const rebuiltShell = createAppShellElements();
  replaceChildren(appRoot, rebuiltShell.header, rebuiltShell.sidebar, rebuiltShell.productPanel, rebuiltShell.workspace, rebuiltShell.contextPanel);
  return { appRoot, ...rebuiltShell };
}

function createMissingAppRoot() {
  if (typeof document === "undefined" || !document.body) return null;
  const appRoot = document.createElement("div");
  appRoot.id = "app-root";
  document.body.appendChild(appRoot);
  return appRoot;
}

function createAppShellElements() {
  const header = document.createElement("header");
  header.id = "app-header";
  header.className = "h-16 sticky top-0 z-50";

  const sidebar = document.createElement("aside");
  sidebar.id = "app-sidebar";
  sidebar.className = "w-sidebar_width fixed left-0 top-16 z-20";

  const productPanel = document.createElement("section");
  productPanel.id = "app-product-panel";
  productPanel.setAttribute("aria-label", "Research Pipeline products");

  const workspace = document.createElement("main");
  workspace.id = "app-workspace";
  workspace.className = "pl-[260px]";

  const contextPanel = document.createElement("div");
  contextPanel.id = "app-context-panel";

  return { header, sidebar, productPanel, workspace, contextPanel };
}

function safeRenderApp(shell) {
  try {
    renderApp(shell);
  } catch (error) {
    console.error("LaunchFlow render failed.", error);
    if (!renderRecoveryAttempted) {
      renderRecoveryAttempted = true;
      try {
        workspaceDetails = normalizeWorkspaceDetails(workspaceDetails);
        renderApp(shell);
        return;
      } catch (retryError) {
        console.error("LaunchFlow render recovery failed.", retryError);
        renderAppError(shell, retryError);
        return;
      }
    }
    renderAppError(shell, error);
  }
}

function renderBootError(error) {
  console.error("LaunchFlow could not start.", error);
  const appRoot = document.getElementById("app-root") ?? document.body;
  const errorCard = createAppErrorCard("LaunchFlow could not start", "Refresh the page. If this keeps happening, clear the browser storage for this preview and try again.");
  replaceChildren(appRoot, errorCard);
  errorCard.querySelector('[data-action="reload-app"]')?.addEventListener("click", () => window.location.reload());
}

function renderAppError(shell, error) {
  [shell.header, shell.sidebar, shell.productPanel, shell.workspace, shell.contextPanel].forEach((element) => {
    element.hidden = true;
    replaceChildren(element);
  });
  shell.appRoot.querySelector(".login-page")?.remove();
  replaceChildren(shell.appRoot, createAppErrorCard("LaunchFlow had trouble loading", "The app caught a local data/render issue instead of showing a blank page. Refresh once; if it repeats, clear this preview's local storage."));
}

function createAppErrorCard(title, message) {
  return createElement("section", { className: "app-error-page", role: "alert" }, [
    createElement("div", { className: "app-error-card" }, [
      createIcon("error"),
      createElement("h1", null, title),
      createElement("p", null, message),
      createElement("button", { className: "button-primary", type: "button", dataAction: "reload-app" }, "Reload app"),
    ]),
  ]);
}

function renderApp(shell) {
  if (!isAuthenticated()) {
    renderLoginPage(shell);
    return;
  }

  clearLoginPage(shell);
  setAppShellVisibility(shell, true);
  shell.appRoot.classList.toggle("app-root--dashboard", uiState.activeView === "dashboard");
  if (uiState.activeView === "pipeline") ensureSelectedProductForStage();
  renderHeader(shell.header);
  renderSidebar(shell.sidebar);
  renderProductPanel(shell.productPanel);
  renderWorkspace(shell.workspace);
  renderContextPanel(shell.contextPanel);
}
function renderHeader(header) {
  replaceChildren(header, renderGlasscoAppTabs(), renderTopActions());
}

function renderGlasscoAppTabs() {
  const routes = getGlasscoAppRoutes();
  const currentPipelineRoute = `${window.location.pathname || "/"}${window.location.search}${window.location.hash}`;

  return createElement("nav", { className: "glassco-app-tabs", ariaLabel: "Glassco applications" }, [
    createElement("a", {
      className: "glassco-app-tabs__tab glassco-app-tabs__tab--active",
      href: currentPipelineRoute,
      target: "_blank",
      rel: "noopener noreferrer",
      ariaCurrent: "page",
      dataAction: "open-pipeline-app",
    }, "Product Pipeline"),
    createElement("a", {
      className: "glassco-app-tabs__tab",
      href: routes.ppc,
      target: "_blank",
      rel: "noopener noreferrer",
      dataAction: "open-sop-library",
    }, "Team SOP Library"),
    createElement("a", {
      className: "glassco-app-tabs__tab",
      href: routes.ppcDashboard,
      target: "_blank",
      rel: "noopener noreferrer",
      dataAction: "open-ppc-dashboard",
    }, "PPC Dashboard"),
  ]);
}

function renderTopActions() {
  const currentUser = getCurrentTeamUser();
  const role = currentUser?.role ?? getCurrentUserRole();
  return createElement("div", { className: "app-top-actions", ariaLabel: "Account actions" }, [
    createElement("span", { className: "app-top-actions__user" }, [
      createElement("strong", null, currentUser?.name ?? authSession?.name ?? ADMIN_OWNER_CREDENTIALS.name),
      createElement("span", null, role),
    ]),
    createElement("button", { className: "app-top-actions__button app-top-actions__button--profile", type: "button", dataAction: "open-profile", ariaLabel: "Open profile" }, [renderHeaderProfileAvatar(currentUser)]),
    createElement("button", { className: "app-top-actions__button", type: "button", dataAction: "logout", ariaLabel: "Log out" }, [createIcon("logout")]),
  ]);
}

function getTeamUserAvatarUrl(user) {
  return getStorageAssetUrl({ ...user, bucket: SUPABASE_STORAGE_BUCKETS.profileAvatars });
}

function renderHeaderProfileAvatar(user) {
  const avatarUrl = getTeamUserAvatarUrl(user);
  if (!avatarUrl) return createIcon("account_circle");

  const avatar = createElement("img", {
    className: "app-top-actions__avatar",
    src: avatarUrl,
    alt: `${user?.name ?? "Profile"} avatar`,
  });
  avatar.addEventListener("error", () => {
    avatar.replaceWith(createIcon("account_circle"));
  }, { once: true });
  return avatar;
}
function renderLoginPage(shell) {
  setAppShellVisibility(shell, false);
  const isSigningIn = uiState.authLoading;

  const existingLogin = shell.appRoot.querySelector(".login-page");
  if (existingLogin) existingLogin.remove();

  shell.appRoot.appendChild(createElement("section", { className: "login-page", ariaLabel: "LaunchFlow sign in" }, [
    createElement("div", { className: "login-card" }, [
      createElement("aside", { className: "login-card__brand" }, [
        createElement("div", { className: "login-card__logo-row" }, [
          createIcon("deployed_code"),
          createElement("strong", null, "SupplySync Pro"),
        ]),
        createElement("h1", null, "Master Your Supply Chain Pipeline"),
        createElement("p", null, "Gain absolute clarity over complex product launches with a high-velocity tracking workspace designed for professional Amazon sellers."),
        createElement("div", { className: "login-card__preview", ariaHidden: "true" }, [
          createElement("div", { className: "login-preview__sidebar" }, ["Dashboard", "Sourcing", "Shipping", "Listing", "Scaling"].map((label) => createElement("span", null, label))),
          createElement("div", { className: "login-preview__content" }, [
            createElement("strong", null, "Product Launch Dashboard Overview"),
            createElement("div", { className: "login-preview__metrics" }, ["142", "45", "78", "14.5%"].map((value) => createElement("span", null, value))),
            createElement("div", { className: "login-preview__bars" }, [1, 2, 3, 4].map((index) => createElement("span", { style: { width: `${46 + index * 11}%` } }, ""))),
          ]),
        ]),
      ]),
      createElement("form", { className: "login-card__form", dataAction: "login", ariaLabel: "Sign in form" }, [
        createElement("div", null, [
          createElement("h2", null, "Welcome Back"),
          createElement("p", null, "Sign in to manage your product launch pipeline"),
        ]),
        uiState.authError ? createElement("p", { className: "login-card__error", role: "alert" }, uiState.authError) : null,
        createElement("label", { className: "login-field" }, [
          createElement("span", null, "Email Address"),
          createElement("span", { className: "login-field__control" }, [
            createIcon("mail"),
            createElement("input", { type: "email", name: "email", placeholder: "name@company.com", autocomplete: "email", value: uiState.loginDraft.email, dataAction: "update-login-email", required: true, disabled: isSigningIn }),
          ]),
        ]),
        createElement("label", { className: "login-field" }, [
          createElement("span", { className: "login-field__label-row" }, [
            createElement("span", null, "Password"),
            createElement("button", { type: "button", dataAction: "forgot-password", className: "login-link", disabled: isSigningIn }, "Forgot password?"),
          ]),
          createElement("span", { className: "login-field__control" }, [
            createIcon("lock"),
            createElement("input", { type: uiState.showLoginPassword ? "text" : "password", name: "password", placeholder: "••••••••", autocomplete: "current-password", value: uiState.loginDraft.password, dataAction: "update-login-password", required: true, disabled: isSigningIn }),
            createElement("button", { className: "login-field__toggle", type: "button", dataAction: "toggle-login-password", ariaLabel: uiState.showLoginPassword ? "Hide password" : "Show password", disabled: isSigningIn }, [createIcon(uiState.showLoginPassword ? "visibility_off" : "visibility")]),
          ]),
        ]),
        createElement("label", { className: "login-remember" }, [
          createElement("input", { type: "checkbox", name: "remember", checked: uiState.loginDraft.remember, dataAction: "update-login-remember", disabled: isSigningIn }),
          createElement("span", null, "Remember this device"),
        ]),
        createElement("button", { className: "login-submit", type: "submit", disabled: isSigningIn, ariaBusy: isSigningIn ? "true" : null }, [
          isSigningIn ? createElement("span", { className: "login-submit__spinner", ariaHidden: "true" }) : null,
          createElement("span", null, isSigningIn ? "Signing in..." : "Sign In"),
          isSigningIn ? null : createIcon("arrow_forward"),
        ].filter(Boolean)),
        createElement("p", { className: "login-card__security" }, [createIcon("lock"), createElement("span", null, "Centralized access for Admin, User, and Viewer roles.")]),
      ].filter(Boolean)),
    ].filter(Boolean)),
    createElement("footer", { className: "login-footer" }, [
      createElement("strong", null, "SupplySync Pro"),
      createElement("span", null, "© 2026 SupplySync Pro Logistics. All rights reserved."),
      createElement("span", null, "Privacy Policy · Terms of Service · Security Architecture"),
    ]),
  ]));
}

function clearLoginPage(shell) {
  setAppShellVisibility(shell, true);
  shell.appRoot.querySelector(".login-page")?.remove();
}

function setAppShellVisibility(shell, isVisible) {
  [shell.header, shell.sidebar, shell.productPanel, shell.workspace, shell.contextPanel].forEach((element) => {
    if (!element) return;
    element.hidden = !isVisible;
  });
  shell.appRoot.classList.toggle("app-root--login", !isVisible);
  if (!isVisible) shell.appRoot.classList.remove("app-root--dashboard");
}

function renderSidebar(sidebar) {
  const isStageEditorOpen = uiState.stageEditorOpen && canEditPipelineTabs();
  const stageNavigation = isSharedWorkspaceHydrating()
    ? createElement("nav", { className: "sidebar-tabs", ariaLabel: "Pipeline stages loading" }, [
      createElement("button", { className: "sidebar-tab", type: "button", disabled: true, ariaBusy: "true" }, [
        createIcon("sync"),
        createElement("span", null, "Syncing workspace"),
      ]),
    ])
    : isStageEditorOpen
      ? renderStageEditorPanel()
      : createElement("nav", { className: "sidebar-tabs", ariaLabel: "Pipeline stages" },
        getSidebarStageTabs().map((stageTab) =>
          createElement("button", {
            className: `sidebar-tab ${uiState.activeView === "pipeline" && stageTab.id === uiState.selectedStageId ? "sidebar-tab--active" : ""}`,
            type: "button",
            dataAction: "select-stage",
            dataStageId: stageTab.id,
            dataProductDropStageId: stageTab.id,
            ariaCurrent: uiState.activeView === "pipeline" && stageTab.id === uiState.selectedStageId ? "page" : null,
          }, [
            createIcon(stageTab.icon),
            createElement("span", null, stageTab.label),
          ]),
        ),
      );

  replaceChildren(
    sidebar,
    createElement("nav", { className: "sidebar-menu", ariaLabel: "Primary navigation" }, [
      createElement("button", { className: `sidebar-tab sidebar-tab--dashboard ${uiState.activeView === "dashboard" ? "sidebar-tab--active" : ""}`.trim(), type: "button", dataAction: "open-dashboard" }, [
        createIcon("dashboard"),
        createElement("span", null, "Dashboard"),
      ]),
    ]),
    createElement("div", { className: "sidebar-section-heading" }, [
      createElement("span", { className: "sidebar-section-label" }, "Pipeline Stages"),
      canEditPipelineTabs() ? createElement("span", { className: "sidebar-section-actions" }, [
        createElement("button", { className: "sidebar-icon-button", type: "button", dataAction: "toggle-stage-editor", ariaLabel: "Edit pipeline stages" }, [createIcon("edit")]),
      ]) : null,
    ]),
    stageNavigation,
    canEditPipelineTabs() && !isSharedWorkspaceHydrating() ? renderAddStageButton() : null,
    renderAddStageModal(),
  );
}

function renderStageEditorPanel() {
  const visibleTabs = getSidebarStageTabs();

  return createElement("section", { className: "stage-editor", ariaLabel: "Edit pipeline stage tabs" }, [
    createElement("p", { className: "stage-editor__note" }, "Rename, reorder, or permanently delete tabs here. Deleted stages are removed from this workspace and will not appear in recovery."),
    ...visibleTabs.map((stageTab) => renderStageEditorRow(stageTab)),
  ].filter(Boolean));
}

function renderStageEditorRow(stageTab) {
  return createElement("div", { className: "stage-editor__row", dataStageDropId: stageTab.id }, [
    createElement("button", {
      className: "stage-editor__drag-handle",
      type: "button",
      draggable: true,
      dataAction: "drag-stage",
      dataStageId: stageTab.id,
      ariaLabel: `Drag ${stageTab.label} to reorder`,
      title: `Drag ${stageTab.label} to reorder`,
    }, [createIcon("drag_indicator")]),
    createElement("input", {
      className: "stage-editor__input",
      type: "text",
      value: stageTab.label,
      dataAction: "rename-stage",
      dataStageId: stageTab.id,
      ariaLabel: `Rename ${stageTab.label}`,
    }),
    createElement("button", { className: "stage-editor__icon stage-editor__icon--danger", type: "button", dataAction: "delete-stage", dataStageId: stageTab.id, title: `Permanently delete ${stageTab.label}`, ariaLabel: `Permanently delete ${stageTab.label}` }, [createIcon("delete")]),
  ].filter(Boolean));
}

function renderAddStageButton() {
  return createElement("button", { className: "sidebar-add-stage", type: "button", dataAction: "open-add-stage-modal", ariaLabel: "Add new pipeline stage" }, [
    createIcon("add"),
    createElement("span", null, "Add New Stage"),
  ]);
}

function renderAddStageModal() {
  if (!uiState.addStageModalOpen) return null;

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", { className: "workspace-modal__dialog", dataAction: "create-stage", role: "dialog", ariaModal: "true", ariaLabel: "Add new pipeline stage" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Add New Stage"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-add-stage-modal", ariaLabel: "Close add stage form" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Stage Name"),
        createElement("input", { className: "form-input", name: "stageName", type: "text", placeholder: "Example: Quality Review", required: true }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-add-stage-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Create Stage"),
      ]),
    ]),
  ]);
}

function renderSettingsCategoryPanel(productPanel) {
  const categories = getVisibleSettingsCategories();
  replaceChildren(productPanel, createElement("aside", { className: "settings-category-panel", ariaLabel: "Settings categories" }, [
    createElement("h2", { className: "product-panel__title" }, "Settings"),
    createElement("p", { className: "settings-category-panel__note" }, "Manage profile, access, and workspace preferences."),
    categories.map((category) => createElement("button", {
      className: `settings-category ${category.id === uiState.settingsCategory ? "settings-category--active" : ""}`,
      type: "button",
      dataAction: "select-settings-category",
      dataSettingsCategory: category.id,
      ariaCurrent: category.id === uiState.settingsCategory ? "page" : null,
    }, [createIcon(category.icon), createElement("span", null, category.label)])),
  ]));
}

function renderSettingsWorkspace(workspace) {
  if (!canViewSettingsCategory(uiState.settingsCategory)) uiState.settingsCategory = getDefaultSettingsCategory();

  if (uiState.settingsCategory === "users") {
    renderUserManagementWorkspace(workspace);
    return;
  }

  if (uiState.settingsCategory === "backups") {
    renderWorkspaceBackupsWorkspace(workspace);
    if (!uiState.workspaceBackupsLoaded && !uiState.workspaceBackupsLoading) loadWorkspaceBackups();
    return;
  }

  if (uiState.settingsCategory === "profile") {
    replaceChildren(workspace, createElement("section", { className: "settings-workspace", ariaLabel: "Profile settings" }, [
      createElement("div", { className: "settings-workspace__header" }, [
        createElement("div", null, [
          createElement("p", { className: "workspace-detail__eyebrow" }, "Settings / Profile"),
          createElement("h2", null, "Profile"),
          createElement("p", null, "Review the signed-in workspace owner and access level."),
        ]),
      ]),
      renderSettingsProfileCard(),
    ]));
    return;
  }

  replaceChildren(workspace, createElement("section", { className: "settings-workspace", ariaLabel: `${getSettingsCategoryLabel(uiState.settingsCategory)} settings` }, [
    createElement("div", { className: "settings-workspace__header" }, [
      createElement("div", null, [
        createElement("p", { className: "workspace-detail__eyebrow" }, "Settings"),
        createElement("h2", null, getSettingsCategoryLabel(uiState.settingsCategory)),
        createElement("p", null, "This settings area is ready for the next configuration controls."),
      ]),
    ]),
    createElement("section", { className: "settings-placeholder-card" }, [
      createIcon("settings"),
      createElement("strong", null, `${getSettingsCategoryLabel(uiState.settingsCategory)} settings coming next`),
      createElement("p", null, "We started the structure now so permissions and login can connect cleanly later."),
    ]),
  ]));
}

function renderUserManagementWorkspace(workspace) {
  const filteredUsers = getFilteredTeamUsers();
  const activeUsers = teamUsers.filter((user) => user.status === "Active").length;
  const manualUsers = teamUsers.length;

  replaceChildren(workspace, createElement("section", { className: "settings-workspace", ariaLabel: "User management settings" }, [
    createElement("div", { className: "settings-workspace__header" }, [
      createElement("div", null, [
        createElement("p", { className: "workspace-detail__eyebrow" }, "Settings / User Management"),
        createElement("h2", null, "User Management"),
        createElement("p", null, "Manually grant access by creating an email, password, and ADMIN, USER, or VIEWER access level. No invitation email is required."),
      ]),
      canManageUsers() ? createElement("button", { className: "button-primary settings-invite-button", type: "button", dataAction: "open-invite-user" }, [createIcon("person_add"), createElement("span", null, "Grant Access")]) : null,
    ].filter(Boolean)),
    uiState.settingsUserNotice ? createElement("p", { className: "settings-user-notice", role: "status" }, uiState.settingsUserNotice) : null,
    createElement("div", { className: "settings-stat-grid settings-stat-grid--simple" }, [
      renderSettingsStat("Active Users", String(activeUsers)),
      renderSettingsStat("Manual Accounts", String(manualUsers)),
    ]),
    renderTeamUsersTable(filteredUsers),
    renderInviteUserModal(),
  ].filter(Boolean)));
}

function renderSettingsStat(label, value, suffix = "") {
  return createElement("article", { className: "settings-stat-card" }, [
    createElement("span", null, label),
    createElement("strong", null, [value, suffix ? createElement("small", null, ` ${suffix}`) : null]),
  ]);
}

function renderTeamUsersTable(users) {
  return createElement("section", { className: "settings-users-card" }, [
    createElement("div", { className: "settings-users-card__toolbar" }, [
      createElement("strong", null, "Team Members"),
      createElement("label", { className: "settings-user-search" }, [
        createIcon("search"),
        createElement("input", { type: "search", value: uiState.settingsUserSearchQuery, dataAction: "update-team-search", placeholder: "Search team members...", ariaLabel: "Search team members" }),
      ]),
      createElement("span", null, `Showing ${users.length} of ${teamUsers.length} team members`),
    ]),
    createElement("div", { className: "settings-users-table" }, [
      createElement("div", { className: "settings-users-table__head" }, ["Name", "Email", "Role/Access Level", "Status", "Actions"].map((label) => createElement("span", null, label))),
      ...users.map((user) => createElement("div", { className: "settings-users-table__row" }, [
        createElement("span", { className: "settings-user-name" }, [createElement("span", { className: "settings-user-avatar" }, getTeamUserInitials(user.name)), createElement("strong", null, user.name)]),
        createElement("span", null, user.email),
        createElement("span", { className: "settings-role-pill" }, user.role),
        createElement("span", { className: `settings-status settings-status--${user.status === "Active" ? "active" : "pending"}` }, [createElement("span", null, ""), user.status, user.hasPassword ? createElement("small", { className: "settings-password-pill" }, "Password saved") : null]),
        createElement("span", { className: "settings-user-actions" }, canManageUsers() ? [
          createElement("button", { type: "button", dataAction: "edit-team-user", dataUserId: user.id, ariaLabel: `Edit ${user.name}` }, [createIcon("edit")]),
          user.email === ADMIN_OWNER_CREDENTIALS.email ? null : createElement("button", { type: "button", dataAction: "delete-team-user", dataUserId: user.id, ariaLabel: `Remove ${user.name}` }, [createIcon("delete")]),
        ].filter(Boolean) : [createElement("span", null, "View only")]),
      ])),
    ]),
  ]);
}

function renderSettingsProfileCard() {
  const currentUser = getCurrentTeamUser();
  const avatarUrl = getTeamUserAvatarUrl(currentUser);
  const avatarContent = avatarUrl
    ? createElement("img", { src: avatarUrl, alt: `${currentUser?.name ?? "User"} avatar` })
    : getTeamUserInitials(currentUser?.name ?? "User");

  return createElement("form", { className: "settings-profile-card", dataAction: "save-profile-settings" }, [
    createElement("div", { className: "settings-profile-card__avatar-block" }, [
      createElement("span", { className: "settings-profile-card__avatar" }, avatarContent),
      createElement("label", { className: "settings-profile-card__upload" }, [
        createIcon("photo_camera"),
        createElement("span", null, "Upload Avatar"),
        createElement("input", { type: "file", accept: "image/*", dataAction: "upload-profile-avatar", ariaLabel: "Upload profile avatar" }),
      ]),
    ]),
    createElement("div", { className: "settings-profile-card__content" }, [
      createElement("p", { className: "workspace-detail__eyebrow" }, "Your Profile"),
      createElement("h3", null, currentUser?.name ?? "Workspace User"),
      createElement("p", null, currentUser?.email ?? authSession?.email ?? "admin@example.com"),
      createElement("span", { className: "settings-role-pill" }, currentUser?.role ?? getCurrentUserRole()),
    ]),
    createElement("div", { className: "settings-profile-card__fields" }, [
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Display Name"), createElement("input", { className: "form-input", name: "profileName", type: "text", value: currentUser?.name ?? "Workspace User", required: true })]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Job Title"), createElement("input", { className: "form-input", name: "profileJobTitle", type: "text", value: currentUser?.jobTitle ?? "Team Member", placeholder: "Example: Research Lead" })]),
      createElement("button", { className: "button-primary settings-profile-card__save", type: "submit" }, "Save Profile"),
      uiState.settingsProfileNotice ? createElement("p", { className: "settings-user-notice settings-profile-card__notice", role: "status" }, uiState.settingsProfileNotice) : null,
    ]),
  ]);
}

function renderInviteUserModal() {
  if (!uiState.settingsInviteModalOpen) return null;

  const editingUser = uiState.editingTeamUserId ? teamUsers.find((user) => user.id === uiState.editingTeamUserId) : null;
  const isEditing = Boolean(editingUser);
  const visibleSavedPassword = isEditing && editingUser?.password ? editingUser.password : "";
  const hasSavedPassword = Boolean(visibleSavedPassword || editingUser?.hasPassword);

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog",
      dataAction: "invite-user",
      dataUserId: editingUser?.id ?? null,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: isEditing ? "Edit manual access" : "Grant manual access",
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, isEditing ? "Edit Manual Access" : "Grant Manual Access"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-invite-user", ariaLabel: "Close manual access dialog" }, [createIcon("close")]),
      ]),
      createElement("p", { className: "settings-invite-help" }, "Create the email, password, and access level here. The user can log in immediately with those credentials—no invite email or acceptance link is required."),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Full Name"), createElement("input", { className: "form-input", name: "userName", type: "text", placeholder: "Example: Sarah Lopez", value: editingUser?.name ?? "", required: true })]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Email"), createElement("input", { className: "form-input", name: "userEmail", type: "email", placeholder: "name@example.com", value: editingUser?.email ?? "", required: true, disabled: editingUser?.email === ADMIN_OWNER_CREDENTIALS.email })]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Role / Access Level"), createElement("select", { className: "form-input", name: "userRole", disabled: editingUser?.email === ADMIN_OWNER_CREDENTIALS.email }, USER_ROLES.map((role) => createElement("option", { value: role, selected: role === (editingUser?.role ?? "USER") }, role)))]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, isEditing && visibleSavedPassword ? "Saved Password" : isEditing ? "New Password (optional)" : "Password"),
        createElement("input", { className: "form-input", name: "userPassword", type: visibleSavedPassword ? "text" : "password", placeholder: isEditing ? "Leave blank to keep current password" : "Create a password", value: visibleSavedPassword, required: !isEditing }),
        isEditing ? createElement("small", { className: "settings-password-indicator" }, hasSavedPassword ? "Password saved for this user." : "No saved password yet — enter one before this user can log in.") : null,
      ]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Job Title"), createElement("input", { className: "form-input", name: "userJobTitle", type: "text", placeholder: "Example: Research Lead", value: editingUser?.jobTitle ?? "" })]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-invite-user" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, isEditing ? "Save Access" : "Grant Access"),
      ]),
    ]),
  ]);
}

function renderProductPanel(productPanel) {
  if (uiState.activeView === "dashboard") {
    replaceChildren(productPanel);
    return;
  }

  if (uiState.activeView === "settings") {
    renderSettingsCategoryPanel(productPanel);
    return;
  }

  if (uiState.activeView === "dashboard") {
    replaceChildren(productPanel, createElement("div", { className: "product-panel" }, [
      createElement("h2", { className: "product-panel__title" }, "Dashboard"),
      renderPipelineSummaryCards({ label: "All Products" }, getAllProducts()),
      createElement("p", { className: "empty-note text-body-md text-on-surface-variant" }, "Use the workspace filters to review recent launch activity across all products."),
    ]));
    return;
  }

  const selectedTab = getSelectedStageTab();
  const selectedProducts = getProductsForSelectedTab(selectedTab.id);
  const deletedProductsInStage = getDeletedProductHistory(selectedTab.id);

  replaceChildren(
    productPanel,
    createElement("div", { className: "product-panel" }, [
      createElement("h2", { className: "product-panel__title" }, selectedTab.panelLabel),
      renderPipelineSummaryCards(selectedTab, selectedProducts),
      createElement("label", { className: "product-search" }, [
        createIcon("search"),
        createElement("span", { className: "app-header__search-label" }, "Search products"),
        createElement("input", {
          className: "product-search__input",
          type: "search",
          placeholder: "Search products...",
          ariaLabel: "Search products",
        }),
      ]),
      createElement("div", { className: "product-panel__meta" }, [
        createElement("span", null, `${selectedProducts.length} Products`),
        createElement("span", { className: "product-panel__meta-actions" }, [
          createElement("button", {
            className: `product-panel__history-button product-panel__history-button--deleted ${deletedProductsInStage.length ? "" : "product-panel__history-button--empty"}`.trim(),
            type: "button",
            dataAction: "open-deleted-product-history",
            dataStageId: selectedTab.id,
            ariaLabel: "Open deleted product history",
            title: "Deleted products history",
            disabled: deletedProductsInStage.length === 0,
          }, [createIcon("restore_from_trash"), deletedProductsInStage.length ? createElement("span", null, String(deletedProductsInStage.length)) : null].filter(Boolean)),
          createIcon("filter_list"),
        ].filter(Boolean)),
      ]),
      renderSharedWorkspaceSaveNotice(),
      selectedProducts.length > 0
        ? createElement(
          "div",
          { className: "product-list" },
          selectedProducts.map((product) => renderProductCard(product, product.id === uiState.selectedProductId)),
        )
        : renderEmptyProductList(selectedTab),
      renderAddProductButton(selectedTab),
      renderAddProductModal(selectedTab),
      renderProductDeleteConfirmationModal(),
      renderProductHistoryModal(),
      renderDeletedProductHistoryModal(),
    ]),
  );
}

function renderTabExportControls(selectedTab, selectedProducts) {
  return createElement("section", { className: "product-panel-export", ariaLabel: `Export ${selectedTab.label} data` }, [
    createElement("span", { className: "product-panel-export__label" }, "Export tab"),
    createElement("div", { className: "product-panel-export__actions" },
      TAB_EXPORT_FORMATS.map((format) => createElement("button", {
        className: "product-panel-export__button",
        type: "button",
        dataAction: "export-stage-tab",
        dataStageId: selectedTab.id,
        dataExportFormat: format.value,
        disabled: selectedProducts.length === 0,
        ariaLabel: `Export ${selectedTab.label} as ${format.label}`,
      }, format.label)),
    ),
  ]);
}

function renderSharedWorkspaceSaveNotice() {
  if (!uiState.sharedWorkspaceSaveNotice) return null;
  const status = uiState.sharedWorkspaceSaveStatus || "info";
  return createElement("p", {
    className: `shared-workspace-save-notice shared-workspace-save-notice--${status}`,
    role: status === "error" ? "alert" : "status",
  }, [
    status === "saving" ? renderActionSpinner("shared-workspace-save-notice__spinner") : null,
    createElement("span", null, uiState.sharedWorkspaceSaveNotice),
  ].filter(Boolean));
}

function renderActionSpinner(className = "action-spinner") {
  return createElement("span", { className, ariaHidden: "true" });
}

function isPendingProductAction(action, id) {
  return uiState.pendingProductAction?.action === action && uiState.pendingProductAction?.id === id;
}

function setPendingProductAction(action, id) {
  uiState.pendingProductAction = action && id ? { action, id } : null;
}

function renderPipelineSummaryCards(selectedTab, selectedProducts) {
  const totalProductCount = getAllProducts().length;
  const selectedProductShare = formatProductShare(selectedProducts.length, totalProductCount);

  return createElement("section", { className: "pipeline-summary", ariaLabel: "Pipeline product totals" }, [
    createElement("article", { className: "pipeline-summary-card pipeline-summary-card--active" }, [
      createElement("span", { className: "pipeline-summary-card__label" }, selectedTab.label),
      createElement("span", { className: "pipeline-summary-card__value-row" }, [
        createElement("strong", { className: "pipeline-summary-card__value" }, String(selectedProducts.length)),
        createElement("span", { className: "pipeline-summary-card__percent" }, selectedProductShare),
      ]),
      createElement("span", { className: "pipeline-summary-card__hint" }, "in this stage"),
    ]),
    createElement("article", { className: "pipeline-summary-card" }, [
      createElement("span", { className: "pipeline-summary-card__label" }, "Total Products"),
      createElement("strong", { className: "pipeline-summary-card__value" }, String(totalProductCount)),
      createElement("span", { className: "pipeline-summary-card__hint" }, "across all stages"),
    ]),
  ]);
}

function formatProductShare(selectedCount, totalCount) {
  if (totalCount <= 0) return "0%";
  return `${Math.round((selectedCount / totalCount) * 100)}%`;
}

function renderProductCard(product, isSelected = false) {
  const checklistReadiness = calculateProductChecklistReadiness(product);
  const productMutationDisabled = !canMutateProductsNow();
  const deletePending = isPendingProductAction("delete", product.id);

  return createElement("article", {
    className: `product-card ${isSelected ? "product-card--selected" : ""}`,
    ariaCurrent: isSelected ? "true" : null,
    draggable: canMoveProducts(),
    dataAction: canMoveProducts() ? "drag-product" : null,
    dataProductId: product.id,
  }, [
    createElement("button", {
      className: "product-card__select",
      type: "button",
      dataAction: "select-product",
      dataProductId: product.id,
      ariaLabel: `Open ${product.name}`,
    }, [
      renderProductThumbnail(product, "product-card__icon"),
      createElement("span", { className: "product-card__body" }, [
        createElement("strong", null, product.name),
        createElement("span", { className: "product-card__meta-row" }, [
          createElement("span", null, "ASIN:"),
          renderProductCardAsin(product),
        ]),
      ]),
    ]),
    createElement("span", { className: "product-card__divider" }),
    createElement("span", { className: "product-card__footer" }, [
      canManageProducts() ? createElement("span", { className: "product-card__actions" }, [
        createElement("button", { className: "product-card__action", type: "button", dataAction: "open-product-history", dataProductId: product.id, ariaLabel: `Open history for ${product.name}` }, [createIcon("history")]),
        createElement("button", { className: "product-card__action", type: "button", dataAction: "edit-product", dataProductId: product.id, ariaLabel: `Edit ${product.name}`, disabled: productMutationDisabled || deletePending }, [createIcon("edit")]),
        createElement("button", { className: "product-card__action product-card__action--danger", type: "button", dataAction: "delete-product", dataProductId: product.id, ariaLabel: deletePending ? `Deleting ${product.name}` : `Delete ${product.name}`, disabled: productMutationDisabled || deletePending }, [deletePending ? renderActionSpinner("product-action-spinner") : createIcon("delete")]),
      ]) : null,
      createElement("span", { className: "product-card__status" }, `${checklistReadiness}% Ready`),
    ]),
  ].filter(Boolean));
}

function renderProductCardAsin(product) {
  if (!product.asin) return createElement("span", null, "N/A");
  return createElement("a", { className: "product-card__asin-link", href: getAmazonListingUrl(product.asin), target: "_blank", rel: "noreferrer" }, product.asin);
}

function calculateProductChecklistReadiness(product) {
  const productDetails = getWorkspaceProductDetails(product.id);
  const tasks = Object.values(productDetails.stages ?? {}).flatMap((stageDetails) => stageDetails.checklistTasks ?? []);
  if (tasks.length === 0) return 0;

  const completedTasks = tasks.filter((task) => task.isCompleted).length;
  return Math.round((completedTasks / tasks.length) * 100);
}

function renderEmptyProductList(selectedTab) {
  if (hasSharedWorkspaceLoadError()) {
    return createElement("article", { className: "product-empty product-empty--error" }, [
      createElement("strong", null, "Shared workspace could not load"),
      createElement("span", null, uiState.sharedWorkspaceSaveNotice || "Refresh or sign in again before adding products."),
    ]);
  }
  if (isSharedWorkspaceHydrating()) {
    return createElement("article", { className: "product-empty" }, [
      createElement("strong", null, "Syncing shared workspace"),
      createElement("span", null, "Loading the latest products from Supabase..."),
    ]);
  }
  return createElement("article", { className: "product-empty" }, [
    createElement("strong", null, "No products in this stage yet"),
    createElement("span", null, `${selectedTab.label} currently has 0 products.`),
  ]);
}

function renderAddProductButton(selectedTab) {
  if (!canManageProducts()) return null;
  return createElement("button", {
    className: "add-product-button",
    type: "button",
    dataAction: "open-add-product-modal",
    ariaLabel: `Add product to ${selectedTab.label}`,
    disabled: !canMutateProductsNow(),
  }, [
    createIcon("add"),
    createElement("span", null, `Add Product to ${selectedTab.label}`),
  ]);
}

function renderAddProductModal(selectedTab) {
  if (!uiState.addProductModalOpen) return null;

  const editingProduct = getEditableProduct(uiState.editingProductId);
  const modalTitle = editingProduct ? `Edit ${editingProduct.name}` : `Add Product to ${selectedTab.label}`;
  const productMutationDisabled = !canMutateProductsNow();
  const isSavingProduct = isSharedWorkspaceSaving();

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog add-product-modal",
      dataAction: "create-product",
      dataStageId: editingProduct?.stageId ?? selectedTab.id,
      dataProductId: editingProduct?.id ?? null,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: modalTitle,
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, modalTitle),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-add-product-modal", ariaLabel: "Close add product form", disabled: isSavingProduct }, [createIcon("close")]),
      ]),
      renderSharedWorkspaceSaveNotice(),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Product Image"),
        createElement("input", { className: "form-input", name: "productImage", type: "file", accept: PRODUCT_IMAGE_ACCEPT, disabled: productMutationDisabled }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Product Name"),
        createElement("input", { className: "form-input", name: "productName", type: "text", placeholder: "Example: Stainless Steel Bottle", value: editingProduct?.name ?? "", required: true, disabled: productMutationDisabled }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "SKU"),
        createElement("input", { className: "form-input", name: "productSku", type: "text", placeholder: "N/A if blank", value: editingProduct?.sku ?? "", disabled: productMutationDisabled }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "ASIN"),
        createElement("input", { className: "form-input", name: "productAsin", type: "text", placeholder: "N/A if blank", value: editingProduct?.asin ?? "", disabled: productMutationDisabled }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-add-product-modal", disabled: isSavingProduct }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit", disabled: productMutationDisabled }, isSavingProduct ? "Saving..." : editingProduct ? "Save Product" : "Create Product"),
      ]),
    ]),
  ]);
}

function renderProductDeleteConfirmationModal() {
  const confirmation = uiState.productDeleteConfirmation;
  if (!confirmation) return null;

  const deletePending = isPendingProductAction("delete", confirmation.productId);
  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("section", {
      className: "workspace-modal__dialog product-delete-confirmation",
      role: "dialog",
      ariaModal: "true",
      ariaLabelledby: "product-delete-confirmation-title",
      ariaDescribedby: "product-delete-confirmation-description",
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", { id: "product-delete-confirmation-title" }, "Delete product?"),
        createElement("button", {
          className: "workspace-modal__close",
          type: "button",
          dataAction: "close-product-delete-confirmation",
          ariaLabel: "Close delete product confirmation",
          disabled: deletePending,
        }, [createIcon("close")]),
      ]),
      createElement("div", { className: "product-delete-confirmation__body" }, [
        createElement("span", { className: "product-delete-confirmation__icon", ariaHidden: "true" }, [createIcon("delete")]),
        createElement("p", { id: "product-delete-confirmation-description" }, [
          "Are you sure you want to delete ",
          createElement("strong", null, confirmation.productName),
          "? It will be removed from the active pipeline and remain available in deleted product history for recovery.",
        ]),
      ]),
      renderSharedWorkspaceSaveNotice(),
      createElement("div", { className: "workspace-modal__actions product-delete-confirmation__actions" }, [
        createElement("button", {
          className: "button-secondary",
          type: "button",
          dataAction: "close-product-delete-confirmation",
          disabled: deletePending,
        }, "Cancel"),
        createElement("button", {
          className: "product-delete-confirmation__confirm",
          type: "button",
          dataAction: "confirm-product-delete",
          disabled: deletePending,
        }, [
          deletePending ? renderActionSpinner("product-action-spinner") : createIcon("delete"),
          createElement("span", null, deletePending ? "Deleting..." : "Delete product"),
        ]),
      ]),
    ]),
  ]);
}

function getProductsForSelectedTab(selectedStageId) {
  const products = getAllProducts();
  if (selectedStageId === "optimization") {
    return products.filter((product) => product.stageId === "optimization" || ["stable", "scaling"].includes(product.stageId));
  }

  return products.filter((product) => product.stageId === selectedStageId);
}

function getAllProducts() {
  if (isSharedWorkspaceHydrating()) return [];
  const deletedProductIds = new Set(productSettings.deletedProductIds);
  return userProducts
    .map((product) => ({ ...product, ...(productSettings.edits[product.id] ?? {}) }))
    .filter((product) => !deletedProductIds.has(product.id));
}

function isSharedWorkspaceHydrating() {
  return Boolean(authSession?.token && !remoteWorkspaceHydrated && !recoveryWorkspaceNeedsRemotePush() && !hasSharedWorkspaceLoadError());
}

function hasSharedWorkspaceLoadError() {
  return Boolean(authSession?.token && !remoteWorkspaceHydrated && uiState.sharedWorkspaceSaveStatus === "error");
}

function isSharedWorkspaceSaving() {
  return uiState.sharedWorkspaceSaveStatus === "saving" || remoteWorkspaceSyncInFlight;
}

function canMutateProductsNow() {
  return canManageProducts() && Boolean(authSession?.token) && remoteWorkspaceHydrated && !isSharedWorkspaceHydrating() && !isSharedWorkspaceSaving();
}

function getSelectedStageTab() {
  return SIDEBAR_STAGE_TABS.find((stageTab) => stageTab.id === uiState.selectedStageId) ?? SIDEBAR_STAGE_TABS[0];
}

function renderWorkspace(workspace) {
  if (uiState.activeView === "settings") {
    renderSettingsWorkspace(workspace);
    return;
  }

  if (isSharedWorkspaceHydrating() || hasSharedWorkspaceLoadError()) {
    replaceChildren(workspace, renderWorkspaceEmptyState());
    return;
  }

  if (uiState.activeView === "dashboard") {
    replaceChildren(workspace, renderDashboardWorkspace());
    return;
  }

  const selectedProduct = getSelectedProduct();

  if (!selectedProduct) {
    replaceChildren(workspace, renderWorkspaceEmptyState());
    return;
  }

  const visibleStages = getWorkspaceStagesForDemoProduct(selectedProduct);
  const currentStage = visibleStages.at(-1);

  replaceChildren(
    workspace,
    createElement("section", { className: "workspace-detail", ariaLabel: `${selectedProduct.name} stage details` }, [
      createElement("div", { className: "workspace-detail__header" }, [
        createElement("p", { className: "workspace-detail__eyebrow" }, "Product workspace"),
      ]),
      renderWorkspaceProductOverview(selectedProduct),
      createElement("div", { className: "workspace-stage-list" },
        visibleStages.map((stage, index) => renderWorkspaceStageDropdown(selectedProduct, stage, index + 1)),
      ),
      renderWorkspaceNextStageAction(selectedProduct),
      createElement("p", { className: "workspace-detail__note" }, "Future stages stay hidden until this product reaches them, so each product only shows the stage details it is ready to work on."),
      renderWorkspaceFieldModal(),
      renderWorkspaceFieldHistoryModal(),
      renderWorkspaceStageHistoryModal(),
      renderDeletedWorkspaceFieldHistoryModal(),
      renderPaymentStatusModal(),
      renderCogsCalculatorModal(),
      renderImageGalleryPreviewModal(),
      renderChecklistNoteModal(),
      renderProductChatModal(),
    ].filter(Boolean)),
  );
}

function renderWorkspaceNextStageAction(product) {
  // Background syncs can be brief, but the primary stage action should never
  // disappear during one. Keep it visible and use the disabled state instead.
  if (!canManageProducts() || !getNextProductStageId(product)) return null;

  return createElement("div", { className: "workspace-next-stage-action" }, [
    createElement("button", {
      className: "button-primary workspace-next-stage-action__button",
      type: "button",
      dataAction: "move-product-next-stage",
      dataProductId: product.id,
      ariaLabel: `Move ${product.name} to the next stage`,
      disabled: !canMutateProductsNow(),
    }, "Move to the Next Stage"),
  ]);
}

function renderWorkspaceProductOverview(product) {
  const productDetails = getWorkspaceProductDetails(product.id);
  const imageUrl = getStorageAssetUrl(productDetails);
  const fileInputId = `product-image-upload-${product.id}`;
  const unreadChatCount = getUnreadProductChatCount(product.id);
  const productMutationDisabled = !canMutateProductsNow();

  return createElement("section", { className: "workspace-product-card", ariaLabel: `${product.name} overview` }, [
    createElement("button", { className: "workspace-product-card__export-icon", type: "button", dataAction: "export-product-data", dataProductId: product.id, title: `Export all ${product.name} stages`, ariaLabel: `Export all ${product.name} stages` }, [createIcon("download")]),
    createElement("div", { className: "workspace-product-card__media" }, [
      renderProductThumbnail(product, "workspace-product-card__image"),
      canManageProducts()
        ? createElement("div", { className: "workspace-product-card__image-actions" }, [
          createElement("input", {
            className: "workspace-product-card__file",
            id: fileInputId,
            type: "file",
            accept: PRODUCT_IMAGE_ACCEPT,
            dataAction: "upload-product-image",
            dataProductId: product.id,
            disabled: productMutationDisabled,
          }),
          createElement("label", { className: "workspace-product-card__upload", htmlFor: productMutationDisabled ? null : fileInputId, ariaDisabled: productMutationDisabled ? "true" : null }, imageUrl ? "Replace Image" : "Upload Image"),
          imageUrl
            ? createElement("button", { className: "workspace-product-card__delete", type: "button", dataAction: "delete-product-image", dataProductId: product.id, disabled: productMutationDisabled }, "Delete")
            : null,
        ].filter(Boolean))
        : null,
    ]),
    createElement("div", { className: "workspace-product-card__content" }, [
      createElement("div", { className: "workspace-product-card__summary" }, [
        createElement("div", { className: "workspace-product-card__identity" }, [
          createElement("h3", null, product.name),
          renderWorkspaceSkuRow(product),
          createElement("p", null, ["ASIN: ", renderAsinValue(product)]),
        ]),
        renderProductMetricCards(product),
      ]),
    ]),
    createElement("div", { className: "workspace-product-card__actions" }, [
      createElement("button", { className: "button-primary workspace-product-card__chat-button", type: "button", dataAction: "open-product-chat", dataProductId: product.id }, [
        createIcon("chat"),
        createElement("span", null, "Chat"),
        unreadChatCount > 0
          ? createElement("span", { className: "workspace-product-card__chat-badge", ariaLabel: `${unreadChatCount} unread chat messages` }, formatUnreadChatCount(unreadChatCount))
          : null,
      ]),
    ]),
  ]);
}

function renderWorkspaceSkuRow(product) {
  return createElement("p", { className: "workspace-product-card__sku-row" }, [
    createElement("span", null, "SKU: "),
    createElement("span", { className: "workspace-product-card__sku-value", title: product.sku || "N/A" }, product.sku || "N/A"),
    createElement("button", { className: "workspace-product-card__copy-sku", type: "button", dataAction: "copy-product-sku", dataProductId: product.id, ariaLabel: `Copy SKU for ${product.name}` }, [createIcon(uiState.copiedSkuProductId === product.id ? "check" : "content_copy")]),
    uiState.copiedSkuProductId === product.id ? createElement("span", { className: "workspace-product-card__copy-confirmation" }, "Copied") : null,
  ].filter(Boolean));
}

function renderProductMetricCards(product) {
  const sellingPrice = getProductSellingPrice(product);
  const cogs = getProductCogs(product);
  const profit = getProductProfit(product);
  const margin = getProductMargin(product);

  return createElement("div", { className: "workspace-product-card__metrics", dataProductId: product.id }, [
    renderEditableProductMetricCard(product, "Selling Price", sellingPrice, "sellingPrice"),
    renderCogsMetricCard(product, cogs),
    renderProductMetricCard("Profit Margin %", `${margin}%`, "margin"),
    renderProductMetricCard("Profit $", formatCurrency(profit), "profit"),
  ]);
}

function renderEditableProductMetricCard(product, label, value, metricKey) {
  return createElement("label", { className: "workspace-product-card__metric workspace-product-card__metric--editable" }, [
    createElement("span", null, label),
    createElement("input", {
      className: "workspace-product-card__metric-input",
      type: "number",
      step: "0.01",
      min: "0",
      value: Number(value).toFixed(2),
      dataAction: "update-product-financial",
      dataProductId: product.id,
      dataProductFinancialMetric: metricKey,
      ariaLabel: `${label} for ${product.name}`,
      disabled: !canEditProductFieldValues(),
    }),
  ]);
}

function renderProductMetricCard(label, value, outputKey = "") {
  return createElement("article", { className: "workspace-product-card__metric" }, [
    createElement("span", null, label),
    createElement("strong", outputKey ? { dataProductFinancialOutput: outputKey } : null, value),
  ]);
}

function renderCogsMetricCard(product, cogs) {
  return createElement("button", {
    className: "workspace-product-card__metric workspace-product-card__metric--cogs",
    type: "button",
    dataAction: "open-cogs-calculator",
    dataProductId: product.id,
    ariaLabel: `Open landed COGS calculator for ${product.name}`,
    disabled: !canEditProductFieldValues(),
  }, [
    createElement("span", null, "COGS"),
    createElement("strong", { dataProductFinancialOutput: "cogs" }, formatCurrency(cogs)),
    createElement("small", null, "View breakdown"),
  ]);
}

function renderCogsCalculatorModal() {
  const modal = uiState.cogsCalculatorModal;
  if (!modal) return null;
  const product = getProductById(modal.productId);
  if (!product) return null;

  const financials = getProductFinancials(product);
  const isSaving = Boolean(modal.saving) || Boolean(modal.templateSaving);

  return createElement("div", { className: "workspace-modal cogs-calculator-modal", role: "presentation" }, [
    createElement("section", {
      className: "workspace-modal__dialog workspace-modal__dialog--cogs",
      role: "dialog",
      ariaModal: "true",
      ariaLabelledby: "cogs-calculator-title",
    }, [
      createElement("div", { className: "workspace-modal__header cogs-calculator__header" }, [
        createElement("div", null, [
          createElement("span", { className: "cogs-calculator__eyebrow" }, "Landed COGS calculator"),
          createElement("h3", { id: "cogs-calculator-title" }, product.name),
          createElement("p", null, `SKU: ${product.sku || "N/A"}`),
        ]),
        createElement("button", {
          className: "workspace-modal__close",
          type: "button",
          dataAction: "close-cogs-calculator",
          ariaLabel: "Close landed COGS calculator",
          disabled: isSaving,
        }, [createIcon("close")]),
      ]),
      financials.cogsBatches.length === 0 && financials.cogs > 0
        ? createElement("p", { className: "cogs-calculator__legacy-note" }, [
          createIcon("info"),
          createElement("span", null, `The current ${formatCurrency(financials.cogs)} will remain unchanged until this landed COGS worksheet is saved.`),
        ])
        : null,
      renderSharedWorkspaceSaveNotice(),
      modal.notice ? createElement("p", { className: "cogs-calculator__notice", role: "status" }, modal.notice) : null,
      modal.templateEditMode ? renderInlineCogsTemplateEditor(modal, isSaving) : null,
      modal.draft && !modal.templateEditMode ? renderCogsBatchEditor(product, modal, isSaving) : null,
      modal.templateDeleteConfirmation
        ? renderCogsTemplateDeleteConfirmation(modal.templateDeleteConfirmation, modal.templateDraft, isSaving)
        : null,
      Number.isInteger(modal.noteCostIndex)
        ? renderCogsCostNoteEditor(modal.draft, modal.noteCostIndex, isSaving)
        : null,
    ].filter(Boolean)),
  ]);
}

function renderCogsSummaryValue(label, value) {
  return createElement("div", { className: "cogs-calculator__summary-item" }, [
    createElement("span", null, label),
    createElement("strong", null, value),
  ]);
}

function renderCogsOrderUnitsCard({ value, error = "", disabled = false }) {
  return createElement("label", {
    className: [
      "cogs-calculator__summary-item",
      "cogs-calculator__summary-item--input",
      error ? "cogs-form-field--error" : "",
    ].filter(Boolean).join(" "),
  }, [
    createElement("span", null, [
      createElement("span", null, "Total order units"),
      createElement("em", null, "Required"),
    ]),
    createElement("input", {
      type: "number",
      value: value ?? "",
      min: "1",
      step: "1",
      dataAction: "update-cogs-batch-draft",
      dataCogsField: "sellableUnits",
      ariaLabel: "Total order units",
      disabled,
    }),
    error ? renderCogsFieldError(error) : null,
  ].filter(Boolean));
}

function setCogsModalSuccessNotice(modal, message) {
  if (!modal) return;
  if (cogsModalNoticeTimeoutId) window.clearTimeout(cogsModalNoticeTimeoutId);
  modal.notice = message;
  cogsModalNoticeTimeoutId = window.setTimeout(() => {
    cogsModalNoticeTimeoutId = null;
    if (uiState.cogsCalculatorModal !== modal || modal.notice !== message) return;
    modal.notice = "";
    renderCogsCalculatorPreservingScroll();
  }, COGS_SUCCESS_NOTICE_DURATION_MS);
}

function renderCogsBatchEditor(product, modal, isSaving) {
  const draft = modal.draft;
  const errors = modal.errors ?? {};
  const total = calculateCogsBatchTotal(draft);
  const validation = validateCogsBatchDraft(draft);

  return createElement("form", {
    className: "cogs-batch-editor",
    dataAction: "save-cogs-batch",
    dataProductId: product.id,
  }, [
    createElement("div", { className: "cogs-batch-editor__header" }, [
      createElement("div", null, [
        createElement("span", { className: "cogs-calculator__eyebrow" }, "Product launch COGS"),
        createElement("h4", null, "Build the landed cost"),
      ]),
    ]),
    createElement("div", { className: "cogs-batch-editor__details" }, [
      renderCogsSummaryValue("Current COGS", formatCurrency(getProductCogs(product))),
      renderCogsOrderUnitsCard({
        value: draft.sellableUnits,
        error: errors.sellableUnits,
        disabled: isSaving,
      }),
    ]),
    createElement("div", { className: "cogs-cost-list" }, [
      createElement("div", { className: "cogs-cost-list__header" }, [
        createElement("div", null, [
          createElement("h5", null, "Landed-cost categories"),
          createElement("p", null, "Enter amounts only for the categories that apply. Blank rows are ignored."),
        ]),
        canManageCogsTemplate()
          ? createElement("button", {
            className: "cogs-calculator__icon-action",
            type: "button",
            dataAction: "toggle-cogs-template-mode",
            ariaLabel: "Edit the shared COGS template",
            title: "Edit the shared COGS template",
            disabled: isSaving,
          }, [createIcon("edit")])
          : null,
      ]),
      errors.costElements ? renderCogsFieldError(errors.costElements) : null,
      ...getCogsDraftGroups(draft).map((group) => renderCogsCostGroup(group, draft, errors, modal, isSaving)),
    ].filter(Boolean)),
    createElement("div", { className: "cogs-batch-editor__footer" }, [
      createElement("div", { className: "cogs-batch-editor__total-copy" }, [
        createElement("span", null, "Total landed COGS"),
        createElement("strong", { dataCogsBatchTotalOutput: "true" }, `${formatCurrency(total)} per unit`),
      ]),
      createElement("div", { className: "cogs-batch-editor__actions" }, [
        createElement("button", {
          className: "button-primary",
          type: "submit",
          disabled: isSaving || !validation.isValid,
        }, isSaving ? "Saving..." : "Save COGS"),
      ]),
    ]),
  ]);
}

function renderCogsCostGroup(group, draft, errors, modal, isSaving) {
  const rows = draft.costElements
    .map((costElement, index) => ({ costElement, index }))
    .filter(({ costElement }) => String(costElement.templateCategoryId || "legacy-costs") === group.id);
  const categoryTotal = rows.reduce(
    (total, { costElement }) => total + calculateCogsCostPerUnit(costElement, draft.sellableUnits),
    0,
  );
  const isExpanded = (modal.expandedCategoryIds ?? []).includes(group.id);
  const panelId = `cogs-category-panel-${group.id}`;

  return createElement("section", { className: "cogs-cost-group", ariaLabel: group.label }, [
    renderCogsCategoryToggle({
      categoryId: group.id,
      label: group.label,
      summaryText: `${formatCurrency(categoryTotal)} / unit`,
      categoryTotalOutputId: group.id,
      isExpanded,
      panelId,
    }),
    isExpanded
      ? createElement("div", {
        className: "cogs-cost-group__panel",
        id: panelId,
      }, [
        createElement("div", { className: "cogs-cost-table", role: "table", ariaLabel: `${group.label} landed costs` }, [
          createElement("div", { className: "cogs-cost-table__header", role: "row" }, [
            renderCogsCostColumnHeader("Expense name"),
            renderCogsCostColumnHeader("Amount"),
            renderCogsCostColumnHeader("Basis"),
            renderCogsCostColumnHeader("Cost / unit"),
            renderCogsCostColumnHeader("Actions"),
          ]),
          ...rows.map(({ costElement, index }) => renderCogsCostRow(
            costElement,
            index,
            draft.sellableUnits,
            errors,
            modal,
            isSaving,
          )),
        ]),
      ])
      : null,
  ].filter(Boolean));
}

function renderCogsCategoryToggle({
  categoryId,
  label,
  rowCount,
  summaryText = "",
  categoryTotalOutputId = "",
  isExpanded,
  panelId,
  showDragHandle = false,
  disabled = false,
}) {
  return createElement("button", {
    className: "cogs-cost-group__toggle",
    type: "button",
    dataAction: "toggle-cogs-category",
    dataCogsTemplateCategoryId: categoryId,
    ariaExpanded: isExpanded ? "true" : "false",
    ariaControls: panelId,
    ariaLabel: `${isExpanded ? "Collapse" : "Expand"} ${label}`,
    disabled,
  }, [
    createElement("span", { className: "cogs-cost-group__toggle-main" }, [
      showDragHandle
        ? createElement("span", { className: "cogs-template-drag-handle", ariaHidden: "true" }, [createIcon("drag_indicator")])
        : null,
      createElement("strong", null, label),
      summaryText
        ? createElement("span", {
          className: "cogs-cost-group__summary",
          dataCogsCategoryTotalOutput: categoryTotalOutputId,
        }, summaryText)
        : createElement("span", { className: "cogs-cost-group__row-count" }, `${rowCount} row${rowCount === 1 ? "" : "s"}`),
    ].filter(Boolean)),
    createIcon(isExpanded ? "expand_less" : "expand_more"),
  ]);
}

function getCogsDraftGroups(draft) {
  const groups = cogsTemplateSettings.categories.map((category) => ({ id: category.id, label: category.label }));
  const knownIds = new Set(groups.map((group) => group.id));
  const extraGroups = [];
  (draft?.costElements ?? []).forEach((costElement) => {
    const id = String(costElement.templateCategoryId || "legacy-costs");
    if (knownIds.has(id)) return;
    knownIds.add(id);
    extraGroups.push({ id, label: costElement.categoryLabel || "Existing extras" });
  });
  return [...groups, ...extraGroups];
}

function renderInlineCogsTemplateEditor(modal, isSaving) {
  const draft = modal.templateDraft ?? cloneCogsTemplateSettings(cogsTemplateSettings);
  const errors = modal.templateErrors ?? {};
  const rowCount = getCogsTemplateRows(draft).length;
  const templateCategoryIds = new Set(draft.categories.map((category) => category.id));
  const legacyGroups = modal.draft
    ? getCogsDraftGroups(modal.draft).filter((group) => !templateCategoryIds.has(group.id))
    : [];

  return createElement("section", {
    className: "cogs-template-inline",
    ariaLabel: "Edit shared COGS template",
  }, [
    createElement("div", { className: "cogs-template-inline__header" }, [
      createElement("div", null, [
        createElement("span", { className: "cogs-calculator__eyebrow" }, "Template edit mode"),
        createElement("h4", null, "Edit the shared COGS structure"),
        createElement("p", null, "Changes apply to COGS worksheets for every product and account. Existing populated values remain unchanged."),
      ]),
      createElement("div", { className: "cogs-template-manager__meta" }, [
        createElement("span", null, `${draft.categories.length} categor${draft.categories.length === 1 ? "y" : "ies"}`),
        createElement("span", null, `${rowCount} cost row${rowCount === 1 ? "" : "s"}`),
        draft.updatedAt ? createElement("span", null, `Last saved ${new Date(draft.updatedAt).toLocaleString()}`) : null,
        createElement("button", {
          className: "cogs-calculator__icon-action",
          type: "button",
          dataAction: "add-cogs-template-category",
          ariaLabel: "Add COGS category",
          title: "Add category",
          disabled: isSaving,
        }, [createIcon("add")]),
      ].filter(Boolean)),
    ]),
    modal.templateNotice
      ? createElement("p", {
        className: `cogs-template-manager__notice ${modal.templateSaving ? "cogs-template-manager__notice--saving" : ""}`.trim(),
        role: "status",
      }, modal.templateNotice)
      : null,
    errors.categories || errors.rows
      ? renderCogsFieldError(errors.categories || errors.rows)
      : null,
    createElement("div", { className: "cogs-template-manager__categories" }, [
      ...draft.categories.map((category, categoryIndex) => (
        renderCogsTemplateCategory(category, categoryIndex, draft, errors, modal, isSaving)
      )),
      ...legacyGroups.map((group) => renderReadonlyCogsTemplateGroup(group, modal, isSaving)),
    ]),
    createElement("div", { className: "cogs-template-manager__footer" }, [
      createElement("button", {
        className: "button-secondary",
        type: "button",
        dataAction: "cancel-cogs-template-edit",
        disabled: isSaving,
      }, "Cancel"),
      createElement("button", {
        className: "button-primary",
        type: "button",
        dataAction: "save-cogs-template",
        disabled: isSaving,
      }, modal.templateSaving ? "Saving template..." : "Save Template"),
    ]),
  ].filter(Boolean));
}

function renderCogsTemplateCategory(category, categoryIndex, draft, errors, modal, isSaving) {
  const isExpanded = (modal.expandedCategoryIds ?? []).includes(category.id);
  const panelId = `cogs-template-category-panel-${category.id}`;
  return createElement("section", {
    className: "cogs-template-category",
    draggable: !isSaving,
    dataAction: "drag-cogs-template-category",
    dataCogsTemplateCategoryId: category.id,
    dataCogsTemplateDropType: "category",
    dataCogsTemplateDropId: category.id,
  }, [
    renderCogsCategoryToggle({
      categoryId: category.id,
      label: category.label,
      rowCount: category.rows.length,
      isExpanded,
      panelId,
      showDragHandle: true,
      disabled: isSaving,
    }),
    isExpanded
      ? createElement("div", { className: "cogs-template-category__body", id: panelId }, [
        createElement("div", { className: "cogs-template-category__header" }, [
          createElement("label", { className: "cogs-template-manager__name-field" }, [
            createElement("span", null, "Category name"),
            createElement("input", {
              type: "text",
              value: category.label,
              dataAction: "update-cogs-template-category",
              dataCogsTemplateCategoryId: category.id,
              ariaLabel: `Category ${categoryIndex + 1} name`,
              disabled: isSaving,
            }),
            errors[`categories.${categoryIndex}.label`] ? renderCogsFieldError(errors[`categories.${categoryIndex}.label`]) : null,
          ].filter(Boolean)),
          createElement("button", {
            className: "cogs-template-manager__delete",
            type: "button",
            dataAction: "request-delete-cogs-template-category",
            dataCogsTemplateCategoryId: category.id,
            ariaLabel: `Delete ${category.label}`,
            disabled: isSaving,
          }, [createIcon("delete"), createElement("span", null, "Delete")]),
        ]),
        createElement("div", { className: "cogs-template-category__rows" }, category.rows.map((row, rowIndex) => (
          renderCogsTemplateRow(row, rowIndex, category, categoryIndex, errors, modal, isSaving)
        ))),
        createElement("button", {
          className: "cogs-template-category__add-row",
          type: "button",
          dataAction: "add-cogs-template-row",
          dataCogsTemplateCategoryId: category.id,
          ariaLabel: `Add cost row to ${category.label}`,
          title: `Add cost row to ${category.label}`,
          disabled: isSaving,
        }, [createIcon("add")]),
      ])
      : null,
  ].filter(Boolean));
}

function renderReadonlyCogsTemplateGroup(group, modal, isSaving) {
  const rows = (modal.draft?.costElements ?? []).filter((costElement) => (
    String(costElement.templateCategoryId || "legacy-costs") === group.id
  ));
  const isExpanded = (modal.expandedCategoryIds ?? []).includes(group.id);
  const panelId = `cogs-template-legacy-panel-${group.id}`;

  return createElement("section", { className: "cogs-template-category cogs-template-category--readonly" }, [
    renderCogsCategoryToggle({
      categoryId: group.id,
      label: group.label,
      rowCount: rows.length,
      isExpanded,
      panelId,
      disabled: isSaving,
    }),
    isExpanded
      ? createElement("div", { className: "cogs-template-category__body", id: panelId }, [
        createElement("p", { className: "cogs-template-category__readonly-note" }, "Existing entries are read-only and remain attached to the product COGS worksheet."),
        createElement("div", { className: "cogs-template-category__rows" }, rows.map((row) => (
          createElement("article", { className: "cogs-template-row cogs-template-row--readonly" }, [
            createElement("strong", null, row.customName || row.rowLabel || "Existing cost"),
            createElement("span", null, row.legacyRemoved ? "Removed from template" : "Existing extra"),
          ])
        ))),
      ])
      : null,
  ].filter(Boolean));
}

function renderCogsTemplateRow(row, rowIndex, category, categoryIndex, errors, modal, isSaving) {
  const prefix = `categories.${categoryIndex}.rows.${rowIndex}`;
  const costIndex = modal.draft?.costElements.findIndex((costElement) => costElement.templateRowId === row.id) ?? -1;
  const costElement = costIndex >= 0 ? modal.draft.costElements[costIndex] : null;
  const perUnitCost = costElement
    ? calculateCogsCostPerUnit(costElement, modal.draft.sellableUnits)
    : null;
  return createElement("article", {
    className: "cogs-template-row",
    draggable: !isSaving,
    dataAction: "drag-cogs-template-row",
    dataCogsTemplateRowId: row.id,
    dataCogsTemplateCategoryId: category.id,
    dataCogsTemplateDropType: "row",
    dataCogsTemplateDropId: row.id,
  }, [
    createElement("span", { className: "cogs-template-drag-handle", ariaHidden: "true" }, [createIcon("drag_indicator")]),
    createElement("label", { className: "cogs-template-manager__name-field" }, [
      createElement("span", null, "Cost name"),
      createElement("input", {
        type: "text",
        value: row.label,
        dataAction: "update-cogs-template-row",
        dataCogsTemplateRowId: row.id,
        dataCogsTemplateField: "label",
        ariaLabel: `${row.label} cost row name`,
        disabled: isSaving,
      }),
      errors[`${prefix}.label`] ? renderCogsFieldError(errors[`${prefix}.label`]) : null,
    ].filter(Boolean)),
    createElement("label", { className: "cogs-template-manager__amount-field cogs-template-row__amount" }, [
      createElement("span", null, "Amount"),
      createElement("input", {
        type: "number",
        min: "0",
        step: "0.000001",
        value: costElement?.amountPaid ?? "",
        placeholder: costElement ? "0.00" : "\u2014",
        dataAction: costElement ? "update-cogs-cost-draft" : null,
        dataCogsField: costElement ? "amountPaid" : null,
        dataCogsCostIndex: costElement ? String(costIndex) : null,
        ariaLabel: `${row.label} amount`,
        title: costElement ? "This amount belongs to the open COGS worksheet." : "Open a COGS worksheet to enter an amount.",
        disabled: isSaving || !costElement,
      }),
      costElement && modal.errors?.[`costElements.${costIndex}.amountPaid`]
        ? renderCogsFieldError(modal.errors[`costElements.${costIndex}.amountPaid`])
        : null,
    ].filter(Boolean)),
    createElement("div", { className: "cogs-template-row__unit-output" }, [
      createElement("span", null, "Per unit"),
      createElement("strong", {
        dataCogsTemplateUnitOutput: costElement ? String(costIndex) : null,
      }, perUnitCost === null ? "\u2014" : formatCurrency(perUnitCost)),
    ]),
    createElement("button", {
      className: "cogs-template-manager__delete",
      type: "button",
      dataAction: "request-delete-cogs-template-row",
      dataCogsTemplateRowId: row.id,
      ariaLabel: `Delete ${row.label}`,
      disabled: isSaving,
    }, [createIcon("delete")]),
  ]);
}

function renderCogsTemplateDeleteConfirmation(confirmation, draft, isSaving) {
  const isCategory = confirmation.type === "category";
  const isDeleting = Boolean(confirmation.deleting);
  const match = isCategory
    ? draft.categories.find((category) => category.id === confirmation.id)
    : findCogsTemplateRow(draft, confirmation.id)?.row;
  const label = match?.label || (isCategory ? "this category" : "this cost row");
  const removedRowCount = isCategory && match && Array.isArray(match.rows) ? match.rows.length : 1;
  return createElement("div", {
    className: "cogs-delete-confirmation",
    role: "alertdialog",
    ariaModal: "true",
    ariaLabelledby: "cogs-template-delete-title",
  }, [
    createElement("div", { className: "cogs-delete-confirmation__card" }, [
      createElement("h4", { id: "cogs-template-delete-title" }, `Delete ${isCategory ? "category" : "cost row"}?`),
      isCategory
        ? createElement("strong", { className: "cogs-template-delete__row-count" }, `${removedRowCount} cost row${removedRowCount === 1 ? "" : "s"} will be removed from future blank forms.`)
        : null,
      createElement("p", null, `Delete “${label}” from the shared template? Existing populated worksheet values will remain available.`),
      createElement("div", { className: "cogs-delete-confirmation__actions" }, [
        createElement("button", {
          className: "button-secondary",
          type: "button",
          dataAction: "cancel-delete-cogs-template-item",
          disabled: isSaving || isDeleting,
        }, "Cancel"),
        createElement("button", {
          className: "cogs-delete-confirmation__delete",
          type: "button",
          dataAction: "confirm-delete-cogs-template-item",
          disabled: isSaving || isDeleting,
        }, isDeleting
          ? [renderActionSpinner("cogs-delete-confirmation__spinner"), createElement("span", null, "Deleting...")]
          : [createIcon("delete"), createElement("span", null, "Delete")]),
      ]),
    ]),
  ]);
}

function renderCogsCostColumnHeader(label) {
  return createElement("span", { role: "columnheader" }, label);
}

function renderCogsDraftField({ label, field, value, type = "text", placeholder = "", min = null, step = null, required = false, error = "", disabled = false }) {
  return createElement("label", { className: `cogs-form-field ${error ? "cogs-form-field--error" : ""}`.trim() }, [
    createElement("span", null, [label, required ? createElement("em", null, "Required") : null].filter(Boolean)),
    createElement("input", {
      type,
      value: value ?? "",
      placeholder,
      min,
      step,
      dataAction: "update-cogs-batch-draft",
      dataCogsField: field,
      ariaLabel: label,
      disabled,
    }),
    error ? renderCogsFieldError(error) : null,
  ].filter(Boolean));
}

function renderCogsCostRow(costElement, index, batchUnits, errors, modal, isSaving) {
  const prefix = `costElements.${index}`;
  const category = getCogsCostCategory(costElement.category);
  const costPerUnit = calculateCogsCostPerUnit(costElement, batchUnits);
  const rowLabel = costElement.rowLabel || category.label;
  const isActive = isCogsCostElementActive(costElement, batchUnits);
  const hasNote = Boolean(String(costElement.notes ?? "").trim());
  const rowHasError = Object.keys(errors).some((errorKey) => errorKey.startsWith(`${prefix}.`));

  return createElement("div", {
    className: [
      "cogs-cost-row",
      isActive ? "cogs-cost-row--active" : "",
      costElement.legacyDuplicate ? "cogs-cost-row--legacy" : "",
      rowHasError ? "cogs-cost-row--error" : "",
    ].filter(Boolean).join(" "),
    role: "row",
  }, [
    createElement("div", { className: "cogs-cost-row__category", role: "cell" }, [
      createElement("strong", null, costElement.customName || rowLabel),
      costElement.customName ? createElement("small", null, rowLabel) : null,
      costElement.legacyDuplicate || costElement.legacyRemoved
        ? createElement("span", { className: "cogs-cost-row__legacy-badge" }, costElement.legacyRemoved ? "Removed from template" : "Existing extra")
        : null,
    ].filter(Boolean)),
    renderCogsCompactInput("Amount", "amountPaid", costElement.amountPaid, index, {
      type: "number",
      min: "0",
      step: "0.000001",
      error: errors[`${prefix}.amountPaid`],
      disabled: isSaving,
      placeholder: "0.00",
    }),
    renderCogsCompactSelect("Basis", "entryBasis", costElement.entryBasis, COGS_ENTRY_BASES, index, {
      disabled: isSaving,
    }),
    createElement("div", { className: "cogs-cost-row__unit-cost", role: "cell" }, [
      createElement("span", { className: "cogs-cost-row__mobile-label" }, "Cost / unit"),
      createElement("strong", { dataCogsCostOutput: String(index) }, formatCurrency(costPerUnit)),
    ]),
    createElement("div", { className: "cogs-cost-row__actions", role: "cell" }, [
      createElement("button", {
        className: `cogs-cost-row__note-button ${hasNote ? "cogs-cost-row__note-button--populated" : ""}`.trim(),
        type: "button",
        dataAction: "open-cogs-cost-note",
        dataCogsCostIndex: String(index),
        ariaLabel: `${hasNote ? "Edit" : "Add"} note for ${costElement.customName || rowLabel}`,
        title: `${hasNote ? "Edit" : "Add"} note`,
        disabled: isSaving,
      }, [createIcon(hasNote ? "sticky_note_2" : "note_add")]),
      isActive
        ? createElement("button", {
          className: "cogs-cost-row__clear",
          type: "button",
          dataAction: "clear-cogs-cost-row",
          dataCogsCostIndex: String(index),
          ariaLabel: `Clear ${rowLabel}`,
          disabled: isSaving,
        }, [createIcon("close"), createElement("span", null, costElement.legacyDuplicate ? "Remove" : "Clear")])
        : null,
    ]),
  ]);
}

function renderCogsCompactSelect(label, field, value, options, index, { error = "", disabled = false } = {}) {
  return createElement("label", { className: `cogs-cost-row__field ${error ? "cogs-form-field--error" : ""}`.trim(), role: "cell" }, [
    createElement("span", { className: "cogs-cost-row__mobile-label" }, label),
    createElement("select", {
      dataAction: "update-cogs-cost-draft",
      dataCogsField: field,
      dataCogsCostIndex: String(index),
      disabled,
      ariaLabel: label,
    }, options.map((option) => createElement("option", { value: option.value, selected: option.value === value }, option.label))),
    error ? renderCogsFieldError(error) : null,
  ].filter(Boolean));
}

function renderCogsCompactInput(label, field, value, index, options = {}) {
  const {
    type = "text",
    placeholder = "",
    min = null,
    step = null,
    maxlength = null,
    error = "",
    disabled = false,
  } = options;
  return createElement("label", { className: `cogs-cost-row__field ${error ? "cogs-form-field--error" : ""}`.trim(), role: "cell" }, [
    createElement("span", { className: "cogs-cost-row__mobile-label" }, label),
    createElement("input", {
      type,
      value: value ?? "",
      placeholder,
      min,
      step,
      maxlength,
      dataAction: "update-cogs-cost-draft",
      dataCogsField: field,
      dataCogsCostIndex: String(index),
      ariaLabel: label,
      disabled,
    }),
    error ? renderCogsFieldError(error) : null,
  ].filter(Boolean));
}

function renderCogsCostInput(label, field, value, index, options = {}) {
  const { type = "text", placeholder = "", min = null, step = null, maxlength = null, required = false, error = "", disabled = false, hint = "", className = "" } = options;
  return createElement("label", { className: `cogs-form-field ${className} ${error ? "cogs-form-field--error" : ""}`.trim() }, [
    createElement("span", null, [label, required ? createElement("em", null, "Required") : null].filter(Boolean)),
    createElement("input", {
      type,
      value: value ?? "",
      placeholder,
      min,
      step,
      maxlength,
      dataAction: "update-cogs-cost-draft",
      dataCogsField: field,
      dataCogsCostIndex: String(index),
      ariaLabel: label,
      disabled,
    }),
    hint ? createElement("small", null, hint) : null,
    error ? renderCogsFieldError(error) : null,
  ].filter(Boolean));
}

function renderCogsCostTextarea(label, field, value, index, disabled) {
  return createElement("label", { className: "cogs-form-field cogs-cost-row__field--wide" }, [
    createElement("span", null, label),
    createElement("textarea", {
      rows: "2",
      dataAction: "update-cogs-cost-draft",
      dataCogsField: field,
      dataCogsCostIndex: String(index),
      ariaLabel: label,
      disabled,
      value: value ?? "",
      placeholder: "Optional notes",
    }),
  ]);
}

function renderCogsCostNoteEditor(draft, index, isSaving) {
  const costElement = draft?.costElements?.[index];
  if (!costElement) return null;
  const category = getCogsCostCategory(costElement.category);
  const rowLabel = costElement.customName || costElement.rowLabel || category.label;
  const prefix = `costElements.${index}`;
  const errors = uiState.cogsCalculatorModal?.errors ?? {};

  return createElement("div", { className: "cogs-note-editor", role: "presentation" }, [
    createElement("section", {
      className: "cogs-note-editor__card",
      role: "dialog",
      ariaModal: "true",
      ariaLabelledby: "cogs-note-editor-title",
    }, [
      createElement("div", { className: "cogs-note-editor__header" }, [
        createElement("div", null, [
          createElement("span", { className: "cogs-calculator__eyebrow" }, "Cost row note"),
          createElement("h4", { id: "cogs-note-editor-title" }, rowLabel),
        ]),
        createElement("button", {
          className: "workspace-modal__close",
          type: "button",
          dataAction: "close-cogs-cost-note",
          ariaLabel: "Close cost row note",
          disabled: isSaving,
        }, [createIcon("close")]),
      ]),
      costElement.requiresCustomName
        ? renderCogsCostInput("Custom cost name", "customName", costElement.customName, index, {
          required: isCogsCostElementActive(costElement, draft.sellableUnits),
          error: errors[`${prefix}.customName`],
          placeholder: "Example: Port documentation",
          disabled: isSaving,
        })
        : null,
      renderCogsCostTextarea("Note", "notes", costElement.notes, index, isSaving),
      createElement("p", { className: "cogs-note-editor__hint" }, "This note will be saved with the product COGS worksheet."),
      createElement("div", { className: "cogs-note-editor__actions" }, [
        createElement("button", {
          className: "button-primary",
          type: "button",
          dataAction: "close-cogs-cost-note",
          disabled: isSaving,
        }, "Done"),
      ]),
    ].filter(Boolean)),
  ]);
}

function renderCogsFieldError(message) {
  return createElement("small", { className: "cogs-form-field__error", role: "alert" }, message);
}

function openCogsCalculator(productId) {
  const product = getProductById(productId);
  if (!product) return;
  const batches = normalizeCogsBatches(getProductFinancials(product).cogsBatches);
  const currentWorksheet = getLatestCogsBatch(batches);
  uiState.cogsCalculatorModal = {
    productId,
    draft: currentWorksheet ? createCogsBatchDraftFromSaved(currentWorksheet) : createNewCogsBatchDraft(),
    errors: {},
    expandedCostIds: [],
    expandedCategoryIds: [],
    noteCostIndex: null,
    saving: false,
    notice: "",
    templateEditMode: false,
    templateDraft: null,
    templateErrors: {},
    templateNotice: "",
    templateSaving: false,
    templateDeleteConfirmation: null,
  };
}

function createNewCogsBatchDraft() {
  return createBlankCogsBatchDraft({
    id: createLocalEntryId("cogs_batch"),
    effectiveDate: getLocalIsoDate(),
    costElementId: createLocalEntryId("cogs_cost"),
    templateSettings: cogsTemplateSettings,
  });
}

function createCogsBatchDraftFromSaved(batch) {
  return hydrateCogsBatchDraft(batch, {
    idPrefix: createLocalEntryId("cogs_cost"),
    templateSettings: cogsTemplateSettings,
  });
}

function updateCogsBatchDraftFromInput(input) {
  const modal = uiState.cogsCalculatorModal;
  const draft = modal?.draft;
  const field = input.getAttribute("data-cogs-field");
  if (!draft || field !== "sellableUnits" || !("value" in input)) return;

  draft[field] = input.value;
  draft.costElements = draft.costElements.map((costElement) => ({
    ...costElement,
    unitsCovered: input.value,
  }));
  delete modal.errors?.[field];
}

function updateCogsCostDraftFromInput(input) {
  const modal = uiState.cogsCalculatorModal;
  const draft = modal?.draft;
  const index = Number(input.getAttribute("data-cogs-cost-index"));
  const field = input.getAttribute("data-cogs-field");
  const allowedFields = ["category", "customName", "provider", "entryBasis", "amountPaid", "notes"];
  if (!draft || !Number.isInteger(index) || index < 0 || index >= draft.costElements.length || !allowedFields.includes(field) || !("value" in input)) return;

  draft.costElements[index] = {
    ...draft.costElements[index],
    [field]: input.value,
  };
  delete modal.errors?.[`costElements.${index}.${field}`];
}

function updateCogsCalculatorPreview() {
  const modal = uiState.cogsCalculatorModal;
  const modalElement = document.querySelector(".cogs-calculator-modal");
  if (!modal?.draft || !modalElement) return;
  modal.draft.costElements.forEach((costElement, index) => {
    const output = modalElement.querySelector(`[data-cogs-cost-output="${index}"]`);
    if (output) output.textContent = formatCurrency(calculateCogsCostPerUnit(costElement, modal.draft.sellableUnits));
    const templateUnitOutput = modalElement.querySelector(`[data-cogs-template-unit-output="${index}"]`);
    if (templateUnitOutput) {
      templateUnitOutput.textContent = formatCurrency(calculateCogsCostPerUnit(costElement, modal.draft.sellableUnits));
    }
  });
  modalElement.querySelectorAll("[data-cogs-category-total-output]").forEach((output) => {
    const categoryId = output.getAttribute("data-cogs-category-total-output");
    const categoryTotal = modal.draft.costElements
      .filter((costElement) => String(costElement.templateCategoryId || "legacy-costs") === categoryId)
      .reduce(
        (total, costElement) => total + calculateCogsCostPerUnit(costElement, modal.draft.sellableUnits),
        0,
      );
    output.textContent = `${formatCurrency(categoryTotal)} / unit`;
  });
  const total = calculateCogsBatchTotal(modal.draft);
  modalElement.querySelectorAll("[data-cogs-batch-total-output]").forEach((output) => {
    output.textContent = output.classList.contains("cogs-batch-editor__live-total")
      ? `${formatCurrency(total)} / unit`
      : `${formatCurrency(total)} per unit`;
  });
}

function openCogsCostNote(index) {
  const modal = uiState.cogsCalculatorModal;
  const costElement = modal?.draft?.costElements?.[index];
  if (!modal || !costElement || modal.saving) return;
  modal.noteCostIndex = index;
}

function clearCogsCostRow(index) {
  const modal = uiState.cogsCalculatorModal;
  if (!modal?.draft || modal.saving || !Number.isInteger(index) || index < 0 || index >= modal.draft.costElements.length) return;
  const currentCostElement = modal.draft.costElements[index];
  if (currentCostElement.legacyDuplicate) {
    modal.draft.costElements.splice(index, 1);
  } else {
    modal.draft.costElements[index] = resetCogsCostElement(currentCostElement, modal.draft.sellableUnits, cogsTemplateSettings);
  }
  modal.expandedCostIds = (modal.expandedCostIds ?? []).filter((id) => id !== currentCostElement.id);
  modal.errors = {};
}

function enterCogsTemplateEditMode() {
  const modal = uiState.cogsCalculatorModal;
  if (!modal || !canManageCogsTemplate() || modal.saving || modal.templateSaving) return;
  modal.templateEditMode = true;
  modal.templateDraft = cloneCogsTemplateSettings(cogsTemplateSettings);
  modal.templateErrors = {};
  modal.templateNotice = "";
  modal.templateSaving = false;
  modal.templateDeleteConfirmation = null;
}

function cancelCogsTemplateEditMode() {
  const modal = uiState.cogsCalculatorModal;
  if (!modal || modal.templateSaving) return;
  modal.templateEditMode = false;
  modal.templateDraft = null;
  modal.templateErrors = {};
  modal.templateNotice = "";
  modal.templateDeleteConfirmation = null;
}

function toggleCogsTemplateEditMode() {
  const modal = uiState.cogsCalculatorModal;
  if (!modal || !canManageCogsTemplate() || modal.saving || modal.templateSaving) return;
  if (modal.templateEditMode) cancelCogsTemplateEditMode();
  else enterCogsTemplateEditMode();
}

function toggleCogsCategory(categoryId) {
  const modal = uiState.cogsCalculatorModal;
  if (!modal || !categoryId || modal.saving || modal.templateSaving) return;
  const expandedCategoryIds = new Set(modal.expandedCategoryIds ?? []);
  if (expandedCategoryIds.has(categoryId)) expandedCategoryIds.delete(categoryId);
  else expandedCategoryIds.add(categoryId);
  modal.expandedCategoryIds = Array.from(expandedCategoryIds);
}

function updateCogsTemplateCategoryFromInput(input) {
  const modal = uiState.cogsCalculatorModal;
  const categoryId = input.getAttribute("data-cogs-template-category-id");
  if (!modal?.templateDraft || !categoryId || !("value" in input)) return;
  modal.templateDraft = renameCogsTemplateCategory(modal.templateDraft, categoryId, input.value);
  modal.templateErrors = validateCogsTemplateSettings(modal.templateDraft).errors;
}

function updateCogsTemplateRowFromInput(input) {
  const modal = uiState.cogsCalculatorModal;
  const rowId = input.getAttribute("data-cogs-template-row-id");
  const field = input.getAttribute("data-cogs-template-field");
  if (!modal?.templateDraft || !rowId || !["label", "defaultEntryBasis"].includes(field) || !("value" in input)) return;
  modal.templateDraft = updateCogsTemplateRow(modal.templateDraft, rowId, { [field]: input.value });
  modal.templateErrors = validateCogsTemplateSettings(modal.templateDraft).errors;
}

function addCogsTemplateCategoryToDraft() {
  const modal = uiState.cogsCalculatorModal;
  if (!modal?.templateEditMode || !modal.templateDraft) return;
  const next = addCogsTemplateCategory(modal.templateDraft);
  const categoryId = next.categories.at(-1)?.id;
  modal.templateDraft = categoryId
    ? addCogsTemplateRow(next, categoryId, { label: "New Row", defaultEntryBasis: "batch-total" })
    : next;
  if (categoryId) {
    modal.expandedCategoryIds = Array.from(new Set([...(modal.expandedCategoryIds ?? []), categoryId]));
  }
  modal.templateErrors = validateCogsTemplateSettings(modal.templateDraft).errors;
}

function addCogsTemplateRowToDraft(categoryId) {
  const modal = uiState.cogsCalculatorModal;
  if (!modal?.templateEditMode || !modal.templateDraft || !categoryId) return "";
  const next = addCogsTemplateRow(modal.templateDraft, categoryId, {
    label: "New Row",
    defaultEntryBasis: "batch-total",
  });
  const rowId = next.categories.find((category) => category.id === categoryId)?.rows.at(-1)?.id ?? "";
  modal.templateDraft = next;
  modal.expandedCategoryIds = Array.from(new Set([...(modal.expandedCategoryIds ?? []), categoryId]));
  modal.templateErrors = validateCogsTemplateSettings(modal.templateDraft).errors;
  return rowId;
}

function restoreAddedCogsTemplateRowPosition({ categoryId, rowId, anchorOffset }) {
  const dialog = document.querySelector(".workspace-modal__dialog--cogs");
  if (!(dialog instanceof HTMLElement)) return;

  const nextAddRowButton = Array.from(dialog.querySelectorAll('[data-action="add-cogs-template-row"]'))
    .find((button) => button.getAttribute("data-cogs-template-category-id") === categoryId);
  if (nextAddRowButton instanceof HTMLElement && Number.isFinite(anchorOffset)) {
    const nextOffset = nextAddRowButton.getBoundingClientRect().top - dialog.getBoundingClientRect().top;
    dialog.scrollTop += nextOffset - anchorOffset;
  }

  const rowNameInput = Array.from(dialog.querySelectorAll('[data-action="update-cogs-template-row"]'))
    .find((input) => (
      input.getAttribute("data-cogs-template-row-id") === rowId
      && input.getAttribute("data-cogs-template-field") === "label"
    ));
  if (rowNameInput instanceof HTMLInputElement) {
    rowNameInput.focus({ preventScroll: true });
    rowNameInput.select();
  }
}

function requestDeleteCogsTemplateItem(type, id) {
  const modal = uiState.cogsCalculatorModal;
  if (!modal?.templateDraft || !["category", "row"].includes(type) || !id) return;
  modal.templateDeleteConfirmation = { type, id };
  modal.templateNotice = "";
}

async function confirmDeleteCogsTemplateItem() {
  const modal = uiState.cogsCalculatorModal;
  const confirmation = modal?.templateDeleteConfirmation;
  if (!modal?.templateDraft || !confirmation || modal.templateSaving || confirmation.deleting) return;
  const match = confirmation.type === "category"
    ? modal.templateDraft.categories.find((category) => category.id === confirmation.id)
    : findCogsTemplateRow(modal.templateDraft, confirmation.id)?.row;
  const itemLabel = match?.label || (confirmation.type === "category" ? "COGS category" : "cost row");
  try {
    modal.templateDraft = confirmation.type === "category"
      ? deleteCogsTemplateCategory(modal.templateDraft, confirmation.id)
      : deleteCogsTemplateRow(modal.templateDraft, confirmation.id);
    if (confirmation.type === "category") {
      modal.expandedCategoryIds = (modal.expandedCategoryIds ?? []).filter((id) => id !== confirmation.id);
    }
    modal.templateErrors = validateCogsTemplateSettings(modal.templateDraft).errors;
    modal.templateDeleteConfirmation = { ...confirmation, deleting: true };
    modal.templateNotice = `Deleting “${itemLabel}”...`;
    await saveCogsTemplateDraft({
      savingNotice: `Deleting “${itemLabel}”...`,
      savedNotice: "COGS template item deleted.",
      modalSuccessNotice: `“${itemLabel}” deleted successfully.`,
    });
  } catch (error) {
    if (modal.templateDeleteConfirmation) {
      modal.templateDeleteConfirmation = { ...confirmation, deleting: false };
    }
    if (!modal.templateNotice || !modal.templateNotice.includes("failed")) {
      modal.templateNotice = `Delete failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    renderCogsCalculatorPreservingScroll();
    throw error;
  }
}

async function saveCogsTemplateDraft({
  savingNotice = "Saving shared COGS template...",
  savedNotice = "COGS template saved",
  modalSuccessNotice = "COGS template updated across the workspace.",
} = {}) {
  const modal = uiState.cogsCalculatorModal;
  if (!modal?.templateDraft || !canManageCogsTemplate() || modal.templateSaving) return;
  const validation = validateCogsTemplateSettings(modal.templateDraft);
  if (!validation.isValid) {
    modal.templateErrors = validation.errors;
    modal.templateNotice = "Fix the highlighted template fields before saving.";
    renderCogsCalculatorPreservingScroll();
    return;
  }

  const currentUser = getCurrentTeamUser();
  const previousSettings = cloneCogsTemplateSettings(cogsTemplateSettings);
  const previousRemoteWorkspaceDirty = remoteWorkspaceDirty;
  const previousRemoteWorkspaceDirtyKeys = new Set(remoteWorkspaceDirtyKeys);
  const nextSettings = normalizeCogsTemplateSettings({
    ...modal.templateDraft,
    updatedAt: new Date().toISOString(),
    updatedBy: currentUser?.email ?? authSession?.email ?? "Workspace admin",
  });
  modal.templateSaving = true;
  modal.templateNotice = savingNotice;
  modal.templateErrors = {};
  setCogsTemplateSettings(nextSettings, { queueSync: false });
  renderFromCurrentStatePreservingScroll();
  try {
    await saveSharedWorkspaceNow("cogs-template-save", {
      savingNotice,
      savedNotice,
      retryOnConflict: false,
    });
    if (modal.draft) {
      modal.draft = reconcileCogsBatchDraftWithTemplate(modal.draft, nextSettings, {
        idPrefix: createLocalEntryId("cogs_cost"),
        preserveUnmatchedBlankRows: false,
      });
    }
    modal.templateDraft = cloneCogsTemplateSettings(nextSettings);
    modal.templateSaving = false;
    modal.templateNotice = "Template saved. Product COGS worksheets now use this structure.";
    modal.templateEditMode = false;
    modal.templateDraft = null;
    modal.templateErrors = {};
    modal.templateDeleteConfirmation = null;
    setCogsModalSuccessNotice(modal, modalSuccessNotice);
  } catch (error) {
    const latestRemoteTemplate = isSharedWorkspaceConflictError(error)
      ? error.payload?.state?.cogsTemplateSettings
      : null;
    setCogsTemplateSettings(latestRemoteTemplate || previousSettings, { queueSync: false, markDirty: false });
    remoteWorkspaceDirty = previousRemoteWorkspaceDirty;
    remoteWorkspaceDirtyKeys = previousRemoteWorkspaceDirtyKeys;
    modal.templateSaving = false;
    modal.templateNotice = isSharedWorkspaceConflictError(error)
      ? "A newer COGS template was saved in another session. Your draft is still open. Cancel to load the latest template, then reapply your changes."
      : `Template save failed: ${error instanceof Error ? error.message : String(error)}`;
    throw error;
  } finally {
    renderFromCurrentStatePreservingScroll();
  }
}

function expandCogsRowsWithErrors(modal, errors) {
  if (!modal?.draft) return;
  const expandedCostIds = new Set(modal.expandedCostIds ?? []);
  const expandedCategoryIds = new Set(modal.expandedCategoryIds ?? []);
  Object.keys(errors ?? {}).forEach((errorKey) => {
    const match = /^costElements\.(\d+)\./.exec(errorKey);
    if (!match) return;
    const costElement = modal.draft.costElements[Number(match[1])];
    if (costElement?.id) {
      expandedCostIds.add(costElement.id);
      expandedCategoryIds.add(String(costElement.templateCategoryId || "legacy-costs"));
    }
  });
  modal.expandedCostIds = Array.from(expandedCostIds);
  modal.expandedCategoryIds = Array.from(expandedCategoryIds);
}

async function saveCogsBatchForm(form) {
  const modal = uiState.cogsCalculatorModal;
  const productId = form.getAttribute("data-product-id");
  const product = modal && modal.productId === productId ? getProductById(productId) : null;
  if (!modal?.draft || !product || modal.saving) return;

  const validation = validateCogsBatchDraft(modal.draft);
  if (!validation.isValid) {
    modal.errors = validation.errors;
    expandCogsRowsWithErrors(modal, validation.errors);
    modal.notice = "Review the highlighted fields before saving.";
    renderFromCurrentStatePreservingScroll();
    return;
  }

  const currentFinancials = getProductFinancials(product);
  const existingBatch = getLatestCogsBatch(currentFinancials.cogsBatches);
  const now = new Date().toISOString();
  const savedBatch = normalizeCogsBatch({
    ...modal.draft,
    id: existingBatch?.id || modal.draft.id || createLocalEntryId("cogs_worksheet"),
    name: "",
    effectiveDate: existingBatch?.effectiveDate || getLocalIsoDate(),
    marketplaceCurrency: COGS_MARKETPLACE_CURRENCY,
    costElements: modal.draft.costElements.map((costElement) => ({
      ...costElement,
      paymentCurrency: COGS_MARKETPLACE_CURRENCY,
      exchangeRate: "1",
      unitsCovered: modal.draft.sellableUnits,
    })),
    createdAt: existingBatch?.createdAt || modal.draft.createdAt || now,
    updatedAt: now,
  }, { now });
  const nextBatches = [savedBatch];
  const nextFinancials = {
    ...currentFinancials,
    legacyCogs: currentFinancials.cogsBatches.length > 0
      ? currentFinancials.legacyCogs
      : currentFinancials.cogs,
    cogsBatches: nextBatches,
    cogs: savedBatch.totalCogsPerUnit,
  };

  modal.saving = true;
  modal.errors = {};
  modal.notice = "";
  setProductFinancials(productId, nextFinancials);
  renderCogsCalculatorPreservingScroll();
  try {
    await saveSharedWorkspaceNow("product-cogs-save", {
      savingNotice: "Saving landed COGS...",
      savedNotice: `COGS saved successfully. Current COGS is ${formatCurrency(savedBatch.totalCogsPerUnit)}.`,
      requireProductIds: [productId],
      preserveCogsScroll: true,
    });
    if (uiState.cogsCalculatorModal?.productId === productId) {
      uiState.cogsCalculatorModal = null;
    }
    recordActivity({
      icon: "payments",
      label: existingBatch ? "Updated landed COGS" : "Added landed COGS",
      detail: product.name,
      productId,
    });
  } catch (error) {
    if (uiState.cogsCalculatorModal?.productId === productId) uiState.cogsCalculatorModal.saving = false;
    throw error;
  }
  renderFromCurrentState();
}

function setProductFinancials(productId, financials) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.financials = normalizeProductFinancials(financials);
  setWorkspaceDetails(nextDetails);
}

function getLocalIsoDate() {
  const date = new Date();
  const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return localDate.toISOString().slice(0, 10);
}

function renderProductThumbnail(product, className) {
  const productDetails = getWorkspaceProductDetails(product.id);
  const imageUrl = getStorageAssetUrl(productDetails);

  if (imageUrl) {
    const image = createElement("img", { src: imageUrl, alt: product.name });
    const fallbackUrl = getStorageAssetFallbackUrl(productDetails, imageUrl);
    let fallbackTried = false;
    image.addEventListener("error", () => {
      if (!fallbackTried && fallbackUrl) {
        fallbackTried = true;
        image.src = fallbackUrl;
        return;
      }
      image.replaceWith(createIcon("inventory_2"));
    });
    return createElement("span", { className: `${className} product-image-preview` }, [
      image,
    ]);
  }

  return createElement("span", { className }, [createIcon("inventory_2")]);
}

function renderWorkspaceEmptyState() {
  if (hasSharedWorkspaceLoadError()) {
    return createElement("section", { className: "blank-workspace", ariaLabel: "Shared workspace load error" }, [
      createElement("div", { className: "workspace-empty" }, [
        createElement("h2", null, "Shared workspace could not load"),
        createElement("p", null, uiState.sharedWorkspaceSaveNotice || "Refresh or sign in again before making workspace changes."),
      ]),
    ]);
  }
  if (isSharedWorkspaceHydrating()) {
    return createElement("section", { className: "blank-workspace", ariaLabel: "Shared workspace loading" }, [
      createElement("div", { className: "workspace-empty" }, [
        createElement("h2", null, "Syncing shared workspace"),
        createElement("p", null, "Loading the latest admin and team changes from Supabase."),
      ]),
    ]);
  }
  return createElement("section", { className: "blank-workspace", ariaLabel: "Selected product details" }, [
    createElement("div", { className: "workspace-empty" }, [
      createElement("h2", null, "Select a product"),
      createElement("p", null, "Choose a product from the pipeline list to customize its visible stage details."),
    ]),
  ]);
}

function renderDashboardWorkspace() {
  const summary = getDashboardSummary();
  return createElement("section", { className: "dashboard-workspace", ariaLabel: "Launch dashboard overview" }, [
    renderDashboardHeroCard(summary),
    createElement("div", { className: "dashboard-workspace__grid" }, [
      renderDashboardDistribution(summary),
      renderDashboardRecentActivity(summary),
    ]),
    renderDashboardGoalModal(),
    renderDashboardBackgroundModal(),
    renderDashboardActivityHistoryModal(),
  ]);
}

function renderDashboardHeroCard(summary) {
  const launched = summary.launchedProducts;
  const target = Math.max(1, summary.targetLaunches);
  const progress = Math.min(100, Math.round((launched / target) * 100));
  const launchPerMonth = Math.max(0, Math.ceil(summary.remainingLaunches / 12));
  const launchPerWeek = Math.max(0, Math.ceil(summary.remainingLaunches / 52));

  return createElement("article", { className: "dashboard-hero dashboard-hero--premium dashboard-hero--premium-v2" }, [
    createElement("div", { className: "dashboard-hero__content" }, [
      createElement("div", { className: "dashboard-hero__layout" }, [
        createElement("div", { className: "dashboard-hero__main" }, [
          createElement("div", { className: "dashboard-hero__heading" }, [
            createElement("span", null, [
              createElement("strong", null, summary.goalTitle),
              canEditWorkspaceData() ? createElement("button", { className: "dashboard-hero__icon-button", type: "button", dataAction: "open-dashboard-goal-modal", ariaLabel: "Edit dashboard launch goal" }, [createIcon("edit")]) : null,
              canEditWorkspaceData() ? createElement("button", { className: "dashboard-hero__icon-button", type: "button", dataAction: "open-dashboard-background-modal", title: "Manage dashboard hero slides", ariaLabel: "Manage dashboard hero slides" }, [createIcon("settings")]) : null,
            ].filter(Boolean)),
            createElement("em", null, "Track progress toward your annual revenue and expansion targets"),
          ]),
          createElement("div", { className: "dashboard-hero__progress-row" }, [
            renderDashboardProgressRing(progress),
            createElement("div", { className: "dashboard-hero__cta-stack" }, [
              createElement("div", { className: "dashboard-hero__action-row" }, [
                renderDashboardStageLink("View Launched", "launch"),
                createElement("div", { className: "dashboard-hero__pace-row" }, [
                  renderDashboardPaceCard(launchPerMonth, "Rate / Mo"),
                  renderDashboardPaceCard(launchPerWeek, "Rate / Wk"),
                ]),
              ]),
              createElement("div", { className: "dashboard-hero__quick-stats" }, [
                renderDashboardHeroStat("Launched", launched),
                renderDashboardHeroStat("Target", summary.targetLaunches),
                renderDashboardHeroStat("Remaining", summary.remainingLaunches),
                renderDashboardHeroStat("In Pipeline", summary.inPipelineProducts),
              ]),
            ]),
          ]),
        ]),
        renderDashboardHeroMedia(summary),
      ]),
    ]),
  ]);
}

function renderDashboardProgressRing(progress) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  return createElement("div", {
    className: "dashboard-hero__progress-ring",
    style: { "--dashboard-progress": `${safeProgress}%` },
    role: "img",
    ariaLabel: `${safeProgress}% products launched`,
  }, [
    createElement("span", { className: "dashboard-hero__progress-ring-inner" }, [
      createElement("strong", null, `${safeProgress}%`),
      createElement("em", null, "Progress"),
    ]),
  ]);
}

function renderDashboardPaceCard(value, label) {
  return createElement("div", { className: "dashboard-hero__pace" }, [
    createElement("strong", null, String(value)),
    createElement("span", null, label),
  ]);
}

function renderDashboardHeroStat(label, value) {
  return createElement("span", { className: "dashboard-hero__stat" }, [
    createElement("em", null, label),
    createElement("strong", null, String(value)),
  ]);
}

function renderDashboardHeroMedia(summary) {
  ensureDashboardHeroSlideAnimation(summary.backgroundImages.length);
  const slideCount = summary.backgroundImages.length;
  const slideDurationSeconds = Math.max(slideCount, 1) * DASHBOARD_HERO_SLIDE_SECONDS;
  const backgroundImages = summary.backgroundImages.map((image, index) =>
    createElement("span", {
      className: "dashboard-hero__media-slide",
      style: {
        animationDelay: `${index * DASHBOARD_HERO_SLIDE_SECONDS}s`,
        animationDuration: `${slideDurationSeconds}s`,
      },
    }, [
      createElement("img", { src: getDashboardBackgroundImageUrl(image), alt: getDashboardBackgroundImageName(image, index), loading: "lazy" }),
    ]),
  );
  const slideCountClass = backgroundImages.length ? ` dashboard-hero__media--slides-${backgroundImages.length}` : "";
  return createElement("div", { className: `dashboard-hero__media${backgroundImages.length ? " dashboard-hero__media--with-images" : ""}${slideCountClass}`.trim() }, [
    ...(backgroundImages.length ? backgroundImages : [createElement("span", { className: "dashboard-hero__media-placeholder" }, [createIcon("rocket_launch")])]),
    backgroundImages.length > 1 ? createElement("span", { className: "dashboard-hero__media-dots" }, backgroundImages.map((_, index) =>
      createElement("i", { className: `dashboard-hero__media-dot${index === 0 ? " dashboard-hero__media-dot--active" : ""}` }),
    )) : null,
    createElement("button", { className: "dashboard-hero__media-arrow dashboard-hero__media-arrow--prev", type: "button", dataAction: "open-dashboard-background-modal", ariaLabel: "Manage dashboard slides" }, [createIcon("chevron_left")]),
    createElement("button", { className: "dashboard-hero__media-arrow dashboard-hero__media-arrow--next", type: "button", dataAction: "open-dashboard-background-modal", ariaLabel: "Manage dashboard slides" }, [createIcon("chevron_right")]),
  ]);
}

function ensureDashboardHeroSlideAnimation(slideCount) {
  if (typeof document === "undefined") return;
  const styleId = "dashboard-hero-slide-animation";
  const existingStyle = document.getElementById(styleId);
  if (slideCount <= 1) {
    existingStyle?.remove();
    return;
  }

  const visiblePercent = 100 / Math.max(2, slideCount);
  const fadePercent = Math.min(1.8, Math.max(0.8, visiblePercent * 0.18));
  const holdPercent = Math.max(fadePercent, visiblePercent - fadePercent);
  const css = `
@keyframes dashboardHeroFadeDynamic {
  0%, 100% { opacity: 0; }
  ${fadePercent.toFixed(3)}%, ${holdPercent.toFixed(3)}% { opacity: 1; }
  ${visiblePercent.toFixed(3)}% { opacity: 0; }
}
`;

  const styleElement = existingStyle ?? document.createElement("style");
  styleElement.id = styleId;
  if (styleElement.textContent !== css) styleElement.textContent = css;
  if (!existingStyle) document.head.appendChild(styleElement);
}

function renderDashboardGoalModal() {
  if (!uiState.dashboardGoalModalOpen) return null;
  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", { className: "workspace-modal__dialog", dataAction: "save-dashboard-goal", role: "dialog", ariaModal: "true", ariaLabel: "Edit dashboard launch goal" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Dashboard Hero Goal"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-dashboard-goal-modal", ariaLabel: "Close dashboard goal dialog" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Goal Title"),
        createElement("input", { className: "form-input", name: "goalTitle", type: "text", value: dashboardSettings.title, required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Goal Subtitle"),
        createElement("input", { className: "form-input", name: "goalSubtitle", type: "text", value: dashboardSettings.subtitle, required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Target Launches"),
        createElement("input", { className: "form-input", name: "targetLaunches", type: "number", min: "1", step: "1", value: dashboardSettings.targetLaunches, required: true }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-dashboard-goal-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Save Goal"),
      ]),
    ]),
  ]);
}

function renderDashboardBackgroundModal() {
  if (!uiState.dashboardBackgroundModalOpen) return null;
  const backgroundImages = Array.isArray(uiState.dashboardBackgroundDraft) ? uiState.dashboardBackgroundDraft : [];
  const pendingFiles = Array.isArray(uiState.dashboardBackgroundPendingFiles) ? uiState.dashboardBackgroundPendingFiles : [];
  const uploadInputId = "dashboard-background-upload-input";
  const uploadError = uiState.dashboardBackgroundUploadError
    ? createElement("p", { className: "dashboard-background-modal__error", role: "alert" }, uiState.dashboardBackgroundUploadError)
    : null;
  const uploadNotice = uiState.dashboardBackgroundBatchNotice
    ? createElement("p", { className: "dashboard-background-modal__notice", role: "status" }, uiState.dashboardBackgroundBatchNotice)
    : null;
  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("section", { className: "workspace-modal__dialog dashboard-background-modal", role: "dialog", ariaModal: "true", ariaLabel: "Manage dashboard background slides" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Dashboard Background Slides"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-dashboard-background-modal", ariaLabel: "Close background slides dialog" }, [createIcon("close")]),
      ]),
      createElement("p", { className: "dashboard-background-modal__help" }, "Upload multiple slide images for the dashboard hero. You can replace or delete them later, then save when ready."),
      createElement("div", { className: "dashboard-background-upload", dataAction: "drop-dashboard-backgrounds" }, [
        createIcon(uiState.dashboardBackgroundUploading ? "hourglass_top" : "upload"),
        createElement("strong", null, uiState.dashboardBackgroundUploading ? "Uploading Slides..." : "Add Slide Images"),
        createElement("span", null, "Choose multiple files or drag images here"),
        createElement("input", {
          className: "dashboard-background-upload__input",
          id: uploadInputId,
          name: "dashboardBackgroundImages",
          type: "file",
          accept: "image/*",
          multiple: true,
          dataAction: "queue-dashboard-backgrounds",
          disabled: uiState.dashboardBackgroundUploading,
        }),
      ]),
      pendingFiles.length ? createElement("div", { className: "dashboard-background-pending", role: "status" }, [
        createElement("strong", null, `${pendingFiles.length} selected image${pendingFiles.length === 1 ? "" : "s"}`),
        createElement("ul", null, pendingFiles.map((file) => createElement("li", null, file.name))),
        createElement("span", { className: "dashboard-background-pending__actions" }, [
          createElement("button", {
            className: "button-primary",
            type: "button",
            dataAction: "upload-queued-dashboard-backgrounds",
            disabled: uiState.dashboardBackgroundUploading,
          }, uiState.dashboardBackgroundUploading ? "Uploading..." : `Upload ${pendingFiles.length} Image${pendingFiles.length === 1 ? "" : "s"}`),
          createElement("button", {
            className: "button-secondary",
            type: "button",
            dataAction: "clear-queued-dashboard-backgrounds",
            disabled: uiState.dashboardBackgroundUploading,
          }, "Clear Selection"),
        ]),
      ]) : null,
      createElement("small", { className: "dashboard-background-modal__note" }, `${backgroundImages.length}/${DASHBOARD_HERO_MAX_SLIDES} slides saved. Select multiple files in the picker to add them together.`),
      uploadNotice,
      uploadError,
      backgroundImages.length
        ? createElement("div", { className: "dashboard-background-list" }, backgroundImages.map((image, index) => renderDashboardBackgroundItem(image, index)))
        : createElement("p", { className: "dashboard-empty" }, "No slide images yet. Upload one or more images to start the dashboard background slideshow."),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-dashboard-background-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "button", dataAction: "save-dashboard-backgrounds" }, "Save Slides"),
      ]),
    ]),
  ]);
}

function renderDashboardBackgroundItem(image, index) {
  return createElement("article", {
    className: "dashboard-background-item",
    dataDashboardSlideDropIndex: index,
  }, [
    createElement("button", {
      className: "dashboard-background-item__drag",
      type: "button",
      draggable: true,
      dataAction: "drag-dashboard-background",
      dataOptionIndex: index,
      ariaLabel: `Drag slide ${index + 1} to reorder`,
      title: "Drag to reorder slide",
    }, [createIcon("drag_indicator")]),
    createElement("span", { className: "dashboard-background-item__preview" }, [
      createElement("img", { src: getDashboardBackgroundImageUrl(image), alt: getDashboardBackgroundImageName(image, index) }),
    ]),
    createElement("span", { className: "dashboard-background-item__meta" }, [
      createElement("strong", null, `Slide ${index + 1}`),
      createElement("em", null, getDashboardBackgroundImageName(image, index)),
    ]),
    createElement("span", { className: "dashboard-background-item__actions" }, [
      createElement("label", { className: "button-secondary dashboard-background-item__replace" }, [
        createElement("span", null, "Replace One"),
        createElement("input", { type: "file", accept: "image/*", dataAction: "upload-dashboard-backgrounds", dataOptionIndex: index }),
      ]),
      createElement("button", { className: "button-secondary", type: "button", dataAction: "remove-dashboard-background", dataOptionIndex: index }, "Delete"),
    ]),
  ]);
}

function getDashboardBackgroundImageUrl(image) {
  if (typeof image === "string") return image;
  return getStorageAssetUrl(image);
}

function getDashboardBackgroundImageName(image, index) {
  if (image && typeof image === "object") {
    const name = String(image.name ?? "").trim();
    if (name) return name;
  }
  return `Dashboard slide ${index + 1}`;
}

function renderDashboardMetricCard(label, value, iconName, helper) {
  return createElement("article", { className: "dashboard-card dashboard-metric" }, [
    createElement("span", { className: "dashboard-metric__icon" }, [createIcon(iconName)]),
    createElement("span", null, label),
    createElement("strong", null, String(value ?? "—")),
    createElement("em", null, helper),
  ]);
}

function renderDashboardDistribution(summary, isHeroCard = false) {
  return createElement("article", { className: `dashboard-card ${isHeroCard ? "dashboard-card--hero-distribution" : "dashboard-card--pipeline-overview"}` }, [
    createElement("header", { className: "dashboard-card__header dashboard-card__header--with-action" }, [
      createElement("span", null, [
        createElement("strong", null, "Pipeline Overview"),
        createElement("em", null, isHeroCard ? "Current product count by stage" : "Current product count by stage"),
      ]),
      !isHeroCard ? createElement("button", { className: "dashboard-link-button", type: "button", dataAction: "select-stage", dataStageId: summary.stageDistribution[0]?.id ?? "product-research" }, "View Detailed Flow") : null,
    ].filter(Boolean)),
    createElement("div", { className: "dashboard-stage-bars" }, summary.stageDistribution.map((stage) =>
      createElement("button", { className: "dashboard-stage-bars__row", type: "button", dataAction: "select-stage", dataStageId: stage.id }, [
        createElement("span", { className: "dashboard-stage-bars__label" }, [
          createElement("span", { className: "dashboard-stage-bars__count" }, String(stage.count)),
          createElement("span", null, stage.label),
        ]),
        createElement("span", { className: "dashboard-stage-bars__track" }, [
          createElement("span", { className: "dashboard-stage-bars__fill", style: { width: `${stage.percent}%` } }),
        ]),
      ]),
    )),
  ]);
}

function renderDashboardActionPanel(summary) {
  return createElement("article", { className: "dashboard-card" }, [
    createElement("header", { className: "dashboard-card__header dashboard-card__header--with-action" }, [
      createElement("span", null, [
        createElement("strong", null, "Action Required"),
        createElement("em", null, "Top operational issues"),
      ]),
      summary.actions.length ? createElement("span", { className: "dashboard-urgent-badge" }, `${summary.actions.length} Urgent`) : null,
    ].filter(Boolean)),
    summary.actions.length
      ? createElement("div", { className: "dashboard-action-list" }, summary.actions.map((item) => renderDashboardActionItem(item)))
      : createElement("p", { className: "dashboard-empty" }, "No urgent action items right now."),
  ]);
}

function renderDashboardActionItem(item) {
  return createElement("button", {
    className: "dashboard-action-item",
    type: "button",
    dataAction: "select-stage",
    dataStageId: item.stageId,
  }, [
    createIcon(item.icon),
    createElement("span", null, [
      createElement("strong", null, item.productName),
      createElement("em", null, item.message),
    ]),
  ]);
}

function renderDashboardLaunchSnapshot(summary) {
  return createElement("article", { className: "dashboard-card" }, [
    renderDashboardSectionTitle("Launch Performance", "Daily + weekly totals", "monitoring"),
    renderDashboardMiniStat("Spend", formatLaunchCurrency(summary.launch.spend)),
    renderDashboardMiniStat("PPC Sales", formatLaunchCurrency(summary.launch.ppcSales)),
    renderDashboardMiniStat("Total Sales", formatLaunchCurrency(summary.launch.totalSales)),
    renderDashboardMiniStat("ACOS / TACOS", `${formatLaunchPercent(summary.launch.acos)} / ${formatLaunchPercent(summary.launch.tacos)}`),
    renderDashboardStageLink("Go to Launch", "launch"),
  ]);
}

function renderDashboardCampaignSnapshot(summary) {
  return createElement("article", { className: "dashboard-card" }, [
    renderDashboardSectionTitle("Campaign Preparation", "Campaign mix overview", "campaign"),
    renderDashboardMiniStat("Total Campaigns", summary.campaign.total),
    renderDashboardMiniStat("SP / SB / SD", `${summary.campaign.sponsoredProducts} / ${summary.campaign.sponsoredBrands} / ${summary.campaign.sponsoredDisplay}`),
    renderDashboardMiniStat("Sheet Link", campaignPrepSettings.sheetUrl ? "Configured" : "Missing"),
    renderDashboardStageLink("Go to Campaign Prep", "campaign-prep"),
  ]);
}

function renderDashboardVineSnapshot(summary) {
  const pendingFeedbackCount = collectUniqueVineEntries(vineSettings, "feedbackByProductId", "feedback")
    .filter((item) => String(item.status).toLowerCase() !== "resolved").length;
  return createElement("article", { className: "dashboard-card" }, [
    renderDashboardSectionTitle("Vine Management", "Review and feedback health", "star"),
    renderDashboardMiniStat("Enrollment", `${summary.vine.shippedUnits}/${summary.vine.totalUnits} units`),
    renderDashboardMiniStat("Reviews", `${summary.vine.reviewsReceived}/${summary.vine.reviewGoal}`),
    renderDashboardMiniStat("Average Rating", summary.vine.averageRating.toFixed(1)),
    renderDashboardMiniStat("Pending Feedback", pendingFeedbackCount),
    renderDashboardStageLink("Go to Vines", "enrolled-to-vines"),
  ]);
}

function renderDashboardRecentActivity(summary) {
  return createElement("article", { className: "dashboard-card dashboard-card--recent-activity" }, [
    createElement("header", { className: "dashboard-card__header dashboard-card__header--with-action" }, [
      createElement("span", null, [
        createElement("strong", null, "Recent Activity"),
      ]),
      createElement("button", { className: "dashboard-history-button", type: "button", dataAction: "open-dashboard-history", ariaLabel: "Open activity history filters" }, [
        createIcon("filter_list"),
      ]),
    ]),
    summary.activity.length
      ? createElement("div", { className: "dashboard-activity" }, summary.activity.map((item, index) => renderDashboardActivityItem(item, "dashboard-activity__item", index)))
      : createElement("p", { className: "dashboard-empty" }, "No recent activity yet."),
  ]);
}

function renderDashboardActivityHistoryModal() {
  if (!uiState.dashboardHistoryModalOpen) return null;
  const filteredActivity = getFilteredActivityLog();

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("section", { className: "workspace-modal__dialog dashboard-history-modal", role: "dialog", ariaModal: "true", ariaLabel: "Activity history" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Activity History"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-dashboard-history", ariaLabel: "Close activity history" }, [createIcon("close")]),
      ]),
      createElement("div", { className: "dashboard-history-filters" }, [
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "From"),
          createElement("input", { className: "form-input", name: "activityStartDate", type: "date", value: uiState.activityHistoryStartDate, dataAction: "update-dashboard-history-filter" }),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "To"),
          createElement("input", { className: "form-input", name: "activityEndDate", type: "date", value: uiState.activityHistoryEndDate, dataAction: "update-dashboard-history-filter" }),
        ]),
      ]),
      filteredActivity.length
        ? createElement("div", { className: "dashboard-history-list" }, filteredActivity.map((item) => renderDashboardActivityHistoryItem(item)))
        : createElement("p", { className: "dashboard-empty" }, "No activity found for this date range."),
    ]),
  ]);
}

function renderDashboardActivityHistoryItem(item) {
  return renderDashboardActivityItem(item, "dashboard-history-item");
}

function renderDashboardActivityItem(item, className = "dashboard-activity__item", index = 0) {
  const isClickable = Boolean(item.stageId);
  const options = {
    className,
    ...(isClickable ? { type: "button", dataAction: "open-activity-source", dataStageId: item.stageId, dataProductId: item.productId } : {}),
  };
  return createElement(isClickable ? "button" : "div", options, [
    createElement("span", { className: `dashboard-activity__dot ${getDashboardActivityDotTone(index)}`, ariaHidden: "true" }),
    createElement("span", { className: "dashboard-activity__body" }, [
      createElement("strong", null, getDashboardActivityDisplayLabel(item)),
      createElement("em", null, item.detail),
      createElement("small", null, [
        createIcon("schedule"),
        createElement("span", null, formatActivityTimestamp(item.timestamp)),
      ]),
    ]),
  ]);
}

function getDashboardActivityDotTone(index) {
  const tones = ["dashboard-activity__dot--green", "dashboard-activity__dot--gray", "dashboard-activity__dot--blue"];
  return tones[Math.abs(Number(index) || 0) % tones.length];
}

function getDashboardActivityDisplayLabel(item) {
  const label = String(item?.label ?? "Pipeline update").trim() || "Pipeline update";
  const updatedFieldMatch = label.match(/^Updated\s+(?:workspace\s+details|field)\s*:\s*(.+)$/i);
  if (updatedFieldMatch) return `Updated Field: ${updatedFieldMatch[1]}`;
  return label;
}

function formatActivityTimestamp(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.toLocaleDateString("en-US", { day: "numeric" });
  const year = date.toLocaleDateString("en-US", { year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${month}, ${day}, ${year} - ${time}`;
}

function renderDashboardSectionTitle(title, helper, iconName) {
  return createElement("header", { className: "dashboard-card__header" }, [
    createElement("span", { className: "dashboard-card__header-icon" }, [createIcon(iconName)]),
    createElement("span", null, [
      createElement("strong", null, title),
      createElement("em", null, helper),
    ]),
  ]);
}

function renderDashboardMiniStat(label, value) {
  return createElement("span", { className: "dashboard-mini-stat" }, [
    createElement("em", null, label),
    createElement("strong", null, String(value ?? "—")),
  ]);
}

function renderDashboardStageLink(label, stageId) {
  return createElement("button", { className: "dashboard-stage-link", type: "button", dataAction: "select-stage", dataStageId: stageId }, [
    createElement("span", null, label),
    createIcon("arrow_forward"),
  ]);
}

function getDashboardSummary() {
  const products = getAllProducts();
  const totalProducts = products.length;
  const readinessValues = products.map(calculateProductChecklistReadiness);
  const taskSummary = getDashboardTaskSummary(products);
  const launchEntries = [...getLaunchMonitoringEntries("daily"), ...getLaunchMonitoringEntries("weekly")];
  const launch = calculateLaunchMonitoringSummary(launchEntries);
  const campaign = getCampaignPrepSummary();
  const vine = getVineMetrics();
  const activeLaunchStageIds = new Set(["campaign-prep", "enrolled-to-vines", "launch", "stable", "scaling"]);
  const activeLaunches = products.filter((product) => activeLaunchStageIds.has(product.stageId)).length;
  const launchedProducts = products.filter((product) => ["launch", "stable", "scaling"].includes(product.stageId)).length;
  const targetLaunches = normalizeCampaignCount(dashboardSettings.targetLaunches, DEFAULT_DASHBOARD_SETTINGS.targetLaunches);

  return {
    products,
    totalProducts,
    activeLaunches,
    launchedProducts,
    targetLaunches,
    remainingLaunches: Math.max(0, targetLaunches - launchedProducts),
    inPipelineProducts: Math.max(0, totalProducts - launchedProducts),
    goalTitle: dashboardSettings.title,
    goalSubtitle: dashboardSettings.subtitle,
    backgroundImages: dashboardSettings.backgroundImages,
    averageReadiness: readinessValues.length ? Math.round(readinessValues.reduce((sum, value) => sum + value, 0) / readinessValues.length) : 0,
    completedTasks: taskSummary.completed,
    totalTasks: taskSummary.total,
    openTasks: Math.max(0, taskSummary.total - taskSummary.completed),
    stageDistribution: getDashboardStageDistribution(products),
    actions: getDashboardActionItems(products),
    activity: getDashboardActivity(),
    launch,
    campaign,
    vine,
  };
}

function getDashboardTaskSummary(products) {
  return products.reduce((summary, product) => {
    const productDetails = getWorkspaceProductDetails(product.id);
    const tasks = Object.values(productDetails.stages ?? {}).flatMap((stageDetails) => stageDetails.checklistTasks ?? []);
    summary.total += tasks.length;
    summary.completed += tasks.filter((task) => task.isCompleted).length;
    return summary;
  }, { total: 0, completed: 0 });
}

function getDashboardStageDistribution(products) {
  const totalProducts = Math.max(products.length, 1);
  return getSidebarStageTabs().map((stageTab) => {
    const count = products.filter((product) => product.stageId === stageTab.id).length;
    return {
      id: stageTab.id,
      label: stageTab.label,
      count,
      percent: Math.max(4, Math.round((count / totalProducts) * 100)),
    };
  });
}

function getDashboardActionItems(products) {
  const actions = [];
  for (const product of products) {
    const readiness = calculateProductChecklistReadiness(product);
    if (!product.asin) actions.push(createDashboardAction(product, "Add ASIN before launch handoff.", "barcode_reader"));
    if (readiness < 100) actions.push(createDashboardAction(product, `Checklist is ${readiness}% ready.`, "checklist"));
    if (product.stageId === "launch" && getLaunchMonitoringEntries("daily").length === 0) actions.push(createDashboardAction(product, "Add daily launch PPC metrics.", "monitoring"));
    if (actions.length >= 6) break;
  }
  return actions.slice(0, 6);
}

function createDashboardAction(product, message, icon) {
  return {
    productName: product.name,
    stageId: product.stageId,
    message,
    icon,
  };
}

function getDashboardActivity() {
  return [...activityLog]
    .sort((firstItem, secondItem) => secondItem.timestamp - firstItem.timestamp)
    .slice(0, 6);
}

function renderWorkspaceStageDropdown(product, stage, displayIndex = getWorkspaceStageDisplayIndex(stage)) {
  const stageDetails = getWorkspaceStageDetails(product.id, stage.stage_id);
  const isExpanded = uiState.expandedWorkspaceStageIds.has(stage.stage_id);
  const isActiveStage = stage.stage_id === product.stageId || stage.stage_id === uiState.selectedStageId;
  const stageClassName = [
    "workspace-stage",
    isExpanded ? "workspace-stage--expanded" : "",
    isActiveStage ? "workspace-stage--active" : "",
  ].filter(Boolean).join(" ");

  return createElement("article", { className: stageClassName }, [
    createElement("button", {
      className: "workspace-stage__toggle",
      type: "button",
      dataAction: "toggle-workspace-stage",
      dataStageId: stage.stage_id,
      ariaExpanded: isExpanded ? "true" : "false",
      ariaControls: `workspace-stage-panel-${product.id}-${stage.stage_id}`,
    }, [
      createElement("span", { className: "workspace-stage__index" }, String(displayIndex)),
      createElement("span", { className: "workspace-stage__heading" }, [
        createElement("strong", null, stage.label),
        createElement("span", null, getWorkspaceStageStatus(product, stage)),
      ]),
      createIcon(isExpanded ? "expand_less" : "expand_more"),
    ]),
    isExpanded
      ? createElement("div", { className: "workspace-stage__body", id: `workspace-stage-panel-${product.id}-${stage.stage_id}` }, [
        renderSpecialStageWorkspace(product, stage, stageDetails),
        isSpecialWorkspaceStage(stage.stage_id) ? null : renderWorkspaceAddFieldForm(product, stage),
        renderWorkspaceChecklist(product, stage, stageDetails),
      ].filter(Boolean))
      : null,
  ]);
}

function renderSpecialStageWorkspace(product, stage, stageDetails) {
  if (stage.stage_id === "keyword-research") return renderKeywordResearchWorkspace(product, stage);
  if (stage.stage_id === "campaign-prep") return renderCampaignPreparationWorkspace(product, stage);
  if (stage.stage_id === "enrolled-to-vines") return renderVineWorkspace(product, stage);
  if (stage.stage_id === "launch") return renderLaunchWorkspace(product, stage);
  return renderWorkspaceCustomFields(product, stage, stageDetails);
}

function isSpecialWorkspaceStage(stageId) {
  return ["keyword-research", "campaign-prep", "enrolled-to-vines", "launch"].includes(stageId);
}

function renderKeywordResearchWorkspace(product, stage) {
  return createElement("section", { className: "keyword-workspace", ariaLabel: `${stage.label} workspace` }, [
    renderKeywordBankIntegrationCard(product),
    renderKeywordListTable(product),
  ]);
}

function renderKeywordBankIntegrationCard(product) {
  const productId = String(product?.id ?? "");
  const safeUrl = getSafeWorkspaceUrl(getKeywordSpreadsheetUrlForProduct(productId));
  const isEditing = uiState.keywordSpreadsheetEditing && uiState.keywordSpreadsheetEditingProductId === productId;
  const buttonChildren = [
    createIcon("link"),
    createElement("span", null, safeUrl ? "Open Keyword Bank Spreadsheet" : "Link Keyword Bank Spreadsheet"),
  ];

  return createElement("article", { className: "keyword-bank-card" }, [
    createElement("span", { className: "keyword-bank-card__icon" }, [createIcon("table_chart")]),
    createElement("div", { className: "keyword-bank-card__content" }, [
      createElement("h3", null, "Keyword Bank Integration"),
      createElement("p", null, "Connect your external keyword data sources to sync search metrics and sales performance directly into your workspace."),
      isEditing
        ? createElement("div", { className: "keyword-bank-card__editor" }, [
          createElement("input", {
            className: "keyword-bank-card__input",
            type: "url",
            value: uiState.keywordSpreadsheetDraft,
            placeholder: "Paste Google Sheet link...",
            dataAction: "update-keyword-spreadsheet-draft",
            dataProductId: productId,
            disabled: !canEditProductFieldValues(),
          }),
          createElement("button", { className: "button-primary keyword-bank-card__save", type: "button", dataAction: "save-keyword-spreadsheet-link", dataProductId: productId }, "Save"),
          createElement("button", { className: "button-secondary keyword-bank-card__cancel", type: "button", dataAction: "cancel-keyword-spreadsheet-link" }, "Cancel"),
        ])
        : null,
    ].filter(Boolean)),
    !isEditing && (safeUrl || canEditProductFieldValues())
      ? createElement("div", { className: "keyword-bank-card__actions" }, [
        safeUrl
          ? createElement("a", {
            className: "button-primary keyword-bank-card__button",
            href: safeUrl,
            target: "_blank",
            rel: "noopener noreferrer",
          }, buttonChildren)
          : createElement("button", {
            className: "button-primary keyword-bank-card__button",
            type: "button",
            dataAction: "edit-keyword-spreadsheet-link",
            dataProductId: productId,
          }, buttonChildren),
        canEditProductFieldValues() ? createElement("button", {
          className: "keyword-bank-card__edit",
          type: "button",
          dataAction: "edit-keyword-spreadsheet-link",
          dataProductId: productId,
          ariaLabel: "Edit keyword spreadsheet link",
          title: "Edit keyword spreadsheet link",
        }, [createIcon("edit")]) : null,
      ].filter(Boolean))
      : null,
  ].filter(Boolean));
}

function renderKeywordListTable(product) {
  const rows = getKeywordRowsForProduct(product?.id);
  const columns = keywordResearchSettings.columns;

  return createElement("article", { className: "keyword-list-card" }, [
    createElement("div", { className: "keyword-list-card__header" }, [
      createElement("div", null, [
        createElement("h3", null, "Top 20 Keywords"),
        createElement("p", null, "Performance metrics for your highest-ranking search terms"),
      ]),
      createElement("div", { className: "keyword-list-card__actions" }, [
        createElement("button", { className: "keyword-list-card__filter", type: "button", ariaLabel: "Filter keywords", title: "Filter keywords" }, [
          createIcon("filter_list"),
          createElement("span", null, "Filter"),
        ]),
        canManageWorkspaceFieldTemplates()
          ? createElement("button", { className: "keyword-list-card__add-text", type: "button", dataAction: "add-keyword-column", ariaLabel: "Add keyword column", title: "Add keyword column" }, [
            createIcon("add"),
            createElement("span", null, "Column"),
          ])
          : null,
        canEditProductFieldValues()
          ? createElement("button", { className: "keyword-list-card__add", type: "button", dataAction: "add-keyword-row", ariaLabel: "Add keyword row", title: "Add keyword row" }, [createIcon("add")])
          : null,
      ].filter(Boolean)),
    ]),
    createElement("div", { className: "keyword-list-card__table-wrap" }, [
      createElement("table", { className: "keyword-list-table" }, [
        createElement("thead", null, [
          createElement("tr", null, [
            createElement("th", { className: "keyword-list-table__row-action-head" }, ""),
            columns.map((column, columnIndex) => renderKeywordTableHeader(column, columnIndex)),
          ]),
        ]),
        createElement("tbody", null, rows.map((row, rowIndex) => createElement("tr", null, [
          renderKeywordTableRowActions(rowIndex),
          columns.map((column) => renderKeywordTableCell(row, rowIndex, column)),
        ]))),
      ]),
    ]),
  ]);
}

function renderKeywordTableHeader(column, columnIndex) {
  const isEditing = uiState.keywordEditingHeader === column.key;
  return createElement("th", { dataAction: "edit-keyword-header", dataFieldPart: column.key, dataColumnIndex: columnIndex, title: "Double-click to edit column name" }, [
    isEditing
      ? createElement("input", {
        className: "keyword-list-table__input keyword-list-table__header-input",
        type: "text",
        value: column.label,
        dataAction: "update-keyword-column-label",
        dataFieldPart: column.key,
        dataColumnIndex: columnIndex,
        disabled: !canManageWorkspaceFieldTemplates(),
      })
      : createElement("span", { className: "keyword-list-table__heading" }, column.label),
  ]);
}

function renderKeywordTableRowActions(rowIndex) {
  return createElement("td", { className: "keyword-list-table__row-action" }, [
    canEditProductFieldValues()
      ? createElement("button", {
        className: "keyword-list-table__delete",
        type: "button",
        dataAction: "delete-keyword-row",
        dataOptionIndex: rowIndex,
        ariaLabel: `Delete keyword row ${rowIndex + 1}`,
        title: "Delete keyword row",
      }, [createIcon("delete")])
      : null,
  ].filter(Boolean));
}

function renderKeywordTableCell(row, rowIndex, column) {
  const isEditing = uiState.keywordEditingCell?.rowIndex === rowIndex && uiState.keywordEditingCell?.field === column.key;
  const value = String(row?.[column.key] ?? "");
  const commonOptions = {
    dataAction: "edit-keyword-cell",
    dataOptionIndex: rowIndex,
    dataFieldPart: column.key,
    title: "Double-click to edit",
  };

  return createElement("td", null, [
    isEditing
      ? createElement("input", {
        className: "keyword-list-table__input",
        type: "text",
        value,
        placeholder: "",
        dataAction: "update-keyword-cell",
        dataOptionIndex: rowIndex,
        dataFieldPart: column.key,
        disabled: !canEditProductFieldValues(),
      })
      : createElement("span", { className: "keyword-list-table__cell", ...commonOptions }, value),
  ]);
}

function renderLaunchWorkspace(product, stage) {
  const activeMode = launchMonitoringSettings.activeMode;
  const entries = getLaunchMonitoringEntries(activeMode);
  const summary = calculateLaunchMonitoringSummary(entries);
  const periodLabel = activeMode === "daily" ? "Daily" : "Weekly";

  return createElement("section", { className: "launch-workspace", ariaLabel: `${stage.label} monitoring dashboard` }, [
    createElement("div", { className: "launch-workspace__header" }, [
      createElement("div", null, [
        createElement("p", { className: "launch-workspace__eyebrow" }, "Launch Performance"),
        createElement("h3", null, "Daily & Weekly Metrics Monitoring Performance"),
        createElement("p", null, "Switch between daily and weekly manual inputs. The summary cards calculate automatically from the rows you add."),
      ]),
      createElement("div", { className: "launch-workspace__controls", role: "group", ariaLabel: "Launch metric view" }, [
        ...LAUNCH_METRIC_MODES.map((mode) => createElement("button", {
          className: `launch-workspace__toggle ${activeMode === mode ? "launch-workspace__toggle--active" : ""}`.trim(),
          type: "button",
          dataAction: "set-launch-metric-mode",
          dataLaunchMode: mode,
          ariaPressed: activeMode === mode ? "true" : "false",
        }, mode === "daily" ? "Daily" : "Weekly")),
        canEditWorkspaceData() ? createElement("button", { className: "launch-workspace__add", type: "button", dataAction: "open-launch-entry", ariaLabel: `Add ${periodLabel.toLowerCase()} launch metrics`, title: `Add ${periodLabel}` }, [createIcon("add")]) : null,
      ].filter(Boolean)),
    ]),
    renderLaunchPlanPanel(),
    createElement("div", { className: "launch-workspace__cards" }, [
      renderLaunchSummaryCard("Spend", formatLaunchCurrency(summary.spend), "payments"),
      renderLaunchSummaryCard("PPC Sales", formatLaunchCurrency(summary.ppcSales), "ads_click"),
      renderLaunchSummaryCard("Total Sales", formatLaunchCurrency(summary.totalSales), "attach_money"),
      renderLaunchSummaryCard("Organic Sales", formatLaunchCurrency(summary.organicSales), "eco"),
      renderLaunchSummaryCard("ACOS", formatLaunchPercent(summary.acos), "percent"),
      renderLaunchSummaryCard("TACOS", formatLaunchPercent(summary.tacos), "monitoring"),
    ]),
    renderLaunchMetricChart(entries),
    renderLaunchMetricTable(activeMode, entries),
    renderLaunchEntryModal(),
    renderLaunchPortfolioModal(),
  ].filter(Boolean));
}

function renderLaunchPlanPanel() {
  const plan = getLaunchPlanProgress();
  const launchDate = launchMonitoringSettings.launchPlan.launchDate;
  return createElement("section", { className: "launch-workspace__plan", ariaLabel: "Launch date progress" }, [
    createElement("div", { className: "launch-workspace__plan-fields" }, [
      createElement("label", { className: "launch-workspace__plan-field" }, [
        createElement("span", null, "Date Launched"),
        createElement("input", { type: "date", value: launchDate, dataAction: "update-launch-plan", dataLaunchPlanField: "launchDate", disabled: !canEditWorkspaceData() }),
      ]),
      createElement("label", { className: "launch-workspace__plan-field" }, [
        createElement("span", null, "Launch Period"),
        createElement("input", { type: "number", min: "0", step: "1", value: launchMonitoringSettings.launchPlan.launchPeriod, dataAction: "update-launch-plan", dataLaunchPlanField: "launchPeriod", disabled: !canEditWorkspaceData() }),
      ]),
    ]),
    createElement("div", { className: "launch-workspace__plan-progress" }, [
      createElement("div", { className: "launch-workspace__plan-progress-head" }, [
        createElement("span", null, "Progress Since Launch Date"),
        createElement("strong", null, `${plan.progressPercent}%`),
      ]),
      createElement("span", { className: "launch-workspace__plan-bar", role: "progressbar", ariaValueMin: "0", ariaValueMax: "100", ariaValueNow: String(plan.progressPercent) }, [
        createElement("span", { style: { width: `${plan.progressPercent}%` } }),
      ]),
      createElement("p", null, launchDate ? `${plan.elapsedDays} days since launch • ${plan.daysRemaining} days remaining of ${plan.launchPeriod} day launch period` : "Set a launch date to calculate progress."),
    ]),
  ]);
}

function updateLaunchPlanFromInput(input) {
  const field = input.getAttribute("data-launch-plan-field");
  if (!field) return;
  const nextLaunchPlan = { ...launchMonitoringSettings.launchPlan };
  if (field === "launchDate") nextLaunchPlan.launchDate = normalizeLaunchDateInput(input.value);
  if (field === "launchPeriod") nextLaunchPlan.launchPeriod = normalizeCampaignCount(input.value, launchMonitoringSettings.launchPlan.launchPeriod);
  setLaunchMonitoringSettings({ ...launchMonitoringSettings, launchPlan: nextLaunchPlan });
}

function getLaunchPlanProgress() {
  const launchDate = parseDateInputValue(launchMonitoringSettings.launchPlan.launchDate);
  const launchPeriod = normalizeCampaignCount(launchMonitoringSettings.launchPlan.launchPeriod, 0);
  if (!launchDate) return { elapsedDays: 0, daysRemaining: launchPeriod, launchPeriod, progressPercent: 0 };

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const elapsedDays = Math.max(0, Math.floor((todayDate.getTime() - launchDate.getTime()) / 86400000));
  const daysRemaining = Math.max(0, launchPeriod - elapsedDays);
  const progressPercent = launchPeriod > 0 ? Math.min(100, Math.round((Math.min(elapsedDays, launchPeriod) / launchPeriod) * 100)) : 100;
  return { elapsedDays, daysRemaining, launchPeriod, progressPercent };
}

function normalizeLaunchDateInput(value) {
  const normalizedValue = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function parseDateInputValue(value) {
  const normalizedValue = normalizeLaunchDateInput(value);
  if (!normalizedValue) return null;
  const [year, month, day] = normalizedValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function renderLaunchSummaryCard(label, value, iconName) {
  return createElement("article", { className: "launch-workspace__card" }, [
    createElement("span", { className: "launch-workspace__card-icon" }, [createIcon(iconName)]),
    createElement("span", null, label),
    createElement("strong", null, value),
  ]);
}

function renderLaunchMetricChart(entries) {
  const chartEntries = entries.slice().reverse();
  const selectedMetrics = normalizeLaunchChartMetrics(launchMonitoringSettings.chartMetrics);
  return createElement("section", { className: "launch-workspace__chart-card", ariaLabel: "Launch performance chart" }, [
    createElement("div", { className: "launch-workspace__chart-head" }, [
      createElement("div", null, [
        createElement("h3", null, "PPC Metrics Comparison"),
        createElement("p", null, "Compare up to 4 PPC metrics. Hover any point to see the entry performance."),
      ]),
      createElement("div", { className: "launch-workspace__chart-selectors" }, selectedMetrics.map((metricKey, index) => renderLaunchChartMetricSelect(metricKey, index))),
    ]),
    chartEntries.length === 0
      ? createElement("p", { className: "launch-workspace__empty" }, "Add launch metrics to build the chart.")
      : createElement("div", { className: "launch-workspace__chart" }, [
        createElement("div", { className: "launch-workspace__chart-grid" }),
        ...selectedMetrics.map((metricKey, index) => renderLaunchChartSeries(chartEntries, metricKey, index, selectedMetrics)).filter(Boolean),
      ]),
  ]);
}

function renderLaunchChartMetricSelect(metricKey, index) {
  return createElement("label", { className: "launch-workspace__chart-select" }, [
    createElement("span", null, `Metric ${index + 1}`),
    createElement("select", { dataAction: "update-launch-chart-metric", dataLaunchChartIndex: String(index), value: metricKey }, [
      createElement("option", { value: "", selected: metricKey === "" }, "No metric"),
      ...getLaunchChartMetricDefinitions().map((metric) => createElement("option", { value: metric.key, selected: metric.key === metricKey }, metric.label)),
    ]),
  ]);
}

function renderLaunchChartSeries(entries, metricKey, seriesIndex, selectedMetrics) {
  const metric = getLaunchChartMetricDefinition(metricKey);
  if (!metric) return null;
  const values = entries.map((entry) => getLaunchChartMetricValue(entry, metric.key));
  const maxValue = Math.max(...values, 1);
  const pointCount = Math.max(entries.length - 1, 1);
  const points = entries.map((entry, entryIndex) => {
    const value = values[entryIndex];
    return {
      entry,
      value,
      left: entries.length === 1 ? 50 : (entryIndex / pointCount) * 100,
      bottom: (value / maxValue) * 82 + 8,
    };
  });
  const segments = points.slice(0, -1).map((point, index) => {
    const nextPoint = points[index + 1];
    const deltaX = nextPoint.left - point.left;
    const deltaY = nextPoint.bottom - point.bottom;
    const width = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    return createElement("span", {
      className: "launch-workspace__chart-segment",
      style: {
        left: `${point.left}%`,
        bottom: `${point.bottom}%`,
        width: `${width}%`,
        transform: `rotate(${-angle}deg)`,
      },
    });
  });
  const pointElements = points.map((point) => {
    return createElement("span", { className: "launch-workspace__chart-point", style: { left: `${point.left}%`, bottom: `${point.bottom}%` } }, [
      createElement("span", { className: "launch-workspace__chart-dot" }),
      renderLaunchChartTooltip(point.entry, selectedMetrics, getLaunchChartTooltipPlacement(point)),
    ]);
  });
  return createElement("div", { className: `launch-workspace__chart-series launch-workspace__chart-series--${seriesIndex + 1}` }, [...segments, ...pointElements]);
}

function getLaunchChartTooltipPlacement(point) {
  if (point.bottom > 68) return point.left > 50 ? "side-left" : "side-right";
  if (point.left < 18) return "side-right";
  if (point.left > 82) return "side-left";
  return "center";
}

function renderLaunchChartTooltip(entry, selectedMetrics, placement = "center") {
  return createElement("span", { className: `launch-workspace__chart-tooltip launch-workspace__chart-tooltip--${placement}` }, [
    createElement("strong", { className: "launch-workspace__chart-tooltip-entry" }, `Entry: ${entry.periodNumber}`),
    ...selectedMetrics.map((metricKey, index) => {
      const metric = getLaunchChartMetricDefinition(metricKey);
      if (!metric) return null;
      return createElement("span", { className: "launch-workspace__chart-tooltip-metric" }, [
        createElement("span", { className: `launch-workspace__chart-tooltip-dot launch-workspace__chart-tooltip-dot--${index + 1}` }),
        createElement("span", null, `${metric.label}: ${formatLaunchMetricValue(metric.key, getLaunchChartMetricValue(entry, metric.key))}`),
      ]);
    }).filter(Boolean),
  ]);
}

function updateLaunchChartMetricFromSelect(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  const metricIndex = Number(select.getAttribute("data-launch-chart-index"));
  if (!Number.isInteger(metricIndex) || metricIndex < 0 || metricIndex > 3) return;
  if (select.value && !getLaunchChartMetricDefinition(select.value)) return;
  const chartMetrics = normalizeLaunchChartMetrics(launchMonitoringSettings.chartMetrics);
  chartMetrics[metricIndex] = select.value;
  setLaunchMonitoringSettings({ ...launchMonitoringSettings, chartMetrics });
}

function deleteLaunchEntryFromButton(button) {
  const entryId = button.getAttribute("data-launch-entry-id");
  const activeMode = launchMonitoringSettings.activeMode;
  if (!entryId) return;
  setLaunchMonitoringSettings({
    ...launchMonitoringSettings,
    entries: {
      ...launchMonitoringSettings.entries,
      [activeMode]: getLaunchMonitoringEntries(activeMode).filter((entry) => entry.id !== entryId),
    },
  });
}

function getLaunchChartMetricDefinitions() {
  return [
    { key: "spend", label: "Spend", format: "currency" },
    { key: "sales", label: "PPC Sales", format: "currency" },
    { key: "totalSales", label: "Total Sales", format: "currency" },
    { key: "organicSales", label: "Organic Sales", format: "currency" },
    { key: "acos", label: "ACOS", format: "percent" },
    { key: "tacos", label: "TACOS", format: "percent" },
    { key: "cpc", label: "CPC", format: "currency" },
    { key: "cvr", label: "CVR", format: "percent" },
    { key: "clicks", label: "Clicks", format: "integer" },
    { key: "impressions", label: "Impressions", format: "integer" },
    { key: "orders", label: "Orders", format: "integer" },
    { key: "units", label: "Units", format: "integer" },
  ];
}

function getLaunchChartMetricDefinition(metricKey) {
  return getLaunchChartMetricDefinitions().find((metric) => metric.key === metricKey) ?? null;
}

function getLaunchChartMetricValue(entry, metricKey) {
  if (metricKey === "organicSales") return getLaunchEntryComputedValues(entry).organicSales;
  return Number(entry[metricKey]) || 0;
}

function formatLaunchMetricValue(metricKey, value) {
  const metric = getLaunchChartMetricDefinition(metricKey);
  if (metric?.format === "currency") return formatLaunchCurrency(value);
  if (metric?.format === "percent") return formatLaunchPercent(value);
  return formatInteger(value);
}

function renderLaunchMetricTable(activeMode, entries) {
  const periodLabel = activeMode === "daily" ? "Daily #" : "Weekly #";
  return createElement("section", { className: "launch-workspace__table-card" }, [
    createElement("div", { className: "launch-workspace__table-head" }, [
      createElement("div", { className: "launch-workspace__table-title" }, [
        createElement("h3", null, `${activeMode === "daily" ? "Daily" : "Weekly"} Metrics Monitoring`),
        renderLaunchPortfolioActions(),
      ]),
      createElement("span", { className: "launch-workspace__entry-count" }, `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`),
    ]),
    createElement("div", { className: "launch-workspace__table-wrap" }, [
      createElement("table", { className: "launch-workspace__table" }, [
        createElement("thead", null, [
          createElement("tr", null, [
            periodLabel,
            "Impressions",
            "Clicks",
            "CTR",
            "CPC",
            "CVR",
            "Spend",
            "Sales",
            "Order",
            "Units",
            "ACOS",
            "Total Units",
            "Total Sales",
            "Organic Sales",
            "TACOS",
            "Actions",
          ].map((label) => createElement("th", null, label))),
        ]),
        createElement("tbody", null, entries.length
          ? entries.map(renderLaunchMetricRow)
          : [createElement("tr", null, [createElement("td", { colSpan: 16, className: "launch-workspace__empty" }, "No launch metrics added yet. Use + to add the first row manually.")])]),
      ]),
    ]),
  ]);
}

function renderLaunchMetricRow(entry) {
  const computed = getLaunchEntryComputedValues(entry);
  return createElement("tr", null, [
    createElement("td", null, String(entry.periodNumber)),
    createElement("td", null, formatInteger(entry.impressions)),
    createElement("td", null, formatInteger(entry.clicks)),
    createElement("td", null, formatLaunchPercent(computed.ctr)),
    createElement("td", null, formatLaunchCurrency(entry.cpc)),
    createElement("td", null, formatLaunchPercent(entry.cvr)),
    createElement("td", null, formatLaunchCurrency(entry.spend)),
    createElement("td", null, formatLaunchCurrency(entry.sales)),
    createElement("td", null, formatInteger(entry.orders)),
    createElement("td", null, formatInteger(entry.units)),
    createElement("td", null, formatLaunchPercent(entry.acos)),
    createElement("td", null, formatInteger(entry.totalUnits)),
    createElement("td", null, formatLaunchCurrency(entry.totalSales)),
    createElement("td", null, formatLaunchCurrency(computed.organicSales)),
    createElement("td", null, formatLaunchPercent(entry.tacos)),
    createElement("td", { className: "launch-workspace__row-actions" }, [
      createElement("button", { type: "button", dataAction: "edit-launch-entry", dataLaunchEntryId: entry.id, ariaLabel: `Edit launch entry ${entry.periodNumber}` }, [createIcon("edit")]),
      createElement("button", { type: "button", dataAction: "delete-launch-entry", dataLaunchEntryId: entry.id, ariaLabel: `Delete launch entry ${entry.periodNumber}` }, [createIcon("delete")]),
    ]),
  ]);
}

function renderLaunchPortfolioActions() {
  const portfolioUrl = getSafeWorkspaceUrl(launchMonitoringSettings.portfolioUrl);
  const buttonText = launchMonitoringSettings.portfolioButtonText || DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioButtonText;
  return createElement("span", { className: "launch-workspace__portfolio-actions" }, [
    portfolioUrl ? createElement("a", {
      className: "launch-workspace__portfolio-button",
      href: portfolioUrl,
      target: "_blank",
      rel: "noreferrer",
      ariaLabel: `${buttonText} in Amazon Ads`,
    }, [createIcon("open_in_new"), createElement("span", null, buttonText)]) : null,
    canEditWorkspaceData() ? createElement("button", {
      className: "launch-workspace__portfolio-edit",
      type: "button",
      dataAction: "open-launch-portfolio-modal",
      ariaLabel: "Edit Amazon campaign portfolio link",
    }, [createIcon("edit")]) : null,
  ].filter(Boolean));
}

function renderLaunchPortfolioModal() {
  if (!uiState.launchPortfolioModalOpen) return null;
  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", { className: "workspace-modal__dialog", dataAction: "save-launch-portfolio", role: "dialog", ariaModal: "true", ariaLabel: "Edit Amazon campaign portfolio link" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Amazon Campaign Portfolio Link"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-launch-portfolio-modal", ariaLabel: "Close portfolio link dialog" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Button Name"),
        createElement("input", { className: "form-input", name: "buttonText", type: "text", value: launchMonitoringSettings.portfolioButtonText, required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Amazon Portfolio Link"),
        createElement("input", { className: "form-input", name: "portfolioUrl", type: "url", value: launchMonitoringSettings.portfolioUrl, placeholder: "https://advertising.amazon.com/...", required: true }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-launch-portfolio-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Save Link"),
      ]),
    ]),
  ]);
}

function renderLaunchEntryModal() {
  if (!uiState.launchEntryModal) return null;
  const activeMode = launchMonitoringSettings.activeMode;
  const periodLabel = activeMode === "daily" ? "Daily" : "Weekly";
  const editingEntry = uiState.launchEntryModal.entryId ? getLaunchMonitoringEntries(activeMode).find((entry) => entry.id === uiState.launchEntryModal.entryId) : null;
  const nextNumber = String(getLaunchMonitoringEntries(activeMode).length + 1);
  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", { className: "workspace-modal__dialog workspace-modal__dialog--wide", dataAction: "save-launch-entry", role: "dialog", ariaModal: "true", ariaLabel: `${editingEntry ? "Edit" : "Add"} ${periodLabel.toLowerCase()} launch metrics` }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, `${editingEntry ? "Edit" : "Add"} ${periodLabel} Metrics`),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-launch-entry", ariaLabel: "Close launch metric dialog" }, [createIcon("close")]),
      ]),
      createElement("div", { className: "launch-workspace__form-grid" }, LAUNCH_METRIC_FIELDS.filter((field) => field.type !== "derived").map((field) => renderLaunchEntryField(field, editingEntry?.[field.key] ?? (field.key === "periodNumber" ? nextNumber : "")))),
      createElement("p", { className: "launch-workspace__form-note" }, "CTR calculates from clicks ÷ impressions. Organic sales calculates from total sales minus PPC sales. Summary cards update from saved rows."),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-launch-entry" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, editingEntry ? "Update Metrics" : "Save Metrics"),
      ]),
    ]),
  ]);
}

function renderLaunchEntryField(field, value) {
  const inputOptions = { className: "form-input", name: field.key, type: field.type, value, required: field.key === "periodNumber" };
  if (field.step) inputOptions.step = field.step;
  if (field.type === "number") inputOptions.min = "0";
  return createElement("label", { className: "form-field" }, [
    createElement("span", { className: "text-label-sm" }, field.label),
    createElement("input", inputOptions),
  ]);
}

function setLaunchMetricMode(mode) {
  if (!LAUNCH_METRIC_MODES.includes(mode)) return;
  setLaunchMonitoringSettings({ ...launchMonitoringSettings, activeMode: mode });
}

function saveLaunchEntryForm(form) {
  const formData = new FormData(form);
  const activeMode = launchMonitoringSettings.activeMode;
  const entry = normalizeLaunchMetricEntry({
    id: createLocalEntryId(`launch_${activeMode}`),
    periodNumber: formData.get("periodNumber"),
    impressions: formData.get("impressions"),
    clicks: formData.get("clicks"),
    cpc: formData.get("cpc"),
    cvr: formData.get("cvr"),
    spend: formData.get("spend"),
    sales: formData.get("sales"),
    orders: formData.get("orders"),
    units: formData.get("units"),
    acos: formData.get("acos"),
    totalUnits: formData.get("totalUnits"),
    totalSales: formData.get("totalSales"),
    tacos: formData.get("tacos"),
  });
  const editingEntryId = uiState.launchEntryModal?.entryId;
  const currentEntries = getLaunchMonitoringEntries(activeMode);
  const nextEntries = editingEntryId
    ? currentEntries.map((currentEntry) => currentEntry.id === editingEntryId ? { ...entry, id: editingEntryId, createdAt: currentEntry.createdAt } : currentEntry)
    : [entry, ...currentEntries];
  setLaunchMonitoringSettings({
    ...launchMonitoringSettings,
    entries: {
      ...launchMonitoringSettings.entries,
      [activeMode]: nextEntries,
    },
  });
  recordActivity({
    icon: "monitoring",
    label: `${editingEntryId ? "Updated" : "Added"} ${activeMode} launch entry ${entry.periodNumber}`,
    detail: `${formatLaunchCurrency(entry.spend)} spend • ${formatLaunchCurrency(entry.sales)} PPC sales`,
    stageId: "launch",
  });
  uiState.launchEntryModal = null;
  renderFromCurrentState();
}

function getLaunchMonitoringEntries(mode = launchMonitoringSettings.activeMode) {
  const entries = Array.isArray(launchMonitoringSettings.entries?.[mode]) ? launchMonitoringSettings.entries[mode] : [];
  return [...entries].sort((firstEntry, secondEntry) => (Number(secondEntry.createdAt) || 0) - (Number(firstEntry.createdAt) || 0));
}

function calculateLaunchMonitoringSummary(entries) {
  const spend = sumLaunchMetric(entries, "spend");
  const ppcSales = sumLaunchMetric(entries, "sales");
  const totalSales = sumLaunchMetric(entries, "totalSales");
  const organicSales = Math.max(0, totalSales - ppcSales);
  return {
    spend,
    ppcSales,
    totalSales,
    organicSales,
    acos: ppcSales > 0 ? (spend / ppcSales) * 100 : 0,
    tacos: totalSales > 0 ? (spend / totalSales) * 100 : 0,
  };
}

function getLaunchEntryComputedValues(entry) {
  const impressions = Number(entry.impressions) || 0;
  const clicks = Number(entry.clicks) || 0;
  const totalSales = Number(entry.totalSales) || 0;
  const ppcSales = Number(entry.sales) || 0;
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    organicSales: Math.max(0, totalSales - ppcSales),
  };
}

function sumLaunchMetric(entries, key) {
  return entries.reduce((total, entry) => total + (Number(entry[key]) || 0), 0);
}

function formatLaunchCurrency(value) {
  return `$${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatLaunchPercent(value) {
  return `${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatInteger(value) {
  return (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function renderCampaignPreparationWorkspace(product, stage) {
  const summary = getCampaignPrepSummary(product?.id);
  const sheetUrl = getSafeWorkspaceUrl(campaignPrepSettings.sheetUrl);
  const sheetButtonText = campaignPrepSettings.sheetButtonText || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText;

  return createElement("section", { className: "campaign-prep-workspace", ariaLabel: `${stage.label} campaign dashboard` }, [
    createElement("div", { className: "campaign-prep-workspace__cards" }, [
      renderCampaignPrepMetricCard(product, "Total Campaigns", summary.total, "calculate", "Across SP, SB and SD", "total"),
      renderCampaignPrepMetricCard(product, "SP Campaigns", summary.sponsoredProducts, "ads_click", "Sponsored Products", "sponsoredProducts"),
      renderCampaignPrepMetricCard(product, "SB Campaigns", summary.sponsoredBrands, "brand_awareness", "Sponsored Brands", "sponsoredBrands"),
      renderCampaignPrepMetricCard(product, "SD Campaigns", summary.sponsoredDisplay, "display_settings", "Sponsored Display", "sponsoredDisplay"),
      renderCampaignPrepMetricCard(product, "Keyword Targets", summary.keywordTargets, "keyword", "Keyword Targeting", "keywordTargets"),
      renderCampaignPrepMetricCard(product, "Product Targeting", summary.productTargeting, "target", "Product Targets", "productTargeting"),
      renderCampaignPrepMetricCard(product, "Video Ads", summary.videoAds, "videocam", "Video Campaigns", "videoAds"),
      renderCampaignPrepMetricCard(product, "Auto Campaigns", summary.autoCampaigns, "autorenew", "Automatic Targeting", "autoCampaigns"),
    ]),
    createElement("article", { className: "campaign-prep-workspace__sheet" }, [
      createElement("span", { className: "campaign-prep-workspace__sheet-icon" }, [createIcon("table_chart")]),
      createElement("h3", null, "Campaign Strategy & Management"),
      createElement("p", null, "Access the global campaign tracking matrix to manage keyword bidding, ad group structures, and budget allocations. This sheet serves as the primary data source for PPC automation and scaling."),
      createElement("span", { className: "campaign-prep-workspace__sheet-actions" }, [
        sheetUrl ? createElement("a", {
          className: "campaign-prep-workspace__sheet-button",
          href: sheetUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          ariaLabel: `${sheetButtonText} for ${product.name}`,
        }, [createIcon("open_in_new"), createElement("span", null, sheetButtonText)]) : null,
        canEditWorkspaceData() ? createElement("button", {
          className: "campaign-prep-workspace__edit-link",
          type: "button",
          dataAction: "open-campaign-link-modal",
          ariaLabel: "Edit campaign management sheet button",
          title: "Edit button text and link",
        }, [createIcon("edit")]) : null,
      ].filter(Boolean)),
      sheetUrl ? createElement("div", { className: "campaign-prep-workspace__sync" }, [
        createElement("span", null, [createIcon("sync"), createElement("span", null, "Google Sheets Sync")]),
        createElement("span", null, [createIcon("schedule"), createElement("span", null, "Last synced 4m ago")]),
      ]) : null,
    ]),
    renderCampaignLinkModal(),
  ].filter(Boolean));
}

function renderCampaignPrepMetricCard(product, label, value, iconName, helperText, metricKey) {
  return createElement("article", { className: "campaign-prep-workspace__metric" }, [
    createElement("span", { className: "campaign-prep-workspace__metric-icon" }, [createIcon(iconName)]),
    createElement("span", { className: "campaign-prep-workspace__metric-copy" }, [
      createElement("span", null, label),
      createElement("strong", { dataAction: "edit-campaign-count", dataCampaignMetric: metricKey, dataProductId: product?.id ?? "", title: "Double-click to edit" }, String(value)),
      createElement("em", null, helperText),
    ]),
  ]);
}

function renderCampaignLinkModal() {
  if (!uiState.campaignLinkModalOpen) return null;

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", { className: "workspace-modal__dialog", dataAction: "save-campaign-link", role: "dialog", ariaModal: "true", ariaLabel: "Edit campaign management sheet link" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Edit Campaign Button"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-campaign-link-modal", ariaLabel: "Close campaign link dialog" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Button Text"),
        createElement("input", { className: "form-input", name: "buttonText", type: "text", value: campaignPrepSettings.sheetButtonText, required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Sheet Link"),
        createElement("input", { className: "form-input", name: "sheetUrl", type: "url", value: campaignPrepSettings.sheetUrl, placeholder: "https://docs.google.com/spreadsheets/..." }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-campaign-link-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Save Link"),
      ]),
    ]),
  ]);
}

function getCampaignPrepSummary(productId = "") {
  const counts = getCampaignPrepCountsForProduct(productId);
  return {
    total: counts.total,
    sponsoredProducts: counts.sponsoredProducts,
    sponsoredBrands: counts.sponsoredBrands,
    sponsoredDisplay: counts.sponsoredDisplay,
    keywordTargets: counts.keywordTargets,
    productTargeting: counts.productTargeting,
    videoAds: counts.videoAds,
    autoCampaigns: counts.autoCampaigns,
  };
}

function editCampaignCountFromElement(element) {
  const metricKey = element.getAttribute("data-campaign-metric");
  if (!isCampaignCountKey(metricKey) || typeof window === "undefined" || typeof window.prompt !== "function") return;
  const productId = element.getAttribute("data-product-id") || getSelectedProduct()?.id || "";
  if (!productId) return;

  const currentCounts = getCampaignPrepCountsForProduct(productId);
  const currentValue = currentCounts[metricKey];
  const nextValue = window.prompt(`Edit ${getCampaignCountLabel(metricKey)}`, String(currentValue));
  if (nextValue === null) return;

  const normalizedValue = normalizeCampaignCount(nextValue, currentValue);
  setCampaignPrepSettings({
    ...campaignPrepSettings,
    countsByProductId: {
      ...campaignPrepSettings.countsByProductId,
      [productId]: {
        ...currentCounts,
        [metricKey]: normalizedValue,
      },
    },
  });
  recordActivity({
    icon: "campaign",
    label: `Updated campaign count: ${getCampaignCountLabel(metricKey)}`,
    detail: String(normalizedValue),
    stageId: "campaign-prep",
  });
}

function saveCampaignLinkForm(form) {
  const formData = new FormData(form);
  const buttonText = String(formData.get("buttonText") ?? "").trim() || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText;
  const sheetUrl = normalizeCampaignPrepSheetUrl(formData.get("sheetUrl"));
  setCampaignPrepSettings({
    ...campaignPrepSettings,
    sheetButtonText: buttonText,
    sheetUrl,
  });
  recordActivity({
    icon: "campaign",
    label: "Updated campaign management link",
    detail: buttonText,
    stageId: "campaign-prep",
  });
  uiState.campaignLinkModalOpen = false;
  renderFromCurrentState();
}

function saveDashboardGoalForm(form) {
  const formData = new FormData(form);
  setDashboardSettings({
    title: String(formData.get("goalTitle") ?? "").trim() || DEFAULT_DASHBOARD_SETTINGS.title,
    subtitle: String(formData.get("goalSubtitle") ?? "").trim() || DEFAULT_DASHBOARD_SETTINGS.subtitle,
    targetLaunches: normalizeCampaignCount(formData.get("targetLaunches"), DEFAULT_DASHBOARD_SETTINGS.targetLaunches),
    backgroundImages: dashboardSettings.backgroundImages,
  });
  uiState.dashboardGoalModalOpen = false;
  renderFromCurrentState();
}

function uploadDashboardBackgroundsFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const replaceIndex = Number(input.getAttribute("data-option-index"));
  const isReplacing = Number.isInteger(replaceIndex) && replaceIndex >= 0;
  const files = getDashboardBackgroundInputFiles(input);
  uploadDashboardBackgroundFiles(files, { replaceIndex: isReplacing ? replaceIndex : null, input });
}

function queueDashboardBackgroundsFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  queueDashboardBackgroundFiles(getDashboardBackgroundInputFiles(input), input);
}

function getDashboardBackgroundInputFiles(input) {
  return Array.from(input?.files ?? []);
}

function queueDashboardBackgroundFiles(fileList, input = null) {
  const files = Array.from(fileList ?? []).filter((file) => file instanceof File && file.type.startsWith("image/"));
  const currentImages = uiState.dashboardBackgroundModalOpen
    ? [...(uiState.dashboardBackgroundDraft ?? dashboardSettings.backgroundImages)]
    : [...dashboardSettings.backgroundImages];
  const pendingFiles = Array.isArray(uiState.dashboardBackgroundPendingFiles) ? uiState.dashboardBackgroundPendingFiles : [];
  const remainingSlots = Math.max(0, DASHBOARD_HERO_MAX_SLIDES - currentImages.length - pendingFiles.length);
  const selectedFiles = files.slice(0, remainingSlots);

  if (input) input.value = "";
  if (!selectedFiles.length) {
    uiState.dashboardBackgroundUploadError = files.length
      ? `The dashboard can only save ${DASHBOARD_HERO_MAX_SLIDES} slides. Delete a slide before adding more.`
      : "No image files were selected.";
    uiState.dashboardBackgroundBatchNotice = "";
    renderFromCurrentState();
    return;
  }

  uiState.dashboardBackgroundPendingFiles = [...pendingFiles, ...selectedFiles];
  uiState.dashboardBackgroundUploadError = files.length > selectedFiles.length
    ? `${files.length - selectedFiles.length} image${files.length - selectedFiles.length === 1 ? "" : "s"} skipped because the dashboard can only save ${DASHBOARD_HERO_MAX_SLIDES} slides.`
    : "";
  uiState.dashboardBackgroundBatchNotice = `Selected ${selectedFiles.length} image${selectedFiles.length === 1 ? "" : "s"}. ${uiState.dashboardBackgroundPendingFiles.length} ready to upload.`;
  renderFromCurrentState();
}

function uploadQueuedDashboardBackgrounds() {
  const pendingFiles = Array.isArray(uiState.dashboardBackgroundPendingFiles) ? uiState.dashboardBackgroundPendingFiles : [];
  uploadDashboardBackgroundFiles(pendingFiles, { clearPending: true });
}

function uploadDashboardBackgroundFiles(fileList, { replaceIndex = null, input = null, clearPending = false } = {}) {
  const files = Array.from(fileList ?? []).filter((file) => file instanceof File && file.type.startsWith("image/"));
  const isReplacing = Number.isInteger(replaceIndex) && replaceIndex >= 0;
  const currentImages = uiState.dashboardBackgroundModalOpen
    ? [...(uiState.dashboardBackgroundDraft ?? dashboardSettings.backgroundImages)]
    : [...dashboardSettings.backgroundImages];
  const remainingSlots = Math.max(0, DASHBOARD_HERO_MAX_SLIDES - (isReplacing ? currentImages.filter(Boolean).length - 1 : currentImages.length));
  const selectedFiles = isReplacing ? files.slice(0, 1) : files.slice(0, remainingSlots);

  if (!selectedFiles.length) {
    if (input) input.value = "";
    uiState.dashboardBackgroundUploadError = files.length
      ? `The dashboard can only save ${DASHBOARD_HERO_MAX_SLIDES} slides. Delete a slide before adding more.`
      : "No image files were selected.";
    renderFromCurrentState();
    return;
  }

  uiState.dashboardBackgroundUploading = true;
  uiState.dashboardBackgroundUploadError = "";
  uiState.dashboardBackgroundBatchNotice = `Selected ${files.length} image${files.length === 1 ? "" : "s"}. Uploading ${selectedFiles.length}...`;
  renderFromCurrentState();

  uploadDashboardBackgroundBatch(selectedFiles).then((results) => {
    const backgroundImages = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const failedCount = results.length - backgroundImages.length;

    if (uiState.dashboardBackgroundModalOpen) {
      const draftImages = [...(uiState.dashboardBackgroundDraft ?? dashboardSettings.backgroundImages)];
      if (isReplacing) {
        if (backgroundImages[0]) draftImages[replaceIndex] = backgroundImages[0];
        uiState.dashboardBackgroundDraft = draftImages.filter(Boolean).slice(0, DASHBOARD_HERO_MAX_SLIDES);
      } else if (backgroundImages.length) {
        uiState.dashboardBackgroundDraft = [...draftImages, ...backgroundImages].slice(0, DASHBOARD_HERO_MAX_SLIDES);
      }
    } else if (backgroundImages.length) {
      setDashboardSettings({
        ...dashboardSettings,
        backgroundImages: backgroundImages.slice(0, DASHBOARD_HERO_MAX_SLIDES),
      });
    }
    if (input) input.value = "";
    if (clearPending) uiState.dashboardBackgroundPendingFiles = [];
    uiState.dashboardBackgroundBatchNotice = backgroundImages.length
      ? `Added ${backgroundImages.length} image${backgroundImages.length === 1 ? "" : "s"} from this batch.`
      : "";
    uiState.dashboardBackgroundUploadError = failedCount
      ? `${failedCount} image${failedCount === 1 ? "" : "s"} could not be uploaded. Try those files again.`
      : "";
    renderFromCurrentState();
  }).catch((error) => {
    console.warn("LaunchFlow could not load dashboard background images.", error);
    uiState.dashboardBackgroundUploadError = `Slide upload failed: ${error?.message ?? "Please try again."}`;
    if (input) input.value = "";
    renderFromCurrentState();
  }).finally(() => {
    uiState.dashboardBackgroundUploading = false;
    renderFromCurrentState();
  });
}

async function uploadDashboardBackgroundBatch(files) {
  const results = [];
  for (const file of files) {
    try {
      results.push({ status: "fulfilled", value: await uploadDashboardBackgroundFile(file) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }
  return results;
}

function removeDashboardBackgroundFromButton(button) {
  const index = Number(button.getAttribute("data-option-index"));
  if (!Number.isInteger(index) || index < 0) return;
  uiState.dashboardBackgroundDraft = (uiState.dashboardBackgroundDraft ?? []).filter((_, itemIndex) => itemIndex !== index);
}

function reorderDashboardBackgroundSlide(fromIndex, toIndex) {
  const draftImages = [...(uiState.dashboardBackgroundDraft ?? [])];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= draftImages.length || toIndex >= draftImages.length || fromIndex === toIndex) return;

  const [movedSlide] = draftImages.splice(fromIndex, 1);
  draftImages.splice(toIndex, 0, movedSlide);
  uiState.dashboardBackgroundDraft = draftImages;
  uiState.dashboardBackgroundBatchNotice = `Moved slide ${fromIndex + 1} to position ${toIndex + 1}.`;
  uiState.dashboardBackgroundUploadError = "";
}

function saveDashboardBackgrounds() {
  if (Array.isArray(uiState.dashboardBackgroundPendingFiles) && uiState.dashboardBackgroundPendingFiles.length) {
    uiState.dashboardBackgroundUploadError = "Upload the selected images first, then click Save Slides.";
    renderFromCurrentState();
    return;
  }

  setDashboardSettings({
    ...dashboardSettings,
    backgroundImages: (uiState.dashboardBackgroundDraft ?? []).slice(0, DASHBOARD_HERO_MAX_SLIDES),
  });
  uiState.dashboardBackgroundModalOpen = false;
  uiState.dashboardBackgroundDraft = [];
  uiState.dashboardBackgroundPendingFiles = [];
  uiState.dashboardBackgroundUploadError = "";
  uiState.dashboardBackgroundBatchNotice = "";
}

async function uploadDashboardBackgroundFile(file) {
  return {
    slideId: createDashboardSlideId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.dashboardSlides, scope: "dashboard/slides" })),
  };
}

function createDashboardSlideId() {
  return `dashboard_slide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function saveLaunchPortfolioForm(form) {
  const formData = new FormData(form);
  const buttonText = String(formData.get("buttonText") ?? "").trim() || DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioButtonText;
  const portfolioUrl = normalizeLaunchPortfolioUrl(formData.get("portfolioUrl"));
  setLaunchMonitoringSettings({
    ...launchMonitoringSettings,
    portfolioButtonText: buttonText,
    portfolioUrl,
  });
  uiState.launchPortfolioModalOpen = false;
  renderFromCurrentState();
}

function isCampaignCountKey(metricKey) {
  return [
    "total",
    "sponsoredProducts",
    "sponsoredBrands",
    "sponsoredDisplay",
    "keywordTargets",
    "productTargeting",
    "videoAds",
    "autoCampaigns",
  ].includes(metricKey);
}

function getCampaignCountLabel(metricKey) {
  return {
    total: "Total Campaigns",
    sponsoredProducts: "SP Campaigns",
    sponsoredBrands: "SB Campaigns",
    sponsoredDisplay: "SD Campaigns",
    keywordTargets: "Keyword Targets",
    productTargeting: "Product Targeting",
    videoAds: "Video Ads",
    autoCampaigns: "Auto Campaigns",
  }[metricKey] ?? "Campaign Count";
}

function normalizeCampaignCount(value, fallbackValue = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackValue;
  return Math.max(0, Math.round(numericValue));
}

function renderVineWorkspace(product, stage) {
  const productId = String(product?.id ?? "");
  const metrics = getVineMetrics(productId);
  return createElement("section", { className: "vine-workspace", ariaLabel: `${stage.label} dashboard` }, [
    createElement("div", { className: "vine-workspace__cards" }, [
      renderVineMetricCard({
        title: "Enrollment Progress",
        icon: "inventory",
        value: [renderEditableVineMetric(product, "shippedUnits", metrics.shippedUnits), createElement("span", null, " / "), renderEditableVineMetric(product, "totalUnits", metrics.totalUnits), createElement("small", null, " Units")],
        helper: "100% units shipped to Amazon",
        progress: getPercent(metrics.shippedUnits, metrics.totalUnits),
      }),
      renderVineMetricCard({
        title: "Reviews Received",
        icon: "star",
        value: [renderEditableVineMetric(product, "reviewsReceived", metrics.reviewsReceived), createElement("span", null, " / "), renderEditableVineMetric(product, "reviewGoal", metrics.reviewGoal), createElement("small", null, " Claimed")],
        helper: `${getPercent(metrics.reviewsReceived, metrics.reviewGoal)}% conversion rate from claims`,
        progress: getPercent(metrics.reviewsReceived, metrics.reviewGoal),
      }),
      renderVineMetricCard({
        title: "Average Vine Rating",
        icon: "reviews",
        value: [renderEditableVineMetric(product, "averageRating", metrics.averageRating), createElement("span", { className: "vine-workspace__stars" }, renderStarRating(metrics.averageRating))],
        helper: "+0.4 higher than category avg",
        progress: Math.min(100, Math.max(0, (Number(metrics.averageRating) / 5) * 100)),
      }),
    ]),
    createElement("div", { className: "vine-workspace__main" }, [
      renderVineReviewsPanel(productId),
      renderVineFeedbackPanel(productId),
    ]),
    renderVineEntryModal(),
  ].filter(Boolean));
}

function renderVineMetricCard({ title, icon, value, helper, progress }) {
  return createElement("article", { className: "vine-workspace__metric" }, [
    createElement("div", { className: "vine-workspace__metric-head" }, [
      createElement("span", null, title),
      createIcon(icon),
    ]),
    createElement("strong", null, value),
    createElement("span", { className: "vine-workspace__progress" }, [
      createElement("span", { style: { width: `${Math.min(100, Math.max(0, progress))}%` } }),
    ]),
    createElement("em", null, helper),
  ]);
}

function renderEditableVineMetric(product, metricKey, value) {
  return createElement("b", { className: "vine-workspace__editable-number", dataAction: "edit-vine-metric", dataVineMetric: metricKey, dataProductId: product?.id ?? "", title: "Double-click to edit" }, String(value));
}

function renderVineReviewsPanel(productId) {
  const reviews = getVineReviewsForProduct(productId);
  return createElement("section", { className: "vine-workspace__reviews" }, [
    createElement("div", { className: "vine-workspace__panel-head" }, [
      createElement("h3", null, "Recent Vine Reviews"),
      canEditWorkspaceData() ? createElement("button", { className: "vine-workspace__add", type: "button", dataAction: "open-vine-entry", dataVineEntryType: "review", dataProductId: productId, ariaLabel: "Add Vine review" }, [createIcon("add")]) : null,
    ].filter(Boolean)),
    reviews.length === 0
      ? createElement("p", { className: "vine-workspace__empty" }, "No Vine reviews added yet. Use + to paste one manually.")
      : createElement("div", { className: "vine-workspace__review-list" }, reviews.map((review) => renderVineReviewCard(review, productId))),
  ]);
}

function renderVineReviewCard(review, productId) {
  return createElement("article", { className: "vine-workspace__review" }, [
    createElement("div", { className: "vine-workspace__review-meta" }, [
      createElement("span", { className: "vine-workspace__stars" }, renderStarRating(review.rating)),
      createElement("strong", null, review.reviewer),
      createElement("span", { className: "vine-workspace__voice" }, "Vine Voice"),
      createElement("time", null, review.date),
      renderVineEntryActions("review", review.id, review.title, productId),
    ]),
    createElement("h4", null, review.title),
    createElement("p", null, review.body),
  ]);
}

function renderVineFeedbackPanel(productId) {
  const feedbackEntries = getVineFeedbackForProduct(productId);
  return createElement("aside", { className: "vine-workspace__feedback" }, [
    createElement("div", { className: "vine-workspace__feedback-head" }, [
      createElement("span", { className: "vine-workspace__feedback-icon" }, [createIcon("warning")]),
      createElement("h3", null, "Actionable Feedback"),
      canEditWorkspaceData() ? createElement("button", { className: "vine-workspace__add vine-workspace__add--feedback", type: "button", dataAction: "open-vine-entry", dataVineEntryType: "feedback", dataProductId: productId, ariaLabel: "Add actionable feedback" }, [createIcon("add")]) : null,
    ].filter(Boolean)),
    createElement("p", null, "Track negative mentions from Vine reviews and log resolutions for product iteration."),
    feedbackEntries.length === 0
      ? createElement("p", { className: "vine-workspace__empty" }, "No feedback logged yet. Use + to paste feedback manually.")
      : createElement("div", { className: "vine-workspace__feedback-list" }, feedbackEntries.map((feedback) => renderVineFeedbackCard(feedback, productId))),
  ]);
}

function renderVineFeedbackCard(feedback, productId) {
  return createElement("article", { className: "vine-workspace__feedback-item" }, [
    createElement("span", { className: "vine-workspace__issue" }, `Issue: ${feedback.issue}`),
    createElement("span", { className: `vine-workspace__status ${feedback.status.toLowerCase() === "resolved" ? "vine-workspace__status--resolved" : ""}`.trim() }, feedback.status),
    renderVineEntryActions("feedback", feedback.id, feedback.issue, productId),
    createElement("p", null, feedback.body),
    createElement("small", null, `Logged: ${feedback.loggedAt}`),
  ]);
}

function renderVineEntryActions(type, entryId, label, productId) {
  if (!canEditWorkspaceData()) return null;
  return createElement("span", { className: "vine-workspace__entry-actions" }, [
    createElement("button", {
      type: "button",
      dataAction: "open-vine-entry",
      dataVineEntryType: type,
      dataVineEntryId: entryId,
      dataProductId: productId,
      ariaLabel: `Edit ${label}`,
      title: "Edit",
    }, [createIcon("edit")]),
    createElement("button", {
      type: "button",
      dataAction: "delete-vine-entry",
      dataVineEntryType: type,
      dataVineEntryId: entryId,
      dataProductId: productId,
      ariaLabel: `Delete ${label}`,
      title: "Delete",
    }, [createIcon("delete")]),
  ]);
}

function renderVineEntryModal() {
  if (!uiState.vineEntryModal) return null;
  const isFeedback = uiState.vineEntryModal.type === "feedback";
  const entryId = uiState.vineEntryModal.entryId ?? "";
  const productId = uiState.vineEntryModal.productId ?? "";
  const entry = getVineEntryById(uiState.vineEntryModal.type, entryId, productId);
  const isEditing = Boolean(entry);
  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", { className: "workspace-modal__dialog", dataAction: "save-vine-entry", dataVineEntryType: uiState.vineEntryModal.type, dataVineEntryId: entryId, dataProductId: productId, role: "dialog", ariaModal: "true", ariaLabel: isFeedback ? `${isEditing ? "Edit" : "Add"} actionable feedback` : `${isEditing ? "Edit" : "Add"} Vine review` }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, isFeedback ? `${isEditing ? "Edit" : "Add"} Actionable Feedback` : `${isEditing ? "Edit" : "Add"} Vine Review`),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-vine-entry", ariaLabel: "Close Vine entry dialog" }, [createIcon("close")]),
      ]),
      isFeedback ? renderVineFeedbackFormFields(entry) : renderVineReviewFormFields(entry),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-vine-entry" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, isEditing ? "Save Changes" : "Save Entry"),
      ]),
    ]),
  ]);
}

function renderVineReviewFormFields(review = null) {
  return [
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Reviewer"), createElement("input", { className: "form-input", name: "reviewer", type: "text", placeholder: "Example: John D.", value: review?.reviewer ?? "", required: true })]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Rating"), createElement("input", { className: "form-input", name: "rating", type: "number", step: "0.1", placeholder: "5", value: review?.rating ?? "", required: true })]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Review Title"), createElement("input", { className: "form-input", name: "title", type: "text", placeholder: "Paste review headline...", value: review?.title ?? "", required: true })]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Review Text"), createElement("textarea", { className: "form-input", name: "body", rows: 5, placeholder: "Paste the Vine review here...", required: true }, review?.body ?? "")]),
  ];
}

function renderVineFeedbackFormFields(feedback = null) {
  const selectedStatus = feedback?.status ?? "Pending";
  return [
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Issue"), createElement("input", { className: "form-input", name: "issue", type: "text", placeholder: "Example: Comfort", value: feedback?.issue ?? "", required: true })]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Status"), createElement("select", { className: "form-input", name: "status" }, ["Pending", "Resolved"].map((status) => createElement("option", { value: status, selected: selectedStatus === status }, status)))]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Feedback"), createElement("textarea", { className: "form-input", name: "body", rows: 5, placeholder: "Paste actionable feedback here...", required: true }, feedback?.body ?? "")]),
  ];
}

function renderStarRating(rating) {
  const roundedRating = Math.round(Number(rating) || 0);
  return Array.from({ length: 5 }, (_, index) => index < roundedRating ? "★" : "☆").join("");
}

function getVineMetrics(productId = "") {
  return getVineMetricsForProduct(productId);
}

function getPercent(value, total) {
  const numericValue = Number(value);
  const numericTotal = Number(total);
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericTotal) || numericTotal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((numericValue / numericTotal) * 100)));
}

function editVineMetricFromElement(element) {
  const metricKey = element.getAttribute("data-vine-metric");
  if (!isVineMetricKey(metricKey) || typeof window === "undefined" || typeof window.prompt !== "function") return;
  const productId = element.getAttribute("data-product-id") || getSelectedProduct()?.id || "";
  if (!productId) return;
  const currentMetrics = getVineMetricsForProduct(productId);
  const currentValue = currentMetrics[metricKey];
  const nextValue = window.prompt(`Edit ${getVineMetricLabel(metricKey)}`, String(currentValue));
  if (nextValue === null) return;

  const normalizedValue = metricKey === "averageRating" ? normalizeVineRating(nextValue, currentValue) : normalizeCampaignCount(nextValue, currentValue);
  setVineSettings({
    ...vineSettings,
    metricsByProductId: {
      ...vineSettings.metricsByProductId,
      [productId]: {
        ...currentMetrics,
        [metricKey]: normalizedValue,
      },
    },
  });
  recordActivity({
    icon: "star",
    label: `Updated Vine metric: ${getVineMetricLabel(metricKey)}`,
    detail: String(normalizedValue),
    stageId: "enrolled-to-vines",
  });
}

function saveVineEntryForm(form) {
  const entryType = form.getAttribute("data-vine-entry-type");
  const entryId = form.getAttribute("data-vine-entry-id") ?? "";
  const productId = form.getAttribute("data-product-id") || uiState.vineEntryModal?.productId || "";
  if (!productId) return;
  const formData = new FormData(form);
  if (entryType === "review") {
    const currentReviews = getVineReviewsForProduct(productId);
    const existingReview = getVineEntryById("review", entryId, productId);
    const review = normalizeVineReview({
      id: existingReview?.id,
      reviewer: formData.get("reviewer"),
      rating: formData.get("rating"),
      title: formData.get("title"),
      body: formData.get("body"),
      date: existingReview?.date ?? new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    });
    if (!review) return;
    const nextReviews = existingReview
      ? currentReviews.map((item) => item.id === existingReview.id ? review : item)
      : [review, ...currentReviews];
    setVineSettings(setProductScopedVineEntries(vineSettings, "reviewsByProductId", productId, nextReviews));
    recordActivity({
      icon: "star",
      label: `${existingReview ? "Updated" : "Added"} Vine review: ${review.title}`,
      detail: `${review.reviewer} • ${review.rating}/5 rating`,
      stageId: "enrolled-to-vines",
    });
  }

  if (entryType === "feedback") {
    const currentFeedback = getVineFeedbackForProduct(productId);
    const existingFeedback = getVineEntryById("feedback", entryId, productId);
    const feedback = normalizeVineFeedback({
      id: existingFeedback?.id,
      issue: formData.get("issue"),
      status: formData.get("status"),
      body: formData.get("body"),
      loggedAt: existingFeedback?.loggedAt ?? new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
    if (!feedback) return;
    const nextFeedback = existingFeedback
      ? currentFeedback.map((item) => item.id === existingFeedback.id ? feedback : item)
      : [feedback, ...currentFeedback];
    setVineSettings(setProductScopedVineEntries(vineSettings, "feedbackByProductId", productId, nextFeedback));
    recordActivity({
      icon: "feedback",
      label: `${existingFeedback ? "Updated" : "Added"} Vine feedback: ${feedback.issue}`,
      detail: feedback.body,
      stageId: "enrolled-to-vines",
    });
  }

  uiState.vineEntryModal = null;
  renderFromCurrentState();
}

function getVineEntryById(type, entryId, productId) {
  if (!entryId) return null;
  const entries = type === "feedback"
    ? getVineFeedbackForProduct(productId)
    : type === "review"
      ? getVineReviewsForProduct(productId)
      : [];
  return entries.find((entry) => entry.id === entryId) ?? null;
}

function deleteVineEntry(type, entryId, productId) {
  const entry = getVineEntryById(type, entryId, productId);
  if (!entry) return;
  const label = type === "feedback" ? entry.issue : entry.title;
  const confirmMessage = type === "feedback"
    ? `Delete actionable feedback "${label}"?`
    : `Delete Vine review "${label}"?`;
  if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmMessage)) return;

  if (type === "review") {
    setVineSettings(setProductScopedVineEntries(
      vineSettings,
      "reviewsByProductId",
      productId,
      getVineReviewsForProduct(productId).filter((review) => review.id !== entryId),
    ));
  } else if (type === "feedback") {
    setVineSettings(setProductScopedVineEntries(
      vineSettings,
      "feedbackByProductId",
      productId,
      getVineFeedbackForProduct(productId).filter((feedback) => feedback.id !== entryId),
    ));
  }
  recordActivity({
    icon: type === "feedback" ? "feedback" : "star",
    label: `Deleted ${type === "feedback" ? "Vine feedback" : "Vine review"}: ${label}`,
    detail: "",
    stageId: "enrolled-to-vines",
  });
  renderFromCurrentState();
}

function isVineMetricKey(metricKey) {
  return ["shippedUnits", "totalUnits", "reviewsReceived", "reviewGoal", "averageRating"].includes(metricKey);
}

function getVineMetricLabel(metricKey) {
  return {
    shippedUnits: "Shipped Units",
    totalUnits: "Total Units",
    reviewsReceived: "Reviews Received",
    reviewGoal: "Review Goal",
    averageRating: "Average Vine Rating",
  }[metricKey] ?? "Vine Metric";
}

function normalizeVineRating(value, fallbackValue = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackValue;
  return Math.min(5, Math.max(0, Math.round(numericValue * 10) / 10));
}

function renderWorkspaceChecklist(product, stage, stageDetails) {
  const tasks = stageDetails.checklistTasks;
  const completedCount = tasks.filter((task) => task.isCompleted).length;
  const checklistKey = getChecklistCollapseKey(product.id, stage.stage_id);
  const isCollapsed = !uiState.expandedChecklistIds.has(checklistKey);
  const shouldHideCompleted = uiState.hiddenCompletedChecklistIds.has(checklistKey);
  const visibleTasks = shouldHideCompleted ? tasks.filter((task) => !task.isCompleted) : tasks;

  return createElement("section", {
    className: `workspace-checklist ${isCollapsed ? "workspace-checklist--collapsed" : ""}`,
    ariaLabel: `${stage.label} checklist`,
  }, [
    createElement("div", { className: "workspace-checklist__header" }, [
      createElement("button", {
        className: "workspace-checklist__collapse",
        type: "button",
        dataAction: "toggle-workspace-checklist-panel",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        ariaExpanded: isCollapsed ? "false" : "true",
      }, [
        createElement("h3", null, `Pipeline Checklist: ${stage.label}`),
        createElement("span", { className: "workspace-checklist__summary" }, [
          createElement("span", null, `${completedCount}/${tasks.length} complete`),
          createIcon(isCollapsed ? "expand_more" : "expand_less"),
        ]),
      ]),
      createElement("button", {
        className: `workspace-checklist__hide-toggle ${shouldHideCompleted ? "workspace-checklist__hide-toggle--active" : ""}`,
        type: "button",
        dataAction: "toggle-workspace-checklist-completed",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        ariaPressed: shouldHideCompleted ? "true" : "false",
      }, shouldHideCompleted ? "Show done" : "Hide done"),
    ]),
    isCollapsed
      ? null
      : createElement("div", { className: "workspace-checklist__content" }, [
        renderWorkspaceChecklistItems(product, stage, tasks, visibleTasks, shouldHideCompleted),
        renderWorkspaceChecklistForm(product, stage),
      ]),
  ]);
}

function renderWorkspaceChecklistItems(product, stage, tasks, visibleTasks, shouldHideCompleted) {
  if (tasks.length === 0) {
    return createElement("p", { className: "workspace-checklist__empty" }, "No checklist items yet. Add the exact tasks you want to track for this product and stage.");
  }

  if (visibleTasks.length === 0 && shouldHideCompleted) {
    return createElement("p", { className: "workspace-checklist__empty" }, "Completed tasks are hidden. Use Show done to review them again.");
  }

  return createElement("div", { className: "workspace-checklist__items" }, visibleTasks.map((task) => renderWorkspaceChecklistTask(product, stage, task)));
}

function renderWorkspaceChecklistTask(product, stage, task) {
  const canManageTask = canManageChecklistTasks();
  return createElement("article", {
    className: `workspace-checklist__item ${task.isCompleted ? "workspace-checklist__item--complete" : ""}`,
    dataAction: "checklist-drop",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataChecklistDropId: task.taskId,
  }, [
    canManageTask ? createElement("button", {
      className: "workspace-checklist__drag-handle",
      type: "button",
      draggable: true,
      dataAction: "drag-checklist",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataChecklistId: task.taskId,
      ariaLabel: `Drag ${task.name} to reorder`,
    }, [createIcon("drag_indicator")]) : null,
    createElement("label", { className: "workspace-checklist__task-label" }, [
      createElement("input", {
        type: "checkbox",
        checked: task.isCompleted,
        dataAction: "toggle-workspace-checklist",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataChecklistId: task.taskId,
        disabled: !canManageTask,
      }),
      createElement("span", null, task.name),
    ]),
    createElement("span", { className: "workspace-checklist__meta" }, task.isCompleted ? `Completed ${formatCompletionDate(task.completedAt)}` : "In progress"),
    canManageTask ? createElement("button", {
      className: `workspace-checklist__note-button ${task.note ? "workspace-checklist__note-button--active" : ""}`,
      type: "button",
      dataAction: "open-checklist-note",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataChecklistId: task.taskId,
      ariaLabel: `Edit notes for ${task.name}`,
    }, [createIcon("sticky_note_2")]) : null,
    canManageTask ? createElement("span", { className: "workspace-checklist__actions" }, [
      createElement("button", {
        className: "workspace-checklist__icon-button",
        type: "button",
        dataAction: "edit-workspace-checklist",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataChecklistId: task.taskId,
        ariaLabel: `Edit ${task.name}`,
      }, [createIcon("edit")]),
      createElement("button", {
        className: "workspace-checklist__icon-button workspace-checklist__icon-button--danger",
        type: "button",
        dataAction: "delete-workspace-checklist",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataChecklistId: task.taskId,
        ariaLabel: `Delete ${task.name}`,
      }, [createIcon("delete")]),
    ]) : null,
  ].filter(Boolean));
}

function renderWorkspaceChecklistForm(product, stage) {
  if (!canManageChecklistTasks()) return null;
  return createElement("form", { className: "workspace-checklist__form", dataAction: "add-workspace-checklist", dataProductId: product.id, dataStageId: stage.stage_id }, [
    createElement("input", { className: "form-input", name: "taskName", type: "text", placeholder: "Add a checklist task...", required: true }),
    createElement("button", { className: "button-secondary", type: "submit" }, "+ Add Task"),
  ]);
}

function renderChecklistNoteModal() {
  if (!uiState.checklistNoteModal) return null;

  const { productId, stageId, checklistId } = uiState.checklistNoteModal;
  const stageDetails = getWorkspaceStageDetails(productId, stageId);
  const task = stageDetails.checklistTasks.find((item) => item.taskId === checklistId);
  if (!task) return null;

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog",
      dataAction: "save-checklist-note",
      dataProductId: productId,
      dataStageId: stageId,
      dataChecklistId: checklistId,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: `Checklist notes for ${task.name}`,
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, "Checklist Notes"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-checklist-note", ariaLabel: "Close checklist notes" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, task.name),
        createElement("textarea", { className: "form-input workspace-field__textarea", name: "taskNote", rows: 5, placeholder: "Add notes for this checklist item...", value: task.note ?? "" }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-checklist-note" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Save Notes"),
      ]),
    ]),
  ]);
}

function renderProductChatModal() {
  const productId = uiState.activeChatProductId;
  const product = getProductById(productId);
  if (!product) return null;

  const chatMessages = getWorkspaceProductDetails(product.id).chatMessages ?? [];
  const filteredChatMessages = getFilteredChatMessages(chatMessages, uiState.chatSearchQuery);
  const assets = getFilteredChatAssets(getProductChatAssets(chatMessages), uiState.chatSearchQuery);
  const fileInputId = `chat-file-input-${product.id}`;

  return createElement("div", { className: "product-chat-modal", role: "presentation" }, [
    createElement("section", { className: "product-chat", role: "dialog", ariaModal: "true", ariaLabel: `${product.name} chat` }, [
      createElement("header", { className: "product-chat__header" }, [
        createElement("div", { className: "product-chat__product" }, [
          renderProductThumbnail(product, "product-chat__avatar"),
          createElement("div", null, [
            createElement("h2", null, product.name),
            createElement("p", { className: "product-chat__meta" }, ["SKU: ", product.sku || "N/A"]),
            createElement("p", { className: "product-chat__meta" }, ["ASIN: ", renderAsinValue(product)]),
          ]),
        ]),
        createElement("div", { className: "product-chat__tools" }, [
          createElement("button", { className: "product-chat__tool", type: "button", ariaLabel: "Call placeholder" }, [createIcon("call")]),
          createElement("button", { className: "product-chat__tool", type: "button", ariaLabel: "Video placeholder" }, [createIcon("videocam")]),
          createElement("button", { className: `product-chat__tool ${uiState.chatAssetsOpen ? "product-chat__tool--active" : ""}`, type: "button", dataAction: "toggle-chat-assets", ariaLabel: "Review chat files and links" }, [createIcon("folder")]),
          createElement("button", { className: `product-chat__tool ${uiState.chatSearchOpen ? "product-chat__tool--active" : ""}`, type: "button", dataAction: "toggle-chat-search", ariaLabel: "Search this product chat" }, [createIcon("search")]),
          createElement("button", { className: "product-chat__tool", type: "button", dataAction: "close-product-chat", ariaLabel: "Close chat" }, [createIcon("close")]),
        ]),
      ]),
      uiState.chatSearchOpen ? renderProductChatSearch(filteredChatMessages.length, chatMessages.length, assets.length) : null,
      createElement("div", { className: "product-chat__body" }, [
        createElement("main", { className: "product-chat__messages", ariaLabel: `${product.name} chat history` }, [
          createElement("span", { className: "product-chat__date" }, formatChatDate(filteredChatMessages[0]?.createdAt ?? chatMessages[0]?.createdAt ?? new Date().toISOString())),
          chatMessages.length === 0
            ? createElement("p", { className: "product-chat__empty" }, "No chat history yet. Send a note, link, image, video, or file for this product.")
            : filteredChatMessages.length === 0
              ? createElement("p", { className: "product-chat__empty" }, "No chat messages or files match that search.")
              : filteredChatMessages.map((message) => renderProductChatMessage(message)),
        ]),
      ]),
      renderProductChatComposer(product, fileInputId),
      renderChatAttachmentPreview(chatMessages),
      renderChatReplyPreview(chatMessages),
    ]),
    uiState.chatAssetsOpen ? renderProductChatAssetsPanel(assets) : null,
  ]);
}

function renderProductHistoryModal() {
  const modal = uiState.productHistoryModal;
  if (!modal) return null;
  const product = getEditableProduct(modal.productId);
  const history = getProductHistory(modal.productId);
  const productName = product?.name || history[0]?.productName || "Product";

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("section", { className: "workspace-modal__dialog workspace-history-modal product-history-modal", role: "dialog", ariaModal: "true", ariaLabel: `${productName} product history` }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("div", { className: "workspace-history-modal__title" }, [
          createElement("h3", null, "Product History"),
          createElement("p", null, productName),
        ]),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-product-history", ariaLabel: "Close product history" }, [createIcon("close")]),
      ]),
      history.length
        ? createElement("div", { className: "workspace-history-list" }, history.map(renderProductHistoryItem))
        : createElement("p", { className: "dashboard-empty" }, "No history recorded for this product yet."),
    ]),
  ]);
}

function renderDeletedProductHistoryModal() {
  if (!uiState.deletedProductHistoryModalOpen) return null;
  const stageId = uiState.deletedProductHistoryStageId || uiState.selectedStageId;
  const stageLabel = getActivityStageLabel(stageId) || "this tab";
  const history = getDeletedProductHistory(stageId);

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("section", { className: "workspace-modal__dialog workspace-history-modal product-history-modal", role: "dialog", ariaModal: "true", ariaLabel: "Deleted product history" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("div", { className: "workspace-history-modal__title" }, [
          createElement("h3", null, "Deleted Products"),
          createElement("p", null, `Restore deleted products from ${stageLabel}.`),
        ]),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-deleted-product-history", ariaLabel: "Close deleted product history" }, [createIcon("close")]),
      ]),
      history.length
        ? createElement("div", { className: "workspace-history-list product-recovery-list" }, history.map(renderDeletedProductHistoryItem))
        : createElement("p", { className: "dashboard-empty" }, "No deleted products recorded yet."),
    ]),
  ]);
}

function renderDeletedProductHistoryItem(entry) {
  const restorePending = isPendingProductAction("restore", entry.id);
  const deleteForeverPending = isPendingProductAction("delete-forever", entry.id);
  const actionPending = restorePending || deleteForeverPending;
  const canRestore = restorePending || canRestoreProductHistory(entry);
  const canDeleteForever = deleteForeverPending || canPermanentlyDeleteProductHistory(entry);
  const product = entry?.previousProduct?.product ?? {};
  const productName = String(product.name || "Deleted product");
  const sku = String(product.sku || "N/A");
  const asin = String(product.asin || "N/A");
  const deletedBy = entry.changedByName || "Unknown user";
  const deletedAt = formatActivityTimestamp(entry.timestamp);

  return createElement("article", { className: "workspace-history-item product-recovery-item" }, [
    createElement("div", { className: "product-recovery-item__summary" }, [
      createElement("strong", null, "Deleted Product."),
      createElement("p", null, productName),
      createElement("span", null, `SKU: ${sku} - ASIN: ${asin}`),
      createElement("small", null, `${deletedAt} - Deleted by ${deletedBy}`),
    ]),
    canRestore || canDeleteForever ? createElement("div", { className: "workspace-history-item__actions product-recovery-item__actions" }, [
      canRestore ? createElement("button", {
        className: "button-secondary workspace-history-item__restore",
        type: "button",
        dataAction: "restore-product-history",
        dataHistoryEntryId: entry.id,
        disabled: actionPending,
      }, [restorePending ? renderActionSpinner("product-action-spinner") : createIcon("restore"), createElement("span", null, restorePending ? "Restoring..." : "Restore")]) : null,
      canDeleteForever ? createElement("button", {
        className: "button-secondary workspace-history-item__delete",
        type: "button",
        dataAction: "delete-product-history-forever",
        dataHistoryEntryId: entry.id,
        disabled: actionPending,
      }, [deleteForeverPending ? renderActionSpinner("product-action-spinner") : createIcon("delete"), createElement("span", null, deleteForeverPending ? "Deleting..." : "Delete forever")]) : null,
    ].filter(Boolean)) : null,
  ].filter(Boolean));
}

function renderProductHistoryItem(entry) {
  const restorePending = isPendingProductAction("restore", entry.id);
  const deleteForeverPending = isPendingProductAction("delete-forever", entry.id);
  const actionPending = restorePending || deleteForeverPending;
  const canRestore = restorePending || canRestoreProductHistory(entry);
  const canDeleteForever = deleteForeverPending || canPermanentlyDeleteProductHistory(entry);
  const diffs = getProductHistoryDiffs(entry);
  return createElement("article", { className: "workspace-history-item product-history-item" }, [
    createElement("div", { className: "workspace-history-item__header" }, [
      createElement("strong", null, getProductHistoryActionLabel(entry)),
      createElement("span", null, `${entry.changedByName || "Unknown user"} • ${formatActivityTimestamp(entry.timestamp)}`),
    ]),
    diffs.length
      ? createElement("div", { className: "product-history-diff-list" }, diffs.map((diff) =>
        createElement("div", { className: "product-history-diff" }, [
          createElement("strong", null, diff.label),
          createElement("div", { className: "workspace-history-item__values" }, [
            createElement("div", null, [
              createElement("span", null, "Before"),
              createElement("p", null, diff.before),
            ]),
            createElement("div", null, [
              createElement("span", null, "After"),
              createElement("p", null, diff.after),
            ]),
          ]),
        ]),
      ))
      : createElement("p", { className: "dashboard-empty" }, "No product fields changed."),
    canRestore || canDeleteForever ? createElement("div", { className: "workspace-history-item__actions" }, [
      canRestore ? createElement("button", {
        className: "button-secondary workspace-history-item__restore",
        type: "button",
        dataAction: "restore-product-history",
        dataHistoryEntryId: entry.id,
        disabled: actionPending,
      }, [restorePending ? renderActionSpinner("product-action-spinner") : createIcon("restore"), createElement("span", null, restorePending ? "Restoring..." : "Restore")]) : null,
      canDeleteForever ? createElement("button", {
        className: "button-secondary workspace-history-item__delete",
        type: "button",
        dataAction: "delete-product-history-forever",
        dataHistoryEntryId: entry.id,
        disabled: actionPending,
      }, [deleteForeverPending ? renderActionSpinner("product-action-spinner") : createIcon("delete"), createElement("span", null, deleteForeverPending ? "Deleting..." : "Delete forever")]) : null,
    ].filter(Boolean)) : null,
  ].filter(Boolean));
}

function renderProductChatSearch(matchCount, totalCount, assetCount) {
  return createElement("div", { className: "product-chat-search" }, [
    createIcon("search"),
    createElement("input", { className: "product-chat-search__input", type: "search", value: uiState.chatSearchQuery, placeholder: "Search messages, PDFs, images, videos, or links...", dataAction: "update-chat-search", ariaLabel: "Search this product chat" }),
    createElement("span", { className: "product-chat-search__meta" }, uiState.chatSearchQuery ? `${matchCount}/${totalCount} chats · ${assetCount} files/links` : "Search all chat history and files"),
    uiState.chatSearchQuery ? createElement("button", { className: "product-chat-search__clear", type: "button", dataAction: "clear-chat-search", ariaLabel: "Clear chat search" }, [createIcon("close")]) : null,
  ].filter(Boolean));
}

function renderProductChatMessage(message) {
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
  const isOwnMessage = isOwnChatMessage(message);
  const messageClass = `product-chat-message product-chat-message--${isOwnMessage ? "user" : "partner"}`;
  const senderName = getChatMessageSenderName(message);
  const senderAvatar = getChatMessageSenderAvatar(message);
  const replyPreview = message.replyTo ? normalizeChatReplyPreview(message.replyTo) : null;
  const deletePending = uiState.deletingChatMessageIds.has(message.messageId);
  const bubbleChildren = [
    replyPreview ? createElement("button", {
      className: "product-chat-message__reply-preview",
      type: "button",
      dataAction: "open-chat-reply-preview",
      dataMessageId: message.messageId,
      ariaLabel: `Open message from ${replyPreview.senderName}`,
    }, [
      createElement("span", null, `Replying to ${replyPreview.senderName}`),
      createElement("small", null, getChatReplySummary(replyPreview)),
    ]) : null,
    message.text ? renderChatText(message.text) : null,
  ].flat().filter(Boolean);

  return createElement("article", { className: messageClass }, [
    createElement("div", { className: "product-chat-message__content" }, [
      createElement("div", { className: "product-chat-message__identity" }, [
        renderChatMessageAvatar(senderAvatar, senderName),
        createElement("div", { className: "product-chat-message__meta" }, [
          createElement("strong", null, senderName),
          createElement("time", { dateTime: message.createdAt }, formatChatTime(message.createdAt)),
          message.editedAt ? createElement("small", null, "edited") : null,
        ].filter(Boolean)),
      ].filter(Boolean)),
      bubbleChildren.length ? createElement("div", { className: "product-chat-message__bubble" }, bubbleChildren) : null,
      hasAttachments ? createElement("div", { className: "product-chat-message__attachments" }, message.attachments.map(renderChatAttachment)) : null,
      createElement("div", { className: "product-chat-message__actions" }, [
        createElement("button", { type: "button", dataAction: "reply-to-chat-message", dataMessageId: message.messageId, disabled: deletePending }, "Reply"),
        isOwnMessage && message.text ? createElement("button", { type: "button", dataAction: "edit-chat-message", dataMessageId: message.messageId, disabled: deletePending }, "Edit") : null,
        isOwnMessage ? createElement("button", { type: "button", dataAction: "delete-chat-message", dataMessageId: message.messageId, disabled: deletePending }, [
          deletePending ? renderActionSpinner("product-chat-message__action-spinner") : null,
          createElement("span", null, deletePending ? "Deleting..." : "Delete"),
        ].filter(Boolean)) : null,
      ].filter(Boolean)),
    ].filter(Boolean)),
  ].filter(Boolean));
}

function renderChatMessageAvatar(avatarUrl, senderName) {
  return avatarUrl
    ? createElement("span", { className: "product-chat-message__avatar product-chat-message__avatar--image" }, [
      createElement("img", { src: avatarUrl, alt: `${senderName} avatar` }),
    ])
    : createElement("span", { className: "product-chat-message__avatar" }, getTeamUserInitials(senderName));
}

function isSafeExternalUrl(url) {
  try {
    const parsedUrl = new URL(normalizeChatUrl(url));
    return ["http:", "https:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function normalizeChatUrl(url) {
  const cleanUrl = String(url ?? "").replace(/[),.;!?]+$/, "");
  return /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
}

function renderChatText(text) {
  return String(text).split("\n").map((line) => renderChatTextLine(line));
}

function renderChatTextLine(line) {
  const cleanLine = String(line);
  const isBullet = cleanLine.trimStart().startsWith("•");
  const lineContent = isBullet ? cleanLine.trimStart().slice(1).trimStart() : cleanLine;
  return createElement("div", { className: `product-chat-message__line ${isBullet ? "product-chat-message__line--bullet" : ""}` }, renderChatInlineText(lineContent || " "));
}

function renderChatInlineText(text) {
  const nodes = [];
  const pattern = /((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?)|\*\*([^*]+)\*\*|_([^_]+)_/gi;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(createElement("span", null, text.slice(lastIndex, match.index)));
    if (match[1]) {
      const safeHref = normalizeChatUrl(match[1]);
      nodes.push(isSafeExternalUrl(match[1])
        ? createElement("a", { href: safeHref, target: "_blank", rel: "noopener noreferrer" }, match[1])
        : createElement("span", null, match[1]));
    } else if (match[2]) {
      nodes.push(createElement("strong", null, match[2]));
    } else if (match[3]) {
      nodes.push(createElement("em", null, match[3]));
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(createElement("span", null, text.slice(lastIndex)));
  return nodes.length > 0 ? nodes : [createElement("span", null, text)];
}

function renderChatAttachment(attachment) {
  if (attachment.type?.startsWith("image/")) {
    return createElement("figure", { className: "product-chat-attachment product-chat-attachment--media" }, [
      createElement("button", { className: "product-chat-attachment__preview", type: "button", dataAction: "open-chat-attachment-preview", dataAttachmentId: attachment.attachmentId, ariaLabel: `Enlarge ${attachment.name}` }, [
        createElement("img", { src: getStorageAssetUrl(attachment), alt: attachment.name }),
      ]),
      createElement("figcaption", null, attachment.name),
    ]);
  }

  if (attachment.type?.startsWith("video/")) {
    return createElement("figure", { className: "product-chat-attachment product-chat-attachment--media" }, [
      createElement("button", { className: "product-chat-attachment__preview", type: "button", dataAction: "open-chat-attachment-preview", dataAttachmentId: attachment.attachmentId, ariaLabel: `Enlarge ${attachment.name}` }, [
        createElement("video", { src: getStorageAssetUrl(attachment), preload: "metadata" }),
      ]),
      createElement("figcaption", null, attachment.name),
    ]);
  }

  return createElement("a", { className: "product-chat-attachment product-chat-attachment--file", href: getStorageAssetUrl(attachment), download: attachment.name }, [
    createIcon("description"),
    createElement("span", null, [
      createElement("strong", null, attachment.name),
      createElement("small", null, `${formatFileSize(attachment.size)} · ${attachment.type || "File"}`),
    ]),
    createIcon("download"),
  ]);
}

function renderProductChatAssetsPanel(assets) {
  const groupedAssets = groupProductChatAssets(assets);
  return createElement("aside", { className: "product-chat-assets", ariaLabel: "Chat files and links" }, [
    createElement("div", { className: "product-chat-assets__header" }, [
      createElement("h3", null, "Files & Links"),
      createElement("button", { className: "product-chat-assets__close", type: "button", dataAction: "close-chat-assets", ariaLabel: "Close files and links" }, [createIcon("close")]),
    ]),
    uiState.chatSearchQuery ? createElement("p", { className: "product-chat-assets__filter-note" }, `Filtered by “${uiState.chatSearchQuery}”`) : null,
    [
      renderProductChatAssetGroup("Images", groupedAssets.images, "image"),
      renderProductChatAssetGroup("Videos", groupedAssets.videos, "movie"),
      renderProductChatAssetGroup("Files", groupedAssets.files, "description"),
      renderProductChatAssetGroup("Links", groupedAssets.links, "link"),
    ],
  ]);
}

function renderProductChatAssetGroup(label, assets, icon) {
  return createElement("details", { className: "product-chat-assets__group", open: assets.length > 0 }, [
    createElement("summary", null, [createIcon(icon), createElement("span", null, `${label} (${assets.length})`)]),
    assets.length === 0
      ? createElement("p", null, "Nothing sent yet.")
      : createElement("div", { className: "product-chat-assets__list" }, assets.map(renderProductChatAssetItem)),
  ]);
}

function renderProductChatAssetItem(asset) {
  return asset.kind === "link"
    ? createElement("a", { className: "product-chat-assets__item", href: asset.url, target: "_blank", rel: "noopener noreferrer" }, [createIcon("link"), createElement("span", null, asset.url)])
    : createElement("a", { className: "product-chat-assets__item", href: getStorageAssetUrl(asset), download: asset.name }, [createIcon(asset.type.startsWith("image/") ? "image" : asset.type.startsWith("video/") ? "movie" : "description"), createElement("span", null, asset.name)]);
}

function renderChatAttachmentPreview(messages) {
  if (!uiState.chatAttachmentPreview) return null;
  const attachment = messages.flatMap((message) => message.attachments ?? []).find((item) => item.attachmentId === uiState.chatAttachmentPreview);
  if (!attachment) return null;

  return createElement("div", { className: "product-chat-preview", role: "presentation" }, [
    createElement("div", { className: "product-chat-preview__dialog", role: "dialog", ariaModal: "true", ariaLabel: attachment.name }, [
      createElement("button", { className: "product-chat-preview__close", type: "button", dataAction: "close-chat-attachment-preview", ariaLabel: "Close preview" }, [createIcon("close")]),
      attachment.type.startsWith("video/")
        ? createElement("video", { src: getStorageAssetUrl(attachment), controls: true, preload: "metadata" })
        : createElement("img", { src: getStorageAssetUrl(attachment), alt: attachment.name }),
    ]),
  ]);
}

function renderChatReplyPreview(messages) {
  if (!uiState.chatReplyPreview) return null;
  const snapshot = normalizeChatReplyPreview(uiState.chatReplyPreview);
  if (!snapshot) return null;

  const originalMessage = messages.find((message) => message.messageId === snapshot.messageId);
  const preview = originalMessage ? createChatReplyPreview(originalMessage) : snapshot;
  const senderName = preview.senderName || "Teammate";
  const senderAvatar = originalMessage ? getChatMessageSenderAvatar(originalMessage) : "";
  const messageTime = preview.createdAt ? `${formatChatDate(preview.createdAt)} - ${formatChatTime(preview.createdAt)}` : "";
  const attachments = originalMessage?.attachments ?? [];

  return createElement("div", { className: "product-chat-reply-preview", role: "presentation" }, [
    createElement("section", { className: "product-chat-reply-preview__dialog", role: "dialog", ariaModal: "true", ariaLabel: `Message from ${senderName}` }, [
      createElement("header", { className: "product-chat-reply-preview__header" }, [
        renderChatMessageAvatar(senderAvatar, senderName),
        createElement("div", null, [
          createElement("strong", null, senderName),
          messageTime ? createElement("time", { dateTime: preview.createdAt }, messageTime) : null,
        ].filter(Boolean)),
        createElement("button", { className: "product-chat-reply-preview__close", type: "button", dataAction: "close-chat-reply-preview", ariaLabel: "Close replied message" }, "Close"),
      ].filter(Boolean)),
      preview.text
        ? createElement("div", { className: "product-chat-reply-preview__body" }, renderChatText(preview.text))
        : createElement("p", { className: "product-chat-reply-preview__empty" }, "This message only has an attachment."),
      attachments.length
        ? createElement("div", { className: "product-chat-reply-preview__attachments" }, attachments.map((attachment) =>
          createElement("button", { type: "button", dataAction: "open-chat-attachment-preview", dataAttachmentId: attachment.attachmentId }, [
            createIcon(attachment.type.startsWith("image/") ? "image" : attachment.type.startsWith("video/") ? "movie" : "description"),
            createElement("span", null, attachment.name),
          ]),
        ))
        : preview.attachmentCount
          ? createElement("p", { className: "product-chat-reply-preview__empty" }, `${preview.attachmentCount} attachment${preview.attachmentCount === 1 ? "" : "s"} included.`)
          : null,
    ].filter(Boolean)),
  ]);
}

function renderPendingChatAttachments() {
  if (!uiState.chatUploadingFiles && uiState.pendingChatAttachments.length === 0) return null;

  const pendingItems = uiState.pendingChatAttachments.map((attachment) =>
    createElement("span", { className: "product-chat-pending__item" }, [
      createIcon(attachment.type.startsWith("image/") ? "image" : attachment.type.startsWith("video/") ? "movie" : "description"),
      createElement("span", null, attachment.name),
      createElement("button", { className: "product-chat-pending__remove", type: "button", dataAction: "remove-pending-chat-file", dataAttachmentId: attachment.attachmentId, ariaLabel: `Remove ${attachment.name}` }, [createIcon("close")]),
    ]),
  );

  return createElement("div", { className: "product-chat-pending", ariaLabel: "Files ready to send" }, [
    uiState.chatUploadingFiles
      ? createElement("span", { className: "product-chat-pending__item product-chat-pending__item--loading" }, [createIcon("hourglass_top"), createElement("span", null, "Preparing file...")])
      : null,
    pendingItems,
  ]);
}

function renderProductChatComposer(product, fileInputId) {
  if (!canSendChatMessages()) {
    return createElement("div", { className: "product-chat-composer product-chat-composer--readonly" }, [
      createIcon("visibility"),
      createElement("span", null, "Viewer access can review chat history but cannot send messages or files."),
    ]);
  }

  const editingMessage = uiState.editingChatMessageId ? findProductChatMessage(product.id, uiState.editingChatMessageId) : null;
  const replyMessage = uiState.replyingToChatMessageId ? findProductChatMessage(product.id, uiState.replyingToChatMessageId) : null;
  const replyPreview = replyMessage ? createChatReplyPreview(replyMessage) : null;
  return createElement("form", { className: "product-chat-composer", dataAction: "send-product-chat", dataProductId: product.id }, [
    editingMessage ? createElement("div", { className: "product-chat-composer__context" }, [
      createElement("span", null, "Editing your message"),
      createElement("button", { type: "button", dataAction: "cancel-chat-edit" }, "Cancel"),
    ]) : null,
    replyPreview ? createElement("div", { className: "product-chat-composer__context" }, [
      createElement("span", null, [
        createElement("strong", null, `Replying to ${getChatReplyTargetLabel(replyPreview)}: `),
        createElement("small", null, getChatReplySummary(replyPreview)),
      ]),
      createElement("button", { type: "button", dataAction: "cancel-chat-reply" }, "Cancel"),
    ]) : null,
    createElement("div", { className: "product-chat-composer__toolbar" }, [
      renderChatFormatButton("format_bold", "bold", "Bold"),
      renderChatFormatButton("format_italic", "italic", "Italic"),
      renderChatFormatButton("format_list_bulleted", "list", "Bulleted list"),
      createElement("input", { className: "product-chat-composer__file-input", id: fileInputId, type: "file", multiple: true, dataAction: "add-chat-files", dataProductId: product.id }),
      createElement("label", { className: "product-chat-composer__tool product-chat-composer__tool--upload", htmlFor: fileInputId, ariaLabel: "Upload image or file" }, [createIcon("image")]),
      createElement("label", { className: "product-chat-composer__tool product-chat-composer__tool--upload", htmlFor: fileInputId, ariaLabel: "Attach files" }, [createIcon("attach_file")]),
    ]),
    createElement("textarea", { className: "product-chat-composer__input", name: "chatMessage", rows: 1, placeholder: editingMessage ? "Edit your message..." : `Message ${product.name}...`, value: editingMessage?.text ?? "", dataAction: "chat-message-input", dataProductId: product.id }),
    renderPendingChatAttachments(),
    createElement("div", { className: "product-chat-composer__footer" }, [
      createElement("span", { className: "product-chat-composer__hint" }, "Press Enter to send, Shift + Enter for new line"),
      createElement("span", { className: "product-chat-composer__emoji-picker" }, [
        createElement("button", { className: "product-chat-composer__emoji", type: "button", dataAction: "toggle-chat-emoji-menu", ariaLabel: "Show emojis" }, "🙂"),
        uiState.chatEmojiOpen ? createElement("span", { className: "product-chat-composer__emoji-menu" }, ["🙂", "👍", "🔥", "✅", "🚀"].map((emoji) =>
          createElement("button", { className: "product-chat-composer__emoji", type: "button", dataAction: "insert-chat-emoji", dataEmoji: emoji, ariaLabel: `Insert ${emoji}` }, emoji),
        )) : null,
      ].filter(Boolean)),
      createElement("button", { className: "button-primary product-chat-composer__send", type: "submit", disabled: uiState.chatUploadingFiles }, [createElement("span", null, "Send"), createIcon("send")]),
    ]),
  ]);
}

function renderChatFormatButton(icon, format, label) {
  return createElement("button", { className: "product-chat-composer__tool product-chat-composer__tool--format", type: "button", dataAction: "format-chat-text", dataChatFormat: format, ariaLabel: label }, [createIcon(icon)]);
}

function renderWorkspaceCustomFields(product, stage, stageDetails) {
  const fields = stageDetails.customFields;
  const editControlsKey = getWorkspaceStageFieldControlsKey(product.id, stage.stage_id);
  const editControlsOpen = uiState.editingWorkspaceStageFieldIds.has(editControlsKey);
  const stageHistoryCount = getWorkspaceStageHistory(product.id, stage.stage_id).length;
  const deletedFieldCount = getDeletedWorkspaceFieldHistory(stage.stage_id).length;

  return createElement("section", {
    className: `workspace-fields ${editControlsOpen ? "workspace-fields--editing" : ""}`,
    ariaLabel: `${stage.label} custom fields`,
  }, [
    createElement("div", { className: "workspace-fields__header" }, [
      createElement("div", { className: "workspace-fields__header-actions" }, [
        createElement("button", {
          className: `workspace-history-button workspace-history-button--stage ${stageHistoryCount ? "" : "workspace-history-button--empty"}`.trim(),
          type: "button",
          dataAction: "open-stage-history",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          ariaLabel: `Open history for ${stage.label}`,
          title: stageHistoryCount ? `${stageHistoryCount} stage history record${stageHistoryCount === 1 ? "" : "s"}` : "No stage history yet",
        }, [createIcon("history"), stageHistoryCount ? createElement("span", null, String(stageHistoryCount)) : null].filter(Boolean)),
        canEditWorkspaceData() ? createElement("button", {
          className: `workspace-fields__edit-toggle ${editControlsOpen ? "workspace-fields__edit-toggle--active" : ""}`,
          type: "button",
          dataAction: "toggle-workspace-field-controls",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          ariaLabel: `${editControlsOpen ? "Hide" : "Show"} custom field edit controls for ${stage.label}`,
          ariaPressed: editControlsOpen ? "true" : "false",
          title: `${editControlsOpen ? "Hide" : "Show"} custom field edit controls`,
        }, [createIcon("settings")]) : null,
        deletedFieldCount ? createElement("button", {
          className: "workspace-history-button workspace-history-button--deleted",
          type: "button",
          dataAction: "open-deleted-field-history",
          dataStageId: stage.stage_id,
          ariaLabel: `Open deleted field history for ${stage.label}`,
          title: "Deleted fields history",
        }, [createIcon("restore_from_trash"), createElement("span", null, String(deletedFieldCount))]) : null,
        renderWorkspaceStageExportControls(product, stage, fields.length),
        createElement("span", null, `${fields.length} field${fields.length === 1 ? "" : "s"}`),
      ].filter(Boolean)),
    ]),
    fields.length === 0
      ? createElement("p", { className: "workspace-fields__empty" }, "No preset fields here. Add only the details you want to track for this product and stage.")
      : createElement("div", { className: "workspace-fields__ordered" },
        fields.map((field) => renderSafeWorkspaceCustomField(product, stage, field, editControlsOpen)),
      ),
  ]);
}

function renderWorkspaceStageExportControls(product, stage, fieldCount) {
  return createElement("div", { className: "workspace-stage-export", ariaLabel: `Export ${stage.label} dropdown data` },
    TAB_EXPORT_FORMATS.map((format) => createElement("button", {
      className: "workspace-stage-export__button",
      type: "button",
      dataAction: "export-stage-tab",
      dataStageId: stage.stage_id,
      dataProductId: product.id,
      dataExportFormat: format.value,
      disabled: fieldCount === 0,
      ariaLabel: `Export ${stage.label} dropdown data as ${format.label}`,
      title: `Export ${stage.label} as ${format.label}`,
    }, format.label)),
  );
}

function renderWorkspaceFieldHistoryModal() {
  const modal = uiState.fieldHistoryModal;
  if (!modal) return null;
  const field = getWorkspaceFieldByIds(modal.productId, modal.stageId, modal.fieldId);
  const history = getWorkspaceFieldHistory(modal.productId, modal.stageId, modal.fieldId);
  const fieldLabel = field?.label || history[0]?.fieldLabel || "Custom field";

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("section", { className: "workspace-modal__dialog workspace-history-modal", role: "dialog", ariaModal: "true", ariaLabel: `${fieldLabel} history` }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("div", { className: "workspace-history-modal__title" }, [
          createElement("h3", null, "Field History"),
          createElement("p", null, fieldLabel),
        ]),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-field-history", ariaLabel: "Close field history" }, [createIcon("close")]),
      ]),
      history.length
        ? createElement("div", { className: "workspace-history-list" }, history.map(renderWorkspaceFieldHistoryItem))
        : createElement("p", { className: "dashboard-empty" }, "No history recorded for this field yet."),
    ]),
  ]);
}

function renderWorkspaceBackupsWorkspace(workspace) {
  const backups = uiState.workspaceBackups;
  const auditLog = getWorkspaceAuditLog();
  replaceChildren(workspace, createElement("section", { className: "settings-workspace", ariaLabel: "Workspace backup settings" }, [
    createElement("div", { className: "settings-workspace__header" }, [
      createElement("div", null, [
        createElement("p", { className: "workspace-detail__eyebrow" }, "Settings / Backups"),
        createElement("h2", null, "Workspace Backups"),
        createElement("p", null, "Create restore points, download JSON copies, and restore the full shared workspace if something goes wrong."),
      ]),
      createElement("div", { className: "settings-users-card__actions" }, [
        createElement("button", {
          className: "button-secondary",
          type: "button",
          dataAction: "publish-admin-workspace",
          disabled: uiState.workspaceBackupsLoading,
        }, [createIcon("cloud_upload"), createElement("span", null, "Publish Current Admin View")]),
        createElement("button", {
          className: "button-primary settings-invite-button",
          type: "button",
          dataAction: "create-workspace-backup",
          disabled: uiState.workspaceBackupsLoading,
        }, [createIcon("add"), createElement("span", null, "Create Backup")]),
      ]),
    ]),
    uiState.workspaceBackupsNotice ? createElement("p", { className: "settings-user-notice", role: "status" }, uiState.workspaceBackupsNotice) : null,
    createElement("div", { className: "settings-stat-grid settings-stat-grid--simple" }, [
      renderSettingsStat("Saved Backups", String(backups.length)),
      renderSettingsStat("Manual Backups", String(backups.filter((backup) => backup.isManual).length)),
    ]),
    createElement("section", { className: "settings-users-card workspace-backups-card" }, [
      createElement("div", { className: "settings-users-card__toolbar" }, [
        createElement("strong", null, "Restore Points"),
        createElement("span", null, uiState.workspaceBackupsLoading ? "Loading backups..." : "Newest backups first"),
      ]),
      backups.length
        ? createElement("div", { className: "workspace-backup-list" }, backups.map(renderWorkspaceBackupRow))
        : createElement("p", { className: "workspace-backup-empty" }, uiState.workspaceBackupsLoading ? "Loading workspace backups..." : "No workspace backups yet. Create one before a major change."),
    ]),
    createElement("section", { className: "settings-users-card workspace-audit-card" }, [
      createElement("div", { className: "settings-users-card__toolbar" }, [
        createElement("strong", null, "Shared Workspace Audit"),
        createElement("span", null, auditLog.length ? "Newest events first" : "No product save events yet"),
      ]),
      auditLog.length
        ? createElement("div", { className: "workspace-audit-list" }, auditLog.map(renderWorkspaceAuditRow))
        : createElement("p", { className: "workspace-backup-empty" }, "Future product saves, admin publishes, restores, and conflicts will appear here."),
    ]),
  ].filter(Boolean)));
}

function getWorkspaceAuditLog() {
  return normalizeActivityLog(activityLog)
    .filter((item) => item.auditType)
    .slice(0, 80);
}

function renderWorkspaceAuditRow(item) {
  const actor = item.actorName || item.actorEmail || "Unknown user";
  const actorSuffix = item.actorEmail && item.actorName ? ` (${item.actorEmail})` : "";
  const productCounts = item.productCountBefore !== null || item.productCountAfter !== null
    ? `Products: ${item.productCountBefore ?? "?"} -> ${item.productCountAfter ?? "?"}`
    : "";
  const removedText = item.removedProducts.length
    ? `Removed: ${item.removedProducts.map((product) => product.name).join(", ")}`
    : "";
  const addedText = item.addedProducts.length
    ? `Added: ${item.addedProducts.map((product) => product.name).join(", ")}`
    : "";
  return createElement("article", { className: "workspace-audit-row" }, [
    createElement("span", { className: "workspace-audit-row__icon", ariaHidden: "true" }, [createIcon(item.icon || "history")]),
    createElement("div", { className: "workspace-audit-row__meta" }, [
      createElement("strong", null, item.label),
      createElement("span", null, `${actor}${actorSuffix} - ${formatActivityTimestamp(item.timestamp)}`),
      item.detail ? createElement("small", null, item.detail) : null,
      productCounts ? createElement("small", null, productCounts) : null,
      removedText ? createElement("small", { className: "workspace-audit-row__removed" }, removedText) : null,
      addedText ? createElement("small", { className: "workspace-audit-row__added" }, addedText) : null,
    ].filter(Boolean)),
  ]);
}

function renderWorkspaceBackupRow(backup) {
  return createElement("article", { className: "workspace-backup-row" }, [
    createElement("div", { className: "workspace-backup-row__meta" }, [
      createElement("strong", null, getWorkspaceBackupReasonLabel(backup.reason)),
      createElement("span", null, `${backup.createdBy || "Unknown user"} • ${formatActivityTimestamp(Date.parse(backup.createdAt) || Date.now())}`),
      createElement("small", null, `${backup.isManual ? "Manual" : "Automatic"} backup • ${formatWorkspaceBackupSize(backup.stateSize)} data • ${backup.storageAssetCount} file${backup.storageAssetCount === 1 ? "" : "s"} (${formatWorkspaceBackupSize(backup.storageAssetSize)})`),
    ]),
    createElement("div", { className: "workspace-backup-row__actions" }, [
      createElement("button", {
        className: "button-secondary",
        type: "button",
        dataAction: "download-workspace-backup",
        dataBackupId: backup.id,
        disabled: uiState.workspaceBackupsLoading,
      }, [createIcon("download"), createElement("span", null, "Download")]),
      createElement("button", {
        className: "button-secondary workspace-backup-row__restore",
        type: "button",
        dataAction: "restore-workspace-backup",
        dataBackupId: backup.id,
        disabled: uiState.workspaceBackupsLoading,
      }, [createIcon("restore"), createElement("span", null, "Restore")]),
    ]),
  ]);
}

function getWorkspaceBackupReasonLabel(reason) {
  const labels = {
    "auto-save": "Automatic Save Backup",
    "manual-backup": "Manual Backup",
    "before-restore": "Before Restore Backup",
  };
  return labels[reason] ?? "Workspace Backup";
}

function formatWorkspaceBackupSize(size) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderWorkspaceStageHistoryModal() {
  const modal = uiState.stageHistoryModal;
  if (!modal) return null;
  const history = getWorkspaceStageHistory(modal.productId, modal.stageId);
  const stageLabel = getActivityStageLabel(modal.stageId);

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("section", { className: "workspace-modal__dialog workspace-history-modal", role: "dialog", ariaModal: "true", ariaLabel: `${stageLabel} history` }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("div", { className: "workspace-history-modal__title" }, [
          createElement("h3", null, "Stage History"),
          createElement("p", null, stageLabel),
        ]),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-stage-history", ariaLabel: "Close stage history" }, [createIcon("close")]),
      ]),
      history.length
        ? createElement("div", { className: "workspace-history-list" }, history.map(renderWorkspaceFieldHistoryItem))
        : createElement("p", { className: "dashboard-empty" }, "No history recorded for this stage yet."),
    ]),
  ]);
}

function renderDeletedWorkspaceFieldHistoryModal() {
  const modal = uiState.deletedFieldHistoryModal;
  if (!modal) return null;
  const history = getDeletedWorkspaceFieldHistory(modal.stageId);

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("section", { className: "workspace-modal__dialog workspace-history-modal", role: "dialog", ariaModal: "true", ariaLabel: "Deleted field history" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("div", { className: "workspace-history-modal__title" }, [
          createElement("h3", null, "Deleted Fields"),
          createElement("p", null, getActivityStageLabel(modal.stageId)),
        ]),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-deleted-field-history", ariaLabel: "Close deleted field history" }, [createIcon("close")]),
      ]),
      history.length
        ? createElement("div", { className: "workspace-history-list" }, history.map(renderWorkspaceFieldHistoryItem))
        : createElement("p", { className: "dashboard-empty" }, "No deleted fields recorded for this stage."),
    ]),
  ]);
}

function renderWorkspaceFieldHistoryItem(item) {
  const isDeletedField = item.action === "delete-field";
  const canRestore = canRestoreWorkspaceFieldHistory(item);
  return createElement("article", { className: "workspace-history-item" }, [
    createElement("div", { className: "workspace-history-item__meta" }, [
      createElement("strong", null, getWorkspaceHistoryActionLabel(item)),
      createElement("span", null, `${item.changedByName || item.changedByEmail || "Unknown user"} • ${formatActivityTimestamp(item.timestamp)}`),
    ]),
    createElement("div", { className: "workspace-history-item__values" }, [
      !isDeletedField ? createElement("span", null, [
        createElement("b", null, "Before"),
        createElement("em", null, summarizeWorkspaceHistoryValue(item.previousValue, item.fieldType)),
      ]) : null,
      createElement("span", null, [
        createElement("b", null, isDeletedField ? "Deleted field" : "After"),
        createElement("em", null, isDeletedField ? `${item.fieldLabel || "Custom field"} (${getWorkspaceFieldTypeLabel(item.fieldType)})` : summarizeWorkspaceHistoryValue(item.nextValue, item.fieldType)),
      ]),
    ].filter(Boolean)),
    canRestore ? createElement("button", {
      className: "button-secondary workspace-history-item__restore",
      type: "button",
      dataAction: isDeletedField ? "restore-deleted-field-history" : "restore-field-history",
      dataHistoryEntryId: item.id,
    }, [createIcon("restore"), createElement("span", null, "Restore")]) : null,
  ].filter(Boolean));
}

function getWorkspaceHistoryActionLabel(item) {
  const partLabel = getWorkspaceHistoryPartLabel(item);
  if (item.action === "restore") return `Restored ${item.fieldLabel || "field"}${partLabel ? ` - ${partLabel}` : ""}`;
  if (item.action === "delete-field") return `Deleted ${item.fieldLabel || "field"}`;
  return `Changed ${item.fieldLabel || "field"}${partLabel ? ` - ${partLabel}` : ""}`;
}

function getWorkspaceHistoryPartLabel(item) {
  return getWorkspaceHistoryCellLabel(item) || getWorkspaceHistoryMultiBarLabel(item);
}

function getWorkspaceHistoryCellLabel(item) {
  if (!item?.tableCell) return "";
  const rowLabel = item.tableCell.rowLabel || `Row ${item.tableCell.rowIndex + 1}`;
  const columnLabel = item.tableCell.columnLabel || `Column ${item.tableCell.columnIndex + 1}`;
  return `${rowLabel} / ${columnLabel}`;
}

function getWorkspaceHistoryMultiBarLabel(item) {
  if (!item?.multiBar) return "";
  return item.multiBar.label || `Bar ${item.multiBar.index + 1}`;
}

function renderSafeWorkspaceCustomField(product, stage, field, editControlsOpen = false) {
  try {
    return renderWorkspaceCustomField(product, stage, field, editControlsOpen);
  } catch (error) {
    console.warn("LaunchFlow skipped a custom field that could not render.", { field, error });
    return createElement("article", { className: "workspace-field workspace-field--render-error" }, [
      createElement("div", { className: "workspace-field__header" }, [
        createElement("span", { className: "workspace-field__label" }, field?.label || "Custom field"),
      ]),
      createElement("p", null, "This field could not render safely. Edit or delete it, then reload the app."),
    ]);
  }
}

function renderWorkspaceAddFieldForm(product, stage) {
  if (!canManageWorkspaceFieldTemplates()) return null;
  return createElement("button", {
    className: "button-primary workspace-add-field-button",
    type: "button",
    dataAction: "open-field-modal",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
  }, [createIcon("add")]);
}

function renderWorkspaceCustomField(product, stage, field, editControlsOpen = false) {
  const fieldModifiers = {
    HEADER_TITLE: "workspace-field--header-title",
    LONG_BAR: "workspace-field--full-bar",
    THREE_SHORT_BARS: "workspace-field--three-short-bars",
    FOUR_SHORT_BARS: "workspace-field--four-short-bars",
    HALF_LONG_TEXT: "workspace-field--half-long",
    LONG_TEXT: "workspace-field--wide",
    LISTING_CONTENT: "workspace-field--listing-content",
    CUSTOM_TABLE: "workspace-field--full-table",
    HALF_TABLE: "workspace-field--half-table",
    FILE_UPLOAD: "workspace-field--file-upload",
    IMAGE_GALLERY: "workspace-field--image-gallery",
    PAYMENT_STATUS: "workspace-field--payment-status",
    CHECKLIST_NOTES: "workspace-field--checklist-notes",
    SHIPPING_TIMELINE: "workspace-field--shipping-timeline",
    SHIPMENT_TRACKER: "workspace-field--shipment-tracker",
    SHEET_EMBED: "workspace-field--sheet-embed",
  };
  const fieldClass = `workspace-field ${fieldModifiers[field.type] ?? ""}`.trim();
  const visibleLabel = String(field.label ?? "").trim();
  const actionLabel = visibleLabel || getWorkspaceFieldTypeLabel(field.type);

  if (field.type === "HEADER_TITLE") {
    const subtext = String(field.headerSubtext ?? "").trim();
    return createElement("article", {
      className: fieldClass,
      dataFieldDropId: field.fieldId,
      dataProductId: product.id,
      dataStageId: stage.stage_id,
    }, [
      createElement("div", { className: "workspace-header-title-field" }, [
        createElement("span", { className: "workspace-header-title-field__bar" }),
        createElement("span", { className: "workspace-header-title-field__copy" }, [
          visibleLabel ? createElement("h3", null, visibleLabel) : null,
          subtext ? createElement("p", null, subtext) : null,
        ]),
        renderWorkspaceFieldHistoryButton(product, stage, field, actionLabel),
        canManageWorkspaceFieldTemplates() && editControlsOpen ? createElement("span", { className: "workspace-field__actions" }, [
          createElement("button", {
            className: "workspace-field__action workspace-field__drag",
            type: "button",
            draggable: true,
            dataAction: "drag-workspace-field",
            dataProductId: product.id,
            dataStageId: stage.stage_id,
            dataFieldId: field.fieldId,
            ariaLabel: `Drag ${actionLabel} to reorder`,
            title: "Drag to reorder custom fields",
          }, [createIcon("drag_indicator")]),
          createElement("button", {
            className: "workspace-field__action",
            type: "button",
            dataAction: "edit-workspace-field",
            dataProductId: product.id,
            dataStageId: stage.stage_id,
            dataFieldId: field.fieldId,
            ariaLabel: `Edit ${actionLabel}`,
            title: "Rename or edit custom field",
          }, [createIcon("edit")]),
          createElement("button", {
            className: "workspace-field__action workspace-field__action--danger",
            type: "button",
            dataAction: "delete-workspace-field",
            dataProductId: product.id,
            dataStageId: stage.stage_id,
            dataFieldId: field.fieldId,
            ariaLabel: `Delete ${actionLabel}`,
            title: "Delete custom field",
          }, [createIcon("delete")]),
        ]) : null,
      ].filter(Boolean)),
    ]);
  }

  return createElement("article", {
    className: fieldClass,
    dataFieldDropId: field.fieldId,
    dataProductId: product.id,
    dataStageId: stage.stage_id,
  }, [
    createElement("div", { className: "workspace-field__header" }, [
      visibleLabel ? createElement("span", { className: "workspace-field__label" }, visibleLabel) : null,
      renderWorkspaceFieldHistoryButton(product, stage, field, actionLabel),
      canManageWorkspaceFieldTemplates() && editControlsOpen ? createElement("span", { className: "workspace-field__actions" }, [
        createElement("button", {
          className: "workspace-field__action workspace-field__drag",
          type: "button",
          draggable: true,
          dataAction: "drag-workspace-field",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Drag ${actionLabel} to reorder`,
          title: "Drag to reorder custom fields",
        }, [createIcon("drag_indicator")]),
        createElement("button", {
          className: "workspace-field__action",
          type: "button",
          dataAction: "edit-workspace-field",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Edit ${actionLabel}`,
          title: "Rename or edit custom field",
        }, [createIcon("edit")]),
        createElement("button", {
          className: "workspace-field__action workspace-field__action--danger",
          type: "button",
          dataAction: "delete-workspace-field",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Delete ${actionLabel}`,
          title: "Delete custom field",
        }, [createIcon("delete")]),
      ]) : null,
    ].filter(Boolean)),
    renderWorkspaceFieldControl(product, stage, field),
  ]);
}

function renderWorkspaceFieldHistoryButton(product, stage, field, actionLabel) {
  const historyCount = getWorkspaceFieldHistory(product.id, stage.stage_id, field.fieldId).length;
  return createElement("button", {
    className: `workspace-history-button ${historyCount ? "" : "workspace-history-button--empty"}`.trim(),
    type: "button",
    dataAction: "open-field-history",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    ariaLabel: `Open history for ${actionLabel}`,
    title: historyCount ? `${historyCount} history record${historyCount === 1 ? "" : "s"}` : "No history yet",
  }, [createIcon("history"), historyCount ? createElement("span", null, String(historyCount)) : null].filter(Boolean));
}

function renderWorkspaceFieldControl(product, stage, field) {
  const baseOptions = {
    dataAction: "update-workspace-field",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    disabled: !canEditProductFieldValues(),
  };

  if (["LONG_TEXT", "HALF_LONG_TEXT"].includes(field.type)) {
    return createElement("textarea", {
      className: `form-input workspace-field__textarea ${field.type === "HALF_LONG_TEXT" ? "workspace-field__textarea--half" : ""}`.trim(),
      ...baseOptions,
      rows: field.type === "HALF_LONG_TEXT" ? 3 : 6,
      placeholder: "",
      value: field.value ?? "",
    });
  }

  if (field.type === "LONG_BAR") {
    const tokens = getLongBarTokens(field.value);
    return createElement("div", { className: "workspace-field__tagbar" }, [
      tokens.map((token, tokenIndex) => createElement("span", { className: "workspace-field__tag" }, [
        createElement("span", null, token),
        canEditProductFieldValues() ? createElement("button", {
          className: "workspace-field__tag-remove",
          type: "button",
          dataAction: "remove-long-bar-token",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          dataTokenIndex: tokenIndex,
          ariaLabel: `Remove ${token}`,
        }, "×") : null,
      ].filter(Boolean))),
      createElement("input", {
        className: "workspace-field__tag-input",
        type: "text",
        placeholder: "",
        dataAction: "add-long-bar-token",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled: !canEditProductFieldValues(),
      }),
    ]);
  }

  if (["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(field.type)) {
    const barCount = field.type === "FOUR_SHORT_BARS" ? 4 : 3;
    const values = normalizeMultiShortBarsValue(field.value, barCount);
    const labels = normalizeMultiShortBarLabels(field.barLabels, barCount);
    return createElement("div", { className: `workspace-multi-short-bars workspace-multi-short-bars--${barCount}` }, values.map((value, index) =>
      createElement("label", { className: "workspace-multi-short-bars__item" }, [
        labels[index] ? createElement("span", { className: "workspace-multi-short-bars__label" }, labels[index]) : null,
        createElement("input", {
          className: "form-input workspace-multi-short-bars__input",
          type: "text",
          placeholder: "",
          value,
          dataFieldPart: `multiShortBar${index}`,
          ...baseOptions,
        }),
      ].filter(Boolean)),
    ));
  }

  if (field.type === "NUMBER") {
    return createElement("label", { className: "workspace-number-field" }, [
      createElement("input", { className: "form-input", type: "number", inputMode: "decimal", step: "any", placeholder: "", title: "Only numeric values are accepted", value: field.value ?? "", ...baseOptions }),
      createElement("small", { className: "workspace-number-field__hint" }, "Numbers only"),
    ]);
  }

  if (field.type === "CURRENCY") {
    const currencyValue = field.value && typeof field.value === "object" ? field.value : { amount: "", currency: "USD" };
    return createElement("div", { className: "workspace-field__currency workspace-field__currency--single" }, [
      createElement("input", { className: "form-input workspace-field__currency-amount", type: "number", step: "0.01", value: currencyValue.amount ?? "", dataFieldPart: "amount", ...baseOptions }),
      createElement("select", { className: "form-input workspace-field__currency-code", value: currencyValue.currency ?? "USD", dataFieldPart: "currency", ...baseOptions }, [
        createElement("option", { value: "USD", selected: currencyValue.currency === "USD" }, "USD"),
        createElement("option", { value: "CAD", selected: currencyValue.currency === "CAD" }, "CAD"),
        createElement("option", { value: "GBP", selected: currencyValue.currency === "GBP" }, "GBP"),
        createElement("option", { value: "EUR", selected: currencyValue.currency === "EUR" }, "EUR"),
      ]),
    ]);
  }

  if (field.type === "DATE") {
    return createElement("input", { className: "form-input", type: "date", value: field.value ?? "", ...baseOptions });
  }

  if (field.type === "LINK") {
    return renderWorkspaceLinkField(product, stage, field, baseOptions.disabled);
  }

  if (field.type === "SHEET_EMBED") {
    return renderWorkspaceSheetEmbedField(product, stage, field, baseOptions.disabled);
  }

  if (field.type === "LISTING_CONTENT") {
    return renderWorkspaceListingContentField(product, stage, field, baseOptions.disabled);
  }

  if (field.type === "SHIPPING_TIMELINE") {
    return renderWorkspaceShippingTimelineField(product, stage, field, baseOptions.disabled);
  }

  if (field.type === "SHIPMENT_TRACKER") {
    return renderWorkspaceShipmentTrackerField(product, stage, field, baseOptions.disabled);
  }

  if (field.type === "CUSTOM_DROPDOWN") {
    const options = getCustomDropdownOptions(field);
    return createElement("select", { className: "form-input", value: field.value ?? "", ...baseOptions }, [
      createElement("option", { value: "", selected: !field.value }, options.length > 0 ? "Choose an option..." : "No choices added yet"),
      options.map((option) => createElement("option", { value: option, selected: field.value === option }, option)),
    ]);
  }

  if (isWorkspaceTableFieldType(field.type)) return renderWorkspaceTableField(product, stage, field, baseOptions.disabled);

  if (field.type === "FILE_UPLOAD") return renderWorkspaceFileUploadField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "PAYMENT_STATUS") return renderWorkspacePaymentStatusField(product, stage, field, baseOptions.disabled);

  if (field.type === "CHECKLIST_NOTES") return renderWorkspaceChecklistNotesField(product, stage, field, baseOptions.disabled);

  if (field.type === "SHORT_TEXT") {
    return createElement("input", { className: "form-input", type: "text", placeholder: "", value: field.value ?? "", ...baseOptions });
  }

  return createElement("input", { className: "form-input", type: "text", placeholder: "", value: field.value ?? "", ...baseOptions });
}

function renderWorkspaceLinkField(product, stage, field, disabled) {
  const linkValue = normalizeWorkspaceLinkValue(field.value, field.label);
  const safeUrl = getSafeWorkspaceUrl(linkValue.url);
  const hasUrl = Boolean(safeUrl);
  const baseOptions = {
    dataAction: "update-workspace-field",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    disabled,
  };

  if (!hasUrl) {
    return createElement("input", {
      className: "form-input",
      type: "url",
      placeholder: "Paste a link here...",
      value: linkValue.url,
      dataFieldPart: "url",
      ...baseOptions,
    });
  }

  return createElement("div", { className: "workspace-link-field" }, [
    createElement("a", { className: "workspace-link-field__button", href: safeUrl, target: "_blank", rel: "noopener noreferrer" }, [
      createIcon("open_in_new"),
      createElement("span", null, linkValue.label || "Open Link"),
    ]),
  ]);
}

function renderWorkspaceSheetEmbedField(product, stage, field, disabled) {
  const sheetAccessMode = getSheetEmbedAccessModeForCurrentUser();
  const sheetValue = normalizeSpreadsheetEmbedValue({ ...normalizeSpreadsheetEmbedValue(field.value), accessMode: sheetAccessMode });
  const safeUrl = getSafeWorkspaceUrl(sheetValue.url);
  const safeEmbedUrl = getSafeWorkspaceUrl(sheetValue.embedUrl);
  const providerLabel = getSpreadsheetProviderLabel(sheetValue.provider);
  const sheetKey = getSheetPreviewKey(product.id, stage.stage_id, field.fieldId);
  const isEditingLink = uiState.editingSheetEmbedIds.has(sheetKey) || !safeUrl;
  const baseOptions = {
    dataAction: "update-workspace-field",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    dataFieldPart: "url",
    disabled,
  };

  return createElement("section", { className: "workspace-sheet-field", ariaLabel: `${field.label} embedded spreadsheet` }, [
    createElement("div", { className: "workspace-sheet-field__toolbar" }, [
      createElement("div", { className: "workspace-sheet-field__status" }, [
        createIcon("table_view"),
        createElement("span", null, safeUrl ? `${providerLabel} connected` : "No spreadsheet connected"),
      ]),
    ]),
    renderWorkspaceSheetLinkControl(product, stage, field, sheetValue, safeUrl, isEditingLink, baseOptions),
    renderWorkspaceSheetAccessNotice(sheetValue),
    safeEmbedUrl
      ? createWorkspaceSheetFrameWrap(safeEmbedUrl, `${field.label} embedded spreadsheet`)
      : createElement("p", { className: "workspace-sheet-field__empty" }, "Paste a public shareable spreadsheet link to preview it here. If the provider blocks embedding, use Open Sheet."),
  ]);
}


function createWorkspaceSheetFrameWrap(src, title) {
  const scrollGuard = createSheetFrameScrollGuard();
  const iframe = createWorkspaceSheetFrame(src, title, scrollGuard);
  const frameWrap = createElement("div", { className: "workspace-sheet-field__frame-wrap" }, [iframe]);
  attachSheetFrameScrollGuard(frameWrap, scrollGuard);
  return frameWrap;
}

let activeSheetFrameScrollGuard = null;
let sheetFrameScrollCancelListenersAttached = false;

function activateSheetFrameScrollGuard(scrollGuard) {
  activeSheetFrameScrollGuard = scrollGuard;
  if (sheetFrameScrollCancelListenersAttached) return;
  sheetFrameScrollCancelListenersAttached = true;
  ["wheel", "touchmove", "pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, (event) => activeSheetFrameScrollGuard?.cancel(event), { passive: true, capture: true });
  });
  window.addEventListener("keydown", (event) => activeSheetFrameScrollGuard?.cancel(event), { capture: true });
}

function createWorkspaceSheetFrame(src, title, scrollGuard) {
  const iframe = createElement("iframe", {
    className: "workspace-sheet-field__frame",
    src,
    title,
  });
  iframe.setAttribute("tabindex", "-1");
  attachSheetFrameScrollGuard(iframe, scrollGuard);
  return iframe;
}

function attachSheetFrameScrollGuard(element, scrollGuard) {
  ["pointerdown", "mousedown", "touchstart"].forEach((eventName) => element.addEventListener(eventName, scrollGuard.arm, { passive: true }));
  ["focus", "focusin"].forEach((eventName) => element.addEventListener(eventName, scrollGuard.restoreIfArmed));
  ["blur", "focusout"].forEach((eventName) => element.addEventListener(eventName, scrollGuard.release));
  element.addEventListener("load", scrollGuard.release);
}

function createSheetFrameScrollGuard() {
  const restoreWindowMs = 900;
  const restoreDelays = [0, 16, 50, 100, 180, 300, 500, 800];
  let savedScrollX = window.scrollX;
  let savedScrollY = window.scrollY;
  let armedAt = 0;
  let restoreToken = 0;
  let parentScrollListening = false;

  const getPageScroller = () => document.scrollingElement || document.documentElement || document.body;
  const isArmed = () => Date.now() - armedAt <= restoreWindowMs;
  const armRestore = () => {
    savedScrollX = window.scrollX;
    savedScrollY = window.scrollY;
    armedAt = Date.now();
    restoreToken += 1;
    startParentScrollGuard();
    noteWorkspaceInteraction();
  };
  const restoreOnce = (token) => {
    if (token !== restoreToken) return;
    if (!isArmed()) return;
    const movedVertically = Math.abs(window.scrollY - savedScrollY) > 1;
    const movedHorizontally = Math.abs(window.scrollX - savedScrollX) > 1;
    if (!movedVertically && !movedHorizontally) return;
    const pageScroller = getPageScroller();
    if (pageScroller) {
      pageScroller.scrollLeft = savedScrollX;
      pageScroller.scrollTop = savedScrollY;
    }
    document.documentElement.scrollLeft = savedScrollX;
    document.documentElement.scrollTop = savedScrollY;
    document.body.scrollLeft = savedScrollX;
    document.body.scrollTop = savedScrollY;
    window.scrollTo(savedScrollX, savedScrollY);
  };
  const cancelRestore = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".workspace-sheet-field__frame-wrap")) return;
    restoreToken += 1;
    armedAt = 0;
    stopParentScrollGuard();
  };
  const releaseRestore = () => {
    window.setTimeout(() => {
      if (!isArmed()) stopParentScrollGuard();
    }, restoreWindowMs + 100);
  };
  const handleParentScroll = () => {
    if (!isArmed()) {
      stopParentScrollGuard();
      return;
    }
    if (window.scrollX === savedScrollX && window.scrollY === savedScrollY) return;
    const token = restoreToken;
    window.requestAnimationFrame(() => restoreOnce(token));
  };
  const startParentScrollGuard = () => {
    if (parentScrollListening) return;
    parentScrollListening = true;
    window.addEventListener("scroll", handleParentScroll, { passive: true });
  };
  const stopParentScrollGuard = () => {
    if (!parentScrollListening || isArmed()) return;
    parentScrollListening = false;
    window.removeEventListener("scroll", handleParentScroll);
  };
  const restore = () => {
    if (!isArmed()) return;
    const token = restoreToken;
    restoreOnce(token);
    window.requestAnimationFrame(() => restoreOnce(token));
    restoreDelays.forEach((delay) => window.setTimeout(() => restoreOnce(token), delay));
  };
  const guard = {
    arm: () => {
      armRestore();
      restore();
    },
    cancel: cancelRestore,
    release: releaseRestore,
    restoreIfArmed: restore,
  };
  activateSheetFrameScrollGuard(guard);
  return guard;
}

function renderWorkspaceSheetLinkControl(product, stage, field, sheetValue, safeUrl, isEditingLink, baseOptions) {
  if (safeUrl && !isEditingLink) {
    const openUrl = getSpreadsheetOpenUrl(sheetValue, safeUrl);
    return createElement("div", { className: "workspace-sheet-field__link-display" }, [
      createElement("a", { className: "workspace-sheet-field__button", href: openUrl, target: "_blank", rel: "noopener noreferrer" }, [
        createIcon("open_in_new"),
        createElement("span", null, getSpreadsheetOpenLabel(sheetValue)),
      ]),
      createElement("button", {
        className: "workspace-sheet-field__edit",
        type: "button",
        dataAction: "edit-sheet-embed-link",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled: baseOptions.disabled,
      }, [createIcon("edit"), createElement("span", null, "Edit Link")]),
    ]);
  }

  return createElement("div", { className: "workspace-sheet-field__editor" }, [
    createElement("label", { className: "workspace-sheet-field__link form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Public spreadsheet link"),
      createElement("input", {
        className: "form-input",
        type: "url",
        placeholder: "Paste a public Google Sheets, Excel, or Airtable link...",
        value: sheetValue.url,
        ...baseOptions,
      }),
    ]),
    safeUrl ? createElement("button", {
      className: "workspace-sheet-field__done",
      type: "button",
      dataAction: "finish-sheet-embed-link-edit",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      disabled: baseOptions.disabled,
    }, [createIcon("check"), createElement("span", null, "Done")]) : null,
  ].filter(Boolean));
}

function renderWorkspaceSheetAccessNotice(sheetValue) {
  const isGoogleSheet = sheetValue.provider === "google-sheets";
  const canEditSheet = sheetValue.accessMode === "edit";
  return createElement("p", { className: "workspace-sheet-field__access-note" }, isGoogleSheet
    ? canEditSheet
      ? "Full Google Sheet mode: edit here when sharing permissions allow it. Use Open Full Google Sheet if Google blocks a tool inside LaunchFlow."
      : "Preview the sheet here. Use Open Full Google Sheet to edit in Google Sheets."
    : "Preview the sheet here. Use Open Sheet to edit in the source spreadsheet app.");
}
function renderWorkspaceListingContentField(product, stage, field, disabled) {
  const value = normalizeListingContentValue(field.value);
  const titleCount = getCharacterCount(value.title);
  const itemHighlightCount = getCharacterCount(value.itemHighlight);
  const bulletCount = value.bullets.reduce((total, bullet) => total + getCharacterCount(bullet), 0);
  const descriptionCount = getCharacterCount(value.description);
  const statusClass = value.status === "approved" ? "is-approved" : value.status === "declined" ? "is-declined" : "";
  const baseOptions = {
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    disabled,
  };

  return createElement("section", { className: "listing-content-builder", ariaLabel: "Listing Content Builder" }, [
    createElement("header", { className: "listing-content-builder__header" }, [
      createElement("div", null, [
        createElement("h3", null, "Listing Content Builder"),
        createElement("p", null, "Create the Amazon-ready title, bullets, and product description for this listing."),
      ]),
      createElement("div", { className: "listing-content-builder__actions" }, [
        createElement("label", { className: `listing-content-builder__status ${statusClass}`.trim() }, [
          createElement("span", null, "Review Status"),
          createElement("select", { dataAction: "update-listing-content", dataListingPart: "status", value: value.status, ...baseOptions }, [
            createElement("option", { value: "", selected: value.status === "" }, "Choose status"),
            createElement("option", { value: "approved", selected: value.status === "approved" }, "Approved"),
            createElement("option", { value: "declined", selected: value.status === "declined" }, "Declined"),
          ]),
        ]),
      ]),
    ]),
    createElement("div", { className: "listing-content-builder__body" }, [
      createElement("div", { className: "listing-content-builder__content-fields" }, [
        createElement("label", { className: "listing-content-builder__field listing-content-builder__field--title" }, [
          createElement("span", { className: "listing-content-builder__label-row" }, [
            createElement("strong", null, "Product Title"),
            renderListingCharacterCounter(titleCount, 75, "title"),
          ]),
          createElement("textarea", { className: "listing-content-builder__title-input", rows: 2, placeholder: "Enter your product title...", value: value.title, dataAction: "update-listing-content", dataListingPart: "title", maxlength: 75, ...baseOptions }),
        ]),
        createElement("label", { className: "listing-content-builder__field listing-content-builder__field--item-highlight" }, [
          createElement("span", { className: "listing-content-builder__label-row" }, [
            createElement("strong", null, "Item Highlight"),
            renderListingCharacterCounter(itemHighlightCount, 125, "itemHighlight"),
          ]),
          createElement("textarea", { className: "listing-content-builder__title-input", rows: 2, placeholder: "Add the remaining title highlight details...", value: value.itemHighlight, dataAction: "update-listing-content", dataListingPart: "itemHighlight", maxlength: 125, ...baseOptions }),
        ]),
        createElement("section", { className: "listing-content-builder__bullets", ariaLabel: "Bullet points" }, [
          createElement("span", { className: "listing-content-builder__label-row" }, [
            createElement("strong", null, "Bullet Points (Key Product Features)"),
            renderListingCharacterCounter(bulletCount, 1000, "bullets"),
          ]),
          value.bullets.map((bullet, index) => createElement("label", { className: "listing-content-builder__bullet" }, [
            createElement("span", { className: "listing-content-builder__bullet-number" }, String(index + 1)),
            createElement("textarea", { className: "listing-content-builder__bullet-input", rows: 1, placeholder: getListingBulletPlaceholder(index), value: bullet, dataAction: "update-listing-content", dataListingPart: "bullet", dataBulletIndex: index, maxlength: 200, ...baseOptions }),
          ])),
        ]),
        createElement("label", { className: "listing-content-builder__field" }, [
          createElement("span", { className: "listing-content-builder__label-row" }, [
            createElement("strong", null, "Product Description (HTML Supported)"),
            renderListingCharacterCounter(descriptionCount, 2000, "description"),
          ]),
          createElement("textarea", { className: "listing-content-builder__description", rows: 7, placeholder: "Write a detailed product story and technical specifications here...", value: value.description, dataAction: "update-listing-content", dataListingPart: "description", maxlength: 2000, ...baseOptions }),
        ]),
        createElement("label", { className: "listing-content-builder__field" }, [
          createElement("span", { className: "listing-content-builder__label-row" }, [
            createElement("strong", null, "Backend Keywords"),
            renderListingCharacterCounter(getCharacterCount(value.backendKeywords), 250, "backendKeywords"),
          ]),
          createElement("textarea", { className: "listing-content-builder__backend", rows: 3, placeholder: "Add backend search terms here...", value: value.backendKeywords, dataAction: "update-listing-content", dataListingPart: "backendKeywords", maxlength: 250, ...baseOptions }),
        ]),
      ]),
    ]),
  ]);
}

function renderListingCharacterCounter(count, max, key) {
  return createElement("em", { className: "listing-content-builder__counter", dataListingCounter: key }, `${count}/${max} characters`);
}

function getListingBulletPlaceholder(index) {
  return ["Add first bullet point...", "Add second bullet point...", "Add third bullet point...", "Add fourth bullet point...", "Add fifth bullet point..."][index] ?? "Add bullet point...";
}

function renderWorkspaceShippingTimelineField(product, stage, field, disabled) {
  const value = normalizeShippingTimelineValue(field.value);
  const progress = getShippingTimelineProgress(value);
  const shippingDateInputId = `shipping-date-${product.id}-${stage.stage_id}-${field.fieldId}`;
  const baseOptions = {
    dataAction: "update-workspace-field",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    disabled,
  };

  return createElement("section", { className: `shipping-timeline shipping-timeline--${progress.status}`.trim(), ariaLabel: "Shipping timeline" }, [
    createElement("div", { className: "shipping-timeline__inputs" }, [
      createElement("div", { className: "shipping-timeline__input" }, [
        createElement("div", { className: "shipping-timeline__input-heading" }, [
          createElement("label", { htmlFor: shippingDateInputId }, "Shipping date"),
          value.shippingDate && !disabled ? createElement("button", {
            className: "shipping-timeline__clear-date",
            type: "button",
            dataAction: "clear-shipping-timeline-date",
            dataProductId: product.id,
            dataStageId: stage.stage_id,
            dataFieldId: field.fieldId,
            ariaLabel: "Clear shipping date",
            title: "Clear shipping date",
          }, [createIcon("close"), createElement("span", null, "Clear date")]) : null,
        ].filter(Boolean)),
        createElement("input", {
          id: shippingDateInputId,
          className: "form-input",
          type: "date",
          value: value.shippingDate,
          dataFieldPart: "shippingDate",
          ...baseOptions,
        }),
      ]),
      createElement("label", { className: "shipping-timeline__input" }, [
        createElement("span", null, "Expected shipping days"),
        createElement("input", {
          className: "form-input",
          type: "number",
          min: "1",
          step: "1",
          inputMode: "numeric",
          placeholder: "Example: 20",
          value: value.expectedDays,
          dataFieldPart: "expectedDays",
          ...baseOptions,
        }),
      ]),
    ]),
    createElement("div", { className: "shipping-timeline__summary" }, [
      createElement("span", { className: "shipping-timeline__status" }, [createIcon(progress.icon), createElement("strong", null, progress.title)]),
      createElement("span", { className: "shipping-timeline__eta" }, progress.etaLabel),
    ]),
    createElement("div", { className: "shipping-timeline__progress", ariaLabel: `${progress.percent}% shipping timeline progress` }, [
      createElement("span", { className: "shipping-timeline__route" }, [
        createElement("span", { className: "shipping-timeline__progress-track" }, [
          createElement("span", { className: "shipping-timeline__progress-fill", style: { width: `${progress.percent}%` } }),
        ]),
        renderShippingTimelineDots(progress),
      ]),
    ]),
    createElement("div", { className: "shipping-timeline__metrics" }, [
      createElement("span", null, progress.elapsedLabel),
      createElement("span", { className: "shipping-timeline__remaining-badge" }, progress.remainingLabel),
    ]),
  ]);
}

function renderShippingTimelineDots(progress) {
  if (!progress.totalDays) {
    return [
      createElement("span", { className: "shipping-timeline__dot shipping-timeline__dot--placeholder", style: { left: "0%" }, title: "Shipping date" }),
      createElement("span", { className: "shipping-timeline__dot shipping-timeline__dot--placeholder", style: { left: "100%" }, title: "Expected arrival" }),
    ];
  }

  return Array.from({ length: progress.totalDays }, (_, index) => {
    const dayNumber = index + 1;
    const left = progress.totalDays === 1 ? 0 : (index / (progress.totalDays - 1)) * 100;
    const isComplete = progress.currentDay > 0 && dayNumber <= Math.min(progress.currentDay, progress.totalDays);
    const isCurrent = progress.currentDay > 0 && dayNumber === Math.min(progress.currentDay, progress.totalDays);
    const classes = [
      "shipping-timeline__dot",
      isComplete ? "shipping-timeline__dot--complete" : "",
      isCurrent ? "shipping-timeline__dot--current" : "",
    ].filter(Boolean).join(" ");
    return createElement("span", {
      className: classes,
      style: { left: `${left}%` },
      title: `Shipping day ${dayNumber} of ${progress.totalDays}`,
      ariaLabel: isCurrent ? getShippingTimelineMarkerLabel(progress.status) : null,
    });
  });
}

function getShippingTimelineMarkerLabel(status) {
  if (status === "scheduled") return "Scheduled shipment start";
  if (status === "empty") return "Timeline start";
  if (status === "overdue") return "Current overdue day";
  if (status === "due") return "Expected arrival today";
  return "Current shipping day";
}

function getShippingTimelineProgress(value) {
  const shippingDate = parseLocalCalendarDate(value.shippingDate);
  const expectedDays = value.expectedDays;
  if (!shippingDate || !expectedDays) {
    return {
      status: "empty",
      percent: 0,
      totalDays: expectedDays || 0,
      currentDay: 0,
      icon: "schedule",
      title: shippingDate ? "Set the expected shipping days" : "Set the shipping date",
      etaLabel: "The timeline stays ready until shipping begins",
      elapsedLabel: "0 days in transit",
      remainingLabel: expectedDays ? `${expectedDays} days expected` : "Expected days not set",
    };
  }

  const today = getLocalCalendarToday();
  const elapsedDays = getCalendarDayDifference(shippingDate, today);
  const expectedArrival = addCalendarDays(shippingDate, expectedDays - 1);
  const etaLabel = `Expected arrival: ${formatCalendarDate(expectedArrival)}`;

  if (elapsedDays < 0) {
    return {
      status: "scheduled",
      percent: 0,
      totalDays: expectedDays,
      currentDay: 0,
      icon: "event",
      title: `Scheduled in ${Math.abs(elapsedDays)} day${Math.abs(elapsedDays) === 1 ? "" : "s"}`,
      etaLabel,
      elapsedLabel: "0 days in transit",
      remainingLabel: `${expectedDays} days expected`,
    };
  }

  const currentDay = elapsedDays + 1;
  const percent = expectedDays === 1 ? 100 : Math.min(100, Math.round(((currentDay - 1) / (expectedDays - 1)) * 100));
  if (currentDay > expectedDays) {
    const overdueDays = currentDay - expectedDays;
    return {
      status: "overdue",
      percent: 100,
      totalDays: expectedDays,
      currentDay,
      icon: "warning",
      title: `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,
      etaLabel,
      elapsedLabel: `${currentDay} days in transit`,
      remainingLabel: "Should have arrived by now",
    };
  }

  if (currentDay === expectedDays) {
    return {
      status: "due",
      percent: 100,
      totalDays: expectedDays,
      currentDay,
      icon: "local_shipping",
      title: "Expected arrival today",
      etaLabel,
      elapsedLabel: `${currentDay} days in transit`,
      remainingLabel: "0 days remaining",
    };
  }

  const remainingDays = expectedDays - currentDay;
  return {
    status: "in-transit",
    percent,
    totalDays: expectedDays,
    currentDay,
    icon: "local_shipping",
    title: "In transit",
    etaLabel,
    elapsedLabel: `${currentDay} day${currentDay === 1 ? "" : "s"} in transit`,
    remainingLabel: `${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining`,
  };
}

function parseLocalCalendarDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? date
    : null;
}

function getLocalCalendarToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getCalendarDayDifference(startDate, endDate) {
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function addCalendarDays(date, days) {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatCalendarDate(date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function renderWorkspaceShipmentTrackerField(product, stage, field, disabled) {
  const trackingNumber = normalizeTrackingNumber(field.value);
  return createElement("div", { className: `workspace-shipment-tracker ${trackingNumber ? "workspace-shipment-tracker--active" : ""}`.trim() }, [
    createElement("div", { className: "workspace-shipment-tracker__entry" }, [
      createElement("input", {
        className: "form-input",
        type: "text",
        placeholder: "Paste or update tracking number...",
        value: trackingNumber,
        dataAction: "update-workspace-field",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled,
      }),
      createElement("button", {
        className: "workspace-shipment-tracker__button",
        type: "button",
        dataAction: "track-shipment",
      }, [createIcon("local_shipping"), createElement("span", null, "TRACK SHIPMENT")]),
      trackingNumber && !disabled ? createElement("button", {
        className: "workspace-shipment-tracker__clear",
        type: "button",
        dataAction: "clear-shipment-tracking",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        ariaLabel: "Remove saved tracking number",
        title: "Remove tracking number",
      }, [createIcon("close")]) : null,
    ].filter(Boolean)),
  ]);
}

function renderShipmentTrackingOverview(trackingNumber, milestones) {
  const carrierLabel = getShipmentCarrierLabel(trackingNumber);
  const status = getShipmentStatusSummary(trackingNumber, milestones);
  const trackingEvents = getShipmentTrackingEvents(trackingNumber, milestones);
  const statusTabs = [
    ["All", "1", "widgets"],
    ["Info received", "0", "local_shipping"],
    ["In transit", "1", "flight_takeoff"],
    ["Pick up", "0", "flag"],
    ["Out for Delivery", "0", "receipt_long"],
    ["Delivered", "0", "check"],
    ["Alert", "0", "warning"],
  ];
  const progressStops = ["Created", "Collected", "In transit", "Out for delivery", "Delivered"];

  return createElement("div", { className: "workspace-shipment-tracker__monitor workspace-shipment-tracker__monitor--17track", ariaLabel: `Shipment progress for ${trackingNumber}` }, [
    createElement("div", { className: "workspace-shipment-tracker__tabs", ariaLabel: "Shipment status filters" },
      statusTabs.map(([label, count, icon], index) => createElement("span", { className: `workspace-shipment-tracker__tab ${index === 0 ? "is-active" : ""}`.trim() }, [
        createIcon(icon),
        createElement("span", null, `${label}(${count})`),
      ])),
    ),
    createElement("section", { className: "workspace-shipment-tracker__17-card" }, [
      createElement("div", { className: "workspace-shipment-tracker__17-summary" }, [
        createElement("span", { className: "workspace-shipment-tracker__carrier-icon" }, [createIcon("flight_takeoff")]),
        createElement("span", { className: "workspace-shipment-tracker__tracking-id" }, [
          createElement("b", null, trackingNumber),
          createElement("small", null, `${status.label} · ${status.age}`),
        ]),
        createElement("span", { className: "workspace-shipment-tracker__carrier" }, [
          createElement("b", null, carrierLabel),
          createElement("small", null, "Carrier auto-detected"),
        ]),
        createElement("span", { className: "workspace-shipment-tracker__destination" }, [
          createElement("b", null, "United States"),
          createElement("small", null, status.location),
        ]),
        createElement("button", { className: "workspace-shipment-tracker__live-link", type: "button", dataAction: "track-shipment" }, [
          createIcon("open_in_new"),
          createElement("span", null, "Open live lookup"),
        ]),
      ]),
      createElement("div", { className: "workspace-shipment-tracker__headline" }, [
        createElement("strong", null, status.headline),
        createElement("span", { className: "workspace-shipment-tracker__by-carrier" }, `By ${carrierLabel}`),
      ]),
      createElement("div", { className: "workspace-shipment-tracker__progress", ariaLabel: `${status.progress}% shipment progress` }, [
        createElement("span", { className: "workspace-shipment-tracker__progress-line" }, [
          createElement("span", { className: "workspace-shipment-tracker__progress-fill", style: { width: `${status.progress}%` } }),
        ]),
        progressStops.map((label, index) => createElement("span", { className: `workspace-shipment-tracker__progress-stop ${index <= status.stopIndex ? "is-active" : ""}`.trim() }, [
          createElement("span", null),
          createElement("small", null, label),
        ])),
      ]),
      createElement("p", { className: "workspace-shipment-tracker__notice" }, "This mirrors the 17TRACK-style workflow inside LaunchPad Pro. Live carrier data still opens through the free external lookup because direct carrier/17TRACK APIs require service access."),
      createElement("div", { className: "workspace-shipment-tracker__details" }, [
        createElement("div", { className: "workspace-shipment-tracker__details-heading" }, [
          createElement("h4", null, "Tracking Information"),
          createElement("span", null, `Sync preview · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`),
        ]),
        createElement("ol", null, trackingEvents.map((event) => createElement("li", { className: event.current ? "is-current" : "" }, [
          createElement("span", { className: "workspace-shipment-tracker__event-dot" }, [createIcon(event.current ? "flight_takeoff" : "radio_button_unchecked")]),
          createElement("time", null, event.date),
          createElement("strong", null, event.location),
          createElement("p", null, event.description),
        ]))),
      ]),
    ]),
  ]);
}

function renderWorkspaceTableField(product, stage, field, disabled) {
  const canAdjustTable = canAdjustWorkspaceTableSheets();
  const columns = getCustomTableColumns(field);
  const rows = getCustomTableRows(field);
  const hasColumns = columns.length > 0;
  const hasRows = rows.length > 0;
  const isStandaloneColumns = hasColumns && !hasRows;
  const isStandaloneRows = hasRows && !hasColumns;
  const effectiveColumns = hasColumns ? columns : hasRows ? [] : ["Details"];
  const effectiveRows = hasRows ? rows : [""];
  const tableValue = resizeCustomTableValue(field.value, effectiveRows.length, effectiveColumns.length);
  const columnWidths = getCustomTableColumnWidths(field);
  const rowHeights = getCustomTableRowHeights(field);
  const hasRowHeaderColumn = !isStandaloneColumns;
  const isCompactTable = field.type === "HALF_TABLE";
  const rowHeaderStyle = createWorkspaceTableDimensionStyle(hasRowHeaderColumn ? columnWidths[0] : null, null, isCompactTable);
  const tableStyle = createWorkspaceTableStyle(effectiveColumns.length, columnWidths, hasRowHeaderColumn, isCompactTable);
  const isImagePlanningTable = stage.stage_id === "image-planning";
  const tableStructureKey = getWorkspaceTableStructureKey(product.id, stage.stage_id, field.fieldId);
  const tableStructureEditing = uiState.editingWorkspaceTableStructureIds.has(tableStructureKey);
  const tableClass = [
    "workspace-table-field",
    "workspace-table-field--keyword-style",
    tableStructureEditing ? "workspace-table-field--editing-structure" : "",
    isImagePlanningTable ? "workspace-table-field--image-planning" : "",
    isStandaloneColumns ? "workspace-table-field--standalone-columns" : "",
    isStandaloneRows ? "workspace-table-field--standalone-rows" : "",
  ].filter(Boolean).join(" ");

  return createElement("div", { className: tableClass }, [
    createElement("div", { className: "workspace-table-field__toolbar" }, [
      createElement("div", { className: "workspace-table-field__title" }, [
        createElement("strong", null, field.label),
        createElement("span", null, isImagePlanningTable
          ? "Add/remove rows and columns. Edit column headers inline; links become clickable automatically."
          : "Resizable table. Drag headers to reorder or edit headers inline."),
      ]),
      canAdjustTable ? createElement("div", { className: "workspace-table-field__quick-actions" }, [
        createElement("button", {
          className: "workspace-table-field__quick-add",
          type: "button",
          dataAction: "add-workspace-table-column",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Add column to ${field.label}`,
          title: "Add column",
        }, [createIcon("add"), createElement("span", null, "Column")]),
        createElement("button", {
          className: "workspace-table-field__quick-add",
          type: "button",
          dataAction: "add-workspace-table-row",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Add row to ${field.label}`,
          title: "Add row",
        }, [createIcon("add"), createElement("span", null, "Row")]),
        createElement("button", {
          className: `workspace-table-field__quick-add workspace-table-field__edit-structure ${tableStructureEditing ? "workspace-table-field__edit-structure--active" : ""}`,
          type: "button",
          dataAction: "toggle-workspace-table-structure-controls",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `${tableStructureEditing ? "Hide" : "Show"} table delete controls for ${field.label}`,
          ariaPressed: tableStructureEditing ? "true" : "false",
          title: `${tableStructureEditing ? "Hide" : "Show"} row and column delete controls`,
        }, [createIcon("edit")]),
      ]) : null,
    ].filter(Boolean)),
    createElement("div", { className: "workspace-table-field__scroll" }, [
      createElement("table", { style: tableStyle }, [
        renderWorkspaceTableColGroup(effectiveColumns, columnWidths, hasRowHeaderColumn),
        isStandaloneRows ? null : createElement("thead", null, createElement("tr", null, [
          isStandaloneColumns ? null : createElement("th", { className: "workspace-table-field__corner workspace-table-field__heading", style: rowHeaderStyle }, [
            renderWorkspaceTableCornerHeader({ product, stage, field, disabled, isImagePlanningTable }),
            canAdjustTable ? renderWorkspaceTableResizeHandle({ product, stage, field, axis: "column", index: 0 }) : null,
          ]),
          effectiveColumns.map((column, columnIndex) => createElement("th", {
            className: "workspace-table-field__heading workspace-table-field__heading--column",
            style: createWorkspaceTableDimensionStyle(getWorkspaceTableColumnWidth(columnWidths, columnIndex, hasRowHeaderColumn), null, isCompactTable),
            dataTableDropAxis: "column",
            dataTableDropIndex: columnIndex,
            title: column,
          }, [
            renderWorkspaceTableColumnHeader({ product, stage, field, column, columnIndex, canDrag: tableStructureEditing && canAdjustTable && hasColumns, canRemove: tableStructureEditing && canAdjustTable && hasColumns && (columns.length > 1 || hasRows), disabled }),
            canAdjustTable ? renderWorkspaceTableResizeHandle({ product, stage, field, axis: "column", index: columnIndex + (hasRowHeaderColumn ? 1 : 0) }) : null,
          ])),
        ].filter(Boolean))),
        createElement("tbody", null, effectiveRows.map((rowLabel, rowIndex) => {
          const productRowLabel = getWorkspaceTableProductRowLabel(field, rowIndex, tableValue, isImagePlanningTable);
          return createElement("tr", null, [
          isStandaloneColumns ? null : createElement("th", {
            className: "workspace-table-field__heading workspace-table-field__heading--row",
            style: createWorkspaceTableDimensionStyle(hasRowHeaderColumn ? columnWidths[0] : null, rowHeights[rowIndex], isCompactTable),
            dataTableDropAxis: "row",
            dataTableDropIndex: rowIndex,
            title: productRowLabel,
          }, hasRows ? [
            renderWorkspaceTableRowHeader({ product, stage, field, rowLabel: productRowLabel, rowIndex, canDrag: tableStructureEditing && canAdjustTable && hasRows, canRemove: tableStructureEditing && canAdjustTable && (rows.length > 1 || hasColumns), disabled, useNumbering: isImagePlanningTable }),
            canAdjustTable ? renderWorkspaceTableResizeHandle({ product, stage, field, axis: "row", index: rowIndex }) : null,
          ] : ""),
          effectiveColumns.map((columnLabel, columnIndex) => createElement("td", { style: createWorkspaceTableDimensionStyle(getWorkspaceTableColumnWidth(columnWidths, columnIndex, hasRowHeaderColumn), rowHeights[rowIndex], isCompactTable) }, renderWorkspaceTableCellInput({
            product,
            stage,
            field,
            rowLabel: hasRows ? getWorkspaceTableRowDisplayLabel(productRowLabel, rowIndex, isImagePlanningTable) : "",
            columnLabel,
            rowIndex,
            columnIndex,
            value: tableValue?.[rowIndex]?.[columnIndex] ?? "",
            disabled,
          }))),
        ].filter(Boolean));
        })),
      ]),
    ]),
  ]);
}

function renderWorkspaceTableColGroup(effectiveColumns, columnWidths, hasRowHeaderColumn) {
  const columns = [];
  if (hasRowHeaderColumn) columns.push(createElement("col", { style: createWorkspaceTableDimensionStyle(columnWidths[0]) }));
  effectiveColumns.forEach((_, columnIndex) => {
    columns.push(createElement("col", { style: createWorkspaceTableDimensionStyle(getWorkspaceTableColumnWidth(columnWidths, columnIndex, hasRowHeaderColumn)) }));
  });
  return columns.length > 0 ? createElement("colgroup", null, columns) : null;
}

function renderWorkspaceTableCornerHeader({ product, stage, field, disabled, isImagePlanningTable }) {
  if (isImagePlanningTable) return "Image No#";
  return createElement("textarea", {
    className: "workspace-table-field__heading-input workspace-table-field__heading-input--corner",
    value: getCustomTableCornerHeader(field),
    rows: 2,
    placeholder: "Header",
    dataAction: "update-workspace-table-heading",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    dataTableAxis: "corner",
    ariaLabel: `Corner header for ${field.label}`,
    disabled: disabled || !canAdjustWorkspaceTableSheets(),
  });
}

function renderWorkspaceTableDragHandle({ product, stage, field, axis, index, disabled }) {
  if (disabled) return null;
  return createElement("button", {
    className: "workspace-table-field__drag-handle",
    type: "button",
    draggable: true,
    dataAction: axis === "column" ? "drag-workspace-table-column" : "drag-workspace-table-row",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    dataTableAxis: axis,
    dataTableIndex: index,
    ariaLabel: `Drag ${axis} to reorder`,
    title: `Drag ${axis} to reorder`,
  }, [createIcon("drag_indicator")]);
}

function renderWorkspaceTableResizeHandle({ product, stage, field, axis, index }) {
  return createElement("span", {
    className: `workspace-table-field__resize-handle workspace-table-field__resize-handle--${axis}`,
    role: "separator",
    ariaLabel: `Resize ${axis}`,
    dataAction: "resize-workspace-table-section",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    dataTableAxis: axis,
    dataTableIndex: index,
    title: `Resize ${axis}`,
  });
}

function renderWorkspaceTableColumnHeader({ product, stage, field, column, columnIndex, canDrag, canRemove, disabled }) {
  return createElement("span", { className: "workspace-table-field__header-control" }, [
    canDrag ? renderWorkspaceTableDragHandle({ product, stage, field, axis: "column", index: columnIndex, disabled }) : null,
    createElement("textarea", {
      className: "workspace-table-field__heading-input",
      value: column,
      rows: 2,
      dataAction: "update-workspace-table-heading",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataTableAxis: "column",
      dataTableIndex: columnIndex,
      ariaLabel: `Column ${columnIndex + 1} header for ${field.label}`,
      disabled: !canAdjustWorkspaceTableSheets(),
    }),
    canRemove ? createElement("button", {
      className: "workspace-table-field__remove-section",
      type: "button",
      dataAction: "remove-workspace-table-column",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataTableIndex: columnIndex,
      ariaLabel: `Remove ${column} column`,
      title: "Remove column",
    }, [createIcon("delete")]) : null,
  ].filter(Boolean));
}

function renderWorkspaceTableRowHeader({ product, stage, field, rowLabel, rowIndex, canDrag, canRemove, disabled, useNumbering }) {
  const displayLabel = getWorkspaceTableRowDisplayLabel(rowLabel, rowIndex, useNumbering);
  return createElement("span", { className: "workspace-table-field__row-control" }, [
    canDrag ? renderWorkspaceTableDragHandle({ product, stage, field, axis: "row", index: rowIndex, disabled }) : null,
    useNumbering ? createElement("span", { className: "workspace-table-field__row-number" }, displayLabel) : createElement("textarea", {
      className: "workspace-table-field__heading-input workspace-table-field__heading-input--row",
      value: rowLabel,
      rows: 2,
      dataAction: "update-workspace-table-heading",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataTableAxis: "row",
      dataTableIndex: rowIndex,
      ariaLabel: `Row ${rowIndex + 1} header for ${field.label}`,
      disabled: disabled || !canEditProductFieldValues(),
    }),
    canRemove ? createElement("button", {
      className: "workspace-table-field__remove-section",
      type: "button",
      dataAction: "remove-workspace-table-row",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataTableIndex: rowIndex,
      ariaLabel: `Remove row ${displayLabel}`,
      title: "Remove row",
    }, [createIcon("delete")]) : null,
  ].filter(Boolean));
}

function getWorkspaceTableRowDisplayLabel(rowLabel, rowIndex, useNumbering = false) {
  if (useNumbering) return String(rowIndex + 1).padStart(2, "0");
  return rowLabel || "";
}

function getWorkspaceTableProductRowLabel(field, rowIndex, tableValue, useNumbering = false) {
  if (useNumbering) return getWorkspaceTableRowDisplayLabel("", rowIndex, true);
  const rowLabels = getCustomTableRowLabels(field);
  if (Object.prototype.hasOwnProperty.call(rowLabels, rowIndex)) {
    return rowLabels[rowIndex] || "";
  }
  return "";
}

function workspaceTableRowHasCellData(tableValue, rowIndex) {
  const row = Array.isArray(tableValue) ? tableValue[rowIndex] : null;
  if (!Array.isArray(row)) return false;
  return row.some((value) => String(value ?? "").trim());
}

function workspaceTableHasCellData(tableValue) {
  if (!Array.isArray(tableValue)) return false;
  return tableValue.some((_, rowIndex) => workspaceTableRowHasCellData(tableValue, rowIndex));
}

function renderWorkspaceTableCellInput({ product, stage, field, rowLabel, columnLabel, rowIndex, columnIndex, value, disabled }) {
  const cellValue = String(value ?? "");
  const isLink = isWorkspaceTableCellLink(cellValue);
  const linkUrl = isLink ? normalizeChatUrl(cellValue) : "";
  const cellKey = getWorkspaceTableCellKey(product.id, stage.stage_id, field.fieldId, rowIndex, columnIndex);
  const renderClickableLink = isLink && uiState.editingTableLinkCell !== cellKey;

  return createElement("div", { className: `workspace-table-field__cell-control ${isLink ? "workspace-table-field__cell-control--link" : ""}`.trim() }, [
    renderClickableLink ? createElement("a", {
      className: "workspace-table-field__link-value",
      href: linkUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      ariaLabel: `Open ${cellValue}`,
      title: `Open ${cellValue}`,
    }, [createIcon("open_in_new"), createElement("span", { className: "workspace-table-field__link-text" }, cellValue)]) : createElement("textarea", {
      className: "workspace-table-field__input",
      rows: 1,
      value: cellValue,
      dataAction: "update-workspace-table-cell",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataRowIndex: rowIndex,
      dataColumnIndex: columnIndex,
      ariaLabel: `${field.label} ${rowLabel} ${columnLabel}`,
      disabled,
    }),
    renderClickableLink && !disabled ? createElement("button", {
      className: "workspace-table-field__edit-link",
      type: "button",
      dataAction: "edit-workspace-table-link-cell",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataRowIndex: rowIndex,
      dataColumnIndex: columnIndex,
      ariaLabel: `Edit ${cellValue}`,
      title: "Edit link text",
    }, [createIcon("edit")]) : null,
  ].filter(Boolean));
}

function getWorkspaceTableCellKey(productId, stageId, fieldId, rowIndex, columnIndex) {
  return [productId, stageId, fieldId, rowIndex, columnIndex].map((value) => String(value ?? "")).join("::");
}

function getWorkspaceTableStructureKey(productId, stageId, fieldId) {
  return [productId, stageId, fieldId].map((value) => String(value ?? "")).join("::");
}

function isWorkspaceTableCellLink(value) {
  const cleanValue = String(value ?? "").trim();
  return /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(cleanValue) && isSafeExternalUrl(cleanValue);
}

function renderWorkspaceFileUploadField(product, stage, field, disabled) {
  const files = normalizeWorkspaceFileList(field.value);
  const inputId = `workspace-file-upload-${product.id}-${stage.stage_id}-${field.fieldId}`;

  return createElement("div", { className: "workspace-file-field" }, [
    files.length > 0
      ? createElement("div", { className: "workspace-file-field__list" }, files.map((file) => renderWorkspaceFileUploadItem(product, stage, field, file, disabled)))
      : createElement("p", { className: "workspace-file-field__empty" }, "No files uploaded yet."),
    createElement("div", { className: "workspace-file-field__footer" }, [
      createElement("input", {
        className: "workspace-file-field__input",
        id: inputId,
        type: "file",
        multiple: true,
        accept: ".pdf,.csv,.xls,.xlsx,.ai,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/postscript,application/illustrator,application/vnd.adobe.illustrator",
        dataAction: "upload-workspace-file-field",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled,
      }),
      createElement("label", { className: `workspace-file-field__upload ${disabled ? "workspace-file-field__upload--disabled" : ""}`.trim(), htmlFor: inputId }, [
        createIcon("upload_file"),
        createElement("span", null, files.length > 0 ? "Add more files" : "Upload File Only"),
      ]),
      createElement("small", null, "PDF, CSV, Excel, AI, image, and other files are supported."),
    ]),
  ]);
}

function renderWorkspaceFileUploadItem(product, stage, field, file, disabled) {
  const isImage = file.type?.startsWith("image/");
  const fileUrl = getStorageAssetUrl(file);
  const isExternalLink = isWorkspaceExternalLinkFile(file);
  return createElement("article", { className: "workspace-file-field__item" }, [
    createElement("div", { className: "workspace-file-field__icon" }, isImage && fileUrl
      ? createElement("img", { src: fileUrl, alt: file.name })
      : createIcon(getWorkspaceFileIcon(file))),
    createElement("div", { className: "workspace-file-field__meta" }, [
      createElement("strong", null, file.name),
      createElement("small", null, `${formatFileSize(file.size)} · ${file.type || "File"}`),
    ]),
    createElement("a", {
      className: "workspace-file-field__action",
      href: fileUrl,
      ...(isExternalLink ? { target: "_blank", rel: "noreferrer" } : { download: file.name }),
      ariaLabel: isExternalLink ? `Open ${file.name}` : `Download ${file.name}`,
    }, [createIcon(isExternalLink ? "open_in_new" : "download")]),
    !disabled ? createElement("button", {
      className: "workspace-file-field__action workspace-file-field__action--danger",
      type: "button",
      dataAction: "remove-workspace-file-field",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataAttachmentId: file.attachmentId,
      ariaLabel: `Remove ${file.name}`,
    }, [createIcon("delete")]) : null,
  ].filter(Boolean));
}

function getWorkspaceFileIcon(file) {
  if (isWorkspaceExternalLinkFile(file)) return "link";
  const type = String(file?.type ?? "");
  const name = String(file?.name ?? "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "picture_as_pdf";
  if (type.includes("spreadsheet") || type.includes("excel") || /\.(csv|xls|xlsx)$/.test(name)) return "table_chart";
  if (type.startsWith("image/")) return "image";
  return "description";
}

function isWorkspaceExternalLinkFile(file) {
  return Boolean(file?.isExternalLink) || String(file?.type ?? "") === "text/uri-list";
}

function renderWorkspaceImageGalleryField(product, stage, field, disabled) {
  const value = normalizeImageGalleryValue(field.value);
  const selectedFormat = getImageGalleryFormat(value.format);
  const uploadError = uiState.imageGalleryUploadError ? createElement("p", { className: "image-gallery-field__error", role: "alert" }, uiState.imageGalleryUploadError) : null;

  if (!selectedFormat) {
    return createElement("section", { className: "image-gallery-field", ariaLabel: `${field.label} image gallery` }, [
      createElement("div", { className: "image-gallery-field__intro" }, [
        createElement("strong", null, "Choose an image gallery format"),
        createElement("span", null, "The format is selected here in the workspace after adding the Image Gallery field."),
      ]),
      uploadError,
      renderImageGalleryFormatOptions(product, stage, field, value, disabled),
    ].filter(Boolean));
  }

  const slots = createImageGallerySlots(value);
  const baseSlotCount = getImageGalleryBaseSlotCount(value.format);
  return createElement("section", { className: `image-gallery-field image-gallery-field--configured image-gallery-field--${selectedFormat.value}`.trim(), ariaLabel: `${field.label} image gallery` }, [
    createElement("div", { className: "image-gallery-field__intro" }, [
      createElement("strong", null, selectedFormat.label),
      createElement("span", null, `${selectedFormat.description} Empty black slots are ready for image uploads.`),
    ]),
    uploadError,
    createElement("div", { className: "image-gallery-field__slots" }, slots.map((slot) => renderImageGallerySlot(product, stage, field, slot, slots.length, baseSlotCount, disabled))),
    !disabled ? createElement("button", {
      className: "image-gallery-field__add-slot",
      type: "button",
      dataAction: "add-image-gallery-slot",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
    }, [createIcon("add_photo_alternate"), createElement("span", null, "Add another image slot")]) : null,
  ].filter(Boolean));
}

function renderImageGalleryFormatOptions(product, stage, field, value, disabled) {
  return createElement("div", { className: "image-gallery-field__formats" }, IMAGE_GALLERY_FORMATS.map((format) => createElement("button", {
    className: `image-gallery-field__format ${value.format === format.value ? "image-gallery-field__format--selected" : ""}`.trim(),
    type: "button",
    dataAction: "select-image-gallery-format",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    dataGalleryFormat: format.value,
    disabled,
    ariaPressed: value.format === format.value ? "true" : "false",
  }, [
    createElement("strong", null, format.label),
    createElement("small", null, format.description),
  ])));
}

function renderImageGallerySlot(product, stage, field, slot, slotCount, baseSlotCount, disabled) {
  const imageUrl = getStorageAssetUrl(slot.image);
  const inputId = `image-gallery-upload-${product.id}-${stage.stage_id}-${field.fieldId}-${slot.slotIndex}`;
  const slotLabel = imageUrl ? `Replace image ${slot.slotIndex + 1}` : `Upload image ${slot.slotIndex + 1}`;
  const isUploading = uiState.imageGalleryUploadingSlots.has(getImageGallerySlotKey(product.id, stage.stage_id, field.fieldId, slot.slotIndex));
  const canRemoveEmptySlot = !imageUrl && slot.slotIndex >= baseSlotCount;

  return createElement("article", { className: `image-gallery-field__slot ${imageUrl ? "image-gallery-field__slot--filled" : "image-gallery-field__slot--empty"} ${isUploading ? "image-gallery-field__slot--uploading" : ""}`.trim() }, [
    imageUrl
      ? createElement("button", {
        className: "image-gallery-field__preview",
        type: "button",
        dataAction: "open-image-gallery-preview",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        dataGallerySlotIndex: slot.slotIndex,
        ariaLabel: `Enlarge ${slot.image?.name ?? `gallery image ${slot.slotIndex + 1}`}`,
      }, [
        createElement("img", { src: imageUrl, alt: slot.image?.name ?? `Gallery image ${slot.slotIndex + 1}` }),
      ])
      : createElement("span", { className: "image-gallery-field__empty-label" }, [createIcon("add_photo_alternate"), createElement("span", null, `Image ${slot.slotIndex + 1}`)]),
    !disabled ? createElement("input", {
      className: "image-gallery-field__input",
      id: inputId,
      type: "file",
      accept: "image/*",
      multiple: true,
      disabled: isUploading,
      dataAction: "upload-image-gallery-image",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataGallerySlotIndex: slot.slotIndex,
      ariaLabel: slotLabel,
    }) : null,
    !disabled ? createElement("label", { className: "image-gallery-field__upload", htmlFor: inputId }, [createIcon(imageUrl ? "swap_horiz" : "upload"), createElement("span", null, imageUrl ? "Replace" : "Upload")]) : null,
    isUploading ? createElement("span", { className: "image-gallery-field__progress", role: "status" }, [
      createElement("span", { className: "image-gallery-field__spinner", ariaHidden: "true" }),
      createElement("span", null, "Uploading"),
    ]) : null,
    imageUrl && !disabled ? createElement("button", {
      className: "image-gallery-field__remove",
      type: "button",
      dataAction: "remove-image-gallery-image",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataGallerySlotIndex: slot.slotIndex,
      ariaLabel: `Remove ${slot.image?.name ?? `gallery image ${slot.slotIndex + 1}`}`,
    }, [createIcon("delete")]) : null,
    canRemoveEmptySlot && !disabled ? createElement("button", {
      className: "image-gallery-field__remove",
      type: "button",
      dataAction: "remove-image-gallery-slot",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataGallerySlotIndex: slot.slotIndex,
      ariaLabel: `Delete empty image slot ${slot.slotIndex + 1}`,
    }, [createIcon("delete")]) : null,
    imageUrl && !disabled ? createElement("div", { className: "image-gallery-field__move-controls", ariaLabel: `Move ${slot.image?.name ?? `gallery image ${slot.slotIndex + 1}`}` }, [
      createElement("button", {
        type: "button",
        dataAction: "move-image-gallery-image",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        dataGallerySlotIndex: slot.slotIndex,
        dataStageDirection: "previous",
        disabled: slot.slotIndex <= 0,
        ariaLabel: "Move image left",
      }, [createIcon("chevron_left")]),
      createElement("button", {
        type: "button",
        dataAction: "move-image-gallery-image",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        dataGallerySlotIndex: slot.slotIndex,
        dataStageDirection: "next",
        disabled: slot.slotIndex >= slotCount - 1,
        ariaLabel: "Move image right",
      }, [createIcon("chevron_right")]),
    ]) : null,
  ].filter(Boolean));
}

function renderImageGalleryPreviewModal() {
  if (!uiState.imageGalleryPreview) return null;

  const { productId, stageId, fieldId, slotIndex } = uiState.imageGalleryPreview;
  const stageDetails = getWorkspaceStageDetails(productId, stageId);
  const field = stageDetails.customFields.find((item) => item.fieldId === fieldId && item.type === "IMAGE_GALLERY");
  const value = normalizeImageGalleryValue(field?.value);
  const slot = createImageGallerySlots(value).find((item) => item.slotIndex === slotIndex);
  const imageUrl = getStorageAssetUrl(slot?.image);
  if (!field || !imageUrl) return null;

  const imageName = slot.image?.name ?? `${field.label} image ${slotIndex + 1}`;
  return createElement("div", { className: "image-gallery-preview", role: "presentation" }, [
    createElement("section", { className: "image-gallery-preview__dialog", role: "dialog", ariaModal: "true", ariaLabel: imageName }, [
      createElement("div", { className: "image-gallery-preview__header" }, [
        createElement("div", null, [
          createElement("strong", null, imageName),
          createElement("span", null, `${field.label} · Image ${slotIndex + 1}`),
        ]),
        createElement("button", { className: "image-gallery-preview__close", type: "button", dataAction: "close-image-gallery-preview", ariaLabel: "Close image preview" }, [createIcon("close")]),
      ]),
      createElement("img", { src: imageUrl, alt: imageName }),
    ]),
  ]);
}

function renderWorkspacePaymentStatusField(product, stage, field, disabled) {
  const value = normalizePaymentStatusValue(field.value);
  const paymentTotals = calculatePaymentTotals(value);
  const totalCost = paymentTotals.totalCost;
  const isFullPaid = paymentTotals.isFullPaid;
  const paidAmount = paymentTotals.paidAmount;
  const balanceAmount = paymentTotals.balanceAmount;
  const paidPercent = paymentTotals.paidPercent;
  const balancePercent = paymentTotals.balancePercent;
  const inputId = `payment-file-upload-${product.id}-${stage.stage_id}-${field.fieldId}`;

  return createElement("div", { className: "workspace-payment-field" }, [
    createElement("div", { className: "workspace-payment-field__summary" }, [
      createElement("div", { className: "workspace-payment-card workspace-payment-card--paid" }, [
        createElement("span", null, isFullPaid ? "FULL PAYMENT" : `PARTIAL PAID (${paidPercent}%)`),
        createElement("strong", null, formatCurrency(paidAmount)),
        createElement("small", null, isFullPaid ? "Marked as paid" : "Amount already paid"),
      ]),
      createElement("div", { className: "workspace-payment-card workspace-payment-card--balance" }, [
        createElement("span", null, `BALANCE (${balancePercent}%)`),
        createElement("strong", null, formatCurrency(balanceAmount)),
        createElement("small", null, totalCost > 0 ? `${paidPercent}% paid` : "Add total cost"),
      ]),
      createElement("button", {
        className: "workspace-payment-field__manage",
        type: "button",
        dataAction: "open-payment-modal",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
      }, "Record Payment"),
      renderPaymentHistory(product, stage, field, value, disabled),
    ]),
    createElement("div", { className: "workspace-payment-field__documents" }, [
      createElement("div", { className: "workspace-payment-field__documents-header" }, [
        createElement("strong", null, "Documents"),
        createElement("label", { className: `workspace-payment-field__upload ${disabled ? "workspace-payment-field__upload--disabled" : ""}`.trim(), htmlFor: inputId, ariaLabel: "Upload payment document" }, [createIcon("upload_file")]),
        createElement("input", {
          className: "workspace-file-field__input",
          id: inputId,
          type: "file",
          multiple: true,
          accept: ".pdf,.csv,.xls,.xlsx,.ai,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/postscript,application/illustrator,application/vnd.adobe.illustrator",
          dataAction: "upload-payment-field-file",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          disabled,
        }),
      ]),
      value.files.length > 0
        ? createElement("div", { className: "workspace-payment-field__file-list" }, value.files.map((file) => renderWorkspacePaymentFileItem(product, stage, field, file, disabled)))
        : createElement("p", { className: "workspace-file-field__empty" }, "Upload invoice, receipt, AI, or payment proof files."),
    ]),
  ].filter(Boolean));
}

function renderPaymentHistory(product, stage, field, value, disabled) {
  const history = getPaymentHistoryNewestFirst(normalizePaymentHistory(value.history));
  return createElement("div", { className: "workspace-payment-history" }, [
    createElement("strong", null, "Transactions"),
    history.length > 0
      ? history.map((entry) => renderPaymentTransaction(product, stage, field, entry, disabled))
      : createElement("small", null, "No recorded payments yet."),
  ]);
}

function getPaymentHistoryNewestFirst(history) {
  return [...history].sort((firstEntry, secondEntry) => getPaymentHistorySortTime(secondEntry) - getPaymentHistorySortTime(firstEntry));
}

function getPaymentHistorySortTime(entry) {
  const timestamp = new Date(entry.createdAt || (entry.date ? `${entry.date}T23:59:59` : 0)).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function renderPaymentTransaction(product, stage, field, entry, disabled) {
  const paymentType = entry.mode === "full" ? "Full" : "Partial";
  const paymentDate = formatPaymentDateWords(entry.date);
  return createElement("article", { className: "workspace-payment-history__item" }, [
    createElement("div", { className: "workspace-payment-history__details" }, [
      createElement("span", null, entry.paymentTitle || "Payment Record"),
      createElement("strong", null, formatCurrency(entry.amount)),
      createElement("small", null, `${paymentType} payment${entry.mode === "partial" ? ` · ${entry.percent}%` : ""} · Paid ${paymentDate}`),
    ]),
    !disabled ? createElement("div", { className: "workspace-payment-history__actions" }, [
      createElement("button", {
        className: "workspace-file-field__action",
        type: "button",
        dataAction: "open-payment-modal",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        dataPaymentId: entry.paymentId,
        ariaLabel: "Edit recorded payment",
      }, [createIcon("edit")]),
      createElement("button", {
        className: "workspace-file-field__action workspace-file-field__action--danger",
        type: "button",
        dataAction: "delete-payment-transaction",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        dataPaymentId: entry.paymentId,
        ariaLabel: "Delete recorded payment",
      }, [createIcon("delete")]),
    ]) : null,
  ].filter(Boolean));
}

function renderWorkspacePaymentFileItem(product, stage, field, file, disabled) {
  const fileUrl = getStorageAssetUrl(file);
  const isExternalLink = isWorkspaceExternalLinkFile(file);
  return createElement("article", { className: "workspace-payment-field__file" }, [
    createElement("div", { className: "workspace-file-field__icon" }, file.type?.startsWith("image/") && fileUrl ? createElement("img", { src: fileUrl, alt: file.name }) : createIcon(getWorkspaceFileIcon(file))),
    createElement("div", { className: "workspace-file-field__meta" }, [
      createElement("strong", null, file.name),
      createElement("small", null, isExternalLink ? "Invoice link" : `${file.type || "File"} - ${formatFileSize(file.size)}`),
    ]),
    createElement("a", {
      className: "workspace-file-field__action",
      href: fileUrl,
      ...(isExternalLink ? { target: "_blank", rel: "noreferrer" } : { download: file.name }),
      ariaLabel: isExternalLink ? `Open ${file.name}` : `Download ${file.name}`,
    }, [createIcon(isExternalLink ? "open_in_new" : "download")]),
    !disabled && !isExternalLink ? createElement("button", {
      className: "workspace-file-field__action workspace-file-field__action--danger",
      type: "button",
      dataAction: "remove-payment-field-file",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataAttachmentId: file.attachmentId,
      ariaLabel: `Remove ${file.name}`,
    }, [createIcon("delete")]) : null,
  ].filter(Boolean));
}

function getPaymentFieldKey(productId, stageId, fieldId) {
  return `${productId}:${stageId}:${fieldId}`;
}

function renderWorkspaceChecklistNotesField(product, stage, field, disabled) {
  const items = getChecklistNotesItems(field);
  const value = normalizeChecklistNotesValue(field.value, items);

  return createElement("div", { className: "workspace-checklist-notes-field" }, [
    createElement("div", { className: "workspace-checklist-notes-field__list" }, [
      createElement("strong", null, field.label),
      items.length > 0
        ? items.map((item, itemIndex) => createElement("label", { className: "workspace-checklist-notes-field__item" }, [
          createElement("input", {
            type: "checkbox",
            checked: Boolean(value.checked[item]),
            dataAction: "update-workspace-checklist-note-item",
            dataProductId: product.id,
            dataStageId: stage.stage_id,
            dataFieldId: field.fieldId,
            dataOptionIndex: itemIndex,
            disabled,
          }),
          createElement("span", null, item),
        ]))
        : createElement("p", { className: "workspace-fields__empty" }, "Edit this field and add checklist items."),
    ]),
    createElement("label", { className: "workspace-checklist-notes-field__notes" }, [
      createElement("span", null, "Notes"),
      createElement("textarea", {
        className: "form-input workspace-field__textarea",
        rows: 5,
        placeholder: "Add notes...",
        value: value.notes,
        dataAction: "update-workspace-checklist-note-text",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled,
      }),
    ]),
  ]);
}

function renderPaymentStatusModal() {
  if (!uiState.paymentModal) return null;

  const { productId, stageId, fieldId } = uiState.paymentModal;
  const stageDetails = getWorkspaceStageDetails(productId, stageId);
  const field = stageDetails.customFields.find((item) => item.fieldId === fieldId && item.type === "PAYMENT_STATUS");
  if (!field) return null;

  const value = normalizePaymentStatusValue(uiState.paymentModal.value);
  const modalTotals = calculatePaymentTotals(value, uiState.paymentModal.editingPaymentId);
  const totalCost = modalTotals.totalCost;
  const { paidPercent, balance, balancePercent } = getPaymentModalPreview(value);
  const modalTitle = uiState.paymentModal.editingPaymentId ? `Edit ${field.label} Transaction` : `Record ${field.label}`;
  const pendingInvoiceFiles = normalizeWorkspaceFileList(uiState.paymentModal.pendingFiles);
  const isUploadingInvoice = Boolean(uiState.paymentModal.uploadingFiles);
  const uploadError = String(uiState.paymentModal.uploadError ?? "");

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog workspace-modal__dialog--payment",
      dataAction: "save-payment-status",
      dataProductId: productId,
      dataStageId: stageId,
      dataFieldId: fieldId,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: modalTitle,
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, modalTitle),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-payment-modal", ariaLabel: "Close payment form" }, [createIcon("close")]),
      ]),
      createElement("div", { className: "workspace-payment-modal__grid" }, [
        createElement("label", { className: "form-field workspace-payment-modal__title" }, [
          createElement("span", { className: "text-label-sm" }, "Payment Title"),
          createElement("input", { className: "form-input", name: "paymentTitle", type: "text", value: value.paymentTitle, placeholder: "Example: Deposit payment", dataAction: "update-payment-modal-field", dataFieldPart: "paymentTitle" }),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "Total Cost"),
          createElement("input", { className: "form-input", name: "totalCost", type: "number", step: "0.01", value: value.totalCost, dataAction: "update-payment-modal-field", dataFieldPart: "totalCost" }),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm workspace-payment-modal__amount-label" }, `Payment Amount (${paidPercent}%)`),
          createElement("input", {
            className: "form-input",
            name: "partialAmount",
            type: "number",
            step: "0.01",
            value: value.paymentMode === "full" && value.partialAmount === "" ? totalCost : value.partialAmount,
            dataAction: "update-payment-modal-field",
            dataFieldPart: "partialAmount",
          }),
        ]),
        createElement("label", { className: "workspace-payment-field__toggle" }, [
          createElement("input", { name: "isFullPaid", type: "checkbox", checked: value.paymentMode === "full", dataAction: "update-payment-modal-field", dataFieldPart: "isFullPaid" }),
          createElement("span", null, "Tag as fully paid"),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "Payment Date"),
          createElement("input", { className: "form-input", name: "paymentDate", type: "date", value: value.paymentDate, dataAction: "update-payment-modal-field", dataFieldPart: "paymentDate" }),
        ]),
        createElement("label", { className: "form-field workspace-payment-modal__upload" }, [
          createElement("span", { className: "text-label-sm" }, "Invoice PDF File"),
          createElement("input", {
            className: "form-input",
            name: "invoiceFile",
            type: "file",
            accept: ".pdf,application/pdf",
            dataAction: "upload-payment-modal-invoice-file",
            dataProductId: productId,
            dataStageId: stageId,
            dataFieldId: fieldId,
            disabled: isUploadingInvoice,
          }),
          isUploadingInvoice ? createElement("small", { className: "workspace-payment-modal__upload-status" }, "Uploading invoice PDF...") : null,
          uploadError ? createElement("small", { className: "workspace-payment-modal__upload-error" }, uploadError) : null,
          pendingInvoiceFiles.length > 0 ? createElement("div", { className: "workspace-payment-modal__pending-files" }, pendingInvoiceFiles.map((file) => (
            createElement("article", { className: "workspace-payment-modal__pending-file" }, [
              createElement("span", { className: "workspace-file-field__icon" }, [createIcon(getWorkspaceFileIcon(file))]),
              createElement("span", null, [
                createElement("strong", null, file.name),
                createElement("small", null, `${file.type || "File"} - ${formatFileSize(file.size)}`),
              ]),
              createElement("button", {
                type: "button",
                className: "workspace-file-field__action workspace-file-field__action--danger",
                dataAction: "remove-payment-modal-invoice-file",
                dataAttachmentId: file.attachmentId,
                ariaLabel: `Remove ${file.name}`,
              }, [createIcon("close")]),
            ])
          ))) : null,
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "Invoice Number"),
          createElement("input", { className: "form-input", name: "invoiceNumber", type: "text", value: value.invoiceNumber, placeholder: "Add invoice number...", dataAction: "update-payment-modal-field", dataFieldPart: "invoiceNumber" }),
        ]),
        createElement("label", { className: "form-field workspace-payment-modal__invoice" }, [
          createElement("span", { className: "text-label-sm" }, "Invoice Title"),
          createElement("input", { className: "form-input", name: "invoiceTitle", type: "text", value: value.invoiceTitle, placeholder: "Example: Supplier invoice July 2026", dataAction: "update-payment-modal-field", dataFieldPart: "invoiceTitle" }),
        ]),
        createElement("label", { className: "form-field workspace-payment-modal__invoice" }, [
          createElement("span", { className: "text-label-sm" }, "Invoice Link"),
          createElement("input", { className: "form-input", name: "invoiceLink", type: "url", value: value.invoiceLink, placeholder: "Paste invoice URL from Drive, Dropbox, or supplier portal", dataAction: "update-payment-modal-field", dataFieldPart: "invoiceLink" }),
        ]),
        createElement("label", { className: "form-field workspace-payment-modal__description" }, [
          createElement("span", { className: "text-label-sm" }, "Payment Description"),
          createElement("textarea", { className: "form-input", name: "paymentDescription", rows: 3, placeholder: "Add internal payment notes...", value: value.paymentDescription, dataAction: "update-payment-modal-field", dataFieldPart: "paymentDescription" }),
        ]),
        createElement("div", { className: "workspace-payment-field__calculated" }, [
          createElement("span", null, "Auto Balance"),
          createElement("strong", { className: "workspace-payment-modal__balance-amount" }, formatCurrency(balance)),
          createElement("small", { className: "workspace-payment-modal__balance-percent" }, `${balancePercent}% remaining`),
        ]),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-payment-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit", disabled: isUploadingInvoice }, isUploadingInvoice ? "Uploading..." : uiState.paymentModal.editingPaymentId ? "Save Transaction" : "Record Payment"),
      ]),
    ]),
  ]);
}

function renderWorkspaceFieldModal() {
  if (!uiState.fieldModal) return null;

  const { productId, stageId, fieldId, mode } = uiState.fieldModal;
  const stageDetails = getWorkspaceStageDetails(productId, stageId);
  const field = mode === "edit" ? stageDetails.customFields.find((item) => item.fieldId === fieldId) : null;
  const modalTitle = field ? "Edit Custom Field" : "Create Custom Field";
  const submitLabel = field ? "Save Field" : "Create Field";
  const selectedType = uiState.fieldModal.selectedType ?? field?.type ?? WORKSPACE_CUSTOM_FIELD_TYPES[0].value;
  const draftLabel = uiState.fieldModal.fieldLabel ?? field?.label ?? "";
  const headerSubtext = uiState.fieldModal.headerSubtext ?? field?.headerSubtext ?? "";
  const dropdownOptions = getFieldModalDropdownOptions(field);
  const dropdownDraft = uiState.fieldModal.dropdownOptionDraft ?? "";
  const tableColumns = getFieldModalTableColumns(field);
  const tableRows = getFieldModalTableRows(field);
  const checklistItems = getFieldModalChecklistItems(field);
  const linkValue = getFieldModalLinkValue(field);
  const sheetValue = getFieldModalSheetValue(field);
  const galleryFormat = getFieldModalImageGalleryFormat(field);
  const multiShortBarLabels = getFieldModalMultiShortBarLabels(field, selectedType);
  const isTableField = isWorkspaceTableFieldType(selectedType);

  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", {
      className: "workspace-modal__dialog",
      dataAction: "workspace-save-custom-field",
      dataProductId: productId,
      dataStageId: stageId,
      dataFieldId: fieldId,
      role: "dialog",
      ariaModal: "true",
      ariaLabel: modalTitle,
    }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, modalTitle),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-field-modal", ariaLabel: "Close custom field dialog" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Field Name"),
        createElement("input", { className: "form-input", name: "fieldLabel", type: "text", placeholder: "Example: Materials", value: draftLabel, dataAction: "update-field-modal-label" }),
      ]),
      selectedType === "HEADER_TITLE" ? createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Sub Text (Optional)"),
        createElement("input", { className: "form-input", name: "headerSubtext", type: "text", placeholder: "Example: Current product stage", value: headerSubtext, dataAction: "update-field-modal-header-subtext" }),
      ]) : null,
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Field Type"),
        createElement("select", { className: "form-input", name: "fieldType", dataAction: "update-field-modal-type", required: true },
          WORKSPACE_CUSTOM_FIELD_TYPES.map((fieldType) => createElement("option", { value: fieldType.value, selected: selectedType === fieldType.value }, fieldType.label)),
        ),
      ]),
      selectedType === "LINK" ? renderFieldModalLinkEditor(linkValue) : null,
      selectedType === "SHEET_EMBED" ? renderFieldModalSheetEditor(sheetValue) : null,
      selectedType === "CUSTOM_DROPDOWN" ? renderFieldModalDropdownChoices(dropdownOptions, dropdownDraft) : null,
      isTableField ? renderFieldModalListEditor("Columns", "Add the table column headers.", tableColumns, uiState.fieldModal.tableColumnDraft ?? "", "update-field-modal-table-column-draft", "add-field-modal-table-column", "remove-field-modal-table-column") : null,
      isTableField ? renderFieldModalListEditor("Rows", "Add the table row labels.", tableRows, uiState.fieldModal.tableRowDraft ?? "", "update-field-modal-table-row-draft", "add-field-modal-table-row", "remove-field-modal-table-row") : null,
      selectedType === "CHECKLIST_NOTES" ? renderFieldModalListEditor("Checklist Items", "Add checklist labels for the left side of the field.", checklistItems, uiState.fieldModal.checklistItemDraft ?? "", "update-field-modal-checklist-item-draft", "add-field-modal-checklist-item", "remove-field-modal-checklist-item") : null,
      ["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(selectedType) ? renderFieldModalMultiShortBarLabels(multiShortBarLabels) : null,
      selectedType === "IMAGE_GALLERY" ? renderFieldModalImageGalleryFormats(galleryFormat) : null,
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-field-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, submitLabel),
      ]),
    ]),
  ]);
}

function renderFieldModalMultiShortBarLabels(labels) {
  return createElement("section", { className: "field-modal-bar-labels", ariaLabel: "Short bar field names" }, [
    createElement("div", { className: "field-modal-bar-labels__header" }, [
      createElement("strong", null, "Short Bar Field Names"),
      createElement("small", null, "Add a name for each short bar."),
    ]),
    createElement("div", { className: `field-modal-bar-labels__grid field-modal-bar-labels__grid--${labels.length}` }, labels.map((label, index) =>
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, `Bar ${index + 1} Name`),
        createElement("input", {
          className: "form-input",
          type: "text",
          placeholder: `Example: ${index === 0 ? "Width" : index === 1 ? "Height" : index === 2 ? "Length" : "Weight"}`,
          value: label,
          dataAction: "update-field-modal-bar-label",
          dataOptionIndex: index,
        }),
      ]),
    )),
  ]);
}

function renderFieldModalImageGalleryFormats(selectedFormatValue) {
  return createElement("section", { className: "field-modal-gallery-formats", ariaLabel: "Image Gallery format" }, [
    createElement("div", { className: "field-modal-gallery-formats__header" }, [
      createElement("strong", null, "Choose gallery grid"),
      createElement("span", null, "Pick the default workspace layout now. You can still change it later inside the Image Gallery field."),
    ]),
    createElement("div", { className: "field-modal-gallery-formats__grid" }, IMAGE_GALLERY_FORMATS.map((format) => createElement("label", {
      className: `field-modal-gallery-format ${selectedFormatValue === format.value ? "field-modal-gallery-format--selected" : ""}`.trim(),
    }, [
      createElement("input", {
        type: "radio",
        name: "imageGalleryFormat",
        value: format.value,
        checked: selectedFormatValue === format.value,
        dataAction: "update-field-modal-gallery-format",
        required: true,
      }),
      createElement("span", null, [
        createElement("strong", null, format.label),
        createElement("small", null, format.description),
      ]),
    ]))),
  ]);
}

function renderFieldModalSheetEditor(sheetValue) {
  return createElement("section", { className: "field-modal-sheet-editor", ariaLabel: "Embedded spreadsheet details" }, [
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Public Spreadsheet Link"),
      createElement("input", {
        className: "form-input",
        name: "sheetUrl",
        type: "url",
        placeholder: "https://docs.google.com/spreadsheets/...",
        value: sheetValue.url,
        dataAction: "update-field-modal-sheet-url",
      }),
    ]),
    createElement("p", { className: "field-modal-help" }, "Use a public or shared sheet link. Admin/User accounts open the full sheet experience when possible; Viewer accounts use a view-only embedded sheet. Actual editing permissions still come from the source spreadsheet sharing settings."),
  ]);
}

function renderFieldModalLinkEditor(linkValue) {
  return createElement("section", { className: "field-modal-link-editor", ariaLabel: "Link button details" }, [
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Button Text"),
      createElement("input", {
        className: "form-input",
        name: "linkButtonText",
        type: "text",
        placeholder: "Example: Keyword File",
        value: linkValue.label,
        dataAction: "update-field-modal-link-text",
      }),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Link URL"),
      createElement("input", {
        className: "form-input",
        name: "linkUrl",
        type: "url",
        placeholder: "https://docs.google.com/...",
        value: linkValue.url,
        dataAction: "update-field-modal-link-url",
      }),
    ]),
  ]);
}

function renderFieldModalDropdownChoices(options, draftValue) {
  return createElement("section", { className: "field-modal-options", ariaLabel: "Custom dropdown choices" }, [
    createElement("div", { className: "field-modal-options__header" }, [
      createElement("strong", null, "Dropdown Choices"),
      createElement("span", null, "Add the choices users can select from this dropdown."),
    ]),
    options.length > 0
      ? createElement("div", { className: "field-modal-options__chips" }, options.map((option, optionIndex) => createElement("span", { className: "field-modal-options__chip" }, [
        createElement("span", null, option),
        createElement("button", { type: "button", dataAction: "remove-field-modal-option", dataDropdownOptionIndex: optionIndex, ariaLabel: `Remove ${option}` }, "×"),
      ])))
      : createElement("p", { className: "field-modal-options__empty" }, "No choices yet. Type a choice and click +."),
    createElement("div", { className: "field-modal-options__add" }, [
      createElement("input", { className: "form-input", type: "text", value: draftValue, dataAction: "update-field-modal-option-draft", placeholder: "Example: WhatsApp" }),
      createElement("button", { className: "field-modal-options__add-button", type: "button", dataAction: "add-field-modal-option", ariaLabel: "Add dropdown choice" }, [createIcon("add")]),
    ]),
  ]);
}

function renderFieldModalListEditor(title, helpText, options, draftValue, draftAction, addAction, removeAction) {
  return createElement("section", { className: "field-modal-options", ariaLabel: title }, [
    createElement("div", { className: "field-modal-options__header" }, [
      createElement("strong", null, title),
      createElement("span", null, helpText),
    ]),
    options.length > 0
      ? createElement("div", { className: "field-modal-options__chips" }, options.map((option, optionIndex) => createElement("span", { className: "field-modal-options__chip" }, [
        createElement("span", null, option),
        createElement("button", { type: "button", dataAction: removeAction, dataOptionIndex: optionIndex, ariaLabel: `Remove ${option}` }, "×"),
      ])))
      : createElement("p", { className: "field-modal-options__empty" }, "No entries yet. Type one and click +."),
    createElement("div", { className: "field-modal-options__add" }, [
      createElement("input", { className: "form-input", type: "text", value: draftValue, dataAction: draftAction, placeholder: "Type a label..." }),
      createElement("button", { className: "field-modal-options__add-button", type: "button", dataAction: addAction, ariaLabel: `Add ${title}` }, [createIcon("add")]),
    ]),
  ]);
}

function renderKpiRow(appState, progress) {
  const products = Array.isArray(appState.products) ? appState.products : [];
  const sourcingCount = products.filter((product) => [3, 4].includes(product.current_active_stage_index)).length;
  const activePpcCount = products.filter((product) => product.metrics?.activePpc).length;

  return createElement("section", { className: "kpi-row", ariaLabel: "Launch summary" }, [
    renderKpiCard("Total Launches", String(products.length)),
    renderKpiCard("Sourcing", String(sourcingCount)),
    renderKpiCard("Active PPC", String(activePpcCount)),
    renderKpiCard("Avg Conversion Rate", "—"),
    renderKpiCard("Visible Tasks", `${progress.completed_visible_tasks}/${progress.total_visible_tasks}`),
  ]);
}

function renderKpiCard(label, value) {
  return createElement("article", { className: "kpi-card bg-surface-container-lowest" }, [
    createElement("p", { className: "kpi-card__label text-label-sm text-on-surface-variant" }, label),
    createElement("p", { className: "kpi-card__value text-headline-md" }, value),
  ]);
}

function renderPipelineProgress(activeProduct, progress) {
  const stagePercent = Math.round(progress.stage_index_ratio * 100);
  const currentStage = getVisibleStages(activeProduct).at(-1);

  return createElement("section", { className: "pipeline-progress bg-surface-container-lowest" }, [
    createElement("div", { className: "pipeline-progress__header" }, [
      createElement("div", null, [
        createElement("p", { className: "text-label-sm text-on-surface-variant" }, "Overall pipeline progress"),
        createElement("h2", { className: "text-label-md" }, currentStage?.label ?? "No active stage"),
      ]),
      createElement("p", { className: "text-label-md" }, `${stagePercent}%`),
    ]),
    createElement("div", { className: "pipeline-progress__track", role: "progressbar", ariaValueNow: stagePercent, ariaValueMin: 0, ariaValueMax: 100, ariaLabel: "Overall pipeline progress" }, [
      createElement("span", { className: "pipeline-progress__bar", style: { width: `${stagePercent}%` } }),
    ]),
  ]);
}

function renderSearchSummary(visibleStages) {
  if (!uiState.searchQuery) return null;

  return createElement("section", { className: "search-summary bg-surface-container-lowest", ariaLabel: "Visible search results" }, [
    createElement("p", { className: "text-label-md" }, `${visibleStages.length} visible stage results for “${uiState.searchQuery}”`),
    createElement("p", { className: "text-body-md text-on-surface-variant" }, "Search is scoped to the active product and currently visible stages only."),
  ]);
}

function renderSearchEmptyState() {
  return createElement("article", { className: "search-empty bg-surface-container-lowest" }, [
    createElement("h2", { className: "text-label-md" }, "No visible stage matches"),
    createElement("p", { className: "text-body-md text-on-surface-variant" }, "Try another search term. Hidden future stages are never included in search results."),
  ]);
}

function renderStageCard(activeProduct, stage, selectedStageId) {
  const stageBlock = getStageBlock(activeProduct, stage.stage_id);
  const isCurrentStage = stage.stage_index === activeProduct.current_active_stage_index;
  const isSelected = stage.stage_id === selectedStageId;
  const stageProgress = calculateStageProgress(activeProduct, stage.stage_id);
  const progressSummary = stageProgress.total_tasks === 0
    ? "No tasks yet"
    : `${stageProgress.completed_tasks}/${stageProgress.total_tasks} tasks complete`;

  const cardChildren = [
    createElement("button", {
      className: "stage-card__header",
      type: "button",
      dataAction: "select-stage",
      dataStageId: stage.stage_id,
      ariaExpanded: isSelected ? "true" : "false",
      ariaControls: `stage-panel-${stage.stage_id}`,
    }, [
      createElement("span", { className: "stage-card__index text-label-md" }, String(stage.stage_index)),
      createElement("span", { className: "stage-card__heading" }, [
        createElement("span", { className: "text-label-md" }, stage.label),
        createElement("span", { className: "text-label-sm text-on-surface-variant" }, isCurrentStage ? "Current active stage" : "Visible previous stage"),
      ]),
      createElement("span", { className: "stage-card__progress text-label-sm" }, progressSummary),
      createIcon(isSelected ? "expand_less" : "expand_more"),
    ]),
  ];

  if (isSelected && stageBlock) {
    cardChildren.push(
      createElement("div", { className: "stage-card__body", id: `stage-panel-${stage.stage_id}` }, [
        renderCustomFieldsSection(stage.stage_id, stageBlock),
        renderAddCustomFieldForm(stage.stage_id),
        renderChecklistSection(stage.stage_id, stageBlock),
        isCurrentStage && activeProduct.current_active_stage_index < MAX_STAGE_INDEX
          ? createElement("button", { className: "button-primary", type: "button", dataAction: "advance-stage", dataProductId: activeProduct.id }, "Advance to Next Stage")
          : null,
      ].filter(Boolean)),
    );
  }

  return createElement("article", { className: `stage-card bg-surface-container-lowest ${isCurrentStage ? "stage-card--current" : ""}` }, cardChildren);
}

function renderCustomFieldsSection(stageId, stageBlock) {
  const fields = stageBlock.custom_fields;
  return createElement("section", { className: "custom-fields", ariaLabel: "Custom fields" }, [
    createElement("div", { className: "section-heading" }, [
      createElement("h3", { className: "text-label-md" }, "Custom Fields"),
      createElement("p", { className: "text-label-sm text-on-surface-variant" }, `${fields.length} fields`),
    ]),
    fields.length === 0
      ? createElement("p", { className: "empty-note text-body-md text-on-surface-variant" }, "No custom fields yet. Add one below to track stage-specific launch details.")
      : createElement("div", { className: "custom-fields__list" }, fields.map((field) => renderCustomField(stageId, field))),
  ]);
}

function renderAddCustomFieldForm(stageId) {
  return createElement("form", { className: "field-config bg-surface-container-low", dataAction: "add-custom-field", dataStageId: stageId }, [
    createElement("div", { className: "section-heading" }, [
      createElement("h3", { className: "text-label-md" }, "+ Add Custom Field"),
      createElement("p", { className: "text-label-sm text-on-surface-variant" }, "Create metadata for this visible stage only."),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Field Name"),
      createElement("input", { className: "form-input", name: "fieldLabel", type: "text", placeholder: "Example: Supplier Quote" }),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Field Type"),
      createElement("select", { className: "form-input", name: "fieldType", required: true },
        CUSTOM_FIELD_TYPES.map((fieldType) => createElement("option", { value: fieldType }, fieldType)),
      ),
    ]),
    createElement("button", { className: "button-secondary", type: "submit" }, "+ Add Custom Field"),
  ]);
}

function renderCustomField(stageId, field) {
  return createElement("article", { className: "custom-field", dataStageId: stageId, dataFieldId: field.field_id }, [
    createElement("div", { className: "custom-field__header" }, [
      createElement("h4", { className: "text-label-md" }, field.label),
      createElement("span", { className: "custom-field__type text-label-sm" }, field.type),
    ]),
    renderCustomFieldControl(stageId, field),
  ]);
}

function renderCustomFieldControl(stageId, field) {
  switch (field.type) {
    case "NUMBER":
      return renderInputField(stageId, field, { type: "number", value: field.value ?? "", step: "any" });
    case "LINK":
      return renderLinkField(stageId, field);
    case "CURRENCY":
      return renderCurrencyField(stageId, field);
    case "WEIGHT":
      return renderWeightField(stageId, field);
    case "SIZING":
      return renderSizingField(stageId, field);
    case "DATE":
      return renderInputField(stageId, field, { type: "date", value: field.value ?? "" });
    case "TEXT":
    default:
      return renderInputField(stageId, field, { type: "text", value: field.value ?? "" });
  }
}

function renderInputField(stageId, field, inputOptions) {
  return createElement("label", { className: "form-field" }, [
    createElement("span", { className: "text-label-sm" }, `${field.label} value`),
    createElement("input", {
      className: "form-input",
      type: inputOptions.type,
      value: inputOptions.value,
      step: inputOptions.step,
      dataAction: "update-field",
      dataStageId: stageId,
      dataFieldId: field.field_id,
    }),
  ]);
}

function renderLinkField(stageId, field) {
  const safeUrl = getSafeHttpUrl(field.value);
  return createElement("div", { className: "field-stack" }, [
    renderInputField(stageId, field, { type: "url", value: field.value ?? "" }),
    safeUrl
      ? createElement("a", { className: "field-link text-label-sm", href: safeUrl, target: "_blank", rel: "noopener noreferrer" }, "Open saved link")
      : createElement("p", { className: "empty-note text-label-sm text-on-surface-variant" }, "Enter a valid http or https URL to enable the saved link."),
  ]);
}

function renderCurrencyField(stageId, field) {
  const value = field.value && typeof field.value === "object" ? field.value : {};
  return createElement("div", { className: "compound-field" }, [
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Amount"),
      createElement("input", {
        className: "form-input",
        type: "number",
        step: "any",
        value: value.amount ?? "",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "amount",
      }),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Currency"),
      createElement("input", {
        className: "form-input",
        type: "text",
        value: value.currency ?? "USD",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "currency",
      }),
    ]),
    createElement("p", { className: "field-preview text-label-sm text-on-surface-variant" }, formatCurrencyValue(value)),
  ]);
}

function renderWeightField(stageId, field) {
  const value = field.value && typeof field.value === "object" ? field.value : {};
  return createElement("div", { className: "compound-field" }, [
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Weight"),
      createElement("input", {
        className: "form-input",
        type: "number",
        step: "any",
        value: value.amount ?? "",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "amount",
      }),
    ]),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Unit"),
      createElement("select", {
        className: "form-input",
        value: value.unit ?? "lb",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "unit",
      }, ["g", "kg", "oz", "lb"].map((unit) => createElement("option", { value: unit, selected: unit === (value.unit ?? "lb") }, unit))),
    ]),
  ]);
}

function renderSizingField(stageId, field) {
  const value = field.value && typeof field.value === "object" ? field.value : {};
  return createElement("div", { className: "sizing-field" }, [
    renderSizingNumberInput(stageId, field, "length", value.length),
    renderSizingNumberInput(stageId, field, "width", value.width),
    renderSizingNumberInput(stageId, field, "height", value.height),
    createElement("label", { className: "form-field" }, [
      createElement("span", { className: "text-label-sm" }, "Unit"),
      createElement("select", {
        className: "form-input",
        value: value.unit ?? "in",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "unit",
      }, ["in", "cm"].map((unit) => createElement("option", { value: unit, selected: unit === (value.unit ?? "in") }, unit))),
    ]),
    createElement("label", { className: "form-field sizing-field__notes" }, [
      createElement("span", { className: "text-label-sm" }, "Sizing Notes"),
      createElement("input", {
        className: "form-input",
        type: "text",
        value: value.raw ?? "",
        dataAction: "update-field",
        dataStageId: stageId,
        dataFieldId: field.field_id,
        dataFieldPart: "raw",
      }),
    ]),
  ]);
}

function renderSizingNumberInput(stageId, field, part, value) {
  return createElement("label", { className: "form-field" }, [
    createElement("span", { className: "text-label-sm" }, capitalize(part)),
    createElement("input", {
      className: "form-input",
      type: "number",
      step: "any",
      value: value ?? "",
      dataAction: "update-field",
      dataStageId: stageId,
      dataFieldId: field.field_id,
      dataFieldPart: part,
    }),
  ]);
}

function renderChecklistSection(stageId, stageBlock) {
  const tasks = stageBlock.checklist_tasks;
  return createElement("section", { className: "stage-checklist", ariaLabel: "Stage checklist" }, [
    createElement("div", { className: "section-heading" }, [
      createElement("h3", { className: "text-label-md" }, "Stage Checklist"),
      createElement("p", { className: "text-label-sm text-on-surface-variant" }, `${tasks.length} tasks`),
    ]),
    tasks.length === 0
      ? createElement("p", { className: "empty-note text-body-md text-on-surface-variant" }, "No checklist tasks yet. Add the next action item for this stage below.")
      : createElement("div", { className: "checklist-list" }, tasks.map((task) => renderChecklistTask(stageId, task))),
    renderAddTaskForm(stageId),
  ]);
}

function renderChecklistTask(stageId, task) {
  const inputId = `task-${task.task_id}`;
  return createElement("div", { className: `checklist-item ${task.is_completed ? "checklist-item--complete" : ""}` }, [
    createElement("input", {
      id: inputId,
      className: "checklist-item__checkbox",
      type: "checkbox",
      checked: task.is_completed,
      dataAction: "toggle-task",
      dataStageId: stageId,
      dataTaskId: task.task_id,
    }),
    createElement("label", { className: "checklist-item__label text-body-md", htmlFor: inputId }, task.task_name),
  ]);
}

function renderAddTaskForm(stageId) {
  return createElement("form", { className: "task-form", dataAction: "add-task", dataStageId: stageId }, [
    createElement("label", { className: "form-field task-form__input" }, [
      createElement("span", { className: "text-label-sm" }, "Task Name"),
      createElement("input", { className: "form-input", name: "taskName", type: "text", placeholder: "Example: Request supplier quote", required: true }),
    ]),
    createElement("button", { className: "button-secondary", type: "submit" }, "+ Add Task"),
  ]);
}

function renderContextPanel(contextPanel) {
  replaceChildren(contextPanel);
}

function handleAppDragStart(event) {
  const cogsTemplateTarget = event.target instanceof Element
    ? event.target.closest('[data-action="drag-cogs-template-category"], [data-action="drag-cogs-template-row"]')
    : null;
  if (cogsTemplateTarget && event.dataTransfer) {
    if (
      !canManageCogsTemplate()
      || !uiState.cogsCalculatorModal?.templateEditMode
      || !uiState.cogsCalculatorModal?.templateDraft
    ) return;
    const type = cogsTemplateTarget.getAttribute("data-action") === "drag-cogs-template-category" ? "category" : "row";
    uiState.draggedCogsTemplateItem = {
      type,
      id: cogsTemplateTarget.getAttribute(type === "category" ? "data-cogs-template-category-id" : "data-cogs-template-row-id"),
      categoryId: cogsTemplateTarget.getAttribute("data-cogs-template-category-id"),
    };
    cogsTemplateTarget.classList.add("cogs-template-item--dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(uiState.draggedCogsTemplateItem));
    return;
  }

  const dashboardSlideTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-dashboard-background"]') : null;
  if (dashboardSlideTarget && event.dataTransfer) {
    if (!canEditWorkspaceData()) return;
    const slideIndex = Number(dashboardSlideTarget.getAttribute("data-option-index"));
    if (!Number.isInteger(slideIndex) || slideIndex < 0) return;

    uiState.draggedDashboardSlideIndex = slideIndex;
    dashboardSlideTarget.closest(".dashboard-background-item")?.classList.add("dashboard-background-item--dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(slideIndex));
    return;
  }

  const workspaceFieldTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-workspace-field"]') : null;
  if (workspaceFieldTarget && event.dataTransfer) {
    if (!canManageWorkspaceFieldTemplates()) return;
    const productId = workspaceFieldTarget.getAttribute("data-product-id");
    const stageId = workspaceFieldTarget.getAttribute("data-stage-id");
    const fieldId = workspaceFieldTarget.getAttribute("data-field-id");
    if (!productId || !stageId || !fieldId) return;

    uiState.draggedWorkspaceField = { productId, stageId, fieldId };
    workspaceFieldTarget.closest(".workspace-field")?.classList.add("workspace-field--dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", fieldId);
    return;
  }

  const tableTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-workspace-table-column"], [data-action="drag-workspace-table-row"]') : null;
  if (tableTarget && event.dataTransfer) {
    if (!canAdjustWorkspaceTableSheets()) return;
    const productId = tableTarget.getAttribute("data-product-id");
    const stageId = tableTarget.getAttribute("data-stage-id");
    const fieldId = tableTarget.getAttribute("data-field-id");
    const axis = tableTarget.getAttribute("data-table-axis");
    const index = Number(tableTarget.getAttribute("data-table-index"));
    if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis) || !Number.isInteger(index)) return;

    uiState.draggedTableSection = { productId, stageId, fieldId, axis, index };
    tableTarget.closest(".workspace-table-field__heading")?.classList.add("workspace-table-field__heading--dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(uiState.draggedTableSection));
    return;
  }

  const productTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-product"]') : null;
  if (productTarget && event.dataTransfer) {
    if (!canMoveProducts()) return;
    const productId = productTarget.getAttribute("data-product-id");
    if (!productId) return;

    uiState.draggedProductId = productId;
    productTarget.classList.add("product-card--drag-source");
    createProductDragGhost(productTarget, event);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", productId);
    event.dataTransfer.setDragImage(createTransparentDragImage(), 0, 0);
    return;
  }

  const checklistTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-checklist"]') : null;
  if (checklistTarget && event.dataTransfer) {
    if (!canManageChecklistTasks()) return;
    const productId = checklistTarget.getAttribute("data-product-id");
    const stageId = checklistTarget.getAttribute("data-stage-id");
    const checklistId = checklistTarget.getAttribute("data-checklist-id");
    if (!productId || !stageId || !checklistId) return;

    uiState.draggedChecklistTask = { productId, stageId, checklistId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", checklistId);
    return;
  }

  const target = event.target instanceof Element ? event.target.closest('[data-action="drag-stage"]') : null;
  if (!target || !event.dataTransfer || !canEditPipelineTabs()) return;

  const stageId = target.getAttribute("data-stage-id");
  if (!stageId) return;

  uiState.draggedStageId = stageId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", stageId);
}

function handleAppDragOver(event) {
  updateProductDragGhost(event);
  const cogsTemplateTarget = event.target instanceof Element ? event.target.closest("[data-cogs-template-drop-type]") : null;
  if (
    cogsTemplateTarget
    && uiState.draggedCogsTemplateItem
    && uiState.cogsCalculatorModal?.templateEditMode
  ) {
    const dropType = cogsTemplateTarget.getAttribute("data-cogs-template-drop-type");
    const dropCategoryId = cogsTemplateTarget.getAttribute("data-cogs-template-category-id");
    if (dropType !== uiState.draggedCogsTemplateItem.type) return;
    if (dropType === "row" && dropCategoryId !== uiState.draggedCogsTemplateItem.categoryId) return;
    event.preventDefault();
    document.querySelectorAll(".cogs-template-item--drop-target").forEach((element) => {
      if (element !== cogsTemplateTarget) element.classList.remove("cogs-template-item--drop-target");
    });
    cogsTemplateTarget.classList.add("cogs-template-item--drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }

  const dashboardSlideTarget = event.target instanceof Element ? event.target.closest("[data-dashboard-slide-drop-index]") : null;
  if (dashboardSlideTarget && Number.isInteger(uiState.draggedDashboardSlideIndex)) {
    if (!canEditWorkspaceData()) return;
    event.preventDefault();
    document.querySelectorAll(".dashboard-background-item--drop-target").forEach((element) => {
      if (element !== dashboardSlideTarget) element.classList.remove("dashboard-background-item--drop-target");
    });
    dashboardSlideTarget.classList.add("dashboard-background-item--drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }

  const dashboardDropTarget = event.target instanceof Element ? event.target.closest('[data-action="drop-dashboard-backgrounds"]') : null;
  if (dashboardDropTarget && uiState.dashboardBackgroundModalOpen && canEditWorkspaceData()) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    return;
  }

  const workspaceFieldTarget = event.target instanceof Element ? event.target.closest("[data-field-drop-id]") : null;
  if (workspaceFieldTarget && uiState.draggedWorkspaceField) {
    if (!canManageWorkspaceFieldTemplates()) return;
    const dropStageId = workspaceFieldTarget.getAttribute("data-stage-id");
    if (dropStageId !== uiState.draggedWorkspaceField.stageId) return;

    event.preventDefault();
    document.querySelectorAll(".workspace-field--drop-target").forEach((element) => {
      if (element !== workspaceFieldTarget) element.classList.remove("workspace-field--drop-target");
    });
    workspaceFieldTarget.classList.add("workspace-field--drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }

  const productStageTarget = event.target instanceof Element ? event.target.closest("[data-product-drop-stage-id]") : null;
  if (productStageTarget && uiState.draggedProductId) {
    if (!canMoveProducts()) return;
    event.preventDefault();
    setProductDropTarget(productStageTarget.getAttribute("data-product-drop-stage-id"));
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }
  if (uiState.draggedProductId) setProductDropTarget(null);

  const checklistTarget = event.target instanceof Element ? event.target.closest("[data-checklist-drop-id]") : null;
  if (checklistTarget && uiState.draggedChecklistTask) {
    if (!canManageChecklistTasks()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }

  const tableTarget = event.target instanceof Element ? event.target.closest("[data-table-drop-axis]") : null;
  if (tableTarget && uiState.draggedTableSection) {
    document.querySelectorAll(".workspace-table-field__heading--drop-target").forEach((element) => {
      if (element !== tableTarget) element.classList.remove("workspace-table-field__heading--drop-target");
    });
    if (!canAdjustWorkspaceTableSheets()) return;
    const dropAxis = tableTarget.getAttribute("data-table-drop-axis");
    if (dropAxis !== uiState.draggedTableSection.axis) return;
    event.preventDefault();
    tableTarget.classList.add("workspace-table-field__heading--drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("[data-stage-drop-id]") : null;
  if (!target || !uiState.draggedStageId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleAppDrop(event) {
  const cogsTemplateTarget = event.target instanceof Element ? event.target.closest("[data-cogs-template-drop-type]") : null;
  const draggedCogsItem = uiState.draggedCogsTemplateItem;
  if (
    cogsTemplateTarget
    && draggedCogsItem
    && uiState.cogsCalculatorModal?.templateEditMode
    && uiState.cogsCalculatorModal?.templateDraft
  ) {
    const dropType = cogsTemplateTarget.getAttribute("data-cogs-template-drop-type");
    const dropId = cogsTemplateTarget.getAttribute("data-cogs-template-drop-id");
    const dropCategoryId = cogsTemplateTarget.getAttribute("data-cogs-template-category-id");
    if (dropType === draggedCogsItem.type && (dropType !== "row" || dropCategoryId === draggedCogsItem.categoryId)) {
      event.preventDefault();
      uiState.cogsCalculatorModal.templateDraft = dropType === "category"
        ? reorderCogsTemplateCategories(uiState.cogsCalculatorModal.templateDraft, draggedCogsItem.id, dropId)
        : reorderCogsTemplateRows(uiState.cogsCalculatorModal.templateDraft, draggedCogsItem.categoryId, draggedCogsItem.id, dropId);
      uiState.cogsCalculatorModal.templateErrors = validateCogsTemplateSettings(uiState.cogsCalculatorModal.templateDraft).errors;
      uiState.draggedCogsTemplateItem = null;
      document.querySelectorAll(".cogs-template-item--dragging, .cogs-template-item--drop-target").forEach((element) => {
        element.classList.remove("cogs-template-item--dragging", "cogs-template-item--drop-target");
      });
      renderFromCurrentStatePreservingScroll();
      return;
    }
  }

  const dashboardSlideTarget = event.target instanceof Element ? event.target.closest("[data-dashboard-slide-drop-index]") : null;
  if (dashboardSlideTarget && Number.isInteger(uiState.draggedDashboardSlideIndex)) {
    if (!canEditWorkspaceData()) return;
    event.preventDefault();
    const dropIndex = Number(dashboardSlideTarget.getAttribute("data-dashboard-slide-drop-index"));
    reorderDashboardBackgroundSlide(uiState.draggedDashboardSlideIndex, dropIndex);
    uiState.draggedDashboardSlideIndex = null;
    document.querySelectorAll(".dashboard-background-item--dragging, .dashboard-background-item--drop-target").forEach((element) => {
      element.classList.remove("dashboard-background-item--dragging", "dashboard-background-item--drop-target");
    });
    renderFromCurrentState();
    return;
  }

  const dashboardDropTarget = event.target instanceof Element ? event.target.closest('[data-action="drop-dashboard-backgrounds"]') : null;
  if (dashboardDropTarget && uiState.dashboardBackgroundModalOpen) {
    if (!canEditWorkspaceData()) return;
    event.preventDefault();
    queueDashboardBackgroundFiles(Array.from(event.dataTransfer?.files ?? []));
    return;
  }

  const workspaceFieldTarget = event.target instanceof Element ? event.target.closest("[data-field-drop-id]") : null;
  if (workspaceFieldTarget && uiState.draggedWorkspaceField) {
    if (!canManageWorkspaceFieldTemplates()) return;
    const dropStageId = workspaceFieldTarget.getAttribute("data-stage-id");
    if (dropStageId !== uiState.draggedWorkspaceField.stageId) return;

    event.preventDefault();
    const dropFieldId = workspaceFieldTarget.getAttribute("data-field-drop-id");
    reorderWorkspaceField(uiState.draggedWorkspaceField, dropFieldId);
    uiState.draggedWorkspaceField = null;
    document.querySelectorAll(".workspace-field--dragging, .workspace-field--drop-target").forEach((element) => element.classList.remove("workspace-field--dragging", "workspace-field--drop-target"));
    renderFromCurrentState();
    return;
  }

  const productStageTarget = event.target instanceof Element ? event.target.closest("[data-product-drop-stage-id]") : null;
  if (productStageTarget && uiState.draggedProductId) {
    if (!canMoveProducts()) return;
    event.preventDefault();
    const productId = event.dataTransfer?.getData("text/plain") || uiState.draggedProductId;
    const targetStageId = productStageTarget.getAttribute("data-product-drop-stage-id");
    clearProductDragUi();
    uiState.draggedProductId = null;
    const movedProduct = moveProductToStage(productId, targetStageId);
    if (movedProduct) saveSharedWorkspaceNow("product-move").catch(reportSharedWorkspaceSaveError);
    renderFromCurrentState();
    return;
  }

  const checklistTarget = event.target instanceof Element ? event.target.closest("[data-checklist-drop-id]") : null;
  if (checklistTarget && uiState.draggedChecklistTask) {
    if (!canManageChecklistTasks()) return;
    event.preventDefault();
    const dropChecklistId = checklistTarget.getAttribute("data-checklist-drop-id");
    reorderWorkspaceChecklistTask(uiState.draggedChecklistTask, dropChecklistId);
    uiState.draggedChecklistTask = null;
    renderFromCurrentState();
    return;
  }

  const tableTarget = event.target instanceof Element ? event.target.closest("[data-table-drop-axis]") : null;
  if (tableTarget && uiState.draggedTableSection) {
    document.querySelectorAll(".workspace-table-field__heading--drop-target").forEach((element) => {
      if (element !== tableTarget) element.classList.remove("workspace-table-field__heading--drop-target");
    });
    if (!canAdjustWorkspaceTableSheets()) return;
    event.preventDefault();
    const dropAxis = tableTarget.getAttribute("data-table-drop-axis");
    const dropIndex = Number(tableTarget.getAttribute("data-table-drop-index"));
    if (dropAxis === uiState.draggedTableSection.axis && Number.isInteger(dropIndex)) {
      reorderWorkspaceTableSection(uiState.draggedTableSection, dropIndex);
    }
    uiState.draggedTableSection = null;
    renderFromCurrentState();
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("[data-stage-drop-id]") : null;
  if (!target || !canEditPipelineTabs()) return;

  event.preventDefault();
  const draggedStageId = event.dataTransfer?.getData("text/plain") || uiState.draggedStageId;
  const dropStageId = target.getAttribute("data-stage-drop-id");
  uiState.draggedStageId = null;
  const didReorderStage = reorderStage(draggedStageId, dropStageId);
  if (didReorderStage) saveSharedWorkspaceNow("stage-reorder").catch(reportSharedWorkspaceSaveError);
  renderFromCurrentState();
}

function reorderStage(draggedStageId, dropStageId) {
  if (!draggedStageId || !dropStageId || draggedStageId === dropStageId) return false;
  const nextSettings = cloneStageSettings(stageSettings);
  const draggedIndex = nextSettings.order.indexOf(draggedStageId);
  const dropIndex = nextSettings.order.indexOf(dropStageId);
  if (draggedIndex < 0 || dropIndex < 0) return false;

  nextSettings.order.splice(draggedIndex, 1);
  nextSettings.order.splice(dropIndex, 0, draggedStageId);
  setStageSettings(nextSettings);
  return true;
}

function handleAppDragMove(event) {
  updateProductDragGhost(event);
}

function handleAppDragEnd() {
  clearProductDragUi();
  document.querySelectorAll(".workspace-table-field__heading--dragging, .workspace-table-field__heading--drop-target").forEach((element) => {
    element.classList.remove("workspace-table-field__heading--dragging", "workspace-table-field__heading--drop-target");
  });
  document.querySelectorAll(".workspace-field--dragging, .workspace-field--drop-target").forEach((element) => {
    element.classList.remove("workspace-field--dragging", "workspace-field--drop-target");
  });
  document.querySelectorAll(".dashboard-background-item--dragging, .dashboard-background-item--drop-target").forEach((element) => {
    element.classList.remove("dashboard-background-item--dragging", "dashboard-background-item--drop-target");
  });
  document.querySelectorAll(".cogs-template-item--dragging, .cogs-template-item--drop-target").forEach((element) => {
    element.classList.remove("cogs-template-item--dragging", "cogs-template-item--drop-target");
  });
  uiState.draggedProductId = null;
  uiState.draggedStageId = null;
  uiState.draggedChecklistTask = null;
  uiState.draggedTableSection = null;
  uiState.draggedWorkspaceField = null;
  uiState.draggedDashboardSlideIndex = null;
  uiState.draggedCogsTemplateItem = null;
}

function createProductDragGhost(card, event) {
  clearProductDragUi();
  productDragGhost = card.cloneNode(true);
  productDragGhost.classList.add("product-drag-ghost");
  productDragGhost.setAttribute("aria-hidden", "true");
  document.body.appendChild(productDragGhost);
  updateProductDragGhost(event);
}

function updateProductDragGhost(event) {
  if (!productDragGhost || !uiState.draggedProductId) return;
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  if (!x && !y) return;
  productDragGhost.style.left = `${x}px`;
  productDragGhost.style.top = `${y}px`;
}

function clearProductDragUi() {
  productDragGhost?.remove();
  productDragGhost = null;
  setProductDropTarget(null);
  document.querySelectorAll(".product-card--drag-source").forEach((element) => element.classList.remove("product-card--drag-source"));
}

function setProductDropTarget(stageId) {
  if (productDropStageId === stageId) return;
  productDropStageId = stageId;
  document.querySelectorAll("[data-product-drop-stage-id]").forEach((element) => {
    element.classList.toggle("sidebar-tab--product-drop-target", Boolean(stageId) && element.getAttribute("data-product-drop-stage-id") === stageId);
  });
}

function createTransparentDragImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

function handleAppDoubleClick(event) {
  const workspaceBrandTarget = event.target instanceof Element ? event.target.closest('[data-action="rename-workspace-brand"]') : null;
  if (workspaceBrandTarget && canEditWorkspaceData()) {
    renameWorkspaceBrandFromElement(workspaceBrandTarget);
    renderFromCurrentState();
    return;
  }

  const keywordHeaderTarget = event.target instanceof Element ? event.target.closest('[data-action="edit-keyword-header"]') : null;
  if (keywordHeaderTarget && canManageWorkspaceFieldTemplates()) {
    editKeywordHeaderFromTarget(keywordHeaderTarget);
    renderFromCurrentState();
    restoreKeywordCellFocus();
    return;
  }

  const keywordCellTarget = event.target instanceof Element ? event.target.closest('[data-action="edit-keyword-cell"]') : null;
  if (keywordCellTarget && canEditProductFieldValues()) {
    editKeywordCellFromTarget(keywordCellTarget);
    renderFromCurrentState();
    restoreKeywordCellFocus();
    return;
  }

  const vineMetricTarget = event.target instanceof Element ? event.target.closest('[data-action="edit-vine-metric"]') : null;
  if (vineMetricTarget && canEditWorkspaceData()) {
    editVineMetricFromElement(vineMetricTarget);
    renderFromCurrentState();
    return;
  }

  const campaignMetricTarget = event.target instanceof Element ? event.target.closest('[data-action="edit-campaign-count"]') : null;
  if (campaignMetricTarget && canEditWorkspaceData()) {
    editCampaignCountFromElement(campaignMetricTarget);
    renderFromCurrentState();
    return;
  }

  const target = event.target instanceof Element ? event.target.closest('[data-action="drag-workspace-table-column"], [data-action="drag-workspace-table-row"]') : null;
  if (!target || !canAdjustWorkspaceTableSheets()) return;

  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  const axis = target.getAttribute("data-table-axis");
  const index = Number(target.getAttribute("data-table-index"));
  const currentLabel = String(target.textContent ?? "").trim();
  if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis) || !Number.isInteger(index)) return;

  const nextLabel = typeof window !== "undefined" ? window.prompt(`Rename table ${axis}`, currentLabel) : null;
  if (nextLabel === null) return;
  renameWorkspaceTableSection({ productId, stageId, fieldId, axis, index }, nextLabel);
  renderFromCurrentState();
}

function prepareGlasscoAppTab(target, action) {
  const route = `${window.location.pathname || "/"}${window.location.search}${window.location.hash}`;
  const routes = rememberGlasscoAppRoute("pipeline", route);
  createGlasscoAuthHandoff(action === "open-pipeline-app" ? "pipeline" : "ppc");
  if (!(target instanceof HTMLAnchorElement)) return;
  if (action === "open-pipeline-app") target.href = routes.pipeline;
  if (action === "open-sop-library") target.href = routes.ppc;
  if (action === "open-ppc-dashboard") target.href = routes.ppcDashboard;
}

function handleGlasscoAppTabPointerDown(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  const action = target?.dataset.action;
  if (!["open-pipeline-app", "open-sop-library", "open-ppc-dashboard"].includes(action)) return;
  prepareGlasscoAppTab(target, action);
}

function handleAppClick(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!target) {
    if (uiState.activeChatProductId && event.target instanceof Element && event.target.classList.contains("product-chat-modal")) {
      closeProductChat();
      renderFromCurrentState();
    }
    return;
  }

  const action = target.getAttribute("data-action");
  if (action === "reload-app") {
    window.location.reload();
    return;
  }

  if (["open-pipeline-app", "open-sop-library", "open-ppc-dashboard"].includes(action)) {
    prepareGlasscoAppTab(target, action);
    return;
  }

  if (action === "open-dashboard-history") {
    uiState.dashboardHistoryModalOpen = true;
    renderFromCurrentState();
    return;
  }

  if (action === "close-dashboard-history") {
    uiState.dashboardHistoryModalOpen = false;
    renderFromCurrentState();
    return;
  }

  if (action === "open-cogs-calculator") {
    if (!canEditProductFieldValues()) return;
    openCogsCalculator(target.getAttribute("data-product-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "close-cogs-calculator") {
    if (uiState.cogsCalculatorModal?.saving || uiState.cogsCalculatorModal?.templateSaving) return;
    uiState.cogsCalculatorModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-cogs-template-mode") {
    toggleCogsTemplateEditMode();
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "cancel-cogs-template-edit") {
    cancelCogsTemplateEditMode();
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "toggle-cogs-category") {
    toggleCogsCategory(target.getAttribute("data-cogs-template-category-id"));
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "add-cogs-template-category") {
    if (!canManageCogsTemplate()) return;
    addCogsTemplateCategoryToDraft();
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "add-cogs-template-row") {
    if (!canManageCogsTemplate()) return;
    const categoryId = target.getAttribute("data-cogs-template-category-id");
    const dialog = target.closest(".workspace-modal__dialog--cogs");
    const anchorOffset = dialog instanceof HTMLElement
      ? target.getBoundingClientRect().top - dialog.getBoundingClientRect().top
      : Number.NaN;
    const rowId = addCogsTemplateRowToDraft(categoryId);
    renderFromCurrentStatePreservingScroll();
    restoreAddedCogsTemplateRowPosition({ categoryId, rowId, anchorOffset });
    return;
  }

  if (action === "request-delete-cogs-template-category") {
    if (!canManageCogsTemplate()) return;
    requestDeleteCogsTemplateItem("category", target.getAttribute("data-cogs-template-category-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "request-delete-cogs-template-row") {
    if (!canManageCogsTemplate()) return;
    requestDeleteCogsTemplateItem("row", target.getAttribute("data-cogs-template-row-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "cancel-delete-cogs-template-item") {
    if (uiState.cogsCalculatorModal) uiState.cogsCalculatorModal.templateDeleteConfirmation = null;
    renderFromCurrentState();
    return;
  }

  if (action === "confirm-delete-cogs-template-item") {
    if (!canManageCogsTemplate()) return;
    confirmDeleteCogsTemplateItem().catch((error) => console.error(error));
    return;
  }

  if (action === "save-cogs-template") {
    if (!canManageCogsTemplate()) return;
    saveCogsTemplateDraft().catch((error) => console.error(error));
    return;
  }

  if (action === "open-cogs-cost-note") {
    if (!canEditProductFieldValues()) return;
    openCogsCostNote(Number(target.getAttribute("data-cogs-cost-index")));
    renderCogsCalculatorPreservingScroll();
    return;
  }

  if (action === "close-cogs-cost-note") {
    if (!uiState.cogsCalculatorModal || uiState.cogsCalculatorModal.saving) return;
    uiState.cogsCalculatorModal.noteCostIndex = null;
    renderCogsCalculatorPreservingScroll();
    return;
  }

  if (action === "clear-cogs-cost-row") {
    if (!canEditProductFieldValues()) return;
    clearCogsCostRow(Number(target.getAttribute("data-cogs-cost-index")));
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "open-activity-source") {
    const stageId = target.getAttribute("data-stage-id");
    const productId = target.getAttribute("data-product-id");
    if (stageId) {
      uiState.activeView = "pipeline";
      uiState.selectedStageId = stageId;
      if (productId && getProductById(productId)) uiState.selectedProductId = productId;
      uiState.dashboardHistoryModalOpen = false;
      ensureSelectedProductForStage(true);
      persistUiPreferences();
      renderFromCurrentState();
    }
    return;
  }

  if (action === "toggle-login-password") {
    uiState.showLoginPassword = !uiState.showLoginPassword;
    renderFromCurrentState();
    return;
  }

  if (action === "logout") {
    clearAuthSession();
    renderFromCurrentState();
    return;
  }

  if (action === "forgot-password") {
    uiState.authError = "Please contact the workspace owner to reset access for this prototype.";
    renderFromCurrentState();
    return;
  }

  if (action === "open-pipeline") {
    uiState.activeView = "pipeline";
    ensureSelectedProductForStage(true);
    persistUiPreferences();
    renderFromCurrentState();
    return;
  }

  if (action === "open-dashboard") {
    uiState.activeView = "dashboard";
    persistUiPreferences();
    renderFromCurrentState();
    return;
  }

  if (action === "open-dashboard-goal-modal") {
    if (!canEditWorkspaceData()) return;
    uiState.dashboardGoalModalOpen = true;
    renderFromCurrentState();
    return;
  }

  if (action === "close-dashboard-goal-modal") {
    uiState.dashboardGoalModalOpen = false;
    renderFromCurrentState();
    return;
  }

  if (action === "open-dashboard-background-modal") {
    if (!canEditWorkspaceData()) return;
    uiState.dashboardBackgroundModalOpen = true;
    uiState.dashboardBackgroundDraft = [...dashboardSettings.backgroundImages];
    uiState.dashboardBackgroundPendingFiles = [];
    uiState.dashboardBackgroundUploadError = "";
    uiState.dashboardBackgroundBatchNotice = "";
    renderFromCurrentState();
    return;
  }

  if (action === "close-dashboard-background-modal") {
    uiState.dashboardBackgroundModalOpen = false;
    uiState.dashboardBackgroundDraft = [];
    uiState.dashboardBackgroundPendingFiles = [];
    uiState.dashboardBackgroundUploadError = "";
    uiState.dashboardBackgroundBatchNotice = "";
    renderFromCurrentState();
    return;
  }

  if (action === "upload-queued-dashboard-backgrounds") {
    if (!canEditWorkspaceData()) return;
    uploadQueuedDashboardBackgrounds();
    return;
  }

  if (action === "clear-queued-dashboard-backgrounds") {
    if (!canEditWorkspaceData()) return;
    uiState.dashboardBackgroundPendingFiles = [];
    uiState.dashboardBackgroundUploadError = "";
    uiState.dashboardBackgroundBatchNotice = "";
    renderFromCurrentState();
    return;
  }

  if (action === "save-dashboard-backgrounds") {
    if (!canEditWorkspaceData()) return;
    saveDashboardBackgrounds();
    renderFromCurrentState();
    return;
  }

  if (action === "remove-dashboard-background") {
    if (!canEditWorkspaceData()) return;
    removeDashboardBackgroundFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-settings") {
    uiState.activeView = "settings";
    uiState.settingsCategory = canManageUsers() ? "users" : getDefaultSettingsCategory();
    persistUiPreferences();
    renderFromCurrentState();
    return;
  }

  if (action === "open-profile") {
    uiState.activeView = "settings";
    uiState.settingsCategory = "profile";
    persistUiPreferences();
    renderFromCurrentState();
    return;
  }

  if (action === "select-settings-category") {
    const category = target.getAttribute("data-settings-category");
    if (canViewSettingsCategory(category)) uiState.settingsCategory = category;
    persistUiPreferences();
    renderFromCurrentState();
    return;
  }

  if (action === "create-workspace-backup") {
    createWorkspaceBackup();
    return;
  }

  if (action === "publish-admin-workspace") {
    publishAdminWorkspaceSnapshot();
    return;
  }

  if (action === "restore-workspace-backup") {
    restoreWorkspaceBackup(target.getAttribute("data-backup-id"));
    return;
  }

  if (action === "download-workspace-backup") {
    downloadWorkspaceBackup(target.getAttribute("data-backup-id"));
    return;
  }

  if (action === "toggle-stage-editor") {
    if (!canEditPipelineTabs()) return;
    uiState.stageEditorOpen = !uiState.stageEditorOpen;
    renderFromCurrentState();
    return;
  }

  if (action === "delete-stage") {
    if (!canEditPipelineTabs()) return;
    const didDeleteStage = deleteStage(target.getAttribute("data-stage-id"));
    if (didDeleteStage) saveSharedWorkspaceNow("stage-delete").catch(reportSharedWorkspaceSaveError);
    renderFromCurrentState();
    return;
  }

  if (action === "open-add-stage-modal") {
    if (!canEditPipelineTabs()) return;
    uiState.addStageModalOpen = true;
    renderFromCurrentState();
    return;
  }

  if (action === "close-add-stage-modal") {
    uiState.addStageModalOpen = false;
    renderFromCurrentState();
    return;
  }

  if (action === "open-add-product-modal") {
    if (!canMutateProductsNow()) return;
    uiState.addProductModalOpen = true;
    uiState.editingProductId = null;
    renderFromCurrentState();
    return;
  }

  if (action === "edit-product") {
    if (!canMutateProductsNow()) return;
    uiState.addProductModalOpen = true;
    uiState.editingProductId = target.getAttribute("data-product-id");
    renderFromCurrentState();
    return;
  }

  if (action === "delete-product") {
    if (!canMutateProductsNow()) return;
    const product = getEditableProduct(target.getAttribute("data-product-id"));
    if (!product) return;
    uiState.productDeleteConfirmation = {
      productId: product.id,
      productName: product.name,
    };
    renderFromCurrentState();
    return;
  }

  if (action === "close-product-delete-confirmation") {
    const productId = uiState.productDeleteConfirmation?.productId;
    if (productId && isPendingProductAction("delete", productId)) return;
    uiState.productDeleteConfirmation = null;
    renderFromCurrentState();
    return;
  }

  if (action === "confirm-product-delete") {
    const productId = uiState.productDeleteConfirmation?.productId;
    if (!productId || isPendingProductAction("delete", productId)) return;
    deleteUserProduct(productId)
      .then(() => {
        uiState.productDeleteConfirmation = null;
        renderFromCurrentState();
      })
      .catch(reportSharedWorkspaceSaveError);
    return;
  }

  if (action === "open-product-history") {
    uiState.productHistoryModal = { productId: target.getAttribute("data-product-id") };
    renderFromCurrentState();
    return;
  }

  if (action === "close-product-history") {
    uiState.productHistoryModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "open-deleted-product-history") {
    uiState.deletedProductHistoryStageId = target.getAttribute("data-stage-id") || uiState.selectedStageId;
    uiState.deletedProductHistoryModalOpen = true;
    renderFromCurrentState();
    return;
  }

  if (action === "close-deleted-product-history") {
    uiState.deletedProductHistoryModalOpen = false;
    uiState.deletedProductHistoryStageId = "";
    renderFromCurrentState();
    return;
  }

  if (action === "restore-product-history") {
    if (!canMutateProductsNow()) return;
    restoreProductHistoryEntry(target.getAttribute("data-history-entry-id")).catch(reportSharedWorkspaceSaveError);
    return;
  }

  if (action === "delete-product-history-forever") {
    if (!canMutateProductsNow()) return;
    permanentlyDeleteProductHistoryEntry(target.getAttribute("data-history-entry-id")).catch(reportSharedWorkspaceSaveError);
    return;
  }

  if (action === "move-product-next-stage") {
    if (!canMoveProducts()) return;
    const movedProduct = moveProductToNextStage(target.getAttribute("data-product-id"));
    if (movedProduct) launchConfettiEffect(target);
    if (movedProduct) saveSharedWorkspaceNow("product-move").catch(reportSharedWorkspaceSaveError);
    renderFromCurrentState();
    return;
  }

  if (action === "open-invite-user") {
    if (!canManageUsers()) return;
    uiState.settingsInviteModalOpen = true;
    uiState.editingTeamUserId = null;
    uiState.settingsUserNotice = "";
    renderFromCurrentState();
    return;
  }

  if (action === "close-invite-user") {
    uiState.settingsInviteModalOpen = false;
    uiState.editingTeamUserId = null;
    renderFromCurrentState();
    return;
  }

  if (action === "set-launch-metric-mode") {
    setLaunchMetricMode(target.getAttribute("data-launch-mode"));
    renderFromCurrentState();
    return;
  }

  if (action === "open-launch-entry") {
    if (!canEditWorkspaceData()) return;
    uiState.launchEntryModal = {};
    renderFromCurrentState();
    return;
  }

  if (action === "edit-launch-entry") {
    if (!canEditWorkspaceData()) return;
    const entryId = target.getAttribute("data-launch-entry-id");
    if (!entryId) return;
    uiState.launchEntryModal = { entryId };
    renderFromCurrentState();
    return;
  }

  if (action === "delete-launch-entry") {
    if (!canEditWorkspaceData()) return;
    deleteLaunchEntryFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "close-launch-entry") {
    uiState.launchEntryModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "open-launch-portfolio-modal") {
    if (!canEditWorkspaceData()) return;
    uiState.launchPortfolioModalOpen = true;
    renderFromCurrentState();
    return;
  }

  if (action === "close-launch-portfolio-modal") {
    uiState.launchPortfolioModalOpen = false;
    renderFromCurrentState();
    return;
  }

  if (action === "open-campaign-link-modal") {
    if (!canEditWorkspaceData()) return;
    uiState.campaignLinkModalOpen = true;
    renderFromCurrentState();
    return;
  }

  if (action === "close-campaign-link-modal") {
    uiState.campaignLinkModalOpen = false;
    renderFromCurrentState();
    return;
  }

  if (action === "edit-keyword-spreadsheet-link") {
    if (!canEditProductFieldValues()) return;
    const productId = target.getAttribute("data-product-id") || getSelectedProduct()?.id || "";
    if (!productId) return;
    uiState.keywordSpreadsheetEditing = true;
    uiState.keywordSpreadsheetEditingProductId = productId;
    uiState.keywordSpreadsheetDraft = getKeywordSpreadsheetUrlForProduct(productId);
    renderFromCurrentState();
    return;
  }

  if (action === "cancel-keyword-spreadsheet-link") {
    uiState.keywordSpreadsheetEditing = false;
    uiState.keywordSpreadsheetEditingProductId = "";
    uiState.keywordSpreadsheetDraft = "";
    renderFromCurrentState();
    return;
  }

  if (action === "save-keyword-spreadsheet-link") {
    if (!canEditProductFieldValues()) return;
    const productId = target.getAttribute("data-product-id") || uiState.keywordSpreadsheetEditingProductId || getSelectedProduct()?.id || "";
    if (!productId) return;
    setKeywordSpreadsheetUrlForProduct(productId, uiState.keywordSpreadsheetDraft);
    uiState.keywordSpreadsheetEditing = false;
    uiState.keywordSpreadsheetEditingProductId = "";
    uiState.keywordSpreadsheetDraft = "";
    renderFromCurrentState();
    return;
  }

  if (action === "add-keyword-row") {
    if (!canEditProductFieldValues()) return;
    const productId = getSelectedProduct()?.id;
    if (!productId) return;
    const currentRows = getKeywordRowsForProduct(productId);
    const rowIndex = currentRows.length;
    setKeywordRowsForProduct(productId, [...currentRows, createBlankKeywordRow(keywordResearchSettings.columns)]);
    uiState.keywordEditingCell = { rowIndex, field: "keyword" };
    renderFromCurrentState();
    restoreKeywordCellFocus();
    return;
  }

  if (action === "add-keyword-column") {
    if (!canManageWorkspaceFieldTemplates()) return;
    const nextColumn = createKeywordColumn();
    setKeywordResearchSettings({
      ...keywordResearchSettings,
      columns: [...keywordResearchSettings.columns, nextColumn],
      keywordsByProductId: Object.fromEntries(Object.entries(keywordResearchSettings.keywordsByProductId).map(([productId, rows]) => [
        productId,
        rows.map((row) => ({ ...row, [nextColumn.key]: "" })),
      ])),
    });
    uiState.keywordEditingHeader = nextColumn.key;
    renderFromCurrentState();
    restoreKeywordCellFocus();
    return;
  }

  if (action === "delete-keyword-row") {
    if (!canEditProductFieldValues()) return;
    const productId = getSelectedProduct()?.id;
    if (!productId) return;
    const rowIndex = Number(target.getAttribute("data-option-index"));
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return;
    setKeywordRowsForProduct(productId, getKeywordRowsForProduct(productId).filter((_, index) => index !== rowIndex));
    uiState.keywordEditingCell = null;
    renderFromCurrentState();
    return;
  }

  if (action === "open-vine-entry") {
    if (!canEditWorkspaceData()) return;
    const entryType = target.getAttribute("data-vine-entry-type");
    if (!["review", "feedback"].includes(entryType)) return;
    const productId = target.getAttribute("data-product-id") || getSelectedProduct()?.id || "";
    if (!productId) return;
    uiState.vineEntryModal = { type: entryType, entryId: target.getAttribute("data-vine-entry-id") ?? "", productId };
    renderFromCurrentState();
    return;
  }

  if (action === "delete-vine-entry") {
    if (!canEditWorkspaceData()) return;
    const entryType = target.getAttribute("data-vine-entry-type");
    const entryId = target.getAttribute("data-vine-entry-id");
    const productId = target.getAttribute("data-product-id") || getSelectedProduct()?.id || "";
    if (!["review", "feedback"].includes(entryType) || !entryId || !productId) return;
    deleteVineEntry(entryType, entryId, productId);
    return;
  }

  if (action === "close-vine-entry") {
    uiState.vineEntryModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "edit-team-user") {
    if (!canManageUsers()) return;
    uiState.editingTeamUserId = target.getAttribute("data-user-id");
    uiState.settingsInviteModalOpen = true;
    uiState.settingsUserNotice = "";
    renderFromCurrentState();
    return;
  }

  if (action === "delete-team-user") {
    if (!canManageUsers()) return;
    deleteTeamUser(target.getAttribute("data-user-id"));
    return;
  }

  if (action === "close-add-product-modal") {
    closeProductModal();
    renderFromCurrentState();
    return;
  }

  if (action === "select-stage") {
    uiState.activeView = "pipeline";
    uiState.selectedStageId = target.getAttribute("data-stage-id");
    ensureSelectedProductForStage(true);
    persistUiPreferences();
    renderFromCurrentState();
    return;
  }

  if (action === "select-product") {
    const productId = target.getAttribute("data-product-id");
    const product = getProductById(productId);
    if (!product) return;
    uiState.selectedProductId = product.id;
    uiState.expandedWorkspaceStageIds = getDefaultExpandedWorkspaceStageIds();
    uiState.fieldModal = null;
    persistUiPreferences();
    renderFromCurrentState();
    return;
  }

  if (action === "open-field-modal") {
    if (!canManageWorkspaceFieldTemplates()) return;
    openWorkspaceFieldModal(target, "create");
    renderFromCurrentState();
    return;
  }

  if (action === "edit-workspace-field") {
    if (!canManageWorkspaceFieldTemplates()) return;
    openWorkspaceFieldModal(target, "edit");
    renderFromCurrentState();
    return;
  }

  if (action === "close-field-modal") {
    uiState.fieldModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "delete-workspace-field") {
    if (!canManageWorkspaceFieldTemplates()) return;
    deleteWorkspaceFieldFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-field-history") {
    uiState.fieldHistoryModal = {
      productId: target.getAttribute("data-product-id"),
      stageId: target.getAttribute("data-stage-id"),
      fieldId: target.getAttribute("data-field-id"),
    };
    renderFromCurrentState();
    return;
  }

  if (action === "close-field-history") {
    uiState.fieldHistoryModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "open-stage-history") {
    uiState.stageHistoryModal = {
      productId: target.getAttribute("data-product-id"),
      stageId: target.getAttribute("data-stage-id"),
    };
    renderFromCurrentState();
    return;
  }

  if (action === "close-stage-history") {
    uiState.stageHistoryModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "restore-field-history") {
    restoreWorkspaceFieldHistoryEntry(target.getAttribute("data-history-entry-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "open-deleted-field-history") {
    uiState.deletedFieldHistoryModal = { stageId: target.getAttribute("data-stage-id") };
    renderFromCurrentState();
    return;
  }

  if (action === "close-deleted-field-history") {
    uiState.deletedFieldHistoryModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "restore-deleted-field-history") {
    if (!canManageWorkspaceFieldTemplates()) return;
    restoreDeletedWorkspaceFieldHistoryEntry(target.getAttribute("data-history-entry-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "add-field-modal-option") {
    if (!canManageWorkspaceFieldTemplates()) return;
    addFieldModalDropdownOption();
    renderFromCurrentState();
    return;
  }

  if (action === "remove-field-modal-option") {
    if (!canManageWorkspaceFieldTemplates()) return;
    removeFieldModalDropdownOption(target);
    renderFromCurrentState();
    return;
  }

  const fieldModalListActions = {
    "add-field-modal-table-column": () => addFieldModalListItem("tableColumns", "tableColumnDraft"),
    "add-field-modal-table-row": () => addFieldModalListItem("tableRows", "tableRowDraft"),
    "add-field-modal-checklist-item": () => addFieldModalListItem("checklistItems", "checklistItemDraft"),
    "remove-field-modal-table-column": () => removeFieldModalListItem("tableColumns", target),
    "remove-field-modal-table-row": () => removeFieldModalListItem("tableRows", target),
    "remove-field-modal-checklist-item": () => removeFieldModalListItem("checklistItems", target),
  };
  if (fieldModalListActions[action]) {
    if (!canManageWorkspaceFieldTemplates()) return;
    fieldModalListActions[action]();
    renderFromCurrentState();
    return;
  }

  if (action === "remove-long-bar-token") {
    if (!canEditProductFieldValues()) return;
    removeLongBarTokenFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (["add-workspace-table-column", "add-workspace-table-row"].includes(action)) {
    if (!canAdjustWorkspaceTableSheets()) return;
    addWorkspaceTableSectionFromButton(target, action === "add-workspace-table-column" ? "column" : "row");
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-workspace-table-structure-controls") {
    if (!canAdjustWorkspaceTableSheets()) return;
    toggleWorkspaceTableStructureControls(target);
    renderFromCurrentState();
    return;
  }

  if (["remove-workspace-table-column", "remove-workspace-table-row"].includes(action)) {
    if (!canAdjustWorkspaceTableSheets()) return;
    removeWorkspaceTableSectionFromButton(target, action === "remove-workspace-table-column" ? "column" : "row");
    renderFromCurrentState();
    return;
  }

  if (action === "edit-workspace-table-link-cell") {
    if (!canEditProductFieldValues()) return;
    editWorkspaceTableLinkCellFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "track-shipment") {
    trackShipmentFromButton(target);
    return;
  }

  if (action === "edit-sheet-embed-link") {
    setSheetEmbedLinkEditMode(target, true);
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "finish-sheet-embed-link-edit") {
    setSheetEmbedLinkEditMode(target, false);
    renderFromCurrentStatePreservingScroll();
    return;
  }


  if (action === "clear-workspace-link") {
    if (!canEditProductFieldValues()) return;
    clearWorkspaceLinkFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "clear-shipment-tracking") {
    if (!canEditProductFieldValues()) return;
    clearShipmentTrackingFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "clear-shipping-timeline-date") {
    if (!canEditProductFieldValues()) return;
    clearShippingTimelineDateFromButton(target);
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "open-payment-modal") {
    if (!canEditProductFieldValues()) return;
    openPaymentStatusModal(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-payment-transaction") {
    if (!canEditProductFieldValues()) return;
    if (deletePaymentTransactionFromButton(target)) renderFromCurrentState();
    return;
  }

  if (action === "close-payment-modal") {
    uiState.paymentModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "remove-payment-modal-invoice-file") {
    if (!canEditProductFieldValues()) return;
    removePaymentModalInvoiceFileFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-workspace-file-field") {
    if (!canEditProductFieldValues()) return;
    removeWorkspaceFileFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-payment-field-file") {
    if (!canEditProductFieldValues()) return;
    removePaymentFileFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-product-image") {
    if (!canMutateProductsNow()) return;
    deleteProductImageFromButton(target).catch(reportSharedWorkspaceSaveError);
    return;
  }

  if (action === "export-product-data") {
    exportProductDataFromButton(target);
    return;
  }

  if (action === "export-stage-tab") {
    exportStageTabFromButton(target);
    return;
  }

  if (action === "copy-product-sku") {
    copyProductSkuFromButton(target);
    return;
  }

  if (action === "select-image-gallery-format") {
    if (!canEditProductFieldValues()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditProductFieldValues()) return;
    addImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-image-gallery-preview") {
    openImageGalleryPreviewFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "close-image-gallery-preview") {
    uiState.imageGalleryPreview = null;
    renderFromCurrentState();
    return;
  }

  if (action === "remove-image-gallery-image") {
    if (!canEditProductFieldValues()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-image-gallery-slot") {
    if (!canEditProductFieldValues()) return;
    removeImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditProductFieldValues()) return;
    moveImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-product-chat") {
    openProductChat(target);
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
  }

  if (action === "close-product-chat") {
    closeProductChat();
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-chat-assets") {
    uiState.chatAssetsOpen = !uiState.chatAssetsOpen;
    renderFromCurrentState();
    return;
  }

  if (action === "close-chat-assets") {
    uiState.chatAssetsOpen = false;
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-chat-search") {
    uiState.chatSearchOpen = !uiState.chatSearchOpen;
    if (!uiState.chatSearchOpen) uiState.chatSearchQuery = "";
    renderFromCurrentState();
    restoreChatSearchFocus();
    return;
  }

  if (action === "clear-chat-search") {
    uiState.chatSearchQuery = "";
    renderFromCurrentState();
    restoreChatSearchFocus();
    return;
  }

  if (action === "toggle-chat-emoji-menu") {
    uiState.chatEmojiOpen = !uiState.chatEmojiOpen;
    renderFromCurrentState();
    return;
  }

  if (action === "open-chat-attachment-preview") {
    uiState.chatAttachmentPreview = target.getAttribute("data-attachment-id");
    uiState.chatReplyPreview = null;
    renderFromCurrentState();
    return;
  }

  if (action === "close-chat-attachment-preview") {
    uiState.chatAttachmentPreview = null;
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
  }

  if (action === "open-chat-reply-preview") {
    openChatReplyPreview(target);
    renderFromCurrentState();
    return;
  }

  if (action === "close-chat-reply-preview") {
    uiState.chatReplyPreview = null;
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
  }

  if (action === "remove-pending-chat-file") {
    removePendingChatAttachment(target);
    renderFromCurrentState();
    return;
  }

  if (action === "reply-to-chat-message") {
    startReplyToChatMessage(target);
    renderFromCurrentState();
    focusChatComposer();
    return;
  }

  if (action === "edit-chat-message") {
    startEditChatMessage(target);
    renderFromCurrentState();
    focusChatComposer();
    return;
  }

  if (action === "cancel-chat-edit") {
    uiState.editingChatMessageId = null;
    renderFromCurrentState();
    focusChatComposer();
    return;
  }

  if (action === "cancel-chat-reply") {
    uiState.replyingToChatMessageId = null;
    renderFromCurrentState();
    focusChatComposer();
    return;
  }

  if (action === "delete-chat-message") {
    deleteProductChatMessage(target);
    return;
  }

  if (action === "format-chat-text") {
    formatChatComposer(target);
    return;
  }

  if (action === "insert-chat-emoji") {
    insertChatEmoji(target);
    return;
  }

  if (action === "open-checklist-note") {
    if (!canManageChecklistTasks()) return;
    openChecklistNoteModal(target);
    renderFromCurrentState();
    return;
  }

  if (action === "close-checklist-note") {
    uiState.checklistNoteModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-workspace-stage") {
    const stageId = target.getAttribute("data-stage-id");
    if (!stageId) return;
    toggleWorkspaceStage(stageId);
    persistUiPreferences();
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-workspace-field-controls") {
    if (!canEditWorkspaceData()) return;
    toggleWorkspaceFieldControls(target);
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-workspace-checklist-panel") {
    toggleWorkspaceChecklistPanel(target);
    renderFromCurrentState();
    return;
  }

  if (action === "toggle-workspace-checklist-completed") {
    toggleWorkspaceChecklistCompletedVisibility(target);
    renderFromCurrentState();
    return;
  }

  if (action === "edit-workspace-checklist") {
    if (!canManageChecklistTasks()) return;
    editWorkspaceChecklistTaskFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-workspace-checklist") {
    if (!canManageChecklistTasks()) return;
    deleteWorkspaceChecklistTaskFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "advance-stage") {
    if (!canMoveProducts()) return;
    const productId = target.getAttribute("data-product-id");
    advanceProductStage(productId);
    launchConfettiEffect(target);
  }
}

function handleAppInput(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  noteWorkspaceInteraction();

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-login-email") {
    uiState.loginDraft.email = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-login-password") {
    uiState.loginDraft.password = target.value;
    return;
  }

  if (target.getAttribute("data-action") === "rename-stage") {
    if (!canEditPipelineTabs()) return;
    renameStage(target.getAttribute("data-stage-id"), "value" in target ? target.value : "");
    return;
  }

  if (target.getAttribute("data-action") === "update-launch-plan") {
    if (!canEditWorkspaceData()) return;
    updateLaunchPlanFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-keyword-spreadsheet-draft") {
    if (!canEditProductFieldValues()) return;
    uiState.keywordSpreadsheetDraft = "value" in target ? target.value : "";
    return;
  }

  if (target.getAttribute("data-action") === "update-keyword-cell") {
    if (!canEditProductFieldValues()) return;
    updateKeywordCellFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-keyword-column-label") {
    if (!canManageWorkspaceFieldTemplates()) return;
    updateKeywordColumnLabelFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-product-financial") {
    if (!canEditProductFieldValues()) return;
    updateProductFinancialFromInput(target);
    updateProductFinancialPreview(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-cogs-batch-draft") {
    if (!canEditProductFieldValues()) return;
    updateCogsBatchDraftFromInput(target);
    updateCogsCalculatorPreview();
    return;
  }

  if (target.getAttribute("data-action") === "update-cogs-cost-draft") {
    if (!canEditProductFieldValues()) return;
    updateCogsCostDraftFromInput(target);
    updateCogsCalculatorPreview();
    return;
  }

  if (target.getAttribute("data-action") === "update-cogs-template-category") {
    if (!canManageCogsTemplate()) return;
    updateCogsTemplateCategoryFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-cogs-template-row") {
    if (!canManageCogsTemplate()) return;
    updateCogsTemplateRowFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-listing-content") {
    if (!canEditProductFieldValues()) return;
    updateListingContentFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-workspace-field") {
    if (!canEditProductFieldValues()) return;
    updateWorkspaceFieldFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-payment-modal-field") {
    if (!canEditProductFieldValues()) return;
    updatePaymentModalDraft(target);
    updatePaymentModalBalancePreview();
    return;
  }

  if (["update-workspace-table-cell", "update-workspace-checklist-note-text"].includes(target.getAttribute("data-action"))) {
    if (!canEditProductFieldValues()) return;
    updateStructuredWorkspaceFieldFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-workspace-table-heading") {
    const axis = target.getAttribute("data-table-axis");
    if (axis === "row") {
      if (!canEditProductFieldValues()) return;
    } else if (!canAdjustWorkspaceTableSheets()) {
      return;
    }
    renameWorkspaceTableSectionFromInput(target);
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-label") {
    if (uiState.fieldModal) uiState.fieldModal.fieldLabel = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-header-subtext") {
    if (uiState.fieldModal) uiState.fieldModal.headerSubtext = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-option-draft") {
    if (uiState.fieldModal) uiState.fieldModal.dropdownOptionDraft = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-link-text") {
    if (uiState.fieldModal) uiState.fieldModal.linkButtonText = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-link-url") {
    if (uiState.fieldModal) uiState.fieldModal.linkUrl = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-sheet-url") {
    if (uiState.fieldModal) uiState.fieldModal.sheetUrl = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-bar-label") {
    if (uiState.fieldModal) {
      const barCount = uiState.fieldModal.selectedType === "FOUR_SHORT_BARS" ? 4 : 3;
      const index = Number(target.getAttribute("data-option-index"));
      const labels = normalizeMultiShortBarLabels(uiState.fieldModal.barLabels, barCount);
      if (Number.isInteger(index) && index >= 0 && index < labels.length) {
        labels[index] = target.value;
        uiState.fieldModal.barLabels = labels;
      }
    }
    return;
  }

  const fieldModalDraftKeys = {
    "update-field-modal-table-column-draft": "tableColumnDraft",
    "update-field-modal-table-row-draft": "tableRowDraft",
    "update-field-modal-checklist-item-draft": "checklistItemDraft",
  };
  const draftKey = fieldModalDraftKeys[target.getAttribute("data-action")];
  if (target instanceof HTMLInputElement && draftKey) {
    if (uiState.fieldModal) uiState.fieldModal[draftKey] = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-team-search") {
    uiState.settingsUserSearchQuery = target.value;
    renderFromCurrentState();
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-chat-search") {
    const selectionStart = target.selectionStart ?? target.value.length;
    uiState.chatSearchQuery = target.value;
    renderFromCurrentState();
    restoreChatSearchFocus(selectionStart);
    return;
  }

  if (!(target instanceof HTMLInputElement) || target.getAttribute("data-action") !== "update-search") return;

  const selectionStart = target.selectionStart ?? target.value.length;
  uiState.searchQuery = target.value;
  renderFromCurrentState();
  restoreSearchFocus(selectionStart);
}

function handleAppPointerDown(event) {
  noteWorkspaceInteraction(event);
  const target = event.target instanceof Element ? event.target.closest('[data-action="resize-workspace-table-section"]') : null;
  if (!target || !canAdjustWorkspaceTableSheets()) return;
  startWorkspaceTableResizeDrag(event, target);
}

function noteWorkspaceInteraction(event = null) {
  workspaceInteractionPauseUntil = Date.now() + 30000;
  noteWorkspaceTableResizeCandidate(event);
}

function startWorkspaceTableResizeDrag(event, target) {
  if (typeof PointerEvent === "undefined" || !(event instanceof PointerEvent) || !(target instanceof Element)) return;
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  const axis = target.getAttribute("data-table-axis");
  const index = Number(target.getAttribute("data-table-index"));
  const tableField = target.closest(".workspace-table-field");
  const heading = target.closest(".workspace-table-field__heading");
  if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis) || !Number.isInteger(index) || !tableField || !heading) return;

  event.preventDefault();
  event.stopPropagation();
  target.setPointerCapture?.(event.pointerId);
  freezeWorkspaceTableCurrentSizes(tableField);
  uiState.tableResizeDrag = {
    productId,
    stageId,
    fieldId,
    axis,
    index,
    tableField,
    startX: event.clientX,
    startY: event.clientY,
    startSize: axis === "column" ? heading.getBoundingClientRect().width : heading.closest("tr")?.getBoundingClientRect().height ?? heading.getBoundingClientRect().height,
  };
  document.body.classList.add("workspace-table-resizing");
}

function noteWorkspaceTableResizeCandidate(event) {
  if (!canAdjustWorkspaceTableSheets() || !(event?.target instanceof Element)) return;
  const heading = event.target.closest(".workspace-table-field__heading, .workspace-table-field__corner");
  if (!heading) return;
  const tableField = heading.closest(".workspace-table-field");
  if (!tableField) return;
  const metadataSource = heading.matches("[data-field-id]")
    ? heading
    : tableField.querySelector("[data-field-id][data-stage-id][data-product-id]");
  if (!metadataSource) return;
  const productId = metadataSource.getAttribute("data-product-id");
  const stageId = metadataSource.getAttribute("data-stage-id");
  const fieldId = metadataSource.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;
  uiState.tableResizeCandidate = {
    productId,
    stageId,
    fieldId,
    tableField,
    startedAt: Date.now(),
    columnWidths: getWorkspaceTableColumnWidthsFromElement(tableField),
    rowHeights: getWorkspaceTableRowHeightsFromElement(tableField),
  };
}

function handleWorkspaceTableResizeEnd() {
  const activeResize = uiState.tableResizeDrag;
  if (activeResize?.tableField?.isConnected && canAdjustWorkspaceTableSheets()) {
    const columnWidths = getWorkspaceTableColumnWidthsFromElement(activeResize.tableField);
    const rowHeights = getWorkspaceTableRowHeightsFromElement(activeResize.tableField);
    saveWorkspaceTableLayout(activeResize, columnWidths, rowHeights);
  }
  uiState.tableResizeDrag = null;
  document.body.classList.remove("workspace-table-resizing");

  const candidate = uiState.tableResizeCandidate;
  uiState.tableResizeCandidate = null;
  if (activeResize) return;
  if (!candidate?.tableField?.isConnected || !canAdjustWorkspaceTableSheets()) return;

  window.setTimeout(() => {
    const columnWidths = getWorkspaceTableColumnWidthsFromElement(candidate.tableField);
    const rowHeights = getWorkspaceTableRowHeightsFromElement(candidate.tableField);
    if (areNumberListsEqual(columnWidths, candidate.columnWidths) && areNumberListsEqual(rowHeights, candidate.rowHeights)) return;
    saveWorkspaceTableLayout(candidate, columnWidths, rowHeights);
  }, 0);
}

function handleWorkspaceTableResizeMove(event) {
  const resize = uiState.tableResizeDrag;
  if (!resize?.tableField?.isConnected || typeof PointerEvent === "undefined" || !(event instanceof PointerEvent)) return;
  event.preventDefault();
  const delta = resize.axis === "column" ? event.clientX - resize.startX : event.clientY - resize.startY;
  const nextSize = Math.round(Math.max(1, resize.startSize + delta));
  if (resize.axis === "column") {
    applyWorkspaceTableColumnSize(resize.tableField, resize.index, nextSize);
  } else {
    applyWorkspaceTableRowSize(resize.tableField, resize.index, nextSize);
  }
}

function handleAppFocusIn(event) {
  noteWorkspaceInteraction();
  if (event.target instanceof HTMLSelectElement) workspaceSelectInteractionActive = true;
}

function handleAppFocusOut(event) {
  noteWorkspaceInteraction();
  const target = event.target instanceof Element ? event.target : null;
  if (target instanceof HTMLInputElement && ["update-keyword-cell", "update-keyword-column-label"].includes(target.getAttribute("data-action"))) {
    window.setTimeout(() => {
      const activeAction = document.activeElement instanceof Element ? document.activeElement.getAttribute("data-action") : "";
      if (["update-keyword-cell", "update-keyword-column-label"].includes(activeAction)) return;
      uiState.keywordEditingCell = null;
      uiState.keywordEditingHeader = null;
      renderFromCurrentState();
    }, 0);
  }
  if (event.target instanceof HTMLSelectElement) {
    window.setTimeout(() => {
      if (!(document.activeElement instanceof HTMLSelectElement)) workspaceSelectInteractionActive = false;
    }, 0);
  }
  window.setTimeout(flushDeferredRemoteWorkspaceRender, 0);
}

function handleAppChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  noteWorkspaceInteraction();
  if (target instanceof HTMLSelectElement) workspaceSelectInteractionActive = false;

  const action = target.getAttribute("data-action");
  if (action === "update-cogs-template-category") {
    if (!canManageCogsTemplate()) return;
    updateCogsTemplateCategoryFromInput(target);
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "update-cogs-template-row") {
    if (!canManageCogsTemplate()) return;
    updateCogsTemplateRowFromInput(target);
    renderFromCurrentStatePreservingScroll();
    return;
  }

  if (target instanceof HTMLInputElement && action === "update-login-remember") {
    uiState.loginDraft.remember = target.checked;
    return;
  }

  if (action === "update-launch-plan") {
    if (!canEditWorkspaceData()) return;
    updateLaunchPlanFromInput(target);
    renderFromCurrentState();
    return;
  }

  if (action === "update-launch-chart-metric") {
    updateLaunchChartMetricFromSelect(target);
    renderFromCurrentState();
    return;
  }

  if (action === "update-product-financial") {
    if (!canEditProductFieldValues()) return;
    updateProductFinancialFromInput(target);
    recordActivity({
      icon: "payments",
      label: `Updated ${target.getAttribute("data-product-financial-metric") === "cogs" ? "COGS" : "selling price"}`,
      detail: getActivityProductName(target.getAttribute("data-product-id")),
      productId: target.getAttribute("data-product-id"),
    });
    renderFromCurrentState();
    return;
  }

  if (action === "update-cogs-batch-draft") {
    if (!canEditProductFieldValues()) return;
    updateCogsBatchDraftFromInput(target);
    if (uiState.cogsCalculatorModal?.draft) {
      uiState.cogsCalculatorModal.errors = validateCogsBatchDraft(uiState.cogsCalculatorModal.draft).errors;
      expandCogsRowsWithErrors(uiState.cogsCalculatorModal, uiState.cogsCalculatorModal.errors);
    }
    renderCogsCalculatorPreservingScroll();
    return;
  }

  if (action === "update-cogs-cost-draft") {
    if (!canEditProductFieldValues()) return;
    updateCogsCostDraftFromInput(target);
    if (uiState.cogsCalculatorModal?.draft) {
      uiState.cogsCalculatorModal.errors = validateCogsBatchDraft(uiState.cogsCalculatorModal.draft).errors;
      expandCogsRowsWithErrors(uiState.cogsCalculatorModal, uiState.cogsCalculatorModal.errors);
    }
    if (target.closest(".cogs-note-editor")) return;
    renderCogsCalculatorPreservingScroll();
    return;
  }

  if (action === "update-dashboard-history-filter") {
    if (target.getAttribute("name") === "activityStartDate") uiState.activityHistoryStartDate = "value" in target ? target.value : "";
    if (target.getAttribute("name") === "activityEndDate") uiState.activityHistoryEndDate = "value" in target ? target.value : "";
    renderFromCurrentState();
    return;
  }

  if (action === "update-field") {
    updateFieldFromInput(target);
    return;
  }

  if (action === "update-listing-content") {
    if (!canEditProductFieldValues()) return;
    updateListingContentFromInput(target);
    renderFromCurrentState();
    return;
  }

  if (action === "update-workspace-field") {
    if (!canEditProductFieldValues()) return;
    updateWorkspaceFieldFromInput(target);
    recordWorkspaceInputActivity(target);
    if (["url", "shippingDate", "expectedDays"].includes(target.getAttribute("data-field-part"))) renderFromCurrentStatePreservingScroll();
    return;
  }

  if (action === "upload-workspace-file-field") {
    if (!canEditProductFieldValues()) return;
    uploadWorkspaceFileFieldFromInput(target);
    return;
  }

  if (action === "upload-image-gallery-image") {
    if (!canEditProductFieldValues()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "upload-payment-modal-invoice-file") {
    if (!canEditProductFieldValues()) return;
    uploadPaymentModalInvoiceFileFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditProductFieldValues()) return;
    uploadPaymentFileFromInput(target);
    return;
  }

  if (action === "upload-dashboard-backgrounds") {
    if (!canEditWorkspaceData()) return;
    uploadDashboardBackgroundsFromInput(target);
    return;
  }

  if (action === "queue-dashboard-backgrounds") {
    if (!canEditWorkspaceData()) return;
    queueDashboardBackgroundsFromInput(target);
    return;
  }

  if (action === "update-payment-modal-field") {
    if (!canEditProductFieldValues()) return;
    updatePaymentModalDraft(target);
    updatePaymentModalBalancePreview();
    return;
  }

  if (action === "update-field-modal-type") {
    updateFieldModalType(target);
    renderFromCurrentState();
    return;
  }

  if (["update-workspace-table-cell", "update-workspace-checklist-note-item", "update-workspace-checklist-note-text"].includes(action)) {
    if (!canEditProductFieldValues()) return;
    updateStructuredWorkspaceFieldFromInput(target);
    recordWorkspaceInputActivity(target);
    if (action === "update-workspace-table-cell") {
      uiState.editingTableLinkCell = "";
    }
    return;
  }

  if (action === "update-workspace-table-heading") {
    const axis = target.getAttribute("data-table-axis");
    if (axis === "row") {
      if (!canEditProductFieldValues()) return;
    } else if (!canAdjustWorkspaceTableSheets()) {
      return;
    }
    renameWorkspaceTableSectionFromInput(target);
    if (axis !== "row") renderFromCurrentState();
    return;
  }

  if (action === "upload-product-image") {
    if (!canMutateProductsNow()) return;
    updateProductImageFromInput(target).catch(reportSharedWorkspaceSaveError);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "toggle-workspace-checklist") {
    if (!canManageChecklistTasks()) return;
    toggleWorkspaceChecklistTask(target);
    return;
  }

  if (action === "add-chat-files") {
    if (!canSendChatMessages()) return;
    addChatFilesFromInput(target);
    return;
  }

  if (action === "toggle-task") {
    if (!canManageChecklistTasks()) return;
    const activeProduct = getActiveProduct();
    const stageId = target.getAttribute("data-stage-id");
    const taskId = target.getAttribute("data-task-id");
    if (!activeProduct || !stageId || !taskId) return;
    toggleChecklistTask(activeProduct.id, stageId, taskId);
  }
}

function handleAppSubmit(event) {
  const form = event.target instanceof Element ? event.target.closest("form[data-action]") : null;
  if (!form) return;

  const action = form.getAttribute("data-action");
  if (action === "login") {
    event.preventDefault();
    submitLoginForm(form);
    return;
  }

  if (action === "add-custom-field") {
    event.preventDefault();
    if (!canManageWorkspaceFieldTemplates()) return;
    submitCustomFieldForm(form);
    return;
  }

  if (action === "workspace-save-custom-field") {
    event.preventDefault();
    if (!canManageWorkspaceFieldTemplates()) return;
    submitWorkspaceCustomFieldForm(form);
    return;
  }

  if (action === "add-workspace-checklist") {
    event.preventDefault();
    if (!canManageChecklistTasks()) return;
    submitWorkspaceChecklistForm(form);
    return;
  }

  if (action === "save-payment-status") {
    event.preventDefault();
    if (!canEditProductFieldValues()) return;
    savePaymentStatusForm(form);
    return;
  }

  if (action === "save-cogs-batch") {
    event.preventDefault();
    if (!canEditProductFieldValues()) return;
    saveCogsBatchForm(form).catch(reportSharedWorkspaceSaveError);
    return;
  }

  if (action === "save-launch-entry") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    saveLaunchEntryForm(form);
    return;
  }

  if (action === "save-dashboard-goal") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    saveDashboardGoalForm(form);
    return;
  }

  if (action === "save-launch-portfolio") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    saveLaunchPortfolioForm(form);
    return;
  }

  if (action === "save-campaign-link") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    saveCampaignLinkForm(form);
    return;
  }

  if (action === "save-vine-entry") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    saveVineEntryForm(form);
    return;
  }

  if (action === "save-checklist-note") {
    event.preventDefault();
    if (!canManageChecklistTasks()) return;
    submitChecklistNoteForm(form);
    return;
  }

  if (action === "send-product-chat") {
    event.preventDefault();
    if (!canSendChatMessages()) return;
    submitProductChatMessage(form);
    return;
  }

  if (action === "invite-user") {
    event.preventDefault();
    if (!canManageUsers()) return;
    submitInviteUserForm(form);
    return;
  }

  if (action === "save-profile-settings") {
    event.preventDefault();
    submitProfileSettingsForm(form).catch((error) => {
      console.error(error);
      uiState.settingsProfileNotice = "Profile save failed. Please try again.";
      renderFromCurrentState();
    });
    return;
  }

  if (action === "create-product") {
    event.preventDefault();
    if (!canMutateProductsNow()) return;
    submitAddProductForm(form).catch(reportSharedWorkspaceSaveError);
    return;
  }

  if (action === "create-stage") {
    event.preventDefault();
    if (!canEditPipelineTabs()) return;
    submitAddStageForm(form).catch(reportSharedWorkspaceSaveError);
    return;
  }

  if (action === "add-task") {
    event.preventDefault();
    if (!canManageChecklistTasks()) return;
    submitTaskForm(form);
  }
}

function submitCustomFieldForm(form) {
  const activeProduct = getActiveProduct();
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const type = String(formData.get("fieldType") ?? "");
  const label = String(formData.get("fieldLabel") ?? "").trim() || getLegacyCustomFieldDefaultLabel(type);

  if (!activeProduct || !stageId || !label || !CUSTOM_FIELD_TYPES.includes(type)) return;
  addCustomField(activeProduct.id, stageId, { label, type });
}

function submitTaskForm(form) {
  const activeProduct = getActiveProduct();
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const taskName = String(formData.get("taskName") ?? "").trim();

  if (!activeProduct || !stageId || !taskName) return;
  addChecklistTask(activeProduct.id, stageId, taskName);
}

async function submitAddStageForm(form) {
  if (!canEditPipelineTabs()) return;
  const formData = new FormData(form);
  const stageName = String(formData.get("stageName") ?? "").trim();
  if (!stageName) return;

  const stage = createCustomStage(stageName);
  const nextSettings = cloneStageSettings(stageSettings);
  nextSettings.customStages.push(stage);
  nextSettings.order.push(stage.id);
  setStageSettings(nextSettings);

  uiState.activeView = "pipeline";
  uiState.selectedStageId = stage.id;
  uiState.addStageModalOpen = false;
  ensureSelectedProductForStage(true);
  persistUiPreferences();
  await saveSharedWorkspaceNow("stage-create");
  renderFromCurrentState();
}

function createCustomStage(label) {
  const stageIdBase = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "custom-stage";
  let stageId = `custom-${stageIdBase}`;
  const existingStageIds = new Set(getBaseStageTabs().map((stageTab) => stageTab.id));
  while (existingStageIds.has(stageId)) {
    stageId = `custom-${stageIdBase}-${Math.random().toString(36).slice(2, 5)}`;
  }

  return {
    id: stageId,
    label,
    panelLabel: `${label} Pipeline`,
    icon: "add_box",
  };
}

async function submitAddProductForm(form) {
  if (!canMutateProductsNow()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

  const productId = form.getAttribute("data-product-id");

  if (!stageId || !productName) return;
  if (imageFile) validateProductImageFile(imageFile);

  setSharedWorkspaceSaveStatus("saving", "Saving shared workspace...");
  setProductFormSubmitting(form, true);
  remoteWorkspaceImmediateSavePreparing = true;
  let savedProduct = null;

  try {
    savedProduct = saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageUpload: null });
    if (!savedProduct) {
      setProductFormSubmitting(form, false);
      setSharedWorkspaceSaveStatus("error", "Save failed: product could not be saved locally.");
      renderFromCurrentState();
      return;
    }
    uiState.editingProductId = savedProduct.id;
    if (imageFile) {
      const imageUpload = await uploadProductImageMetadata(imageFile, savedProduct.id);
      saveProductImageIfPresent(savedProduct.id, imageUpload);
    }
    await saveSharedWorkspaceNow("product-save", { requireProductIds: [savedProduct.id] });
    closeProductModal();
    renderFromCurrentState();
  } catch (error) {
    setProductFormSubmitting(form, false);
    throw error;
  } finally {
    remoteWorkspaceImmediateSavePreparing = false;
  }
}

function setProductFormSubmitting(form, isSubmitting) {
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? "Saving..." : (form.getAttribute("data-product-id") ? "Save Product" : "Create Product");
  }
}

function saveProductFromModal(productInput) {
  if (productInput.productId) {
    return updateProduct(productInput);
  }

  return createUserProduct(productInput);
}

function createUserProduct({ stageId, name, sku, asin, imageUpload }) {
  const product = {
    id: createUserProductId(),
    name,
    sku,
    asin,
    stageId,
    readinessPercent: 0,
  };

  setUserProducts([...userProducts, product]);
  initializeNewProductWorkspaceTables(product.id);
  setVineSettings(initializeNewProductVineCollections(vineSettings, product.id));
  saveProductImageIfPresent(product.id, imageUpload);
  recordProductHistory({
    productId: product.id,
    action: "create",
    previousProduct: null,
    nextProduct: createProductHistorySnapshot(product.id),
  });
  selectProductAfterSave(product);
  return product;
}

function initializeNewProductWorkspaceTables(productId) {
  const cleanProductId = String(productId ?? "").trim();
  if (!cleanProductId) return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  for (const stageId of NEW_PRODUCT_BLANK_TABLE_STAGE_IDS) {
    const stageDetails = ensureWorkspaceStageDetails(nextDetails, cleanProductId, stageId);
    stageDetails.customFields.forEach((field) => {
      blankNewProductTargetTable(
        stageId,
        field,
        getEffectiveTableRowCount(field),
        getEffectiveTableColumnCount(field),
      );
    });
  }
  setWorkspaceDetails(nextDetails);
}

function updateProduct({ productId, stageId, name, sku, asin, imageUpload }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

  const previousProduct = createProductHistorySnapshot(productId);
  const product = { ...existingProduct, stageId, name, sku, asin };
  if (isUserProduct(product.id)) {
    setUserProducts(userProducts.map((item) => (item.id === product.id ? product : item)));
  } else {
    setProductSettings({
      ...productSettings,
      edits: {
        ...productSettings.edits,
        [product.id]: { name: product.name, sku: product.sku, asin: product.asin, stageId: product.stageId },
      },
    });
  }
  saveProductImageIfPresent(product.id, imageUpload);
  recordProductHistory({
    productId: product.id,
    action: "change",
    previousProduct,
    nextProduct: createProductHistorySnapshot(product.id),
  });
  selectProductAfterSave(product);
  return product;
}

function saveProductImageIfPresent(productId, imageUpload) {
  if (!imageUpload) return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = imageUpload.storagePath;
  productDetails.imageUrl = imageUpload.storageUrl;
  setWorkspaceDetails(nextDetails);
}

function selectProductAfterSave(product) {
  uiState.activeView = "pipeline";
  uiState.selectedStageId = product.stageId;
  uiState.selectedProductId = product.id;
  uiState.expandedWorkspaceStageIds = getDefaultExpandedWorkspaceStageIds();
  uiState.fieldModal = null;
  uiState.checklistNoteModal = null;
  persistUiPreferences();
}

function closeProductModal() {
  uiState.addProductModalOpen = false;
  uiState.editingProductId = null;
}

function getEditableProduct(productId) {
  return getAllProducts().find((product) => product.id === productId) ?? null;
}

function isUserProduct(productId) {
  return userProducts.some((product) => product.id === productId);
}

function moveProductToNextStage(productId) {
  if (!canMoveProducts()) return null;
  const product = getEditableProduct(productId);
  const nextStageId = product ? getNextProductStageId(product) : null;
  if (!product || !nextStageId) return null;

  return moveProductToStage(product.id, nextStageId);
}

function moveProductToStage(productId, stageId) {
  if (!canMoveProducts()) return null;
  const product = getEditableProduct(productId);
  if (!product || !isDroppableProductStage(stageId) || product.stageId === stageId) return null;

  const previousStageId = product.stageId;
  const previousProduct = createProductHistorySnapshot(product.id);
  const movedProduct = { ...product, stageId };
  persistProductStageChange(movedProduct);
  syncOrderWorkspaceIntoShipping(product.id, previousStageId, stageId);
  recordProductHistory({
    productId: product.id,
    action: "move",
    previousProduct,
    nextProduct: createProductHistorySnapshot(product.id),
  });
  recordActivity({
    icon: "move_up",
    label: `Moved ${product.name}`,
    detail: `${getActivityStageLabel(previousStageId)} → ${getActivityStageLabel(stageId)}`,
    stageId,
    productId: product.id,
  });
  return movedProduct;
}

function isDroppableProductStage(stageId) {
  return getSidebarStageTabs().some((stageTab) => stageTab.id === stageId);
}

function persistProductStageChange(product) {
  if (isUserProduct(product.id)) {
    setUserProducts(userProducts.map((item) => (item.id === product.id ? product : item)));
    return;
  }

  setProductSettings({
    ...productSettings,
    edits: {
      ...productSettings.edits,
      [product.id]: { name: product.name, sku: product.sku, asin: product.asin, stageId: product.stageId },
    },
  });
}

function getNextProductStageId(product) {
  const stageOrder = getSidebarStageTabs().map((stageTab) => stageTab.id);
  const currentIndex = stageOrder.indexOf(product?.stageId);
  if (currentIndex < 0 || currentIndex >= stageOrder.length - 1) return null;
  return stageOrder[currentIndex + 1];
}

async function deleteUserProduct(productId) {
  const previousProduct = createProductHistorySnapshot(productId);
  if (!canMutateProductsNow() || !previousProduct) return;
  setPendingProductAction("delete", productId);
  setSharedWorkspaceSaveStatus("saving", "Deleting product...");
  renderFromCurrentState();
  try {
    if (isUserProduct(productId)) {
      setUserProducts(userProducts.filter((product) => product.id !== productId));
    }
    setProductSettings({
      ...productSettings,
      deletedProductIds: [...new Set([...productSettings.deletedProductIds, productId])],
    });

    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    delete nextDetails.products?.[productId];
    setWorkspaceDetails(nextDetails);
    recordProductHistory({
      productId,
      action: "delete",
      previousProduct,
      nextProduct: null,
    });
    const deletedProductEntry = getLatestDeletedProductHistoryEntry(productId);
    if (deletedProductEntry) {
      setProductSettings({
        ...productSettings,
        deletedProductIds: [...new Set([...productSettings.deletedProductIds, productId])],
        deletedProductSnapshots: upsertDeletedProductSnapshot(productSettings.deletedProductSnapshots, deletedProductEntry),
      });
    }
    if (uiState.selectedProductId === productId) {
      uiState.selectedProductId = null;
      ensureSelectedProductForStage(true);
      persistUiPreferences();
    }
    await saveSharedWorkspaceNow("product-delete", {
      savingNotice: "Deleting product...",
      savedNotice: "Product deleted and moved to recovery.",
    });
  } finally {
    setPendingProductAction(null, null);
  }
  renderFromCurrentState();
}

function updateFieldFromInput(input) {
  const activeProduct = getActiveProduct();
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!activeProduct || !stageId || !fieldId) return;

  const stageBlock = getStageBlock(activeProduct, stageId);
  const field = stageBlock?.custom_fields.find((customField) => customField.field_id === fieldId);
  if (!field) return;

  const part = input.getAttribute("data-field-part");
  const inputValue = getInputValue(input);

  if (!part) {
    updateCustomFieldValue(activeProduct.id, stageId, fieldId, inputValue);
    return;
  }

  const currentValue = field.value && typeof field.value === "object" ? field.value : {};
  updateCustomFieldValue(activeProduct.id, stageId, fieldId, {
    ...currentValue,
    [part]: inputValue,
  });
}

function getInputValue(input) {
  if (input instanceof HTMLInputElement && input.type === "number") {
    return input.value === "" ? null : Number(input.value);
  }
  return "value" in input ? input.value : "";
}

function getSidebarStageTabs() {
  const tabMap = new Map(getBaseStageTabs().map((stageTab) => [stageTab.id, stageTab]));
  return stageSettings.order
    .map((stageId) => tabMap.get(stageId))
    .filter(Boolean)
    .filter((stageTab) => !stageSettings.hiddenStageIds.includes(stageTab.id))
    .map((stageTab) => ({
      ...stageTab,
      label: stageSettings.labels[stageTab.id] || stageTab.label,
    }));
}

function getHiddenSidebarStageTabs() {
  const tabMap = new Map(getBaseStageTabs().map((stageTab) => [stageTab.id, stageTab]));
  return stageSettings.hiddenStageIds
    .map((stageId) => tabMap.get(stageId))
    .filter(Boolean)
    .map((stageTab) => ({
      ...stageTab,
      label: stageSettings.labels[stageTab.id] || stageTab.label,
    }));
}

function renameStage(stageId, label) {
  if (!stageId) return;
  const cleanLabel = String(label ?? "").trim();
  const nextSettings = cloneStageSettings(stageSettings);
  if (cleanLabel) {
    nextSettings.labels[stageId] = cleanLabel;
  } else {
    delete nextSettings.labels[stageId];
  }
  setStageSettings(nextSettings);
}

function moveStage(stageId, direction) {
  if (!stageId || !["up", "down"].includes(direction)) return;
  const nextSettings = cloneStageSettings(stageSettings);
  const currentIndex = nextSettings.order.indexOf(stageId);
  if (currentIndex < 0) return;
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= nextSettings.order.length) return;
  [nextSettings.order[currentIndex], nextSettings.order[nextIndex]] = [nextSettings.order[nextIndex], nextSettings.order[currentIndex]];
  setStageSettings(nextSettings);
}

function deleteStage(stageId) {
  if (!stageId) return false;
  const nextSettings = cloneStageSettings(stageSettings);
  const isBaseStage = SIDEBAR_STAGE_TABS.some((stageTab) => stageTab.id === stageId);
  if (!isBaseStage && !nextSettings.customStages.some((stageTab) => stageTab.id === stageId)) return false;
  nextSettings.customStages = nextSettings.customStages.filter((stageTab) => stageTab.id !== stageId);
  nextSettings.order = nextSettings.order.filter((orderedStageId) => orderedStageId !== stageId);
  delete nextSettings.labels[stageId];
  if (isBaseStage && !nextSettings.hiddenStageIds.includes(stageId)) {
    nextSettings.hiddenStageIds.push(stageId);
  }
  if (!isBaseStage) {
    nextSettings.hiddenStageIds = nextSettings.hiddenStageIds.filter((hiddenStageId) => hiddenStageId !== stageId);
  }
  setStageSettings(nextSettings);
  purgeDeletedStageWorkspaceData(stageId);
  moveProductsFromDeletedStage(stageId);
  if (uiState.selectedStageId === stageId || !getSidebarStageTabs().some((stageTab) => stageTab.id === uiState.selectedStageId)) {
    uiState.selectedStageId = getSidebarStageTabs()[0]?.id ?? "product-research";
  }
  ensureSelectedProductForStage(true);
  persistUiPreferences();
  return true;
}

function purgeDeletedStageWorkspaceData(stageId) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  delete nextDetails.stageFieldTemplates?.[stageId];
  for (const productDetails of Object.values(nextDetails.products ?? {})) {
    delete productDetails?.stages?.[stageId];
  }
  setWorkspaceDetails(nextDetails);
}

function moveProductsFromDeletedStage(stageId) {
  const fallbackStageId = getSidebarStageTabs()[0]?.id ?? "product-research";
  if (!fallbackStageId) return;
  const movedUserProducts = userProducts.map((product) => (product.stageId === stageId ? { ...product, stageId: fallbackStageId } : product));
  if (movedUserProducts.some((product, index) => product.stageId !== userProducts[index]?.stageId)) {
    setUserProducts(movedUserProducts);
  }
  const movedEdits = Object.fromEntries(Object.entries(productSettings.edits).map(([productId, edit]) => [
    productId,
    edit.stageId === stageId ? { ...edit, stageId: fallbackStageId } : edit,
  ]));
  const defaultProductsInStage = DUMMY_PRODUCTS.filter((product) => product.stageId === stageId && !productSettings.deletedProductIds.includes(product.id));
  for (const product of defaultProductsInStage) {
    movedEdits[product.id] = {
      ...(movedEdits[product.id] ?? { name: product.name, sku: product.sku, asin: product.asin }),
      stageId: fallbackStageId,
    };
  }
  if (defaultProductsInStage.length || Object.entries(movedEdits).some(([productId, edit]) => edit.stageId !== productSettings.edits[productId]?.stageId)) {
    setProductSettings({ ...productSettings, edits: movedEdits });
  }
}

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = safeGetStorageItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

  try {
    return normalizeStageSettings(JSON.parse(rawSettings));
  } catch {
    return createDefaultStageSettings();
  }
}

function setStageSettings(nextSettings) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
  markRemoteWorkspaceDirtyKey("stageSettings");
  queueRemoteWorkspaceSync();
}

function restoreUiPreferences() {
  if (typeof window === "undefined") return;

  try {
    const preferences = JSON.parse(safeGetStorageItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const activeView = String(preferences.activeView ?? "");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const selectedProductId = String(preferences.selectedProductId ?? "");
    const settingsCategory = String(preferences.settingsCategory ?? "");
    const expandedWorkspaceStageIds = Array.isArray(preferences.expandedWorkspaceStageIds) ? preferences.expandedWorkspaceStageIds.map((stageId) => String(stageId)) : [];
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (["dashboard", "pipeline", "settings"].includes(activeView)) uiState.activeView = activeView;
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
    if (selectedProductId && getProductById(selectedProductId)) uiState.selectedProductId = selectedProductId;
    const validExpandedStageIds = expandedWorkspaceStageIds.filter((stageId) => visibleStageIds.has(stageId));
    if (validExpandedStageIds.length > 0) uiState.expandedWorkspaceStageIds = new Set(validExpandedStageIds);
    if (settingsCategory && canViewSettingsCategory(settingsCategory)) uiState.settingsCategory = settingsCategory;
    if (uiState.activeView === "settings" && !canViewSettingsCategory(uiState.settingsCategory)) {
      uiState.settingsCategory = getDefaultSettingsCategory();
    }
  } catch {
    uiState.activeView = "pipeline";
    uiState.selectedStageId = "product-research";
    uiState.selectedProductId = null;
    uiState.settingsCategory = "profile";
  }
}

function persistUiPreferences() {
  if (typeof window === "undefined") return;

  try {
    safeSetStorageItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      activeView: uiState.activeView,
      selectedStageId: uiState.selectedStageId,
      selectedProductId: uiState.selectedProductId,
      settingsCategory: uiState.settingsCategory,
      expandedWorkspaceStageIds: Array.from(uiState.expandedWorkspaceStageIds),
    }));
  } catch (error) {
    console.warn("LaunchFlow could not persist UI preferences locally.", error);
  }
}

function loadWorkspaceBranding() {
  if (typeof window === "undefined") return normalizeWorkspaceBranding();
  const rawBranding = safeGetStorageItem(WORKSPACE_BRANDING_STORAGE_KEY);
  if (!rawBranding) return normalizeWorkspaceBranding();

  try {
    return normalizeWorkspaceBranding(JSON.parse(rawBranding));
  } catch {
    return normalizeWorkspaceBranding();
  }
}

function setWorkspaceBranding(nextBranding) {
  workspaceBranding = normalizeWorkspaceBranding(nextBranding);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(WORKSPACE_BRANDING_STORAGE_KEY, JSON.stringify(workspaceBranding));
    } catch (error) {
      console.warn("LaunchFlow could not persist workspace branding locally.", error);
    }
  }
  markRemoteWorkspaceDirtyKey("workspaceBranding");
  queueRemoteWorkspaceSync();
}

function normalizeWorkspaceBranding(branding = {}) {
  return {
    title: String(branding?.title ?? DEFAULT_WORKSPACE_BRANDING.title).trim().slice(0, 48) || DEFAULT_WORKSPACE_BRANDING.title,
    subtitle: String(branding?.subtitle ?? DEFAULT_WORKSPACE_BRANDING.subtitle).trim().slice(0, 72) || DEFAULT_WORKSPACE_BRANDING.subtitle,
  };
}

function renameWorkspaceBrandFromElement(element) {
  const field = element.getAttribute("data-workspace-brand-field");
  if (!["title", "subtitle"].includes(field) || typeof window === "undefined" || typeof window.prompt !== "function") return;
  const currentValue = workspaceBranding[field] ?? DEFAULT_WORKSPACE_BRANDING[field];
  const nextValue = window.prompt(`Rename ${field === "title" ? "workspace title" : "workspace subtitle"}`, currentValue);
  if (nextValue === null) return;
  const trimmedValue = String(nextValue).trim();
  if (!trimmedValue || trimmedValue === currentValue) return;
  setWorkspaceBranding({ ...workspaceBranding, [field]: trimmedValue });
  flushRemoteWorkspaceSyncSoon(0);
}

function loadDashboardSettings() {
  if (typeof window === "undefined") return normalizeDashboardSettings();
  const rawSettings = safeGetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeDashboardSettings();

  try {
    return normalizeDashboardSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeDashboardSettings();
  }
}

function setDashboardSettings(nextSettings) {
  dashboardSettings = normalizeDashboardSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify(dashboardSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist dashboard settings locally.", error);
    }
  }
  markRemoteWorkspaceDirtyKey("dashboardSettings");
  queueRemoteWorkspaceSync();
}

function normalizeDashboardSettings(settings = {}) {
  const backgroundImages = Array.isArray(settings?.backgroundImages)
    ? settings.backgroundImages.map((item) => normalizeDashboardBackgroundImage(item)).filter(Boolean)
    : DEFAULT_DASHBOARD_SETTINGS.backgroundImages;
  return {
    title: String(settings?.title ?? DEFAULT_DASHBOARD_SETTINGS.title).trim() || DEFAULT_DASHBOARD_SETTINGS.title,
    subtitle: String(settings?.subtitle ?? DEFAULT_DASHBOARD_SETTINGS.subtitle).trim() || DEFAULT_DASHBOARD_SETTINGS.subtitle,
    targetLaunches: normalizeCampaignCount(settings?.targetLaunches, DEFAULT_DASHBOARD_SETTINGS.targetLaunches),
    backgroundImages: backgroundImages.slice(0, DASHBOARD_HERO_MAX_SLIDES),
  };
}

function normalizeDashboardBackgroundImage(value) {
  if (typeof value === "string") {
    const imageSource = value.trim();
    if (!imageSource) return null;
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(imageSource)) return imageSource;
    return getSafeDashboardImageUrl(imageSource);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const storageUrl = String(value.storageUrl ?? value.url ?? value.imageUrl ?? "").trim();
  const safeStorageUrl = getSafeDashboardImageUrl(storageUrl);
  if (!safeStorageUrl) return null;

  return {
    slideId: String(value.slideId ?? value.imageId ?? value.attachmentId ?? "") || createDashboardSlideId(),
    name: String(value.name ?? "Dashboard slide").trim() || "Dashboard slide",
    type: String(value.type ?? "image/*"),
    size: Number(value.size ?? 0),
    bucket: String(value.bucket ?? SUPABASE_STORAGE_BUCKETS.dashboardSlides),
    storagePath: String(value.storagePath ?? ""),
    storageUrl: safeStorageUrl,
    uploadedAt: typeof value.uploadedAt === "string" ? value.uploadedAt : new Date().toISOString(),
  };
}

function getSafeDashboardImageUrl(url) {
  const cleanUrl = String(url ?? "").trim();
  if (!cleanUrl) return null;
  if (cleanUrl.startsWith(LOCAL_UPLOAD_URL_PREFIX)) return cleanUrl;
  if (/^\/api\/storage-asset\?id=/i.test(cleanUrl)) return cleanUrl;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(cleanUrl)) return cleanUrl;
  return getSafeWorkspaceUrl(cleanUrl);
}

function loadActivityLog() {
  if (typeof window === "undefined") return [];
  const rawActivity = safeGetStorageItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!rawActivity) return [];

  try {
    return normalizeActivityLog(JSON.parse(rawActivity));
  } catch {
    return [];
  }
}

function setActivityLog(nextActivityLog) {
  activityLog = normalizeActivityLog(nextActivityLog);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(activityLog));
    } catch (error) {
      console.warn("LaunchFlow could not persist activity history locally.", error);
    }
  }
  markRemoteWorkspaceDirtyKey("activityLog");
  queueRemoteWorkspaceSync();
}

function normalizeActivityLog(rawActivityLog) {
  return (Array.isArray(rawActivityLog) ? rawActivityLog : [])
    .map((item) => ({
      id: String(item?.id ?? createLocalEntryId("activity")),
      icon: String(item?.icon ?? "history"),
      label: String(item?.label ?? "Pipeline update").trim() || "Pipeline update",
      detail: String(item?.detail ?? "").trim(),
      stageId: String(item?.stageId ?? ""),
      productId: String(item?.productId ?? ""),
      productName: String(item?.productName ?? "").trim(),
      auditType: String(item?.auditType ?? "").trim(),
      actorName: String(item?.actorName ?? "").trim(),
      actorEmail: String(item?.actorEmail ?? "").trim().toLowerCase(),
      actorRole: normalizeUserRole(item?.actorRole ?? ""),
      productCountBefore: Number.isFinite(Number(item?.productCountBefore)) ? Number(item.productCountBefore) : null,
      productCountAfter: Number.isFinite(Number(item?.productCountAfter)) ? Number(item.productCountAfter) : null,
      removedProducts: normalizeActivityAuditProducts(item?.removedProducts),
      addedProducts: normalizeActivityAuditProducts(item?.addedProducts),
      timestamp: Number(item?.timestamp) || Date.now(),
    }))
    .sort((firstItem, secondItem) => secondItem.timestamp - firstItem.timestamp)
    .slice(0, 250);
}

function normalizeActivityAuditProducts(products) {
  return (Array.isArray(products) ? products : [])
    .map((product) => {
      const id = String(product?.id ?? "").trim();
      const name = String(product?.name ?? "").trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        sku: String(product?.sku ?? "").trim(),
        asin: String(product?.asin ?? "").trim(),
        stageId: String(product?.stageId ?? "").trim(),
        stageLabel: String(product?.stageLabel ?? "").trim(),
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function recordActivity(entry) {
  setActivityLog([{
    id: createLocalEntryId("activity"),
    icon: entry.icon ?? "history",
    label: entry.label ?? "Pipeline update",
    detail: entry.detail ?? "",
    stageId: entry.stageId ?? "",
    productId: entry.productId ?? "",
    productName: entry.productName ?? "",
    auditType: entry.auditType ?? "",
    actorName: entry.actorName ?? "",
    actorEmail: entry.actorEmail ?? "",
    actorRole: entry.actorRole ?? "",
    productCountBefore: entry.productCountBefore ?? null,
    productCountAfter: entry.productCountAfter ?? null,
    removedProducts: entry.removedProducts ?? [],
    addedProducts: entry.addedProducts ?? [],
    timestamp: Date.now(),
  }, ...activityLog]);
}

function getFilteredActivityLog() {
  const startTime = uiState.activityHistoryStartDate ? Date.parse(`${uiState.activityHistoryStartDate}T00:00:00`) : 0;
  const endTime = uiState.activityHistoryEndDate ? Date.parse(`${uiState.activityHistoryEndDate}T23:59:59`) : Number.POSITIVE_INFINITY;
  return activityLog.filter((item) => item.timestamp >= startTime && item.timestamp <= endTime);
}

function getActivityProductName(productId) {
  return getProductById(productId)?.name ?? "Product";
}

function getActivityStageLabel(stageId) {
  return getSidebarStageTabs().find((stageTab) => stageTab.id === stageId)?.label ?? "Pipeline";
}

function recordWorkspaceInputActivity(input, actionLabel = "Updated Field") {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const productDetails = productId ? getWorkspaceProductDetails(productId) : null;
  const field = productDetails?.stages?.[stageId]?.customFields?.find((item) => item.fieldId === fieldId);
  const fieldPart = input.getAttribute("data-field-part");
  const fieldLabel = field?.label ? `${field.label}${fieldPart ? ` (${fieldPart})` : ""}` : "workspace field";
  recordActivity({
    icon: "edit_note",
    label: `${actionLabel}: ${fieldLabel}`,
    detail: `${getActivityProductName(productId)} • ${getActivityStageLabel(stageId)}`,
    stageId,
    productId,
  });
}

function normalizeWorkspaceFieldHistory(history) {
  const normalizedHistory = (Array.isArray(history) ? history : [])
    .map(normalizeWorkspaceFieldHistoryEntry)
    .filter(Boolean)
    .sort((firstItem, secondItem) => firstItem.timestamp - secondItem.timestamp);

  return collapseWorkspaceFieldHistoryEdits(normalizedHistory)
    .sort((firstItem, secondItem) => secondItem.timestamp - firstItem.timestamp)
    .slice(0, WORKSPACE_FIELD_HISTORY_LIMIT);
}

function collapseWorkspaceFieldHistoryEdits(history) {
  return history.reduce((items, entry) => {
    const previousEntry = items[items.length - 1];
    if (canMergeWorkspaceFieldHistoryEntries(previousEntry, entry)) {
      previousEntry.id = entry.id;
      previousEntry.nextValue = structuredCloneWorkspaceFieldValue(entry.nextValue);
      previousEntry.timestamp = entry.timestamp;
      return items;
    }
    items.push(entry);
    return items;
  }, []);
}

function canMergeWorkspaceFieldHistoryEntries(previousEntry, nextEntry) {
  if (!previousEntry || !nextEntry) return false;
  if (previousEntry.action !== "change" || nextEntry.action !== "change") return false;
  if (previousEntry.productId !== nextEntry.productId) return false;
  if (previousEntry.stageId !== nextEntry.stageId) return false;
  if (previousEntry.fieldId !== nextEntry.fieldId) return false;
  if (previousEntry.changedByEmail !== nextEntry.changedByEmail) return false;
  if (getWorkspaceHistoryCellKey(previousEntry.tableCell) !== getWorkspaceHistoryCellKey(nextEntry.tableCell)) return false;
  if (getWorkspaceHistoryMultiBarKey(previousEntry.multiBar) !== getWorkspaceHistoryMultiBarKey(nextEntry.multiBar)) return false;
  return Math.abs(nextEntry.timestamp - previousEntry.timestamp) <= WORKSPACE_FIELD_HISTORY_EDIT_WINDOW_MS;
}

function getWorkspaceHistoryCellKey(tableCell) {
  if (!tableCell) return "";
  return `${tableCell.rowIndex}:${tableCell.columnIndex}`;
}

function getWorkspaceHistoryMultiBarKey(multiBar) {
  if (!multiBar) return "";
  return String(multiBar.index);
}

function normalizeProductHistoryEntry(entry) {
  const action = ["create", "change", "move", "delete", "restore"].includes(entry?.action) ? entry.action : "change";
  const productId = String(entry?.productId ?? "").trim();
  if (!productId) return null;
  return {
    id: String(entry?.id ?? "") || createLocalEntryId("product_history"),
    action,
    productId,
    productName: String(entry?.productName ?? entry?.nextProduct?.product?.name ?? entry?.previousProduct?.product?.name ?? "").trim(),
    previousProduct: normalizeProductHistorySnapshot(entry?.previousProduct),
    nextProduct: normalizeProductHistorySnapshot(entry?.nextProduct),
    changedByName: String(entry?.changedByName ?? "").trim(),
    changedByEmail: String(entry?.changedByEmail ?? "").trim().toLowerCase(),
    changedByRole: normalizeUserRole(entry?.changedByRole ?? ""),
    timestamp: Number(entry?.timestamp) || Date.now(),
  };
}

function normalizeProductHistorySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const product = normalizeProductHistoryProduct(snapshot.product);
  if (!product) return null;
  return {
    product,
    productDetails: normalizeWorkspaceProductDetailsSnapshot(snapshot.productDetails),
  };
}

function normalizeProductHistoryProduct(product) {
  const id = String(product?.id ?? "").trim();
  const name = String(product?.name ?? "").trim();
  const stageId = normalizeProductStageId(product?.stageId);
  if (!id || !name || !stageId) return null;
  return {
    id,
    name,
    sku: normalizeOptionalProductValue(product?.sku),
    asin: normalizeOptionalProductValue(product?.asin),
    stageId,
    readinessPercent: clampReadinessPercent(product?.readinessPercent),
  };
}

function normalizeWorkspaceProductDetailsSnapshot(productDetails) {
  if (!productDetails || typeof productDetails !== "object") return null;
  return normalizeWorkspaceDetails({ products: { snapshot: productDetails } }).products.snapshot ?? null;
}

function normalizeProductHistory(history) {
  return (Array.isArray(history) ? history : [])
    .map(normalizeProductHistoryEntry)
    .filter(Boolean)
    .slice(0, 1000);
}

function normalizeDeletedProductSnapshots(snapshots) {
  return normalizeProductHistory(snapshots).filter((entry) => entry.action === "delete" && entry.previousProduct);
}

function createProductHistorySnapshot(productId) {
  const product = getEditableProduct(productId);
  if (!product) return null;
  const productDetails = workspaceDetails.products?.[productId] ? structuredCloneWorkspaceFieldValue(workspaceDetails.products[productId]) : null;
  return {
    product: structuredCloneWorkspaceFieldValue(product),
    productDetails,
  };
}

function recordProductHistory({ productId, action, previousProduct, nextProduct }) {
  if (valuesAreEquivalent(previousProduct, nextProduct)) return;
  const normalizedEntry = normalizeProductHistoryEntry({
    id: createLocalEntryId("product_history"),
    timestamp: Date.now(),
    ...getCurrentHistoryUser(),
    productId,
    action,
    productName: nextProduct?.product?.name || previousProduct?.product?.name || "",
    previousProduct,
    nextProduct,
  });
  if (!normalizedEntry) return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  nextDetails.productHistory = normalizeProductHistory([normalizedEntry, ...(nextDetails.productHistory ?? [])]);
  setWorkspaceDetails(nextDetails);
}

function getProductHistory(productId) {
  return normalizeProductHistory(workspaceDetails.productHistory).filter((entry) => entry.productId === productId && entry.action !== "delete");
}

function getDeletedProductHistory(stageId = "") {
  const normalizedStageId = String(stageId ?? "").trim();
  const purgedHistoryIds = new Set(productSettings.purgedProductHistoryIds);
  const deletedProductIds = new Set(productSettings.deletedProductIds);
  const latestEntriesByProductId = new Map();
  mergeProductHistoryEntries(productSettings.deletedProductSnapshots, workspaceDetails.productHistory).forEach((entry) => {
    if (entry.action !== "delete" || !entry.previousProduct) return;
    const entryProductId = getProductHistoryEntryProductId(entry);
    if (!deletedProductIds.has(entryProductId)) return;
    if (purgedHistoryIds.has(entry.id)) return;
    if (normalizedStageId && entry.previousProduct.product?.stageId !== normalizedStageId) return;
    if (!latestEntriesByProductId.has(entryProductId)) latestEntriesByProductId.set(entryProductId, entry);
  });
  return Array.from(latestEntriesByProductId.values());
}

function getProductHistoryEntryProductId(entry) {
  return String(entry?.productId || entry?.previousProduct?.product?.id || entry?.nextProduct?.product?.id || "");
}

function getLatestDeletedProductHistoryEntry(productId) {
  return getDeletedProductHistory().find((entry) => entry.productId === productId) ?? null;
}

function upsertDeletedProductSnapshot(snapshots, entry) {
  if (!entry?.id) return normalizeDeletedProductSnapshots(snapshots);
  return normalizeDeletedProductSnapshots([entry, ...normalizeDeletedProductSnapshots(snapshots).filter((item) => item.id !== entry.id)]);
}

function getProductHistoryActionLabel(entry) {
  const labels = {
    create: "Created product",
    change: "Changed product",
    move: "Moved product",
    delete: "Deleted product",
    restore: "Restored product",
  };
  return labels[entry.action] ?? "Changed product";
}

function summarizeProductHistorySnapshot(snapshot) {
  if (!snapshot?.product) return "Missing";
  const product = snapshot.product;
  const stageLabel = getActivityStageLabel(product.stageId);
  return `${product.name} • ${stageLabel} • SKU: ${product.sku || "N/A"} • ASIN: ${product.asin || "N/A"}`;
}

function getProductHistoryDiffs(entry) {
  const beforeProduct = entry?.previousProduct?.product ?? null;
  const afterProduct = entry?.nextProduct?.product ?? null;
  if (entry?.action === "create" && afterProduct) {
    return [{ label: "Product", before: "Missing", after: summarizeProductHistorySnapshot(entry.nextProduct) }];
  }
  if (entry?.action === "delete" && beforeProduct) {
    return [{ label: "Product", before: summarizeProductHistorySnapshot(entry.previousProduct), after: "Deleted" }];
  }

  const fields = [
    { key: "name", label: "Product name", format: (value) => String(value || "Blank") },
    { key: "stageId", label: "Stage", format: (value) => getActivityStageLabel(value) || "Blank" },
    { key: "sku", label: "SKU", format: (value) => String(value || "N/A") },
    { key: "asin", label: "ASIN", format: (value) => String(value || "N/A") },
  ];

  return fields
    .filter((field) => !valuesAreEquivalent(beforeProduct?.[field.key] ?? "", afterProduct?.[field.key] ?? ""))
    .map((field) => ({
      label: field.label,
      before: field.format(beforeProduct?.[field.key] ?? ""),
      after: field.format(afterProduct?.[field.key] ?? ""),
    }));
}

function canRestoreProductHistory(entry) {
  if (!canMutateProductsNow()) return false;
  if (entry?.action === "create") return false;
  return Boolean(entry?.previousProduct || entry?.nextProduct);
}

function canPermanentlyDeleteProductHistory(entry) {
  return canMutateProductsNow() && entry?.action === "delete" && Boolean(entry?.previousProduct);
}

async function restoreProductHistoryEntry(entryId) {
  if (!canMutateProductsNow()) return;
  const entry = mergeProductHistoryEntries(productSettings.deletedProductSnapshots, workspaceDetails.productHistory).find((item) => item.id === entryId);
  if (!entry) return;
  const snapshot = entry.action === "delete" ? entry.previousProduct : entry.previousProduct ?? entry.nextProduct;
  if (!snapshot?.product) return;
  setPendingProductAction("restore", entryId);
  setSharedWorkspaceSaveStatus("saving", "Restoring product...");
  renderFromCurrentState();
  try {
    const previousProduct = createProductHistorySnapshot(entry.productId);
    restoreProductSnapshot(snapshot);
    recordProductHistory({
      productId: snapshot.product.id,
      action: "restore",
      previousProduct,
      nextProduct: createProductHistorySnapshot(snapshot.product.id),
    });
    uiState.selectedStageId = snapshot.product.stageId;
    uiState.selectedProductId = snapshot.product.id;
    persistUiPreferences();
    await saveSharedWorkspaceNow("product-restore", {
      savingNotice: "Restoring product...",
      savedNotice: "Product restored.",
    });
  } finally {
    setPendingProductAction(null, null);
    renderFromCurrentState();
  }
}

async function permanentlyDeleteProductHistoryEntry(entryId) {
  if (!canMutateProductsNow() || !entryId) return;
  const entry = mergeProductHistoryEntries(productSettings.deletedProductSnapshots, workspaceDetails.productHistory).find((item) => item.id === entryId);
  if (!entry?.previousProduct?.product?.id) return;
  setPendingProductAction("delete-forever", entryId);
  setSharedWorkspaceSaveStatus("saving", "Permanently deleting product...");
  renderFromCurrentState();
  try {
    const productId = entry.previousProduct.product.id;
    const deletedEntriesForProduct = mergeProductHistoryEntries(productSettings.deletedProductSnapshots, workspaceDetails.productHistory)
      .filter((item) => item.action === "delete" && getProductHistoryEntryProductId(item) === productId);
    const purgedEntryIds = deletedEntriesForProduct.map((item) => item.id);
    setUserProducts(userProducts.filter((product) => product.id !== productId));
    setProductSettings({
      ...productSettings,
      deletedProductIds: [...new Set([...productSettings.deletedProductIds, productId])],
      deletedProductSnapshots: normalizeDeletedProductSnapshots(productSettings.deletedProductSnapshots).filter((item) => getProductHistoryEntryProductId(item) !== productId),
      purgedProductHistoryIds: [...new Set([...(productSettings.purgedProductHistoryIds ?? []), ...purgedEntryIds])],
    });
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    delete nextDetails.products?.[productId];
    nextDetails.productHistory = normalizeProductHistory(nextDetails.productHistory).filter((item) => !purgedEntryIds.includes(item.id));
    setWorkspaceDetails(nextDetails);
    if (uiState.deletedProductHistoryModalOpen && getDeletedProductHistory(uiState.deletedProductHistoryStageId || uiState.selectedStageId).length === 0) {
      uiState.deletedProductHistoryModalOpen = false;
      uiState.deletedProductHistoryStageId = "";
    }
    await saveSharedWorkspaceNow("product-delete-forever", {
      savingNotice: "Permanently deleting product...",
      savedNotice: "Product permanently deleted.",
    });
  } finally {
    setPendingProductAction(null, null);
    renderFromCurrentState();
  }
}

function restoreProductSnapshot(snapshot) {
  const product = normalizeProductHistoryProduct(snapshot?.product);
  if (!product) return;
  const isDefaultProduct = DUMMY_PRODUCTS.some((item) => item.id === product.id);
  if (isDefaultProduct) {
    setProductSettings({
      ...productSettings,
      deletedProductIds: productSettings.deletedProductIds.filter((productId) => productId !== product.id),
      deletedProductSnapshots: normalizeDeletedProductSnapshots(productSettings.deletedProductSnapshots).filter((entry) => entry.productId !== product.id),
      edits: {
        ...productSettings.edits,
        [product.id]: { name: product.name, sku: product.sku, asin: product.asin, stageId: product.stageId },
      },
    });
  } else {
    const exists = userProducts.some((item) => item.id === product.id);
    setUserProducts(exists
      ? userProducts.map((item) => (item.id === product.id ? product : item))
      : [...userProducts, product]);
    setProductSettings({
      ...productSettings,
      deletedProductIds: productSettings.deletedProductIds.filter((productId) => productId !== product.id),
      deletedProductSnapshots: normalizeDeletedProductSnapshots(productSettings.deletedProductSnapshots).filter((entry) => entry.productId !== product.id),
    });
  }
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  if (snapshot.productDetails) {
    nextDetails.products[product.id] = structuredCloneWorkspaceFieldValue(snapshot.productDetails);
  }
  setWorkspaceDetails(nextDetails);
}

function normalizeWorkspaceFieldHistoryEntry(entry) {
  const action = ["change", "restore", "delete-field"].includes(entry?.action) ? entry.action : "change";
  const fieldId = String(entry?.fieldId ?? "").trim();
  const stageId = String(entry?.stageId ?? "").trim();
  if (!fieldId || !stageId) return null;
  const fieldType = WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(entry?.fieldType) ? entry.fieldType : "SHORT_TEXT";
  return {
    id: String(entry?.id ?? "") || createLocalEntryId("field_history"),
    action,
    productId: String(entry?.productId ?? ""),
    stageId,
    fieldId,
    fieldLabel: String(entry?.fieldLabel ?? "").trim(),
    fieldType,
    tableCell: normalizeWorkspaceHistoryTableCell(entry?.tableCell),
    multiBar: normalizeWorkspaceHistoryMultiBar(entry?.multiBar),
    previousValue: structuredCloneWorkspaceFieldValue(entry?.previousValue),
    nextValue: structuredCloneWorkspaceFieldValue(entry?.nextValue),
    deletedField: entry?.deletedField ? normalizeWorkspaceDeletedFieldSnapshot(entry.deletedField) : null,
    changedByName: String(entry?.changedByName ?? "").trim(),
    changedByEmail: String(entry?.changedByEmail ?? "").trim().toLowerCase(),
    changedByRole: normalizeUserRole(entry?.changedByRole ?? ""),
    timestamp: Number(entry?.timestamp) || Date.now(),
  };
}

function normalizeWorkspaceHistoryMultiBar(multiBar) {
  if (!multiBar || typeof multiBar !== "object") return null;
  const index = Number(multiBar.index);
  if (!Number.isInteger(index) || index < 0) return null;
  return {
    index,
    label: String(multiBar.label ?? "").trim(),
  };
}

function normalizeWorkspaceHistoryTableCell(tableCell) {
  if (!tableCell || typeof tableCell !== "object") return null;
  const rowIndex = Number(tableCell.rowIndex);
  const columnIndex = Number(tableCell.columnIndex);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex) || rowIndex < 0 || columnIndex < 0) return null;
  return {
    rowIndex,
    columnIndex,
    rowLabel: String(tableCell.rowLabel ?? "").trim(),
    columnLabel: String(tableCell.columnLabel ?? "").trim(),
  };
}

function normalizeWorkspaceDeletedFieldSnapshot(snapshot) {
  const stageId = String(snapshot?.stageId ?? "").trim();
  const fieldId = String(snapshot?.fieldId ?? "").trim();
  const fieldDefinition = normalizeWorkspaceFieldDefinition(snapshot?.fieldDefinition);
  if (!stageId || !fieldId || !fieldDefinition) return null;
  const productValues = snapshot?.productValues && typeof snapshot.productValues === "object" ? snapshot.productValues : {};
  return {
    stageId,
    fieldId,
    fieldDefinition,
    productValues: Object.fromEntries(Object.entries(productValues).map(([productId, field]) => {
      const normalizedField = normalizeWorkspaceField(field) ?? createWorkspaceFieldFromTemplate(fieldDefinition);
      return [String(productId), normalizedField];
    })),
  };
}

function getCurrentHistoryUser() {
  const currentUser = getCurrentTeamUser();
  return {
    changedByName: currentUser?.name ?? authSession?.name ?? ADMIN_OWNER_CREDENTIALS.name,
    changedByEmail: currentUser?.email ?? authSession?.email ?? ADMIN_OWNER_CREDENTIALS.email,
    changedByRole: getCurrentUserRole(),
  };
}

function valuesAreEquivalent(firstValue, secondValue) {
  return JSON.stringify(firstValue ?? null) === JSON.stringify(secondValue ?? null);
}

function addWorkspaceFieldHistoryEntry(details, entry) {
  const normalizedEntry = normalizeWorkspaceFieldHistoryEntry({
    id: createLocalEntryId("field_history"),
    timestamp: Date.now(),
    ...getCurrentHistoryUser(),
    ...entry,
  });
  if (!normalizedEntry) return;
  details.fieldHistory = normalizeWorkspaceFieldHistory([normalizedEntry, ...(details.fieldHistory ?? [])]);
}

function recordWorkspaceFieldHistory(details, { productId, stageId, fieldId, previousValue, nextValue, action = "change", tableCell = null, multiBar = null }) {
  if (valuesAreEquivalent(previousValue, nextValue)) return;
  const field = getWorkspaceFieldFromDetails(details, productId, stageId, fieldId) ?? getWorkspaceFieldByIds(productId, stageId, fieldId);
  if (!field) return;
  addWorkspaceFieldHistoryEntry(details, {
    action,
    productId,
    stageId,
    fieldId,
    fieldLabel: field.label,
    fieldType: field.type,
    tableCell,
    multiBar,
    previousValue: structuredCloneWorkspaceFieldValue(previousValue),
    nextValue: structuredCloneWorkspaceFieldValue(nextValue),
  });
}

function recordDeletedWorkspaceFieldHistory(details, stageId, fieldId) {
  const fieldDefinition = getStageFieldTemplates(details, stageId).find((field) => field.fieldId === fieldId);
  if (!fieldDefinition) return;
  const productValues = {};
  for (const [productId, productDetails] of Object.entries(details.products ?? {})) {
    const field = productDetails?.stages?.[stageId]?.customFields?.find((item) => item.fieldId === fieldId);
    if (field) productValues[productId] = structuredCloneWorkspaceFieldValue(field);
  }
  addWorkspaceFieldHistoryEntry(details, {
    action: "delete-field",
    productId: "",
    stageId,
    fieldId,
    fieldLabel: fieldDefinition.label,
    fieldType: fieldDefinition.type,
    previousValue: null,
    nextValue: null,
    deletedField: {
      stageId,
      fieldId,
      fieldDefinition: structuredCloneWorkspaceFieldValue(fieldDefinition),
      productValues,
    },
  });
}

function getWorkspaceFieldHistory(productId, stageId, fieldId) {
  return normalizeWorkspaceFieldHistory(workspaceDetails.fieldHistory)
    .filter((entry) => entry.action !== "delete-field" && entry.productId === productId && entry.stageId === stageId && entry.fieldId === fieldId);
}

function getWorkspaceStageHistory(productId, stageId) {
  return normalizeWorkspaceFieldHistory(workspaceDetails.fieldHistory)
    .filter((entry) => entry.stageId === stageId && (entry.productId === productId || entry.action === "delete-field"));
}

function getDeletedWorkspaceFieldHistory(stageId) {
  return normalizeWorkspaceFieldHistory(workspaceDetails.fieldHistory)
    .filter((entry) => entry.action === "delete-field" && entry.stageId === stageId && entry.deletedField);
}

function getWorkspaceFieldByIds(productId, stageId, fieldId) {
  return getWorkspaceProductDetails(productId)?.stages?.[stageId]?.customFields?.find((field) => field.fieldId === fieldId) ?? null;
}

function getWorkspaceFieldFromDetails(details, productId, stageId, fieldId) {
  return details?.products?.[productId]?.stages?.[stageId]?.customFields?.find((field) => field.fieldId === fieldId) ?? null;
}

function canRestoreWorkspaceFieldHistory(entry) {
  if (!canManageUsers()) return false;
  if (entry.action === "delete-field") {
    return Boolean(entry.deletedField) && !getStageFieldTemplates(workspaceDetails, entry.stageId).some((field) => field.fieldId === entry.fieldId);
  }
  return Boolean(getWorkspaceFieldByIds(entry.productId, entry.stageId, entry.fieldId));
}

function restoreWorkspaceFieldHistoryEntry(entryId) {
  if (!canManageUsers()) return;
  const entry = normalizeWorkspaceFieldHistory(workspaceDetails.fieldHistory).find((item) => item.id === entryId);
  if (!entry || entry.action === "delete-field") return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, entry.productId, entry.stageId, entry.fieldId);
  if (!field) return;
  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  let restoredValue = null;
  if (entry.tableCell && isWorkspaceTableFieldType(field.type)) {
    const rows = getCustomTableRows(field);
    const columns = getCustomTableColumns(field);
    const tableValue = resizeCustomTableValue(field.value, rows.length > 0 ? rows.length : 1, columns.length > 0 ? columns.length : rows.length > 0 ? 0 : 1);
    if (tableValue[entry.tableCell.rowIndex]?.[entry.tableCell.columnIndex] === undefined) return;
    tableValue[entry.tableCell.rowIndex][entry.tableCell.columnIndex] = String(entry.previousValue ?? "");
    field.value = tableValue;
    restoredValue = String(entry.previousValue ?? "");
  } else if (entry.multiBar && ["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(field.type)) {
    const barCount = field.type === "FOUR_SHORT_BARS" ? 4 : 3;
    const nextValues = normalizeMultiShortBarsValue(field.value, barCount);
    if (entry.multiBar.index >= nextValues.length) return;
    nextValues[entry.multiBar.index] = String(entry.previousValue ?? "");
    field.value = nextValues;
    restoredValue = String(entry.previousValue ?? "");
  } else {
    field.value = normalizeWorkspaceFieldValue(field.type, entry.previousValue);
    restoredValue = field.value;
  }
  recordWorkspaceFieldHistory(nextDetails, {
    productId: entry.productId,
    stageId: entry.stageId,
    fieldId: entry.fieldId,
    previousValue: entry.tableCell
      ? getWorkspaceTableHistoryCellValue(previousValue, entry.tableCell)
      : entry.multiBar
        ? getWorkspaceMultiBarHistoryValue(previousValue, entry.multiBar)
        : previousValue,
    nextValue: restoredValue,
    action: "restore",
    tableCell: entry.tableCell,
    multiBar: entry.multiBar,
  });
  setWorkspaceDetails(nextDetails);
}

function getWorkspaceTableHistoryCellValue(value, tableCell) {
  if (!tableCell) return value;
  return resizeCustomTableValue(value, tableCell.rowIndex + 1, tableCell.columnIndex + 1)?.[tableCell.rowIndex]?.[tableCell.columnIndex] ?? "";
}

function getWorkspaceMultiBarHistoryValue(value, multiBar) {
  if (!multiBar) return value;
  return Array.isArray(value) ? String(value[multiBar.index] ?? "") : "";
}

function restoreDeletedWorkspaceFieldHistoryEntry(entryId) {
  if (!canManageUsers()) return;
  const entry = normalizeWorkspaceFieldHistory(workspaceDetails.fieldHistory).find((item) => item.id === entryId);
  const deletedField = entry?.deletedField;
  if (!deletedField) return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  upsertStageFieldTemplate(nextDetails, deletedField.stageId, deletedField.fieldDefinition);
  syncWorkspaceFieldDefinitionToProducts(nextDetails, deletedField.stageId, deletedField.fieldDefinition);
  for (const [productId, savedField] of Object.entries(deletedField.productValues ?? {})) {
    const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, deletedField.stageId);
    const existingIndex = stageDetails.customFields.findIndex((field) => field.fieldId === deletedField.fieldId);
    const restoredField = normalizeWorkspaceField(savedField) ?? createWorkspaceFieldFromTemplate(deletedField.fieldDefinition);
    if (existingIndex >= 0) stageDetails.customFields[existingIndex] = restoredField;
    else stageDetails.customFields.push(restoredField);
  }
  addWorkspaceFieldHistoryEntry(nextDetails, {
    action: "restore",
    productId: "",
    stageId: deletedField.stageId,
    fieldId: deletedField.fieldId,
    fieldLabel: deletedField.fieldDefinition.label,
    fieldType: deletedField.fieldDefinition.type,
    previousValue: null,
    nextValue: deletedField.fieldDefinition,
  });
  setWorkspaceDetails(nextDetails);
  uiState.deletedFieldHistoryModal = null;
}

function summarizeWorkspaceHistoryValue(value, fieldType) {
  if (value === null || value === undefined || value === "") return "Blank";
  if (fieldType === "CUSTOM_DROPDOWN") return String(value || "Blank");
  if (fieldType === "CURRENCY") return `${value?.amount ?? ""} ${value?.currency ?? ""}`.trim() || "Blank";
  if (fieldType === "LINK" || fieldType === "SHEET_EMBED") return value?.url || "Blank";
  if (fieldType === "FILE_UPLOAD") return `${normalizeWorkspaceFileList(value).length} file(s)`;
  if (fieldType === "IMAGE_GALLERY") return `${normalizeImageGalleryValue(value).images.length} image(s)`;
  if (fieldType === "PAYMENT_STATUS") return `${normalizePaymentStatusValue(value).history.length} transaction(s)`;
  if (fieldType === "LISTING_CONTENT") return normalizeListingContentValue(value).status || "Listing content";
  if (fieldType === "CHECKLIST_NOTES") {
    const checklistValue = normalizeChecklistNotesValue(value);
    return checklistValue.notes || `${Object.values(checklistValue.checked).filter(Boolean).length} checked item(s)`;
  }
  if (Array.isArray(value)) return summarizeWorkspaceHistoryArrayValue(value);
  if (typeof value === "object") return JSON.stringify(value).slice(0, 180);
  return String(value).slice(0, 180);
}

function summarizeWorkspaceHistoryArrayValue(value) {
  const filledValues = value
    .flat(Infinity)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return filledValues.join("; ").slice(0, 180) || "Blank";
}

function loadCampaignPrepSettings() {
  if (typeof window === "undefined") return normalizeCampaignPrepSettings();
  const rawSettings = safeGetStorageItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeCampaignPrepSettings();

  try {
    return normalizeCampaignPrepSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeCampaignPrepSettings();
  }
}

function setCampaignPrepSettings(nextSettings) {
  campaignPrepSettings = normalizeCampaignPrepSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY, JSON.stringify(campaignPrepSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist campaign preparation settings locally.", error);
    }
  }
  markRemoteWorkspaceDirtyKey("campaignPrepSettings");
  queueRemoteWorkspaceSync();
}

function normalizeCampaignPrepSettings(settings = {}) {
  const counts = settings?.counts && typeof settings.counts === "object" ? settings.counts : {};
  const normalizedCounts = isLegacyDemoCampaignPrepCounts(counts) ? {} : counts;
  const countsByProductId = settings?.countsByProductId && typeof settings.countsByProductId === "object" ? settings.countsByProductId : {};
  return {
    counts: normalizeCampaignPrepCounts(normalizedCounts),
    countsByProductId: Object.fromEntries(Object.entries(countsByProductId)
      .map(([productId, productCounts]) => [String(productId), normalizeCampaignPrepCounts(productCounts)])
      .filter(([productId]) => productId)),
    sheetButtonText: String(settings?.sheetButtonText ?? DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText).trim() || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText,
    sheetUrl: normalizeCampaignPrepSheetUrl(settings?.sheetUrl),
  };
}

function normalizeCampaignPrepCounts(counts = {}) {
  const sourceCounts = counts && typeof counts === "object" ? counts : {};
  const defaultCounts = DEFAULT_CAMPAIGN_PREP_SETTINGS.counts;
  return {
    total: normalizeCampaignCount(sourceCounts.total, defaultCounts.total),
    sponsoredProducts: normalizeCampaignCount(sourceCounts.sponsoredProducts, defaultCounts.sponsoredProducts),
    sponsoredBrands: normalizeCampaignCount(sourceCounts.sponsoredBrands, defaultCounts.sponsoredBrands),
    sponsoredDisplay: normalizeCampaignCount(sourceCounts.sponsoredDisplay, defaultCounts.sponsoredDisplay),
    keywordTargets: normalizeCampaignCount(sourceCounts.keywordTargets, defaultCounts.keywordTargets),
    productTargeting: normalizeCampaignCount(sourceCounts.productTargeting, defaultCounts.productTargeting),
    videoAds: normalizeCampaignCount(sourceCounts.videoAds, defaultCounts.videoAds),
    autoCampaigns: normalizeCampaignCount(sourceCounts.autoCampaigns, defaultCounts.autoCampaigns),
  };
}

function getCampaignPrepCountsForProduct(productId) {
  const cleanProductId = String(productId ?? "").trim();
  if (!cleanProductId) return normalizeCampaignPrepCounts();
  return normalizeCampaignPrepCounts(campaignPrepSettings.countsByProductId?.[cleanProductId]);
}

function isLegacyDemoCampaignPrepCounts(counts) {
  return Number(counts?.total) === LEGACY_DEMO_CAMPAIGN_PREP_COUNTS.total
    && Number(counts?.sponsoredProducts) === LEGACY_DEMO_CAMPAIGN_PREP_COUNTS.sponsoredProducts
    && Number(counts?.sponsoredBrands) === LEGACY_DEMO_CAMPAIGN_PREP_COUNTS.sponsoredBrands
    && Number(counts?.sponsoredDisplay) === LEGACY_DEMO_CAMPAIGN_PREP_COUNTS.sponsoredDisplay;
}

function normalizeCampaignPrepSheetUrl(value) {
  const sheetUrl = String(value ?? "").trim();
  return sheetUrl === "https://docs.google.com/spreadsheets/" ? "" : sheetUrl;
}

function loadKeywordResearchSettings() {
  if (typeof window === "undefined") return normalizeKeywordResearchSettings();
  const rawSettings = safeGetStorageItem(KEYWORD_RESEARCH_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeKeywordResearchSettings();

  try {
    return normalizeKeywordResearchSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeKeywordResearchSettings();
  }
}

function setKeywordResearchSettings(nextSettings) {
  keywordResearchSettings = normalizeKeywordResearchSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(KEYWORD_RESEARCH_SETTINGS_STORAGE_KEY, JSON.stringify(keywordResearchSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist keyword research settings locally.", error);
    }
  }
  markRemoteWorkspaceDirtyKey("keywordResearchSettings");
  queueRemoteWorkspaceSync();
}

function normalizeKeywordResearchSettings(settings = {}) {
  const columns = normalizeKeywordColumns(settings?.columns);
  const keywordsByProductId = normalizeKeywordRowsByProductId(settings?.keywordsByProductId, columns);
  const keywordSpreadsheetUrlsByProductId = normalizeKeywordSpreadsheetUrlsByProductId(settings?.keywordSpreadsheetUrlsByProductId);
  const legacyRows = Array.isArray(settings?.keywords)
    ? settings.keywords.map((row) => normalizeKeywordRow(row, columns)).filter(Boolean)
    : [];

  return {
    spreadsheetUrl: String(settings?.spreadsheetUrl ?? DEFAULT_KEYWORD_RESEARCH_SETTINGS.spreadsheetUrl).trim(),
    columns,
    keywords: legacyRows,
    keywordsByProductId,
    keywordSpreadsheetUrlsByProductId,
  };
}

function normalizeKeywordSpreadsheetUrlsByProductId(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(source)
    .map(([productId, url]) => [String(productId ?? "").trim(), String(url ?? "").trim()])
    .filter(([productId, url]) => productId && url));
}

function normalizeKeywordRowsByProductId(value, columns = DEFAULT_KEYWORD_TABLE_COLUMNS) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(source)
    .map(([productId, rows]) => [
      String(productId ?? "").trim(),
      Array.isArray(rows) ? rows.map((row) => normalizeKeywordRow(row, columns)).filter(Boolean) : [],
    ])
    .filter(([productId]) => productId));
}

function normalizeKeywordColumns(columns) {
  const normalizedColumns = (Array.isArray(columns) ? columns : DEFAULT_KEYWORD_TABLE_COLUMNS)
    .map((column, index) => normalizeKeywordColumn(column, index))
    .filter(Boolean);
  return normalizedColumns.length ? normalizedColumns : DEFAULT_KEYWORD_TABLE_COLUMNS.map(normalizeKeywordColumn);
}

function normalizeKeywordColumn(column = {}, index = 0) {
  if (!column || typeof column !== "object") return null;
  const fallbackColumn = DEFAULT_KEYWORD_TABLE_COLUMNS[index];
  const key = String(column.key ?? fallbackColumn?.key ?? `custom_${index + 1}`).trim() || `custom_${index + 1}`;
  const label = String(column.label ?? fallbackColumn?.label ?? `Column ${index + 1}`).trim() || `Column ${index + 1}`;
  return { key, label };
}

function createKeywordColumn() {
  const usedKeys = new Set(keywordResearchSettings.columns.map((column) => column.key));
  let index = keywordResearchSettings.columns.length + 1;
  let key = `custom_${index}`;
  while (usedKeys.has(key)) {
    index += 1;
    key = `custom_${index}`;
  }
  return { key, label: `Column ${index}` };
}

function normalizeKeywordRow(row = {}, columns = DEFAULT_KEYWORD_TABLE_COLUMNS) {
  if (!row || typeof row !== "object") return createBlankKeywordRow(columns);
  const normalizedRow = {
    keyword: String(row.keyword ?? ""),
    searchVolume: String(row.searchVolume ?? row.volume ?? ""),
    cpr: String(row.cpr ?? ""),
    sales: String(row.sales ?? row.keywordSales ?? ""),
  };
  for (const column of columns) {
    if (!Object.prototype.hasOwnProperty.call(normalizedRow, column.key)) {
      normalizedRow[column.key] = String(row[column.key] ?? "");
    }
  }
  return normalizedRow;
}

function createBlankKeywordRow(columns = DEFAULT_KEYWORD_TABLE_COLUMNS) {
  return Object.fromEntries(columns.map((column) => [column.key, ""]));
}

function getKeywordRowsForProduct(productId) {
  const cleanProductId = String(productId ?? "").trim();
  if (!cleanProductId) return [];
  const productRows = keywordResearchSettings.keywordsByProductId?.[cleanProductId];
  if (Array.isArray(productRows)) return productRows;
  return [];
}

function getKeywordSpreadsheetUrlForProduct(productId) {
  const cleanProductId = String(productId ?? "").trim();
  if (!cleanProductId) return "";
  return String(keywordResearchSettings.keywordSpreadsheetUrlsByProductId?.[cleanProductId] ?? "").trim();
}

function setKeywordSpreadsheetUrlForProduct(productId, url) {
  const cleanProductId = String(productId ?? "").trim();
  if (!cleanProductId) return;
  const cleanUrl = String(url ?? "").trim();
  const nextUrls = {
    ...keywordResearchSettings.keywordSpreadsheetUrlsByProductId,
  };
  if (cleanUrl) {
    nextUrls[cleanProductId] = cleanUrl;
  } else {
    delete nextUrls[cleanProductId];
  }
  setKeywordResearchSettings({
    ...keywordResearchSettings,
    keywordSpreadsheetUrlsByProductId: nextUrls,
  });
}

function setKeywordRowsForProduct(productId, rows) {
  const cleanProductId = String(productId ?? "").trim();
  if (!cleanProductId) return;
  const normalizedRows = Array.isArray(rows)
    ? rows.map((row) => normalizeKeywordRow(row, keywordResearchSettings.columns)).filter(Boolean)
    : [];
  setKeywordResearchSettings({
    ...keywordResearchSettings,
    keywordsByProductId: {
      ...keywordResearchSettings.keywordsByProductId,
      [cleanProductId]: normalizedRows,
    },
  });
}

function editKeywordCellFromTarget(target) {
  const rowIndex = Number(target.getAttribute("data-option-index"));
  const field = target.getAttribute("data-field-part");
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || !keywordResearchSettings.columns.some((column) => column.key === field)) return;
  uiState.keywordEditingCell = { rowIndex, field };
  uiState.keywordEditingHeader = null;
}

function editKeywordHeaderFromTarget(target) {
  const field = target.getAttribute("data-field-part");
  if (!keywordResearchSettings.columns.some((column) => column.key === field)) return;
  uiState.keywordEditingHeader = field;
  uiState.keywordEditingCell = null;
}

function updateKeywordCellFromInput(input) {
  const rowIndex = Number(input.getAttribute("data-option-index"));
  const field = input.getAttribute("data-field-part");
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || !keywordResearchSettings.columns.some((column) => column.key === field)) return;
  const productId = getSelectedProduct()?.id;
  if (!productId) return;

  const nextRows = getKeywordRowsForProduct(productId).map((row, index) => (
    index === rowIndex ? { ...row, [field]: "value" in input ? input.value : "" } : row
  ));
  setKeywordRowsForProduct(productId, nextRows);
}

function updateKeywordColumnLabelFromInput(input) {
  const field = input.getAttribute("data-field-part");
  if (!keywordResearchSettings.columns.some((column) => column.key === field)) return;
  const nextColumns = keywordResearchSettings.columns.map((column) => (
    column.key === field ? { ...column, label: ("value" in input ? input.value : "").trim() || column.label } : column
  ));
  setKeywordResearchSettings({ ...keywordResearchSettings, columns: nextColumns });
}

function restoreKeywordCellFocus() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const input = document.querySelector('[data-action="update-keyword-cell"], [data-action="update-keyword-column-label"]');
    if (!(input instanceof HTMLInputElement)) return;
    input.focus();
    input.select();
  });
}

function loadLaunchMonitoringSettings() {
  if (typeof window === "undefined") return normalizeLaunchMonitoringSettings();
  const rawSettings = safeGetStorageItem(LAUNCH_MONITORING_STORAGE_KEY);
  if (!rawSettings) return normalizeLaunchMonitoringSettings();

  try {
    return normalizeLaunchMonitoringSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeLaunchMonitoringSettings();
  }
}

function setLaunchMonitoringSettings(nextSettings) {
  launchMonitoringSettings = normalizeLaunchMonitoringSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(LAUNCH_MONITORING_STORAGE_KEY, JSON.stringify(launchMonitoringSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist launch monitoring settings locally.", error);
    }
  }
  markRemoteWorkspaceDirtyKey("launchMonitoringSettings");
  queueRemoteWorkspaceSync();
}

function normalizeLaunchMonitoringSettings(settings = {}) {
  const activeMode = LAUNCH_METRIC_MODES.includes(settings?.activeMode) ? settings.activeMode : DEFAULT_LAUNCH_MONITORING_SETTINGS.activeMode;
  const entries = settings?.entries && typeof settings.entries === "object" ? settings.entries : {};
  return {
    activeMode,
    launchPlan: normalizeLaunchPlan(settings?.launchPlan),
    portfolioButtonText: String(settings?.portfolioButtonText ?? DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioButtonText).trim() || DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioButtonText,
    portfolioUrl: normalizeLaunchPortfolioUrl(settings?.portfolioUrl),
    chartMetrics: normalizeLaunchChartMetrics(settings?.chartMetrics),
    entries: {
      daily: normalizeLaunchMetricEntries(entries.daily, []),
      weekly: normalizeLaunchMetricEntries(entries.weekly, []),
    },
  };
}

function normalizeLaunchPlan(launchPlan = {}) {
  const defaultLaunchPlan = DEFAULT_LAUNCH_MONITORING_SETTINGS.launchPlan;
  const launchDate = normalizeLaunchDateInput(launchPlan?.launchDate ?? defaultLaunchPlan.launchDate);
  const rawLaunchPeriod = launchPlan?.launchPeriod ?? launchPlan?.daysLeft;
  const isLegacyDemoPeriod = !launchDate && Number(rawLaunchPeriod) === 30;
  return {
    launchDate,
    launchPeriod: isLegacyDemoPeriod ? defaultLaunchPlan.launchPeriod : normalizeCampaignCount(rawLaunchPeriod, defaultLaunchPlan.launchPeriod),
  };
}

function normalizeLaunchPortfolioUrl(value) {
  const portfolioUrl = String(value ?? "").trim();
  return portfolioUrl === "https://advertising.amazon.com/" ? "" : portfolioUrl;
}

function normalizeLaunchMetricEntries(entries, fallbackEntries) {
  const sourceEntries = Array.isArray(entries) ? entries : fallbackEntries;
  return sourceEntries
    .map(normalizeLaunchMetricEntry)
    .filter(Boolean)
    .filter((entry) => !LEGACY_DEMO_LAUNCH_ENTRY_IDS.includes(entry.id));
}

function normalizeLaunchMetricEntry(entry) {
  const periodNumber = String(entry?.periodNumber ?? "").trim() || "1";
  return {
    id: String(entry?.id ?? "") || createLocalEntryId("launch_metric"),
    createdAt: normalizeLaunchTimestamp(entry?.createdAt),
    periodNumber,
    impressions: normalizeLaunchNumber(entry?.impressions, 0),
    clicks: normalizeLaunchNumber(entry?.clicks, 0),
    cpc: normalizeLaunchNumber(entry?.cpc, 0),
    cvr: normalizeLaunchNumber(entry?.cvr, 0),
    spend: normalizeLaunchNumber(entry?.spend, 0),
    sales: normalizeLaunchNumber(entry?.sales, 0),
    orders: normalizeLaunchNumber(entry?.orders, 0),
    units: normalizeLaunchNumber(entry?.units, 0),
    acos: normalizeLaunchNumber(entry?.acos, 0),
    totalUnits: normalizeLaunchNumber(entry?.totalUnits, 0),
    totalSales: normalizeLaunchNumber(entry?.totalSales, 0),
    tacos: normalizeLaunchNumber(entry?.tacos, 0),
  };
}

function normalizeLaunchNumber(value, fallbackValue = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackValue;
  return Math.max(0, numericValue);
}

function normalizeLaunchTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function normalizeLaunchChartMetrics(metrics) {
  const sourceMetrics = Array.isArray(metrics) ? metrics : DEFAULT_LAUNCH_MONITORING_SETTINGS.chartMetrics;
  return Array.from({ length: 4 }, (_, index) => {
    const metricKey = String(sourceMetrics[index] ?? "");
    if (metricKey === "") return "";
    return getLaunchChartMetricDefinition(metricKey) ? metricKey : DEFAULT_LAUNCH_MONITORING_SETTINGS.chartMetrics[index] ?? "spend";
  });
}

function loadVineSettings() {
  if (typeof window === "undefined") return normalizeVineSettings();
  const rawSettings = safeGetStorageItem(VINE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeVineSettings();

  try {
    return normalizeVineSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeVineSettings();
  }
}

function setVineSettings(nextSettings) {
  vineSettings = normalizeVineSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(VINE_SETTINGS_STORAGE_KEY, JSON.stringify(vineSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist Vine settings locally.", error);
    }
  }
  markRemoteWorkspaceDirtyKey("vineSettings");
  queueRemoteWorkspaceSync();
}

function normalizeVineSettings(settings = {}) {
  const metrics = settings?.metrics && typeof settings.metrics === "object" ? settings.metrics : {};
  const normalizedMetrics = isLegacyDemoVineMetrics(metrics) ? {} : metrics;
  const metricsByProductId = settings?.metricsByProductId && typeof settings.metricsByProductId === "object" ? settings.metricsByProductId : {};
  const defaultMetrics = DEFAULT_VINE_SETTINGS.metrics;
  const reviews = Array.isArray(settings?.reviews) ? settings.reviews : [];
  const feedback = Array.isArray(settings?.feedback) ? settings.feedback : [];
  const reviewsByProductId = normalizeVineEntriesByProductId(settings?.reviewsByProductId, normalizeVineReview, LEGACY_DEMO_VINE_REVIEW_IDS);
  const feedbackByProductId = normalizeVineEntriesByProductId(settings?.feedbackByProductId, normalizeVineFeedback, LEGACY_DEMO_VINE_FEEDBACK_IDS);
  return {
    metrics: {
      shippedUnits: normalizeCampaignCount(normalizedMetrics.shippedUnits, defaultMetrics.shippedUnits),
      totalUnits: normalizeCampaignCount(normalizedMetrics.totalUnits, defaultMetrics.totalUnits),
      reviewsReceived: normalizeCampaignCount(normalizedMetrics.reviewsReceived, defaultMetrics.reviewsReceived),
      reviewGoal: normalizeCampaignCount(normalizedMetrics.reviewGoal, defaultMetrics.reviewGoal),
      averageRating: normalizeVineRating(normalizedMetrics.averageRating, defaultMetrics.averageRating),
    },
    metricsByProductId: Object.fromEntries(Object.entries(metricsByProductId)
      .map(([productId, productMetrics]) => [String(productId), normalizeVineMetrics(productMetrics)])
      .filter(([productId]) => productId)),
    reviews: reviews.map(normalizeVineReview).filter(Boolean).filter((review) => !LEGACY_DEMO_VINE_REVIEW_IDS.includes(review.id)),
    feedback: feedback.map(normalizeVineFeedback).filter(Boolean).filter((feedbackItem) => !LEGACY_DEMO_VINE_FEEDBACK_IDS.includes(feedbackItem.id)),
    reviewsByProductId,
    feedbackByProductId,
  };
}

function normalizeVineEntriesByProductId(entriesByProductId, normalizeEntry, excludedEntryIds = []) {
  if (!entriesByProductId || typeof entriesByProductId !== "object" || Array.isArray(entriesByProductId)) return {};
  return Object.fromEntries(Object.entries(entriesByProductId)
    .map(([productId, entries]) => [
      String(productId ?? "").trim(),
      (Array.isArray(entries) ? entries : [])
        .map(normalizeEntry)
        .filter(Boolean)
        .filter((entry) => !excludedEntryIds.includes(entry.id)),
    ])
    .filter(([productId]) => productId));
}

function normalizeVineMetrics(metrics = {}) {
  const sourceMetrics = metrics && typeof metrics === "object" ? metrics : {};
  const defaultMetrics = DEFAULT_VINE_SETTINGS.metrics;
  return {
    shippedUnits: normalizeCampaignCount(sourceMetrics.shippedUnits, defaultMetrics.shippedUnits),
    totalUnits: normalizeCampaignCount(sourceMetrics.totalUnits, defaultMetrics.totalUnits),
    reviewsReceived: normalizeCampaignCount(sourceMetrics.reviewsReceived, defaultMetrics.reviewsReceived),
    reviewGoal: normalizeCampaignCount(sourceMetrics.reviewGoal, defaultMetrics.reviewGoal),
    averageRating: normalizeVineRating(sourceMetrics.averageRating, defaultMetrics.averageRating),
  };
}

function getVineMetricsForProduct(productId) {
  const cleanProductId = String(productId ?? "").trim();
  if (!cleanProductId) return normalizeVineMetrics();
  return normalizeVineMetrics(vineSettings.metricsByProductId?.[cleanProductId]);
}

function getVineReviewsForProduct(productId) {
  return getProductScopedVineEntries(vineSettings, "reviewsByProductId", "reviews", productId);
}

function getVineFeedbackForProduct(productId) {
  return getProductScopedVineEntries(vineSettings, "feedbackByProductId", "feedback", productId);
}

function isLegacyDemoVineMetrics(metrics) {
  return Number(metrics?.shippedUnits) === 30
    && Number(metrics?.totalUnits) === 30
    && Number(metrics?.reviewsReceived) === 12
    && Number(metrics?.reviewGoal) === 30
    && Number(metrics?.averageRating) === 4.2;
}

function normalizeVineReview(review) {
  const title = String(review?.title ?? "").trim();
  const body = String(review?.body ?? review?.text ?? "").trim();
  if (!title || !body) return null;
  return {
    id: String(review?.id ?? "") || createLocalEntryId("vine_review"),
    reviewer: String(review?.reviewer ?? "Vine Reviewer").trim() || "Vine Reviewer",
    date: String(review?.date ?? "").trim() || new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    rating: normalizeVineRating(review?.rating, 5),
    title,
    body,
  };
}

function normalizeVineFeedback(feedback) {
  const issue = String(feedback?.issue ?? "").trim();
  const body = String(feedback?.body ?? feedback?.text ?? "").trim();
  if (!issue || !body) return null;
  const status = String(feedback?.status ?? "Pending").trim();
  return {
    id: String(feedback?.id ?? "") || createLocalEntryId("vine_feedback"),
    issue,
    status: ["Pending", "Resolved"].includes(status) ? status : "Pending",
    body,
    loggedAt: String(feedback?.loggedAt ?? "").trim() || new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

function createLocalEntryId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultStageSettings() {
  return {
    order: SIDEBAR_STAGE_TABS.map((stageTab) => stageTab.id),
    labels: {},
    hiddenStageIds: [...DEFAULT_HIDDEN_STAGE_IDS],
    customStages: [],
  };
}

function cloneStageSettings(settings) {
  return {
    order: [...settings.order],
    labels: { ...settings.labels },
    hiddenStageIds: [...settings.hiddenStageIds],
    customStages: [...settings.customStages],
  };
}

function normalizeStageSettings(settings) {
  const customStages = Array.isArray(settings?.customStages)
    ? settings.customStages.map(normalizeCustomStage).filter(Boolean)
    : [];
  const knownStageIds = [...SIDEBAR_STAGE_TABS.map((stageTab) => stageTab.id), ...customStages.map((stageTab) => stageTab.id)];
  const hasExplicitOrder = Array.isArray(settings?.order);
  const incomingOrder = hasExplicitOrder ? settings.order : [];
  const migratedOrder = isLegacySidebarStageOrder(incomingOrder)
    ? [...CANONICAL_SIDEBAR_STAGE_ORDER, ...incomingOrder.filter((stageId) => !CANONICAL_SIDEBAR_STAGE_ORDER.includes(stageId))]
    : incomingOrder;
  const normalizedOrder = hasExplicitOrder
    ? migratedOrder.filter((stageId) => knownStageIds.includes(stageId))
    : [...knownStageIds];
  const incomingLabels = settings?.labels && typeof settings.labels === "object" ? settings.labels : {};
  const labels = Object.fromEntries(
    Object.entries(incomingLabels)
      .filter(([stageId]) => knownStageIds.includes(stageId))
      .map(([stageId, label]) => [stageId, String(label ?? "").trim()])
      .filter(([, label]) => label),
  );

  const incomingHiddenStageIds = Array.isArray(settings?.hiddenStageIds)
    ? settings.hiddenStageIds
    : [];

  return {
    order: normalizedOrder,
    labels,
    hiddenStageIds: Array.from(new Set([...DEFAULT_HIDDEN_STAGE_IDS, ...incomingHiddenStageIds]))
      .filter((stageId) => knownStageIds.includes(stageId)),
    customStages,
  };
}

function isLegacySidebarStageOrder(order) {
  if (!Array.isArray(order)) return false;
  const baseOrder = order.filter((stageId) => LEGACY_SIDEBAR_STAGE_ORDER.includes(stageId));
  return baseOrder.length === LEGACY_SIDEBAR_STAGE_ORDER.length
    && baseOrder.every((stageId, index) => stageId === LEGACY_SIDEBAR_STAGE_ORDER[index]);
}

function normalizeCustomStage(stage) {
  const id = String(stage?.id ?? "").trim();
  const label = String(stage?.label ?? "").trim();
  if (!id || !label) return null;
  return {
    id,
    label,
    panelLabel: String(stage?.panelLabel ?? "").trim() || `${label} Pipeline`,
    icon: String(stage?.icon ?? "").trim() || "add_box",
  };
}

function getBaseStageTabs(settings = stageSettings) {
  return [...SIDEBAR_STAGE_TABS, ...(settings?.customStages ?? [])];
}

function ensureSelectedProductForStage(forceStageReset = false) {
  const selectedProducts = getProductsForSelectedTab(uiState.selectedStageId);
  const selectedProductIsVisible = selectedProducts.some((product) => product.id === uiState.selectedProductId);
  const nextProduct = selectedProductIsVisible ? getProductById(uiState.selectedProductId) : selectedProducts[0];
  const selectedProductChanged = nextProduct?.id !== uiState.selectedProductId;

  uiState.selectedProductId = nextProduct?.id ?? null;
  if (nextProduct && (selectedProductChanged || forceStageReset)) {
    uiState.expandedWorkspaceStageIds = getDefaultExpandedWorkspaceStageIds();
  }
}

function getSelectedProduct() {
  ensureSelectedProductForStage();
  return getProductById(uiState.selectedProductId);
}

function getProductById(productId) {
  return getAllProducts().find((product) => product.id === productId) ?? null;
}

function getWorkspaceStagesForDemoProduct(product) {
  const orderedStages = getOrderedWorkspaceStages();
  const activeStageId = product?.stageId === "optimization" ? "optimization" : product?.stageId;
  const activeStageIndex = orderedStages.findIndex((stage) => stage.stage_id === activeStageId);
  if (activeStageIndex < 0) return orderedStages.slice(0, 1);
  return orderedStages.slice(0, activeStageIndex + 1);
}

function getWorkspaceStageDisplayIndex(stage) {
  const orderedStageIndex = getOrderedWorkspaceStages().findIndex((orderedStage) => orderedStage.stage_id === stage.stage_id);
  return orderedStageIndex >= 0 ? orderedStageIndex + 1 : stage.stage_index;
}

function getVisibleStagesForDemoProduct(product) {
  const activeStageIndex = getDemoProductStageIndex(product);
  return LAUNCHFLOW_STAGES.filter((stage) => stage.stage_index <= activeStageIndex && !isStageHidden(stage.stage_id));
}

function getOrderedWorkspaceStages() {
  return getSidebarStageTabs().map(getWorkspaceStageFromTab).filter(Boolean);
}

function getWorkspaceStageFromTab(stageTab) {
  if (!stageTab?.id) return null;
  if (stageTab.id === "optimization") return { ...OPTIMIZATION_WORKSPACE_STAGE, label: stageTab.label };
  const baseStage = LAUNCHFLOW_STAGES.find((stage) => stage.stage_id === stageTab.id);
  if (baseStage) return { ...baseStage, label: stageTab.label };
  return {
    stage_id: stageTab.id,
    stage_index: MAX_STAGE_INDEX + 1,
    label: stageTab.label,
    phase: "custom",
  };
}

function getDefaultExpandedWorkspaceStageIds() {
  return new Set();
}

function getWorkspaceStageStatus(product, stage) {
  if (stage.stage_id === "optimization") {
    return uiState.selectedStageId === "optimization" ? "Current optimization workspace" : "Visible optimization step";
  }
  if (getCustomWorkspaceStage(stage.stage_id)) {
    return "Current custom stage";
  }
  return stage.stage_id === product.stageId ? "Current product stage" : "Visible previous stage";
}

function getDemoProductStageIndex(product) {
  if (product?.stageId === "optimization") return 12;
  return LAUNCHFLOW_STAGES.find((stage) => stage.stage_id === product?.stageId)?.stage_index ?? 1;
}

function getCustomWorkspaceStage(stageId) {
  if (isStageHidden(stageId)) return null;
  const stageTab = getBaseStageTabs().find((tab) => tab.id === stageId && !SIDEBAR_STAGE_TABS.some((baseTab) => baseTab.id === tab.id));
  if (!stageTab) return null;
  return {
    stage_id: stageTab.id,
    stage_index: MAX_STAGE_INDEX + 1,
    label: stageTab.label,
    phase: "custom",
  };
}

function isStageHidden(stageId) {
  return stageSettings.hiddenStageIds.includes(stageId);
}

function renderAsinValue(product) {
  if (!product.asin) return "N/A";

  return createElement("a", {
    className: "workspace-product-card__asin-link",
    href: getAmazonListingUrl(product.asin),
    target: "_blank",
    rel: "noreferrer",
  }, product.asin);
}

function getAmazonListingUrl(asin) {
  return `https://www.amazon.com/dp/${encodeURIComponent(String(asin).trim())}`;
}

function getChecklistCollapseKey(productId, stageId) {
  return `${productId}:${stageId}`;
}

function getWorkspaceStageFieldControlsKey(productId, stageId) {
  return `${productId}:${stageId}`;
}

function toggleWorkspaceTableStructureControls(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const tableKey = getWorkspaceTableStructureKey(productId, stageId, fieldId);
  const nextEditingWorkspaceTableStructureIds = new Set(uiState.editingWorkspaceTableStructureIds);
  if (nextEditingWorkspaceTableStructureIds.has(tableKey)) {
    nextEditingWorkspaceTableStructureIds.delete(tableKey);
  } else {
    nextEditingWorkspaceTableStructureIds.add(tableKey);
  }
  uiState.editingWorkspaceTableStructureIds = nextEditingWorkspaceTableStructureIds;
}

function toggleWorkspaceFieldControls(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  if (!productId || !stageId) return;

  const controlsKey = getWorkspaceStageFieldControlsKey(productId, stageId);
  const nextEditingWorkspaceStageFieldIds = new Set(uiState.editingWorkspaceStageFieldIds);
  if (nextEditingWorkspaceStageFieldIds.has(controlsKey)) {
    nextEditingWorkspaceStageFieldIds.delete(controlsKey);
  } else {
    nextEditingWorkspaceStageFieldIds.add(controlsKey);
  }
  uiState.editingWorkspaceStageFieldIds = nextEditingWorkspaceStageFieldIds;
}

function toggleWorkspaceChecklistPanel(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  if (!productId || !stageId) return;

  const checklistKey = getChecklistCollapseKey(productId, stageId);
  const nextExpandedChecklistIds = new Set(uiState.expandedChecklistIds);
  if (nextExpandedChecklistIds.has(checklistKey)) {
    nextExpandedChecklistIds.delete(checklistKey);
  } else {
    nextExpandedChecklistIds.add(checklistKey);
  }
  uiState.expandedChecklistIds = nextExpandedChecklistIds;
}

function toggleWorkspaceStage(stageId) {
  const nextExpandedStageIds = new Set(uiState.expandedWorkspaceStageIds);
  if (nextExpandedStageIds.has(stageId)) {
    nextExpandedStageIds.delete(stageId);
  } else {
    nextExpandedStageIds.add(stageId);
  }
  uiState.expandedWorkspaceStageIds = nextExpandedStageIds;
}

function openProductChat(target) {
  const productId = target.getAttribute("data-product-id");
  if (!getProductById(productId)) return;
  uiState.activeChatProductId = productId;
  uiState.chatAssetsOpen = false;
  uiState.chatEmojiOpen = false;
  uiState.chatSearchOpen = false;
  uiState.chatSearchQuery = "";
  uiState.chatAttachmentPreview = null;
  uiState.chatReplyPreview = null;
  uiState.pendingChatAttachments = [];
  uiState.chatUploadingFiles = false;
  uiState.chatSending = false;
  uiState.editingChatMessageId = null;
  uiState.replyingToChatMessageId = null;
  markProductChatRead(productId);
  refreshRemoteWorkspaceState();
}

function closeProductChat() {
  uiState.activeChatProductId = null;
  uiState.chatAssetsOpen = false;
  uiState.chatEmojiOpen = false;
  uiState.chatSearchOpen = false;
  uiState.chatSearchQuery = "";
  uiState.chatAttachmentPreview = null;
  uiState.chatReplyPreview = null;
  uiState.pendingChatAttachments = [];
  uiState.chatUploadingFiles = false;
  uiState.chatSending = false;
  uiState.editingChatMessageId = null;
  uiState.replyingToChatMessageId = null;
}

function handleAppKeyDown(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (
    event.key === "Escape"
    && uiState.cogsCalculatorModal?.templateEditMode
    && !uiState.cogsCalculatorModal.templateSaving
  ) {
    event.preventDefault();
    cancelCogsTemplateEditMode();
    renderFromCurrentStatePreservingScroll();
    return;
  }
  if (
    event.key === "Escape"
    && uiState.cogsCalculatorModal
    && !uiState.cogsCalculatorModal.saving
    && !uiState.cogsCalculatorModal.templateSaving
  ) {
    event.preventDefault();
    if (Number.isInteger(uiState.cogsCalculatorModal.noteCostIndex)) {
      uiState.cogsCalculatorModal.noteCostIndex = null;
      renderCogsCalculatorPreservingScroll();
      return;
    }
    uiState.cogsCalculatorModal = null;
    renderFromCurrentState();
    return;
  }
  if (event.key !== "Enter") return;

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-option-draft") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    if (uiState.fieldModal) uiState.fieldModal.dropdownOptionDraft = target.value;
    addFieldModalDropdownOption();
    renderFromCurrentState();
    return;
  }

  const fieldModalEnterActions = {
    "update-field-modal-table-column-draft": () => addFieldModalListItem("tableColumns", "tableColumnDraft"),
    "update-field-modal-table-row-draft": () => addFieldModalListItem("tableRows", "tableRowDraft"),
    "update-field-modal-checklist-item-draft": () => addFieldModalListItem("checklistItems", "checklistItemDraft"),
  };
  const enterAction = fieldModalEnterActions[target.getAttribute("data-action")];
  if (target instanceof HTMLInputElement && enterAction) {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    enterAction();
    renderFromCurrentState();
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "add-long-bar-token") {
    event.preventDefault();
    if (!canEditProductFieldValues()) return;
    addLongBarTokenFromInput(target);
    renderFromCurrentState();
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-keyword-cell") {
    event.preventDefault();
    if (!canEditProductFieldValues()) return;
    updateKeywordCellFromInput(target);
    uiState.keywordEditingCell = null;
    target.blur();
    renderFromCurrentState();
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-keyword-column-label") {
    event.preventDefault();
    if (!canManageWorkspaceFieldTemplates()) return;
    updateKeywordColumnLabelFromInput(target);
    uiState.keywordEditingHeader = null;
    target.blur();
    renderFromCurrentState();
    return;
  }

  if (!(target instanceof HTMLTextAreaElement) || target.getAttribute("data-action") !== "chat-message-input") return;

  if (event.shiftKey) {
    if (isCurrentChatLineBulleted(target)) {
      event.preventDefault();
      replaceTextAreaSelection(target, "\n• ");
    }
    return;
  }

  event.preventDefault();
  target.closest("form")?.requestSubmit();
}

function isCurrentChatLineBulleted(textarea) {
  const lineStart = textarea.value.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
  return textarea.value.slice(lineStart, textarea.selectionStart).trimStart().startsWith("•");
}

function formatChatComposer(target) {
  const format = target.getAttribute("data-chat-format");
  const composer = document.querySelector('.product-chat-composer__input[data-action="chat-message-input"]');
  if (!(composer instanceof HTMLTextAreaElement)) return;

  const selectedText = composer.value.slice(composer.selectionStart, composer.selectionEnd) || "";
  const formattedText = format === "bold"
    ? toStyledChatText(selectedText || "text", "bold")
    : format === "italic"
      ? toStyledChatText(selectedText || "text", "italic")
      : `${composer.selectionStart === 0 ? "" : "\n"}• ${selectedText}`;
  replaceTextAreaSelection(composer, formattedText);
}

function toStyledChatText(text, style) {
  return Array.from(text).map((character) => styleChatCharacter(character, style)).join("");
}

function styleChatCharacter(character, style) {
  const code = character.codePointAt(0);
  const existingStyle = getChatCharacterStyle(code);
  const targetStyle = getCombinedChatStyle(existingStyle, style);
  const baseCode = getBaseChatCharacterCode(code, existingStyle);

  if (baseCode >= 65 && baseCode <= 90) return String.fromCodePoint(getStyledChatCodePoint(baseCode, targetStyle, "upper"));
  if (baseCode >= 97 && baseCode <= 122) return String.fromCodePoint(getStyledChatCodePoint(baseCode, targetStyle, "lower"));
  if (baseCode >= 48 && baseCode <= 57 && targetStyle === "bold") return String.fromCodePoint(0x1d7ce + (baseCode - 48));
  return character;
}

function getChatCharacterStyle(code) {
  if ((code >= 0x1d400 && code <= 0x1d419) || (code >= 0x1d41a && code <= 0x1d433) || (code >= 0x1d7ce && code <= 0x1d7d7)) return "bold";
  if ((code >= 0x1d434 && code <= 0x1d44d) || (code >= 0x1d44e && code <= 0x1d467)) return "italic";
  if ((code >= 0x1d468 && code <= 0x1d481) || (code >= 0x1d482 && code <= 0x1d49b)) return "bolditalic";
  return "plain";
}

function getCombinedChatStyle(existingStyle, nextStyle) {
  if (existingStyle === "bolditalic") return "bolditalic";
  if ((existingStyle === "bold" && nextStyle === "italic") || (existingStyle === "italic" && nextStyle === "bold")) return "bolditalic";
  return nextStyle;
}

function getBaseChatCharacterCode(code, existingStyle) {
  if (existingStyle === "bold") {
    if (code >= 0x1d400 && code <= 0x1d419) return 65 + code - 0x1d400;
    if (code >= 0x1d41a && code <= 0x1d433) return 97 + code - 0x1d41a;
    if (code >= 0x1d7ce && code <= 0x1d7d7) return 48 + code - 0x1d7ce;
  }
  if (existingStyle === "italic") {
    if (code >= 0x1d434 && code <= 0x1d44d) return 65 + code - 0x1d434;
    if (code >= 0x1d44e && code <= 0x1d467) return 97 + code - 0x1d44e;
  }
  if (existingStyle === "bolditalic") {
    if (code >= 0x1d468 && code <= 0x1d481) return 65 + code - 0x1d468;
    if (code >= 0x1d482 && code <= 0x1d49b) return 97 + code - 0x1d482;
  }
  return code;
}

function getStyledChatCodePoint(baseCode, style, casing) {
  const offset = baseCode - (casing === "upper" ? 65 : 97);
  if (style === "bold") return (casing === "upper" ? 0x1d400 : 0x1d41a) + offset;
  if (style === "italic") return (casing === "upper" ? 0x1d434 : 0x1d44e) + offset;
  if (style === "bolditalic") return (casing === "upper" ? 0x1d468 : 0x1d482) + offset;
  return baseCode;
}

function insertChatEmoji(target) {
  const emoji = target.getAttribute("data-emoji");
  const composer = document.querySelector('.product-chat-composer__input[data-action="chat-message-input"]');
  if (!(composer instanceof HTMLTextAreaElement) || !emoji) return;
  insertIntoTextArea(composer, emoji);
  uiState.chatEmojiOpen = false;
  renderFromCurrentState();
}

function insertIntoTextArea(textarea, text) {
  replaceTextAreaSelection(textarea, `${text}`);
}

function replaceTextAreaSelection(textarea, text) {
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  textarea.value = `${textarea.value.slice(0, selectionStart)}${text}${textarea.value.slice(selectionEnd)}`;
  const nextCursor = selectionStart + text.length;
  textarea.focus();
  textarea.setSelectionRange(nextCursor, nextCursor);
}

function submitProductChatMessage(form) {
  if (!canSendChatMessages()) return;
  const productId = form.getAttribute("data-product-id");
  const formData = new FormData(form);
  const messageText = String(formData.get("chatMessage") ?? "").trim();
  const attachments = [...uiState.pendingChatAttachments];
  if (!productId || uiState.chatUploadingFiles || (!messageText && attachments.length === 0)) return;

  if (uiState.editingChatMessageId) {
    updateProductChatMessage(productId, uiState.editingChatMessageId, messageText);
    uiState.editingChatMessageId = null;
    form.reset();
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
  }

  const currentUser = getCurrentChatUser();
  const replyTo = uiState.replyingToChatMessageId ? createChatReplyPreview(findProductChatMessage(productId, uiState.replyingToChatMessageId)) : null;
  uiState.pendingChatAttachments = [];
  uiState.replyingToChatMessageId = null;
  form.reset();

  appendProductChatMessage(productId, {
    messageId: createChatMessageId(),
    sender: "user",
    senderUserId: currentUser.id,
    senderUserEmail: currentUser.email,
    senderName: currentUser.name,
    senderAvatarUrl: currentUser.avatarUrl,
    text: messageText,
    replyTo,
    createdAt: new Date().toISOString(),
    attachments,
  });

  renderFromCurrentState();
  scrollActiveChatToLatest();
}

function addChatFilesFromInput(input) {
  if (!canSendChatMessages() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const files = Array.from(input.files ?? []);
  if (!productId || files.length === 0) return;

  uiState.chatUploadingFiles = true;
  renderFromCurrentState();
  scrollActiveChatToLatest();

  Promise.all(files.map(readChatAttachmentFile)).then((attachments) => {
    uiState.pendingChatAttachments = [...uiState.pendingChatAttachments, ...attachments];
    uiState.chatUploadingFiles = false;
    input.value = "";
    renderFromCurrentState();
    scrollActiveChatToLatest();
  }).catch((error) => {
    uiState.chatUploadingFiles = false;
    input.value = "";
    reportStorageUploadError(error);
    renderFromCurrentState();
  });
}

function removePendingChatAttachment(target) {
  const attachmentId = target.getAttribute("data-attachment-id");
  uiState.pendingChatAttachments = uiState.pendingChatAttachments.filter((attachment) => attachment.attachmentId !== attachmentId);
}

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
}

function appendProductChatMessage(productId, message) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.chatMessages.push(message);
  setWorkspaceDetails(nextDetails);
  flushRemoteWorkspaceSyncSoon(0);
}

function updateProductChatMessage(productId, messageId, text) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  const message = productDetails.chatMessages.find((item) => item.messageId === messageId);
  if (!message || !isOwnChatMessage(message)) return;
  message.text = text;
  message.editedAt = new Date().toISOString();
  setWorkspaceDetails(nextDetails);
  flushRemoteWorkspaceSyncSoon(0);
}

function deleteProductChatMessage(target) {
  const messageId = target.getAttribute("data-message-id");
  const productId = uiState.activeChatProductId;
  if (!productId || !messageId) return;
  if (uiState.deletingChatMessageIds.has(messageId)) return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  const message = productDetails.chatMessages.find((item) => item.messageId === messageId);
  if (!message || !isOwnChatMessage(message)) return;
  const scrollSnapshot = captureActiveChatScroll();
  uiState.deletingChatMessageIds = new Set([...uiState.deletingChatMessageIds, messageId]);
  renderFromCurrentState();
  restoreActiveChatScroll(scrollSnapshot);

  const scheduleDelete = typeof window === "undefined" ? (callback) => callback() : window.setTimeout.bind(window);
  scheduleDelete(() => {
    const latestDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const latestProductDetails = ensureWorkspaceProductDetails(latestDetails, productId);
    latestProductDetails.chatMessages = latestProductDetails.chatMessages.filter((item) => item.messageId !== messageId);
    setWorkspaceDetails(latestDetails);
    flushRemoteWorkspaceSyncSoon(0);
    uiState.deletingChatMessageIds = new Set([...uiState.deletingChatMessageIds].filter((id) => id !== messageId));
    if (uiState.editingChatMessageId === messageId) uiState.editingChatMessageId = null;
    if (uiState.replyingToChatMessageId === messageId) uiState.replyingToChatMessageId = null;
    renderFromCurrentState();
    restoreActiveChatScroll(scrollSnapshot);
  }, 180);
}

function startReplyToChatMessage(target) {
  const messageId = target.getAttribute("data-message-id");
  const productId = uiState.activeChatProductId;
  if (!productId || !messageId || !findProductChatMessage(productId, messageId)) return;
  uiState.replyingToChatMessageId = messageId;
  uiState.editingChatMessageId = null;
}

function openChatReplyPreview(target) {
  const sourceMessageId = target.getAttribute("data-message-id");
  const productId = uiState.activeChatProductId;
  const sourceMessage = productId && sourceMessageId ? findProductChatMessage(productId, sourceMessageId) : null;
  const replyPreview = normalizeChatReplyPreview(sourceMessage?.replyTo);
  if (!replyPreview) return;
  uiState.chatReplyPreview = replyPreview;
}

function startEditChatMessage(target) {
  const messageId = target.getAttribute("data-message-id");
  const productId = uiState.activeChatProductId;
  const message = productId && messageId ? findProductChatMessage(productId, messageId) : null;
  if (!message || !isOwnChatMessage(message)) return;
  uiState.editingChatMessageId = messageId;
  uiState.replyingToChatMessageId = null;
}

function findProductChatMessage(productId, messageId) {
  if (!productId || !messageId) return null;
  return (getWorkspaceProductDetails(productId).chatMessages ?? []).find((message) => message.messageId === messageId) ?? null;
}

function getCurrentChatUser() {
  const user = getCurrentTeamUser();
  const name = String(user?.name ?? authSession?.name ?? ADMIN_OWNER_CREDENTIALS.name);
  const email = String(user?.email ?? authSession?.email ?? ADMIN_OWNER_CREDENTIALS.email).toLowerCase();
  return {
    id: String(user?.id ?? email),
    email,
    name,
    avatarUrl: getStorageAssetUrl(user) || "",
  };
}

function isOwnChatMessage(message) {
  const currentUser = getCurrentChatUser();
  const senderEmail = String(message?.senderUserEmail ?? "").toLowerCase();
  if (senderEmail) return senderEmail === currentUser.email;
  const senderId = String(message?.senderUserId ?? "");
  if (senderId) return senderId === currentUser.id;
  return message?.sender === "user";
}

function getUnreadProductChatCount(productId) {
  const productDetails = getWorkspaceProductDetails(productId);
  const lastReadAt = getProductChatLastReadAt(productDetails);
  return (productDetails.chatMessages ?? []).filter((message) => !isOwnChatMessage(message) && getChatTimestamp(message.createdAt) > lastReadAt).length;
}

function markProductChatRead(productId) {
  if (!productId) return;
  const currentUserKey = getCurrentChatReadKey();
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.chatReadBy[currentUserKey] = new Date().toISOString();
  setWorkspaceDetails(nextDetails);
  flushRemoteWorkspaceSyncSoon();
}

function getProductChatLastReadAt(productDetails) {
  const currentUserKey = getCurrentChatReadKey();
  return getChatTimestamp(productDetails?.chatReadBy?.[currentUserKey]);
}

function getCurrentChatReadKey() {
  const currentUser = getCurrentChatUser();
  return currentUser.email || currentUser.id || "anonymous";
}

function getChatTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatUnreadChatCount(count) {
  return count > 99 ? "99+" : String(count);
}

function getChatMessageSenderName(message) {
  if (message?.senderName) return String(message.senderName);
  if (isOwnChatMessage(message)) return getCurrentChatUser().name;
  return "Teammate";
}

function getChatMessageSenderAvatar(message) {
  if (message?.senderAvatarUrl) return String(message.senderAvatarUrl);
  if (isOwnChatMessage(message)) return getCurrentChatUser().avatarUrl;
  return "";
}

function createChatReplyPreview(message) {
  if (!message) return null;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return {
    messageId: message.messageId,
    senderName: getChatMessageSenderName(message),
    isOwnMessage: isOwnChatMessage(message),
    text: String(message.text ?? ""),
    createdAt: typeof message.createdAt === "string" ? message.createdAt : "",
    attachmentCount: attachments.length,
  };
}

function normalizeChatReplyPreview(replyTo) {
  if (!replyTo || typeof replyTo !== "object") return null;
  return {
    messageId: String(replyTo.messageId ?? ""),
    senderName: String(replyTo.senderName ?? "Teammate"),
    isOwnMessage: Boolean(replyTo.isOwnMessage),
    text: String(replyTo.text ?? ""),
    createdAt: typeof replyTo.createdAt === "string" ? replyTo.createdAt : "",
    attachmentCount: Math.max(0, Math.round(Number(replyTo.attachmentCount ?? 0)) || 0),
  };
}

function getChatReplySummary(replyTo) {
  const preview = normalizeChatReplyPreview(replyTo);
  if (!preview) return "Message";
  const text = preview.text.replace(/\s+/g, " ").trim();
  if (text) return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  if (preview.attachmentCount) return `${preview.attachmentCount} attachment${preview.attachmentCount === 1 ? "" : "s"}`;
  return "Message";
}

function getChatReplyTargetLabel(replyTo) {
  const preview = normalizeChatReplyPreview(replyTo);
  if (!preview) return "message";
  return preview.isOwnMessage || preview.senderName === getCurrentChatUser().name ? "your message" : `${preview.senderName}'s message`;
}

function focusChatComposer() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const composer = document.querySelector('.product-chat-composer__input[data-action="chat-message-input"]');
    if (composer instanceof HTMLTextAreaElement) {
      composer.focus();
      composer.setSelectionRange(composer.value.length, composer.value.length);
    }
  });
}

function scrollActiveChatToLatest() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const messages = document.querySelector(".product-chat__messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  });
}

function captureActiveChatScroll() {
  if (typeof window === "undefined") return null;
  const messages = document.querySelector(".product-chat__messages");
  if (!messages) return null;
  return {
    scrollTop: messages.scrollTop,
    scrollHeight: messages.scrollHeight,
  };
}

function restoreActiveChatScroll(snapshot) {
  if (typeof window === "undefined" || !snapshot) return;
  window.requestAnimationFrame(() => {
    const messages = document.querySelector(".product-chat__messages");
    if (!messages) return;
    const heightDelta = messages.scrollHeight - snapshot.scrollHeight;
    messages.scrollTop = Math.max(0, snapshot.scrollTop + heightDelta);
  });
}

function getProductChatAssets(messages) {
  return messages.flatMap((message) => {
    const links = extractLinksFromText(message.text).map((url) => ({ kind: "link", url, createdAt: message.createdAt }));
    const attachments = (message.attachments ?? []).map((attachment) => ({ kind: "attachment", createdAt: message.createdAt, ...attachment }));
    return [...links, ...attachments];
  });
}

function getFilteredChatMessages(messages, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return messages;
  return messages.filter((message) => chatMessageMatchesSearch(message, normalizedQuery));
}

function chatMessageMatchesSearch(message, normalizedQuery) {
  const searchableParts = [
    message.text,
    message.senderName,
    message.senderUserEmail,
    message.replyTo?.text,
    message.replyTo?.senderName,
    ...(message.attachments ?? []).flatMap((attachment) => [attachment.name, attachment.type]),
    ...extractLinksFromText(message.text),
  ];
  return searchableParts.some((part) => normalizeSearchText(part).includes(normalizedQuery));
}

function getFilteredChatAssets(assets, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return assets;
  return assets.filter((asset) => chatAssetMatchesSearch(asset, normalizedQuery));
}

function chatAssetMatchesSearch(asset, normalizedQuery) {
  return [asset.url, asset.name, asset.type, asset.kind].some((part) => normalizeSearchText(part).includes(normalizedQuery));
}

function groupProductChatAssets(assets) {
  return assets.reduce((groups, asset) => {
    if (asset.kind === "link") {
      groups.links.push(asset);
    } else if (asset.type?.startsWith("image/")) {
      groups.images.push(asset);
    } else if (asset.type?.startsWith("video/")) {
      groups.videos.push(asset);
    } else {
      groups.files.push(asset);
    }
    return groups;
  }, { images: [], videos: [], files: [], links: [] });
}

function extractLinksFromText(text) {
  const matches = String(text ?? "").match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/gi) ?? [];
  return matches.map(normalizeChatUrl);
}

function formatChatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Today";
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function formatChatTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Now";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatFileSize(size) {
  const numericSize = Number(size);
  if (!Number.isFinite(numericSize) || numericSize <= 0) return "0 KB";
  if (numericSize < 1024 * 1024) return `${Math.ceil(numericSize / 1024)} KB`;
  return `${(numericSize / (1024 * 1024)).toFixed(1)} MB`;
}

function createChatMessageId() {
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createChatAttachmentId() {
  return `chat_file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function updateProductImageFromInput(input) {
  if (!canMutateProductsNow() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file) return;
  validateProductImageFile(file);

  setSharedWorkspaceSaveStatus("saving", "Saving shared workspace...");
  renderFromCurrentState();
  const imageUpload = await uploadProductImageMetadata(file, productId);
  saveProductImageIfPresent(productId, imageUpload);
  await saveSharedWorkspaceNow("product-image-save", { requireProductIds: [productId] });
  renderFromCurrentState();
}

async function deleteProductImageFromButton(target) {
  if (!canMutateProductsNow()) return;
  const productId = target.getAttribute("data-product-id");
  if (!productId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
  setWorkspaceDetails(nextDetails);
  await saveSharedWorkspaceNow("product-image-delete");
  renderFromCurrentState();
}

function copyProductSkuFromButton(target) {
  const product = getProductById(target.getAttribute("data-product-id"));
  const sku = product?.sku || "N/A";
  if (!product) return;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(sku).catch(() => {});
  }

  showSkuCopiedIndicator(product.id);
}

function showSkuCopiedIndicator(productId) {
  uiState.copiedSkuProductId = productId;
  if (uiState.skuCopyTimeoutId) {
    window.clearTimeout(uiState.skuCopyTimeoutId);
  }
  renderFromCurrentState();
  uiState.skuCopyTimeoutId = window.setTimeout(() => {
    uiState.copiedSkuProductId = null;
    uiState.skuCopyTimeoutId = null;
    renderFromCurrentState();
  }, 1400);
}

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const productId = target.getAttribute("data-product-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const product = productId ? getProductById(productId) : null;
  const exportData = product ? buildWorkspaceStageExportData(product, selectedTab) : buildStageTabExportData(selectedTab);
  const filename = createExportFileName(product ? `${product.name}-${selectedTab.label}` : selectedTab.label, format);

  if (format === "csv") {
    downloadBlob(filename, buildCsvExport(exportData), "text/csv;charset=utf-8");
    return;
  }

  if (format === "xls") {
    downloadBlob(filename, buildHtmlTableExport(exportData), "application/vnd.ms-excel;charset=utf-8");
    return;
  }

  if (format === "doc") {
    downloadBlob(filename, buildDocumentExport(exportData), "application/msword;charset=utf-8");
    return;
  }

  if (format === "pdf") {
    openPrintableExport(exportData);
  }
}

function buildWorkspaceStageExportData(product, selectedTab) {
  const stageDetails = getWorkspaceStageDetails(product.id, selectedTab.id);
  const fields = (stageDetails.customFields ?? []).map(normalizeWorkspaceField).filter(Boolean);
  return {
    title: `${product.name} - ${selectedTab.label} Export`,
    tab: selectedTab,
    exportedAt: new Date().toISOString(),
    columns: ["Product Name", "SKU", "ASIN", "Stage", "Field", "Type", "Value"],
    rows: fields.map((field) => [
      product.name,
      product.sku || "",
      product.asin || "",
      selectedTab.label,
      field.label,
      getWorkspaceFieldTypeLabel(field.type),
      stringifyExportFieldValue(field.value, field.type),
    ]),
  };
}

function buildStageTabExportData(selectedTab) {
  const products = getProductsForSelectedTab(selectedTab.id);
  const fieldColumns = getExportFieldColumns(selectedTab.id, products);
  const rows = products.map((product) => buildStageTabExportRow(product, selectedTab.id, fieldColumns));
  return {
    title: `${selectedTab.label} Export`,
    tab: selectedTab,
    exportedAt: new Date().toISOString(),
    columns: ["Product Name", "SKU", "ASIN", "Stage", "Readiness", ...fieldColumns.map((field) => field.label)],
    rows,
  };
}

function getExportFieldColumns(stageId, products) {
  const fieldsById = new Map();
  for (const template of getStageFieldTemplates(workspaceDetails, stageId)) {
    const field = normalizeWorkspaceFieldDefinition(template);
    if (field) fieldsById.set(field.fieldId, { fieldId: field.fieldId, label: field.label, type: field.type });
  }

  for (const product of products) {
    const stageDetails = getWorkspaceStageDetails(product.id, stageId);
    for (const field of stageDetails.customFields ?? []) {
      const normalizedField = normalizeWorkspaceField(field);
      if (normalizedField && !fieldsById.has(normalizedField.fieldId)) {
        fieldsById.set(normalizedField.fieldId, { fieldId: normalizedField.fieldId, label: normalizedField.label, type: normalizedField.type });
      }
    }
  }

  return Array.from(fieldsById.values());
}

function buildStageTabExportRow(product, stageId, fieldColumns) {
  const stageDetails = getWorkspaceStageDetails(product.id, stageId);
  const fieldsById = new Map((stageDetails.customFields ?? []).map((field) => [field.fieldId, field]));
  return [
    product.name,
    product.sku || "",
    product.asin || "",
    getActivityStageLabel(product.stageId),
    `${calculateProductChecklistReadiness(product)}%`,
    ...fieldColumns.map((column) => stringifyExportFieldValue(fieldsById.get(column.fieldId)?.value, column.type)),
  ];
}

function stringifyExportFieldValue(value, type = "") {
  if (value === null || value === undefined || value === "") return "";
  if (type === "LINK") {
    const link = normalizeWorkspaceLinkValue(value);
    return [link.label, link.url].filter(Boolean).join(" - ");
  }
  if (type === "SHEET_EMBED") {
    const sheet = normalizeSpreadsheetEmbedValue(value);
    return [getSpreadsheetProviderLabel(sheet.provider), sheet.url].filter(Boolean).join(" - ");
  }
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Item Highlight: ${listing.itemHighlight}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (isWorkspaceTableFieldType(type)) return formatExportTableValue(value);
  if (type === "CHECKLIST_NOTES") {
    const notes = normalizeChecklistNotesValue(value);
    return [`Checked: ${Object.keys(notes.checked ?? {}).filter((key) => notes.checked[key]).join(", ")}`, `Notes: ${notes.notes}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (Array.isArray(value)) return value.map((item) => stringifyExportFieldValue(item)).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${stringifyExportFieldValue(item)}`).join("; ");
  return String(value);
}


function formatExportCurrencyValue(value) {
  const amount = Number(value?.amount ?? value);
  const currency = typeof value?.currency === "string" && value.currency ? value.currency.toUpperCase() : "USD";
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatExportFile(file) {
  return [file.name, getStorageAssetUrl(file)].filter(Boolean).join(" - ");
}

function formatExportPaymentValue(value) {
  const payment = normalizePaymentStatusValue(value);
  const totals = calculatePaymentTotals(payment);
  return [
    `Title: ${payment.paymentTitle}`,
    `Total: ${formatCurrency(totals.totalCost)}`,
    `Paid: ${formatCurrency(totals.paidAmount)}`,
    `Balance: ${formatCurrency(totals.balanceAmount)}`,
    `Invoice: ${payment.invoiceNumber}`,
    `Invoice Title: ${payment.invoiceTitle}`,
    `Invoice Link: ${payment.invoiceLink}`,
    `Files: ${payment.files.map(formatExportFile).join("; ")}`,
  ].filter((item) => !item.endsWith(": ")).join("; ");
}

function formatExportTableValue(value) {
  if (!Array.isArray(value)) return "";
  return value.map((row) => Array.isArray(row) ? row.join(" | ") : stringifyExportFieldValue(row)).filter(Boolean).join(" / ");
}

function buildCsvExport(exportData) {
  return [exportData.columns, ...exportData.rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildHtmlTableExport(exportData) {
  const headerCells = exportData.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const bodyRows = exportData.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(exportData.title)}</title></head><body><h1>${escapeHtml(exportData.title)}</h1><p>Exported ${escapeHtml(formatExportDate(exportData.exportedAt))}</p><table border="1"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
}

function buildDocumentExport(exportData) {
  return buildHtmlTableExport(exportData);
}

function openPrintableExport(exportData) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    downloadBlob(createExportFileName(exportData.tab.label, "html"), buildHtmlTableExport(exportData), "text/html;charset=utf-8");
    return;
  }
  printWindow.document.write(buildHtmlTableExport(exportData));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function createExportFileName(label, format) {
  const extension = format === "doc" ? "doc" : format === "xls" ? "xls" : format === "pdf" ? "html" : format;
  return `${createStorageSafeFileName(label).toLowerCase()}-launchflow-export.${extension}`;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(downloadUrl);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
}

function formatExportDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleString();
}

function exportProductDataFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const product = getProductById(productId);
  if (!product) return;

  const exportData = buildWorkspaceProductExportData(product);
  const filename = createExportFileName(`${product.name}-all-stages`, "csv");
  downloadBlob(filename, buildCsvExport(exportData), "text/csv;charset=utf-8");
}

function buildWorkspaceProductExportData(product) {
  const visibleStages = getWorkspaceStagesForDemoProduct(product);
  const rows = visibleStages.flatMap((stage) => {
    const stageDetails = getWorkspaceStageDetails(product.id, stage.stage_id);
    const fields = (stageDetails.customFields ?? []).map(normalizeWorkspaceField).filter(Boolean);
    const fieldRows = fields.map((field) => [
      product.name,
      product.sku || "",
      product.asin || "",
      stage.label,
      "Custom Field",
      field.label,
      getWorkspaceFieldTypeLabel(field.type),
      stringifyExportFieldValue(field.value, field.type),
    ]);
    const checklistRows = (stageDetails.checklistTasks ?? []).map((task) => [
      product.name,
      product.sku || "",
      product.asin || "",
      stage.label,
      "Checklist Task",
      task.taskName || "",
      task.isCompleted ? "Completed" : "In Progress",
      task.note || "",
    ]);
    return [...fieldRows, ...checklistRows];
  });

  return {
    title: `${product.name} - All Stages Export`,
    tab: { label: `${product.name} All Stages` },
    exportedAt: new Date().toISOString(),
    columns: ["Product Name", "SKU", "ASIN", "Stage", "Item Type", "Label", "Type / Status", "Value / Note"],
    rows,
  };
}

function getWorkspaceProductDetails(productId) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  return ensureWorkspaceProductDetails(nextDetails, productId);
}

function ensureWorkspaceProductDetails(details, productId) {
  details.products[productId] ??= { imageDataUrl: "", imageStoragePath: "", imageUrl: "", stages: {}, chatReadBy: {}, chatMessages: [] };
  details.products[productId].imageDataUrl = "";
  details.products[productId].imageStoragePath ??= "";
  details.products[productId].imageUrl ??= "";
  details.products[productId].stages ??= {};
  details.products[productId].chatReadBy ??= {};
  details.products[productId].chatMessages ??= [];
  return details.products[productId];
}

function getProductSellingPrice(product) {
  return getProductFinancials(product).sellingPrice;
}

function getProductCogs(product) {
  return getProductFinancials(product).cogs;
}

function getProductProfit(product) {
  const financials = getProductFinancials(product);
  return Number((financials.sellingPrice - financials.cogs).toFixed(2));
}

function getProductMargin(product) {
  const financials = getProductFinancials(product);
  if (financials.sellingPrice <= 0) return 0;
  return Math.round(((financials.sellingPrice - financials.cogs) / financials.sellingPrice) * 100);
}

function getProductFinancials(product) {
  const isUserCreatedProduct = isUserProduct(product.id);
  const fallbackSellingPrice = isUserCreatedProduct ? 0 : 24.99 + getDemoProductStageIndex(product);
  const fallbackCogs = isUserCreatedProduct ? 0 : Number((fallbackSellingPrice * 0.42).toFixed(2));
  const productDetails = getWorkspaceProductDetails(product.id);
  return normalizeProductFinancials(productDetails.financials, { sellingPrice: fallbackSellingPrice, cogs: fallbackCogs });
}

function normalizeProductFinancials(financials = {}, fallbackFinancials = { sellingPrice: 0, cogs: 0 }) {
  const cogsBatches = normalizeCogsBatches(financials?.cogsBatches);
  const latestBatch = getLatestCogsBatch(cogsBatches);
  const legacyCogsValue = Number(financials?.legacyCogs);
  const hasLegacyCogs = financials?.legacyCogs !== "" && financials?.legacyCogs !== null
    && financials?.legacyCogs !== undefined && Number.isFinite(legacyCogsValue) && legacyCogsValue >= 0;
  return {
    sellingPrice: normalizeProductFinancialNumber(financials?.sellingPrice, fallbackFinancials.sellingPrice),
    cogs: latestBatch
      ? normalizeProductFinancialNumber(latestBatch.totalCogsPerUnit, fallbackFinancials.cogs, 6)
      : normalizeProductFinancialNumber(financials?.cogs, fallbackFinancials.cogs, 6),
    cogsBatches,
    ...(hasLegacyCogs ? { legacyCogs: normalizeProductFinancialNumber(legacyCogsValue, 0, 6) } : {}),
  };
}

function normalizeProductFinancialNumber(value, fallbackValue = 0, precision = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return Number(fallbackValue) || 0;
  return Math.max(0, Number(numericValue.toFixed(precision)));
}

function updateProductFinancialFromInput(input) {
  if (!canEditProductFieldValues()) return;
  const productId = input.getAttribute("data-product-id");
  const metricKey = input.getAttribute("data-product-financial-metric");
  if (!productId || metricKey !== "sellingPrice") return;
  const product = getProductById(productId);
  if (!product) return;

  const currentFinancials = getProductFinancials(product);
  const nextFinancials = {
    ...currentFinancials,
    [metricKey]: normalizeProductFinancialNumber(input.value, currentFinancials[metricKey]),
  };

  setProductFinancials(productId, nextFinancials);
}

function updateProductFinancialPreview(input) {
  const productId = input.getAttribute("data-product-id");
  const product = getProductById(productId);
  const metricsContainer = input.closest(".workspace-product-card__metrics");
  if (!product || !(metricsContainer instanceof Element)) return;

  const profitOutput = metricsContainer.querySelector('[data-product-financial-output="profit"]');
  const marginOutput = metricsContainer.querySelector('[data-product-financial-output="margin"]');
  if (profitOutput) profitOutput.textContent = formatCurrency(getProductProfit(product));
  if (marginOutput) marginOutput.textContent = `${getProductMargin(product)}%`;
}

function formatCurrency(value) {
  return `$${Number(value).toFixed(2)}`;
}

function getProductBsrTarget(product) {
  return product.stageId === "product-research" ? "< 5,000" : "< 10,000";
}

function openWorkspaceFieldModal(target, mode) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  if (!productId || !stageId) return;

  const fieldId = mode === "edit" ? target.getAttribute("data-field-id") : null;
  const field = fieldId ? getWorkspaceStageDetails(productId, stageId).customFields.find((item) => item.fieldId === fieldId) : null;

  uiState.fieldModal = {
    mode,
    productId,
    stageId,
    fieldId,
    fieldLabel: field?.label ?? "",
    headerSubtext: field?.type === "HEADER_TITLE" ? field.headerSubtext ?? "" : "",
    selectedType: field?.type ?? WORKSPACE_CUSTOM_FIELD_TYPES[0].value,
    dropdownOptions: getCustomDropdownOptions(field),
    dropdownOptionDraft: "",
    tableColumns: getCustomTableColumns(field),
    tableRows: getCustomTableRows(field),
    tableColumnWidths: getCustomTableColumnWidths(field),
    tableRowHeights: getCustomTableRowHeights(field),
    tableColumnDraft: "",
    tableRowDraft: "",
    checklistItems: getChecklistNotesItems(field),
    checklistItemDraft: "",
    linkButtonText: field?.type === "LINK" ? normalizeWorkspaceLinkValue(field.value, field.label).label : "",
    linkUrl: field?.type === "LINK" ? normalizeWorkspaceLinkValue(field.value, field.label).url : "",
    sheetUrl: field?.type === "SHEET_EMBED" ? normalizeSpreadsheetEmbedValue(field.value).url : "",
    galleryFormat: field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format || IMAGE_GALLERY_FORMATS[0]?.value || "" : IMAGE_GALLERY_FORMATS[0]?.value || "",
    barLabels: ["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(field?.type) ? normalizeMultiShortBarLabels(field.barLabels, field.type === "FOUR_SHORT_BARS" ? 4 : 3) : [],
  };
}

function deleteWorkspaceFieldFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  recordDeletedWorkspaceFieldHistory(nextDetails, stageId, fieldId);
  removeStageFieldTemplate(nextDetails, stageId, fieldId);
  removeWorkspaceFieldFromProducts(nextDetails, stageId, fieldId);
  setWorkspaceDetails(nextDetails);

  if (uiState.fieldModal?.fieldId === fieldId) {
    uiState.fieldModal = null;
  }
}

function submitWorkspaceChecklistForm(form) {
  if (!canManageChecklistTasks()) return;
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const taskName = String(formData.get("taskName") ?? "").trim();
  if (!productId || !stageId || !taskName) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  stageDetails.checklistTasks.push({
    taskId: createWorkspaceChecklistId(),
    name: taskName,
    isCompleted: false,
    completedAt: null,
    note: "",
  });
  setWorkspaceDetails(nextDetails);
  recordActivity({
    icon: "playlist_add_check",
    label: `Added checklist task: ${taskName}`,
    detail: `${getActivityProductName(productId)} • ${getActivityStageLabel(stageId)}`,
    stageId,
    productId,
  });
  form.reset();
  renderFromCurrentState();
}

function toggleWorkspaceChecklistTask(input) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const checklistId = input.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const task = getWorkspaceChecklistTask(nextDetails, productId, stageId, checklistId);
  if (!task) return;

  task.isCompleted = Boolean(input.checked);
  task.completedAt = task.isCompleted ? new Date().toISOString() : null;
  setWorkspaceDetails(nextDetails);
  recordActivity({
    icon: "checklist",
    label: `${task.isCompleted ? "Completed" : "Reopened"} checklist task`,
    detail: `${getActivityProductName(productId)} • ${getActivityStageLabel(stageId)}`,
    stageId,
    productId,
  });
  renderFromCurrentState();
}

function toggleWorkspaceChecklistCompletedVisibility(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  if (!productId || !stageId) return;

  const checklistKey = getChecklistCollapseKey(productId, stageId);
  const nextHiddenCompletedChecklistIds = new Set(uiState.hiddenCompletedChecklistIds);
  if (nextHiddenCompletedChecklistIds.has(checklistKey)) {
    nextHiddenCompletedChecklistIds.delete(checklistKey);
  } else {
    nextHiddenCompletedChecklistIds.add(checklistKey);
  }
  uiState.hiddenCompletedChecklistIds = nextHiddenCompletedChecklistIds;
}

function editWorkspaceChecklistTaskFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const checklistId = target.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;

  const currentTask = getWorkspaceChecklistTask(workspaceDetails, productId, stageId, checklistId);
  if (!currentTask) return;

  const nextName = window.prompt("Edit checklist task", currentTask.name);
  if (nextName === null) return;
  const trimmedName = nextName.trim();
  if (!trimmedName) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const task = getWorkspaceChecklistTask(nextDetails, productId, stageId, checklistId);
  if (!task) return;
  task.name = trimmedName;
  setWorkspaceDetails(nextDetails);
}

function deleteWorkspaceChecklistTaskFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const checklistId = target.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;

  const currentTask = getWorkspaceChecklistTask(workspaceDetails, productId, stageId, checklistId);
  if (!currentTask || !window.confirm(`Delete checklist task "${currentTask.name}"?`)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  stageDetails.checklistTasks = stageDetails.checklistTasks.filter((task) => task.taskId !== checklistId);
  setWorkspaceDetails(nextDetails);
}

function reorderWorkspaceChecklistTask(draggedTask, dropChecklistId) {
  if (!draggedTask || !dropChecklistId || draggedTask.checklistId === dropChecklistId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, draggedTask.productId, draggedTask.stageId);
  const draggedIndex = stageDetails.checklistTasks.findIndex((task) => task.taskId === draggedTask.checklistId);
  const dropIndex = stageDetails.checklistTasks.findIndex((task) => task.taskId === dropChecklistId);
  if (draggedIndex < 0 || dropIndex < 0) return;

  const [draggedItem] = stageDetails.checklistTasks.splice(draggedIndex, 1);
  stageDetails.checklistTasks.splice(dropIndex, 0, draggedItem);
  setWorkspaceDetails(nextDetails);
}

function openChecklistNoteModal(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const checklistId = target.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;
  uiState.checklistNoteModal = { productId, stageId, checklistId };
}

function submitChecklistNoteForm(form) {
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const checklistId = form.getAttribute("data-checklist-id");
  const formData = new FormData(form);
  const note = String(formData.get("taskNote") ?? "").trim();
  if (!productId || !stageId || !checklistId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const task = getWorkspaceChecklistTask(nextDetails, productId, stageId, checklistId);
  if (!task) return;

  task.note = note;
  setWorkspaceDetails(nextDetails);
  uiState.checklistNoteModal = null;
  renderFromCurrentState();
}

function getWorkspaceChecklistTask(details, productId, stageId, checklistId) {
  const stageDetails = ensureWorkspaceStageDetails(details, productId, stageId);
  return stageDetails.checklistTasks.find((task) => task.taskId === checklistId) ?? null;
}

function formatCompletionDate(completedAt) {
  if (!completedAt) return "just now";

  const completedDate = new Date(completedAt);
  if (Number.isNaN(completedDate.getTime())) return "just now";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfCompletedDate = new Date(completedDate);
  startOfCompletedDate.setHours(0, 0, 0, 0);

  const daysSinceCompletion = Math.max(0, Math.round((startOfToday - startOfCompletedDate) / 86_400_000));
  if (daysSinceCompletion === 0) return "today";
  if (daysSinceCompletion === 1) return "yesterday";
  if (daysSinceCompletion < 7) return `${daysSinceCompletion} days ago`;

  return completedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function updateFieldModalType(select) {
  if (!uiState.fieldModal) return;
  uiState.fieldModal.selectedType = String(select.value ?? "");
  if (uiState.fieldModal.selectedType === "IMAGE_GALLERY" && !getImageGalleryFormat(uiState.fieldModal.galleryFormat)) {
    uiState.fieldModal.galleryFormat = IMAGE_GALLERY_FORMATS[0]?.value || "";
  }
  if (uiState.fieldModal.selectedType !== "CUSTOM_DROPDOWN") uiState.fieldModal.dropdownOptionDraft = "";
  if (!isWorkspaceTableFieldType(uiState.fieldModal.selectedType)) {
    uiState.fieldModal.tableColumnDraft = "";
    uiState.fieldModal.tableRowDraft = "";
    uiState.fieldModal.tableColumnWidths = [];
    uiState.fieldModal.tableRowHeights = [];
  }
  if (uiState.fieldModal.selectedType !== "CHECKLIST_NOTES") uiState.fieldModal.checklistItemDraft = "";
  if (uiState.fieldModal.selectedType !== "LINK") {
    uiState.fieldModal.linkButtonText = "";
    uiState.fieldModal.linkUrl = "";
  }
  if (uiState.fieldModal.selectedType !== "SHEET_EMBED") uiState.fieldModal.sheetUrl = "";
  if (!["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(uiState.fieldModal.selectedType)) {
    uiState.fieldModal.barLabels = [];
  } else {
    uiState.fieldModal.barLabels = normalizeMultiShortBarLabels(uiState.fieldModal.barLabels, uiState.fieldModal.selectedType === "FOUR_SHORT_BARS" ? 4 : 3);
  }
}

function addFieldModalDropdownOption() {
  if (!uiState.fieldModal) return;
  const option = String(uiState.fieldModal.dropdownOptionDraft ?? "").trim();
  if (!option) return;
  const options = getFieldModalDropdownOptions();
  if (!options.includes(option)) options.push(option);
  uiState.fieldModal.dropdownOptions = options;
  uiState.fieldModal.dropdownOptionDraft = "";
}

function removeFieldModalDropdownOption(button) {
  if (!uiState.fieldModal) return;
  const optionIndex = Number(button.getAttribute("data-dropdown-option-index"));
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return;
  uiState.fieldModal.dropdownOptions = getFieldModalDropdownOptions().filter((_, index) => index !== optionIndex);
}

function getFieldModalDropdownOptions(field = null) {
  if (uiState.fieldModal?.dropdownOptions) return normalizeDropdownOptions(uiState.fieldModal.dropdownOptions);
  return getCustomDropdownOptions(field);
}

function addFieldModalListItem(listKey, draftKey) {
  if (!uiState.fieldModal) return;
  const item = String(uiState.fieldModal[draftKey] ?? "").trim();
  if (!item) return;
  const items = normalizeFieldList(uiState.fieldModal[listKey]);
  if (!items.includes(item)) items.push(item);
  uiState.fieldModal[listKey] = items;
  uiState.fieldModal[draftKey] = "";
}

function removeFieldModalListItem(listKey, button) {
  if (!uiState.fieldModal) return;
  const optionIndex = Number(button.getAttribute("data-option-index"));
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return;
  uiState.fieldModal[listKey] = normalizeFieldList(uiState.fieldModal[listKey]).filter((_, index) => index !== optionIndex);
}

function getFieldModalTableColumns(field = null) {
  if (uiState.fieldModal?.tableColumns) return normalizeFieldList(uiState.fieldModal.tableColumns);
  return getCustomTableColumns(field);
}

function getFieldModalTableRows(field = null) {
  if (uiState.fieldModal?.tableRows) return normalizeFieldList(uiState.fieldModal.tableRows);
  return getCustomTableRows(field);
}

function getFieldModalChecklistItems(field = null) {
  if (uiState.fieldModal?.checklistItems) return normalizeFieldList(uiState.fieldModal.checklistItems);
  return getChecklistNotesItems(field);
}

function getFieldModalLinkValue(field = null) {
  if (uiState.fieldModal && (uiState.fieldModal.linkButtonText !== undefined || uiState.fieldModal.linkUrl !== undefined)) {
    return normalizeWorkspaceLinkValue({
      label: uiState.fieldModal.linkButtonText ?? "",
      url: uiState.fieldModal.linkUrl ?? "",
    }, uiState.fieldModal.fieldLabel ?? field?.label ?? "");
  }

  return normalizeWorkspaceLinkValue(field?.type === "LINK" ? field.value : "", field?.label ?? "");
}

function getFieldModalSheetValue(field = null) {
  if (uiState.fieldModal?.sheetUrl !== undefined) return normalizeSpreadsheetEmbedValue(uiState.fieldModal.sheetUrl);
  return normalizeSpreadsheetEmbedValue(field?.type === "SHEET_EMBED" ? field.value : "");
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalMultiShortBarLabels(field = null, selectedType = uiState.fieldModal?.selectedType ?? "") {
  const barCount = selectedType === "FOUR_SHORT_BARS" ? 4 : 3;
  if (!["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(selectedType)) return [];
  if (Array.isArray(uiState.fieldModal?.barLabels)) return normalizeMultiShortBarLabels(uiState.fieldModal.barLabels, barCount);
  return normalizeMultiShortBarLabels(field?.barLabels, barCount);
}

function setWorkspaceFieldValue(details, productId, stageId, fieldId, value) {
  const field = ensureWorkspaceProductField(details, productId, stageId, fieldId);
  if (!field) return;
  field.value = normalizeWorkspaceFieldValue(field.type, value);
}

function submitWorkspaceCustomFieldForm(form) {
  if (!canEditWorkspaceData()) return;
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const fieldId = form.getAttribute("data-field-id");
  const formData = new FormData(form);
  const type = String(formData.get("fieldType") ?? uiState.fieldModal?.selectedType ?? "");
  const label = String(formData.get("fieldLabel") ?? uiState.fieldModal?.fieldLabel ?? "").trim();
  const headerSubtext = type === "HEADER_TITLE" ? String(formData.get("headerSubtext") ?? uiState.fieldModal?.headerSubtext ?? "").trim() : "";
  const dropdownOptions = type === "CUSTOM_DROPDOWN" ? getFieldModalDropdownOptions() : [];
  const isTableField = isWorkspaceTableFieldType(type);
  const tableColumns = isTableField ? getFieldModalTableColumns() : [];
  const tableRows = isTableField ? getFieldModalTableRows() : [];
  const checklistItems = type === "CHECKLIST_NOTES" ? getFieldModalChecklistItems() : [];
  const imageGalleryFormat = type === "IMAGE_GALLERY" ? getFieldModalImageGalleryFormat() : "";
  const barLabels = ["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(type) ? getFieldModalMultiShortBarLabels(null, type) : [];
  const linkValue = type === "LINK" ? normalizeWorkspaceLinkValue({
    label: formData.get("linkButtonText") ?? uiState.fieldModal?.linkButtonText ?? "",
    url: formData.get("linkUrl") ?? uiState.fieldModal?.linkUrl ?? "",
  }, label) : null;
  const sheetValue = type === "SHEET_EMBED" ? normalizeSpreadsheetEmbedValue(formData.get("sheetUrl") ?? uiState.fieldModal?.sheetUrl ?? "") : null;

  if (!productId || !stageId || !WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(type)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const template = {
    fieldId: fieldId || createWorkspaceFieldId(),
    label,
    type,
    headerSubtext,
    value: createWorkspaceFieldInitialValue(type, imageGalleryFormat),
    options: type === "CUSTOM_DROPDOWN" ? dropdownOptions : [],
    tableColumns: isTableField ? tableColumns : [],
    tableRows: isTableField ? tableRows : [],
    tableColumnWidths: isTableField ? normalizeTableDimensionList(uiState.fieldModal?.tableColumnWidths) : [],
    tableRowHeights: isTableField ? normalizeTableDimensionList(uiState.fieldModal?.tableRowHeights) : [],
    checklistItems: type === "CHECKLIST_NOTES" ? checklistItems : [],
    barLabels,
    galleryFormat: imageGalleryFormat,
  };

  const savedTemplate = upsertStageFieldTemplate(nextDetails, stageId, template);
  syncWorkspaceFieldDefinitionToProducts(nextDetails, stageId, template);
  if (type === "LINK" && linkValue && savedTemplate) {
    setWorkspaceFieldValue(nextDetails, productId, stageId, savedTemplate.fieldId, linkValue);
  }
  if (type === "SHEET_EMBED" && sheetValue && savedTemplate) {
    setWorkspaceFieldValue(nextDetails, productId, stageId, savedTemplate.fieldId, sheetValue);
  }

  setWorkspaceDetails(nextDetails);
  recordActivity({
    icon: "add_notes",
    label: `${fieldId ? "Updated" : "Added"} custom field${label ? `: ${label}` : ""}`,
    detail: `${getActivityProductName(productId)} • ${getActivityStageLabel(stageId)}`,
    stageId,
    productId,
  });
  uiState.fieldModal = null;
  renderFromCurrentState();
}

function addLongBarTokenFromInput(input) {
  const token = String(input.value ?? "").trim();
  if (!token) return;
  updateLongBarTokens(input, (tokens) => tokens.includes(token) ? tokens : [...tokens, token]);
  input.value = "";
}

function removeLongBarTokenFromButton(button) {
  const tokenIndex = Number(button.getAttribute("data-token-index"));
  if (!Number.isInteger(tokenIndex) || tokenIndex < 0) return;
  updateLongBarTokens(button, (tokens) => tokens.filter((_, index) => index !== tokenIndex));
}

function updateLongBarTokens(source, updater) {
  const productId = source.getAttribute("data-product-id");
  const stageId = source.getAttribute("data-stage-id");
  const fieldId = source.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (field?.type !== "LONG_BAR") return;
  if (!field) return;

  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  field.value = updater(getLongBarTokens(field.value));
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function selectImageGalleryFormatFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const galleryFormat = button.getAttribute("data-gallery-format");
  if (!productId || !stageId || !fieldId || !IMAGE_GALLERY_FORMATS.some((format) => format.value === galleryFormat)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function addImageGallerySlotFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function openImageGalleryPreviewFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const slotIndex = Number(button.getAttribute("data-gallery-slot-index"));
  if (!productId || !stageId || !fieldId || !Number.isInteger(slotIndex)) return;

  uiState.imageGalleryPreview = {
    productId,
    stageId,
    fieldId,
    slotIndex,
  };
}

function getImageGallerySlotKey(productId, stageId, fieldId, slotIndex) {
  return `${productId}:${stageId}:${fieldId}:${slotIndex}`;
}

function removeImageGalleryImageFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const slotIndex = Number(button.getAttribute("data-gallery-slot-index"));
  if (!productId || !stageId || !fieldId || !Number.isInteger(slotIndex)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  const value = normalizeImageGalleryValue(field.value);
  value.images = value.images.filter((image, index) => (Number.isInteger(image.slotIndex) ? image.slotIndex : index) !== slotIndex);
  field.value = normalizeImageGalleryValue(value);
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  if (
    uiState.imageGalleryPreview?.productId === productId
    && uiState.imageGalleryPreview?.stageId === stageId
    && uiState.imageGalleryPreview?.fieldId === fieldId
    && uiState.imageGalleryPreview?.slotIndex === slotIndex
  ) {
    uiState.imageGalleryPreview = null;
  }
  setWorkspaceDetails(nextDetails);
}

function removeImageGallerySlotFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const slotIndex = Number(button.getAttribute("data-gallery-slot-index"));
  if (!productId || !stageId || !fieldId || !Number.isInteger(slotIndex)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  const value = normalizeImageGalleryValue(field.value);
  const baseSlotCount = getImageGalleryBaseSlotCount(value.format);
  const displaySlotCount = getImageGalleryDisplaySlotCount(value);
  const hasImageInSlot = value.images.some((image, index) => (Number.isInteger(image.slotIndex) ? image.slotIndex : index) === slotIndex);
  if (slotIndex < baseSlotCount || slotIndex >= displaySlotCount || hasImageInSlot) return;

  value.images = value.images.map((image, index) => {
    const imageSlotIndex = Number.isInteger(image.slotIndex) ? image.slotIndex : index;
    return {
      ...image,
      slotIndex: imageSlotIndex > slotIndex ? imageSlotIndex - 1 : imageSlotIndex,
    };
  });
  value.extraSlots = Math.max(0, value.extraSlots - 1);
  field.value = normalizeImageGalleryValue(value);
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function moveImageGalleryImageFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const slotIndex = Number(button.getAttribute("data-gallery-slot-index"));
  const direction = button.getAttribute("data-stage-direction") === "previous" ? -1 : 1;
  const targetSlotIndex = slotIndex + direction;
  if (!productId || !stageId || !fieldId || !Number.isInteger(slotIndex) || targetSlotIndex < 0) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  const value = normalizeImageGalleryValue(field.value);
  const slotCount = getImageGalleryDisplaySlotCount(value);
  if (targetSlotIndex >= slotCount) return;

  const sourceImage = value.images.find((image, index) => (Number.isInteger(image.slotIndex) ? image.slotIndex : index) === slotIndex);
  const targetImage = value.images.find((image, index) => (Number.isInteger(image.slotIndex) ? image.slotIndex : index) === targetSlotIndex);
  if (!sourceImage) return;

  sourceImage.slotIndex = targetSlotIndex;
  if (targetImage) targetImage.slotIndex = slotIndex;
  value.images.sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
  field.value = normalizeImageGalleryValue(value);
  if (
    uiState.imageGalleryPreview?.productId === productId
    && uiState.imageGalleryPreview?.stageId === stageId
    && uiState.imageGalleryPreview?.fieldId === fieldId
    && uiState.imageGalleryPreview?.slotIndex === slotIndex
  ) {
    uiState.imageGalleryPreview.slotIndex = targetSlotIndex;
  }
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function uploadImageGalleryImagesFromInput(input) {
  if (!canEditProductFieldValues()) return;
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const startSlotIndex = Math.max(0, Number(input.getAttribute("data-gallery-slot-index") ?? 0) || 0);
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  const uploadSlotKeys = files.map((_, index) => getImageGallerySlotKey(productId, stageId, fieldId, startSlotIndex + index));
  uiState.imageGalleryUploadError = "";
  uploadSlotKeys.forEach((slotKey) => uiState.imageGalleryUploadingSlots.add(slotKey));
  renderFromCurrentState();

  Promise.all(files.map((file, index) => uploadImageGalleryImageFile(file, productId, fieldId, startSlotIndex + index))).then((uploadedImages) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "IMAGE_GALLERY") return;

    const previousValue = structuredCloneWorkspaceFieldValue(field.value);
    const value = normalizeImageGalleryValue(field.value);
    const replacedSlots = new Set(uploadedImages.map((image) => image.slotIndex));
    value.images = [...value.images.filter((image, index) => !replacedSlots.has(Number.isInteger(image.slotIndex) ? image.slotIndex : index)), ...uploadedImages]
      .sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
    const highestImageSlot = value.images.reduce((highestSlot, image) => Math.max(highestSlot, image.slotIndex), -1);
    const overflowSlots = highestImageSlot + 1 - getImageGalleryBaseSlotCount(value.format);
    value.extraSlots = Math.max(value.extraSlots, overflowSlots, 0);
    field.value = normalizeImageGalleryValue(value);
    recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
    setWorkspaceDetails(nextDetails);
    input.value = "";
    uiState.imageGalleryUploadError = "";
    renderFromCurrentState();
  }).catch((error) => {
    input.value = "";
    uiState.imageGalleryUploadError = `Image upload failed: ${error?.message ?? "Please check your Supabase Storage configuration and try again."}`;
    reportStorageUploadError(error);
  }).finally(() => {
    uploadSlotKeys.forEach((slotKey) => uiState.imageGalleryUploadingSlots.delete(slotKey));
    renderFromCurrentState();
  });
}

async function uploadImageGalleryImageFile(file, productId, fieldId, slotIndex) {
  return {
    imageId: createImageGalleryImageId(),
    slotIndex,
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.imageGalleries, scope: `image-gallery/${productId}/${fieldId}` })),
  };
}

function uploadWorkspaceFileFieldFromInput(input) {
  if (!canEditProductFieldValues()) return;
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const files = Array.from(input.files ?? []);
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  Promise.all(files.map((file) => readWorkspaceFieldFile(file, SUPABASE_STORAGE_BUCKETS.files))).then((uploadedFiles) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "FILE_UPLOAD") return;

    const previousValue = structuredCloneWorkspaceFieldValue(field.value);
    field.value = [...normalizeWorkspaceFileList(field.value), ...uploadedFiles];
    recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
    setWorkspaceDetails(nextDetails);
    input.value = "";
    renderFromCurrentState();
  }).catch((error) => {
    input.value = "";
    reportStorageUploadError(error);
  });
}

function removeWorkspaceFileFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const attachmentId = button.getAttribute("data-attachment-id");
  if (!productId || !stageId || !fieldId || !attachmentId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "FILE_UPLOAD") return;

  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  field.value = normalizeWorkspaceFileList(field.value).filter((file) => file.attachmentId !== attachmentId);
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function openPaymentStatusModal(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  const paymentId = target.getAttribute("data-payment-id");
  if (!productId || !stageId || !fieldId) return;

  const field = getWorkspaceStageDetails(productId, stageId).customFields.find((item) => item.fieldId === fieldId && item.type === "PAYMENT_STATUS");
  if (!field) return;

  const value = normalizePaymentStatusValue(field.value);
  const editingPayment = paymentId ? value.history.find((entry) => entry.paymentId === paymentId) : null;
  uiState.paymentModal = {
    productId,
    stageId,
    fieldId,
    editingPaymentId: editingPayment?.paymentId ?? null,
    pendingFiles: [],
    uploadingFiles: false,
    uploadError: "",
    value: {
      ...value,
      paymentTitle: editingPayment?.paymentTitle ?? "",
      paymentMode: editingPayment?.mode ?? "partial",
      partialAmount: editingPayment?.amount ?? "",
      paymentDate: editingPayment?.date || value.paymentDate || getTodayDateInputValue(),
      invoiceNumber: editingPayment?.invoiceNumber ?? "",
      invoiceTitle: editingPayment?.invoiceTitle ?? value.invoiceTitle ?? "",
      invoiceLink: editingPayment?.invoiceLink ?? value.invoiceLink ?? "",
      paymentDescription: editingPayment?.paymentDescription ?? "",
    },
  };
}

function updatePaymentModalDraft(input) {
  if (!canEditProductFieldValues()) return;
  if (!uiState.paymentModal) return;
  const fieldPart = input.getAttribute("data-field-part");
  if (!fieldPart) return;

  const value = normalizePaymentStatusValue(uiState.paymentModal.value);
  if (fieldPart === "paymentTitle") {
    value.paymentTitle = input instanceof HTMLInputElement ? input.value.trim() : "";
  } else if (fieldPart === "isFullPaid") {
    value.paymentMode = input instanceof HTMLInputElement && input.checked ? "full" : "partial";
    if (value.paymentMode === "full") {
      const totals = calculatePaymentTotals(value, uiState.paymentModal.editingPaymentId);
      value.partialAmount = totals.totalCost;
      const amountInput = document.querySelector('[name="partialAmount"][data-action="update-payment-modal-field"]');
      if (amountInput instanceof HTMLInputElement) amountInput.value = value.partialAmount;
    }
  } else if (["totalCost", "partialAmount"].includes(fieldPart)) {
    value[fieldPart] = getNonNegativeAmount(input instanceof HTMLInputElement ? input.value : "");
    if (fieldPart === "totalCost" && value.paymentMode === "full") {
      const totals = calculatePaymentTotals(value, uiState.paymentModal.editingPaymentId);
      value.partialAmount = totals.totalCost;
      const amountInput = document.querySelector('[name="partialAmount"][data-action="update-payment-modal-field"]');
      if (amountInput instanceof HTMLInputElement) amountInput.value = value.partialAmount;
    }
  } else if (fieldPart === "paymentDate") {
    value.paymentDate = input instanceof HTMLInputElement ? input.value : "";
  } else if (fieldPart === "invoiceNumber") {
    value.invoiceNumber = input instanceof HTMLInputElement ? input.value.trim() : "";
  } else if (fieldPart === "invoiceTitle") {
    value.invoiceTitle = input instanceof HTMLInputElement ? input.value.trim() : "";
  } else if (fieldPart === "invoiceLink") {
    value.invoiceLink = input instanceof HTMLInputElement ? input.value.trim() : "";
  } else if (fieldPart === "paymentDescription") {
    value.paymentDescription = input instanceof HTMLTextAreaElement ? input.value : "";
  }
  uiState.paymentModal.value = value;
}

function getPaymentModalPreview(value) {
  const normalizedValue = normalizePaymentStatusValue(value);
  const totalCost = Number(normalizedValue.totalCost || 0);
  const currentPaymentAmount = normalizedValue.paymentMode === "full" && normalizedValue.partialAmount === ""
    ? totalCost
    : Number(normalizedValue.partialAmount || 0);
  const paidPercent = totalCost > 0 ? Math.min(100, Math.round((currentPaymentAmount / totalCost) * 100)) : 0;
  const balance = Math.max(totalCost - currentPaymentAmount, 0);
  const balancePercent = totalCost > 0 ? Math.max(0, Math.round((balance / totalCost) * 100)) : 0;
  return { paidPercent, balance, balancePercent };
}

function updatePaymentModalBalancePreview() {
  if (!uiState.paymentModal) return;
  const value = normalizePaymentStatusValue(uiState.paymentModal.value);
  const { paidPercent, balance, balancePercent } = getPaymentModalPreview(value);
  const amountLabel = document.querySelector(".workspace-payment-modal__amount-label");
  const balanceAmount = document.querySelector(".workspace-payment-modal__balance-amount");
  const balancePercentText = document.querySelector(".workspace-payment-modal__balance-percent");

  if (amountLabel) amountLabel.textContent = `Payment Amount (${paidPercent}%)`;
  if (balanceAmount) balanceAmount.textContent = formatCurrency(balance);
  if (balancePercentText) balancePercentText.textContent = `${balancePercent}% remaining`;
}

function savePaymentStatusForm(form) {
  if (!canEditProductFieldValues()) return;
  if (!uiState.paymentModal) return;
  if (uiState.paymentModal.uploadingFiles) return;
  const productId = form.getAttribute("data-product-id");
  const stageId = form.getAttribute("data-stage-id");
  const fieldId = form.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "PAYMENT_STATUS") return;

  const previousValue = normalizePaymentStatusValue(field.value);
  const nextValue = normalizePaymentStatusValue(uiState.paymentModal.value);
  const totalCost = Number(nextValue.totalCost || 0);
  const enteredAmount = Number(nextValue.partialAmount || 0);
  const paidAmount = nextValue.paymentMode === "full" && enteredAmount <= 0 ? totalCost : enteredAmount;
  const paidPercent = totalCost > 0 ? Math.min(100, Math.round((paidAmount / totalCost) * 100)) : 0;
  const paymentDate = nextValue.paymentDate || getTodayDateInputValue();
  const editingPaymentId = uiState.paymentModal.editingPaymentId;
  const nextHistory = [...previousValue.history];
  const transaction = normalizePaymentHistoryEntry({
    paymentId: editingPaymentId || createPaymentHistoryId(),
    paymentTitle: nextValue.paymentTitle,
    amount: paidAmount,
    percent: paidPercent,
    date: paymentDate,
    mode: nextValue.paymentMode,
    invoiceNumber: nextValue.invoiceNumber,
    invoiceTitle: nextValue.invoiceTitle,
    invoiceLink: nextValue.invoiceLink,
    paymentDescription: nextValue.paymentDescription,
    createdAt: editingPaymentId ? nextHistory.find((entry) => entry.paymentId === editingPaymentId)?.createdAt : new Date().toISOString(),
  });

  if (transaction) {
    if (editingPaymentId) {
      const transactionIndex = nextHistory.findIndex((entry) => entry.paymentId === editingPaymentId);
      if (transactionIndex >= 0) nextHistory[transactionIndex] = transaction;
    } else if (!paymentHistoryHasEntry(nextHistory, transaction)) {
      nextHistory.push(transaction);
    }
  }

  const updatedTotals = calculatePaymentTotals({ ...nextValue, history: nextHistory });
  field.value = normalizePaymentStatusValue({
    ...nextValue,
    paymentMode: updatedTotals.isFullPaid ? "full" : "partial",
    partialAmount: updatedTotals.paidAmount,
    files: mergeWorkspaceFileLists(
      removeInvoiceLinkFileForPayment(previousValue.files, transaction?.paymentId),
      uiState.paymentModal.pendingFiles,
      createInvoiceLinkWorkspaceFile(nextValue.invoiceLink, transaction),
    ),
    history: nextHistory,
  });
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
  uiState.paymentModal = null;
  renderFromCurrentState();
}

function paymentHistoryHasEntry(history, transaction) {
  return history.some((entry) => Number(entry.amount) === Number(transaction.amount)
    && entry.date === transaction.date
    && entry.mode === transaction.mode
    && String(entry.paymentTitle ?? "").trim() === String(transaction.paymentTitle ?? "").trim()
    && String(entry.invoiceNumber ?? "").trim() === String(transaction.invoiceNumber ?? "").trim()
    && String(entry.invoiceTitle ?? "").trim() === String(transaction.invoiceTitle ?? "").trim()
    && String(entry.invoiceLink ?? "").trim() === String(transaction.invoiceLink ?? "").trim());
}

function getTodayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}


function calculatePaymentTotals(value, excludedPaymentId = null) {
  const normalizedValue = normalizePaymentStatusValue(value);
  const totalCost = Number(normalizedValue.totalCost || 0);
  const paymentHistory = normalizedValue.history.filter((entry) => entry.paymentId !== excludedPaymentId);
  const historyPaidAmount = paymentHistory.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const legacyPaidAmount = normalizedValue.paymentMode === "full" ? totalCost : Number(normalizedValue.partialAmount || 0);
  const paidBeforeCurrent = historyPaidAmount;
  const rawPaidAmount = normalizedValue.history.length > 0 ? historyPaidAmount : legacyPaidAmount;
  const paidAmount = totalCost > 0 ? Math.min(rawPaidAmount, totalCost) : rawPaidAmount;
  const paidPercent = totalCost > 0 ? Math.min(100, Math.round((paidAmount / totalCost) * 100)) : 0;
  const balanceAmount = Math.max(totalCost - paidAmount, 0);
  const balancePercent = Math.max(100 - paidPercent, 0);
  return { totalCost, paidBeforeCurrent, paidAmount, paidPercent, balanceAmount, balancePercent, isFullPaid: totalCost > 0 && balanceAmount <= 0 };
}

function formatPaymentDateWords(dateValue) {
  if (!dateValue) return "No date";
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}


function deletePaymentTransactionFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const paymentId = button.getAttribute("data-payment-id");
  if (!productId || !stageId || !fieldId || !paymentId) return false;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "PAYMENT_STATUS") return false;

  const value = normalizePaymentStatusValue(field.value);
  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  const transaction = value.history.find((entry) => entry.paymentId === paymentId);
  if (!transaction || !confirmPaymentTransactionDelete(transaction)) return false;

  const nextHistory = value.history.filter((entry) => entry.paymentId !== paymentId);
  const updatedTotals = calculatePaymentTotals({ ...value, history: nextHistory });
  field.value = normalizePaymentStatusValue({
    ...value,
    paymentMode: updatedTotals.isFullPaid ? "full" : "partial",
    partialAmount: updatedTotals.paidAmount,
    files: value.files,
    history: nextHistory,
  });
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
  return true;
}

function confirmPaymentTransactionDelete(transaction) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;

  const title = transaction.paymentTitle || "this payment transaction";
  const amount = formatCurrency(transaction.amount);
  return window.confirm(`Delete ${title} (${amount})? This action cannot be undone.`);
}

function uploadPaymentModalInvoiceFileFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  if (!uiState.paymentModal) return;

  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const files = Array.from(input.files ?? []).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  if (!productId || !stageId || !fieldId || files.length === 0) {
    input.value = "";
    return;
  }
  if (uiState.paymentModal.productId !== productId || uiState.paymentModal.stageId !== stageId || uiState.paymentModal.fieldId !== fieldId) {
    input.value = "";
    return;
  }

  uiState.paymentModal.uploadingFiles = true;
  uiState.paymentModal.uploadError = "";
  renderFromCurrentState();

  Promise.all(files.map((file) => readWorkspaceFieldFile(file, SUPABASE_STORAGE_BUCKETS.paymentDocuments))).then((uploadedFiles) => {
    if (
      !uiState.paymentModal
      || uiState.paymentModal.productId !== productId
      || uiState.paymentModal.stageId !== stageId
      || uiState.paymentModal.fieldId !== fieldId
    ) {
      return;
    }
    uiState.paymentModal.pendingFiles = mergeWorkspaceFileLists(uiState.paymentModal.pendingFiles, uploadedFiles);
    uiState.paymentModal.uploadingFiles = false;
    uiState.paymentModal.uploadError = "";
    input.value = "";
    renderFromCurrentState();
  }).catch((error) => {
    if (uiState.paymentModal) {
      uiState.paymentModal.uploadingFiles = false;
      uiState.paymentModal.uploadError = error?.message || "Invoice PDF upload failed. Please try again.";
    }
    input.value = "";
    reportStorageUploadError(error);
    renderFromCurrentState();
  });
}

function removePaymentModalInvoiceFileFromButton(button) {
  if (!uiState.paymentModal) return;
  const attachmentId = button.getAttribute("data-attachment-id");
  if (!attachmentId) return;
  uiState.paymentModal.pendingFiles = normalizeWorkspaceFileList(uiState.paymentModal.pendingFiles).filter((file) => file.attachmentId !== attachmentId);
}

function createInvoiceLinkAttachmentId(paymentId) {
  return `invoice_link_${String(paymentId ?? "").replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
}

function createInvoiceLinkWorkspaceFile(invoiceLink, transaction) {
  const url = getSafeWorkspaceUrl(invoiceLink);
  if (!url || !transaction?.paymentId) return [];
  const invoiceLabel = transaction.invoiceTitle || (transaction.invoiceNumber ? `Invoice ${transaction.invoiceNumber}` : transaction.paymentTitle ? `${transaction.paymentTitle} invoice` : "Invoice link");
  return [{
    attachmentId: createInvoiceLinkAttachmentId(transaction.paymentId),
    name: invoiceLabel,
    type: "text/uri-list",
    size: 0,
    bucket: "external-link",
    storagePath: "",
    storageUrl: url,
    isExternalLink: true,
    uploadedAt: transaction.createdAt || new Date().toISOString(),
  }];
}

function removeInvoiceLinkFileForPayment(files, paymentId) {
  if (!paymentId) return files;
  const invoiceAttachmentId = createInvoiceLinkAttachmentId(paymentId);
  return normalizeWorkspaceFileList(files).filter((file) => file.attachmentId !== invoiceAttachmentId);
}

function mergeWorkspaceFileLists(...fileLists) {
  const fileMap = new Map();
  fileLists.flatMap((fileList) => normalizeWorkspaceFileList(fileList)).forEach((file) => {
    fileMap.set(file.attachmentId, file);
  });
  return Array.from(fileMap.values());
}

function uploadPaymentFileFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const files = Array.from(input.files ?? []);
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  Promise.all(files.map((file) => readWorkspaceFieldFile(file, SUPABASE_STORAGE_BUCKETS.paymentDocuments))).then((uploadedFiles) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "PAYMENT_STATUS") return;

    const previousValue = structuredCloneWorkspaceFieldValue(field.value);
    const value = normalizePaymentStatusValue(field.value);
    value.files = [...value.files, ...uploadedFiles];
    field.value = normalizePaymentStatusValue(value);
    recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
    setWorkspaceDetails(nextDetails);
    input.value = "";
    renderFromCurrentState();
  }).catch((error) => {
    input.value = "";
    reportStorageUploadError(error);
  });
}

function removePaymentFileFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const attachmentId = button.getAttribute("data-attachment-id");
  if (!productId || !stageId || !fieldId || !attachmentId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "PAYMENT_STATUS") return;

  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  const value = normalizePaymentStatusValue(field.value);
  value.files = value.files.filter((file) => file.attachmentId !== attachmentId);
  field.value = value;
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

async function readWorkspaceFieldFile(file, bucket = SUPABASE_STORAGE_BUCKETS.files) {
  return {
    attachmentId: createWorkspaceFileId(),
    ...(await uploadFileMetadata(file, { bucket, scope: "workspace" })),
  };
}

function reorderWorkspaceField(draggedField, dropFieldId) {
  if (!draggedField || !dropFieldId || draggedField.fieldId === dropFieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  reorderStageFieldTemplates(nextDetails, draggedField.stageId, draggedField.fieldId, dropFieldId);
  for (const productDetails of Object.values(nextDetails.products ?? {})) {
    const fields = productDetails?.stages?.[draggedField.stageId]?.customFields;
    if (Array.isArray(fields)) reorderFieldListInPlace(fields, draggedField.fieldId, dropFieldId);
  }
  setWorkspaceDetails(nextDetails);
}

function reorderStageFieldTemplates(details, stageId, draggedFieldId, dropFieldId) {
  const templates = getStageFieldTemplates(details, stageId);
  reorderFieldListInPlace(templates, draggedFieldId, dropFieldId);
}

function reorderFieldListInPlace(fields, draggedFieldId, dropFieldId) {
  const draggedIndex = fields.findIndex((field) => field.fieldId === draggedFieldId);
  const dropIndex = fields.findIndex((field) => field.fieldId === dropFieldId);
  if (draggedIndex < 0 || dropIndex < 0 || draggedIndex === dropIndex) return;

  const [draggedField] = fields.splice(draggedIndex, 1);
  fields.splice(dropIndex, 0, draggedField);
}

function addWorkspaceTableSectionFromButton(button, axis) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!currentField || !isWorkspaceTableFieldType(currentField.type)) return;

  const template = getWorkspaceTableTemplate(nextDetails, stageId, currentField);
  const columns = getCustomTableColumns(template);
  const rows = getCustomTableRows(template);

  if (axis === "column") {
    template.tableColumns = [...columns, `Column ${columns.length + 1}`];
  } else {
    template.tableRows = [...rows, `Row ${rows.length + 1}`];
  }

  syncWorkspaceTableDefinitionToProducts(nextDetails, stageId, template);
  setWorkspaceDetails(nextDetails);
}

function removeWorkspaceTableSectionFromButton(button, axis) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const index = Number(button.getAttribute("data-table-index"));
  if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis) || !Number.isInteger(index)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!currentField || !isWorkspaceTableFieldType(currentField.type)) return;

  const template = getWorkspaceTableTemplate(nextDetails, stageId, currentField);
  const columns = getCustomTableColumns(template);
  const rows = getCustomTableRows(template);
  const labels = axis === "column" ? columns : rows;
  const otherLabels = axis === "column" ? rows : columns;
  if (index < 0 || index >= labels.length || (labels.length <= 1 && otherLabels.length === 0)) return;

  if (axis === "column") {
    template.tableColumns = columns.filter((_, columnIndex) => columnIndex !== index);
    template.tableColumnWidths = removeWorkspaceTableColumnWidth(template, index, rows.length > 0);
  } else {
    template.tableRows = rows.filter((_, rowIndex) => rowIndex !== index);
    template.tableRowHeights = getCustomTableRowHeights(template).filter((_, rowIndex) => rowIndex !== index);
  }

  syncWorkspaceTableDefinitionToProducts(nextDetails, stageId, template, (field, previousRows, previousColumns) => {
    const tableValue = resizeCustomTableValue(field.value, previousRows.length, previousColumns.length);
    field.value = axis === "column"
      ? tableValue.map((row) => row.filter((_, columnIndex) => columnIndex !== index))
      : tableValue.filter((_, rowIndex) => rowIndex !== index);
    if (axis === "row") {
      field.tableRowLabels = getCustomTableRowLabels(field, previousRows.length).filter((_, rowIndex) => rowIndex !== index);
    }
  });
  setWorkspaceDetails(nextDetails);
}

function editWorkspaceTableLinkCellFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const rowIndex = Number(button.getAttribute("data-row-index"));
  const columnIndex = Number(button.getAttribute("data-column-index"));
  if (!productId || !stageId || !fieldId || !Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
  uiState.editingTableLinkCell = getWorkspaceTableCellKey(productId, stageId, fieldId, rowIndex, columnIndex);
}

function reorderWorkspaceTableSection(draggedSection, dropIndex) {
  if (!draggedSection || !["column", "row"].includes(draggedSection.axis) || draggedSection.index === dropIndex) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, draggedSection.productId, draggedSection.stageId, draggedSection.fieldId);
  if (!currentField || !isWorkspaceTableFieldType(currentField.type)) return;

  const template = getWorkspaceTableTemplate(nextDetails, draggedSection.stageId, currentField);
  const columns = getCustomTableColumns(template);
  const rows = getCustomTableRows(template);
  const sectionLength = draggedSection.axis === "column" ? columns.length : rows.length;
  if (!isValidReorderIndex(draggedSection.index, dropIndex, sectionLength)) return;

  if (draggedSection.axis === "column") {
    template.tableColumns = reorderListItem(columns, draggedSection.index, dropIndex);
    template.tableColumnWidths = reorderWorkspaceTableColumnWidths(template, draggedSection.index, dropIndex, rows.length > 0);
  } else {
    template.tableRows = reorderListItem(rows, draggedSection.index, dropIndex);
    template.tableRowHeights = reorderTableDimensionList(getCustomTableRowHeights(template), draggedSection.index, dropIndex);
  }

  syncWorkspaceTableDefinitionToProducts(nextDetails, draggedSection.stageId, template, (field, previousRows, previousColumns) => {
    const tableValue = resizeCustomTableValue(field.value, previousRows.length, previousColumns.length);
    field.value = draggedSection.axis === "column"
      ? tableValue.map((row) => reorderListItem(row, draggedSection.index, dropIndex))
      : reorderListItem(tableValue, draggedSection.index, dropIndex);
    if (draggedSection.axis === "row") {
      field.tableRowLabels = reorderListItem(getCustomTableRowLabels(field, previousRows.length), draggedSection.index, dropIndex);
    }
  });

  setWorkspaceDetails(nextDetails);
}

function renameWorkspaceTableSectionFromInput(input) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const axis = input.getAttribute("data-table-axis");
  const index = Number(input.getAttribute("data-table-index"));
  const nextLabel = "value" in input ? input.value : "";
  renameWorkspaceTableSection({ productId, stageId, fieldId, axis, index }, nextLabel);
}

function renameWorkspaceTableSection(section, nextLabel) {
  if (!section || !["column", "row", "corner"].includes(section.axis)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, section.productId, section.stageId, section.fieldId);
  if (!currentField || !isWorkspaceTableFieldType(currentField.type)) return;

  if (section.axis === "row") {
    renameWorkspaceTableProductRowLabel(nextDetails, currentField, section, nextLabel);
    return;
  }

  const template = getWorkspaceTableTemplate(nextDetails, section.stageId, currentField);
  if (section.axis === "corner") {
    template.tableCornerHeader = normalizeTableCornerHeader(nextLabel);
    syncWorkspaceTableDefinitionToProducts(nextDetails, section.stageId, template);
    setWorkspaceDetails(nextDetails);
    return;
  }

  const label = String(nextLabel ?? "").trim();
  if (!label) return;

  const listKey = section.axis === "column" ? "tableColumns" : "tableRows";
  const labels = normalizeFieldList(template[listKey]);
  if (!Number.isInteger(section.index) || section.index < 0 || section.index >= labels.length) return;

  labels[section.index] = label;
  template[listKey] = labels;
  syncWorkspaceTableDefinitionToProducts(nextDetails, section.stageId, template);
  setWorkspaceDetails(nextDetails);
}

function renameWorkspaceTableProductRowLabel(details, field, section, nextLabel) {
  const rows = getCustomTableRows(field);
  if (!Number.isInteger(section.index) || section.index < 0 || section.index >= rows.length) return;
  const labels = getCustomTableRowLabels(field, rows.length);
  labels[section.index] = String(nextLabel ?? "").trim();
  applyProductTableRowLabels(section.stageId, field, labels);
  setWorkspaceDetails(details);
}

function getWorkspaceTableTemplate(details, stageId, field) {
  const templates = getStageFieldTemplates(details, stageId);
  let template = templates.find((item) => item.fieldId === field.fieldId && isWorkspaceTableFieldType(item.type));
  if (!template) {
    template = normalizeWorkspaceFieldDefinition(field);
    if (template) templates.push(template);
  }
  return template;
}

function syncWorkspaceTableDefinitionToProducts(details, stageId, template, valueUpdater = null) {
  const normalizedTemplate = normalizeWorkspaceFieldDefinition(template);
  if (!normalizedTemplate) return;
  upsertStageFieldTemplate(details, stageId, normalizedTemplate);

  for (const productDetails of Object.values(details.products ?? {})) {
    const stageDetails = productDetails?.stages?.[stageId];
    if (!stageDetails) continue;
    const field = stageDetails.customFields?.find((item) => item.fieldId === normalizedTemplate.fieldId && item.type === normalizedTemplate.type);
    if (!field) continue;

    const previousRows = getCustomTableRows(field);
    const previousColumns = getCustomTableColumns(field);
    field.tableColumns = [...normalizedTemplate.tableColumns];
    field.tableRows = [...normalizedTemplate.tableRows];
    field.tableCornerHeader = normalizedTemplate.tableCornerHeader;
    field.tableColumnWidths = [...normalizedTemplate.tableColumnWidths];
    field.tableRowHeights = [...normalizedTemplate.tableRowHeights];
    if (valueUpdater) {
      valueUpdater(field, previousRows, previousColumns);
    } else {
      field.value = resizeCustomTableValue(field.value, getEffectiveTableRowCount(normalizedTemplate), getEffectiveTableColumnCount(normalizedTemplate));
    }
  }
}

function saveWorkspaceTableLayout(candidate, columnWidths, rowHeights) {
  if (!candidate?.productId || !candidate.stageId || !candidate.fieldId) return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, candidate.productId, candidate.stageId, candidate.fieldId);
  if (!currentField || !isWorkspaceTableFieldType(currentField.type)) return;

  const template = getWorkspaceTableTemplate(nextDetails, candidate.stageId, currentField);
  template.tableColumnWidths = normalizeTableDimensionList(columnWidths);
  template.tableRowHeights = normalizeTableDimensionList(rowHeights);
  syncWorkspaceTableDefinitionToProducts(nextDetails, candidate.stageId, template);
  setWorkspaceDetails(nextDetails);
}

function isValidReorderIndex(fromIndex, toIndex, length) {
  return Number.isInteger(fromIndex) && Number.isInteger(toIndex) && fromIndex >= 0 && toIndex >= 0 && fromIndex < length && toIndex < length;
}

function reorderListItem(items, fromIndex, toIndex) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function updateStructuredWorkspaceFieldFromInput(input) {
  if (!canEditProductFieldValues()) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;
  const previousValue = structuredCloneWorkspaceFieldValue(field.value);

  if (input.getAttribute("data-action") === "update-workspace-table-cell") {
    const rowIndex = Number(input.getAttribute("data-row-index"));
    const columnIndex = Number(input.getAttribute("data-column-index"));
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
    const rows = getCustomTableRows(field);
    const columns = getCustomTableColumns(field);
    const effectiveRows = rows.length > 0 ? rows : [""];
    const effectiveColumns = columns.length > 0 ? columns : rows.length > 0 ? [] : ["Details"];
    const tableValue = resizeCustomTableValue(field.value, effectiveRows.length, effectiveColumns.length);
    const previousCellValue = tableValue[rowIndex]?.[columnIndex] ?? "";
    const nextCellValue = getWorkspaceInputValue(input);
    tableValue[rowIndex][columnIndex] = nextCellValue;
    field.value = tableValue;
    recordWorkspaceFieldHistory(nextDetails, {
      productId,
      stageId,
      fieldId,
      previousValue: previousCellValue,
      nextValue: nextCellValue,
      tableCell: getWorkspaceTableHistoryCellContext(field, stageId, rowIndex, columnIndex),
    });
    setWorkspaceDetails(nextDetails);
    return;
  }

  if (input.getAttribute("data-action") === "update-workspace-checklist-note-item") {
    const itemIndex = Number(input.getAttribute("data-option-index"));
    const item = getChecklistNotesItems(field)[itemIndex];
    if (!item || !(input instanceof HTMLInputElement)) return;
    const value = normalizeChecklistNotesValue(field.value, getChecklistNotesItems(field));
    value.checked[item] = input.checked;
    field.value = value;
  }

  if (input.getAttribute("data-action") === "update-workspace-checklist-note-text") {
    const value = normalizeChecklistNotesValue(field.value, getChecklistNotesItems(field));
    value.notes = getWorkspaceInputValue(input);
    field.value = value;
  }

  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function getWorkspaceTableHistoryCellContext(field, stageId, rowIndex, columnIndex) {
  const rows = getCustomTableRows(field);
  const columns = getCustomTableColumns(field);
  const isImagePlanningTable = stageId === "image-planning";
  return {
    rowIndex,
    columnIndex,
    rowLabel: rows.length > 0 ? getWorkspaceTableRowDisplayLabel(rows[rowIndex], rowIndex, isImagePlanningTable) : `Row ${rowIndex + 1}`,
    columnLabel: columns.length > 0 ? columns[columnIndex] : "Details",
  };
}

function updateListingContentFromInput(input) {
  if (!canEditProductFieldValues()) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const part = input.getAttribute("data-listing-part");
  if (!productId || !stageId || !fieldId || !part) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "LISTING_CONTENT") return;
  const previousValue = structuredCloneWorkspaceFieldValue(field.value);

  const value = normalizeListingContentValue(field.value);
  const inputValue = "value" in input ? String(input.value ?? "") : "";
  if (part === "title") value.title = inputValue;
  if (part === "itemHighlight") value.itemHighlight = inputValue;
  if (part === "description") value.description = inputValue;
  if (part === "backendKeywords") value.backendKeywords = inputValue;
  if (part === "status") value.status = ["approved", "declined"].includes(inputValue) ? inputValue : "";
  if (part === "bullet") {
    const bulletIndex = Number(input.getAttribute("data-bullet-index"));
    if (Number.isInteger(bulletIndex) && bulletIndex >= 0 && bulletIndex < value.bullets.length) value.bullets[bulletIndex] = inputValue;
  }

  field.value = value;
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
  const listingBuilder = input.closest(".listing-content-builder");
  updateListingContentCounters(listingBuilder, value);
  if (input instanceof HTMLTextAreaElement) autoResizeTextarea(input);
}

function updateListingContentCounters(container, value) {
  if (!(container instanceof Element)) return;
  const normalizedValue = normalizeListingContentValue(value);
  const counters = {
    title: [getCharacterCount(normalizedValue.title), 75],
    itemHighlight: [getCharacterCount(normalizedValue.itemHighlight), 125],
    bullets: [normalizedValue.bullets.reduce((total, bullet) => total + getCharacterCount(bullet), 0), 1000],
    description: [getCharacterCount(normalizedValue.description), 2000],
    backendKeywords: [getCharacterCount(normalizedValue.backendKeywords), 250],
  };
  for (const [key, [count, max]] of Object.entries(counters)) {
    const counter = container.querySelector(`[data-listing-counter="${key}"]`);
    if (counter) counter.textContent = `${count}/${max} characters`;
  }
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function updateWorkspaceFieldFromInput(input) {
  if (!canEditProductFieldValues()) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;

  const fieldPart = input.getAttribute("data-field-part");
  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  const value = getWorkspaceInputValue(input);
  if (fieldPart) {
    if (["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(field.type) && fieldPart.startsWith("multiShortBar")) {
      const barCount = field.type === "FOUR_SHORT_BARS" ? 4 : 3;
      const index = Number(fieldPart.replace("multiShortBar", ""));
      if (!Number.isInteger(index) || index < 0 || index >= barCount) return;
      const nextValues = normalizeMultiShortBarsValue(field.value, barCount);
      const previousBarValue = nextValues[index] ?? "";
      const nextBarValue = String(value ?? "");
      nextValues[index] = String(value ?? "");
      field.value = nextValues;
      recordWorkspaceFieldHistory(nextDetails, {
        productId,
        stageId,
        fieldId,
        previousValue: previousBarValue,
        nextValue: nextBarValue,
        multiBar: getWorkspaceMultiBarHistoryContext(field, index),
      });
      setWorkspaceDetails(nextDetails);
      return;
    }
    const currentValue = getWorkspaceFieldPartValue(field);
    field.value = { ...currentValue, [fieldPart]: value };
    if (field.type === "SHIPPING_TIMELINE") {
      field.value = normalizeShippingTimelineValue(field.value);
    }
    if (field.type === "SHEET_EMBED" && fieldPart === "url" && getSafeWorkspaceUrl(String(value ?? ""))) {
      uiState.editingSheetEmbedIds.delete(getSheetPreviewKey(productId, stageId, fieldId));
    }
  } else {
    field.value = value;
  }

  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function getWorkspaceMultiBarHistoryContext(field, index) {
  const barCount = field?.type === "FOUR_SHORT_BARS" ? 4 : 3;
  const labels = normalizeMultiShortBarLabels(field?.barLabels, barCount);
  return {
    index,
    label: labels[index] || `Bar ${index + 1}`,
  };
}

function getWorkspaceFieldPartValue(field) {
  if (field?.type === "LINK") return normalizeWorkspaceLinkValue(field.value, field.label);
  if (field?.type === "SHEET_EMBED") return normalizeSpreadsheetEmbedValue(field.value);
  if (field?.type === "SHIPPING_TIMELINE") return normalizeShippingTimelineValue(field.value);
  return field?.value && typeof field.value === "object" && !Array.isArray(field.value) ? field.value : {};
}

function getWorkspaceInputValue(input) {
  if (input instanceof HTMLInputElement && input.type === "number") {
    return input.value === "" ? "" : Number(input.value);
  }
  return "value" in input ? input.value : "";
}

function getWorkspaceStageDetails(productId, stageId) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  return ensureWorkspaceStageDetails(nextDetails, productId, stageId);
}

function ensureWorkspaceStageDetails(details, productId, stageId) {
  const productDetails = ensureWorkspaceProductDetails(details, productId);
  productDetails.stages[stageId] ??= { customFields: [], checklistTasks: [] };
  productDetails.stages[stageId].customFields ??= [];
  productDetails.stages[stageId].checklistTasks ??= [];
  syncStageTemplatesIntoStageDetails(details, stageId, productDetails.stages[stageId]);
  return productDetails.stages[stageId];
}

function ensureWorkspaceProductField(details, productId, stageId, fieldId) {
  const stageDetails = ensureWorkspaceStageDetails(details, productId, stageId);
  return stageDetails.customFields.find((field) => field.fieldId === fieldId) ?? null;
}

function getStageFieldTemplates(details, stageId) {
  details.stageFieldTemplates ??= {};
  details.stageFieldTemplates[stageId] ??= [];
  ensureBuiltInStageFieldTemplates(details, stageId);
  return details.stageFieldTemplates[stageId];
}

function ensureBuiltInStageFieldTemplates(details, stageId) {
  const builtInTemplates = BUILT_IN_STAGE_FIELD_TEMPLATES[stageId] ?? [];
  if (builtInTemplates.length === 0) return;

  for (const template of builtInTemplates) {
    const existingIndex = details.stageFieldTemplates[stageId].findIndex((field) => field.fieldId === template.fieldId);
    if (existingIndex >= 0) {
      details.stageFieldTemplates[stageId][existingIndex] = {
        ...details.stageFieldTemplates[stageId][existingIndex],
        label: template.label,
        type: template.type,
        headerSubtext: template.type === "HEADER_TITLE" ? String(template.headerSubtext ?? details.stageFieldTemplates[stageId][existingIndex].headerSubtext ?? "").trim() : "",
      };
    } else {
      details.stageFieldTemplates[stageId].unshift({ ...template });
    }
  }
}

function cloneWorkspaceFieldDefinition(field) {
  const type = String(field?.type ?? "");
  return {
    fieldId: String(field?.fieldId ?? "") || createWorkspaceFieldId(),
    label: String(field?.label ?? "").trim(),
    type,
    headerSubtext: type === "HEADER_TITLE" ? String(field?.headerSubtext ?? "").trim() : "",
    options: type === "CUSTOM_DROPDOWN" ? normalizeDropdownOptions(field?.options) : [],
    tableColumns: isWorkspaceTableFieldType(type) ? normalizeFieldList(field?.tableColumns) : [],
    tableRows: isWorkspaceTableFieldType(type) ? normalizeFieldList(field?.tableRows) : [],
    tableCornerHeader: isWorkspaceTableFieldType(type) ? normalizeTableCornerHeader(field?.tableCornerHeader) : "",
    tableColumnWidths: isWorkspaceTableFieldType(type) ? normalizeTableDimensionList(field?.tableColumnWidths) : [],
    tableRowHeights: isWorkspaceTableFieldType(type) ? normalizeTableDimensionList(field?.tableRowHeights) : [],
    checklistItems: type === "CHECKLIST_NOTES" ? normalizeFieldList(field?.checklistItems) : [],
    barLabels: ["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(type) ? normalizeMultiShortBarLabels(field?.barLabels, type === "FOUR_SHORT_BARS" ? 4 : 3) : [],
    galleryFormat: type === "IMAGE_GALLERY" ? getImageGalleryFormat(field?.galleryFormat ?? field?.value?.format)?.value ?? "" : "",
  };
}

function normalizeWorkspaceFieldDefinition(field) {
  const normalizedField = normalizeWorkspaceField(field);
  if (!normalizedField) return null;
  const definition = cloneWorkspaceFieldDefinition(normalizedField);
  return {
    ...definition,
    value: createWorkspaceFieldInitialValue(normalizedField.type, definition.galleryFormat),
  };
}

function createWorkspaceFieldFromTemplate(template, existingField = null) {
  const definition = cloneWorkspaceFieldDefinition(template);
  const field = {
    ...definition,
    value: getSyncedWorkspaceFieldValue(definition, existingField),
  };
  if (isWorkspaceTableFieldType(definition.type)) {
    field.tableRowLabels = normalizeWorkspaceTableRowLabelsForField(existingField, field.value, getEffectiveTableRowCount(definition), definition.tableRows);
    field.tableRowLabelsInitialized = true;
    field.tableRowLabelsIntentionallyBlank = Boolean(existingField?.tableRowLabelsIntentionallyBlank);
  }
  return field;
}

function getSyncedWorkspaceFieldValue(definition, existingField = null) {
  if (!existingField || existingField.type !== definition.type) return createWorkspaceFieldInitialValue(definition.type, definition.galleryFormat);

  if (definition.type === "CUSTOM_DROPDOWN") {
    const selectedValue = normalizeWorkspaceFieldValue(definition.type, existingField.value);
    return definition.options.includes(selectedValue) ? selectedValue : "";
  }

  if (isWorkspaceTableFieldType(definition.type)) {
    return resizeCustomTableValue(existingField.value, getEffectiveTableRowCount(definition), getEffectiveTableColumnCount(definition));
  }

  if (definition.type === "CHECKLIST_NOTES") {
    return normalizeChecklistNotesValue(existingField.value, definition.checklistItems);
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  return normalizeWorkspaceFieldValue(definition.type, existingField.value);
}

function syncStageTemplatesIntoStageDetails(details, stageId, stageDetails) {
  const templates = getStageFieldTemplates(details, stageId)
    .map(normalizeWorkspaceFieldDefinition)
    .filter(Boolean);

  details.stageFieldTemplates[stageId] = templates;

  const existingFields = Array.isArray(stageDetails.customFields) ? stageDetails.customFields : [];
  const syncedFields = templates.map((template) => {
    const existingField = existingFields.find((field) => field.fieldId === template.fieldId);
    return createWorkspaceFieldFromTemplate(template, existingField);
  });
  const templateIds = new Set(templates.map((template) => template.fieldId));
  const productOnlyFields = existingFields.filter((field) => !templateIds.has(field.fieldId));

  stageDetails.customFields = [...syncedFields, ...productOnlyFields];
}

function syncOrderWorkspaceIntoShipping(productId, previousStageId, nextStageId) {
  if (previousStageId !== "under-final-order" || nextStageId !== "shipping" || !productId) return;
  // Shipping is a separate operational record. Moving a product must not copy
  // payment/order fields from Under Final Order into the Shipping stage.
}

function structuredCloneWorkspaceFieldValue(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function upsertStageFieldTemplate(details, stageId, field) {
  const template = normalizeWorkspaceFieldDefinition(field);
  if (!template) return null;

  const templates = getStageFieldTemplates(details, stageId);
  const existingIndex = templates.findIndex((item) => item.fieldId === template.fieldId);
  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    templates.push(template);
  }

  return template;
}

function syncWorkspaceFieldDefinitionToProducts(details, stageId, field) {
  const template = normalizeWorkspaceFieldDefinition(field);
  if (!template) return;

  for (const productDetails of Object.values(details.products ?? {})) {
    productDetails.stages ??= {};
    productDetails.stages[stageId] ??= { customFields: [], checklistTasks: [] };
    productDetails.stages[stageId].customFields ??= [];
    productDetails.stages[stageId].checklistTasks ??= [];
    const existingIndex = productDetails.stages[stageId].customFields.findIndex((item) => item.fieldId === template.fieldId);
    if (existingIndex >= 0) {
      productDetails.stages[stageId].customFields[existingIndex] = createWorkspaceFieldFromTemplate(template, productDetails.stages[stageId].customFields[existingIndex]);
    } else {
      productDetails.stages[stageId].customFields.push(createWorkspaceFieldFromTemplate(template));
    }
  }
}

function removeStageFieldTemplate(details, stageId, fieldId) {
  details.stageFieldTemplates ??= {};
  details.stageFieldTemplates[stageId] = getStageFieldTemplates(details, stageId).filter((field) => field.fieldId !== fieldId);
}

function removeWorkspaceFieldFromProducts(details, stageId, fieldId) {
  for (const productDetails of Object.values(details.products ?? {})) {
    const stageDetails = productDetails?.stages?.[stageId];
    if (!stageDetails) continue;
    stageDetails.customFields = Array.isArray(stageDetails.customFields)
      ? stageDetails.customFields.filter((field) => field.fieldId !== fieldId)
      : [];
  }
}

async function requestRemoteAuth(path, options = {}) {
  if (typeof fetch !== "function") throw new Error("Remote access API is unavailable.");
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  if (authSession?.token) headers.Authorization = `Bearer ${authSession.token}`;
  const timeoutMs = Number(options.timeoutMs ?? 45000);
  const controller = typeof AbortController === "function" && timeoutMs > 0 ? new AbortController() : null;
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetch(path, { ...options, headers, signal: controller?.signal ?? options.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Remote access request timed out. Please check the connection and try again.");
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 404 && !payload.error ? "Remote access API is unavailable." : payload.error || "Remote access request failed.");
    error.status = response.status;
    error.payload = payload;
    if (response.status === 401 && authSession?.token) {
      clearAuthSession();
      window.setTimeout(renderFromCurrentState, 0);
    }
    throw error;
  }
  return payload;
}

function preserveKnownUserPasswords(users) {
  if (!Array.isArray(users)) return [];
  return users.map((user) => {
    const existingUser = findTeamUserByEmail(user.email);
    const password = user.password || existingUser?.password || "";
    return { ...user, password, hasPassword: Boolean(user.hasPassword || password || existingUser?.hasPassword) };
  });
}

function mergeRemoteTeamUsers(users) {
  if (!Array.isArray(users)) return;
  setTeamUsers(normalizeTeamUsers([...teamUsers, ...preserveKnownUserPasswords(users)]));
}

function replaceRemoteTeamUsers(users) {
  if (!Array.isArray(users)) return;
  setTeamUsers(normalizeTeamUsers(preserveKnownUserPasswords(users)));
}

async function loginWithRemoteAccess(email, password, remember) {
  try {
    const payload = await requestRemoteAuth("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!payload?.user || !payload?.token) return { handled: false };
    mergeRemoteTeamUsers([payload.user]);
    setAuthSession({ email: payload.user.email, name: payload.user.name, role: payload.user.role, token: payload.token }, remember);
    if (redirectToGlasscoReturnRoute()) return { handled: true };
    await refreshRemoteTeamUsers();
    startRemoteWorkspaceSync();
    await refreshRemoteWorkspaceState({ force: true });
    uiState.loginDraft = { email: "", password: "", remember: false };
    uiState.authError = "";
    uiState.showLoginPassword = false;
    renderFromCurrentState();
    return { handled: true };
  } catch (error) {
    const message = String(error?.message ?? "");
    if (isRemoteAccessUnavailableError(message)) return { handled: false, remoteUnavailableError: message };
    if (isRemoteLoginInvalidCredentialsError(message)) return { handled: false };
    uiState.authError = message;
    renderFromCurrentState();
    return { handled: true };
  }
}

function isRemoteAccessUnavailableError(message) {
  return [
    "Failed to fetch",
    "Unexpected token",
    "Remote access API is unavailable",
    "DATABASE_URL is not configured",
    "Database URL is not configured",
    "HTTP status 402",
    "exceeded the data transfer quota",
    "neon:retryable",
  ].some((pattern) => message.includes(pattern));
}

function isRemoteLoginInvalidCredentialsError(message) {
  return message.includes("Invalid email or password");
}

function getRemoteAccessUnavailableLoginMessage(message) {
  if (message.includes("exceeded the data transfer quota") || message.includes("neon:retryable")) {
    return "Remote login is still connected to the old Neon database, and Neon is over its data transfer quota. Add the Supabase Postgres connection string to Vercel as SUPABASE_DATABASE_URL, redeploy, then reset this user's password.";
  }
  if (message.includes("DATABASE_URL is not configured") || message.includes("Database URL is not configured")) {
    return "Remote login is missing a database connection. Add the Supabase Postgres connection string to Vercel as SUPABASE_DATABASE_URL, redeploy, then reset this user's password.";
  }
  return "Remote login is unavailable right now. Check the Vercel database environment variable, redeploy, then try again.";
}

async function refreshRemoteTeamUsers() {
  if (!authSession?.token || getCurrentUserRole() !== "ADMIN") return;
  try {
    const payload = await requestRemoteAuth("/api/users");
    replaceRemoteTeamUsers(payload.users);
  } catch {
    // Keep local user data if the remote API is not reachable.
  }
}

async function saveRemoteTeamUser({ id, name, email, role, password, jobTitle, isEditing }) {
  if (!authSession?.token) return { handled: false };
  try {
    const payload = await requestRemoteAuth("/api/users", {
      method: isEditing ? "PATCH" : "POST",
      body: JSON.stringify({ id, name, email, role, password, jobTitle }),
    });
    replaceRemoteTeamUsers((payload.users ?? []).map((user) => user.email === email ? { ...user, password: password || findTeamUserByEmail(email)?.password || "", hasPassword: true } : user));
    uiState.settingsUserNotice = isEditing
      ? `${name} was updated in shared access. Remote users can log in with the saved credentials.`
      : `Access granted for ${name}. They can now log in remotely with ${email}.`;
    return { handled: true };
  } catch (error) {
    if (isRemoteAccessUnavailableError(String(error?.message ?? ""))) return { handled: false };
    uiState.settingsUserNotice = `Remote access was not saved: ${error.message}`;
    return { handled: true };
  }
}

async function saveRemoteCurrentUserProfile(updates = {}) {
  if (!authSession?.token) return { handled: false };
  const currentUser = getCurrentTeamUser();
  if (!currentUser?.id) return { handled: false };
  try {
    const payload = await requestRemoteAuth("/api/users", {
      method: "PATCH",
      body: JSON.stringify({
        id: currentUser.id,
        name: updates.name ?? currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        jobTitle: updates.jobTitle ?? currentUser.jobTitle,
        avatarStoragePath: updates.avatarStoragePath ?? currentUser.avatarStoragePath ?? "",
        avatarUrl: updates.avatarUrl ?? currentUser.avatarUrl ?? "",
      }),
    });
    if (Array.isArray(payload.users)) replaceRemoteTeamUsers(payload.users);
    if (payload.user) mergeRemoteTeamUsers([payload.user]);
    return { handled: true };
  } catch (error) {
    return { handled: false, error };
  }
}

async function deleteRemoteTeamUser(userId) {
  if (!authSession?.token) return { handled: false };
  try {
    const payload = await requestRemoteAuth(`/api/users?id=${encodeURIComponent(userId)}`, { method: "DELETE" });
    replaceRemoteTeamUsers(payload.users);
    uiState.settingsUserNotice = "User was removed from shared access.";
    return { handled: true };
  } catch (error) {
    uiState.settingsUserNotice = `Remote access was not removed: ${error.message}`;
    return { handled: true };
  }
}

function startRemoteWorkspaceSync() {
  if (!authSession?.token || remoteWorkspacePollIntervalId) return;
  refreshRemoteWorkspaceState({ force: true });
  remoteWorkspacePollIntervalId = window.setInterval(refreshRemoteWorkspaceState, REMOTE_WORKSPACE_CHAT_POLL_INTERVAL_MS);
}

function stopRemoteWorkspaceSync() {
  if (remoteWorkspaceSyncTimeoutId) {
    window.clearTimeout(remoteWorkspaceSyncTimeoutId);
    remoteWorkspaceSyncTimeoutId = null;
  }
  if (remoteWorkspacePollIntervalId) {
    window.clearInterval(remoteWorkspacePollIntervalId);
    remoteWorkspacePollIntervalId = null;
  }
  remoteWorkspaceRefreshInFlight = false;
  remoteWorkspaceHydrated = false;
  remoteWorkspaceUpdatedAt = null;
  clearRemoteWorkspaceDirtyTracking();
}

function getRemoteWorkspaceSnapshot() {
  return {
    userProducts,
    productSettings,
    workspaceDetails,
    stageSettings,
    workspaceBranding,
    dashboardSettings,
    activityLog,
    campaignPrepSettings,
    keywordResearchSettings,
    vineSettings,
    launchMonitoringSettings,
    cogsTemplateSettings,
  };
}

function persistRemoteWorkspaceSnapshotLocally() {
  safeSetStorageItem(USER_PRODUCTS_STORAGE_KEY, JSON.stringify(userProducts));
  safeSetStorageItem(PRODUCT_SETTINGS_STORAGE_KEY, JSON.stringify(productSettings));
  safeSetStorageItem(WORKSPACE_DETAILS_STORAGE_KEY, JSON.stringify(workspaceDetails));
  safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  safeSetStorageItem(WORKSPACE_BRANDING_STORAGE_KEY, JSON.stringify(workspaceBranding));
  safeSetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify(dashboardSettings));
  safeSetStorageItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(activityLog));
  safeSetStorageItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY, JSON.stringify(campaignPrepSettings));
  safeSetStorageItem(KEYWORD_RESEARCH_SETTINGS_STORAGE_KEY, JSON.stringify(keywordResearchSettings));
  safeSetStorageItem(VINE_SETTINGS_STORAGE_KEY, JSON.stringify(vineSettings));
  safeSetStorageItem(LAUNCH_MONITORING_STORAGE_KEY, JSON.stringify(launchMonitoringSettings));
  safeSetStorageItem(COGS_TEMPLATE_SETTINGS_STORAGE_KEY, JSON.stringify(cogsTemplateSettings));
}

function applyPendingRecoveryWorkspaceBundle() {
  if (typeof window === "undefined") return false;
  const rawBundle = safeGetStorageItem(RECOVERY_WORKSPACE_BUNDLE_STORAGE_KEY);
  if (!rawBundle) return false;

  try {
    const bundle = JSON.parse(rawBundle);
    applyRecoveryWorkspaceBundle(bundle, "recovery-workspace-bundle");
    safeRemoveStorageItem(RECOVERY_WORKSPACE_BUNDLE_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("LaunchFlow could not apply the recovery workspace bundle.", error);
    return false;
  }
}

function applyRecoveryWorkspaceBundle(bundle, source = "recovery-workspace-bundle") {
  const nextWorkspaceDetails = normalizeWorkspaceDetails(bundle?.workspaceDetails);
  const nextUserProducts = normalizeUserProducts(bundle?.userProducts);
  const nextProductSettings = normalizeProductSettings(bundle?.productSettings);
  const existingDeletedProductIds = Array.isArray(productSettings?.deletedProductIds) ? productSettings.deletedProductIds : [];

  if (Object.keys(nextWorkspaceDetails.stageFieldTemplates ?? {}).length === 0 && Object.keys(nextWorkspaceDetails.products ?? {}).length === 0) {
    throw new Error("Recovery bundle has no workspace fields or products.");
  }

  nextProductSettings.deletedProductIds = Array.from(new Set([
    ...nextProductSettings.deletedProductIds,
    ...existingDeletedProductIds,
  ]));
  nextWorkspaceDetails.productHistory = mergeProductHistoryEntries(
    workspaceDetails.productHistory,
    nextWorkspaceDetails.productHistory,
  );
  nextProductSettings.purgedProductHistoryIds = Array.from(new Set([
    ...nextProductSettings.purgedProductHistoryIds,
    ...(productSettings.purgedProductHistoryIds ?? []),
  ]));
  nextWorkspaceDetails.productHistory = nextWorkspaceDetails.productHistory.filter((entry) => !nextProductSettings.purgedProductHistoryIds.includes(entry.id));
  nextProductSettings.deletedProductSnapshots = mergeProductHistoryEntries(
    productSettings.deletedProductSnapshots,
    nextProductSettings.deletedProductSnapshots,
  ).filter((entry) => entry.action === "delete" && !nextProductSettings.purgedProductHistoryIds.includes(entry.id));

  workspaceDetails = nextWorkspaceDetails;
  userProducts = nextUserProducts;
  productSettings = nextProductSettings;
  if (bundle?.cogsTemplateSettings) {
    cogsTemplateSettings = normalizeCogsTemplateSettings(bundle.cogsTemplateSettings);
  }
  persistRemoteWorkspaceSnapshotLocally();
  persistRecoveryRestoreSelection();
  safeSetStorageItem(RECOVERY_NEEDS_REMOTE_PUSH_STORAGE_KEY, JSON.stringify({
    restoredAt: new Date().toISOString(),
    source,
  }));
}

function persistRecoveryRestoreSelection() {
  const preferredProductId = productSettings.edits?.["dummy-stainless-steel-bottle"] ? "dummy-stainless-steel-bottle" : getProductsForSelectedTab("product-research")[0]?.id ?? null;
  uiState.activeView = "pipeline";
  uiState.selectedStageId = "product-research";
  uiState.selectedProductId = preferredProductId;
  uiState.expandedWorkspaceStageIds = new Set(["product-research"]);
  persistUiPreferences();
}

function recoveryWorkspaceNeedsRemotePush() {
  // Legacy browser recovery data is reference-only. Server backups are restored
  // through the explicit admin action and are never auto-published.
  return false;
}

function clearRecoveryRemotePushMarker() {
  safeRemoveStorageItem(RECOVERY_NEEDS_REMOTE_PUSH_STORAGE_KEY);
}

function shouldAutoRecoverWorkspaceFromBundle() {
  const productResearchTemplates = workspaceDetails?.stageFieldTemplates?.["product-research"];
  const hasProductResearchFields = Array.isArray(productResearchTemplates) && productResearchTemplates.length > 0;
  return !hasProductResearchFields;
}

async function autoRecoverWorkspaceFromBundledFile(shell) {
  if (typeof fetch !== "function") return;
  try {
    const response = await fetch("/recovery-workspace-bundle.json", { cache: "no-store" });
    if (!response.ok) {
      startRemoteWorkspaceSync();
      return;
    }
    const bundle = await response.json();
    applyRecoveryWorkspaceBundle(bundle, "auto-recovery-workspace-bundle");
    ensureSelectedProductForStage(true);
    safeRenderApp(shell);
  } catch (error) {
    console.warn("LaunchFlow could not auto-restore the recovered workspace bundle.", error);
    startRemoteWorkspaceSync();
  }
}

function hasRemoteWorkspaceStateKey(state, key) {
  return Object.prototype.hasOwnProperty.call(state, key);
}

function mergeProductHistoryEntries(primaryHistory, secondaryHistory) {
  const entriesById = new Map();
  [...normalizeProductHistory(primaryHistory), ...normalizeProductHistory(secondaryHistory)].forEach((entry) => {
    entriesById.set(entry.id, entry);
  });
  return Array.from(entriesById.values())
    .sort((firstEntry, secondEntry) => Number(secondEntry.timestamp ?? 0) - Number(firstEntry.timestamp ?? 0))
    .slice(0, 1000);
}

function applyRemoteWorkspaceState(state) {
  state = parseRemoteWorkspaceStatePayload(state);
  if (!state || typeof state !== "object") return;
  state = preserveDirtyLocalWorkspaceState(state);
  const hasSharedPipelineStageSettings = hasRemoteWorkspaceStateKey(state, "stageSettings");
  const legacyTableRepair = repairLegacyTargetTableDefaults(normalizeWorkspaceDetails(state.workspaceDetails));
  const nextWorkspaceSnapshot = {
    userProducts: normalizeUserProducts(state.userProducts),
    productSettings: normalizeProductSettings(state.productSettings),
    workspaceDetails: legacyTableRepair.workspaceDetails,
    stageSettings: hasSharedPipelineStageSettings ? normalizeStageSettings(state.stageSettings) : stageSettings,
    workspaceBranding: hasRemoteWorkspaceStateKey(state, "workspaceBranding") ? normalizeWorkspaceBranding(state.workspaceBranding) : workspaceBranding,
    dashboardSettings: hasRemoteWorkspaceStateKey(state, "dashboardSettings") ? normalizeDashboardSettings(state.dashboardSettings) : dashboardSettings,
    activityLog: hasRemoteWorkspaceStateKey(state, "activityLog") ? normalizeActivityLog(state.activityLog) : activityLog,
    campaignPrepSettings: hasRemoteWorkspaceStateKey(state, "campaignPrepSettings") ? normalizeCampaignPrepSettings(state.campaignPrepSettings) : campaignPrepSettings,
    keywordResearchSettings: hasRemoteWorkspaceStateKey(state, "keywordResearchSettings") ? normalizeKeywordResearchSettings(state.keywordResearchSettings) : keywordResearchSettings,
    vineSettings: hasRemoteWorkspaceStateKey(state, "vineSettings") ? normalizeVineSettings(state.vineSettings) : vineSettings,
    launchMonitoringSettings: hasRemoteWorkspaceStateKey(state, "launchMonitoringSettings") ? normalizeLaunchMonitoringSettings(state.launchMonitoringSettings) : launchMonitoringSettings,
    cogsTemplateSettings: hasRemoteWorkspaceStateKey(state, "cogsTemplateSettings")
      ? normalizeCogsTemplateSettings(state.cogsTemplateSettings)
      : cogsTemplateSettings,
  };
  if (legacyTableRepair.changes.length > 0 && canEditProductFieldValues()) {
    markLegacyTargetTableRepairForSharedSync(legacyTableRepair.changes);
  }
  if (JSON.stringify(nextWorkspaceSnapshot) === JSON.stringify(getRemoteWorkspaceSnapshot())) {
    if (repairWorkspaceSelectionForSnapshot(nextWorkspaceSnapshot)) {
      persistUiPreferences();
      renderRemoteWorkspaceStateWhenIdle();
    }
    return;
  }
  const activeChatProductId = uiState.activeChatProductId;
  userProducts = nextWorkspaceSnapshot.userProducts;
  productSettings = nextWorkspaceSnapshot.productSettings;
  workspaceDetails = nextWorkspaceSnapshot.workspaceDetails;
  stageSettings = nextWorkspaceSnapshot.stageSettings;
  workspaceBranding = nextWorkspaceSnapshot.workspaceBranding;
  dashboardSettings = nextWorkspaceSnapshot.dashboardSettings;
  activityLog = nextWorkspaceSnapshot.activityLog;
  campaignPrepSettings = nextWorkspaceSnapshot.campaignPrepSettings;
  keywordResearchSettings = nextWorkspaceSnapshot.keywordResearchSettings;
  vineSettings = nextWorkspaceSnapshot.vineSettings;
  launchMonitoringSettings = nextWorkspaceSnapshot.launchMonitoringSettings;
  cogsTemplateSettings = nextWorkspaceSnapshot.cogsTemplateSettings;
  persistRemoteWorkspaceSnapshotLocally();
  repairWorkspaceSelectionForSnapshot(nextWorkspaceSnapshot);
  persistUiPreferences();
  renderRemoteWorkspaceStateWhenIdle();
  if (activeChatProductId) {
    scrollActiveChatToLatest();
    if (getUnreadProductChatCount(activeChatProductId) > 0) markProductChatRead(activeChatProductId);
  }
}

function markLegacyTargetTableRepairForSharedSync(changes) {
  const normalizedChanges = Array.isArray(changes) ? changes : [];
  markRemoteWorkspaceDirtyKey("workspaceDetails");
  markRemoteWorkspaceDirtyProductIds(normalizedChanges.map((change) => change.productId));
  normalizedChanges.forEach((change) => {
    markRemoteWorkspaceDirtyProductFieldIds(change.productId, change.stageId, [change.fieldId]);
  });
  if (typeof window !== "undefined") {
    window.setTimeout(() => queueRemoteWorkspaceSync(), 0);
  }
}

function preserveDirtyLocalWorkspaceState(remoteState) {
  if (!remoteWorkspaceHydrated) return remoteState;
  if (!remoteWorkspaceDirty && !remoteWorkspaceSyncPendingAfterFlight && remoteWorkspaceDirtyProductIds.size === 0) return remoteState;
  const localSnapshot = getRemoteWorkspaceSnapshot();
  const dirtyKeys = getRemoteWorkspaceDirtyKeysForSnapshot(localSnapshot);
  if (dirtyKeys.length === 0 && remoteWorkspaceDirtyProductIds.size === 0) return remoteState;
  const keys = dirtyKeys.length > 0 ? dirtyKeys : ["userProducts", "productSettings", "workspaceDetails"];
  return mergeDirtyWorkspaceState(remoteState, localSnapshot, keys);
}

function renderRemoteWorkspaceStateWhenIdle() {
  if (isWorkspaceInteractionInProgress()) {
    remoteWorkspaceRenderDeferred = true;
    return;
  }
  remoteWorkspaceRenderDeferred = false;
  renderFromCurrentState();
}

function flushDeferredRemoteWorkspaceRender() {
  if (!remoteWorkspaceRenderDeferred || isWorkspaceInteractionInProgress()) return;
  remoteWorkspaceRenderDeferred = false;
  renderFromCurrentState();
}

function repairWorkspaceSelectionForSnapshot(snapshot, forceStageReset = false) {
  const previousStageId = uiState.selectedStageId;
  const previousProductId = uiState.selectedProductId;
  const snapshotStageSettings = normalizeStageSettings(snapshot?.stageSettings ?? stageSettings);
  const tabMap = new Map(getBaseStageTabs(snapshotStageSettings).map((stageTab) => [stageTab.id, stageTab]));
  const visibleStageIds = snapshotStageSettings.order
    .map((stageId) => tabMap.get(stageId))
    .filter(Boolean)
    .filter((stageTab) => !snapshotStageSettings.hiddenStageIds.includes(stageTab.id))
    .map((stageTab) => stageTab.id);

  if (!visibleStageIds.includes(uiState.selectedStageId)) {
    uiState.selectedStageId = visibleStageIds[0] ?? "product-research";
    uiState.selectedProductId = null;
  }

  const snapshotProducts = getVisibleProductsFromWorkspaceSnapshot(snapshot);
  const selectedProducts = snapshotProducts.filter((product) => {
    if (uiState.selectedStageId === "optimization") return product.stageId === "optimization" || ["stable", "scaling"].includes(product.stageId);
    return product.stageId === uiState.selectedStageId;
  });
  const selectedProductIsVisible = selectedProducts.some((product) => product.id === uiState.selectedProductId);
  const nextProduct = selectedProductIsVisible
    ? snapshotProducts.find((product) => product.id === uiState.selectedProductId)
    : selectedProducts[0];

  uiState.selectedProductId = nextProduct?.id ?? null;
  if (nextProduct && (forceStageReset || previousProductId !== nextProduct.id)) {
    uiState.expandedWorkspaceStageIds = getDefaultExpandedWorkspaceStageIds();
  }
  return previousStageId !== uiState.selectedStageId || previousProductId !== uiState.selectedProductId;
}

function getVisibleProductsFromWorkspaceSnapshot(snapshot) {
  const products = normalizeUserProducts(snapshot?.userProducts);
  const settings = normalizeProductSettings(snapshot?.productSettings);
  const deletedProductIds = new Set(settings.deletedProductIds);
  return products
    .map((product) => ({ ...product, ...(settings.edits[product.id] ?? {}) }))
    .filter((product) => !deletedProductIds.has(product.id));
}

function parseRemoteWorkspaceStatePayload(state) {
  if (!state) return null;
  if (typeof state === "object" && !Array.isArray(state)) return state;
  if (typeof state !== "string") return null;
  try {
    const parsedState = JSON.parse(state);
    return parsedState && typeof parsedState === "object" && !Array.isArray(parsedState) ? parsedState : null;
  } catch {
    return null;
  }
}

function rememberRemoteWorkspaceVersion(payload) {
  remoteWorkspaceUpdatedAt = payload?.updatedAt ?? null;
}

function markRemoteWorkspaceDirtyKey(key) {
  if (!key) return;
  remoteWorkspaceDirtyKeys.add(key);
}

function markRemoteWorkspaceDirtyProductIds(productIds) {
  for (const productId of productIds ?? []) {
    const cleanProductId = String(productId ?? "").trim();
    if (cleanProductId) remoteWorkspaceDirtyProductIds.add(cleanProductId);
  }
}

function clearRemoteWorkspaceDirtyTracking() {
  remoteWorkspaceDirty = false;
  remoteWorkspaceDirtyKeys.clear();
  remoteWorkspaceDirtyProductIds.clear();
  remoteWorkspaceDirtyTemplateStageIds.clear();
  remoteWorkspaceDirtyProductStageIds.clear();
  remoteWorkspaceDirtyProductFieldIds.clear();
  remoteWorkspaceDirtyProductMetadataIds.clear();
}

function getChangedProductIdsFromProductLists(previousProducts, nextProducts) {
  const previousMap = new Map(normalizeUserProducts(previousProducts).map((product) => [product.id, product]));
  const nextMap = new Map(normalizeUserProducts(nextProducts).map((product) => [product.id, product]));
  const changedProductIds = new Set([...previousMap.keys(), ...nextMap.keys()]);
  for (const productId of Array.from(changedProductIds)) {
    if (JSON.stringify(previousMap.get(productId) ?? null) === JSON.stringify(nextMap.get(productId) ?? null)) {
      changedProductIds.delete(productId);
    }
  }
  return Array.from(changedProductIds);
}

function getChangedProductIdsFromProductSettings(previousSettings, nextSettings) {
  const previousProductSettings = normalizeProductSettings(previousSettings);
  const nextProductSettings = normalizeProductSettings(nextSettings);
  const changedProductIds = new Set([
    ...Object.keys(previousProductSettings.edits),
    ...Object.keys(nextProductSettings.edits),
    ...previousProductSettings.deletedProductIds,
    ...nextProductSettings.deletedProductIds,
    ...previousProductSettings.deletedProductSnapshots.map((entry) => entry.productId),
    ...nextProductSettings.deletedProductSnapshots.map((entry) => entry.productId),
  ].filter(Boolean));

  for (const productId of Array.from(changedProductIds)) {
    const previousSnapshot = {
      edit: previousProductSettings.edits[productId] ?? null,
      deleted: previousProductSettings.deletedProductIds.includes(productId),
      snapshots: previousProductSettings.deletedProductSnapshots.filter((entry) => entry.productId === productId),
    };
    const nextSnapshot = {
      edit: nextProductSettings.edits[productId] ?? null,
      deleted: nextProductSettings.deletedProductIds.includes(productId),
      snapshots: nextProductSettings.deletedProductSnapshots.filter((entry) => entry.productId === productId),
    };
    if (JSON.stringify(previousSnapshot) === JSON.stringify(nextSnapshot)) changedProductIds.delete(productId);
  }
  return Array.from(changedProductIds);
}

function getChangedProductIdsFromWorkspaceDetails(previousDetails, nextDetails) {
  const previousWorkspaceDetails = normalizeWorkspaceDetails(previousDetails);
  const nextWorkspaceDetails = normalizeWorkspaceDetails(nextDetails);
  const changedProductIds = new Set([
    ...Object.keys(previousWorkspaceDetails.products),
    ...Object.keys(nextWorkspaceDetails.products),
  ]);
  for (const productId of Array.from(changedProductIds)) {
    if (JSON.stringify(previousWorkspaceDetails.products[productId] ?? null) === JSON.stringify(nextWorkspaceDetails.products[productId] ?? null)) {
      changedProductIds.delete(productId);
    }
  }
  return Array.from(changedProductIds);
}

function getChangedWorkspaceTemplateStageIds(previousDetails, nextDetails) {
  const previousTemplates = normalizeWorkspaceDetails(previousDetails).stageFieldTemplates;
  const nextTemplates = normalizeWorkspaceDetails(nextDetails).stageFieldTemplates;
  const stageIds = new Set([...Object.keys(previousTemplates), ...Object.keys(nextTemplates)]);
  return Array.from(stageIds).filter((stageId) => JSON.stringify(previousTemplates[stageId] ?? null) !== JSON.stringify(nextTemplates[stageId] ?? null));
}

function markRemoteWorkspaceDirtyProductDetailScopes(previousDetails, nextDetails) {
  const previousProducts = normalizeWorkspaceDetails(previousDetails).products;
  const nextProducts = normalizeWorkspaceDetails(nextDetails).products;
  const productIds = new Set([...Object.keys(previousProducts), ...Object.keys(nextProducts)]);
  for (const productId of productIds) {
    const previousProduct = previousProducts[productId] ?? null;
    const nextProduct = nextProducts[productId] ?? null;
    if (!previousProduct || !nextProduct) {
      remoteWorkspaceDirtyProductMetadataIds.add(productId);
      continue;
    }
    const previousStages = previousProduct.stages ?? {};
    const nextStages = nextProduct.stages ?? {};
    const stageIds = new Set([...Object.keys(previousStages), ...Object.keys(nextStages)]);
    for (const stageId of stageIds) {
      const previousStage = previousStages[stageId] ?? null;
      const nextStage = nextStages[stageId] ?? null;
      if (JSON.stringify(previousStage) === JSON.stringify(nextStage)) continue;
      if (previousStage && nextStage && stageChangeContainsOnlyFields(previousStage, nextStage)) {
        markRemoteWorkspaceDirtyProductFieldIds(productId, stageId, getChangedWorkspaceFieldIds(previousStage, nextStage));
        continue;
      }
      const changedStages = remoteWorkspaceDirtyProductStageIds.get(productId) ?? new Set();
      changedStages.add(stageId);
      remoteWorkspaceDirtyProductStageIds.set(productId, changedStages);
    }
    const { stages: previousStageValues, ...previousMetadata } = previousProduct;
    const { stages: nextStageValues, ...nextMetadata } = nextProduct;
    if (JSON.stringify(previousMetadata) !== JSON.stringify(nextMetadata)) remoteWorkspaceDirtyProductMetadataIds.add(productId);
  }
}

function stageChangeContainsOnlyFields(previousStage, nextStage) {
  const { customFields: previousFields, ...previousStageMetadata } = previousStage;
  const { customFields: nextFields, ...nextStageMetadata } = nextStage;
  return JSON.stringify(previousStageMetadata) === JSON.stringify(nextStageMetadata);
}

function getChangedWorkspaceFieldIds(previousStage, nextStage) {
  const previousFields = new Map((Array.isArray(previousStage?.customFields) ? previousStage.customFields : [])
    .map((field) => [String(field?.fieldId || "").trim(), field])
    .filter(([fieldId]) => fieldId));
  const nextFields = new Map((Array.isArray(nextStage?.customFields) ? nextStage.customFields : [])
    .map((field) => [String(field?.fieldId || "").trim(), field])
    .filter(([fieldId]) => fieldId));
  return Array.from(new Set([...previousFields.keys(), ...nextFields.keys()]))
    .filter((fieldId) => JSON.stringify(previousFields.get(fieldId) ?? null) !== JSON.stringify(nextFields.get(fieldId) ?? null));
}

function markRemoteWorkspaceDirtyProductFieldIds(productId, stageId, fieldIds) {
  const cleanProductId = String(productId || "").trim();
  const cleanStageId = String(stageId || "").trim();
  if (!cleanProductId || !cleanStageId) return;
  const fields = Array.isArray(fieldIds) ? fieldIds.map((fieldId) => String(fieldId || "").trim()).filter(Boolean) : [];
  if (fields.length === 0) return;
  const stages = remoteWorkspaceDirtyProductFieldIds.get(cleanProductId) ?? new Map();
  const changedFields = stages.get(cleanStageId) ?? new Set();
  fields.forEach((fieldId) => changedFields.add(fieldId));
  stages.set(cleanStageId, changedFields);
  remoteWorkspaceDirtyProductFieldIds.set(cleanProductId, stages);
}

function getRemoteWorkspaceDirtyProductStageIds() {
  return Object.fromEntries(Array.from(remoteWorkspaceDirtyProductStageIds.entries())
    .map(([productId, stageIds]) => [productId, Array.from(stageIds)]));
}

function getRemoteWorkspaceDirtyProductFieldIds() {
  return Object.fromEntries(Array.from(remoteWorkspaceDirtyProductFieldIds.entries())
    .map(([productId, stages]) => [productId, Object.fromEntries(Array.from(stages.entries())
      .map(([stageId, fieldIds]) => [stageId, Array.from(fieldIds)]))]));
}

function waitForRemoteWorkspaceSyncIdle() {
  if (!remoteWorkspaceSyncInFlight) return Promise.resolve();
  return new Promise((resolve) => remoteWorkspaceSyncIdleWaiters.push(resolve));
}

function notifyRemoteWorkspaceSyncIdle() {
  const waiters = remoteWorkspaceSyncIdleWaiters;
  remoteWorkspaceSyncIdleWaiters = [];
  waiters.forEach((resolve) => resolve());
}

function isSharedWorkspaceConflictError(error) {
  return Number(error?.status) === 409 && Boolean(error?.payload?.conflict);
}

function mergeDirtyWorkspaceState(remoteState, localState, dirtyKeys, options = {}) {
  const nextState = {
    ...(remoteState && typeof remoteState === "object" ? remoteState : {}),
  };
  const localSnapshot = localState && typeof localState === "object" ? localState : {};
  const keys = Array.from(dirtyKeys ?? []).filter((key) => Object.prototype.hasOwnProperty.call(localSnapshot, key));
  for (const key of keys) {
    if (key === "stageSettings" && !canEditPipelineTabs()) continue;
    if (key === "userProducts") {
      nextState.userProducts = mergeUserProductsForDirtySync(nextState.userProducts, localSnapshot.userProducts);
      continue;
    }
    if (key === "productSettings") {
      nextState.productSettings = mergeProductSettingsForDirtySync(nextState.productSettings, localSnapshot.productSettings);
      continue;
    }
    if (key === "workspaceDetails") {
      nextState.workspaceDetails = mergeWorkspaceDetailsForDirtySync(nextState.workspaceDetails, localSnapshot.workspaceDetails, options);
      continue;
    }
    if (key === "activityLog") {
      nextState.activityLog = mergeActivityLogForDirtySync(nextState.activityLog, localSnapshot.activityLog);
      continue;
    }
    if (key === "keywordResearchSettings") {
      nextState.keywordResearchSettings = mergeKeywordResearchSettingsForDirtySync(nextState.keywordResearchSettings, localSnapshot.keywordResearchSettings);
      continue;
    }
    if (key === "cogsTemplateSettings") {
      nextState.cogsTemplateSettings = canManageCogsTemplate()
        ? normalizeCogsTemplateSettings(localSnapshot.cogsTemplateSettings)
        : normalizeCogsTemplateSettings(nextState.cogsTemplateSettings);
      continue;
    }
    nextState[key] = localSnapshot[key];
  }
  return nextState;
}

function getDirtyProductIdsForConflictMerge(remoteProducts, localProducts) {
  if (recoveryWorkspaceNeedsRemotePush()) {
    return new Set([
      ...normalizeUserProducts(remoteProducts).map((product) => product.id),
      ...normalizeUserProducts(localProducts).map((product) => product.id),
    ]);
  }
  return new Set(remoteWorkspaceDirtyProductIds);
}

function mergeUserProductsForDirtySync(remoteProducts, localProducts) {
  const dirtyProductIds = getDirtyProductIdsForConflictMerge(remoteProducts, localProducts);
  if (dirtyProductIds.size === 0) return normalizeUserProducts(remoteProducts);
  const productsById = new Map(normalizeUserProducts(remoteProducts).map((product) => [product.id, product]));
  const localProductsById = new Map(normalizeUserProducts(localProducts).map((product) => [product.id, product]));
  for (const productId of dirtyProductIds) {
    if (localProductsById.has(productId)) {
      productsById.set(productId, localProductsById.get(productId));
    } else {
      productsById.delete(productId);
    }
  }
  return normalizeUserProducts(Array.from(productsById.values()));
}

function mergeProductSettingsForDirtySync(remoteSettings, localSettings) {
  const remoteProductSettings = normalizeProductSettings(remoteSettings);
  const localProductSettings = normalizeProductSettings(localSettings);
  const dirtyProductIds = new Set(recoveryWorkspaceNeedsRemotePush()
    ? [
      ...Object.keys(remoteProductSettings.edits),
      ...Object.keys(localProductSettings.edits),
      ...remoteProductSettings.deletedProductIds,
      ...localProductSettings.deletedProductIds,
      ...remoteProductSettings.deletedProductSnapshots.map((entry) => entry.productId),
      ...localProductSettings.deletedProductSnapshots.map((entry) => entry.productId),
    ].filter(Boolean)
    : remoteWorkspaceDirtyProductIds);

  const nextSettings = normalizeProductSettings(remoteProductSettings);
  for (const productId of dirtyProductIds) {
    if (localProductSettings.edits[productId]) {
      nextSettings.edits[productId] = localProductSettings.edits[productId];
    } else {
      delete nextSettings.edits[productId];
    }
  }
  nextSettings.deletedProductIds = Array.from(new Set([
    ...nextSettings.deletedProductIds.filter((productId) => !dirtyProductIds.has(productId)),
    ...localProductSettings.deletedProductIds.filter((productId) => dirtyProductIds.has(productId)),
  ]));
  nextSettings.deletedProductSnapshots = normalizeDeletedProductSnapshots([
    ...nextSettings.deletedProductSnapshots.filter((entry) => !dirtyProductIds.has(entry.productId)),
    ...localProductSettings.deletedProductSnapshots.filter((entry) => dirtyProductIds.has(entry.productId)),
  ]);
  nextSettings.purgedProductHistoryIds = Array.from(new Set([
    ...nextSettings.purgedProductHistoryIds,
    ...localProductSettings.purgedProductHistoryIds,
  ]));
  return normalizeProductSettings(nextSettings);
}

function mergeActivityLogForDirtySync(remoteActivityLog, localActivityLog) {
  const entriesById = new Map();
  normalizeActivityLog(remoteActivityLog).forEach((entry) => entriesById.set(entry.id, entry));
  normalizeActivityLog(localActivityLog).forEach((entry) => entriesById.set(entry.id, entry));
  return normalizeActivityLog(Array.from(entriesById.values()));
}

function mergeKeywordResearchSettingsForDirtySync(remoteSettings, localSettings) {
  const remoteKeywordSettings = normalizeKeywordResearchSettings(remoteSettings);
  const localKeywordSettings = normalizeKeywordResearchSettings(localSettings);
  if (canManageWorkspaceFieldTemplates()) return localKeywordSettings;
  return normalizeKeywordResearchSettings({
    ...localKeywordSettings,
    spreadsheetUrl: remoteKeywordSettings.spreadsheetUrl,
    columns: remoteKeywordSettings.columns,
  });
}

function mergeWorkspaceDetailsForDirtySync(remoteDetails, localDetails, options = {}) {
  const remoteWorkspaceDetails = normalizeWorkspaceDetails(remoteDetails);
  const localWorkspaceDetails = normalizeWorkspaceDetails(localDetails);
  const preserveRemoteImages = options.preserveRemoteImages !== false;
  const dirtyProductIds = new Set(recoveryWorkspaceNeedsRemotePush()
    ? [...Object.keys(remoteWorkspaceDetails.products), ...Object.keys(localWorkspaceDetails.products)]
    : remoteWorkspaceDirtyProductIds);
  const mergedProducts = { ...remoteWorkspaceDetails.products };
  for (const productId of dirtyProductIds) {
    if (localWorkspaceDetails.products[productId]) {
      mergedProducts[productId] = mergeWorkspaceProductDetailsForDirtySync(
        remoteWorkspaceDetails.products[productId],
        localWorkspaceDetails.products[productId],
        { preserveRemoteImages },
      );
    } else {
      delete mergedProducts[productId];
    }
  }
  return normalizeWorkspaceDetails({
    products: mergedProducts,
    stageFieldTemplates: canManageWorkspaceFieldTemplates()
      ? localWorkspaceDetails.stageFieldTemplates
      : mergeWorkspaceTableTemplateAdjustments(remoteWorkspaceDetails.stageFieldTemplates, localWorkspaceDetails.stageFieldTemplates),
    fieldHistory: mergeWorkspaceFieldHistoryEntries(remoteWorkspaceDetails.fieldHistory, localWorkspaceDetails.fieldHistory),
    productHistory: mergeProductHistoryEntries(remoteWorkspaceDetails.productHistory, localWorkspaceDetails.productHistory),
  });
}

function mergeWorkspaceProductDetailsForDirtySync(remoteProductDetails, localProductDetails, options = {}) {
  const nextProductDetails = structuredCloneWorkspaceFieldValue(localProductDetails);
  if (options.preserveRemoteImages === false) return nextProductDetails;
  if (hasWorkspaceProductImageReference(nextProductDetails) || !hasWorkspaceProductImageReference(remoteProductDetails)) return nextProductDetails;
  nextProductDetails.imageStoragePath = remoteProductDetails.imageStoragePath || "";
  nextProductDetails.imageUrl = remoteProductDetails.imageUrl || "";
  return nextProductDetails;
}

function hasWorkspaceProductImageReference(productDetails) {
  return Boolean(String(productDetails?.imageStoragePath ?? "").trim() || String(productDetails?.imageUrl ?? "").trim());
}

function mergeWorkspaceTableTemplateAdjustments(remoteTemplatesByStage, localTemplatesByStage) {
  const mergedTemplatesByStage = structuredCloneWorkspaceFieldValue(remoteTemplatesByStage && typeof remoteTemplatesByStage === "object" ? remoteTemplatesByStage : {});
  const localByStage = localTemplatesByStage && typeof localTemplatesByStage === "object" ? localTemplatesByStage : {};
  for (const [stageId, localTemplates] of Object.entries(localByStage)) {
    if (!Array.isArray(localTemplates)) continue;
    const remoteTemplates = Array.isArray(mergedTemplatesByStage[stageId]) ? mergedTemplatesByStage[stageId] : [];
    mergedTemplatesByStage[stageId] = remoteTemplates.map((remoteTemplate) => {
      if (!isWorkspaceTableFieldType(remoteTemplate?.type)) return remoteTemplate;
      const localTemplate = localTemplates.find((item) => item?.fieldId === remoteTemplate.fieldId && item?.type === remoteTemplate.type);
      if (!localTemplate) return remoteTemplate;
      return {
        ...remoteTemplate,
        tableColumns: normalizeFieldList(localTemplate.tableColumns),
        tableRows: normalizeFieldList(localTemplate.tableRows),
        tableCornerHeader: normalizeTableCornerHeader(localTemplate.tableCornerHeader),
        tableColumnWidths: normalizeTableDimensionList(localTemplate.tableColumnWidths),
        tableRowHeights: normalizeTableDimensionList(localTemplate.tableRowHeights),
      };
    });
  }
  return mergedTemplatesByStage;
}

function mergeWorkspaceFieldHistoryEntries(primaryHistory, secondaryHistory) {
  const entriesById = new Map();
  [...normalizeWorkspaceFieldHistory(primaryHistory), ...normalizeWorkspaceFieldHistory(secondaryHistory)].forEach((entry) => {
    entriesById.set(entry.id, entry);
  });
  return normalizeWorkspaceFieldHistory(Array.from(entriesById.values()));
}

function getRemoteWorkspaceDirtyKeysForSnapshot(snapshot) {
  return Array.from(remoteWorkspaceDirtyKeys);
}

function getScopedWorkspaceSaveMetadata(snapshot = getRemoteWorkspaceSnapshot()) {
  return {
    syncMode: "scoped",
    dirtyKeys: getRemoteWorkspaceDirtyKeysForSnapshot(snapshot),
    dirtyProductIds: Array.from(remoteWorkspaceDirtyProductIds),
    dirtyTemplateStageIds: Array.from(remoteWorkspaceDirtyTemplateStageIds),
    dirtyProductStageIds: getRemoteWorkspaceDirtyProductStageIds(),
    dirtyProductFieldIds: getRemoteWorkspaceDirtyProductFieldIds(),
    dirtyProductMetadataIds: Array.from(remoteWorkspaceDirtyProductMetadataIds),
  };
}

function mergeRequiredProductsIntoWorkspaceState(remoteState, localState, productIds) {
  const requiredProductIds = Array.isArray(productIds) ? productIds.filter(Boolean) : [];
  if (requiredProductIds.length === 0) return remoteState;
  const nextState = {
    ...(remoteState && typeof remoteState === "object" ? remoteState : {}),
  };
  const remoteProducts = normalizeUserProducts(nextState.userProducts);
  const localProducts = normalizeUserProducts(localState?.userProducts);
  const productsById = new Map(remoteProducts.map((product) => [product.id, product]));
  for (const productId of requiredProductIds) {
    const localProduct = localProducts.find((product) => product.id === productId);
    if (localProduct) productsById.set(productId, localProduct);
  }
  nextState.userProducts = Array.from(productsById.values());

  const remoteDetails = normalizeWorkspaceDetails(nextState.workspaceDetails);
  const localDetails = normalizeWorkspaceDetails(localState?.workspaceDetails);
  for (const productId of requiredProductIds) {
    if (localDetails.products?.[productId]) remoteDetails.products[productId] = localDetails.products[productId];
  }
  nextState.workspaceDetails = remoteDetails;

  const remoteProductSettings = normalizeProductSettings(nextState.productSettings);
  const localProductSettings = normalizeProductSettings(localState?.productSettings);
  for (const productId of requiredProductIds) {
    if (localProductSettings.edits?.[productId]) remoteProductSettings.edits[productId] = localProductSettings.edits[productId];
  }
  remoteProductSettings.deletedProductIds = remoteProductSettings.deletedProductIds.filter((productId) => !requiredProductIds.includes(productId));
  remoteProductSettings.deletedProductSnapshots = remoteProductSettings.deletedProductSnapshots.filter((entry) => !requiredProductIds.includes(entry.productId));
  nextState.productSettings = remoteProductSettings;

  return nextState;
}

function isWorkspaceInteractionInProgress() {
  if (uiState.fieldModal || uiState.imageGalleryPreview || uiState.cogsCalculatorModal) return true;
  if (typeof document === "undefined") return false;
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  if (activeElement instanceof HTMLIFrameElement && activeElement.classList.contains("workspace-sheet-field__frame")) return true;
  if (activeElement instanceof HTMLTextAreaElement && activeElement.getAttribute("data-action") === "chat-message-input") {
    return Boolean(activeElement.value || uiState.pendingChatAttachments.length || uiState.editingChatMessageId || uiState.replyingToChatMessageId);
  }
  if (uiState.activeChatProductId) return false;
  if (workspaceSelectInteractionActive) return true;
  const tagName = activeElement.tagName;
  return tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA" || activeElement.isContentEditable;
}

async function refreshRemoteWorkspaceState({ force = false } = {}) {
  if (!authSession?.token) return;
  if (recoveryWorkspaceNeedsRemotePush()) {
    queueRemoteWorkspaceSync();
    return;
  }
  if (remoteWorkspaceRefreshInFlight) return;
  const wasHydrated = remoteWorkspaceHydrated;
  if ((remoteWorkspaceDirty && remoteWorkspaceHydrated) || remoteWorkspaceSyncInFlight) return;
  if (!force && remoteWorkspaceHydrated && isWorkspaceInteractionInProgress()) return;
  remoteWorkspaceRefreshInFlight = true;
  try {
    const payload = await requestRemoteAuth("/api/workspace-state", { timeoutMs: wasHydrated ? 45000 : 60000 });
    rememberRemoteWorkspaceVersion(payload);
    if (payload.state) {
      applyRemoteWorkspaceState(payload.state);
      remoteWorkspaceHydrated = true;
    } else {
      remoteWorkspaceHydrated = true;
      queueRemoteWorkspaceSync();
    }
    if (uiState.sharedWorkspaceSaveStatus === "error" && uiState.sharedWorkspaceSaveNotice.startsWith("Shared workspace could not load:")) {
      uiState.sharedWorkspaceSaveStatus = "";
      uiState.sharedWorkspaceSaveNotice = "";
    }
    if (!wasHydrated) renderFromCurrentState();
  } catch (error) {
    console.warn("LaunchFlow could not refresh shared workspace state.", error);
    if (!wasHydrated) {
      if (useCachedWorkspaceAfterInitialLoadFailure(error)) {
        renderFromCurrentState();
        return;
      }
      setSharedWorkspaceSaveStatus("error", `Shared workspace could not load: ${error instanceof Error ? error.message : String(error)}`);
      renderFromCurrentState();
    }
  } finally {
    remoteWorkspaceRefreshInFlight = false;
  }
}

function hasCachedWorkspaceSnapshot() {
  if (typeof window === "undefined") return false;
  return Boolean(
    safeGetStorageItem(USER_PRODUCTS_STORAGE_KEY)
    || safeGetStorageItem(PRODUCT_SETTINGS_STORAGE_KEY)
    || safeGetStorageItem(WORKSPACE_DETAILS_STORAGE_KEY)
  );
}

function useCachedWorkspaceAfterInitialLoadFailure(error) {
  if (!hasCachedWorkspaceSnapshot()) return false;
  setSharedWorkspaceSaveStatus(
    "error",
    `Shared workspace is temporarily unreachable. Cached data is read-only until the latest shared workspace loads: ${error instanceof Error ? error.message : String(error)}`,
  );
  return true;
}

function queueRemoteWorkspaceSync() {
  if (!authSession?.token) return;
  if (!remoteWorkspaceHydrated) return;
  remoteWorkspaceDirty = true;
  if (remoteWorkspaceImmediateSavePreparing) {
    remoteWorkspaceSyncPendingAfterFlight = true;
    return;
  }
  if (remoteWorkspaceSyncInFlight) {
    remoteWorkspaceSyncPendingAfterFlight = true;
    return;
  }
  if (remoteWorkspaceSyncTimeoutId) window.clearTimeout(remoteWorkspaceSyncTimeoutId);
  remoteWorkspaceSyncTimeoutId = window.setTimeout(syncRemoteWorkspaceState, 800);
}

function flushRemoteWorkspaceSyncSoon(delayMs = 100) {
  if (!authSession?.token || typeof window === "undefined") return;
  if (!remoteWorkspaceHydrated) return;
  if (remoteWorkspaceSyncTimeoutId) window.clearTimeout(remoteWorkspaceSyncTimeoutId);
  remoteWorkspaceDirty = true;
  if (remoteWorkspaceSyncInFlight) {
    remoteWorkspaceSyncPendingAfterFlight = true;
    return;
  }
  remoteWorkspaceSyncTimeoutId = window.setTimeout(syncRemoteWorkspaceState, Math.max(0, Number(delayMs) || 0));
}

async function syncRemoteWorkspaceState() {
  if (!authSession?.token) return;
  remoteWorkspaceSyncTimeoutId = null;
  if (!remoteWorkspaceDirty && !remoteWorkspaceSyncPendingAfterFlight) return;
  if (remoteWorkspaceSyncInFlight) {
    remoteWorkspaceSyncPendingAfterFlight = true;
    return;
  }
  if (!remoteWorkspaceHydrated && !recoveryWorkspaceNeedsRemotePush()) {
    await refreshRemoteWorkspaceState({ force: true });
    remoteWorkspaceSyncTimeoutId = window.setTimeout(syncRemoteWorkspaceState, 500);
    return;
  }
  remoteWorkspaceSyncInFlight = true;
  remoteWorkspaceSyncPendingAfterFlight = false;
  try {
    const localSnapshot = await prepareSharedWorkspaceSnapshotForSync();
    const payload = await requestRemoteAuth("/api/workspace-state", {
      method: "PATCH",
      body: JSON.stringify({
        baseUpdatedAt: remoteWorkspaceUpdatedAt,
        state: localSnapshot,
        ...getScopedWorkspaceSaveMetadata(localSnapshot),
      }),
    });
    rememberRemoteWorkspaceVersion(payload);
    if (payload.state) applyRemoteWorkspaceState(payload.state);
    if (recoveryWorkspaceNeedsRemotePush()) clearRecoveryRemotePushMarker();
    if (!remoteWorkspaceSyncPendingAfterFlight) {
      clearRemoteWorkspaceDirtyTracking();
    }
  } catch (error) {
    if (isSharedWorkspaceConflictError(error)) {
      rememberRemoteWorkspaceVersion(error.payload);
      try {
        const localSnapshot = await prepareSharedWorkspaceSnapshotForSync();
        const mergedState = mergeDirtyWorkspaceState(error.payload.state, localSnapshot, getRemoteWorkspaceDirtyKeysForSnapshot(localSnapshot));
        const retryPayload = await requestRemoteAuth("/api/workspace-state", {
          method: "PATCH",
          body: JSON.stringify({
            baseUpdatedAt: remoteWorkspaceUpdatedAt,
            state: mergedState,
            ...getScopedWorkspaceSaveMetadata(mergedState),
          }),
        });
        rememberRemoteWorkspaceVersion(retryPayload);
        if (retryPayload.state) applyRemoteWorkspaceState(retryPayload.state);
        if (recoveryWorkspaceNeedsRemotePush()) clearRecoveryRemotePushMarker();
        if (!remoteWorkspaceSyncPendingAfterFlight) {
          clearRemoteWorkspaceDirtyTracking();
        }
      } catch (retryError) {
        console.warn("LaunchFlow could not retry shared workspace sync after conflict.", retryError);
        if (error.payload.state) applyRemoteWorkspaceState(error.payload.state);
        setSharedWorkspaceSaveStatus("error", "Shared workspace changed in another session. Latest version loaded; please retry your last edit if needed.");
        renderFromCurrentState();
      }
      return;
    }
    console.warn("LaunchFlow could not sync shared workspace state.", error);
  } finally {
    remoteWorkspaceSyncInFlight = false;
    notifyRemoteWorkspaceSyncIdle();
    if (remoteWorkspaceSyncPendingAfterFlight) {
      remoteWorkspaceSyncTimeoutId = window.setTimeout(syncRemoteWorkspaceState, 0);
    } else if (remoteWorkspaceDirty) {
      remoteWorkspaceSyncTimeoutId = window.setTimeout(syncRemoteWorkspaceState, REMOTE_WORKSPACE_SYNC_RETRY_DELAY_MS);
    }
  }
}

function setSharedWorkspaceSaveStatus(status, notice) {
  uiState.sharedWorkspaceSaveStatus = status;
  uiState.sharedWorkspaceSaveNotice = notice;
}

function reportSharedWorkspaceSaveError(error) {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  setSharedWorkspaceSaveStatus("error", `Save failed: ${message}`);
  renderFromCurrentState();
}

function clearSharedWorkspaceSaveNoticeSoon() {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    if (uiState.sharedWorkspaceSaveStatus !== "saved") return;
    uiState.sharedWorkspaceSaveStatus = "";
    uiState.sharedWorkspaceSaveNotice = "";
    renderFromCurrentState();
  }, 1800);
}

function completeImmediateWorkspaceSave() {
  remoteWorkspaceHydrated = true;
  if (!remoteWorkspaceSyncPendingAfterFlight) clearRemoteWorkspaceDirtyTracking();
  if (recoveryWorkspaceNeedsRemotePush()) clearRecoveryRemotePushMarker();
}

function getWorkspaceStateProductIds(state) {
  state = parseRemoteWorkspaceStatePayload(state);
  const rawProducts = Array.isArray(state?.userProducts) ? state.userProducts : [];
  return new Set(rawProducts
    .map((product) => String(product?.id ?? "").trim())
    .filter(Boolean));
}

function assertSharedWorkspaceProductsSaved(state, productIds) {
  const requiredProductIds = Array.isArray(productIds) ? productIds.filter(Boolean) : [];
  if (requiredProductIds.length === 0) return;
  const savedProductIds = getWorkspaceStateProductIds(state);
  const missingProductIds = requiredProductIds.filter((productId) => !savedProductIds.has(productId));
  if (missingProductIds.length > 0) {
    throw new Error("Shared workspace save did not confirm the new product. Please try again before refreshing.");
  }
}

async function retrySharedWorkspaceProductSaveIfMissing(savedState, localSnapshot, productIds, reason) {
  savedState = parseRemoteWorkspaceStatePayload(savedState);
  const requiredProductIds = Array.isArray(productIds) ? productIds.filter(Boolean) : [];
  if (requiredProductIds.length === 0) return savedState;
  const savedProductIds = getWorkspaceStateProductIds(savedState);
  const hasAllProducts = requiredProductIds.every((productId) => savedProductIds.has(productId));
  if (hasAllProducts) return savedState;

  const mergedState = mergeRequiredProductsIntoWorkspaceState(savedState, localSnapshot, requiredProductIds);
  const retryPayload = await requestRemoteAuth("/api/workspace-state", {
    method: "PATCH",
      body: JSON.stringify({
        baseUpdatedAt: remoteWorkspaceUpdatedAt,
        reason: `${reason}-product-confirm-retry`,
        state: mergedState,
        ...getScopedWorkspaceSaveMetadata(mergedState),
      }),
  });
  rememberRemoteWorkspaceVersion(retryPayload);
  const retryState = parseRemoteWorkspaceStatePayload(retryPayload.state);
  assertSharedWorkspaceProductsSaved(retryState, requiredProductIds);
  return retryState ?? mergedState;
}

async function saveSharedWorkspaceNow(reason = "workspace-save", options = {}) {
  const savingNotice = options.savingNotice || "Saving shared workspace...";
  const savedNotice = options.savedNotice || "Saved";
  const renderSaveState = () => {
    if (options.preserveCogsScroll && uiState.cogsCalculatorModal) {
      renderCogsCalculatorPreservingScroll();
      return;
    }
    renderFromCurrentState();
  };
  if (!authSession?.token) {
    throw new Error("Remote workspace session is missing. Please sign out, sign in again, then save.");
  }
  if (!remoteWorkspaceHydrated && !recoveryWorkspaceNeedsRemotePush()) {
    throw new Error("Shared workspace is still loading. Please try again in a moment.");
  }
  if (remoteWorkspaceSyncTimeoutId) {
    window.clearTimeout(remoteWorkspaceSyncTimeoutId);
    remoteWorkspaceSyncTimeoutId = null;
  }
  while (remoteWorkspaceSyncInFlight) await waitForRemoteWorkspaceSyncIdle();
  setSharedWorkspaceSaveStatus("saving", savingNotice);
  renderSaveState();
  remoteWorkspaceDirty = true;
  remoteWorkspaceSyncInFlight = true;
  remoteWorkspaceSyncPendingAfterFlight = false;
  try {
    const localSnapshot = await prepareSharedWorkspaceSnapshotForSync();
    const payload = await requestRemoteAuth("/api/workspace-state", {
      method: "PATCH",
      body: JSON.stringify({
        baseUpdatedAt: remoteWorkspaceUpdatedAt,
        reason,
        state: localSnapshot,
        ...getScopedWorkspaceSaveMetadata(localSnapshot),
      }),
    });
    rememberRemoteWorkspaceVersion(payload);
    const savedState = await retrySharedWorkspaceProductSaveIfMissing(payload.state, localSnapshot, options.requireProductIds, reason);
    assertSharedWorkspaceProductsSaved(savedState, options.requireProductIds);
    if (savedState) applyRemoteWorkspaceState(savedState);
    completeImmediateWorkspaceSave();
    setSharedWorkspaceSaveStatus("saved", savedNotice);
    clearSharedWorkspaceSaveNoticeSoon();
    return true;
  } catch (error) {
    if (isSharedWorkspaceConflictError(error) && options.retryOnConflict === false) {
      rememberRemoteWorkspaceVersion(error.payload);
      remoteWorkspaceDirty = true;
      setSharedWorkspaceSaveStatus("error", "Shared COGS template changed in another session. Review the latest template before saving again.");
      throw error;
    }
    if (isSharedWorkspaceConflictError(error) && Array.isArray(options.requireProductIds) && options.requireProductIds.length > 0) {
      rememberRemoteWorkspaceVersion(error.payload);
      const localSnapshot = getRemoteWorkspaceSnapshot();
      const mergedDirtyState = mergeDirtyWorkspaceState(error.payload.state, localSnapshot, getRemoteWorkspaceDirtyKeysForSnapshot(localSnapshot), {
        preserveRemoteImages: !String(reason).includes("product-image-delete"),
      });
      const mergedState = mergeRequiredProductsIntoWorkspaceState(mergedDirtyState, getRemoteWorkspaceSnapshot(), options.requireProductIds);
      const retryPayload = await requestRemoteAuth("/api/workspace-state", {
        method: "PATCH",
        body: JSON.stringify({
          baseUpdatedAt: remoteWorkspaceUpdatedAt,
          reason: `${reason}-conflict-retry`,
          state: mergedState,
          ...getScopedWorkspaceSaveMetadata(mergedState),
        }),
      });
      rememberRemoteWorkspaceVersion(retryPayload);
      assertSharedWorkspaceProductsSaved(retryPayload.state, options.requireProductIds);
      applyRemoteWorkspaceState(retryPayload.state);
      completeImmediateWorkspaceSave();
      setSharedWorkspaceSaveStatus("saved", savedNotice);
      clearSharedWorkspaceSaveNoticeSoon();
      return true;
    }
    if (isSharedWorkspaceConflictError(error)) {
      rememberRemoteWorkspaceVersion(error.payload);
      const localSnapshot = getRemoteWorkspaceSnapshot();
      const mergedState = mergeDirtyWorkspaceState(error.payload.state, localSnapshot, getRemoteWorkspaceDirtyKeysForSnapshot(localSnapshot), {
        preserveRemoteImages: !String(reason).includes("product-image-delete"),
      });
      const retryPayload = await requestRemoteAuth("/api/workspace-state", {
        method: "PATCH",
        body: JSON.stringify({
          baseUpdatedAt: remoteWorkspaceUpdatedAt,
          reason: `${reason}-conflict-retry`,
          state: mergedState,
          ...getScopedWorkspaceSaveMetadata(mergedState),
        }),
      });
      rememberRemoteWorkspaceVersion(retryPayload);
      if (retryPayload.state) applyRemoteWorkspaceState(retryPayload.state);
      completeImmediateWorkspaceSave();
      setSharedWorkspaceSaveStatus("saved", savedNotice);
      clearSharedWorkspaceSaveNoticeSoon();
      return true;
    }
    remoteWorkspaceDirty = true;
    setSharedWorkspaceSaveStatus("error", `Save failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    remoteWorkspaceSyncInFlight = false;
    notifyRemoteWorkspaceSyncIdle();
    if (remoteWorkspaceSyncPendingAfterFlight || remoteWorkspaceDirty) {
      remoteWorkspaceSyncTimeoutId = window.setTimeout(syncRemoteWorkspaceState, 0);
    }
    renderSaveState();
  }
}

async function loadWorkspaceBackups() {
  if (!authSession?.token || !canManageUsers()) return;
  uiState.workspaceBackupsLoading = true;
  try {
    const payload = await requestRemoteAuth("/api/workspace-state?backups=1");
    uiState.workspaceBackups = normalizeWorkspaceBackups(payload.backups);
    uiState.workspaceBackupsLoaded = true;
    uiState.workspaceBackupsNotice = "";
  } catch (error) {
    uiState.workspaceBackupsNotice = `Backups could not load: ${error.message}`;
  } finally {
    uiState.workspaceBackupsLoading = false;
    renderFromCurrentState();
  }
}

async function createWorkspaceBackup() {
  if (!authSession?.token || !canManageUsers()) return;
  uiState.workspaceBackupsLoading = true;
  uiState.workspaceBackupsNotice = "Creating workspace backup...";
  renderFromCurrentState();
  try {
    const payload = await requestRemoteAuth("/api/workspace-state", {
      method: "POST",
      body: JSON.stringify({ action: "create-backup" }),
    });
    uiState.workspaceBackups = normalizeWorkspaceBackups([payload.backup, ...uiState.workspaceBackups]);
    uiState.workspaceBackupsLoaded = true;
    uiState.workspaceBackupsNotice = "Workspace backup created.";
  } catch (error) {
    uiState.workspaceBackupsNotice = `Backup was not created: ${error.message}`;
  } finally {
    uiState.workspaceBackupsLoading = false;
    renderFromCurrentState();
  }
}

async function publishAdminWorkspaceSnapshot() {
  if (!authSession?.token || !canManageUsers()) return;
  if (typeof window !== "undefined" && !window.confirm("Publish this admin browser's current workspace to every user? This replaces the shared workspace state in Supabase.")) return;
  uiState.workspaceBackupsLoading = true;
  uiState.workspaceBackupsNotice = "Publishing current admin workspace...";
  renderFromCurrentState();
  try {
    const payload = await requestRemoteAuth("/api/workspace-state", {
      method: "PATCH",
      body: JSON.stringify({ reason: "admin-publish", state: await prepareSharedWorkspaceSnapshotForSync({ strictImageMigration: true }) }),
    });
    rememberRemoteWorkspaceVersion(payload);
    if (payload.state) applyRemoteWorkspaceState(payload.state);
    remoteWorkspaceHydrated = true;
    remoteWorkspaceSyncPendingAfterFlight = false;
    clearRemoteWorkspaceDirtyTracking();
    clearRecoveryRemotePushMarker();
    uiState.workspaceBackupsNotice = "Current admin workspace was published to all users.";
  } catch (error) {
    uiState.workspaceBackupsNotice = `Admin workspace was not published: ${error.message}`;
  } finally {
    uiState.workspaceBackupsLoading = false;
    renderFromCurrentState();
  }
}

async function restoreWorkspaceBackup(backupId) {
  if (!authSession?.token || !canManageUsers() || !backupId) return;
  const backup = uiState.workspaceBackups.find((item) => item.id === backupId);
  const label = backup ? `${getWorkspaceBackupReasonLabel(backup.reason)} from ${formatActivityTimestamp(Date.parse(backup.createdAt) || Date.now())}` : "this backup";
  if (typeof window !== "undefined" && !window.confirm(`Restore the full workspace from ${label}? A safety backup of the current workspace will be created first.`)) return;
  uiState.workspaceBackupsLoading = true;
  uiState.workspaceBackupsNotice = "Restoring workspace backup...";
  renderFromCurrentState();
  try {
    const payload = await requestRemoteAuth("/api/workspace-state", {
      method: "POST",
      body: JSON.stringify({ action: "restore-backup", backupId }),
    });
    rememberRemoteWorkspaceVersion(payload);
    applyRemoteWorkspaceState(payload.state);
    uiState.workspaceBackupsLoaded = false;
    uiState.workspaceBackupsNotice = "Workspace restored from backup.";
    await loadWorkspaceBackups();
  } catch (error) {
    uiState.workspaceBackupsNotice = `Workspace was not restored: ${error.message}`;
  } finally {
    uiState.workspaceBackupsLoading = false;
    renderFromCurrentState();
  }
}

async function downloadWorkspaceBackup(backupId) {
  if (!authSession?.token || !canManageUsers() || !backupId) return;
  uiState.workspaceBackupsLoading = true;
  uiState.workspaceBackupsNotice = "Preparing backup download...";
  renderFromCurrentState();
  try {
    const payload = await requestRemoteAuth(`/api/workspace-state?backupId=${encodeURIComponent(backupId)}`);
    const backup = normalizeWorkspaceBackup(payload.backup);
    const filename = `launchflow-workspace-backup-${backup?.createdAt ? String(backup.createdAt).slice(0, 10) : "download"}-${backupId}.json`;
    downloadJsonFile(filename, {
      backup,
      state: payload.state,
      storageAssets: Array.isArray(payload.storageAssets) ? payload.storageAssets : [],
      exportedAt: new Date().toISOString(),
    });
    uiState.workspaceBackupsNotice = "Backup JSON downloaded.";
  } catch (error) {
    uiState.workspaceBackupsNotice = `Backup was not downloaded: ${error.message}`;
  } finally {
    uiState.workspaceBackupsLoading = false;
    renderFromCurrentState();
  }
}

function normalizeWorkspaceBackups(backups) {
  const uniqueBackups = new Map();
  (Array.isArray(backups) ? backups : [])
    .map(normalizeWorkspaceBackup)
    .filter(Boolean)
    .forEach((backup) => uniqueBackups.set(backup.id, backup));
  return Array.from(uniqueBackups.values())
    .sort((firstBackup, secondBackup) => (Date.parse(secondBackup.createdAt) || 0) - (Date.parse(firstBackup.createdAt) || 0));
}

function normalizeWorkspaceBackup(backup) {
  const id = String(backup?.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    reason: String(backup?.reason ?? "auto-save").trim() || "auto-save",
    createdBy: String(backup?.createdBy ?? backup?.created_by ?? "").trim(),
    createdAt: String(backup?.createdAt ?? backup?.created_at ?? ""),
    sourceUpdatedAt: String(backup?.sourceUpdatedAt ?? backup?.source_updated_at ?? ""),
    stateSize: Number(backup?.stateSize ?? backup?.state_size ?? 0) || 0,
    storageAssetCount: Number(backup?.storageAssetCount ?? backup?.storage_asset_count ?? 0) || 0,
    storageAssetSize: Number(backup?.storageAssetSize ?? backup?.storage_asset_size ?? 0) || 0,
    isManual: Boolean(backup?.isManual ?? backup?.is_manual),
  };
}

function downloadJsonFile(filename, payload) {
  if (typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function submitLoginForm(form) {
  if (uiState.authLoading) return;
  const formData = new FormData(form);
  const email = String(formData.get("email") || uiState.loginDraft.email || "").trim().toLowerCase();
  const password = normalizePasswordInput(formData.get("password") || uiState.loginDraft.password || "");
  const remember = Boolean(formData.get("remember") || uiState.loginDraft.remember);

  uiState.authLoading = true;
  uiState.authError = "";
  renderFromCurrentState();

  try {
    const remoteLogin = await loginWithRemoteAccess(email, password, remember);
    if (remoteLogin.handled) return;

    uiState.authError = remoteLogin.remoteUnavailableError
      ? getRemoteAccessUnavailableLoginMessage(remoteLogin.remoteUnavailableError)
      : "Invalid email or password. Ask an admin to create or reset your remote access.";
  } finally {
    uiState.authLoading = false;
    renderFromCurrentState();
  }
}

function isAuthenticated() {
  return Boolean(authSession?.token && authSession?.email && findTeamUserByEmail(authSession.email));
}

function loadAuthSession() {
  if (typeof window === "undefined") return null;
  const rawSession = safeGetStorageItem(AUTH_SESSION_STORAGE_KEY) ?? safeGetStorageItem(AUTH_SESSION_STORAGE_KEY, "session");
  const handedOffSession = rawSession ? null : consumeGlasscoAuthHandoff("pipeline");
  if (!rawSession && !handedOffSession) return null;

  try {
    const parsedSession = handedOffSession ?? JSON.parse(rawSession);
    if (!parsedSession?.token || isAuthTokenExpired(parsedSession.token)) {
      safeRemoveStorageItem(AUTH_SESSION_STORAGE_KEY);
      safeRemoveStorageItem(AUTH_SESSION_STORAGE_KEY, "session");
      return null;
    }
    const sessionUser = findTeamUserByEmail(parsedSession?.email);
    return sessionUser ? { ...parsedSession, name: sessionUser.name, role: normalizeUserRole(sessionUser.role) } : null;
  } catch {
    return null;
  }
}

function isAuthTokenExpired(token) {
  try {
    const [body, signature] = String(token ?? "").split(".");
    if (!body || !signature) return true;
    const base64 = body.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(body.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(base64));
    return !Number.isFinite(Number(payload?.exp)) || Number(payload.exp) <= Date.now();
  } catch {
    return true;
  }
}

function setAuthSession(session, remember = false) {
  authSession = { ...session, role: normalizeUserRole(session?.role), signedInAt: new Date().toISOString() };
  if (typeof window === "undefined") return;
  const primaryStorageType = remember ? "local" : "session";
  const secondaryStorageType = remember ? "session" : "local";
  safeSetStorageItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(authSession), primaryStorageType);
  safeRemoveStorageItem(AUTH_SESSION_STORAGE_KEY, secondaryStorageType);
}

function normalizeUserRole(role) {
  const normalizedRole = String(role ?? "").trim().toUpperCase();
  if (USER_ROLES.includes(normalizedRole)) return normalizedRole;
  if (normalizedRole.includes("ADMIN")) return "ADMIN";
  if (normalizedRole.includes("VIEW")) return "VIEWER";
  if (["RESEARCH LEAD", "LOGISTICS MANAGER", "SOURCING SPECIALIST"].includes(normalizedRole)) return "USER";
  return "USER";
}

function getCurrentUserRole() {
  return normalizeUserRole(authSession?.role ?? ADMIN_OWNER_CREDENTIALS.role);
}

function canManageUsers() {
  return getCurrentUserRole() === "ADMIN";
}

function canEditPipelineTabs() {
  return getCurrentUserRole() === "ADMIN";
}

function canManageProducts() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function canMoveProducts() {
  return canMutateProductsNow();
}

function canManageChecklistTasks() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function canEditProductFieldValues() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function canManageWorkspaceFieldTemplates() {
  return getCurrentUserRole() === "ADMIN";
}

function canManageCogsTemplate() {
  return getCurrentUserRole() === "ADMIN";
}

function canAdjustWorkspaceTableSheets() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function canEditWorkspaceData() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function canSendChatMessages() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function getVisibleSettingsCategories() {
  const categories = [
    { id: "profile", label: "Profile", icon: "account_circle" },
    { id: "users", label: "Users", icon: "group" },
    { id: "backups", label: "Backups", icon: "backup" },
    { id: "general", label: "General", icon: "tune" },
    { id: "security", label: "Security", icon: "security" },
    { id: "notifications", label: "Notifications", icon: "notifications" },
  ];
  return canManageUsers() ? categories : categories.filter((category) => !["users", "backups"].includes(category.id));
}

function getDefaultSettingsCategory() {
  return "profile";
}

function canViewSettingsCategory(categoryId) {
  return getVisibleSettingsCategories().some((category) => category.id === categoryId);
}

function getSettingsCategoryLabel(categoryId) {
  return getVisibleSettingsCategories().find((category) => category.id === categoryId)?.label ?? "Profile";
}

function clearAuthSession() {
  stopRemoteWorkspaceSync();
  authSession = null;
  if (typeof window === "undefined") return;
  safeRemoveStorageItem(AUTH_SESSION_STORAGE_KEY);
  safeRemoveStorageItem(AUTH_SESSION_STORAGE_KEY, "session");
  safeRemoveStorageItem(GLASSCO_AUTH_HANDOFF_STORAGE_KEY);
}

function getFilteredTeamUsers() {
  const query = normalizeSearchText(uiState.settingsUserSearchQuery);
  if (!query) return teamUsers;

  return teamUsers.filter((user) => normalizeSearchText([user.name, user.email, user.role, user.status].join(" ")).includes(query));
}

async function submitInviteUserForm(form) {
  if (!canManageUsers()) return;
  const formData = new FormData(form);
  const userId = form.getAttribute("data-user-id");
  const name = String(formData.get("userName") ?? "").trim();
  const submittedEmail = String(formData.get("userEmail") ?? "").trim().toLowerCase();
  const existingUser = userId ? teamUsers.find((user) => user.id === userId) : findTeamUserByEmail(submittedEmail);
  const email = (submittedEmail || existingUser?.email || "").trim().toLowerCase();
  const role = existingUser?.email === ADMIN_OWNER_CREDENTIALS.email ? "ADMIN" : normalizeUserRole(formData.get("userRole") ?? existingUser?.role ?? "USER");
  const password = normalizePasswordInput(formData.get("userPassword") ?? "");
  const jobTitle = String(formData.get("userJobTitle") ?? "").trim();
  if (!name || !email || (!existingUser && !password)) return;
  if (existingUser && !password && !existingUser.password && !existingUser.hasPassword) {
    uiState.settingsUserNotice = `Add and save a password before ${name} can log in.`;
    renderFromCurrentState();
    return;
  }

  const remoteResult = await saveRemoteTeamUser({
    id: existingUser?.id ?? userId,
    name,
    email,
    role,
    password,
    jobTitle,
    isEditing: Boolean(existingUser),
  });
  const updatedEmail = existingUser?.email === ADMIN_OWNER_CREDENTIALS.email ? ADMIN_OWNER_CREDENTIALS.email : email;
  const savedPassword = password || existingUser?.password || findTeamUserByEmail(updatedEmail)?.password || "";
  if (savedPassword) {
    upsertManualTeamUserAccess({
      id: existingUser?.id ?? userId,
      name,
      email: updatedEmail,
      role,
      password: savedPassword,
      jobTitle,
    });
  }

  if (!remoteResult.handled) {
    if (existingUser) {
      setTeamUsers(teamUsers.map((user) => user.id === existingUser.id ? {
        ...user,
        name,
        email: updatedEmail,
        role,
        password: password || user.password,
        hasPassword: Boolean(password || user.password || user.hasPassword),
        jobTitle: jobTitle || user.jobTitle,
      } : user));
      if (authSession?.email === existingUser.email) {
        const rememberSession = typeof window !== "undefined" && Boolean(safeGetStorageItem(AUTH_SESSION_STORAGE_KEY));
        setAuthSession({ ...authSession, email: updatedEmail, name, role }, rememberSession);
      }
      uiState.settingsUserNotice = password
        ? `Access updated for ${name}. They can now log in with ${updatedEmail} and the new password.`
        : `${name} was updated. Existing password was kept.`;
    } else {
      setTeamUsers([...teamUsers, {
        id: `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        email,
        role,
        password,
        hasPassword: Boolean(password),
        jobTitle: jobTitle || "Team Member",
        status: "Active",
        avatarDataUrl: "",
        inviteSentAt: new Date().toISOString(),
        lastLoginAt: null,
      }]);
      uiState.settingsUserNotice = `Access granted for ${name}. They can now log in with ${email} and the password you created.`;
    }
  }

  uiState.settingsInviteModalOpen = false;
  uiState.editingTeamUserId = null;
  renderFromCurrentState();
}

function getCurrentTeamUser() {
  return findTeamUserByEmail(authSession?.email) ?? findTeamUserByEmail(ADMIN_OWNER_CREDENTIALS.email) ?? teamUsers[0];
}

function syncTeamUsersFromStorage() {
  if (typeof window === "undefined") return teamUsers;
  const storedUsers = parseStoredTeamUsers(safeGetStorageItem(TEAM_USERS_STORAGE_KEY));
  const storedManualAccess = parseStoredTeamUsers(safeGetStorageItem(MANUAL_ACCESS_STORAGE_KEY));
  if (!storedUsers && !storedManualAccess) return teamUsers;

  teamUsers = normalizeTeamUsers([...teamUsers, ...(storedUsers ?? []), ...(storedManualAccess ?? [])]);
  safeSetStorageItem(TEAM_USERS_STORAGE_KEY, JSON.stringify(teamUsers));
  persistManualAccessCredentials(teamUsers);
  return teamUsers;
}

function parseStoredTeamUsers(rawUsers) {
  if (!rawUsers) return null;

  try {
    const parsedUsers = JSON.parse(rawUsers);
    if (Array.isArray(parsedUsers)) return parsedUsers;
    if (Array.isArray(parsedUsers?.users)) return parsedUsers.users;
    if (Array.isArray(parsedUsers?.teamUsers)) return parsedUsers.teamUsers;
    if (Array.isArray(parsedUsers?.accounts)) return parsedUsers.accounts;
    if (parsedUsers && typeof parsedUsers === "object") return Object.values(parsedUsers);
    return null;
  } catch {
    return null;
  }
}

function normalizePasswordInput(value) {
  return String(value ?? "").trim();
}

function findTeamUserByEmail(email) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  return teamUsers.find((user) => user.email === normalizedEmail) ?? null;
}

function markTeamUserLoggedIn(email) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  setTeamUsers(teamUsers.map((user) => user.email === normalizedEmail ? { ...user, status: "Active", lastLoginAt: new Date().toISOString() } : user));
}

function upsertManualTeamUserAccess({ id, name, email, role, password, jobTitle }) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const savedPassword = normalizePasswordInput(password);
  if (!normalizedEmail || !savedPassword) return;
  const existingUser = findTeamUserByEmail(normalizedEmail);
  const manualUser = {
    ...(existingUser ?? {}),
    id: existingUser?.id || id || `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || existingUser?.name || "Team Member").trim(),
    email: normalizedEmail,
    role: normalizeUserRole(role || existingUser?.role || "USER"),
    password: savedPassword,
    hasPassword: true,
    jobTitle: String(jobTitle || existingUser?.jobTitle || "Team Member").trim(),
    status: "Active",
    avatarDataUrl: "",
    avatarStoragePath: existingUser?.avatarStoragePath || "",
    avatarUrl: existingUser?.avatarUrl || "",
    inviteSentAt: existingUser?.inviteSentAt ?? new Date().toISOString(),
    lastLoginAt: existingUser?.lastLoginAt ?? null,
  };
  setTeamUsers(existingUser
    ? teamUsers.map((user) => user.email === normalizedEmail ? manualUser : user)
    : [...teamUsers, manualUser]);
}

async function deleteTeamUser(userId) {
  const user = teamUsers.find((item) => item.id === userId);
  if (!user || user.email === ADMIN_OWNER_CREDENTIALS.email) return;
  const remoteResult = await deleteRemoteTeamUser(userId);
  if (!remoteResult.handled) {
    setTeamUsers(teamUsers.filter((item) => item.id !== userId));
    uiState.settingsUserNotice = `${user.name} was removed.`;
  }
  renderFromCurrentState();
}

async function uploadProfileAvatar(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  const currentUser = getCurrentTeamUser();
  if (!file || !file.type.startsWith("image/") || !currentUser) return;

  const avatarUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.profileAvatars, scope: `users/${currentUser.id}` });
  setTeamUsers(teamUsers.map((user) => user.id === currentUser.id ? {
    ...user,
    avatarDataUrl: "",
    avatarStoragePath: avatarUpload.storagePath,
    avatarUrl: avatarUpload.storageUrl,
  } : user));
  const remoteResult = await saveRemoteCurrentUserProfile({
    avatarStoragePath: avatarUpload.storagePath,
    avatarUrl: avatarUpload.storageUrl,
  });
  uiState.settingsProfileNotice = remoteResult.handled
    ? "Avatar uploaded."
    : "Avatar uploaded on this device, but remote profile save failed. Please try uploading again before logging out.";
  renderFromCurrentState();
}

async function submitProfileSettingsForm(form) {
  const currentUser = getCurrentTeamUser();
  if (!currentUser) return;
  const formData = new FormData(form);
  const name = String(formData.get("profileName") ?? "").trim();
  const jobTitle = String(formData.get("profileJobTitle") ?? "").trim() || "Team Member";
  if (!name) return;

  setTeamUsers(teamUsers.map((user) => user.id === currentUser.id ? {
    ...user,
    name,
    jobTitle,
  } : user));

  if (authSession?.email?.toLowerCase() === currentUser.email) {
    const rememberSession = typeof window !== "undefined" && Boolean(safeGetStorageItem(AUTH_SESSION_STORAGE_KEY));
    setAuthSession({ ...authSession, name, role: currentUser.role }, rememberSession);
  }

  const remoteResult = await saveRemoteCurrentUserProfile({ name, jobTitle });
  uiState.settingsProfileNotice = remoteResult.handled
    ? "Profile updated."
    : "Profile updated on this device, but remote profile save failed.";
  renderFromCurrentState();
}

function getTeamUserInitials(name) {
  const initials = String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "U";
}

function loadTeamUsers() {
  if (typeof window === "undefined") return [...DEFAULT_TEAM_USERS];
  const storedUsers = parseStoredTeamUsers(safeGetStorageItem(TEAM_USERS_STORAGE_KEY));
  const storedManualAccess = parseStoredTeamUsers(safeGetStorageItem(MANUAL_ACCESS_STORAGE_KEY));
  const normalizedUsers = normalizeTeamUsers([...(storedUsers ?? DEFAULT_TEAM_USERS), ...(storedManualAccess ?? [])]);
  safeSetStorageItem(TEAM_USERS_STORAGE_KEY, JSON.stringify(normalizedUsers));
  persistManualAccessCredentials(normalizedUsers);
  return normalizedUsers;
}

function setTeamUsers(nextUsers) {
  teamUsers = normalizeTeamUsers(nextUsers);
  if (typeof window !== "undefined") {
    safeSetStorageItem(TEAM_USERS_STORAGE_KEY, JSON.stringify(teamUsers));
    persistManualAccessCredentials(teamUsers);
  }
}

function persistManualAccessCredentials(users) {
  if (typeof window === "undefined") return;
  const manualAccessUsers = normalizeTeamUsers(users)
    .filter((user) => user.email && user.password)
    .map(({ email, name, role, password, jobTitle, avatarDataUrl, avatarStoragePath, avatarUrl, lastLoginAt }) => ({
      email,
      name,
      role,
      password,
      jobTitle,
      avatarDataUrl: "",
      avatarStoragePath: avatarStoragePath || "",
      avatarUrl: avatarUrl || "",
      status: "Active",
      lastLoginAt,
    }));
  safeSetStorageItem(MANUAL_ACCESS_STORAGE_KEY, JSON.stringify(manualAccessUsers));
}

function normalizeTeamUsers(users) {
  if (!Array.isArray(users)) return normalizeTeamUsers(DEFAULT_TEAM_USERS);
  const dummyUserIds = new Set(["team-sarah-lopez", "team-james-miller", "team-emily-wong"]);
  const usersByEmail = new Map();

  users
    .filter((user) => !dummyUserIds.has(String(user?.id ?? "")))
    .map(normalizeTeamUserRecord)
    .filter((user) => Boolean(user.email))
    .forEach((user) => {
      const existingUser = usersByEmail.get(user.email);
      usersByEmail.set(user.email, existingUser ? {
        ...existingUser,
        ...user,
        password: user.password || existingUser.password,
        jobTitle: user.jobTitle || existingUser.jobTitle,
        avatarDataUrl: user.avatarDataUrl || existingUser.avatarDataUrl,
        avatarStoragePath: user.avatarStoragePath || existingUser.avatarStoragePath,
        avatarUrl: user.avatarUrl || existingUser.avatarUrl,
        status: existingUser.status === "Active" || user.status === "Active" || user.password || existingUser.password ? "Active" : "Password Required",
        inviteSentAt: user.inviteSentAt ?? existingUser.inviteSentAt,
        lastLoginAt: user.lastLoginAt ?? existingUser.lastLoginAt,
      } : user);
    });

  if (!usersByEmail.has(ADMIN_OWNER_CREDENTIALS.email)) {
    const owner = normalizeTeamUserRecord(DEFAULT_TEAM_USERS[0]);
    usersByEmail.set(owner.email, owner);
  }

  return Array.from(usersByEmail.values());
}

function normalizeTeamUserRecord(user, index = 0) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  const isOwner = email === ADMIN_OWNER_CREDENTIALS.email;
  const password = normalizePasswordInput(user?.password ?? user?.manualPassword ?? user?.accessPassword ?? user?.temporaryPassword ?? user?.userPassword ?? (isOwner ? ADMIN_OWNER_CREDENTIALS.password : ""));
  return {
    id: String(user?.id ?? `team-user-${index}`),
    name: String(user?.name ?? (isOwner ? ADMIN_OWNER_CREDENTIALS.name : "Unnamed User")),
    email,
    role: isOwner ? "ADMIN" : normalizeUserRole(user?.role ?? "VIEWER"),
    status: isOwner || user?.status === "Active" || password ? "Active" : "Password Required",
    password,
    hasPassword: Boolean(user?.hasPassword || password),
    jobTitle: String(user?.jobTitle ?? (isOwner ? "Workspace Owner" : "Team Member")),
    avatarDataUrl: "",
    avatarStoragePath: typeof user?.avatarStoragePath === "string" ? user.avatarStoragePath : "",
    avatarUrl: typeof user?.avatarUrl === "string" ? user.avatarUrl : "",
    inviteSentAt: user?.inviteSentAt ?? null,
    lastLoginAt: user?.lastLoginAt ?? null,
  };
}

function loadProductSettings() {
  if (typeof window === "undefined") return createDefaultProductSettings();
  const rawSettings = safeGetStorageItem(PRODUCT_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultProductSettings();

  try {
    return normalizeProductSettings(JSON.parse(rawSettings));
  } catch {
    return createDefaultProductSettings();
  }
}

function setProductSettings(nextSettings) {
  const nextProductSettings = normalizeProductSettings(nextSettings);
  markRemoteWorkspaceDirtyProductIds(getChangedProductIdsFromProductSettings(productSettings, nextProductSettings));
  productSettings = nextProductSettings;
  if (typeof window !== "undefined") {
    safeSetStorageItem(PRODUCT_SETTINGS_STORAGE_KEY, JSON.stringify(productSettings));
  }
  markRemoteWorkspaceDirtyKey("productSettings");
  queueRemoteWorkspaceSync();
}

function createDefaultProductSettings() {
  return { edits: {}, deletedProductIds: [], deletedProductSnapshots: [], purgedProductHistoryIds: [] };
}

function normalizeProductSettings(settings) {
  const edits = settings?.edits && typeof settings.edits === "object" ? settings.edits : {};
  return {
    edits: Object.fromEntries(Object.entries(edits).map(([productId, edit]) => [productId, normalizeProductEdit(edit)])),
    deletedProductIds: Array.isArray(settings?.deletedProductIds) ? settings.deletedProductIds.map((productId) => String(productId)) : [],
    deletedProductSnapshots: normalizeDeletedProductSnapshots(settings?.deletedProductSnapshots),
    purgedProductHistoryIds: Array.isArray(settings?.purgedProductHistoryIds) ? settings.purgedProductHistoryIds.map((entryId) => String(entryId)).filter(Boolean) : [],
  };
}

function normalizeProductEdit(edit) {
  return {
    name: String(edit?.name ?? "").trim(),
    sku: normalizeOptionalProductValue(edit?.sku),
    asin: normalizeOptionalProductValue(edit?.asin),
    stageId: normalizeProductStageId(edit?.stageId),
  };
}

function loadUserProducts() {
  if (typeof window === "undefined") return [];
  const rawProducts = safeGetStorageItem(USER_PRODUCTS_STORAGE_KEY);
  if (!rawProducts) return [];

  try {
    return normalizeUserProducts(JSON.parse(rawProducts));
  } catch {
    return [];
  }
}

function setUserProducts(nextProducts) {
  const nextUserProducts = normalizeUserProducts(nextProducts);
  markRemoteWorkspaceDirtyProductIds(getChangedProductIdsFromProductLists(userProducts, nextUserProducts));
  userProducts = nextUserProducts;
  if (typeof window !== "undefined") {
    safeSetStorageItem(USER_PRODUCTS_STORAGE_KEY, JSON.stringify(userProducts));
  }
  markRemoteWorkspaceDirtyKey("userProducts");
  queueRemoteWorkspaceSync();
}

function normalizeUserProducts(products) {
  if (!Array.isArray(products)) return [];

  return products
    .map(normalizeUserProduct)
    .filter(Boolean);
}

function normalizeUserProduct(product) {
  const id = String(product?.id ?? "").trim() || createUserProductId();
  const name = String(product?.name ?? "").trim();
  const stageId = normalizeProductStageId(product?.stageId);
  if (!name || !stageId) return null;

  return {
    id,
    name,
    sku: normalizeOptionalProductValue(product?.sku),
    asin: normalizeOptionalProductValue(product?.asin),
    stageId,
    readinessPercent: clampReadinessPercent(product?.readinessPercent),
  };
}

function normalizeProductStageId(stageId) {
  const cleanStageId = String(stageId ?? "").trim();
  if (cleanStageId === "optimization") return cleanStageId;
  return getBaseStageTabs().some((stageTab) => stageTab.id === cleanStageId) ? cleanStageId : "product-research";
}

function normalizeOptionalProductValue(value) {
  const cleanValue = String(value ?? "").trim();
  return cleanValue === "" || cleanValue.toUpperCase() === "N/A" ? "" : cleanValue;
}

function clampReadinessPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

function createUserProductId() {
  return `user_product_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadCogsTemplateSettings() {
  if (typeof window === "undefined") return createDefaultCogsTemplateSettings();
  const rawSettings = safeGetStorageItem(COGS_TEMPLATE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultCogsTemplateSettings();
  try {
    return normalizeCogsTemplateSettings(JSON.parse(rawSettings));
  } catch {
    return createDefaultCogsTemplateSettings();
  }
}

function setCogsTemplateSettings(nextSettings, { queueSync = true, markDirty = true } = {}) {
  cogsTemplateSettings = normalizeCogsTemplateSettings(nextSettings);
  safeSetStorageItem(COGS_TEMPLATE_SETTINGS_STORAGE_KEY, JSON.stringify(cogsTemplateSettings));
  if (markDirty) markRemoteWorkspaceDirtyKey("cogsTemplateSettings");
  if (queueSync) queueRemoteWorkspaceSync();
}

function loadWorkspaceDetails() {
  if (typeof window === "undefined") return createEmptyWorkspaceDetails();
  const rawDetails = safeGetStorageItem(WORKSPACE_DETAILS_STORAGE_KEY);
  if (!rawDetails) return createEmptyWorkspaceDetails();

  try {
    return normalizeWorkspaceDetails(JSON.parse(rawDetails));
  } catch {
    return createEmptyWorkspaceDetails();
  }
}

function setWorkspaceDetails(nextDetails) {
  const nextWorkspaceDetails = normalizeWorkspaceDetails(nextDetails);
  markRemoteWorkspaceDirtyProductIds(getChangedProductIdsFromWorkspaceDetails(workspaceDetails, nextWorkspaceDetails));
  markRemoteWorkspaceDirtyProductDetailScopes(workspaceDetails, nextWorkspaceDetails);
  getChangedWorkspaceTemplateStageIds(workspaceDetails, nextWorkspaceDetails).forEach((stageId) => remoteWorkspaceDirtyTemplateStageIds.add(stageId));
  workspaceDetails = nextWorkspaceDetails;
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(WORKSPACE_DETAILS_STORAGE_KEY, JSON.stringify(workspaceDetails));
    } catch (error) {
      console.warn("LaunchFlow could not persist workspace details locally.", error);
    }
  }
  markRemoteWorkspaceDirtyKey("workspaceDetails");
  queueRemoteWorkspaceSync();
}

function normalizeWorkspaceDetails(details) {
  const normalizedDetails = createEmptyWorkspaceDetails();
  normalizedDetails.fieldHistory = normalizeWorkspaceFieldHistory(details?.fieldHistory);
  normalizedDetails.productHistory = normalizeProductHistory(details?.productHistory);
  const stageFieldTemplates = details?.stageFieldTemplates && typeof details.stageFieldTemplates === "object" ? details.stageFieldTemplates : {};

  for (const [stageId, fields] of Object.entries(stageFieldTemplates)) {
    normalizedDetails.stageFieldTemplates[stageId] = Array.isArray(fields)
      ? fields.map(normalizeWorkspaceFieldDefinition).filter(Boolean)
      : [];
  }

  const products = details?.products && typeof details.products === "object" ? details.products : {};

  for (const [productId, productDetails] of Object.entries(products)) {
    const stages = productDetails?.stages && typeof productDetails.stages === "object" ? productDetails.stages : {};
    normalizedDetails.products[productId] = {
      imageDataUrl: "",
      imageStoragePath: typeof productDetails?.imageStoragePath === "string" ? productDetails.imageStoragePath : "",
      imageUrl: typeof productDetails?.imageUrl === "string" ? productDetails.imageUrl : "",
      stages: {},
      chatReadBy: normalizeProductChatReadBy(productDetails?.chatReadBy),
      chatMessages: Array.isArray(productDetails?.chatMessages)
        ? productDetails.chatMessages.map(normalizeProductChatMessage).filter(Boolean)
        : [],
    };
    if (productDetails?.financials && typeof productDetails.financials === "object") {
      normalizedDetails.products[productId].financials = normalizeProductFinancials(productDetails.financials);
    }

    for (const [stageId, stageDetails] of Object.entries(stages)) {
      const customFields = Array.isArray(stageDetails?.customFields)
        ? stageDetails.customFields.map(normalizeWorkspaceField).filter(Boolean)
        : [];

      for (const field of customFields) {
        if (!getStageFieldTemplates(normalizedDetails, stageId).some((template) => template.fieldId === field.fieldId)) {
          getStageFieldTemplates(normalizedDetails, stageId).push(normalizeWorkspaceFieldDefinition(field));
        }
      }

      normalizedDetails.products[productId].stages[stageId] = {
        customFields,
        checklistTasks: Array.isArray(stageDetails?.checklistTasks)
          ? stageDetails.checklistTasks.map(normalizeWorkspaceChecklistTask).filter(Boolean)
          : [],
      };
    }
  }

  for (const productId of Object.keys(normalizedDetails.products)) {
    for (const stageId of Object.keys(normalizedDetails.stageFieldTemplates)) {
      ensureWorkspaceStageDetails(normalizedDetails, productId, stageId);
    }
  }

  return normalizedDetails;
}

function normalizeProductChatMessage(message) {
  const text = String(message?.text ?? "").trim();
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map(normalizeProductChatAttachment).filter(Boolean)
    : [];
  if (!text && attachments.length === 0) return null;

  return {
    messageId: String(message?.messageId ?? "") || createChatMessageId(),
    sender: message?.sender === "partner" ? "partner" : "user",
    senderUserId: String(message?.senderUserId ?? ""),
    senderUserEmail: String(message?.senderUserEmail ?? "").toLowerCase(),
    senderName: String(message?.senderName ?? ""),
    senderAvatarUrl: String(message?.senderAvatarUrl ?? ""),
    text,
    replyTo: normalizeChatReplyPreview(message?.replyTo),
    createdAt: typeof message?.createdAt === "string" ? message.createdAt : new Date().toISOString(),
    editedAt: typeof message?.editedAt === "string" ? message.editedAt : "",
    attachments,
  };
}

function normalizeProductChatAttachment(attachment) {
  const name = String(attachment?.name ?? "").trim();
  const storageUrl = String(attachment?.storageUrl ?? attachment?.url ?? "");
  const storagePath = String(attachment?.storagePath ?? "");
  if (!name || !storageUrl || storageUrl.startsWith("data:")) return null;

  return {
    attachmentId: String(attachment?.attachmentId ?? "") || createChatAttachmentId(),
    name,
    type: String(attachment?.type ?? "application/octet-stream"),
    size: Number(attachment?.size ?? 0),
    bucket: String(attachment?.bucket ?? SUPABASE_STORAGE_BUCKETS.chatAttachments),
    storagePath,
    storageUrl,
  };
}

function normalizeWorkspaceField(field) {
  const label = String(field?.label ?? "").trim();
  const type = String(field?.type ?? "");
  if (!WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(type)) return null;
  const value = normalizeWorkspaceFieldValue(type, field?.value);

  return {
    fieldId: String(field?.fieldId ?? "") || createWorkspaceFieldId(),
    label,
    type,
    headerSubtext: type === "HEADER_TITLE" ? String(field?.headerSubtext ?? "").trim() : "",
    value,
    options: type === "CUSTOM_DROPDOWN" ? normalizeDropdownOptions(field?.options) : [],
    tableColumns: isWorkspaceTableFieldType(type) ? normalizeFieldList(field?.tableColumns) : [],
    tableRows: isWorkspaceTableFieldType(type) ? normalizeFieldList(field?.tableRows) : [],
    tableRowLabels: isWorkspaceTableFieldType(type) ? normalizeWorkspaceTableRowLabelsForField(field, value) : [],
    tableRowLabelsInitialized: isWorkspaceTableFieldType(type) ? Boolean(field?.tableRowLabelsInitialized) : false,
    tableRowLabelsIntentionallyBlank: isWorkspaceTableFieldType(type) ? Boolean(field?.tableRowLabelsIntentionallyBlank) : false,
    tableCornerHeader: isWorkspaceTableFieldType(type) ? normalizeTableCornerHeader(field?.tableCornerHeader) : "",
    tableColumnWidths: isWorkspaceTableFieldType(type) ? normalizeTableDimensionList(field?.tableColumnWidths) : [],
    tableRowHeights: isWorkspaceTableFieldType(type) ? normalizeTableDimensionList(field?.tableRowHeights) : [],
    checklistItems: type === "CHECKLIST_NOTES" ? normalizeFieldList(field?.checklistItems) : [],
    barLabels: ["THREE_SHORT_BARS", "FOUR_SHORT_BARS"].includes(type) ? normalizeMultiShortBarLabels(field?.barLabels, type === "FOUR_SHORT_BARS" ? 4 : 3) : [],
    galleryFormat: type === "IMAGE_GALLERY" ? getImageGalleryFormat(field?.galleryFormat ?? field?.value?.format)?.value ?? "" : "",
  };
}

function normalizeWorkspaceTableRowLabelsForField(field, tableValue, length = null, defaultLabels = []) {
  const hasSavedProductLabels = Array.isArray(field?.tableRowLabels);
  const savedLabels = hasSavedProductLabels ? normalizeTableRowLabels(field.tableRowLabels) : [];
  const hasMeaningfulSavedLabels = savedLabels.some((label) => label.trim());
  const normalizedDefaultLabels = normalizeFieldList(defaultLabels);
  const hasTableCellData = workspaceTableHasCellData(tableValue);
  const shouldRestoreDefaultLabels = shouldRestoreDefaultTableRowLabels({
    defaultLabels: normalizedDefaultLabels,
    savedLabels,
    tableRowLabelsIntentionallyBlank: field?.tableRowLabelsIntentionallyBlank,
    hasCellData: hasTableCellData,
  });
  const shouldUseSavedLabels = !shouldRestoreDefaultLabels && hasSavedProductLabels && (hasMeaningfulSavedLabels || Boolean(field?.tableRowLabelsInitialized));
  const sourceLabels = shouldRestoreDefaultLabels
    ? normalizedDefaultLabels
    : shouldUseSavedLabels
    ? savedLabels
    : hasTableCellData
      ? normalizeFieldList(field?.tableRows)
      : [];
  if (!Number.isInteger(length) || length < 0) return sourceLabels;
  return Array.from({ length }, (_, index) => sourceLabels[index] ?? "");
}

function createEmptyListingContentValue() {
  return {
    title: "",
    itemHighlight: "",
    bullets: ["", "", "", "", ""],
    description: "",
    backendKeywords: "",
    status: "",
  };
}

function normalizeListingContentValue(value) {
  const rawValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const bullets = Array.isArray(rawValue.bullets) ? rawValue.bullets : [];
  const rawTitle = String(rawValue.title ?? "");
  const hasSavedItemHighlight = Object.prototype.hasOwnProperty.call(rawValue, "itemHighlight");
  const legacyTitleOverflow = hasSavedItemHighlight ? "" : rawTitle.slice(75, 200);
  return {
    title: rawTitle.slice(0, 75),
    itemHighlight: String(hasSavedItemHighlight ? rawValue.itemHighlight ?? "" : legacyTitleOverflow).slice(0, 125),
    bullets: Array.from({ length: 5 }, (_, index) => String(bullets[index] ?? "").slice(0, 200)),
    description: String(rawValue.description ?? "").slice(0, 2000),
    backendKeywords: String(rawValue.backendKeywords ?? "").slice(0, 250),
    status: ["approved", "declined"].includes(rawValue.status) ? rawValue.status : "",
  };
}

function getCharacterCount(value) {
  return String(value ?? "").length;
}

function createEmptyImageGalleryValue(formatValue = "") {
  return {
    format: getImageGalleryFormat(formatValue)?.value ?? "",
    extraSlots: 0,
    images: [],
  };
}

function normalizeImageGalleryValue(value) {
  const rawValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const format = getImageGalleryFormat(rawValue.format)?.value ?? "";
  const images = Array.isArray(rawValue.images) ? rawValue.images.map(normalizeImageGalleryImage).filter(Boolean) : [];
  const extraSlots = Math.max(0, Math.round(Number(rawValue.extraSlots ?? 0)) || 0);
  return {
    format,
    extraSlots,
    images,
  };
}

function getImageGalleryFormat(formatValue) {
  const cleanFormat = String(formatValue ?? "").trim();
  return IMAGE_GALLERY_FORMATS.find((format) => format.value === cleanFormat) ?? null;
}

function getImageGalleryBaseSlotCount(formatValue) {
  return getImageGalleryFormat(formatValue)?.slots ?? 0;
}

function getImageGalleryDisplaySlotCount(value) {
  const galleryValue = normalizeImageGalleryValue(value);
  const highestImageSlot = galleryValue.images.reduce((highestSlot, image, index) => Math.max(highestSlot, Number.isInteger(image.slotIndex) ? image.slotIndex : index), -1);
  return Math.max(getImageGalleryBaseSlotCount(galleryValue.format) + galleryValue.extraSlots, highestImageSlot + 1);
}

function createImageGallerySlots(value) {
  const galleryValue = normalizeImageGalleryValue(value);
  const slotCount = getImageGalleryDisplaySlotCount(galleryValue);
  const imagesBySlot = new Map(galleryValue.images.map((image, index) => [Number.isInteger(image.slotIndex) ? image.slotIndex : index, image]));
  return Array.from({ length: slotCount }, (_, index) => ({
    slotIndex: index,
    image: imagesBySlot.get(index) ?? null,
  }));
}

function normalizeImageGalleryImage(image) {
  const name = String(image?.name ?? "").trim();
  const storageUrl = String(image?.storageUrl ?? image?.url ?? "");
  if (!name || !storageUrl || storageUrl.startsWith("data:")) return null;

  return {
    imageId: String(image?.imageId ?? image?.attachmentId ?? "") || createImageGalleryImageId(),
    name,
    type: String(image?.type ?? "image/*"),
    size: Number(image?.size ?? 0),
    slotIndex: Number.isInteger(Number(image?.slotIndex)) ? Math.max(0, Number(image.slotIndex)) : null,
    bucket: String(image?.bucket ?? ""),
    storagePath: String(image?.storagePath ?? ""),
    storageUrl,
    uploadedAt: typeof image?.uploadedAt === "string" ? image.uploadedAt : new Date().toISOString(),
  };
}

function createImageGalleryImageId() {
  return `image_gallery_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyPaymentStatusValue() {
  return {
    paymentTitle: "",
    totalCost: "",
    paymentMode: "partial",
    partialAmount: "",
    paymentDate: "",
    invoiceNumber: "",
    invoiceTitle: "",
    invoiceLink: "",
    paymentDescription: "",
    history: [],
    files: [],
  };
}

function normalizePaymentStatusValue(value) {
  const rawValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const totalCost = getNonNegativeAmount(rawValue.totalCost);
  const partialAmount = getNonNegativeAmount(rawValue.partialAmount);
  return {
    paymentTitle: typeof rawValue.paymentTitle === "string" ? rawValue.paymentTitle.trim() : "",
    totalCost,
    paymentMode: rawValue.paymentMode === "full" || rawValue.isFullPaid === true ? "full" : "partial",
    partialAmount,
    paymentDate: typeof rawValue.paymentDate === "string" ? rawValue.paymentDate : "",
    invoiceNumber: typeof rawValue.invoiceNumber === "string" ? rawValue.invoiceNumber.trim() : "",
    invoiceTitle: typeof rawValue.invoiceTitle === "string" ? rawValue.invoiceTitle.trim() : "",
    invoiceLink: typeof rawValue.invoiceLink === "string" ? rawValue.invoiceLink.trim() : "",
    paymentDescription: typeof rawValue.paymentDescription === "string" ? rawValue.paymentDescription : "",
    history: normalizePaymentHistory(rawValue.history),
    files: normalizeWorkspaceFileList(rawValue.files),
  };
}

function normalizePaymentHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  return entries.map(normalizePaymentHistoryEntry).filter(Boolean);
}

function normalizePaymentHistoryEntry(entry) {
  const amount = getNonNegativeAmount(entry?.amount);
  if (amount === "") return null;
  return {
    paymentId: String(entry?.paymentId ?? "") || createPaymentHistoryId(),
    paymentTitle: typeof entry?.paymentTitle === "string" ? entry.paymentTitle.trim() : "",
    amount,
    percent: Math.min(100, Math.max(0, Math.round(Number(entry?.percent ?? 0)))),
    date: typeof entry?.date === "string" ? entry.date : "",
    mode: entry?.mode === "full" ? "full" : "partial",
    invoiceNumber: typeof entry?.invoiceNumber === "string" ? entry.invoiceNumber.trim() : "",
    invoiceTitle: typeof entry?.invoiceTitle === "string" ? entry.invoiceTitle.trim() : "",
    invoiceLink: typeof entry?.invoiceLink === "string" ? entry.invoiceLink.trim() : "",
    paymentDescription: typeof entry?.paymentDescription === "string" ? entry.paymentDescription : "",
    createdAt: typeof entry?.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
  };
}

function getNonNegativeAmount(value) {
  if (value === "" || value === null || value === undefined) return "";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "";
  return Math.max(0, Number(numericValue.toFixed(2)));
}

function normalizeWorkspaceFileList(value) {
  const files = Array.isArray(value) ? value : [];
  return files.map(normalizeWorkspaceFile).filter(Boolean);
}

function normalizeWorkspaceFile(file) {
  const name = String(file?.name ?? "").trim();
  const storageUrl = String(file?.storageUrl ?? file?.url ?? "");
  const storagePath = String(file?.storagePath ?? "");
  if (!name || !storageUrl || storageUrl.startsWith("data:")) return null;

  return {
    attachmentId: String(file?.attachmentId ?? file?.fileId ?? "") || createWorkspaceFileId(),
    name,
    type: String(file?.type ?? "application/octet-stream"),
    size: Number(file?.size ?? 0),
    bucket: String(file?.bucket ?? SUPABASE_STORAGE_BUCKETS.files),
    storagePath,
    storageUrl,
    isExternalLink: Boolean(file?.isExternalLink) || String(file?.type ?? "") === "text/uri-list",
    uploadedAt: typeof file?.uploadedAt === "string" ? file.uploadedAt : new Date().toISOString(),
  };
}

function normalizeWorkspaceChecklistTask(task) {
  const name = String(task?.name ?? "").trim();
  if (!name) return null;
  return {
    taskId: String(task?.taskId ?? "") || createWorkspaceChecklistId(),
    name,
    isCompleted: Boolean(task?.isCompleted),
    completedAt: task?.isCompleted && typeof task?.completedAt === "string" ? task.completedAt : null,
    note: String(task?.note ?? ""),
  };
}

function normalizeWorkspaceFieldValue(type, value) {
  if (type === "LONG_BAR") return getLongBarTokens(value);
  if (type === "THREE_SHORT_BARS") return normalizeMultiShortBarsValue(value, 3);
  if (type === "FOUR_SHORT_BARS") return normalizeMultiShortBarsValue(value, 4);
  if (type === "CUSTOM_DROPDOWN") return String(value ?? "");
  if (type === "LINK") return normalizeWorkspaceLinkValue(value);
  if (type === "SHEET_EMBED") return normalizeSpreadsheetEmbedValue(value);
  if (type === "LISTING_CONTENT") return normalizeListingContentValue(value);
  if (type === "SHIPPING_TIMELINE") return normalizeShippingTimelineValue(value);
  if (type === "SHIPMENT_TRACKER") return normalizeTrackingNumber(value);
  if (isWorkspaceTableFieldType(type)) return Array.isArray(value) ? value : [];
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value);
  if (type === "IMAGE_GALLERY") return normalizeImageGalleryValue(value);
  if (type === "PAYMENT_STATUS") return normalizePaymentStatusValue(value);
  if (type === "CHECKLIST_NOTES") return normalizeChecklistNotesValue(value);

  if (type === "CURRENCY") {
    return {
      amount: value?.amount ?? "",
      currency: value?.currency ?? "USD",
    };
  }

  if (type === "NUMBER") {
    return value === "" || value === null || value === undefined ? "" : Number(value);
  }

  return String(value ?? "");
}

function normalizeShippingTimelineValue(value) {
  const shippingDate = parseLocalCalendarDate(value?.shippingDate) ? String(value.shippingDate) : "";
  const expectedDaysValue = value?.expectedDays;
  const expectedDays = expectedDaysValue === "" || expectedDaysValue === null || expectedDaysValue === undefined
    ? ""
    : Number(expectedDaysValue);

  return {
    shippingDate,
    expectedDays: Number.isInteger(expectedDays) && expectedDays > 0 ? expectedDays : "",
  };
}

function normalizeMultiShortBarsValue(value, count = 3) {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Array.from({ length: count }, (_, index) => value[`multiShortBar${index}`] ?? value[`shortBar${index}`])
      : [];
  return Array.from({ length: count }, (_, index) => String(values[index] ?? ""));
}

function normalizeMultiShortBarLabels(labels, count = 3) {
  const values = Array.isArray(labels)
    ? labels
    : labels && typeof labels === "object"
      ? Array.from({ length: count }, (_, index) => labels[`barLabel${index}`] ?? labels[`label${index}`])
      : [];
  return Array.from({ length: count }, (_, index) => String(values[index] ?? "").trim());
}

function normalizeWorkspaceLinkValue(value, fallbackLabel = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const url = String(value.url ?? value.href ?? "").trim();
    const label = String(value.label ?? value.text ?? "").trim();
    return { url, label: label || getDefaultWorkspaceLinkLabel(url, fallbackLabel) };
  }

  const url = String(value ?? "").trim();
  return { url, label: getDefaultWorkspaceLinkLabel(url, fallbackLabel) };
}

function getSheetEmbedAccessModeForCurrentUser() {
  return ["ADMIN", "USER"].includes(getCurrentUserRole()) ? "edit" : "view";
}

function getSheetPreviewKey(productId, stageId, fieldId) {
  return `${productId || ""}:${stageId || ""}:${fieldId || ""}`;
}

function setSheetEmbedLinkEditMode(target, isEditing) {
  const sheetKey = getSheetPreviewKey(
    target.getAttribute("data-product-id"),
    target.getAttribute("data-stage-id"),
    target.getAttribute("data-field-id"),
  );
  if (isEditing) {
    uiState.editingSheetEmbedIds.add(sheetKey);
  } else {
    uiState.editingSheetEmbedIds.delete(sheetKey);
  }
}

function createEmptySpreadsheetEmbedValue() {
  return { url: "", embedUrl: "", provider: "", accessMode: "view" };
}

function normalizeSpreadsheetEmbedValue(value) {
  const rawUrl = value && typeof value === "object" && !Array.isArray(value)
    ? String(value.url ?? value.href ?? value.embedUrl ?? "").trim()
    : String(value ?? "").trim();
  const url = getSafeWorkspaceUrl(rawUrl) || "";
  const accessMode = value && typeof value === "object" && !Array.isArray(value) && value.accessMode === "edit" ? "edit" : "view";
  if (!url) return { ...createEmptySpreadsheetEmbedValue(), accessMode };

  const provider = detectSpreadsheetProvider(url);
  return {
    url,
    embedUrl: createSpreadsheetEmbedUrl(url, provider, accessMode),
    provider,
    accessMode,
  };
}

function detectSpreadsheetProvider(url) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "external";
  }
  if (hostname === "docs.google.com") return "google-sheets";
  if (hostname.includes("office.com") || hostname.includes("officeapps.live.com") || hostname.includes("1drv.ms") || hostname.includes("sharepoint.com")) return "excel-online";
  if (hostname.includes("airtable.com")) return "airtable";
  return "external";
}

function createSpreadsheetEmbedUrl(url, provider, accessMode = "view") {
  if (provider === "google-sheets") return accessMode === "edit" ? createGoogleSheetsFullUrl(url) : createGoogleSheetsEmbedUrl(url);
  return url;
}

function getSpreadsheetOpenUrl(sheetValue, safeUrl) {
  if (sheetValue?.provider === "google-sheets") return createGoogleSheetsFullUrl(safeUrl);
  return safeUrl;
}

function getSpreadsheetOpenLabel(sheetValue) {
  return sheetValue?.provider === "google-sheets" ? "Open Full Google Sheet" : "Open Sheet";
}

function createGoogleSheetsEmbedUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.pathname.match(/\/spreadsheets\/d\/([^/]+)/i);
    if (!match?.[1]) return url;
    const gid = parsedUrl.searchParams.get("gid") || parsedUrl.hash.match(/gid=([0-9]+)/)?.[1] || "";
    const embedUrl = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/preview`);
    if (gid) embedUrl.searchParams.set("gid", gid);
    return embedUrl.toString();
  } catch {
    return url;
  }
}

function createGoogleSheetsFullUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.pathname.match(/\/spreadsheets\/d\/([^/]+)/i);
    if (!match?.[1]) return url;
    const gid = parsedUrl.searchParams.get("gid") || parsedUrl.hash.match(/gid=([0-9]+)/)?.[1] || "";
    const fullUrl = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/edit`);
    if (gid) fullUrl.hash = `gid=${gid}`;
    return fullUrl.toString();
  } catch {
    return url;
  }
}

function getSpreadsheetProviderLabel(provider) {
  if (provider === "google-sheets") return "Google Sheets";
  if (provider === "excel-online") return "Excel Online";
  if (provider === "airtable") return "Airtable";
  return "External Sheet";
}

function getDefaultWorkspaceLinkLabel(url, fallbackLabel = "") {
  const fallback = String(fallbackLabel ?? "").trim();
  if (fallback && fallback.toLowerCase() !== "link") return fallback;
  if (!url) return "";

  try {
    const parsedUrl = new URL(normalizeChatUrl(url));
    return parsedUrl.hostname.replace(/^www\./i, "") || "Open Link";
  } catch {
    return "Open Link";
  }
}

function getSafeWorkspaceUrl(url) {
  return isSafeExternalUrl(url) ? normalizeChatUrl(url) : null;
}

function clearWorkspaceLinkFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;
  field.value = createWorkspaceFieldInitialValue("LINK");
  setWorkspaceDetails(nextDetails);
}

function normalizeTrackingNumber(value) {
  return String(value ?? "").trim();
}

function getShipmentTrackingUrl(trackingNumber) {
  return `https://www.17track.net/en/track?nums=${encodeURIComponent(trackingNumber)}`;
}

function getShipmentMilestones(trackingNumber) {
  if (!trackingNumber) return [];
  const checksum = Array.from(trackingNumber).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const currentIndex = Math.max(1, Math.min(3, checksum % 4));
  return [
    { label: "Info received", detail: "Label created and tracking number saved" },
    { label: "Package collected", detail: "Carrier has collected the shipment" },
    { label: "In transit", detail: "Shipment is moving through the carrier network" },
    { label: "Out for delivery", detail: "Final-mile delivery is pending" },
  ].map((milestone, index) => ({
    ...milestone,
    complete: index < currentIndex,
    current: index === currentIndex,
  }));
}

function getShipmentCarrierLabel(trackingNumber) {
  if (/^1Z/i.test(trackingNumber)) return "UPS";
  if (/^9\d{19,25}$/.test(trackingNumber)) return "USPS";
  if (/^\d{12}$|^\d{15}$/.test(trackingNumber)) return "FedEx";
  if (/^JD/i.test(trackingNumber)) return "DHL";
  return "Auto-detect";
}

function getShipmentStatusSummary(trackingNumber, milestones) {
  const currentIndex = Math.max(0, milestones.findIndex((milestone) => milestone.current));
  const currentMilestone = milestones[currentIndex] ?? milestones[0];
  const stopIndex = Math.min(currentIndex + 1, 3);
  const progress = [18, 45, 68, 86][currentIndex] ?? 45;
  return {
    label: currentMilestone?.label ?? "Tracking saved",
    age: currentIndex >= 2 ? "In transit" : "Awaiting next carrier scan",
    headline: `${currentMilestone?.label ?? "Package collected"} - Estimated delivery updates available in live lookup`,
    location: currentIndex >= 2 ? "Carrier facility scan available" : "Origin scan pending",
    progress,
    stopIndex,
  };
}

function getShipmentTrackingEvents(trackingNumber, milestones) {
  const carrierLabel = getShipmentCarrierLabel(trackingNumber);
  const today = new Date();
  const eventDate = (offsetDays) => {
    const date = new Date(today);
    date.setDate(today.getDate() - offsetDays);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  const currentIndex = Math.max(0, milestones.findIndex((milestone) => milestone.current));
  const events = [
    { date: eventDate(0), location: "Carrier network", description: `${carrierLabel} lookup ready for ${trackingNumber}. Open live lookup for real carrier scans.`, current: true },
    { date: eventDate(1), location: "Origin facility", description: "Package information received and shipment monitoring started." },
  ];
  if (currentIndex >= 2) {
    events.splice(1, 0, { date: eventDate(0), location: "Transit hub", description: "Shipment is currently marked as in transit in the LaunchPad preview." });
  }
  return events;
}

function clearShipmentTrackingFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;
  field.value = "";
  setWorkspaceDetails(nextDetails);
}

function clearShippingTimelineDateFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "SHIPPING_TIMELINE") return;
  const previousValue = structuredCloneWorkspaceFieldValue(field.value);
  field.value = { ...normalizeShippingTimelineValue(field.value), shippingDate: "" };
  recordWorkspaceFieldHistory(nextDetails, { productId, stageId, fieldId, previousValue, nextValue: field.value });
  setWorkspaceDetails(nextDetails);
}

function trackShipmentFromButton(button) {
  const tracker = button.closest(".workspace-shipment-tracker");
  const input = tracker?.querySelector('[data-action="update-workspace-field"]');
  const trackingNumber = normalizeTrackingNumber(input instanceof HTMLInputElement ? input.value : "");
  if (!trackingNumber) {
    if (input instanceof HTMLInputElement) input.focus();
    return;
  }

  const trackingUrl = getShipmentTrackingUrl(trackingNumber);
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(trackingUrl, "_blank", "noopener,noreferrer");
  }
}

function getLongBarTokens(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).map((item) => String(item ?? "").trim()).filter(Boolean);
  return String(value ?? "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function getCustomDropdownOptions(field) {
  return normalizeDropdownOptions(field?.options);
}

function normalizeDropdownOptions(options) {
  return normalizeFieldList(options);
}

function normalizeFieldList(items) {
  const itemValues = Array.isArray(items) ? items : typeof items === "string" ? items.split(/[\n,]+/) : [];
  return Array.from(new Set(itemValues.map((item) => String(item ?? "").trim()).filter(Boolean)));
}

function normalizeProductChatReadBy(readBy) {
  if (!readBy || typeof readBy !== "object" || Array.isArray(readBy)) return {};
  return Object.fromEntries(Object.entries(readBy)
    .map(([userKey, timestamp]) => [String(userKey).trim().toLowerCase(), typeof timestamp === "string" ? timestamp : ""])
    .filter(([userKey, timestamp]) => userKey && Number.isFinite(Date.parse(timestamp))));
}

function isWorkspaceTableFieldType(type) {
  return WORKSPACE_TABLE_FIELD_TYPES.includes(String(type ?? ""));
}

function getCustomTableColumns(field) {
  return normalizeFieldList(field?.tableColumns);
}

function getCustomTableRows(field) {
  return normalizeFieldList(field?.tableRows);
}

function getCustomTableRowLabels(field, length = null) {
  const labels = normalizeTableRowLabels(field?.tableRowLabels);
  if (!Number.isInteger(length) || length < 0) return labels;
  return Array.from({ length }, (_, index) => labels[index] ?? "");
}

function getCustomTableCornerHeader(field) {
  return normalizeTableCornerHeader(field?.tableCornerHeader);
}

function getCustomTableColumnWidths(field) {
  return normalizeTableDimensionList(field?.tableColumnWidths);
}

function getCustomTableRowHeights(field) {
  return normalizeTableDimensionList(field?.tableRowHeights);
}

function normalizeTableCornerHeader(value) {
  return String(value ?? "").trim();
}

function normalizeTableRowLabels(values) {
  const list = Array.isArray(values) ? values : [];
  return list.map((value) => String(value ?? "").trim());
}

function normalizeTableDimensionList(values) {
  const list = Array.isArray(values) ? values : [];
  return list
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 1);
}

function createWorkspaceTableDimensionStyle(width = null, height = null) {
  const style = {};
  if (Number.isFinite(Number(width)) && Number(width) > 0) {
    const px = `${Math.max(1, Math.round(Number(width)))}px`;
    style.width = px;
    style.minWidth = px;
  }
  if (Number.isFinite(Number(height)) && Number(height) > 0) {
    const px = `${Math.max(1, Math.round(Number(height)))}px`;
    style.height = px;
    style.minHeight = px;
  }
  return style;
}

function createWorkspaceTableStyle(columnCount, columnWidths, hasRowHeaderColumn, compact = false) {
  const minimumWidth = getWorkspaceTableMinimumWidth(columnCount, columnWidths, hasRowHeaderColumn, compact);
  return {
    width: `max(100%, ${minimumWidth}px)`,
    minWidth: `${minimumWidth}px`,
  };
}

function getWorkspaceTableMinimumWidth(columnCount, columnWidths, hasRowHeaderColumn, compact = false) {
  const widths = normalizeTableDimensionList(columnWidths);
  const rowHeaderDefault = compact ? 112 : 128;
  const columnDefault = compact ? 112 : 128;
  const rowHeaderWidth = hasRowHeaderColumn ? Number(widths[0]) || rowHeaderDefault : 0;
  const columnOffset = hasRowHeaderColumn ? 1 : 0;
  const columnsWidth = Array.from({ length: Math.max(0, Number(columnCount) || 0) }, (_, index) => Number(widths[index + columnOffset]) || columnDefault)
    .reduce((sum, width) => sum + width, 0);
  return Math.max(1, rowHeaderWidth + columnsWidth);
}

function getWorkspaceTableColumnWidth(widths, columnIndex, hasRowHeaderColumn) {
  const offset = hasRowHeaderColumn ? 1 : 0;
  return normalizeTableDimensionList(widths)[columnIndex + offset] ?? null;
}

function getWorkspaceTableColumnWidthsFromElement(tableField) {
  if (!(tableField instanceof Element)) return [];
  const table = tableField.querySelector("table");
  if (!table) return [];
  const widths = [];
  const cornerOrRowHeader = table.querySelector(".workspace-table-field__corner, tbody th.workspace-table-field__heading--row");
  if (cornerOrRowHeader) widths.push(cornerOrRowHeader.getBoundingClientRect().width);
  table.querySelectorAll("thead th.workspace-table-field__heading--column").forEach((heading) => {
    widths.push(heading.getBoundingClientRect().width);
  });
  return normalizeTableDimensionList(widths);
}

function freezeWorkspaceTableCurrentSizes(tableField) {
  if (!(tableField instanceof Element)) return;
  const widths = getWorkspaceTableColumnWidthsFromElement(tableField);
  widths.forEach((width, index) => applyWorkspaceTableColumnSize(tableField, index, width));
  const heights = getWorkspaceTableRowHeightsFromElement(tableField);
  heights.forEach((height, index) => applyWorkspaceTableRowSize(tableField, index, height));
}

function applyWorkspaceTableColumnSize(tableField, columnIndex, width) {
  if (!(tableField instanceof Element) || !Number.isInteger(columnIndex)) return;
  const style = createWorkspaceTableDimensionStyle(width);
  const col = tableField.querySelectorAll("col")[columnIndex];
  if (col instanceof HTMLElement) applyStyle(col, style);
  const header = tableField.querySelectorAll("thead th")[columnIndex];
  if (header instanceof HTMLElement) applyStyle(header, style);
  tableField.querySelectorAll("tbody tr").forEach((row) => {
    const cell = row.querySelectorAll("th, td")[columnIndex];
    if (cell instanceof HTMLElement) applyStyle(cell, style);
  });
  const currentWidths = getWorkspaceTableColumnWidthsFromElement(tableField);
  applyWorkspaceTableMinimumWidth(tableField, currentWidths);
}

function applyWorkspaceTableRowSize(tableField, rowIndex, height) {
  if (!(tableField instanceof Element) || !Number.isInteger(rowIndex)) return;
  const style = createWorkspaceTableDimensionStyle(null, height);
  const row = tableField.querySelectorAll("tbody tr")[rowIndex];
  if (!(row instanceof HTMLElement)) return;
  applyStyle(row, style);
  row.querySelectorAll("th, td").forEach((cell) => {
    if (cell instanceof HTMLElement) applyStyle(cell, style);
  });
}

function applyWorkspaceTableMinimumWidth(tableField, columnWidths) {
  const table = tableField.querySelector("table");
  if (!(table instanceof HTMLElement)) return;
  const columnCount = tableField.querySelectorAll("thead th.workspace-table-field__heading--column").length;
  const hasRowHeaderColumn = Boolean(tableField.querySelector(".workspace-table-field__corner, tbody th.workspace-table-field__heading--row"));
  const compact = Boolean(tableField.closest(".workspace-field--half-table"));
  applyStyle(table, createWorkspaceTableStyle(columnCount, columnWidths, hasRowHeaderColumn, compact));
}

function getWorkspaceTableRowHeightsFromElement(tableField) {
  if (!(tableField instanceof Element)) return [];
  return normalizeTableDimensionList(Array.from(tableField.querySelectorAll("tbody tr")).map((row) => row.getBoundingClientRect().height));
}

function areNumberListsEqual(first, second) {
  const a = normalizeTableDimensionList(first);
  const b = normalizeTableDimensionList(second);
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= 1);
}

function removeWorkspaceTableColumnWidth(field, columnIndex, hasRowHeaderColumn) {
  const widths = getCustomTableColumnWidths(field);
  const index = hasRowHeaderColumn ? columnIndex + 1 : columnIndex;
  return widths.filter((_, widthIndex) => widthIndex !== index);
}

function reorderWorkspaceTableColumnWidths(field, fromIndex, toIndex, hasRowHeaderColumn) {
  const widths = getCustomTableColumnWidths(field);
  if (!hasRowHeaderColumn) return reorderTableDimensionList(widths, fromIndex, toIndex);
  const [rowHeaderWidth, ...columnWidths] = widths;
  return [rowHeaderWidth, ...reorderTableDimensionList(columnWidths, fromIndex, toIndex)].filter((value) => Number.isFinite(Number(value)));
}

function reorderTableDimensionList(values, fromIndex, toIndex) {
  const dimensions = normalizeTableDimensionList(values);
  return isValidReorderIndex(fromIndex, toIndex, dimensions.length) ? reorderListItem(dimensions, fromIndex, toIndex) : dimensions;
}

function getChecklistNotesItems(field) {
  return normalizeFieldList(field?.checklistItems);
}

function getEffectiveTableRowCount(field) {
  const rows = getCustomTableRows(field);
  const columns = getCustomTableColumns(field);
  return rows.length > 0 ? rows.length : 1;
}

function getEffectiveTableColumnCount(field) {
  const columns = getCustomTableColumns(field);
  const rows = getCustomTableRows(field);
  return columns.length > 0 ? columns.length : rows.length > 0 ? 0 : 1;
}

function getCustomTableValue(value) {
  return Array.isArray(value) ? value.map((row) => Array.isArray(row) ? row : []) : [];
}

function resizeCustomTableValue(value, rowCount, columnCount) {
  const currentValue = getCustomTableValue(value);
  return Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => String(currentValue?.[rowIndex]?.[columnIndex] ?? "")));
}

function normalizeChecklistNotesValue(value, items = []) {
  const rawValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const checked = rawValue.checked && typeof rawValue.checked === "object" ? rawValue.checked : {};
  const allowedItems = normalizeFieldList(items);
  return {
    checked: Object.fromEntries(Object.entries(checked).filter(([item]) => allowedItems.length === 0 || allowedItems.includes(item)).map(([item, isChecked]) => [item, Boolean(isChecked)])),
    notes: String(rawValue.notes ?? ""),
  };
}

function createEmptyWorkspaceDetails() {
  return { products: {}, stageFieldTemplates: {}, fieldHistory: [], productHistory: [] };
}

function structuredCloneWorkspaceDetails(details) {
  return JSON.parse(JSON.stringify(details ?? createEmptyWorkspaceDetails()));
}

function createWorkspaceFieldInitialValue(type, imageGalleryFormat = "") {
  if (type === "CURRENCY") return { amount: "", currency: "USD" };
  if (type === "THREE_SHORT_BARS") return ["", "", ""];
  if (type === "FOUR_SHORT_BARS") return ["", "", "", ""];
  if (type === "SHEET_EMBED") return createEmptySpreadsheetEmbedValue();
  if (isWorkspaceTableFieldType(type)) return [];
  if (type === "FILE_UPLOAD") return [];
  if (type === "IMAGE_GALLERY") return createEmptyImageGalleryValue(imageGalleryFormat);
  if (type === "PAYMENT_STATUS") return createEmptyPaymentStatusValue();
  if (type === "LISTING_CONTENT") return createEmptyListingContentValue();
  if (type === "SHIPPING_TIMELINE") return { shippingDate: "", expectedDays: "" };
  if (type === "CHECKLIST_NOTES") return { checked: {}, notes: "" };
  return "";
}

function createWorkspaceFieldId() {
  return `workspace_field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createWorkspaceChecklistId() {
  return `workspace_checklist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createWorkspaceFileId() {
  return `workspace_file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createPaymentHistoryId() {
  return `payment_history_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getWorkspaceFieldTypeLabel(type) {
  return WORKSPACE_CUSTOM_FIELD_TYPES.find((fieldType) => fieldType.value === type)?.label ?? type;
}

function getWorkspaceCustomFieldDefaultLabel(type) {
  if (type === "HEADER_TITLE") return "Custom Product Attributes";
  if (type === "PAYMENT_STATUS") return "Transaction Record";
  return "";
}

function getLegacyCustomFieldDefaultLabel(type) {
  return CUSTOM_FIELD_TYPES.includes(type) ? type : "Custom Field";
}

function launchConfettiEffect(originElement = null) {
  if (typeof document === "undefined") return;

  const originRect = originElement instanceof Element ? originElement.getBoundingClientRect() : null;
  const originX = originRect ? originRect.left + originRect.width / 2 : window.innerWidth / 2;
  const originY = originRect ? originRect.top + originRect.height / 2 : window.innerHeight / 2;
  const confettiPieces = Array.from({ length: 52 }, (_, index) => createElement("span", {
    className: "confetti-piece",
    style: {
      left: `${originX}px`,
      top: `${originY}px`,
      background: getConfettiColor(index),
      animationDelay: `${Math.random() * 0.12}s`,
      '--confetti-x': `${(Math.random() - 0.5) * 320}px`,
      '--confetti-y': `${-80 - Math.random() * 220}px`,
      '--confetti-rotation': `${360 + Math.random() * 720}deg`,
    },
  }));

  const confettiLayer = createElement("div", { className: "confetti-layer", ariaHidden: "true" }, [
    createElement("span", { className: "confetti-party-popper", style: { left: `${originX}px`, top: `${originY}px` } }, "🎉"),
    confettiPieces,
  ]);

  document.body.appendChild(confettiLayer);
  window.setTimeout(() => confettiLayer.remove(), 1800);
}

function getConfettiColor(index) {
  const colors = ["var(--color-primary)", "rgb(22 163 74)", "rgb(245 158 11)", "rgb(239 68 68)", "rgb(139 92 246)"];
  return colors[index % colors.length];
}

function renderFromCurrentState() {
  const shell = getShellElements();
  if (!shell) return;
  safeRenderApp(shell);
}

function renderFromCurrentStatePreservingScroll() {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  renderFromCurrentState();
  window.requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
}

function renderCogsCalculatorPreservingScroll() {
  const currentDialog = document.querySelector(".workspace-modal__dialog--cogs");
  const scrollTop = currentDialog instanceof HTMLElement ? currentDialog.scrollTop : 0;
  renderFromCurrentStatePreservingScroll();
  const nextDialog = document.querySelector(".workspace-modal__dialog--cogs");
  if (nextDialog instanceof HTMLElement) nextDialog.scrollTop = scrollTop;
}

function restoreChatSearchFocus(selectionStart = null) {
  const searchInput = document.querySelector('[data-action="update-chat-search"]');
  if (!(searchInput instanceof HTMLInputElement)) return;

  const nextSelectionStart = selectionStart ?? searchInput.value.length;
  searchInput.focus();
  searchInput.setSelectionRange(nextSelectionStart, nextSelectionStart);
}

function restoreSearchFocus(selectionStart) {
  const searchInput = document.querySelector('[data-action="update-search"]');
  if (!(searchInput instanceof HTMLInputElement)) return;

  searchInput.focus();
  searchInput.setSelectionRange(selectionStart, selectionStart);
}

function getSearchScopedStages(activeProduct, visibleStages, searchQuery) {
  const query = normalizeSearchText(searchQuery);
  if (!query) return visibleStages;

  return visibleStages.filter((stage) => stageMatchesSearch(activeProduct, stage, query));
}

function stageMatchesSearch(activeProduct, stage, query) {
  const stageBlock = getStageBlock(activeProduct, stage.stage_id);
  const searchableValues = [stage.label, String(stage.stage_index), stage.phase];

  if (stageBlock) {
    for (const field of stageBlock.custom_fields) {
      searchableValues.push(field.label, field.type, stringifyFieldValue(field.value));
    }

    for (const task of stageBlock.checklist_tasks) {
      searchableValues.push(task.task_name);
    }
  }

  return searchableValues.some((value) => normalizeSearchText(value).includes(query));
}

function stringifyFieldValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return Object.values(value).map((item) => String(item ?? "")).join(" ");
  return String(value);
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getSelectedStageId(activeProduct, visibleStages) {
  if (!activeProduct || visibleStages.length === 0) return null;
  const currentSelectionIsVisible = visibleStages.some((stage) => stage.stage_id === uiState.selectedStageId);
  if (currentSelectionIsVisible) return uiState.selectedStageId;
  return visibleStages.at(-1)?.stage_id ?? null;
}

function getStageIcon(stageId) {
  const icons = {
    "product-research": "search",
    "product-development": "architecture",
    "supplier-sourcing": "factory",
    "under-final-order": "receipt_long",
    shipping: "local_shipping",
    "keyword-research": "table_rows",
    "listing-creation": "format_list_bulleted",
    "image-planning": "image",
    "campaign-prep": "campaign",
    "amazon-inbound": "warehouse",
    "enrolled-to-vines": "star",
    launch: "rocket_launch",
    stable: "check_circle",
    scaling: "monitoring",
  };

  return icons[stageId] ?? "radio_button_unchecked";
}

function createHeaderButton(iconName, ariaLabel) {
  return createElement("button", { className: "icon-button", type: "button", ariaLabel }, [createIcon(iconName)]);
}

function createIcon(iconName) {
  return createElement("span", { className: "material-symbols-outlined", ariaHidden: "true" }, iconName);
}

function createElement(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);
  const childList = Array.isArray(children) ? children : [children];

  applyElementOptions(element, options);
  for (const child of childList) {
    appendChild(element, child);
  }

  return element;
}

function applyElementOptions(element, options) {
  if (!options) return;

  const optionHandlers = {
    ariaControls: (value) => setNullableAttribute(element, "aria-controls", value),
    ariaCurrent: (value) => setNullableAttribute(element, "aria-current", value),
    ariaExpanded: (value) => setNullableAttribute(element, "aria-expanded", value),
    ariaHidden: (value) => setNullableAttribute(element, "aria-hidden", value),
    ariaLabel: (value) => setNullableAttribute(element, "aria-label", value),
    ariaLabelledby: (value) => setNullableAttribute(element, "aria-labelledby", value),
    ariaDescribedby: (value) => setNullableAttribute(element, "aria-describedby", value),
    ariaModal: (value) => setNullableAttribute(element, "aria-modal", value),
    ariaPressed: (value) => setNullableAttribute(element, "aria-pressed", value),
    ariaDisabled: (value) => setNullableAttribute(element, "aria-disabled", value),
    ariaBusy: (value) => setNullableAttribute(element, "aria-busy", value),
    ariaValueMax: (value) => setNullableAttribute(element, "aria-valuemax", value),
    ariaValueMin: (value) => setNullableAttribute(element, "aria-valuemin", value),
    ariaValueNow: (value) => setNullableAttribute(element, "aria-valuenow", value),
    accept: (value) => setNullableAttribute(element, "accept", value),
    alt: (value) => setNullableAttribute(element, "alt", value),
    autocomplete: (value) => setNullableAttribute(element, "autocomplete", value),
    checked: (value) => {
      element.checked = Boolean(value);
    },
    className: (value) => {
      element.className = value;
    },
    colSpan: (value) => {
      element.colSpan = Number(value) || 1;
    },
    dataAction: (value) => setNullableAttribute(element, "data-action", value),
    dataAttachmentId: (value) => setNullableAttribute(element, "data-attachment-id", value),
    dataBackupId: (value) => setNullableAttribute(element, "data-backup-id", value),
    dataDashboardSlideDropIndex: (value) => setNullableAttribute(element, "data-dashboard-slide-drop-index", value),
    dataChecklistId: (value) => setNullableAttribute(element, "data-checklist-id", value),
    dataChecklistDropId: (value) => setNullableAttribute(element, "data-checklist-drop-id", value),
    dataChatFormat: (value) => setNullableAttribute(element, "data-chat-format", value),
    dataDropdownOptionIndex: (value) => setNullableAttribute(element, "data-dropdown-option-index", value),
    dataEmoji: (value) => setNullableAttribute(element, "data-emoji", value),
    dataExportFormat: (value) => setNullableAttribute(element, "data-export-format", value),
    dateTime: (value) => setNullableAttribute(element, "datetime", value),
    dataFieldId: (value) => setNullableAttribute(element, "data-field-id", value),
    dataFieldDropId: (value) => setNullableAttribute(element, "data-field-drop-id", value),
    dataGalleryFormat: (value) => setNullableAttribute(element, "data-gallery-format", value),
    dataGallerySlotIndex: (value) => setNullableAttribute(element, "data-gallery-slot-index", value),
    dataFieldPart: (value) => setNullableAttribute(element, "data-field-part", value),
    dataHistoryEntryId: (value) => setNullableAttribute(element, "data-history-entry-id", value),
    dataListingPart: (value) => setNullableAttribute(element, "data-listing-part", value),
    dataListingCounter: (value) => setNullableAttribute(element, "data-listing-counter", value),
    dataLaunchMode: (value) => setNullableAttribute(element, "data-launch-mode", value),
    dataLaunchChartIndex: (value) => setNullableAttribute(element, "data-launch-chart-index", value),
    dataLaunchEntryId: (value) => setNullableAttribute(element, "data-launch-entry-id", value),
    dataLaunchPlanField: (value) => setNullableAttribute(element, "data-launch-plan-field", value),
    dataMessageId: (value) => setNullableAttribute(element, "data-message-id", value),
    dataBulletIndex: (value) => setNullableAttribute(element, "data-bullet-index", value),
    dataCampaignMetric: (value) => setNullableAttribute(element, "data-campaign-metric", value),
    dataCogsBatchId: (value) => setNullableAttribute(element, "data-cogs-batch-id", value),
    dataCogsBatchTotalOutput: (value) => setNullableAttribute(element, "data-cogs-batch-total-output", value),
    dataCogsCategoryTotalOutput: (value) => setNullableAttribute(element, "data-cogs-category-total-output", value),
    dataCogsCostIndex: (value) => setNullableAttribute(element, "data-cogs-cost-index", value),
    dataCogsCostOutput: (value) => setNullableAttribute(element, "data-cogs-cost-output", value),
    dataCogsField: (value) => setNullableAttribute(element, "data-cogs-field", value),
    dataCogsTemplateCategoryId: (value) => setNullableAttribute(element, "data-cogs-template-category-id", value),
    dataCogsTemplateRowId: (value) => setNullableAttribute(element, "data-cogs-template-row-id", value),
    dataCogsTemplateField: (value) => setNullableAttribute(element, "data-cogs-template-field", value),
    dataCogsTemplateUnitOutput: (value) => setNullableAttribute(element, "data-cogs-template-unit-output", value),
    dataCogsTemplateDropType: (value) => setNullableAttribute(element, "data-cogs-template-drop-type", value),
    dataCogsTemplateDropId: (value) => setNullableAttribute(element, "data-cogs-template-drop-id", value),
    dataProductId: (value) => setNullableAttribute(element, "data-product-id", value),
    dataProductFinancialMetric: (value) => setNullableAttribute(element, "data-product-financial-metric", value),
    dataProductFinancialOutput: (value) => setNullableAttribute(element, "data-product-financial-output", value),
    dataProductDropStageId: (value) => setNullableAttribute(element, "data-product-drop-stage-id", value),
    dataPaymentId: (value) => setNullableAttribute(element, "data-payment-id", value),
    dataRowIndex: (value) => setNullableAttribute(element, "data-row-index", value),
    dataColumnIndex: (value) => setNullableAttribute(element, "data-column-index", value),
    dataTableAxis: (value) => setNullableAttribute(element, "data-table-axis", value),
    dataTableIndex: (value) => setNullableAttribute(element, "data-table-index", value),
    dataTableDropAxis: (value) => setNullableAttribute(element, "data-table-drop-axis", value),
    dataTableDropIndex: (value) => setNullableAttribute(element, "data-table-drop-index", value),
    dataOptionIndex: (value) => setNullableAttribute(element, "data-option-index", value),
    dataSettingsCategory: (value) => setNullableAttribute(element, "data-settings-category", value),
    dataStageId: (value) => setNullableAttribute(element, "data-stage-id", value),
    dataStageDirection: (value) => setNullableAttribute(element, "data-stage-direction", value),
    dataStageDropId: (value) => setNullableAttribute(element, "data-stage-drop-id", value),
    dataTaskId: (value) => setNullableAttribute(element, "data-task-id", value),
    dataTokenIndex: (value) => setNullableAttribute(element, "data-token-index", value),
    dataUserId: (value) => setNullableAttribute(element, "data-user-id", value),
    dataVineEntryId: (value) => setNullableAttribute(element, "data-vine-entry-id", value),
    dataVineEntryType: (value) => setNullableAttribute(element, "data-vine-entry-type", value),
    dataVineMetric: (value) => setNullableAttribute(element, "data-vine-metric", value),
    dataWorkspaceBrandField: (value) => setNullableAttribute(element, "data-workspace-brand-field", value),
    disabled: (value) => {
      element.disabled = Boolean(value);
    },
    draggable: (value) => {
      element.draggable = Boolean(value);
    },
    href: (value) => setNullableAttribute(element, "href", value),
    download: (value) => setNullableAttribute(element, "download", value),
    htmlFor: (value) => setNullableAttribute(element, "for", value),
    id: (value) => setNullableAttribute(element, "id", value),
    inputMode: (value) => setNullableAttribute(element, "inputmode", value),
    name: (value) => setNullableAttribute(element, "name", value),
    maxlength: (value) => setNullableAttribute(element, "maxlength", value),
    min: (value) => setNullableAttribute(element, "min", value),
    placeholder: (value) => setNullableAttribute(element, "placeholder", value),
    preload: (value) => setNullableAttribute(element, "preload", value),
    rel: (value) => setNullableAttribute(element, "rel", value),
    required: (value) => setBooleanAttribute(element, "required", value),
    role: (value) => setNullableAttribute(element, "role", value),
    rows: (value) => setNullableAttribute(element, "rows", value),
    selected: (value) => {
      element.selected = Boolean(value);
    },
    src: (value) => setNullableAttribute(element, "src", value),
    step: (value) => setNullableAttribute(element, "step", value),
    style: (value) => applyStyle(element, value),
    target: (value) => setNullableAttribute(element, "target", value),
    title: (value) => setNullableAttribute(element, "title", value),
    controls: (value) => {
      element.controls = Boolean(value);
    },
    multiple: (value) => {
      element.multiple = Boolean(value);
    },
    open: (value) => {
      element.open = Boolean(value);
    },
    type: (value) => setNullableAttribute(element, "type", value),
    value: (value) => {
      element.value = value ?? "";
    },
  };

  for (const [key, value] of Object.entries(options)) {
    optionHandlers[key]?.(value);
  }
}

function appendChild(parent, child) {
  if (child === null || child === undefined) return;
  if (Array.isArray(child)) {
    child.forEach((nestedChild) => appendChild(parent, nestedChild));
    return;
  }
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}

function replaceChildren(parent, ...children) {
  parent.replaceChildren(...children.filter((child) => child !== null && child !== undefined));
}

function setNullableAttribute(element, name, value) {
  if (value === null || value === undefined || value === false) return;
  element.setAttribute(name, String(value));
}

function setBooleanAttribute(element, name, value) {
  if (!value) return;
  element.setAttribute(name, "");
}

function applyStyle(element, style) {
  if (!style || typeof style !== "object") return;
  for (const [property, value] of Object.entries(style)) {
    if (property.startsWith("--")) {
      element.style.setProperty(property, value);
    } else {
      element.style[property] = value;
    }
  }
}

function getSafeHttpUrl(value) {
  if (typeof value !== "string" || !value) return null;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function formatCurrencyValue(value) {
  const amount = value?.amount;
  const currency = typeof value?.currency === "string" && value.currency ? value.currency.toUpperCase() : "USD";
  if (!Number.isFinite(amount)) return "No amount entered";

  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
