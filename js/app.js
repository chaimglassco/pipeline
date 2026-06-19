import { LAUNCHFLOW_STAGES, MAX_STAGE_INDEX } from "./constants/stages.js";
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
import { getSupabaseConfig, isSupabaseConfigured } from "./supabaseClient.js";

const uiState = {
  selectedStageId: "product-research",
  selectedProductId: null,
  activeView: "pipeline",
  expandedWorkspaceStageIds: new Set(["product-research"]),
  collapsedChecklistIds: new Set(),
  expandedChecklistIds: new Set(),
  hiddenCompletedChecklistIds: new Set(),
  paymentModal: null,
  fieldModal: null,
  checklistNoteModal: null,
  campaignLinkModalOpen: false,
  vineEntryModal: null,
  launchEntryModal: null,
  launchPortfolioModalOpen: false,
  dashboardRange: "all",
  activeChatProductId: null,
  chatAssetsOpen: false,
  chatSearchOpen: false,
  chatSearchQuery: "",
  chatEmojiOpen: false,
  chatAttachmentPreview: null,
  imageGalleryPreview: null,
  imageGalleryUploadingSlots: new Set(),
  imageGalleryUploadError: "",
  pendingChatAttachments: [],
  chatUploadingFiles: false,
  chatSending: false,
  addProductModalOpen: false,
  editingProductId: null,
  productModalDraft: createEmptyProductModalDraft(),
  addStageModalOpen: false,
  stageEditorOpen: false,
  draggedStageId: null,
  draggedProductId: null,
  draggedChecklistTask: null,
  draggedTableSection: null,
  draggedWorkspaceField: null,
  settingsInviteModalOpen: false,
  editingTeamUserId: null,
  settingsUserNotice: "",
  supabaseSyncNotice: "",
  settingsUserSearchQuery: "",
  settingsCategory: "profile",
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
});
const LOCAL_UPLOAD_URL_PREFIX = "launchflow-local://";
const LOCAL_UPLOAD_DB_NAME = "launchflow-local-uploads";
const LOCAL_UPLOAD_STORE_NAME = "uploads";
const localUploadObjectUrlCache = new Map();
const localUploadHydrationPromises = new Map();

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
  if (storageUrl.startsWith(LOCAL_UPLOAD_URL_PREFIX)) return getLocalBrowserUploadObjectUrl(storageUrl);
  if (storageUrl.startsWith("blob:")) return "";
  return storageUrl;
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
const STAGE_SETTINGS_STORAGE_KEY = "launchflow.stageSettings.v1";
const UI_PREFERENCES_STORAGE_KEY = "launchflow.uiPreferences.v1";
const DASHBOARD_SETTINGS_STORAGE_KEY = "launchflow.dashboardSettings.v1";
const ACTIVITY_LOG_STORAGE_KEY = "launchflow.activityLog.v1";
const CAMPAIGN_PREP_SETTINGS_STORAGE_KEY = "launchflow.campaignPrepSettings.v1";
const VINE_SETTINGS_STORAGE_KEY = "launchflow.vineSettings.v1";
const LAUNCH_MONITORING_STORAGE_KEY = "launchflow.launchMonitoring.v1";
const USER_PRODUCTS_STORAGE_KEY = "launchflow.userProducts.v1";
const PRODUCT_SETTINGS_STORAGE_KEY = "launchflow.productSettings.v1";
const TEAM_USERS_STORAGE_KEY = "launchflow.teamUsers.v1";
const MANUAL_ACCESS_STORAGE_KEY = "launchflow.manualAccess.v1";
const AUTH_SESSION_STORAGE_KEY = "launchflow.authSession.v1";
const WORKSPACE_DETAILS_DIRTY_AT_STORAGE_KEY = "launchflow.workspaceDetails.dirtyAt.v1";
const SUPABASE_STATE_REMOTE_UPDATED_AT_STORAGE_KEY = "launchflow.supabaseStateRemoteUpdatedAt.v1";
const WORKSPACE_DETAILS_DIRTY_GRACE_MS = 30000;
const SUPABASE_STAGE_SETTINGS_STATE_KEY = "stage_settings";
const SUPABASE_CAMPAIGN_PREP_STATE_KEY = "campaign_prep_settings";
const SUPABASE_VINE_SETTINGS_STATE_KEY = "vine_settings";
const SUPABASE_LAUNCH_MONITORING_STATE_KEY = "launch_monitoring_settings";
const SUPABASE_WORKSPACE_DETAILS_STATE_KEY = "workspace_details";
const SUPABASE_USER_PRODUCTS_STATE_KEY = "user_products";
const SUPABASE_PRODUCT_SETTINGS_STATE_KEY = "product_settings";
const SUPABASE_STAGE_SETTINGS_STATE_KEY = "stage_settings";
const SUPABASE_CAMPAIGN_PREP_SETTINGS_STATE_KEY = "campaign_prep_settings";
const SUPABASE_VINE_SETTINGS_STATE_KEY = "vine_settings";
const SUPABASE_LAUNCH_MONITORING_SETTINGS_STATE_KEY = "launch_monitoring_settings";
const SUPABASE_WORKSPACE_SYNC_INTERVAL_MS = 10000;
const WORKSPACE_REMOTE_APPLY_EDIT_GRACE_MS = 2000;
const WORKSPACE_DETAILS_SUPABASE_DEBOUNCE_MS = 650;
const ADMIN_OWNER_CREDENTIALS = Object.freeze({
  email: "chaim@glasscosupplies.com",
  password: "Cg.123456",
  name: "Chaim Glass",
  role: "ADMIN",
});
const WORKSPACE_CUSTOM_FIELD_TYPES = Object.freeze([
  { value: "SHORT_TEXT", label: "Short Text" },
  { value: "LONG_BAR", label: "Long Bar" },
  { value: "HALF_LONG_TEXT", label: "Half Long Text Bar" },
  { value: "LONG_TEXT", label: "Long Text" },
  { value: "NUMBER", label: "Number" },
  { value: "CURRENCY", label: "Currency" },
  { value: "DATE", label: "Calendar Date" },
  { value: "LINK", label: "Link" },
  { value: "LISTING_CONTENT", label: "Listing Content Builder" },
  { value: "SHIPMENT_TRACKER", label: "Track Shipment" },
  { value: "CUSTOM_DROPDOWN", label: "Custom Dropdown" },
  { value: "CUSTOM_TABLE", label: "Custom Table" },
  { value: "FILE_UPLOAD", label: "File Upload" },
  { value: "IMAGE_GALLERY", label: "Image Gallery" },
  { value: "PAYMENT_STATUS", label: "Payment Status" },
  { value: "CHECKLIST_NOTES", label: "Checklist + Notes" },
]);
const WORKSPACE_CUSTOM_FIELD_TYPE_VALUES = WORKSPACE_CUSTOM_FIELD_TYPES.map((fieldType) => fieldType.value);
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
    total: 24,
    sponsoredProducts: 14,
    sponsoredBrands: 6,
    sponsoredDisplay: 4,
  }),
  sheetButtonText: "Open Campaign Management Sheet",
  sheetUrl: "https://docs.google.com/spreadsheets/",
});
const DEFAULT_DASHBOARD_SETTINGS = Object.freeze({
  title: "Launch 50 Products in 2026",
  subtitle: "Launch 50 products by end of year to hit revenue targets",
  targetLaunches: 50,
  backgroundImages: Object.freeze([]),
});
const DASHBOARD_HERO_SLIDE_SECONDS = 3;
const DASHBOARD_HERO_BACKGROUND_WIDTH = 1500;
const DASHBOARD_HERO_BACKGROUND_HEIGHT = 756;
const DEFAULT_VINE_SETTINGS = Object.freeze({
  metrics: Object.freeze({
    shippedUnits: 30,
    totalUnits: 30,
    reviewsReceived: 12,
    reviewGoal: 30,
    averageRating: 4.2,
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
    launchPeriod: 30,
  }),
  portfolioButtonText: "Open Amazon Portfolio",
  portfolioUrl: "https://advertising.amazon.com/",
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
const BUILT_IN_STAGE_FIELD_TEMPLATES = Object.freeze({
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
let workspaceDetailsDirtyAt = loadWorkspaceDetailsDirtyAt();
let supabaseStateRemoteUpdatedAt = loadSupabaseStateRemoteUpdatedAt();
let dashboardSettings = loadDashboardSettings();
let activityLog = loadActivityLog();
let campaignPrepSettings = loadCampaignPrepSettings();
let vineSettings = loadVineSettings();
let launchMonitoringSettings = loadLaunchMonitoringSettings();

const SIDEBAR_STAGE_TABS = [
  ...LAUNCHFLOW_STAGES.slice(0, 12).map((stage) => ({
    id: stage.stage_id,
    label: stage.stage_id === "campaign-prep" ? "Campaign Preparation" : stage.label,
    panelLabel: stage.stage_id === "product-research" ? "Research Pipeline" : `${stage.label} Pipeline`,
    icon: getStageIcon(stage.stage_id),
  })),
  { id: "optimization", label: "Optimization", panelLabel: "Optimization Pipeline", icon: "trending_up" },
  ...LAUNCHFLOW_STAGES.slice(12).map((stage) => ({
    id: stage.stage_id,
    label: stage.label,
    panelLabel: `${stage.label} Pipeline`,
    icon: getStageIcon(stage.stage_id),
  })),
];

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
let supabaseWorkspaceSyncIntervalId = null;
let workspaceDetailsSupabaseDebounceId = null;
let activeWorkspaceEdit = null;
let lastWorkspaceLocalEditAt = 0;
let productDragGhost = null;
let productDropStageId = null;

let renderRecoveryAttempted = false;
let launchFlowBooted = false;
let remoteWorkspaceSyncTimeoutId = null;
let remoteWorkspacePollIntervalId = null;
let remoteWorkspaceSyncInFlight = false;
let remoteWorkspaceDirty = false;

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
    document.addEventListener("DOMContentLoaded", bootLaunchFlow);
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

function initializeApp() {
  const shell = getShellElements();
  if (!shell) return;

  restoreUiPreferences();
  shell.appRoot.addEventListener("click", handleAppClick);
  shell.appRoot.addEventListener("dblclick", handleAppDoubleClick);
  shell.appRoot.addEventListener("change", handleAppChange);
  shell.appRoot.addEventListener("input", handleAppInput);
  shell.appRoot.addEventListener("focusin", handleAppFocusIn);
  shell.appRoot.addEventListener("focusout", handleAppFocusOut);
  shell.appRoot.addEventListener("submit", handleAppSubmit);
  shell.appRoot.addEventListener("keydown", handleAppKeyDown);
  shell.appRoot.addEventListener("dragstart", handleAppDragStart);
  shell.appRoot.addEventListener("dragover", handleAppDragOver);
  shell.appRoot.addEventListener("drag", handleAppDragMove);
  shell.appRoot.addEventListener("drop", handleAppDrop);
  shell.appRoot.addEventListener("dragend", handleAppDragEnd);
  ensureSelectedProductForStage();
  subscribe(() => safeRenderApp(shell));
  safeRenderApp(shell);
  startRemoteWorkspaceSync();
}

function getShellElements() {
  const appRoot = document.getElementById("app-root");
  const header = document.getElementById("app-header");
  const sidebar = document.getElementById("app-sidebar");
  const productPanel = document.getElementById("app-product-panel");
  const workspace = document.getElementById("app-workspace");
  const contextPanel = document.getElementById("app-context-panel");

  if (!appRoot || !header || !sidebar || !productPanel || !workspace || !contextPanel) return null;
  return { appRoot, header, sidebar, productPanel, workspace, contextPanel };
}

function safeRenderApp(shell) {
  try {
    renderApp(shell);
    renderRecoveryAttempted = false;
  } catch (error) {
    console.error("LaunchFlow render failed.", error);
    if (!renderRecoveryAttempted) {
      renderRecoveryAttempted = true;
      try {
        recoverRenderableState();
        renderApp(shell);
        renderRecoveryAttempted = false;
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

function recoverRenderableState() {
  workspaceDetails = normalizeWorkspaceDetails(workspaceDetails);
  stageSettings = normalizeStageSettings(stageSettings);
  userProducts = normalizeUserProducts(userProducts);
  productSettings = normalizeProductSettings(productSettings);
  teamUsers = normalizeTeamUsers(teamUsers);
  campaignPrepSettings = normalizeCampaignPrepSettings(campaignPrepSettings);
  vineSettings = normalizeVineSettings(vineSettings);
  launchMonitoringSettings = normalizeLaunchMonitoringSettings(launchMonitoringSettings);
  if (!["pipeline", "settings"].includes(uiState.activeView)) uiState.activeView = "pipeline";
  if (!getSidebarStageTabs().some((stageTab) => stageTab.id === uiState.selectedStageId)) {
    uiState.selectedStageId = getSidebarStageTabs()[0]?.id ?? "product-research";
  }
  ensureSelectedProductForStage(true);
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
  replaceChildren(shell.appRoot, createAppErrorCard("LaunchFlow had trouble loading", `The app caught a local data/render issue instead of showing a blank page. Details: ${error?.message ?? "Unknown render error"}`));
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
  shell.appRoot.classList.toggle("app-root--dashboard", uiState.activeView === "dashboard");
  if (uiState.activeView === "pipeline") ensureSelectedProductForStage();
  renderHeader(shell.header);
  renderSidebar(shell.sidebar);
  renderProductPanel(shell.productPanel);
  renderWorkspace(shell.workspace);
  renderContextPanel(shell.contextPanel);
}
function renderHeader(header) {
  replaceChildren(header, renderTopActions());
}

function renderTopActions() {
  const currentUser = getCurrentTeamUser();
  const role = currentUser?.role ?? getCurrentUserRole();
  return createElement("div", { className: "app-top-actions", ariaLabel: "Account actions" }, [
    createElement("span", { className: "app-top-actions__user" }, [
      createElement("strong", null, currentUser?.name ?? authSession?.name ?? ADMIN_OWNER_CREDENTIALS.name),
      createElement("span", null, role),
    ]),
    createElement("button", { className: "app-top-actions__button", type: "button", dataAction: "open-settings", ariaLabel: "Open settings" }, [createIcon("settings")]),
    createElement("button", { className: "app-top-actions__button", type: "button", dataAction: "open-profile", ariaLabel: "Open profile" }, [createIcon("account_circle")]),
    createElement("button", { className: "app-top-actions__button", type: "button", dataAction: "logout", ariaLabel: "Log out" }, [createIcon("logout")]),
  ]);
}
function renderLoginPage(shell) {
  [shell.header, shell.sidebar, shell.productPanel, shell.workspace, shell.contextPanel].forEach((element) => {
    element.hidden = true;
  });

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
            createElement("input", { type: "email", name: "email", placeholder: "name@company.com", autocomplete: "email", value: uiState.loginDraft.email, dataAction: "update-login-email", required: true }),
          ]),
        ]),
        createElement("label", { className: "login-field" }, [
          createElement("span", { className: "login-field__label-row" }, [
            createElement("span", null, "Password"),
            createElement("button", { type: "button", dataAction: "forgot-password", className: "login-link" }, "Forgot password?"),
          ]),
          createElement("span", { className: "login-field__control" }, [
            createIcon("lock"),
            createElement("input", { type: uiState.showLoginPassword ? "text" : "password", name: "password", placeholder: "••••••••", autocomplete: "current-password", value: uiState.loginDraft.password, dataAction: "update-login-password", required: true }),
            createElement("button", { className: "login-field__toggle", type: "button", dataAction: "toggle-login-password", ariaLabel: uiState.showLoginPassword ? "Hide password" : "Show password" }, [createIcon(uiState.showLoginPassword ? "visibility_off" : "visibility")]),
          ]),
        ]),
        createElement("label", { className: "login-remember" }, [
          createElement("input", { type: "checkbox", name: "remember", checked: uiState.loginDraft.remember, dataAction: "update-login-remember" }),
          createElement("span", null, "Remember this device"),
        ]),
        createElement("button", { className: "login-submit", type: "submit" }, [createElement("span", null, "Sign In"), createIcon("arrow_forward")]),
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
  [shell.header, shell.sidebar, shell.productPanel, shell.workspace, shell.contextPanel].forEach((element) => {
    element.hidden = false;
  });
  shell.appRoot.querySelector(".login-page")?.remove();
}

function renderSidebar(sidebar) {
  const isStageEditorOpen = uiState.stageEditorOpen && canEditPipelineTabs();

  replaceChildren(
    sidebar,
    createElement("div", { className: "sidebar-brand" }, [
      createElement("h1", { className: "sidebar-brand__title" }, "LaunchPad Pro"),
      createElement("p", { className: "sidebar-brand__subtitle" }, "Amazon Seller Tools"),
    ]),
    createElement("nav", { className: "sidebar-menu", ariaLabel: "Primary navigation" }, [
      createElement("button", { className: "sidebar-tab sidebar-tab--dashboard", type: "button", dataAction: "open-dashboard" }, [
        createIcon("dashboard"),
        createElement("span", null, "Dashboard"),
      ]),
    ]),
    createElement("div", { className: "sidebar-section-heading" }, [
      createElement("span", { className: "sidebar-section-label" }, "Pipeline Stages"),
      canEditPipelineTabs() ? createElement("span", { className: "sidebar-section-actions" }, [
        createElement("button", { className: "sidebar-icon-button", type: "button", dataAction: "toggle-stage-editor", ariaLabel: "Edit pipeline stages" }, [createIcon("edit")]),
        createElement("button", { className: "sidebar-icon-button", type: "button", dataAction: "recover-stages", ariaLabel: "Recover deleted pipeline stages" }, [createIcon("restore")]),
      ]) : null,
    ]),
    isStageEditorOpen
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
      ),
    canEditPipelineTabs() ? renderAddStageButton() : null,
    renderAddStageModal(),
  );
}

function renderStageEditorPanel() {
  const visibleTabs = getSidebarStageTabs();
  const hiddenTabs = getHiddenSidebarStageTabs();

  return createElement("section", { className: "stage-editor", ariaLabel: "Edit pipeline stage tabs" }, [
    createElement("p", { className: "stage-editor__note" }, "Rename or reorder tabs here. Delete is locked while a stage still has product/data references."),
    ...visibleTabs.map((stageTab) => renderStageEditorRow(stageTab)),
    hiddenTabs.length > 0
      ? createElement("div", { className: "stage-editor__recover-list" }, [
        createElement("strong", null, "Deleted stages"),
        ...hiddenTabs.map((stageTab) => createElement("button", { className: "stage-editor__recover", type: "button", dataAction: "recover-stage", dataStageId: stageTab.id }, [
          createIcon("restore"),
          createElement("span", null, stageTab.label),
        ])),
      ])
      : null,
  ].filter(Boolean));
}

function renderStageEditorRow(stageTab) {
  const deleteWarning = getStageDeleteWarning(stageTab.id);

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
    createElement("button", { className: "stage-editor__icon stage-editor__icon--danger", type: "button", dataAction: "delete-stage", dataStageId: stageTab.id, disabled: Boolean(deleteWarning), title: deleteWarning || `Delete ${stageTab.label}`, ariaLabel: `Delete ${stageTab.label}` }, [createIcon("delete")]),
    deleteWarning ? createElement("p", { className: "stage-editor__warning" }, deleteWarning) : null,
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
  const avatarContent = getStorageAssetUrl(currentUser)
    ? createElement("img", { src: getStorageAssetUrl(currentUser), alt: `${currentUser.name} avatar` })
    : getTeamUserInitials(currentUser?.name ?? "User");

  return createElement("section", { className: "settings-profile-card" }, [
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
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Display Name"), createElement("input", { className: "form-input", type: "text", value: currentUser?.name ?? "Workspace User", disabled: true })]),
      createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Job Title"), createElement("input", { className: "form-input", type: "text", value: currentUser?.jobTitle ?? "Team Member", disabled: true })]),
    ]),
    renderSharedWorkspaceFieldsCard(),
  ]);
}

function renderSharedWorkspaceFieldsCard() {
  if (!isSupabaseConfigured() && authSession?.provider !== "supabase") return null;

  const isSupabaseSession = authSession?.provider === "supabase";
  const canUpload = isSupabaseSession && canWriteSupabaseWorkspaceState();
  const statusMessage = isSupabaseSession
    ? (authSession?.workspaceName ? `Signed in to ${authSession.workspaceName}. Use this only from the browser where your custom fields/dropdowns are visible.` : "Use this only from the browser where your custom fields/dropdowns are visible.")
    : "You are currently signed in with the old local prototype admin session. Log out, then sign in with the Supabase admin password to upload shared fields.";

  return createElement("div", { className: "settings-placeholder-card settings-profile-card__sync" }, [
    createElement("strong", null, "Shared workspace fields"),
    createElement("p", null, statusMessage),
    createElement("p", null, `Session: ${isSupabaseSession ? "Supabase" : "Local prototype fallback"}`),
    uiState.supabaseSyncNotice ? createElement("p", { className: "settings-user-notice", role: "status" }, uiState.supabaseSyncNotice) : null,
    canUpload ? createElement("button", { className: "button-secondary", type: "button", dataAction: "upload-local-workspace-details" }, "Upload local fields to Supabase") : null,
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


  const selectedTab = getSelectedStageTab();
  const selectedProducts = getProductsForSelectedTab(selectedTab.id);

  replaceChildren(
    productPanel,
    createElement("div", { className: "product-panel" }, [
      createElement("h2", { className: "product-panel__title" }, selectedTab.panelLabel),
      renderPipelineSummaryCards(selectedTab, selectedProducts),
      renderTabExportControls(selectedTab, selectedProducts),
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
        createIcon("filter_list"),
      ]),
      selectedProducts.length > 0
        ? createElement(
          "div",
          { className: "product-list" },
          selectedProducts.map((product) => renderProductCard(product, product.id === uiState.selectedProductId)),
        )
        : renderEmptyProductList(selectedTab),
      renderAddProductButton(selectedTab),
      renderAddProductModal(selectedTab),
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
        createElement("button", { className: "product-card__action", type: "button", dataAction: "edit-product", dataProductId: product.id, ariaLabel: `Edit ${product.name}` }, [createIcon("edit")]),
        createElement("button", { className: "product-card__action product-card__action--danger", type: "button", dataAction: "delete-product", dataProductId: product.id, ariaLabel: `Delete ${product.name}` }, [createIcon("delete")]),
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
  }, [
    createIcon("add"),
    createElement("span", null, `Add Product to ${selectedTab.label}`),
  ]);
}

function createEmptyProductModalDraft(product = null) {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    asin: product?.asin ?? "",
  };
}

function openProductModal(product = null) {
  uiState.addProductModalOpen = true;
  uiState.editingProductId = product?.id ?? null;
  uiState.productModalDraft = createEmptyProductModalDraft(product);
}

function renderAddProductModal(selectedTab) {
  if (!uiState.addProductModalOpen) return null;

  const editingProduct = getEditableProduct(uiState.editingProductId);
  const draft = uiState.productModalDraft ?? createEmptyProductModalDraft(editingProduct);
  const modalTitle = editingProduct ? `Edit ${editingProduct.name}` : `Add Product to ${selectedTab.label}`;

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
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-add-product-modal", ariaLabel: "Close add product form" }, [createIcon("close")]),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Product Image"),
        createElement("input", { className: "form-input", name: "productImage", type: "file", accept: "image/*" }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Product Name"),
        createElement("input", { className: "form-input", name: "productName", type: "text", placeholder: "Example: Stainless Steel Bottle", value: draft.name, dataAction: "update-product-modal-draft", dataProductModalField: "name", required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "SKU"),
        createElement("input", { className: "form-input", name: "productSku", type: "text", placeholder: "N/A if blank", value: draft.sku, dataAction: "update-product-modal-draft", dataProductModalField: "sku" }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "ASIN"),
        createElement("input", { className: "form-input", name: "productAsin", type: "text", placeholder: "N/A if blank", value: draft.asin, dataAction: "update-product-modal-draft", dataProductModalField: "asin" }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-add-product-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, editingProduct ? "Save Product" : "Create Product"),
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
  const deletedProductIds = new Set(productSettings.deletedProductIds);
  const editedDummyProducts = DUMMY_PRODUCTS
    .filter((product) => !deletedProductIds.has(product.id))
    .map((product) => ({ ...product, ...(productSettings.edits[product.id] ?? {}) }));
  return [...editedDummyProducts, ...userProducts];
}

function getSelectedStageTab() {
  return SIDEBAR_STAGE_TABS.find((stageTab) => stageTab.id === uiState.selectedStageId) ?? SIDEBAR_STAGE_TABS[0];
}

function renderWorkspace(workspace) {
  if (uiState.activeView === "settings") {
    renderSettingsWorkspace(workspace);
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
      renderPaymentStatusModal(),
      renderImageGalleryPreviewModal(),
      renderChecklistNoteModal(),
      renderProductChatModal(),
    ].filter(Boolean)),
  );
}

function renderWorkspaceNextStageAction(product) {
  if (!canMoveProducts() || !getNextProductStageId(product)) return null;

  return createElement("div", { className: "workspace-next-stage-action" }, [
    createElement("button", {
      className: "button-primary workspace-next-stage-action__button",
      type: "button",
      dataAction: "move-product-next-stage",
      dataProductId: product.id,
      ariaLabel: `Move ${product.name} to the next stage`,
    }, "Move to the Next Stage"),
  ]);
}

function renderWorkspaceProductOverview(product) {
  const productDetails = getWorkspaceProductDetails(product.id);
  const imageUrl = getStorageAssetUrl(productDetails);
  const fileInputId = `product-image-upload-${product.id}`;

  return createElement("section", { className: "workspace-product-card", ariaLabel: `${product.name} overview` }, [
    createElement("button", { className: "workspace-product-card__export-icon", type: "button", dataAction: "export-product-data", dataProductId: product.id, ariaLabel: `Export ${product.name} data` }, [createIcon("ios_share")]),
    createElement("div", { className: "workspace-product-card__media" }, [
      renderProductThumbnail(product, "workspace-product-card__image"),
      canManageProducts()
        ? createElement("div", { className: "workspace-product-card__image-actions" }, [
          createElement("input", {
            className: "workspace-product-card__file",
            id: fileInputId,
            type: "file",
            accept: "image/*",
            dataAction: "upload-product-image",
            dataProductId: product.id,
          }),
          createElement("label", { className: "workspace-product-card__upload", htmlFor: fileInputId }, imageUrl ? "Replace Image" : "Upload Image"),
          imageUrl
            ? createElement("button", { className: "workspace-product-card__delete", type: "button", dataAction: "delete-product-image", dataProductId: product.id }, "Delete")
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
      createElement("button", { className: "button-primary", type: "button", dataAction: "open-product-chat", dataProductId: product.id }, [
        createIcon("chat"),
        createElement("span", null, "Chat"),
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
    renderEditableProductMetricCard(product, "COGS", cogs, "cogs"),
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
      disabled: !canEditWorkspaceData(),
    }),
  ]);
}

function renderProductMetricCard(label, value, outputKey = "") {
  return createElement("article", { className: "workspace-product-card__metric" }, [
    createElement("span", null, label),
    createElement("strong", outputKey ? { dataProductFinancialOutput: outputKey } : null, value),
  ]);
}

function renderProductThumbnail(product, className) {
  const imageUrl = getStorageAssetUrl(getWorkspaceProductDetails(product.id));

  if (imageUrl) {
    return createElement("span", { className: `${className} product-image-preview` }, [
      createElement("img", { src: imageUrl, alt: product.name }),
    ]);
  }

  return createElement("span", { className }, [createIcon("inventory_2")]);
}

function renderWorkspaceEmptyState() {
  return createElement("section", { className: "blank-workspace", ariaLabel: "Selected product details" }, [
    createElement("div", { className: "workspace-empty" }, [
      createElement("h2", null, "Select a product"),
      createElement("p", null, "Choose a product from the pipeline list to customize its visible stage details."),
    ]),
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
    createElement("select", { dataAction: "update-launch-chart-metric", dataLaunchChartIndex: String(index), value: metricKey }, getLaunchChartMetricDefinitions().map((metric) => createElement("option", { value: metric.key, selected: metric.key === metricKey }, metric.label))),
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
  if (!getLaunchChartMetricDefinition(select.value)) return;
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
  const portfolioUrl = getSafeWorkspaceUrl(launchMonitoringSettings.portfolioUrl) ?? DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioUrl;
  const buttonText = launchMonitoringSettings.portfolioButtonText || DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioButtonText;
  return createElement("span", { className: "launch-workspace__portfolio-actions" }, [
    createElement("a", {
      className: "launch-workspace__portfolio-button",
      href: portfolioUrl,
      target: "_blank",
      rel: "noreferrer",
      ariaLabel: `${buttonText} in Amazon Ads`,
    }, [createIcon("open_in_new"), createElement("span", null, buttonText)]),
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
  const summary = getCampaignPrepSummary();
  const sheetUrl = getSafeWorkspaceUrl(campaignPrepSettings.sheetUrl) ?? DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetUrl;
  const sheetButtonText = campaignPrepSettings.sheetButtonText || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText;

  return createElement("section", { className: "campaign-prep-workspace", ariaLabel: `${stage.label} campaign dashboard` }, [
    createElement("div", { className: "campaign-prep-workspace__cards" }, [
      renderCampaignPrepMetricCard("Total Campaigns", summary.total, "calculate", "Across SP, SB and SD", "total"),
      renderCampaignPrepMetricCard("SP Campaigns", summary.sponsoredProducts, "ads_click", "Sponsored Products", "sponsoredProducts"),
      renderCampaignPrepMetricCard("SB Campaigns", summary.sponsoredBrands, "brand_awareness", "Sponsored Brands", "sponsoredBrands"),
      renderCampaignPrepMetricCard("SD Campaigns", summary.sponsoredDisplay, "display_settings", "Sponsored Display", "sponsoredDisplay"),
    ]),
    createElement("article", { className: "campaign-prep-workspace__sheet" }, [
      createElement("span", { className: "campaign-prep-workspace__sheet-icon" }, [createIcon("table_chart")]),
      createElement("h3", null, "Campaign Strategy & Management"),
      createElement("p", null, "Access the global campaign tracking matrix to manage keyword bidding, ad group structures, and budget allocations. This sheet serves as the primary data source for PPC automation and scaling."),
      createElement("span", { className: "campaign-prep-workspace__sheet-actions" }, [
        createElement("a", {
          className: "campaign-prep-workspace__sheet-button",
          href: sheetUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          ariaLabel: `${sheetButtonText} for ${product.name}`,
        }, [createIcon("open_in_new"), createElement("span", null, sheetButtonText)]),
        canEditWorkspaceData() ? createElement("button", {
          className: "campaign-prep-workspace__edit-link",
          type: "button",
          dataAction: "open-campaign-link-modal",
          ariaLabel: "Edit campaign management sheet button",
          title: "Edit button text and link",
        }, [createIcon("edit")]) : null,
      ].filter(Boolean)),
      createElement("div", { className: "campaign-prep-workspace__sync" }, [
        createElement("span", null, [createIcon("sync"), createElement("span", null, "Google Sheets Sync")]),
        createElement("span", null, [createIcon("schedule"), createElement("span", null, "Last synced 4m ago")]),
      ]),
    ]),
    renderCampaignLinkModal(),
  ].filter(Boolean));
}

function renderCampaignPrepMetricCard(label, value, iconName, helperText, metricKey) {
  return createElement("article", { className: "campaign-prep-workspace__metric" }, [
    createElement("span", { className: "campaign-prep-workspace__metric-icon" }, [createIcon(iconName)]),
    createElement("span", { className: "campaign-prep-workspace__metric-copy" }, [
      createElement("span", null, label),
      createElement("strong", { dataAction: "edit-campaign-count", dataCampaignMetric: metricKey, title: "Double-click to edit" }, String(value)),
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
        createElement("input", { className: "form-input", name: "sheetUrl", type: "url", value: campaignPrepSettings.sheetUrl, placeholder: "https://docs.google.com/spreadsheets/...", required: true }),
      ]),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-campaign-link-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Save Link"),
      ]),
    ]),
  ]);
}

function getCampaignPrepSummary() {
  const counts = campaignPrepSettings.counts;
  return {
    total: counts.total,
    sponsoredProducts: counts.sponsoredProducts,
    sponsoredBrands: counts.sponsoredBrands,
    sponsoredDisplay: counts.sponsoredDisplay,
  };
}

function editCampaignCountFromElement(element) {
  const metricKey = element.getAttribute("data-campaign-metric");
  if (!isCampaignCountKey(metricKey) || typeof window === "undefined" || typeof window.prompt !== "function") return;

  const currentValue = campaignPrepSettings.counts[metricKey];
  const nextValue = window.prompt(`Edit ${getCampaignCountLabel(metricKey)}`, String(currentValue));
  if (nextValue === null) return;

  const normalizedValue = normalizeCampaignCount(nextValue, currentValue);
  setCampaignPrepSettings({
    ...campaignPrepSettings,
    counts: {
      ...campaignPrepSettings.counts,
      [metricKey]: normalizedValue,
    },
  });
}

function saveCampaignLinkForm(form) {
  const formData = new FormData(form);
  const buttonText = String(formData.get("buttonText") ?? "").trim() || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText;
  const sheetUrl = String(formData.get("sheetUrl") ?? "").trim() || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetUrl;
  setCampaignPrepSettings({
    ...campaignPrepSettings,
    sheetButtonText: buttonText,
    sheetUrl,
  });
  uiState.campaignLinkModalOpen = false;
  renderFromCurrentState();
}

function saveLaunchPortfolioForm(form) {
  const formData = new FormData(form);
  const buttonText = String(formData.get("buttonText") ?? "").trim() || DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioButtonText;
  const portfolioUrl = String(formData.get("portfolioUrl") ?? "").trim() || DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioUrl;
  setLaunchMonitoringSettings({
    ...launchMonitoringSettings,
    portfolioButtonText: buttonText,
    portfolioUrl,
  });
  uiState.launchPortfolioModalOpen = false;
  renderFromCurrentState();
}

function isCampaignCountKey(metricKey) {
  return ["total", "sponsoredProducts", "sponsoredBrands", "sponsoredDisplay"].includes(metricKey);
}

function getCampaignCountLabel(metricKey) {
  return {
    total: "Total Campaigns",
    sponsoredProducts: "SP Campaigns",
    sponsoredBrands: "SB Campaigns",
    sponsoredDisplay: "SD Campaigns",
  }[metricKey] ?? "Campaign Count";
}

function normalizeCampaignCount(value, fallbackValue = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackValue;
  return Math.max(0, Math.round(numericValue));
}

function renderVineWorkspace(product, stage) {
  const metrics = getVineMetrics();
  return createElement("section", { className: "vine-workspace", ariaLabel: `${stage.label} dashboard` }, [
    createElement("div", { className: "vine-workspace__cards" }, [
      renderVineMetricCard({
        title: "Enrollment Progress",
        icon: "inventory",
        value: [renderEditableVineMetric("shippedUnits", metrics.shippedUnits), createElement("span", null, " / "), renderEditableVineMetric("totalUnits", metrics.totalUnits), createElement("small", null, " Units")],
        helper: "100% units shipped to Amazon",
        progress: getPercent(metrics.shippedUnits, metrics.totalUnits),
      }),
      renderVineMetricCard({
        title: "Reviews Received",
        icon: "star",
        value: [renderEditableVineMetric("reviewsReceived", metrics.reviewsReceived), createElement("span", null, " / "), renderEditableVineMetric("reviewGoal", metrics.reviewGoal), createElement("small", null, " Claimed")],
        helper: `${getPercent(metrics.reviewsReceived, metrics.reviewGoal)}% conversion rate from claims`,
        progress: getPercent(metrics.reviewsReceived, metrics.reviewGoal),
      }),
      renderVineMetricCard({
        title: "Average Vine Rating",
        icon: "reviews",
        value: [renderEditableVineMetric("averageRating", metrics.averageRating), createElement("span", { className: "vine-workspace__stars" }, renderStarRating(metrics.averageRating))],
        helper: "+0.4 higher than category avg",
        progress: Math.min(100, Math.max(0, (Number(metrics.averageRating) / 5) * 100)),
      }),
    ]),
    createElement("div", { className: "vine-workspace__main" }, [
      renderVineReviewsPanel(),
      renderVineFeedbackPanel(),
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

function renderEditableVineMetric(metricKey, value) {
  return createElement("b", { className: "vine-workspace__editable-number", dataAction: "edit-vine-metric", dataVineMetric: metricKey, title: "Double-click to edit" }, String(value));
}

function renderVineReviewsPanel() {
  return createElement("section", { className: "vine-workspace__reviews" }, [
    createElement("div", { className: "vine-workspace__panel-head" }, [
      createElement("h3", null, "Recent Vine Reviews"),
      canEditWorkspaceData() ? createElement("button", { className: "vine-workspace__add", type: "button", dataAction: "open-vine-entry", dataVineEntryType: "review", ariaLabel: "Add Vine review" }, [createIcon("add")]) : null,
    ].filter(Boolean)),
    vineSettings.reviews.length === 0
      ? createElement("p", { className: "vine-workspace__empty" }, "No Vine reviews added yet. Use + to paste one manually.")
      : createElement("div", { className: "vine-workspace__review-list" }, vineSettings.reviews.map(renderVineReviewCard)),
  ]);
}

function renderVineReviewCard(review) {
  return createElement("article", { className: "vine-workspace__review" }, [
    createElement("div", { className: "vine-workspace__review-meta" }, [
      createElement("span", { className: "vine-workspace__stars" }, renderStarRating(review.rating)),
      createElement("strong", null, review.reviewer),
      createElement("span", { className: "vine-workspace__voice" }, "Vine Voice"),
      createElement("time", null, review.date),
      renderVineEntryActions("review", review.id),
    ].filter(Boolean)),
    createElement("h4", null, review.title),
    createElement("p", null, review.body),
  ]);
}

function renderVineFeedbackPanel() {
  return createElement("aside", { className: "vine-workspace__feedback" }, [
    createElement("div", { className: "vine-workspace__feedback-head" }, [
      createElement("span", { className: "vine-workspace__feedback-icon" }, [createIcon("warning")]),
      createElement("h3", null, "Actionable Feedback"),
      canEditWorkspaceData() ? createElement("button", { className: "vine-workspace__add vine-workspace__add--feedback", type: "button", dataAction: "open-vine-entry", dataVineEntryType: "feedback", ariaLabel: "Add actionable feedback" }, [createIcon("add")]) : null,
    ].filter(Boolean)),
    createElement("p", null, "Track negative mentions from Vine reviews and log resolutions for product iteration."),
    vineSettings.feedback.length === 0
      ? createElement("p", { className: "vine-workspace__empty" }, "No feedback logged yet. Use + to paste feedback manually.")
      : createElement("div", { className: "vine-workspace__feedback-list" }, vineSettings.feedback.map(renderVineFeedbackCard)),
  ]);
}

function renderVineFeedbackCard(feedback) {
  return createElement("article", { className: "vine-workspace__feedback-item" }, [
    createElement("span", { className: "vine-workspace__issue" }, `Issue: ${feedback.issue}`),
    createElement("span", { className: `vine-workspace__status ${feedback.status.toLowerCase() === "resolved" ? "vine-workspace__status--resolved" : ""}`.trim() }, feedback.status),
    createElement("p", null, feedback.body),
    createElement("small", null, `Logged: ${feedback.loggedAt}`),
    renderVineEntryActions("feedback", feedback.id),
  ].filter(Boolean));
}

function renderVineEntryActions(entryType, entryId) {
  if (!canEditWorkspaceData()) return null;
  return createElement("span", { className: "vine-workspace__entry-actions" }, [
    createElement("button", { type: "button", dataAction: "edit-vine-entry", dataVineEntryType: entryType, dataVineEntryId: entryId, ariaLabel: `Edit Vine ${entryType}` }, [createIcon("edit")]),
    createElement("button", { type: "button", dataAction: "delete-vine-entry", dataVineEntryType: entryType, dataVineEntryId: entryId, ariaLabel: `Delete Vine ${entryType}` }, [createIcon("delete")]),
  ]);
}

function renderVineEntryModal() {
  if (!uiState.vineEntryModal) return null;
  const isFeedback = uiState.vineEntryModal.type === "feedback";
  const existingEntry = getVineEntry(uiState.vineEntryModal.type, uiState.vineEntryModal.entryId);
  return createElement("div", { className: "workspace-modal", role: "presentation" }, [
    createElement("form", { className: "workspace-modal__dialog", dataAction: "save-vine-entry", dataVineEntryType: uiState.vineEntryModal.type, dataVineEntryId: existingEntry?.id ?? "", role: "dialog", ariaModal: "true", ariaLabel: isFeedback ? "Add actionable feedback" : "Add Vine review" }, [
      createElement("div", { className: "workspace-modal__header" }, [
        createElement("h3", null, isFeedback ? "Add Actionable Feedback" : "Add Vine Review"),
        createElement("button", { className: "workspace-modal__close", type: "button", dataAction: "close-vine-entry", ariaLabel: "Close Vine entry dialog" }, [createIcon("close")]),
      ]),
      isFeedback ? renderVineFeedbackFormFields(existingEntry) : renderVineReviewFormFields(existingEntry),
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-vine-entry" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, "Save Entry"),
      ]),
    ]),
  ]);
}

function renderVineReviewFormFields(review = null) {
  return [
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Reviewer"), createElement("input", { className: "form-input", name: "reviewer", type: "text", placeholder: "Example: John D.", value: review?.reviewer ?? "", required: true })]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Rating"), createElement("input", { className: "form-input", name: "rating", type: "number", step: "0.1", placeholder: "5", value: review?.rating ?? "", required: true })]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Review Title"), createElement("input", { className: "form-input", name: "title", type: "text", placeholder: "Paste review headline...", value: review?.title ?? "", required: true })]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Review Text"), createElement("textarea", { className: "form-input", name: "body", rows: 5, placeholder: "Paste the Vine review here...", value: review?.body ?? "", required: true })]),
  ];
}

function renderVineFeedbackFormFields(feedback = null) {
  return [
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Issue"), createElement("input", { className: "form-input", name: "issue", type: "text", placeholder: "Example: Comfort", value: feedback?.issue ?? "", required: true })]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Status"), createElement("select", { className: "form-input", name: "status" }, ["Pending", "Resolved"].map((status) => createElement("option", { value: status, selected: (feedback?.status ?? "Pending") === status }, status)))]),
    createElement("label", { className: "form-field" }, [createElement("span", { className: "text-label-sm" }, "Feedback"), createElement("textarea", { className: "form-input", name: "body", rows: 5, placeholder: "Paste actionable feedback here...", value: feedback?.body ?? "", required: true })]),
  ];
}

function renderStarRating(rating) {
  const roundedRating = Math.round(Number(rating) || 0);
  return Array.from({ length: 5 }, (_, index) => index < roundedRating ? "★" : "☆").join("");
}

function getVineMetrics() {
  return vineSettings.metrics;
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
  const currentValue = vineSettings.metrics[metricKey];
  const nextValue = window.prompt(`Edit ${getVineMetricLabel(metricKey)}`, String(currentValue));
  if (nextValue === null) return;

  const normalizedValue = metricKey === "averageRating" ? normalizeVineRating(nextValue, currentValue) : normalizeCampaignCount(nextValue, currentValue);
  setVineSettings({
    ...vineSettings,
    metrics: {
      ...vineSettings.metrics,
      [metricKey]: normalizedValue,
    },
  });
}

function saveVineEntryForm(form) {
  const entryType = form.getAttribute("data-vine-entry-type");
  const entryId = form.getAttribute("data-vine-entry-id");
  const formData = new FormData(form);
  if (entryType === "review") {
    const review = normalizeVineReview({
      reviewer: formData.get("reviewer"),
      rating: formData.get("rating"),
      title: formData.get("title"),
      body: formData.get("body"),
      date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    });
    if (!review) return;
    const nextReview = entryId ? { ...review, id: entryId, date: getVineEntry("review", entryId)?.date ?? review.date } : review;
    setVineSettings({ ...vineSettings, reviews: entryId ? vineSettings.reviews.map((item) => item.id === entryId ? nextReview : item) : [nextReview, ...vineSettings.reviews] });
  }

  if (entryType === "feedback") {
    const feedback = normalizeVineFeedback({
      issue: formData.get("issue"),
      status: formData.get("status"),
      body: formData.get("body"),
      loggedAt: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
    if (!feedback) return;
    const nextFeedback = entryId ? { ...feedback, id: entryId, loggedAt: getVineEntry("feedback", entryId)?.loggedAt ?? feedback.loggedAt } : feedback;
    setVineSettings({ ...vineSettings, feedback: entryId ? vineSettings.feedback.map((item) => item.id === entryId ? nextFeedback : item) : [nextFeedback, ...vineSettings.feedback] });
  }

  uiState.vineEntryModal = null;
  renderFromCurrentState();
}

function getVineEntry(entryType, entryId) {
  if (!entryId) return null;
  if (entryType === "review") return vineSettings.reviews.find((review) => review.id === entryId) ?? null;
  if (entryType === "feedback") return vineSettings.feedback.find((feedback) => feedback.id === entryId) ?? null;
  return null;
}

function deleteVineEntry(entryType, entryId) {
  if (!entryId) return;
  if (entryType === "review") setVineSettings({ ...vineSettings, reviews: vineSettings.reviews.filter((review) => review.id !== entryId) });
  if (entryType === "feedback") setVineSettings({ ...vineSettings, feedback: vineSettings.feedback.filter((feedback) => feedback.id !== entryId) });
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
  if (stage.stage_id === "campaign-prep") return renderCampaignPreparationWorkspace(product, stage);
  if (stage.stage_id === "enrolled-to-vines") return renderVineWorkspace(product, stage);
  if (stage.stage_id === "launch") return renderLaunchWorkspace(product, stage);
  return renderWorkspaceCustomFields(product, stage, stageDetails);
}

function isSpecialWorkspaceStage(stageId) {
  return ["campaign-prep", "enrolled-to-vines", "launch"].includes(stageId);
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
        canEditWorkspaceData() ? createElement("button", { className: "launch-workspace__add", type: "button", dataAction: "open-launch-entry", ariaLabel: `Add ${periodLabel.toLowerCase()} launch metrics` }, [createIcon("add"), createElement("span", null, `Add ${periodLabel}`)]) : null,
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
    ]),
    uiState.chatAssetsOpen ? renderProductChatAssetsPanel(assets) : null,
  ]);
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
  const messageClass = `product-chat-message product-chat-message--${message.sender === "user" ? "user" : "partner"}`;

  return createElement("article", { className: messageClass }, [
    message.sender === "partner" ? createElement("span", { className: "product-chat-message__avatar" }, "S") : null,
    createElement("div", { className: "product-chat-message__content" }, [
      message.text ? createElement("div", { className: "product-chat-message__bubble" }, renderChatText(message.text)) : null,
      hasAttachments ? createElement("div", { className: "product-chat-message__attachments" }, message.attachments.map(renderChatAttachment)) : null,
      createElement("time", { className: "product-chat-message__time", dateTime: message.createdAt }, formatChatTime(message.createdAt)),
    ].filter(Boolean)),
  ].filter(Boolean));
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
    ]),
    uiState.chatAssetsOpen ? renderProductChatAssetsPanel(assets) : null,
  ]);
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
  const messageClass = `product-chat-message product-chat-message--${message.sender === "user" ? "user" : "partner"}`;

  return createElement("article", { className: messageClass }, [
    message.sender === "partner" ? createElement("span", { className: "product-chat-message__avatar" }, "S") : null,
    createElement("div", { className: "product-chat-message__content" }, [
      message.text ? createElement("div", { className: "product-chat-message__bubble" }, renderChatText(message.text)) : null,
      hasAttachments ? createElement("div", { className: "product-chat-message__attachments" }, message.attachments.map(renderChatAttachment)) : null,
      createElement("time", { className: "product-chat-message__time", dateTime: message.createdAt }, formatChatTime(message.createdAt)),
    ].filter(Boolean)),
  ].filter(Boolean));
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

  return createElement("form", { className: "product-chat-composer", dataAction: "send-product-chat", dataProductId: product.id }, [
    createElement("div", { className: "product-chat-composer__toolbar" }, [
      renderChatFormatButton("format_bold", "bold", "Bold"),
      renderChatFormatButton("format_italic", "italic", "Italic"),
      renderChatFormatButton("format_list_bulleted", "list", "Bulleted list"),
      createElement("input", { className: "product-chat-composer__file-input", id: fileInputId, type: "file", multiple: true, dataAction: "add-chat-files", dataProductId: product.id }),
      createElement("label", { className: "product-chat-composer__tool", htmlFor: fileInputId, ariaLabel: "Attach files" }, [createIcon("attach_file")]),
    ]),
    createElement("textarea", { className: "product-chat-composer__input", name: "chatMessage", rows: 1, placeholder: "Type your message here...", dataAction: "chat-message-input", dataProductId: product.id }),
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
  return createElement("button", { className: "product-chat-composer__tool", type: "button", dataAction: "format-chat-text", dataChatFormat: format, ariaLabel: label }, [createIcon(icon)]);
}

function renderWorkspaceCustomFields(product, stage, stageDetails) {
  const fields = stageDetails.customFields;

  return createElement("section", { className: "workspace-fields", ariaLabel: `${stage.label} custom fields` }, [
    createElement("div", { className: "workspace-fields__header" }, [
      createElement("h3", null, "Custom Details"),
      createElement("span", null, `${fields.length} field${fields.length === 1 ? "" : "s"}`),
    ]),
    fields.length === 0
      ? createElement("p", { className: "workspace-fields__empty" }, "No preset fields here. Add only the details you want to track for this product and stage.")
      : createElement("div", { className: "workspace-fields__ordered" },
        fields.map((field) => renderSafeWorkspaceCustomField(product, stage, field)),
      ),
  ]);
}

function renderSafeWorkspaceCustomField(product, stage, field) {
  try {
    return renderWorkspaceCustomField(product, stage, field);
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
  if (!canEditWorkspaceData()) return null;
  return createElement("button", {
    className: "button-primary workspace-add-field-button",
    type: "button",
    dataAction: "open-field-modal",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
  }, [createIcon("add")]);
}

function renderWorkspaceCustomField(product, stage, field) {
  const fieldModifiers = {
    LONG_BAR: "workspace-field--full-bar",
    HALF_LONG_TEXT: "workspace-field--half-long",
    LONG_TEXT: "workspace-field--wide",
    LISTING_CONTENT: "workspace-field--listing-content",
    CUSTOM_TABLE: "workspace-field--full-table",
    FILE_UPLOAD: "workspace-field--file-upload",
    IMAGE_GALLERY: "workspace-field--image-gallery",
    PAYMENT_STATUS: "workspace-field--payment-status",
    CHECKLIST_NOTES: "workspace-field--checklist-notes",
    SHIPMENT_TRACKER: "workspace-field--shipment-tracker",
  };
  const fieldClass = `workspace-field ${fieldModifiers[field.type] ?? ""}`.trim();

  return createElement("article", {
    className: fieldClass,
    dataFieldDropId: field.fieldId,
    dataProductId: product.id,
    dataStageId: stage.stage_id,
  }, [
    createElement("div", { className: "workspace-field__header" }, [
      createElement("span", { className: "workspace-field__label" }, field.label),
      canEditWorkspaceData() ? createElement("span", { className: "workspace-field__actions" }, [
        createElement("button", {
          className: "workspace-field__action workspace-field__drag",
          type: "button",
          draggable: true,
          dataAction: "drag-workspace-field",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Drag ${field.label} to reorder`,
          title: "Drag to reorder custom fields",
        }, [createIcon("drag_indicator")]),
        createElement("button", {
          className: "workspace-field__action",
          type: "button",
          dataAction: "edit-workspace-field",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Edit ${field.label}`,
        }, [createIcon("edit")]),
        createElement("button", {
          className: "workspace-field__action workspace-field__action--danger",
          type: "button",
          dataAction: "delete-workspace-field",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          ariaLabel: `Delete ${field.label}`,
        }, [createIcon("delete")]),
      ]) : null,
    ].filter(Boolean)),
    renderWorkspaceFieldControl(product, stage, field),
  ]);
}

function renderWorkspaceFieldControl(product, stage, field) {
  const baseOptions = {
    dataAction: "update-workspace-field",
    dataProductId: product.id,
    dataStageId: stage.stage_id,
    dataFieldId: field.fieldId,
    disabled: !canEditWorkspaceData(),
  };

  if (["LONG_TEXT", "HALF_LONG_TEXT"].includes(field.type)) {
    return createElement("textarea", {
      className: `form-input workspace-field__textarea ${field.type === "HALF_LONG_TEXT" ? "workspace-field__textarea--half" : ""}`.trim(),
      ...baseOptions,
      rows: field.type === "HALF_LONG_TEXT" ? 3 : 4,
      placeholder: field.type === "HALF_LONG_TEXT" ? "Add half-width notes..." : "Write longer notes...",
      value: field.value ?? "",
    });
  }

  if (field.type === "LONG_BAR") {
    const tokens = getLongBarTokens(field.value);
    return createElement("div", { className: "workspace-field__tagbar" }, [
      tokens.map((token, tokenIndex) => createElement("span", { className: "workspace-field__tag" }, [
        createElement("span", null, token),
        canEditWorkspaceData() ? createElement("button", {
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
        placeholder: tokens.length > 0 ? "Add another and press Enter..." : "Type a word and press Enter...",
        dataAction: "add-long-bar-token",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled: !canEditWorkspaceData(),
      }),
    ]);
  }

  if (field.type === "NUMBER") {
    return createElement("input", { className: "form-input", type: "number", step: "any", value: field.value ?? "", ...baseOptions });
  }

function renderChatAttachment(attachment) {
  if (attachment.type?.startsWith("image/")) {
    return createElement("figure", { className: "product-chat-attachment product-chat-attachment--media" }, [
      createElement("button", { className: "product-chat-attachment__preview", type: "button", dataAction: "open-chat-attachment-preview", dataAttachmentId: attachment.attachmentId, ariaLabel: `Enlarge ${attachment.name}` }, [
        createElement("img", { src: getStorageAssetUrl(attachment), alt: attachment.name }),
      ]),
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

  if (field.type === "LISTING_CONTENT") {
    return renderWorkspaceListingContentField(product, stage, field, baseOptions.disabled);
  }

  if (field.type === "SHIPMENT_TRACKER") {
    return renderWorkspaceShipmentTrackerField(product, stage, field, baseOptions.disabled);
  }

function renderProductChatAssetItem(asset) {
  return asset.kind === "link"
    ? createElement("a", { className: "product-chat-assets__item", href: asset.url, target: "_blank", rel: "noopener noreferrer" }, [createIcon("link"), createElement("span", null, asset.url)])
    : createElement("a", { className: "product-chat-assets__item", href: getStorageAssetUrl(asset), download: asset.name }, [createIcon(asset.type.startsWith("image/") ? "image" : asset.type.startsWith("video/") ? "movie" : "description"), createElement("span", null, asset.name)]);
}

  if (field.type === "CUSTOM_TABLE") return renderWorkspaceTableField(product, stage, field, baseOptions.disabled);

  return createElement("div", { className: "product-chat-preview", role: "presentation" }, [
    createElement("div", { className: "product-chat-preview__dialog", role: "dialog", ariaModal: "true", ariaLabel: attachment.name }, [
      createElement("button", { className: "product-chat-preview__close", type: "button", dataAction: "close-chat-attachment-preview", ariaLabel: "Close preview" }, [createIcon("close")]),
      attachment.type.startsWith("video/")
        ? createElement("video", { src: getStorageAssetUrl(attachment), controls: true, preload: "metadata" })
        : createElement("img", { src: getStorageAssetUrl(attachment), alt: attachment.name }),
    ]),
  ]);
}

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "IMAGE_GALLERY") return renderWorkspaceImageGalleryField(product, stage, field, baseOptions.disabled);

  if (field.type === "PAYMENT_STATUS") return renderWorkspacePaymentStatusField(product, stage, field, baseOptions.disabled);

  if (field.type === "CHECKLIST_NOTES") return renderWorkspaceChecklistNotesField(product, stage, field, baseOptions.disabled);

  return createElement("input", { className: "form-input", type: "text", placeholder: "Add a short value...", value: field.value ?? "", ...baseOptions });
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

function renderWorkspaceListingContentField(product, stage, field, disabled) {
  const value = normalizeListingContentValue(field.value);
  const titleCount = getCharacterCount(value.title);
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
            renderListingCharacterCounter(titleCount, 200, "title"),
          ]),
          createElement("textarea", { className: "listing-content-builder__title-input", rows: 2, placeholder: "Enter your product title...", value: value.title, dataAction: "update-listing-content", dataListingPart: "title", maxlength: 200, ...baseOptions }),
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
  const columns = getCustomTableColumns(field);
  const rows = getCustomTableRows(field);
  const effectiveColumns = columns.length > 0 ? columns : ["Details"];
  const effectiveRows = rows.length > 0 ? rows : [""];
  const tableValue = resizeCustomTableValue(field.value, effectiveRows.length, effectiveColumns.length);
  const isImagePlanningTable = stage.stage_id === "image-planning";
  const tableClass = `workspace-table-field workspace-table-field--keyword-style ${isImagePlanningTable ? "workspace-table-field--image-planning" : ""}`.trim();

  return createElement("div", { className: tableClass }, [
    createElement("div", { className: "workspace-table-field__toolbar" }, [
      createElement("div", { className: "workspace-table-field__title" }, [
        createElement("strong", null, field.label),
        createElement("span", null, isImagePlanningTable
          ? "Add/remove rows and columns. Edit column headers inline; links become clickable automatically."
          : "Resizable table. Drag headers to reorder or edit column headers inline."),
      ]),
      !disabled ? createElement("div", { className: "workspace-table-field__quick-actions" }, [
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
      ]) : null,
    ].filter(Boolean)),
    createElement("div", { className: "workspace-table-field__scroll" }, [
      createElement("table", null, [
        createElement("thead", null, createElement("tr", null, [
          createElement("th", { className: "workspace-table-field__corner" }, isImagePlanningTable ? "Image No#" : ""),
          effectiveColumns.map((column, columnIndex) => createElement("th", {
            className: "workspace-table-field__heading workspace-table-field__heading--column",
            draggable: canEditWorkspaceData() && columns.length > 0,
            dataAction: columns.length > 0 ? "drag-workspace-table-column" : null,
            dataProductId: product.id,
            dataStageId: stage.stage_id,
            dataFieldId: field.fieldId,
            dataTableAxis: "column",
            dataTableIndex: columnIndex,
            dataTableDropAxis: "column",
            dataTableDropIndex: columnIndex,
            title: canEditWorkspaceData() && columns.length > 0 ? "Drag to reorder." : column,
          }, renderWorkspaceTableColumnHeader({ product, stage, field, column, columnIndex, canRemove: effectiveColumns.length > 1, disabled }))),
        ])),
        createElement("tbody", null, effectiveRows.map((rowLabel, rowIndex) => createElement("tr", null, [
          createElement("th", {
            className: "workspace-table-field__heading workspace-table-field__heading--row",
            draggable: canEditWorkspaceData() && rows.length > 0,
            dataAction: rows.length > 0 ? "drag-workspace-table-row" : null,
            dataProductId: product.id,
            dataStageId: stage.stage_id,
            dataFieldId: field.fieldId,
            dataTableAxis: "row",
            dataTableIndex: rowIndex,
            dataTableDropAxis: "row",
            dataTableDropIndex: rowIndex,
            title: canEditWorkspaceData() && rows.length > 0 ? "Drag to reorder." : rowLabel,
          }, renderWorkspaceTableRowHeader({ product, stage, field, rowLabel, rowIndex, canRemove: effectiveRows.length > 1, disabled, useNumbering: isImagePlanningTable })),
          effectiveColumns.map((columnLabel, columnIndex) => createElement("td", null, renderWorkspaceTableCellInput({
            product,
            stage,
            field,
            rowLabel: getWorkspaceTableRowDisplayLabel(rowLabel, rowIndex, isImagePlanningTable),
            columnLabel,
            rowIndex,
            columnIndex,
            value: tableValue?.[rowIndex]?.[columnIndex] ?? "",
            disabled,
          }))),
        ]))),
      ]),
    ]),
  ]);
}

function renderWorkspaceTableColumnHeader({ product, stage, field, column, columnIndex, canRemove, disabled }) {
  return createElement("span", { className: "workspace-table-field__header-control" }, [
    createElement("input", {
      className: "workspace-table-field__heading-input",
      type: "text",
      value: column,
      dataAction: "update-workspace-table-heading",
      dataProductId: product.id,
      dataStageId: stage.stage_id,
      dataFieldId: field.fieldId,
      dataTableAxis: "column",
      dataTableIndex: columnIndex,
      ariaLabel: `Column ${columnIndex + 1} header for ${field.label}`,
      disabled,
    }),
    !disabled && canRemove ? createElement("button", {
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

function renderWorkspaceTableRowHeader({ product, stage, field, rowLabel, rowIndex, canRemove, disabled, useNumbering }) {
  const displayLabel = getWorkspaceTableRowDisplayLabel(rowLabel, rowIndex, useNumbering);
  return createElement("span", { className: "workspace-table-field__row-control" }, [
    createElement("span", { className: "workspace-table-field__row-number" }, displayLabel),
    !disabled && canRemove ? createElement("button", {
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
  return rowLabel || "Details";
}

function renderWorkspaceTableCellInput({ product, stage, field, rowLabel, columnLabel, rowIndex, columnIndex, value, disabled }) {
  const cellValue = String(value ?? "");
  const isLink = isWorkspaceTableCellLink(cellValue);

  return createElement("div", { className: `workspace-table-field__cell-control ${isLink ? "workspace-table-field__cell-control--link" : ""}`.trim() }, [
    createElement("textarea", {
      className: "workspace-table-field__input",
      rows: 2,
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
    isLink ? createElement("a", {
      className: "workspace-table-field__link",
      href: normalizeChatUrl(cellValue),
      target: "_blank",
      rel: "noopener noreferrer",
      ariaLabel: `Open ${cellValue}`,
      title: `Open ${cellValue}`,
    }, [createIcon("open_in_new"), createElement("span", null, "Open link")]) : null,
  ].filter(Boolean));
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
      : createElement("p", { className: "workspace-file-field__empty" }, "No invoice or supporting files uploaded yet."),
    createElement("div", { className: "workspace-file-field__footer" }, [
      createElement("input", {
        className: "workspace-file-field__input",
        id: inputId,
        type: "file",
        multiple: true,
        accept: ".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dataAction: "upload-workspace-file-field",
        dataProductId: product.id,
        dataStageId: stage.stage_id,
        dataFieldId: field.fieldId,
        disabled,
      }),
      createElement("label", { className: `workspace-file-field__upload ${disabled ? "workspace-file-field__upload--disabled" : ""}`.trim(), htmlFor: inputId }, [
        createIcon("upload_file"),
        createElement("span", null, files.length > 0 ? "Add more files" : "Upload invoice files"),
      ]),
      createElement("small", null, "PDF, CSV, Excel, image, and other invoice files are supported."),
    ]),
  ]);
}

function renderWorkspaceFileUploadItem(product, stage, field, file, disabled) {
  const isImage = file.type?.startsWith("image/");
  return createElement("article", { className: "workspace-file-field__item" }, [
    createElement("div", { className: "workspace-file-field__icon" }, isImage && getStorageAssetUrl(file)
      ? createElement("img", { src: getStorageAssetUrl(file), alt: file.name })
      : createIcon(getWorkspaceFileIcon(file))),
    createElement("div", { className: "workspace-file-field__meta" }, [
      createElement("strong", null, file.name),
      createElement("small", null, `${formatFileSize(file.size)} · ${file.type || "File"}`),
    ]),
    createElement("a", { className: "workspace-file-field__action", href: getStorageAssetUrl(file), download: file.name, ariaLabel: `Download ${file.name}` }, [createIcon("download")]),
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
  const type = String(file?.type ?? "");
  const name = String(file?.name ?? "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "picture_as_pdf";
  if (type.includes("spreadsheet") || type.includes("excel") || /\.(csv|xls|xlsx)$/.test(name)) return "table_chart";
  if (type.startsWith("image/")) return "image";
  return "description";
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
          accept: ".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dataAction: "upload-payment-field-file",
          dataProductId: product.id,
          dataStageId: stage.stage_id,
          dataFieldId: field.fieldId,
          disabled,
        }),
      ]),
      value.files.length > 0
        ? createElement("div", { className: "workspace-payment-field__file-list" }, value.files.map((file) => renderWorkspacePaymentFileItem(product, stage, field, file, disabled)))
        : createElement("p", { className: "workspace-file-field__empty" }, "Upload invoice, receipt, or payment proof files."),
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
  return createElement("article", { className: "workspace-payment-field__file" }, [
    createElement("div", { className: "workspace-file-field__icon" }, file.type?.startsWith("image/") && getStorageAssetUrl(file) ? createElement("img", { src: getStorageAssetUrl(file), alt: file.name }) : createIcon(getWorkspaceFileIcon(file))),
    createElement("div", { className: "workspace-file-field__meta" }, [
      createElement("strong", null, file.name),
      createElement("small", null, `${file.type || "File"} · ${formatFileSize(file.size)}`),
    ]),
    createElement("a", { className: "workspace-file-field__action", href: getStorageAssetUrl(file), download: file.name, ariaLabel: `Download ${file.name}` }, [createIcon("download")]),
    !disabled ? createElement("button", {
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
            dataAction: "upload-payment-field-file",
            dataProductId: productId,
            dataStageId: stageId,
            dataFieldId: fieldId,
          }),
        ]),
        createElement("label", { className: "form-field" }, [
          createElement("span", { className: "text-label-sm" }, "Invoice Number"),
          createElement("input", { className: "form-input", name: "invoiceNumber", type: "text", value: value.invoiceNumber, placeholder: "Add invoice number...", dataAction: "update-payment-modal-field", dataFieldPart: "invoiceNumber" }),
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
        createElement("button", { className: "button-primary", type: "submit" }, uiState.paymentModal.editingPaymentId ? "Save Transaction" : "Record Payment"),
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
  const dropdownOptions = getFieldModalDropdownOptions(field);
  const dropdownDraft = uiState.fieldModal.dropdownOptionDraft ?? "";
  const tableColumns = getFieldModalTableColumns(field);
  const tableRows = getFieldModalTableRows(field);
  const checklistItems = getFieldModalChecklistItems(field);
  const linkValue = getFieldModalLinkValue(field);
  const galleryFormat = getFieldModalImageGalleryFormat(field);

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
        createElement("input", { className: "form-input", name: "fieldLabel", type: "text", placeholder: "Example: Materials", value: draftLabel, dataAction: "update-field-modal-label", required: true }),
      ]),
      createElement("label", { className: "form-field" }, [
        createElement("span", { className: "text-label-sm" }, "Field Type"),
        createElement("select", { className: "form-input", name: "fieldType", dataAction: "update-field-modal-type", required: true },
          WORKSPACE_CUSTOM_FIELD_TYPES.map((fieldType) => createElement("option", { value: fieldType.value, selected: selectedType === fieldType.value }, fieldType.label)),
        ),
      ]),
      selectedType === "LINK" ? renderFieldModalLinkEditor(linkValue) : null,
      selectedType === "CUSTOM_DROPDOWN" ? renderFieldModalDropdownChoices(dropdownOptions, dropdownDraft) : null,
      selectedType === "CUSTOM_TABLE" ? renderFieldModalListEditor("Columns", "Add the table column headers.", tableColumns, uiState.fieldModal.tableColumnDraft ?? "", "update-field-modal-table-column-draft", "add-field-modal-table-column", "remove-field-modal-table-column") : null,
      selectedType === "CUSTOM_TABLE" ? renderFieldModalListEditor("Rows", "Add the table row labels.", tableRows, uiState.fieldModal.tableRowDraft ?? "", "update-field-modal-table-row-draft", "add-field-modal-table-row", "remove-field-modal-table-row") : null,
      selectedType === "CHECKLIST_NOTES" ? renderFieldModalListEditor("Checklist Items", "Add checklist labels for the left side of the field.", checklistItems, uiState.fieldModal.checklistItemDraft ?? "", "update-field-modal-checklist-item-draft", "add-field-modal-checklist-item", "remove-field-modal-checklist-item") : null,
      selectedType === "IMAGE_GALLERY" ? renderFieldModalImageGalleryFormats(galleryFormat) : null,
      createElement("div", { className: "workspace-modal__actions" }, [
        createElement("button", { className: "button-secondary", type: "button", dataAction: "close-field-modal" }, "Cancel"),
        createElement("button", { className: "button-primary", type: "submit" }, submitLabel),
      ]),
    ]),
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
      createElement("input", { className: "form-input", name: "fieldLabel", type: "text", placeholder: "Example: Supplier Quote", required: true }),
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
  const workspaceFieldTarget = event.target instanceof Element ? event.target.closest('[data-action="drag-workspace-field"]') : null;
  if (workspaceFieldTarget && event.dataTransfer) {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    const productId = tableTarget.getAttribute("data-product-id");
    const stageId = tableTarget.getAttribute("data-stage-id");
    const fieldId = tableTarget.getAttribute("data-field-id");
    const axis = tableTarget.getAttribute("data-table-axis");
    const index = Number(tableTarget.getAttribute("data-table-index"));
    if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis) || !Number.isInteger(index)) return;

    uiState.draggedTableSection = { productId, stageId, fieldId, axis, index };
    tableTarget.classList.add("workspace-table-field__heading--dragging");
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
  const workspaceFieldTarget = event.target instanceof Element ? event.target.closest("[data-field-drop-id]") : null;
  if (workspaceFieldTarget && uiState.draggedWorkspaceField) {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
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
  const workspaceFieldTarget = event.target instanceof Element ? event.target.closest("[data-field-drop-id]") : null;
  if (workspaceFieldTarget && uiState.draggedWorkspaceField) {
    if (!canEditWorkspaceData()) return;
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
    moveProductToStage(productId, targetStageId);
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
    if (!canEditWorkspaceData()) return;
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
  reorderStage(draggedStageId, dropStageId);
  renderFromCurrentState();
}

function reorderStage(draggedStageId, dropStageId) {
  if (!draggedStageId || !dropStageId || draggedStageId === dropStageId) return;
  const nextSettings = cloneStageSettings(stageSettings);
  const draggedIndex = nextSettings.order.indexOf(draggedStageId);
  const dropIndex = nextSettings.order.indexOf(dropStageId);
  if (draggedIndex < 0 || dropIndex < 0) return;

  nextSettings.order.splice(draggedIndex, 1);
  nextSettings.order.splice(dropIndex, 0, draggedStageId);
  setStageSettings(nextSettings);
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
  uiState.draggedProductId = null;
  uiState.draggedStageId = null;
  uiState.draggedChecklistTask = null;
  uiState.draggedTableSection = null;
  uiState.draggedWorkspaceField = null;
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
  if (!target || !canEditWorkspaceData()) return;

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

function openLegacyDashboard() {
  uiState.activeView = "pipeline";
  uiState.selectedStageId = getSidebarStageTabs()[0]?.id ?? "product-research";
  persistUiPreferences();
  ensureSelectedProductForStage(true);
  renderFromCurrentState();
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

  if (action === "open-activity-source") {
    const stageId = target.getAttribute("data-stage-id");
    const productId = target.getAttribute("data-product-id");
    if (stageId) {
      uiState.activeView = "pipeline";
      uiState.selectedStageId = stageId;
      if (productId && getProductById(productId)) uiState.selectedProductId = productId;
      uiState.dashboardHistoryModalOpen = false;
      persistUiPreferences();
      ensureSelectedProductForStage(true);
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
    requestSupabasePasswordReset();
    return;
  }

  if (action === "open-dashboard" || action === "open-pipeline") {
    openLegacyDashboard();
    return;
  }


  if (action === "open-settings") {
    uiState.activeView = "settings";
    uiState.settingsCategory = canManageUsers() ? "users" : getDefaultSettingsCategory();
    renderFromCurrentState();
    return;
  }

  if (action === "open-profile") {
    uiState.activeView = "settings";
    uiState.settingsCategory = "profile";
    renderFromCurrentState();
    return;
  }

  if (action === "select-settings-category") {
    const category = target.getAttribute("data-settings-category");
    if (canViewSettingsCategory(category)) uiState.settingsCategory = category;
    renderFromCurrentState();
    return;
  }

  if (action === "upload-local-workspace-details") {
    forceUploadLocalWorkspaceDetails();
    return;
  }

  if (action === "toggle-stage-editor") {
    if (!canEditPipelineTabs()) return;
    uiState.stageEditorOpen = !uiState.stageEditorOpen;
    renderFromCurrentState();
    return;
  }

  if (action === "recover-stages") {
    if (!canEditPipelineTabs()) return;
    recoverAllStages();
    renderFromCurrentState();
    return;
  }

  if (action === "recover-stage") {
    if (!canEditPipelineTabs()) return;
    recoverStage(target.getAttribute("data-stage-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "delete-stage") {
    if (!canEditPipelineTabs()) return;
    deleteStage(target.getAttribute("data-stage-id"));
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
    if (!canManageProducts()) return;
    openProductModal();
    renderFromCurrentState();
    return;
  }

  if (action === "edit-product") {
    if (!canManageProducts()) return;
    openProductModal(getEditableProduct(target.getAttribute("data-product-id")));
    renderFromCurrentState();
    return;
  }

  if (action === "delete-product") {
    if (!canManageProducts()) return;
    deleteUserProduct(target.getAttribute("data-product-id"));
    renderFromCurrentState();
    return;
  }

  if (action === "move-product-next-stage") {
    if (!canMoveProducts()) return;
    const movedProduct = moveProductToNextStage(target.getAttribute("data-product-id"));
    if (movedProduct) launchConfettiEffect(target);
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

  if (["open-vine-entry", "edit-vine-entry"].includes(action)) {
    if (!canEditWorkspaceData()) return;
    const entryType = target.getAttribute("data-vine-entry-type");
    if (!["review", "feedback"].includes(entryType)) return;
    uiState.vineEntryModal = { type: entryType, entryId: action === "edit-vine-entry" ? target.getAttribute("data-vine-entry-id") : null };
    renderFromCurrentState();
    return;
  }

  if (action === "delete-vine-entry") {
    if (!canEditWorkspaceData()) return;
    deleteVineEntry(target.getAttribute("data-vine-entry-type"), target.getAttribute("data-vine-entry-id"));
    renderFromCurrentState();
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
    persistUiPreferences();
    ensureSelectedProductForStage(true);
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
    renderFromCurrentState();
    return;
  }

  if (action === "open-field-modal") {
    if (!canEditWorkspaceData()) return;
    openWorkspaceFieldModal(target, "create");
    renderFromCurrentState();
    return;
  }

  if (action === "edit-workspace-field") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    deleteWorkspaceFieldFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-field-modal-option") {
    if (!canEditWorkspaceData()) return;
    addFieldModalDropdownOption();
    renderFromCurrentState();
    return;
  }

  if (action === "remove-field-modal-option") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    fieldModalListActions[action]();
    renderFromCurrentState();
    return;
  }

  if (action === "remove-long-bar-token") {
    if (!canEditWorkspaceData()) return;
    removeLongBarTokenFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (["add-workspace-table-column", "add-workspace-table-row"].includes(action)) {
    if (!canEditWorkspaceData()) return;
    addWorkspaceTableSectionFromButton(target, action === "add-workspace-table-column" ? "column" : "row");
    renderFromCurrentState();
    return;
  }

  if (["remove-workspace-table-column", "remove-workspace-table-row"].includes(action)) {
    if (!canEditWorkspaceData()) return;
    removeWorkspaceTableSectionFromButton(target, action === "remove-workspace-table-column" ? "column" : "row");
    renderFromCurrentState();
    return;
  }

  if (action === "track-shipment") {
    trackShipmentFromButton(target);
    return;
  }

  if (action === "clear-workspace-link") {
    if (!canEditWorkspaceData()) return;
    clearWorkspaceLinkFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "clear-shipment-tracking") {
    if (!canEditWorkspaceData()) return;
    clearShipmentTrackingFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-payment-modal") {
    if (!canEditWorkspaceData()) return;
    openPaymentStatusModal(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-payment-transaction") {
    if (!canEditWorkspaceData()) return;
    if (deletePaymentTransactionFromButton(target)) renderFromCurrentState();
    return;
  }

  if (action === "close-payment-modal") {
    uiState.paymentModal = null;
    renderFromCurrentState();
    return;
  }

  if (action === "remove-workspace-file-field") {
    if (!canEditWorkspaceData()) return;
    removeWorkspaceFileFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    removePaymentFileFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "delete-product-image") {
    if (!canManageProducts()) return;
    deleteProductImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "export-product-data") {
    exportProductDataFromButton(target);
    return;
  }

  if (action === "copy-product-sku") {
    copyProductSkuFromButton(target);
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
    renderFromCurrentState();
    return;
  }

  if (action === "close-chat-attachment-preview") {
    uiState.chatAttachmentPreview = null;
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
  }

  if (action === "remove-pending-chat-file") {
    removePendingChatAttachment(target);
    renderFromCurrentState();
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

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-login-email") {
    uiState.loginDraft.email = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-login-password") {
    uiState.loginDraft.password = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-product-modal-draft") {
    const field = target.getAttribute("data-product-modal-field");
    if (["name", "sku", "asin"].includes(field)) {
      uiState.productModalDraft = {
        ...createEmptyProductModalDraft(getEditableProduct(uiState.editingProductId)),
        ...uiState.productModalDraft,
        [field]: target.value,
      };
    }
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

  if (target.getAttribute("data-action") === "update-product-financial") {
    if (!canEditWorkspaceData()) return;
    updateProductFinancialFromInput(target);
    updateProductFinancialPreview(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-listing-content") {
    if (!canEditWorkspaceData()) return;
    updateListingContentFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-workspace-field") {
    if (!canEditWorkspaceData()) return;
    lastWorkspaceLocalEditAt = Date.now();
    activeWorkspaceEdit = target;
    updateWorkspaceFieldFromInput(target, { debounceSupabaseSync: true });
    return;
  }

  if (target.getAttribute("data-action") === "update-payment-modal-field") {
    if (!canEditWorkspaceData()) return;
    updatePaymentModalDraft(target);
    updatePaymentModalBalancePreview();
    return;
  }

  if (["update-workspace-table-cell", "update-workspace-checklist-note-text"].includes(target.getAttribute("data-action"))) {
    if (!canEditWorkspaceData()) return;
    updateStructuredWorkspaceFieldFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-workspace-table-heading") {
    if (!canEditWorkspaceData()) return;
    renameWorkspaceTableSectionFromInput(target);
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-label") {
    if (uiState.fieldModal) uiState.fieldModal.fieldLabel = target.value;
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

function handleAppFocusIn(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (isEditableWorkspaceField(target)) activeWorkspaceEdit = target;
}

function handleAppFocusOut(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (target && target === activeWorkspaceEdit) activeWorkspaceEdit = null;
}

function handleAppChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const action = target.getAttribute("data-action");
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
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    updateListingContentFromInput(target);
    renderFromCurrentState();
    return;
  }

  if (action === "update-workspace-field") {
    if (!canEditWorkspaceData()) return;
    updateWorkspaceFieldFromInput(target);
    recordWorkspaceInputActivity(target);
    if (target.getAttribute("data-field-part") === "url") renderFromCurrentState();
    return;
  }

  if (action === "upload-workspace-file-field") {
    if (!canEditWorkspaceData()) return;
    uploadWorkspaceFileFieldFromInput(target);
    return;
  }

  if (action === "remove-pending-chat-file") {
    removePendingChatAttachment(target);
    renderFromCurrentState();
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

  if (target.getAttribute("data-action") === "update-product-financial") {
    if (!canEditWorkspaceData()) return;
    updateProductFinancialFromInput(target);
    updateProductFinancialPreview(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-listing-content") {
    if (!canEditWorkspaceData()) return;
    updateListingContentFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-workspace-field") {
    if (!canEditWorkspaceData()) return;
    updateWorkspaceFieldFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-payment-modal-field") {
    if (!canEditWorkspaceData()) return;
    updatePaymentModalDraft(target);
    updatePaymentModalBalancePreview();
    return;
  }

  if (["update-workspace-table-cell", "update-workspace-checklist-note-text"].includes(target.getAttribute("data-action"))) {
    if (!canEditWorkspaceData()) return;
    updateStructuredWorkspaceFieldFromInput(target);
    return;
  }

  if (target.getAttribute("data-action") === "update-workspace-table-heading") {
    if (!canEditWorkspaceData()) return;
    renameWorkspaceTableSectionFromInput(target);
    return;
  }

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-label") {
    if (uiState.fieldModal) uiState.fieldModal.fieldLabel = target.value;
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

function handleAppChange(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const action = target.getAttribute("data-action");
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
    if (!canEditWorkspaceData()) return;
    updateProductFinancialFromInput(target);
    renderFromCurrentState();
    return;
  }

  if (action === "update-field") {
    updateFieldFromInput(target);
    return;
  }

  if (action === "update-listing-content") {
    if (!canEditWorkspaceData()) return;
    updateListingContentFromInput(target);
    renderFromCurrentState();
    return;
  }

  if (action === "update-workspace-field") {
    if (!canEditWorkspaceData()) return;
    updateWorkspaceFieldFromInput(target);
    if (target.getAttribute("data-field-part") === "url") renderFromCurrentState();
    return;
  }

  if (action === "upload-workspace-file-field") {
    if (!canEditWorkspaceData()) return;
    uploadWorkspaceFileFieldFromInput(target);
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    uploadPaymentFileFromInput(target);
    return;
  }

  if (action === "update-payment-modal-field") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    updateStructuredWorkspaceFieldFromInput(target);
    if (action === "update-workspace-table-cell") renderFromCurrentState();
    return;
  }

  if (action === "update-workspace-table-heading") {
    if (!canEditWorkspaceData()) return;
    renameWorkspaceTableSectionFromInput(target);
    renderFromCurrentState();
    return;
  }

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target);
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
    if (!canEditWorkspaceData()) return;
    submitCustomFieldForm(form);
    return;
  }

  if (action === "workspace-save-custom-field") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    savePaymentStatusForm(form);
    return;
  }

  if (action === "save-launch-entry") {
    event.preventDefault();
    if (!canEditWorkspaceData()) return;
    saveLaunchEntryForm(form);
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

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form);
    return;
  }

  if (action === "create-stage") {
    event.preventDefault();
    if (!canEditPipelineTabs()) return;
    submitAddStageForm(form);
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
  const label = String(formData.get("fieldLabel") ?? "").trim();
  const type = String(formData.get("fieldType") ?? "");

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

function submitAddStageForm(form) {
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
  persistUiPreferences();
  uiState.addStageModalOpen = false;
  ensureSelectedProductForStage(true);
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

function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const draft = uiState.productModalDraft ?? createEmptyProductModalDraft(getEditableProduct(form.getAttribute("data-product-id")));
  const productName = String(formData.get("productName") || draft.name || "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku") || draft.sku);
  const asin = normalizeOptionalProductValue(formData.get("productAsin") || draft.asin);
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

  const productId = form.getAttribute("data-product-id");

  if (!stageId || !productName) return;

  if (imageFile && imageFile.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      saveProductFromModal({
        productId,
        stageId,
        name: productName,
        sku,
        asin,
        imageDataUrl: typeof reader.result === "string" ? reader.result : "",
      });
    });
    reader.readAsDataURL(imageFile);
    return;
  }

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageDataUrl: "" });
}

function saveProductFromModal(productInput) {
  if (productInput.productId) {
    updateProduct(productInput);
    return;
  }

  createUserProduct(productInput);
}

function createUserProduct({ stageId, name, sku, asin, imageDataUrl }) {
  const product = {
    id: createUserProductId(),
    name,
    sku,
    asin,
    stageId,
    readinessPercent: 0,
  };

  setUserProducts([...userProducts, product]);
  saveProductImageIfPresent(product.id, imageDataUrl);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageDataUrl }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

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
  saveProductImageIfPresent(product.id, imageDataUrl);
  selectProductAfterSave(product);
}

function saveProductImageIfPresent(productId, imageDataUrl) {
  if (!imageDataUrl) return;
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = imageDataUrl;
  setWorkspaceDetails(nextDetails);
}

function selectProductAfterSave(product) {
  uiState.selectedStageId = product.stageId;
  persistUiPreferences();
  uiState.selectedProductId = product.id;
  uiState.expandedWorkspaceStageIds = getDefaultExpandedWorkspaceStageIds();
  closeProductModal();
  uiState.fieldModal = null;
  uiState.checklistNoteModal = null;
  renderFromCurrentState();
}

function closeProductModal() {
  uiState.addProductModalOpen = false;
  uiState.editingProductId = null;
  uiState.productModalDraft = createEmptyProductModalDraft();
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

  const movedProduct = { ...product, stageId };
  persistProductStageChange(movedProduct);
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

function deleteUserProduct(productId) {
  if (!canManageProducts() || !getEditableProduct(productId)) return;
  if (isUserProduct(productId)) {
    setUserProducts(userProducts.filter((product) => product.id !== productId));
  } else {
    setProductSettings({
      ...productSettings,
      deletedProductIds: [...new Set([...productSettings.deletedProductIds, productId])],
    });
  }

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  delete nextDetails.products?.[productId];
  setWorkspaceDetails(nextDetails);

  if (uiState.selectedProductId === productId) {
    uiState.selectedProductId = null;
    ensureSelectedProductForStage(true);
  }
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

  if (action === "export-stage-tab") {
    exportStageTabFromButton(target);
    return;
  }

  if (action === "copy-product-sku") {
    copyProductSkuFromButton(target);
    return;
  }

  if (action === "select-image-gallery-format") {
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-product-chat") {
    openProductChat(target);
    renderFromCurrentState();
    scrollActiveChatToLatest();
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
  if (!stageId || getStageDeleteWarning(stageId)) return;
  const nextSettings = cloneStageSettings(stageSettings);
  if (!nextSettings.hiddenStageIds.includes(stageId)) {
    nextSettings.hiddenStageIds.push(stageId);
  }
  setStageSettings(nextSettings);
  if (uiState.selectedStageId === stageId) {
    uiState.selectedStageId = getSidebarStageTabs()[0]?.id ?? "product-research";
    persistUiPreferences();
    ensureSelectedProductForStage(true);
  }
}

function recoverStage(stageId) {
  if (!stageId) return;
  const nextSettings = cloneStageSettings(stageSettings);
  nextSettings.hiddenStageIds = nextSettings.hiddenStageIds.filter((hiddenStageId) => hiddenStageId !== stageId);
  setStageSettings(nextSettings);
}

function recoverAllStages() {
  const nextSettings = cloneStageSettings(stageSettings);
  nextSettings.hiddenStageIds = [];
  setStageSettings(nextSettings);
}

function getStageDeleteWarning(stageId) {
  const productCount = getProductsForSelectedTab(stageId).length;
  const fieldCount = countWorkspaceFieldsForStage(stageId);
  if (productCount > 0 || fieldCount > 0) {
    return `Protected: clear ${productCount} product${productCount === 1 ? "" : "s"} and ${fieldCount} field${fieldCount === 1 ? "" : "s"} before deleting.`;
  }
  return "";
}

function countWorkspaceFieldsForStage(stageId) {
  return Object.values(workspaceDetails.products ?? {}).reduce((totalFields, productDetails) => {
    const fields = productDetails?.stages?.[stageId]?.customFields;
    return totalFields + (Array.isArray(fields) ? fields.length : 0);
  }, 0);
}

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
    return;
  }
}

function setStageSettings(nextSettings, options = {}) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
  if (!options.skipSupabaseSync) persistStageSettingsToSupabase();
}

function restoreUiPreferences() {
  if (typeof window === "undefined") return;

  try {
    const preferences = JSON.parse(window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    uiState.selectedStageId = "product-research";
  }
}

function persistUiPreferences() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      selectedStageId: uiState.selectedStageId,
    }));
  } catch (error) {
    console.warn("LaunchFlow could not persist UI preferences locally.", error);
  }
}

function loadDashboardSettings() {
  if (typeof window === "undefined") return normalizeDashboardSettings();
  const rawSettings = window.localStorage.getItem(DASHBOARD_SETTINGS_STORAGE_KEY);
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
      window.localStorage.setItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify(dashboardSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist dashboard settings locally.", error);
    }
  }
}

function normalizeDashboardSettings(settings = {}) {
  const backgroundImages = Array.isArray(settings?.backgroundImages)
    ? settings.backgroundImages.map((item) => normalizeDashboardBackgroundImage(item)).filter(Boolean)
    : DEFAULT_DASHBOARD_SETTINGS.backgroundImages;
  return {
    title: String(settings?.title ?? DEFAULT_DASHBOARD_SETTINGS.title).trim() || DEFAULT_DASHBOARD_SETTINGS.title,
    subtitle: String(settings?.subtitle ?? DEFAULT_DASHBOARD_SETTINGS.subtitle).trim() || DEFAULT_DASHBOARD_SETTINGS.subtitle,
    targetLaunches: normalizeCampaignCount(settings?.targetLaunches, DEFAULT_DASHBOARD_SETTINGS.targetLaunches),
    backgroundImages: backgroundImages.slice(0, 5),
  };
}

function normalizeDashboardBackgroundImage(value) {
  const imageSource = String(value ?? "").trim();
  if (!imageSource) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(imageSource)) return imageSource;
  return getSafeWorkspaceUrl(imageSource);
}

function loadActivityLog() {
  if (typeof window === "undefined") return [];
  const rawActivity = window.localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!rawActivity) return [];

  try {
    return normalizeStageSettings(JSON.parse(rawSettings));
  } catch {
    return createDefaultStageSettings();
  }
}

function setStageSettings(nextSettings, options = {}) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
  if (!options.skipSupabaseSync) persistStageSettingsToSupabase();
}

function restoreUiPreferences() {
  if (typeof window === "undefined") return;

  try {
    const preferences = JSON.parse(window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    uiState.selectedStageId = "product-research";
  }
}

function persistUiPreferences() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      selectedStageId: uiState.selectedStageId,
    }));
  } catch (error) {
    console.warn("LaunchFlow could not persist UI preferences locally.", error);
  }
}

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
    return;
  }

  try {
    return normalizeCampaignPrepSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeCampaignPrepSettings();
  }
}

function setCampaignPrepSettings(nextSettings, options = {}) {
  campaignPrepSettings = normalizeCampaignPrepSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY, JSON.stringify(campaignPrepSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist campaign preparation settings locally.", error);
    }
  }
  if (!options.skipSupabaseSync) persistCampaignPrepSettingsToSupabase();
}

function normalizeCampaignPrepSettings(settings = {}) {
  const counts = settings?.counts && typeof settings.counts === "object" ? settings.counts : {};
  const defaultCounts = DEFAULT_CAMPAIGN_PREP_SETTINGS.counts;
  return {
    counts: {
      total: normalizeCampaignCount(counts.total, defaultCounts.total),
      sponsoredProducts: normalizeCampaignCount(counts.sponsoredProducts, defaultCounts.sponsoredProducts),
      sponsoredBrands: normalizeCampaignCount(counts.sponsoredBrands, defaultCounts.sponsoredBrands),
      sponsoredDisplay: normalizeCampaignCount(counts.sponsoredDisplay, defaultCounts.sponsoredDisplay),
    },
    sheetButtonText: String(settings?.sheetButtonText ?? DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText).trim() || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText,
    sheetUrl: String(settings?.sheetUrl ?? DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetUrl).trim() || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetUrl,
  };
}

function loadLaunchMonitoringSettings() {
  if (typeof window === "undefined") return normalizeLaunchMonitoringSettings();
  const rawSettings = window.localStorage.getItem(LAUNCH_MONITORING_STORAGE_KEY);
  if (!rawSettings) return normalizeLaunchMonitoringSettings();

  try {
    return normalizeLaunchMonitoringSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeLaunchMonitoringSettings();
  }
}

function setLaunchMonitoringSettings(nextSettings, options = {}) {
  launchMonitoringSettings = normalizeLaunchMonitoringSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LAUNCH_MONITORING_STORAGE_KEY, JSON.stringify(launchMonitoringSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist launch monitoring settings locally.", error);
    }
  }
  if (!options.skipSupabaseSync) persistLaunchMonitoringSettingsToSupabase();
}

function normalizeLaunchMonitoringSettings(settings = {}) {
  const activeMode = LAUNCH_METRIC_MODES.includes(settings?.activeMode) ? settings.activeMode : DEFAULT_LAUNCH_MONITORING_SETTINGS.activeMode;
  const entries = settings?.entries && typeof settings.entries === "object" ? settings.entries : {};
  return {
    activeMode,
    launchPlan: normalizeLaunchPlan(settings?.launchPlan),
    portfolioButtonText: String(settings?.portfolioButtonText ?? DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioButtonText).trim() || DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioButtonText,
    portfolioUrl: String(settings?.portfolioUrl ?? DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioUrl).trim() || DEFAULT_LAUNCH_MONITORING_SETTINGS.portfolioUrl,
    chartMetrics: normalizeLaunchChartMetrics(settings?.chartMetrics),
    entries: {
      daily: normalizeLaunchMetricEntries(entries.daily, DEFAULT_LAUNCH_MONITORING_SETTINGS.entries.daily),
      weekly: normalizeLaunchMetricEntries(entries.weekly, DEFAULT_LAUNCH_MONITORING_SETTINGS.entries.weekly),
    },
  };
}

function normalizeLaunchPlan(launchPlan = {}) {
  const defaultLaunchPlan = DEFAULT_LAUNCH_MONITORING_SETTINGS.launchPlan;
  return {
    launchDate: normalizeLaunchDateInput(launchPlan?.launchDate ?? defaultLaunchPlan.launchDate),
    launchPeriod: normalizeCampaignCount(launchPlan?.launchPeriod ?? launchPlan?.daysLeft, defaultLaunchPlan.launchPeriod),
  };
}

function normalizeLaunchMetricEntries(entries, fallbackEntries) {
  const sourceEntries = Array.isArray(entries) ? entries : fallbackEntries;
  return sourceEntries.map(normalizeLaunchMetricEntry).filter(Boolean);
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

async function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

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

  const imageUpload = imageFile && imageFile.type.startsWith("image/")
    ? await uploadFileMetadata(imageFile, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId || "new"}` })
    : null;

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageUpload });
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

  if (action === "export-stage-tab") {
    exportStageTabFromButton(target);
    return;
  }

  if (action === "copy-product-sku") {
    copyProductSkuFromButton(target);
    return;
  }

  if (action === "select-image-gallery-format") {
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    addImageGallerySlotFromButton(target);
    renderFromCurrentState();
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-product-chat") {
    openProductChat(target);
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
  }

  setUserProducts([...userProducts, product]);
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageUpload }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

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
  selectProductAfterSave(product);
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
  const visibleStages = getVisibleStagesForDemoProduct(product);
  const preOptimizationStages = visibleStages.filter((stage) => stage.stage_index <= 12);
  const customProductStage = getCustomWorkspaceStage(product?.stageId);

  if (customProductStage) {
    return [...visibleStages, customProductStage];
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    addImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-image-gallery-preview") {
    openImageGalleryPreviewFromButton(target);
    renderFromCurrentState();
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
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

  return visibleStages;
}

function isPostOptimizationWorkflowSelected() {
  return ["stable", "scaling"].includes(uiState.selectedStageId);
}

function getWorkspaceStageDisplayIndex(stage) {
  if (stage.stage_id === "optimization") return 13;
  if (stage.stage_index >= 13) return stage.stage_index + 1;
  return stage.stage_index;
}

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
    return;
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
  uiState.pendingChatAttachments = [];
  uiState.chatUploadingFiles = false;
  uiState.chatSending = false;
}

function closeProductChat() {
  uiState.activeChatProductId = null;
  uiState.chatAssetsOpen = false;
  uiState.chatEmojiOpen = false;
  uiState.chatSearchOpen = false;
  uiState.chatSearchQuery = "";
  uiState.chatAttachmentPreview = null;
  uiState.pendingChatAttachments = [];
  uiState.chatUploadingFiles = false;
  uiState.chatSending = false;
}

function handleAppKeyDown(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || event.key !== "Enter") return;

  if (target instanceof HTMLInputElement && target.getAttribute("data-action") === "update-field-modal-option-draft") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
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
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
    return;
  }

  if (!(target instanceof HTMLTextAreaElement) || target.getAttribute("data-action") !== "chat-message-input") return;

  if (action === "export-stage-tab") {
    exportStageTabFromButton(target);
    return;
  }

  if (action === "copy-product-sku") {
    copyProductSkuFromButton(target);
    return;
  }

  if (action === "select-image-gallery-format") {
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
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

async function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

  const productId = form.getAttribute("data-product-id");

  if (!stageId || !productName) return;

  if (action === "export-stage-tab") {
    exportStageTabFromButton(target);
    return;
  }

  if (action === "copy-product-sku") {
    copyProductSkuFromButton(target);
    return;
  }

  if (action === "select-image-gallery-format") {
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    addImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-product-chat") {
    openProductChat(target);
    renderFromCurrentState();
    scrollActiveChatToLatest();
    return;
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
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageUpload }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

function getBaseChatCharacterCode(code, existingStyle) {
  if (existingStyle === "bold") {
    if (code >= 0x1d400 && code <= 0x1d419) return 65 + code - 0x1d400;
    if (code >= 0x1d41a && code <= 0x1d433) return 97 + code - 0x1d41a;
    if (code >= 0x1d7ce && code <= 0x1d7d7) return 48 + code - 0x1d7ce;
  }
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
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

  uiState.pendingChatAttachments = [];
  form.reset();

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
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

  uiState.chatUploadingFiles = true;
  renderFromCurrentState();
  scrollActiveChatToLatest();

  Promise.all(files.map(readChatAttachmentFile)).then((attachments) => {
    uiState.pendingChatAttachments = [...uiState.pendingChatAttachments, ...attachments];
    uiState.chatUploadingFiles = false;
    input.value = "";
    renderFromCurrentState();
    scrollActiveChatToLatest();
  });
}

function removePendingChatAttachment(target) {
  const attachmentId = target.getAttribute("data-attachment-id");
  uiState.pendingChatAttachments = uiState.pendingChatAttachments.filter((attachment) => attachment.attachmentId !== attachmentId);
}

function readChatAttachmentFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        attachmentId: createChatAttachmentId(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: typeof reader.result === "string" ? reader.result : "",
      });
    });
    reader.readAsDataURL(file);
  });
}

function appendProductChatMessage(productId, message) {
  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.chatMessages.push(message);
  setWorkspaceDetails(nextDetails);
}

function scrollActiveChatToLatest() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const messages = document.querySelector(".product-chat__messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
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

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
    return;
  }

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = safeGetStorageItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

function createChatAttachmentId() {
  return `chat_file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function setStageSettings(nextSettings) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
}

function deleteProductImageFromButton(target) {
  if (!canManageProducts()) return;
  const productId = target.getAttribute("data-product-id");
  if (!productId) return;

  try {
    const preferences = JSON.parse(safeGetStorageItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    uiState.selectedStageId = "product-research";
  }
}

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    uploadPaymentFileFromInput(target);
    return;
  }
}

function loadDashboardSettings() {
  if (typeof window === "undefined") return normalizeDashboardSettings();
  const rawSettings = safeGetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeDashboardSettings();

  showSkuCopiedIndicator(product.id);
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
  renderFromCurrentState();
  uiState.skuCopyTimeoutId = window.setTimeout(() => {
    uiState.copiedSkuProductId = null;
    uiState.skuCopyTimeoutId = null;
    renderFromCurrentState();
  }, 1400);
}

function exportProductDataFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const product = getProductById(productId);
  if (!product) return;

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    uploadPaymentFileFromInput(target);
    return;
  }

async function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

function loadActivityLog() {
  if (typeof window === "undefined") return [];
  const rawActivity = safeGetStorageItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!rawActivity) return [];

function getProductSellingPrice(product) {
  return getProductFinancials(product).sellingPrice;
}

  const imageUpload = imageFile && imageFile.type.startsWith("image/")
    ? await uploadFileMetadata(imageFile, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId || "new"}` })
    : null;

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageUpload });
}

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
    return;
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
}

  setUserProducts([...userProducts, product]);
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageUpload }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

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
  selectProductAfterSave(product);
}

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
    return;
  }
}

  const profitOutput = metricsContainer.querySelector('[data-product-financial-output="profit"]');
  const marginOutput = metricsContainer.querySelector('[data-product-financial-output="margin"]');
  if (profitOutput) profitOutput.textContent = formatCurrency(getProductProfit(product));
  if (marginOutput) marginOutput.textContent = `${getProductMargin(product)}%`;
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
}

function openWorkspaceFieldModal(target, mode) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  if (!productId || !stageId) return;

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    uploadPaymentFileFromInput(target);
    return;
  }

  uiState.fieldModal = {
    mode,
    productId,
    stageId,
    fieldId,
    fieldLabel: field?.label ?? "",
    selectedType: field?.type ?? WORKSPACE_CUSTOM_FIELD_TYPES[0].value,
    dropdownOptions: getCustomDropdownOptions(field),
    dropdownOptionDraft: "",
    tableColumns: getCustomTableColumns(field),
    tableRows: getCustomTableRows(field),
    tableColumnDraft: "",
    tableRowDraft: "",
    checklistItems: getChecklistNotesItems(field),
    checklistItemDraft: "",
    linkButtonText: field?.type === "LINK" ? normalizeWorkspaceLinkValue(field.value, field.label).label : "",
    linkUrl: field?.type === "LINK" ? normalizeWorkspaceLinkValue(field.value, field.label).url : "",
  };
}

function deleteWorkspaceFieldFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const fieldId = target.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
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

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
    return;
  }

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const task = getWorkspaceChecklistTask(nextDetails, productId, stageId, checklistId);
  if (!task) return;

  task.isCompleted = Boolean(input.checked);
  task.completedAt = task.isCompleted ? new Date().toISOString() : null;
  setWorkspaceDetails(nextDetails);
  renderFromCurrentState();
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
  uiState.hiddenCompletedChecklistIds = nextHiddenCompletedChecklistIds;
}

function editWorkspaceChecklistTaskFromButton(target) {
  const productId = target.getAttribute("data-product-id");
  const stageId = target.getAttribute("data-stage-id");
  const checklistId = target.getAttribute("data-checklist-id");
  if (!productId || !stageId || !checklistId) return;

  const currentTask = getWorkspaceChecklistTask(workspaceDetails, productId, stageId, checklistId);
  if (!currentTask) return;

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
    return;
  }

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

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = safeGetStorageItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const task = getWorkspaceChecklistTask(nextDetails, productId, stageId, checklistId);
  if (!task) return;

  task.note = note;
  setWorkspaceDetails(nextDetails);
  uiState.checklistNoteModal = null;
  renderFromCurrentState();
}

function setStageSettings(nextSettings) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
}

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
    return;
  }

  try {
    const preferences = JSON.parse(safeGetStorageItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    uiState.selectedStageId = "product-research";
  }
}

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const imageUpload = imageFile && imageFile.type.startsWith("image/")
    ? await uploadFileMetadata(imageFile, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId || "new"}` })
    : null;

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageUpload });
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
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageUpload }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

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
  selectProductAfterSave(product);
}

  if (action === "export-stage-tab") {
    exportStageTabFromButton(target);
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    moveImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-product-chat") {
    openProductChat(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
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

  return normalizeWorkspaceLinkValue(field?.type === "LINK" ? field.value : "", field?.label ?? "");
}

async function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

function loadCampaignPrepSettings() {
  if (typeof window === "undefined") return normalizeCampaignPrepSettings();
  const rawSettings = safeGetStorageItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeCampaignPrepSettings();

  if (!productId || !stageId || !label || !WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(type)) return;

  const imageUpload = imageFile && imageFile.type.startsWith("image/")
    ? await uploadFileMetadata(imageFile, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId || "new"}` })
    : null;

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageUpload });
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
}

function removeLongBarTokenFromButton(button) {
  const tokenIndex = Number(button.getAttribute("data-token-index"));
  if (!Number.isInteger(tokenIndex) || tokenIndex < 0) return;
  updateLongBarTokens(button, (tokens) => tokens.filter((_, index) => index !== tokenIndex));
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
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageUpload }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

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
  selectProductAfterSave(product);
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

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
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

function formatPaymentDateWords(dateValue) {
  if (!dateValue) return "No date";
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = safeGetStorageItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

function deletePaymentTransactionFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const paymentId = button.getAttribute("data-payment-id");
  if (!productId || !stageId || !fieldId || !paymentId) return false;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "PAYMENT_STATUS") return false;

function ensureWorkspaceProductDetails(details, productId) {
  details.products[productId] ??= { imageDataUrl: "", imageStoragePath: "", imageUrl: "", stages: {}, chatMessages: [] };
  details.products[productId].imageDataUrl = "";
  details.products[productId].imageStoragePath ??= "";
  details.products[productId].imageUrl ??= "";
  details.products[productId].stages ??= {};
  details.products[productId].chatMessages ??= [];
  return details.products[productId];
}

function setStageSettings(nextSettings) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
}

function confirmPaymentTransactionDelete(transaction) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;

  try {
    const preferences = JSON.parse(safeGetStorageItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    uiState.selectedStageId = "product-research";
  }
}

function uploadPaymentFileFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const files = Array.from(input.files ?? []);
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  try {
    safeSetStorageItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      selectedStageId: uiState.selectedStageId,
    }));
  } catch (error) {
    console.warn("LaunchFlow could not persist UI preferences locally.", error);
  }
}

function loadDashboardSettings() {
  if (typeof window === "undefined") return normalizeDashboardSettings();
  const rawSettings = safeGetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeDashboardSettings();

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "PAYMENT_STATUS") return;

function setDashboardSettings(nextSettings) {
  dashboardSettings = normalizeDashboardSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify(dashboardSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist dashboard settings locally.", error);
    }
  }
}

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
}

function normalizeDashboardBackgroundImage(value) {
  const imageSource = String(value ?? "").trim();
  if (!imageSource) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(imageSource)) return imageSource;
  return getSafeWorkspaceUrl(imageSource);
}

function loadActivityLog() {
  if (typeof window === "undefined") return [];
  const rawActivity = safeGetStorageItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!rawActivity) return [];

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  reorderStageFieldTemplates(nextDetails, draggedField.stageId, draggedField.fieldId, dropFieldId);
  for (const productDetails of Object.values(nextDetails.products ?? {})) {
    const fields = productDetails?.stages?.[draggedField.stageId]?.customFields;
    if (Array.isArray(fields)) reorderFieldListInPlace(fields, draggedField.fieldId, dropFieldId);
  }
  setWorkspaceDetails(nextDetails);
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
}

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
  renderFromCurrentState();
}

function addWorkspaceTableSectionFromButton(button, axis) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId || !["column", "row"].includes(axis)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
  setWorkspaceDetails(nextDetails);
}

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = safeGetStorageItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(sku).catch(() => {});
  }

function setStageSettings(nextSettings) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
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
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    uploadPaymentFileFromInput(target);
    return;
  }

function loadCampaignPrepSettings() {
  if (typeof window === "undefined") return normalizeCampaignPrepSettings();
  const rawSettings = safeGetStorageItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeCampaignPrepSettings();

  if (format === "doc") {
    downloadBlob(filename, buildDocumentExport(exportData), "application/msword;charset=utf-8");
    return;
  }

  try {
    safeSetStorageItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      selectedStageId: uiState.selectedStageId,
    }));
  } catch (error) {
    console.warn("LaunchFlow could not persist UI preferences locally.", error);
  }
}

function loadDashboardSettings() {
  if (typeof window === "undefined") return normalizeDashboardSettings();
  const rawSettings = safeGetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeDashboardSettings();

  try {
    return normalizeLaunchMonitoringSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeLaunchMonitoringSettings();
  }

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    removeImageGallerySlotFromButton(target);
    renderFromCurrentState();
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    removeImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
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

  if (action === "select-image-gallery-format") {
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    removeImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
  if (type === "CHECKLIST_NOTES") {
    const notes = normalizeChecklistNotesValue(value);
    return [`Checked: ${Object.keys(notes.checked ?? {}).filter((key) => notes.checked[key]).join(", ")}`, `Notes: ${notes.notes}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (Array.isArray(value)) return value.map((item) => stringifyExportFieldValue(item)).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${stringifyExportFieldValue(item)}`).join("; ");
  return String(value);
}

function loadActivityLog() {
  if (typeof window === "undefined") return [];
  const rawActivity = safeGetStorageItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!rawActivity) return [];

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
    `Files: ${payment.files.map(formatExportFile).join("; ")}`,
  ].filter((item) => !item.endsWith(": ")).join("; ");
}

function formatExportTableValue(value) {
  if (!Array.isArray(value)) return "";
  return value.map((row) => Array.isArray(row) ? row.join(" | ") : stringifyExportFieldValue(row)).filter(Boolean).join(" / ");
}

function loadVineSettings() {
  if (typeof window === "undefined") return normalizeVineSettings();
  const rawSettings = safeGetStorageItem(VINE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeVineSettings();

  uiState.chatUploadingFiles = true;
  renderFromCurrentState();
  scrollActiveChatToLatest();

function setVineSettings(nextSettings) {
  vineSettings = normalizeVineSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(activityLog));
    } catch (error) {
      console.warn("LaunchFlow could not persist Vine settings locally.", error);
    }
  }
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
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

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
    return;
  }

function formatExportDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleString();
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

function loadLaunchMonitoringSettings() {
  if (typeof window === "undefined") return normalizeLaunchMonitoringSettings();
  const rawSettings = safeGetStorageItem(LAUNCH_MONITORING_STORAGE_KEY);
  if (!rawSettings) return normalizeLaunchMonitoringSettings();


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

function setLaunchMonitoringSettings(nextSettings) {
  launchMonitoringSettings = normalizeLaunchMonitoringSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(LAUNCH_MONITORING_STORAGE_KEY, JSON.stringify(launchMonitoringSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist launch monitoring settings locally.", error);
    }
  }
}

function formatExportTableValue(value) {
  if (!Array.isArray(value)) return "";
  return value.map((row) => Array.isArray(row) ? row.join(" | ") : stringifyExportFieldValue(row)).filter(Boolean).join(" / ");
}

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
  setWorkspaceDetails(nextDetails);
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

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

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

async function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

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

  const imageUpload = imageFile && imageFile.type.startsWith("image/")
    ? await uploadFileMetadata(imageFile, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId || "new"}` })
    : null;

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageUpload });
}

function loadVineSettings() {
  if (typeof window === "undefined") return normalizeVineSettings();
  const rawSettings = safeGetStorageItem(VINE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeVineSettings();

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

function setVineSettings(nextSettings) {
  vineSettings = normalizeVineSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(VINE_SETTINGS_STORAGE_KEY, JSON.stringify(vineSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist Vine settings locally.", error);
    }
  }
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
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
}

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    removeImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
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

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    uploadPaymentFileFromInput(target);
    return;
  }

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
  selectProductAfterSave(product);
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

function buildDocumentExport(exportData) {
  return buildHtmlTableExport(exportData);
}

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
}

function createExportFileName(label, format) {
  const extension = format === "doc" ? "doc" : format === "xls" ? "xls" : format === "pdf" ? "html" : format;
  return `${createStorageSafeFileName(label).toLowerCase()}-launchflow-export.${extension}`;
}

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
    return;
  }

  if (action === "export-stage-tab") {
    exportStageTabFromButton(target);
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
    if (!canEditWorkspaceData()) return;
    selectImageGalleryFormatFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    removeImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    moveImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "open-product-chat") {
    openProductChat(target);
    renderFromCurrentState();
    return;
  }

  if (action === "add-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
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
    if (!canEditWorkspaceData()) return;
    removeImageGalleryImageFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "remove-image-gallery-slot") {
    if (!canEditWorkspaceData()) return;
    removeImageGallerySlotFromButton(target);
    renderFromCurrentState();
    return;
  }

  if (action === "move-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
    return;
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

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
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

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
  setWorkspaceDetails(nextDetails);
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

async function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

  const imageUpload = imageFile && imageFile.type.startsWith("image/")
    ? await uploadFileMetadata(imageFile, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId || "new"}` })
    : null;

  const imageUpload = imageFile && imageFile.type.startsWith("image/")
    ? await uploadFileMetadata(imageFile, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId || "new"}` })
    : null;

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageUpload });
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

function setLaunchMonitoringSettings(nextSettings) {
  launchMonitoringSettings = normalizeLaunchMonitoringSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(LAUNCH_MONITORING_STORAGE_KEY, JSON.stringify(launchMonitoringSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist launch monitoring settings locally.", error);
    }
  }

  return Array.from(fieldsById.values());
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
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageUpload }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;

function formatExportCurrencyValue(value) {
  const amount = Number(value?.amount ?? value);
  const currency = typeof value?.currency === "string" && value.currency ? value.currency.toUpperCase() : "USD";
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
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

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function loadVineSettings() {
  if (typeof window === "undefined") return normalizeVineSettings();
  const rawSettings = safeGetStorageItem(VINE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeVineSettings();

function buildDocumentExport(exportData) {
  return buildHtmlTableExport(exportData);
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

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

  if (format === "csv") {
    downloadBlob(filename, buildCsvExport(exportData), "text/csv;charset=utf-8");
    return;
  }

  if (format === "xls") {
    downloadBlob(filename, buildHtmlTableExport(exportData), "application/vnd.ms-excel;charset=utf-8");
    return;
  }

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = safeGetStorageItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

  if (format === "pdf") {
    openPrintableExport(exportData);
  }
}

function setStageSettings(nextSettings) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
}

function getExportFieldColumns(stageId, products) {
  const fieldsById = new Map();
  for (const template of getStageFieldTemplates(workspaceDetails, stageId)) {
    const field = normalizeWorkspaceFieldDefinition(template);
    if (field) fieldsById.set(field.fieldId, { fieldId: field.fieldId, label: field.label, type: field.type });
  }

  try {
    const preferences = JSON.parse(safeGetStorageItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    uiState.selectedStageId = "product-research";
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

  try {
    safeSetStorageItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      selectedStageId: uiState.selectedStageId,
    }));
  } catch (error) {
    console.warn("LaunchFlow could not persist UI preferences locally.", error);
  }
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
  if (type === "CHECKLIST_NOTES") {
    const notes = normalizeChecklistNotesValue(value);
    return [`Checked: ${Object.keys(notes.checked ?? {}).filter((key) => notes.checked[key]).join(", ")}`, `Notes: ${notes.notes}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (Array.isArray(value)) return value.map((item) => stringifyExportFieldValue(item)).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${stringifyExportFieldValue(item)}`).join("; ");
  return String(value);
}

function loadDashboardSettings() {
  if (typeof window === "undefined") return normalizeDashboardSettings();
  const rawSettings = safeGetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeDashboardSettings();

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

function setDashboardSettings(nextSettings) {
  dashboardSettings = normalizeDashboardSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY, JSON.stringify(dashboardSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist dashboard settings locally.", error);
    }
  }
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
    `Files: ${payment.files.map(formatExportFile).join("; ")}`,
  ].filter((item) => !item.endsWith(": ")).join("; ");
}

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
}

function buildCsvExport(exportData) {
  return [exportData.columns, ...exportData.rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
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

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-image-gallery-image") {
    if (!canEditWorkspaceData()) return;
    uploadImageGalleryImagesFromInput(target);
    return;
  }

  if (action === "update-field-modal-gallery-format") {
    if (uiState.fieldModal && "value" in target) uiState.fieldModal.galleryFormat = String(target.value ?? "");
    renderFromCurrentState();
    return;
  }

  if (action === "upload-payment-field-file") {
    if (!canEditWorkspaceData()) return;
    uploadPaymentFileFromInput(target);
    return;
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

function loadCampaignPrepSettings() {
  if (typeof window === "undefined") return normalizeCampaignPrepSettings();
  const rawSettings = safeGetStorageItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeCampaignPrepSettings();

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

  if (action === "upload-product-image") {
    if (!canManageProducts()) return;
    updateProductImageFromInput(target).catch(reportStorageUploadError);
    return;
  }
}

  if (action === "upload-profile-avatar") {
    uploadProfileAvatar(target).catch(reportStorageUploadError);
    return;
  }

function loadLaunchMonitoringSettings() {
  if (typeof window === "undefined") return normalizeLaunchMonitoringSettings();
  const rawSettings = safeGetStorageItem(LAUNCH_MONITORING_STORAGE_KEY);
  if (!rawSettings) return normalizeLaunchMonitoringSettings();

  syncWorkspaceTableDefinitionToProducts(nextDetails, stageId, template);
  setWorkspaceDetails(nextDetails);
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
}

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!currentField || currentField.type !== "CUSTOM_TABLE") return;

function ensureWorkspaceProductDetails(details, productId) {
  details.products[productId] ??= { imageDataUrl: "", imageStoragePath: "", imageUrl: "", stages: {}, chatMessages: [] };
  details.products[productId].imageDataUrl = "";
  details.products[productId].imageStoragePath ??= "";
  details.products[productId].imageUrl ??= "";
  details.products[productId].stages ??= {};
  details.products[productId].chatMessages ??= [];
  return details.products[productId];
}

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
  renderFromCurrentState();
}

function reorderWorkspaceTableSection(draggedSection, dropIndex) {
  if (!draggedSection || !["column", "row"].includes(draggedSection.axis) || draggedSection.index === dropIndex) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
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

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = safeGetStorageItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const currentField = ensureWorkspaceProductField(nextDetails, section.productId, section.stageId, section.fieldId);
  if (!currentField || currentField.type !== "CUSTOM_TABLE") return;

  const template = getWorkspaceTableTemplate(nextDetails, section.stageId, currentField);
  const listKey = section.axis === "column" ? "tableColumns" : "tableRows";
  const labels = normalizeFieldList(template[listKey]);
  if (!Number.isInteger(section.index) || section.index < 0 || section.index >= labels.length) return;

  labels[section.index] = label;
  template[listKey] = labels;
  syncWorkspaceTableDefinitionToProducts(nextDetails, section.stageId, template);
  setWorkspaceDetails(nextDetails);
}

function setVineSettings(nextSettings) {
  vineSettings = normalizeVineSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
  return template;
}

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  try {
    const preferences = JSON.parse(safeGetStorageItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    uiState.selectedStageId = "product-research";
  }

  if (format === "doc") {
    downloadBlob(filename, buildDocumentExport(exportData), "application/msword;charset=utf-8");
    return;
  }

  try {
    safeSetStorageItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      selectedStageId: uiState.selectedStageId,
    }));
  } catch (error) {
    console.warn("LaunchFlow could not persist UI preferences locally.", error);
  }
}

function loadDashboardSettings() {
  if (typeof window === "undefined") return normalizeDashboardSettings();
  const rawSettings = safeGetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeDashboardSettings();

function getExportFieldColumns(stageId, products) {
  const fieldsById = new Map();
  for (const template of getStageFieldTemplates(workspaceDetails, stageId)) {
    const field = normalizeWorkspaceFieldDefinition(template);
    if (field) fieldsById.set(field.fieldId, { fieldId: field.fieldId, label: field.label, type: field.type });
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

  return Array.from(fieldsById.values());
}

  if (action === "create-product") {
    event.preventDefault();
    if (!canManageProducts()) return;
    submitAddProductForm(form).catch(reportStorageUploadError);
    return;
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
  if (type === "CHECKLIST_NOTES") {
    const notes = normalizeChecklistNotesValue(value);
    return [`Checked: ${Object.keys(notes.checked ?? {}).filter((key) => notes.checked[key]).join(", ")}`, `Notes: ${notes.notes}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (Array.isArray(value)) return value.map((item) => stringifyExportFieldValue(item)).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${stringifyExportFieldValue(item)}`).join("; ");
  return String(value);
}

function loadActivityLog() {
  if (typeof window === "undefined") return [];
  const rawActivity = safeGetStorageItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!rawActivity) return [];

function formatExportCurrencyValue(value) {
  const amount = Number(value?.amount ?? value);
  const currency = typeof value?.currency === "string" && value.currency ? value.currency.toUpperCase() : "USD";
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
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
}

function normalizeCampaignPrepSettings(settings = {}) {
  const counts = settings?.counts && typeof settings.counts === "object" ? settings.counts : {};
  const defaultCounts = DEFAULT_CAMPAIGN_PREP_SETTINGS.counts;
  return {
    counts: {
      total: normalizeCampaignCount(counts.total, defaultCounts.total),
      sponsoredProducts: normalizeCampaignCount(counts.sponsoredProducts, defaultCounts.sponsoredProducts),
      sponsoredBrands: normalizeCampaignCount(counts.sponsoredBrands, defaultCounts.sponsoredBrands),
      sponsoredDisplay: normalizeCampaignCount(counts.sponsoredDisplay, defaultCounts.sponsoredDisplay),
    },
    sheetButtonText: String(settings?.sheetButtonText ?? DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText).trim() || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetButtonText,
    sheetUrl: String(settings?.sheetUrl ?? DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetUrl).trim() || DEFAULT_CAMPAIGN_PREP_SETTINGS.sheetUrl,
  };
}

async function submitAddProductForm(form) {
  if (!canManageProducts()) return;
  const stageId = form.getAttribute("data-stage-id");
  const formData = new FormData(form);
  const productName = String(formData.get("productName") ?? "").trim();
  const sku = normalizeOptionalProductValue(formData.get("productSku"));
  const asin = normalizeOptionalProductValue(formData.get("productAsin"));
  const imageInput = form.querySelector('input[name="productImage"]');
  const imageFile = imageInput instanceof HTMLInputElement ? imageInput.files?.[0] : null;

function loadLaunchMonitoringSettings() {
  if (typeof window === "undefined") return normalizeLaunchMonitoringSettings();
  const rawSettings = safeGetStorageItem(LAUNCH_MONITORING_STORAGE_KEY);
  if (!rawSettings) return normalizeLaunchMonitoringSettings();

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

  const imageUpload = imageFile && imageFile.type.startsWith("image/")
    ? await uploadFileMetadata(imageFile, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId || "new"}` })
    : null;

  saveProductFromModal({ productId, stageId, name: productName, sku, asin, imageUpload });
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
  return "";
}

function countWorkspaceFieldsForStage(stageId) {
  return Object.values(workspaceDetails.products ?? {}).reduce((totalFields, productDetails) => {
    const fields = productDetails?.stages?.[stageId]?.customFields;
    return totalFields + (Array.isArray(fields) ? fields.length : 0);
  }, 0);
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
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
}

function updateProduct({ productId, stageId, name, sku, asin, imageUpload }) {
  const existingProduct = getEditableProduct(productId);
  if (!existingProduct) return;


function formatExportCurrencyValue(value) {
  const amount = Number(value?.amount ?? value);
  const currency = typeof value?.currency === "string" && value.currency ? value.currency.toUpperCase() : "USD";
  if (!Number.isFinite(amount)) return "";
  try {
    const preferences = JSON.parse(safeGetStorageItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    return `${currency} ${amount}`;
  }
  saveProductImageIfPresent(product.id, imageUpload);
  selectProductAfterSave(product);
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
}

function buildCsvExport(exportData) {
  return [exportData.columns, ...exportData.rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

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

function loadActivityLog() {
  if (typeof window === "undefined") return [];
  const rawActivity = safeGetStorageItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!rawActivity) return [];

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
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

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

function loadCampaignPrepSettings() {
  if (typeof window === "undefined") return normalizeCampaignPrepSettings();
  const rawSettings = safeGetStorageItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeCampaignPrepSettings();

  if (format === "xls") {
    downloadBlob(filename, buildHtmlTableExport(exportData), "application/vnd.ms-excel;charset=utf-8");
    return;
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

function loadLaunchMonitoringSettings() {
  if (typeof window === "undefined") return normalizeLaunchMonitoringSettings();
  const rawSettings = safeGetStorageItem(LAUNCH_MONITORING_STORAGE_KEY);
  if (!rawSettings) return normalizeLaunchMonitoringSettings();

  try {
    return normalizeLaunchMonitoringSettings(JSON.parse(rawSettings));
  } catch {
    return normalizeLaunchMonitoringSettings();
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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
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
    `Files: ${payment.files.map(formatExportFile).join("; ")}`,
  ].filter((item) => !item.endsWith(": ")).join("; ");
}

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
  renderFromCurrentState();
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function loadVineSettings() {
  if (typeof window === "undefined") return normalizeVineSettings();
  const rawSettings = safeGetStorageItem(VINE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeVineSettings();

function buildDocumentExport(exportData) {
  return buildHtmlTableExport(exportData);
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

function loadStageSettings() {
  if (typeof window === "undefined") return createDefaultStageSettings();
  const rawSettings = safeGetStorageItem(STAGE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return createDefaultStageSettings();

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

function setStageSettings(nextSettings) {
  stageSettings = normalizeStageSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
  }
  queueRemoteWorkspaceSync();
}

  if (format === "xls") {
    downloadBlob(filename, buildHtmlTableExport(exportData), "application/vnd.ms-excel;charset=utf-8");
    return;
  }

  try {
    const preferences = JSON.parse(safeGetStorageItem(UI_PREFERENCES_STORAGE_KEY) || "{}");
    const selectedStageId = String(preferences.selectedStageId ?? "");
    const visibleStageIds = new Set(getSidebarStageTabs().map((stageTab) => stageTab.id));
    if (visibleStageIds.has(selectedStageId)) uiState.selectedStageId = selectedStageId;
  } catch {
    uiState.selectedStageId = "product-research";
  }

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

  try {
    safeSetStorageItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      selectedStageId: uiState.selectedStageId,
    }));
  } catch (error) {
    console.warn("LaunchFlow could not persist UI preferences locally.", error);
  }
}

function loadDashboardSettings() {
  if (typeof window === "undefined") return normalizeDashboardSettings();
  const rawSettings = safeGetStorageItem(DASHBOARD_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeDashboardSettings();

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
  if (type === "CHECKLIST_NOTES") {
    const notes = normalizeChecklistNotesValue(value);
    return [`Checked: ${Object.keys(notes.checked ?? {}).filter((key) => notes.checked[key]).join(", ")}`, `Notes: ${notes.notes}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (Array.isArray(value)) return value.map((item) => stringifyExportFieldValue(item)).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${stringifyExportFieldValue(item)}`).join("; ");
  return String(value);
}

function loadActivityLog() {
  if (typeof window === "undefined") return [];
  const rawActivity = safeGetStorageItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!rawActivity) return [];

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

function setActivityLog(nextActivityLog) {
  activityLog = normalizeActivityLog(nextActivityLog);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(activityLog));
    } catch (error) {
      console.warn("LaunchFlow could not persist activity history locally.", error);
    }
  }
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

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
  renderFromCurrentState();
}

function loadCampaignPrepSettings() {
  if (typeof window === "undefined") return normalizeCampaignPrepSettings();
  const rawSettings = safeGetStorageItem(CAMPAIGN_PREP_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeCampaignPrepSettings();

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
  setWorkspaceDetails(nextDetails);
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
}

function formatExportDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleString();
}

function loadLaunchMonitoringSettings() {
  if (typeof window === "undefined") return normalizeLaunchMonitoringSettings();
  const rawSettings = safeGetStorageItem(LAUNCH_MONITORING_STORAGE_KEY);
  if (!rawSettings) return normalizeLaunchMonitoringSettings();

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

  if (format === "csv") {
    downloadBlob(filename, buildCsvExport(exportData), "text/csv;charset=utf-8");
    return;
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

  if (format === "doc") {
    downloadBlob(filename, buildDocumentExport(exportData), "application/msword;charset=utf-8");
    return;
  }

  if (format === "pdf") {
    openPrintableExport(exportData);
  }
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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
  if (type === "CHECKLIST_NOTES") {
    const notes = normalizeChecklistNotesValue(value);
    return [`Checked: ${Object.keys(notes.checked ?? {}).filter((key) => notes.checked[key]).join(", ")}`, `Notes: ${notes.notes}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (Array.isArray(value)) return value.map((item) => stringifyExportFieldValue(item)).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${stringifyExportFieldValue(item)}`).join("; ");
  return String(value);
}

function loadVineSettings() {
  if (typeof window === "undefined") return normalizeVineSettings();
  const rawSettings = safeGetStorageItem(VINE_SETTINGS_STORAGE_KEY);
  if (!rawSettings) return normalizeVineSettings();

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

function setVineSettings(nextSettings) {
  vineSettings = normalizeVineSettings(nextSettings);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(VINE_SETTINGS_STORAGE_KEY, JSON.stringify(vineSettings));
    } catch (error) {
      console.warn("LaunchFlow could not persist Vine settings locally.", error);
    }
  }
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

function buildHtmlTableExport(exportData) {
  const headerCells = exportData.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const bodyRows = exportData.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(exportData.title)}</title></head><body><h1>${escapeHtml(exportData.title)}</h1><p>Exported ${escapeHtml(formatExportDate(exportData.exportedAt))}</p><table border="1"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
}

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
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

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
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
    `Files: ${payment.files.map(formatExportFile).join("; ")}`,
  ].filter((item) => !item.endsWith(": ")).join("; ");
}

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
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

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
  setWorkspaceDetails(nextDetails);
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

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
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
    `Files: ${payment.files.map(formatExportFile).join("; ")}`,
  ].filter((item) => !item.endsWith(": ")).join("; ");
}

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
  renderFromCurrentState();
}

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

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
  setWorkspaceDetails(nextDetails);
}

async function readChatAttachmentFile(file) {
  return {
    attachmentId: createChatAttachmentId(),
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.chatAttachments, scope: "chat" })),
  };
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

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
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
    `Files: ${payment.files.map(formatExportFile).join("; ")}`,
  ].filter((item) => !item.endsWith(": ")).join("; ");
}

async function updateProductImageFromInput(input) {
  if (!canManageProducts() || !(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const file = input.files?.[0];
  if (!productId || !file || !file.type.startsWith("image/")) return;

  const imageUpload = await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.productImages, scope: `products/${productId}` });
  saveProductImageIfPresent(productId, imageUpload);
  renderFromCurrentState();
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const productDetails = ensureWorkspaceProductDetails(nextDetails, productId);
  productDetails.imageDataUrl = "";
  productDetails.imageStoragePath = "";
  productDetails.imageUrl = "";
  setWorkspaceDetails(nextDetails);
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

function exportStageTabFromButton(target) {
  const stageId = target.getAttribute("data-stage-id");
  const format = target.getAttribute("data-export-format");
  if (!TAB_EXPORT_FORMATS.some((item) => item.value === format)) return;

  const selectedTab = getSidebarStageTabs().find((stageTab) => stageTab.id === stageId) ?? getSelectedStageTab();
  const exportData = buildStageTabExportData(selectedTab);
  const filename = createExportFileName(selectedTab.label, format);

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
  if (type === "CURRENCY") return formatExportCurrencyValue(value);
  if (type === "FILE_UPLOAD") return normalizeWorkspaceFileList(value).map(formatExportFile).join("; ");
  if (type === "PAYMENT_STATUS") return formatExportPaymentValue(value);
  if (type === "LISTING_CONTENT") {
    const listing = normalizeListingContentValue(value);
    return [`Title: ${listing.title}`, `Bullets: ${listing.bullets.filter(Boolean).join(" | ")}`, `Description: ${listing.description}`, `Keywords: ${listing.backendKeywords}`, `Status: ${listing.status}`].filter((item) => !item.endsWith(": ")).join("; ");
  }
  if (type === "CUSTOM_TABLE") return formatExportTableValue(value);
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

  for (const productDetails of Object.values(details.products ?? {})) {
    const stageDetails = productDetails?.stages?.[stageId];
    if (!stageDetails) continue;
    const field = stageDetails.customFields?.find((item) => item.fieldId === normalizedTemplate.fieldId && item.type === "CUSTOM_TABLE");
    if (!field) continue;

    const previousRows = getCustomTableRows(field);
    const previousColumns = getCustomTableColumns(field);
    field.tableColumns = [...normalizedTemplate.tableColumns];
    field.tableRows = [...normalizedTemplate.tableRows];
    if (valueUpdater) {
      valueUpdater(field, previousRows, previousColumns);
    } else {
      field.value = resizeCustomTableValue(field.value, getEffectiveTableRowCount(normalizedTemplate), getEffectiveTableColumnCount(normalizedTemplate));
    }
  }
}

function ensureWorkspaceProductDetails(details, productId) {
  details.products[productId] ??= { imageDataUrl: "", imageStoragePath: "", imageUrl: "", stages: {}, chatMessages: [] };
  details.products[productId].imageDataUrl = "";
  details.products[productId].imageStoragePath ??= "";
  details.products[productId].imageUrl ??= "";
  details.products[productId].stages ??= {};
  details.products[productId].chatMessages ??= [];
  return details.products[productId];
}

function reorderListItem(items, fromIndex, toIndex) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function updateStructuredWorkspaceFieldFromInput(input) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;

  if (input.getAttribute("data-action") === "update-workspace-table-cell") {
    const rowIndex = Number(input.getAttribute("data-row-index"));
    const columnIndex = Number(input.getAttribute("data-column-index"));
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
    const rows = getCustomTableRows(field);
    const columns = getCustomTableColumns(field);
    const effectiveRows = rows.length > 0 ? rows : [""];
    const effectiveColumns = columns.length > 0 ? columns : ["Details"];
    const tableValue = resizeCustomTableValue(field.value, effectiveRows.length, effectiveColumns.length);
    tableValue[rowIndex][columnIndex] = getWorkspaceInputValue(input);
    field.value = tableValue;
  }

  if (input.getAttribute("data-action") === "update-workspace-checklist-note-item") {
    const itemIndex = Number(input.getAttribute("data-option-index"));
    const item = getChecklistNotesItems(field)[itemIndex];
    if (!item || !(input instanceof HTMLInputElement)) return;
    const value = normalizeChecklistNotesValue(field.value, getChecklistNotesItems(field));
    value.checked[item] = input.checked;
    field.value = value;
  }

function ensureWorkspaceProductDetails(details, productId) {
  details.products[productId] ??= { imageDataUrl: "", imageStoragePath: "", imageUrl: "", stages: {}, chatMessages: [] };
  details.products[productId].imageDataUrl = "";
  details.products[productId].imageStoragePath ??= "";
  details.products[productId].imageUrl ??= "";
  details.products[productId].stages ??= {};
  details.products[productId].chatMessages ??= [];
  return details.products[productId];
}

  setWorkspaceDetails(nextDetails);
}

function updateListingContentFromInput(input) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const part = input.getAttribute("data-listing-part");
  if (!productId || !stageId || !fieldId || !part) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "LISTING_CONTENT") return;

  const value = normalizeListingContentValue(field.value);
  const inputValue = "value" in input ? String(input.value ?? "") : "";
  if (part === "title") value.title = inputValue;
  if (part === "description") value.description = inputValue;
  if (part === "backendKeywords") value.backendKeywords = inputValue;
  if (part === "status") value.status = ["approved", "declined"].includes(inputValue) ? inputValue : "";
  if (part === "bullet") {
    const bulletIndex = Number(input.getAttribute("data-bullet-index"));
    if (Number.isInteger(bulletIndex) && bulletIndex >= 0 && bulletIndex < value.bullets.length) value.bullets[bulletIndex] = inputValue;
  }

  field.value = value;
  setWorkspaceDetails(nextDetails);
  const listingBuilder = input.closest(".listing-content-builder");
  updateListingContentCounters(listingBuilder, value);
  if (input instanceof HTMLTextAreaElement) autoResizeTextarea(input);
}

function updateListingContentCounters(container, value) {
  if (!(container instanceof Element)) return;
  const normalizedValue = normalizeListingContentValue(value);
  const counters = {
    title: [getCharacterCount(normalizedValue.title), 200],
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

function updateWorkspaceFieldFromInput(input, options = {}) {
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  if (!productId || !stageId || !fieldId) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field) return;

  const fieldPart = input.getAttribute("data-field-part");
  const value = getWorkspaceInputValue(input);
  if (fieldPart) {
    const currentValue = getWorkspaceFieldPartValue(field);
    field.value = { ...currentValue, [fieldPart]: value };
  } else {
    field.value = value;
  }

  setWorkspaceDetails(nextDetails, { debounceSupabaseSync: options.debounceSupabaseSync });
}

function getWorkspaceFieldPartValue(field) {
  if (field?.type === "LINK") return normalizeWorkspaceLinkValue(field.value, field.label);
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
  const stageDetails = ensureWorkspaceStageDetails(nextDetails, productId, stageId);
  workspaceDetails = nextDetails;
  return stageDetails;
}

function ensureWorkspaceStageDetails(details, productId, stageId) {
  const productDetails = ensureWorkspaceProductDetails(details, productId);
  productDetails.stages[stageId] ??= { customFields: [], checklistTasks: [] };
  productDetails.stages[stageId].customFields ??= [];
  productDetails.stages[stageId].checklistTasks ??= [];
  syncStageTemplatesIntoStageDetails(details, stageId, productDetails.stages[stageId]);
  return productDetails.stages[stageId];
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

  uiState.fieldModal = {
    mode,
    productId,
    stageId,
    fieldId,
    fieldLabel: field?.label ?? "",
    selectedType: field?.type ?? WORKSPACE_CUSTOM_FIELD_TYPES[0].value,
    dropdownOptions: getCustomDropdownOptions(field),
    dropdownOptionDraft: "",
    tableColumns: getCustomTableColumns(field),
    tableRows: getCustomTableRows(field),
    tableColumnDraft: "",
    tableRowDraft: "",
    checklistItems: getChecklistNotesItems(field),
    checklistItemDraft: "",
    linkButtonText: field?.type === "LINK" ? normalizeWorkspaceLinkValue(field.value, field.label).label : "",
    linkUrl: field?.type === "LINK" ? normalizeWorkspaceLinkValue(field.value, field.label).url : "",
    galleryFormat: field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format || IMAGE_GALLERY_FORMATS[0]?.value || "" : IMAGE_GALLERY_FORMATS[0]?.value || "",
  };
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

  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
  setWorkspaceDetails(nextDetails);
}

function uploadWorkspaceFileFieldFromInput(input) {
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

    field.value = [...normalizeWorkspaceFileList(field.value), ...uploadedFiles];
    setWorkspaceDetails(nextDetails);
    input.value = "";
    renderFromCurrentState();
  }).catch((error) => {
    input.value = "";
    reportStorageUploadError(error);
  });
}

function getSyncedWorkspaceFieldValue(definition, existingField = null) {
  if (!existingField || existingField.type !== definition.type) return createWorkspaceFieldInitialValue(definition.type);

  if (definition.type === "CUSTOM_DROPDOWN") {
    const selectedValue = normalizeWorkspaceFieldValue(definition.type, existingField.value);
    return definition.options.includes(selectedValue) ? selectedValue : "";
  }

  if (definition.type === "CUSTOM_TABLE") {
    return resizeCustomTableValue(existingField.value, getEffectiveTableRowCount(definition), getEffectiveTableColumnCount(definition));
  }

  if (definition.type === "CHECKLIST_NOTES") {
    return normalizeChecklistNotesValue(existingField.value, definition.checklistItems);
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

function selectImageGalleryFormatFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const galleryFormat = button.getAttribute("data-gallery-format");
  if (!productId || !stageId || !fieldId || !IMAGE_GALLERY_FORMATS.some((format) => format.value === galleryFormat)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
  setWorkspaceDetails(nextDetails);
}

function updateFieldModalType(select) {
  if (!uiState.fieldModal) return;
  uiState.fieldModal.selectedType = String(select.value ?? "");
  if (uiState.fieldModal.selectedType === "IMAGE_GALLERY" && !getImageGalleryFormat(uiState.fieldModal.galleryFormat)) {
    uiState.fieldModal.galleryFormat = IMAGE_GALLERY_FORMATS[0]?.value || "";
  }
  if (uiState.fieldModal.selectedType !== "CUSTOM_DROPDOWN") uiState.fieldModal.dropdownOptionDraft = "";
  if (uiState.fieldModal.selectedType !== "CUSTOM_TABLE") {
    uiState.fieldModal.tableColumnDraft = "";
    uiState.fieldModal.tableRowDraft = "";
  }
  if (uiState.fieldModal.selectedType !== "CHECKLIST_NOTES") uiState.fieldModal.checklistItemDraft = "";
  if (uiState.fieldModal.selectedType !== "LINK") {
    uiState.fieldModal.linkButtonText = "";
    uiState.fieldModal.linkUrl = "";
  }
}

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
  setWorkspaceDetails(nextDetails);
}

function openImageGalleryPreviewFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const slotIndex = Number(button.getAttribute("data-gallery-slot-index"));
  if (!productId || !stageId || !fieldId || !Number.isInteger(slotIndex)) return;

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
}

function getFieldModalImageGalleryFormat(field = null) {
  const draftFormat = getImageGalleryFormat(uiState.fieldModal?.galleryFormat)?.value;
  if (draftFormat) return draftFormat;
  const fieldFormat = field?.type === "IMAGE_GALLERY" ? normalizeImageGalleryValue(field.value).format : "";
  return getImageGalleryFormat(fieldFormat)?.value ?? IMAGE_GALLERY_FORMATS[0]?.value ?? "";
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
  const label = String(formData.get("fieldLabel") ?? uiState.fieldModal?.fieldLabel ?? "").trim();
  const type = String(formData.get("fieldType") ?? uiState.fieldModal?.selectedType ?? "");
  const dropdownOptions = type === "CUSTOM_DROPDOWN" ? getFieldModalDropdownOptions() : [];
  const tableColumns = type === "CUSTOM_TABLE" ? getFieldModalTableColumns() : [];
  const tableRows = type === "CUSTOM_TABLE" ? getFieldModalTableRows() : [];
  const checklistItems = type === "CHECKLIST_NOTES" ? getFieldModalChecklistItems() : [];
  const imageGalleryFormat = type === "IMAGE_GALLERY" ? getFieldModalImageGalleryFormat() : "";
  const linkValue = type === "LINK" ? normalizeWorkspaceLinkValue({
    label: formData.get("linkButtonText") ?? uiState.fieldModal?.linkButtonText ?? "",
    url: formData.get("linkUrl") ?? uiState.fieldModal?.linkUrl ?? "",
  }, label) : null;

  if (!productId || !stageId || !label || !WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(type)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const template = {
    fieldId: fieldId || createWorkspaceFieldId(),
    label,
    type,
    value: createWorkspaceFieldInitialValue(type, imageGalleryFormat),
    options: type === "CUSTOM_DROPDOWN" ? dropdownOptions : [],
    tableColumns: type === "CUSTOM_TABLE" ? tableColumns : [],
    tableRows: type === "CUSTOM_TABLE" ? tableRows : [],
    checklistItems: type === "CHECKLIST_NOTES" ? checklistItems : [],
    galleryFormat: imageGalleryFormat,
  };

  const savedTemplate = upsertStageFieldTemplate(nextDetails, stageId, template);
  syncWorkspaceFieldDefinitionToProducts(nextDetails, stageId, template);
  if (type === "LINK" && linkValue && savedTemplate) {
    setWorkspaceFieldValue(nextDetails, productId, stageId, savedTemplate.fieldId, linkValue);
  }
  setWorkspaceDetails(nextDetails);
}

function uploadImageGalleryImagesFromInput(input) {
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

    const value = normalizeImageGalleryValue(field.value);
    const replacedSlots = new Set(uploadedImages.map((image) => image.slotIndex));
    value.images = [...value.images.filter((image, index) => !replacedSlots.has(Number.isInteger(image.slotIndex) ? image.slotIndex : index)), ...uploadedImages]
      .sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
    const highestImageSlot = value.images.reduce((highestSlot, image) => Math.max(highestSlot, image.slotIndex), -1);
    const overflowSlots = highestImageSlot + 1 - getImageGalleryBaseSlotCount(value.format);
    value.extraSlots = Math.max(value.extraSlots, overflowSlots, 0);
    field.value = normalizeImageGalleryValue(value);
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
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const startSlotIndex = Math.max(0, Number(input.getAttribute("data-gallery-slot-index") ?? 0) || 0);
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  Promise.all(files.map((file) => readWorkspaceFieldFile(file, SUPABASE_STORAGE_BUCKETS.files))).then((uploadedFiles) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "IMAGE_GALLERY") return;

    const value = normalizeImageGalleryValue(field.value);
    const replacedSlots = new Set(uploadedImages.map((image) => image.slotIndex));
    value.images = [...value.images.filter((image, index) => !replacedSlots.has(Number.isInteger(image.slotIndex) ? image.slotIndex : index)), ...uploadedImages]
      .sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
    const highestImageSlot = value.images.reduce((highestSlot, image) => Math.max(highestSlot, image.slotIndex), -1);
    const overflowSlots = highestImageSlot + 1 - getImageGalleryBaseSlotCount(value.format);
    value.extraSlots = Math.max(value.extraSlots, overflowSlots, 0);
    field.value = normalizeImageGalleryValue(value);
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

function selectImageGalleryFormatFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const galleryFormat = button.getAttribute("data-gallery-format");
  if (!productId || !stageId || !fieldId || !IMAGE_GALLERY_FORMATS.some((format) => format.value === galleryFormat)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.images = value.images.filter((image, index) => (Number.isInteger(image.slotIndex) ? image.slotIndex : index) !== slotIndex);
  field.value = normalizeImageGalleryValue(value);
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

  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.images = value.images.filter((image, index) => (Number.isInteger(image.slotIndex) ? image.slotIndex : index) !== slotIndex);
  field.value = normalizeImageGalleryValue(value);
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
  setWorkspaceDetails(nextDetails);
}

function uploadImageGalleryImagesFromInput(input) {
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

    const value = normalizeImageGalleryValue(field.value);
    const replacedSlots = new Set(uploadedImages.map((image) => image.slotIndex));
    value.images = [...value.images.filter((image, index) => !replacedSlots.has(Number.isInteger(image.slotIndex) ? image.slotIndex : index)), ...uploadedImages]
      .sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
    const highestImageSlot = value.images.reduce((highestSlot, image) => Math.max(highestSlot, image.slotIndex), -1);
    const overflowSlots = highestImageSlot + 1 - getImageGalleryBaseSlotCount(value.format);
    value.extraSlots = Math.max(value.extraSlots, overflowSlots, 0);
    field.value = normalizeImageGalleryValue(value);
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
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const startSlotIndex = Math.max(0, Number(input.getAttribute("data-gallery-slot-index") ?? 0) || 0);
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  Promise.all(files.map((file) => readWorkspaceFieldFile(file, SUPABASE_STORAGE_BUCKETS.files))).then((uploadedFiles) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "IMAGE_GALLERY") return;

    const value = normalizeImageGalleryValue(field.value);
    const replacedSlots = new Set(uploadedImages.map((image) => image.slotIndex));
    value.images = [...value.images.filter((image, index) => !replacedSlots.has(Number.isInteger(image.slotIndex) ? image.slotIndex : index)), ...uploadedImages]
      .sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
    const highestImageSlot = value.images.reduce((highestSlot, image) => Math.max(highestSlot, image.slotIndex), -1);
    const overflowSlots = highestImageSlot + 1 - getImageGalleryBaseSlotCount(value.format);
    value.extraSlots = Math.max(value.extraSlots, overflowSlots, 0);
    field.value = normalizeImageGalleryValue(value);
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

function selectImageGalleryFormatFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const galleryFormat = button.getAttribute("data-gallery-format");
  if (!productId || !stageId || !fieldId || !IMAGE_GALLERY_FORMATS.some((format) => format.value === galleryFormat)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.images = value.images.filter((image, index) => (Number.isInteger(image.slotIndex) ? image.slotIndex : index) !== slotIndex);
  field.value = normalizeImageGalleryValue(value);
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
  setWorkspaceDetails(nextDetails);
}

function uploadImageGalleryImagesFromInput(input) {
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

    const value = normalizeImageGalleryValue(field.value);
    const replacedSlots = new Set(uploadedImages.map((image) => image.slotIndex));
    value.images = [...value.images.filter((image, index) => !replacedSlots.has(Number.isInteger(image.slotIndex) ? image.slotIndex : index)), ...uploadedImages]
      .sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
    const highestImageSlot = value.images.reduce((highestSlot, image) => Math.max(highestSlot, image.slotIndex), -1);
    const overflowSlots = highestImageSlot + 1 - getImageGalleryBaseSlotCount(value.format);
    value.extraSlots = Math.max(value.extraSlots, overflowSlots, 0);
    field.value = normalizeImageGalleryValue(value);
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
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const startSlotIndex = Math.max(0, Number(input.getAttribute("data-gallery-slot-index") ?? 0) || 0);
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  Promise.all(files.map((file) => readWorkspaceFieldFile(file, SUPABASE_STORAGE_BUCKETS.files))).then((uploadedFiles) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "IMAGE_GALLERY") return;

    const value = normalizeImageGalleryValue(field.value);
    const replacedSlots = new Set(uploadedImages.map((image) => image.slotIndex));
    value.images = [...value.images.filter((image, index) => !replacedSlots.has(Number.isInteger(image.slotIndex) ? image.slotIndex : index)), ...uploadedImages]
      .sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
    const highestImageSlot = value.images.reduce((highestSlot, image) => Math.max(highestSlot, image.slotIndex), -1);
    const overflowSlots = highestImageSlot + 1 - getImageGalleryBaseSlotCount(value.format);
    value.extraSlots = Math.max(value.extraSlots, overflowSlots, 0);
    field.value = normalizeImageGalleryValue(value);
    setWorkspaceDetails(nextDetails);
    input.value = "";
    renderFromCurrentState();
  }).catch((error) => {
    input.value = "";
    reportStorageUploadError(error);
  });
}

async function uploadImageGalleryImageFile(file, productId, fieldId, slotIndex) {
  return {
    imageId: createImageGalleryImageId(),
    slotIndex,
    ...(await uploadFileMetadata(file, { bucket: SUPABASE_STORAGE_BUCKETS.imageGalleries, scope: `image-gallery/${productId}/${fieldId}` })),
  };
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

  const value = normalizeImageGalleryValue(field.value);
  value.format = galleryFormat;
  field.value = value;
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

  const value = normalizeImageGalleryValue(field.value);
  value.extraSlots += 1;
  field.value = value;
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

function removeImageGalleryImageFromButton(button) {
  const productId = button.getAttribute("data-product-id");
  const stageId = button.getAttribute("data-stage-id");
  const fieldId = button.getAttribute("data-field-id");
  const slotIndex = Number(button.getAttribute("data-gallery-slot-index"));
  if (!productId || !stageId || !fieldId || !Number.isInteger(slotIndex)) return;

  const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
  const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
  if (!field || field.type !== "IMAGE_GALLERY") return;

  const value = normalizeImageGalleryValue(field.value);
  value.images = value.images.filter((image, index) => (Number.isInteger(image.slotIndex) ? image.slotIndex : index) !== slotIndex);
  field.value = normalizeImageGalleryValue(value);
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
  setWorkspaceDetails(nextDetails);
}

function uploadImageGalleryImagesFromInput(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const productId = input.getAttribute("data-product-id");
  const stageId = input.getAttribute("data-stage-id");
  const fieldId = input.getAttribute("data-field-id");
  const startSlotIndex = Math.max(0, Number(input.getAttribute("data-gallery-slot-index") ?? 0) || 0);
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (!productId || !stageId || !fieldId || files.length === 0) return;

  Promise.all(files.map((file, index) => uploadImageGalleryImageFile(file, productId, fieldId, startSlotIndex + index))).then((uploadedImages) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "IMAGE_GALLERY") return;

    const value = normalizeImageGalleryValue(field.value);
    const replacedSlots = new Set(uploadedImages.map((image) => image.slotIndex));
    value.images = [...value.images.filter((image, index) => !replacedSlots.has(Number.isInteger(image.slotIndex) ? image.slotIndex : index)), ...uploadedImages]
      .sort((firstImage, secondImage) => firstImage.slotIndex - secondImage.slotIndex);
    const highestImageSlot = value.images.reduce((highestSlot, image) => Math.max(highestSlot, image.slotIndex), -1);
    const overflowSlots = highestImageSlot + 1 - getImageGalleryBaseSlotCount(value.format);
    value.extraSlots = Math.max(value.extraSlots, overflowSlots, 0);
    field.value = normalizeImageGalleryValue(value);
    setWorkspaceDetails(nextDetails);
    input.value = "";
    renderFromCurrentState();
  }).catch((error) => {
    input.value = "";
    reportStorageUploadError(error);
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

    uiState.authError = `${supabaseLogin.message} This live workspace uses Supabase login so shared data can sync across users. Local fallback is disabled while Supabase is configured.`;
    renderFromCurrentState();
  }).catch((error) => {
    input.value = "";
    reportStorageUploadError(error);
  });
}

  const invitedUser = findTeamUserByEmail(email);
  const storedPassword = normalizePasswordInput(invitedUser?.password ?? "");
  const isAdminOwnerLogin = email === ADMIN_OWNER_CREDENTIALS.email && password === normalizePasswordInput(ADMIN_OWNER_CREDENTIALS.password);
  const isManualUserLogin = Boolean(storedPassword) && password === storedPassword;

  if (!isAdminOwnerLogin && !isManualUserLogin) {
    uiState.authError = invitedUser && !storedPassword
      ? "This user does not have a saved password yet. Sign in as admin, edit the user, and save a manual password."
      : uiState.authError || "Invalid email or password. Ask an admin to create or reset your manual access.";
    renderFromCurrentState();
    return;
  }

  const loginUser = invitedUser ?? DEFAULT_TEAM_USERS[0];
  setAuthSession({ email, name: loginUser.name, role: loginUser.role }, remember);
  markTeamUserLoggedIn(email);
  uiState.loginDraft = { email: "", password: "", remember: false };
  uiState.authError = "";
  uiState.showLoginPassword = false;
  renderFromCurrentState();
}

async function signInWithSupabasePassword(email, password) {
  if (!email || !password) return { ok: false, message: "Enter your Supabase email and password." };
  const config = getSupabaseConfig();
  try {
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: getSupabaseAuthHeaders(config.anonKey),
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: getSupabaseErrorMessage(payload, "Supabase could not sign you in. Check the email/password in Supabase Authentication."),
      };
    }
    return { ok: true, session: payload };
  } catch (error) {
    return {
      ok: false,
      message: `Supabase login is unavailable right now: ${error?.message ?? "network error"}`,
    };
  }
}

async function fetchSupabaseWorkspaceMembership(accessToken, userId) {
  if (!accessToken || !userId) {
    return { ok: false, message: "Supabase signed in, but the user session was missing workspace access details." };
  }

  const config = getSupabaseConfig();
  const query = new URLSearchParams({
    select: "workspace_id,role,status,workspaces(id,name)",
    user_id: `eq.${userId}`,
    status: "eq.active",
    limit: "1",
  });

  try {
    const response = await fetch(`${config.url}/rest/v1/workspace_members?${query.toString()}`, {
      method: "GET",
      headers: getSupabaseRestHeaders(config.anonKey, accessToken),
    });
    const payload = await response.json().catch(() => ([]));
    if (!response.ok) {
      return {
        ok: false,
        message: getSupabaseErrorMessage(payload, "Supabase signed in, but workspace access could not be loaded."),
      };
    }

    const membership = Array.isArray(payload) ? payload[0] : null;
    if (!membership) {
      return {
        ok: false,
        message: "Supabase login worked, but this user is not an active member of a LaunchFlow workspace yet.",
      };
    }

    return {
      ok: true,
      membership: {
        workspaceId: membership.workspace_id ?? "",
        workspaceName: membership.workspaces?.name ?? "LaunchFlow Workspace",
        role: membership.role ?? "viewer",
        status: membership.status ?? "active",
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: `Supabase workspace access is unavailable right now: ${error?.message ?? "network error"}`,
    };
  }
}

async function refreshSharedWorkspaceStateFromSupabase() {
  if (
    !canUseSupabaseWorkspaceState()
    || sharedWorkspaceRefreshInFlight
    || hasPendingSupabaseStateWrite()
    || isWorkspaceFieldInputActive()
    || isFormDraftOpen()
  ) return;

  sharedWorkspaceRefreshInFlight = true;
  try {
    const result = await syncSharedWorkspaceStateFromSupabase();
    if (!result.ok) uiState.supabaseSyncNotice = result.message;
  } catch (error) {
    console.warn("LaunchFlow could not refresh shared workspace state from Supabase.", error);
    uiState.supabaseSyncNotice = `Supabase shared workspace refresh failed: ${error?.message ?? "unexpected error"}`;
  } finally {
    sharedWorkspaceRefreshInFlight = false;
    renderFromCurrentState();
  }
}

async function syncSharedWorkspaceStateFromSupabase() {
  const stageSettingsSync = await syncStageSettingsFromSupabase();
  if (!stageSettingsSync.ok) return stageSettingsSync;

  const campaignPrepSync = await syncCampaignPrepSettingsFromSupabase();
  if (!campaignPrepSync.ok) return campaignPrepSync;

  const vineSync = await syncVineSettingsFromSupabase();
  if (!vineSync.ok) return vineSync;

  const launchMonitoringSync = await syncLaunchMonitoringSettingsFromSupabase();
  if (!launchMonitoringSync.ok) return launchMonitoringSync;

  const workspaceDetailsSync = await syncWorkspaceDetailsFromSupabase();
  if (!workspaceDetailsSync.ok || workspaceDetailsSync.deferred) return workspaceDetailsSync;

  const userProductsSync = await syncUserProductsFromSupabase();
  if (!userProductsSync.ok) return userProductsSync;
  deferred = deferred || Boolean(userProductsSync.deferred);

  const productSettingsSync = await syncProductSettingsFromSupabase();
  if (!productSettingsSync.ok) return productSettingsSync;
  deferred = deferred || Boolean(productSettingsSync.deferred);

  Promise.all(files.map((file) => readWorkspaceFieldFile(file, SUPABASE_STORAGE_BUCKETS.paymentDocuments))).then((uploadedFiles) => {
    const nextDetails = structuredCloneWorkspaceDetails(workspaceDetails);
    const field = ensureWorkspaceProductField(nextDetails, productId, stageId, fieldId);
    if (!field || field.type !== "PAYMENT_STATUS") return;

    const value = normalizePaymentStatusValue(field.value);
    value.files = [...value.files, ...uploadedFiles];
    field.value = normalizePaymentStatusValue(value);
    setWorkspaceDetails(nextDetails);
    input.value = "";
    renderFromCurrentState();
  }).catch((error) => {
    input.value = "";
    reportStorageUploadError(error);
  });
}

async function syncStageSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_STAGE_SETTINGS_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_STAGE_SETTINGS_STATE_KEY, remoteState.updatedAt)) {
    setStageSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_STAGE_SETTINGS_STATE_KEY, remoteState.updatedAt);
    ensureSelectedProductForStage(true);
    return { ok: true, source: "supabase" };
  }

  if (!remoteState.exists && hasStageSettingsData(stageSettings) && canWriteSupabaseWorkspaceState()) {
    return persistStageSettingsToSupabase({ awaitResult: true });
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function readWorkspaceFieldFile(file, bucket = SUPABASE_STORAGE_BUCKETS.files) {
  return {
    attachmentId: createWorkspaceFileId(),
    ...(await uploadFileMetadata(file, { bucket, scope: "workspace" })),
  };
}

async function syncCampaignPrepSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_CAMPAIGN_PREP_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_CAMPAIGN_PREP_STATE_KEY, remoteState.updatedAt)) {
    setCampaignPrepSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_CAMPAIGN_PREP_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

async function readWorkspaceFieldFile(file, bucket = SUPABASE_STORAGE_BUCKETS.files) {
  return {
    attachmentId: createWorkspaceFileId(),
    ...(await uploadFileMetadata(file, { bucket, scope: "workspace" })),
  };
}

async function readWorkspaceFieldFile(file, bucket = SUPABASE_STORAGE_BUCKETS.files) {
  return {
    attachmentId: createWorkspaceFileId(),
    ...(await uploadFileMetadata(file, { bucket, scope: "workspace" })),
  };
}

async function syncCampaignPrepSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_CAMPAIGN_PREP_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_CAMPAIGN_PREP_STATE_KEY, remoteState.updatedAt)) {
    setCampaignPrepSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_CAMPAIGN_PREP_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

  if (!remoteState.exists && hasCampaignPrepSettingsData(campaignPrepSettings) && canWriteSupabaseWorkspaceState()) {
    return persistCampaignPrepSettingsToSupabase({ awaitResult: true });
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function syncVineSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_VINE_SETTINGS_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_VINE_SETTINGS_STATE_KEY, remoteState.updatedAt)) {
    setVineSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_VINE_SETTINGS_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

  if (!remoteState.exists && hasVineSettingsData(vineSettings) && canWriteSupabaseWorkspaceState()) {
    return persistVineSettingsToSupabase({ awaitResult: true });
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function syncStageSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_STAGE_SETTINGS_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_STAGE_SETTINGS_STATE_KEY, remoteState.updatedAt)) {
    setStageSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_STAGE_SETTINGS_STATE_KEY, remoteState.updatedAt);
    ensureSelectedProductForStage(true);
    return { ok: true, source: "supabase" };
  }

  if (!remoteState.exists && hasStageSettingsData(stageSettings) && canWriteSupabaseWorkspaceState()) {
    return persistStageSettingsToSupabase({ awaitResult: true });
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function syncCampaignPrepSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_CAMPAIGN_PREP_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_CAMPAIGN_PREP_STATE_KEY, remoteState.updatedAt)) {
    setCampaignPrepSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_CAMPAIGN_PREP_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

  if (!remoteState.exists && hasCampaignPrepSettingsData(campaignPrepSettings) && canWriteSupabaseWorkspaceState()) {
    return persistCampaignPrepSettingsToSupabase({ awaitResult: true });
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function syncVineSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_VINE_SETTINGS_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_VINE_SETTINGS_STATE_KEY, remoteState.updatedAt)) {
    setVineSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_VINE_SETTINGS_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

  if (!remoteState.exists && hasVineSettingsData(vineSettings) && canWriteSupabaseWorkspaceState()) {
    return persistVineSettingsToSupabase({ awaitResult: true });
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function syncLaunchMonitoringSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_LAUNCH_MONITORING_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_LAUNCH_MONITORING_STATE_KEY, remoteState.updatedAt)) {
    setLaunchMonitoringSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_LAUNCH_MONITORING_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

  if (!remoteState.exists && hasLaunchMonitoringSettingsData(launchMonitoringSettings) && canWriteSupabaseWorkspaceState()) {
    return persistLaunchMonitoringSettingsToSupabase({ awaitResult: true });
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function syncWorkspaceDetailsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  if (hasUnsyncedLocalWorkspaceDetails() && hasWorkspaceDetailsData(workspaceDetails) && canWriteSupabaseWorkspaceState()) {
    return persistWorkspaceDetailsToSupabase({ awaitResult: true, debounceMs: 0 });
  }

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_WORKSPACE_DETAILS_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (hasUnsyncedLocalWorkspaceDetails()) {
    const localDirtyShouldWin = hasPendingSupabaseStateWrite(SUPABASE_WORKSPACE_DETAILS_STATE_KEY) || isRecentWorkspaceDetailsDirty();
    if (
      remoteState.exists
      && (!localDirtyShouldWin || isRemoteStateNewerThanLocalDirty(remoteState.updatedAt, workspaceDetailsDirtyAt))
    ) {
      if (hasWorkspaceDetailsData(remoteState.stateData)) setWorkspaceDetails(remoteState.stateData, { skipSupabaseSync: true });
      markWorkspaceDetailsSynced();
      rememberSupabaseStateRemoteUpdatedAt(SUPABASE_WORKSPACE_DETAILS_STATE_KEY, remoteState.updatedAt);
      return { ok: true, source: localDirtyShouldWin ? "supabase-newer-than-local" : "supabase-cleared-stale-local-dirty" };
    }

    if (hasWorkspaceDetailsData(workspaceDetails) && canWriteSupabaseWorkspaceState()) {
      return persistWorkspaceDetailsToSupabase({ awaitResult: true, debounceMs: 0 });
    }
  }

  if (remoteState.exists && hasWorkspaceDetailsData(remoteState.stateData) && shouldApplyRemoteSupabaseState(SUPABASE_WORKSPACE_DETAILS_STATE_KEY, remoteState.updatedAt)) {
    setWorkspaceDetails(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_WORKSPACE_DETAILS_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

  if (hasWorkspaceDetailsData(workspaceDetails) && canWriteSupabaseWorkspaceState() && !remoteState.exists) {
    return persistWorkspaceDetailsToSupabase({ awaitResult: true });
  }

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_WORKSPACE_DETAILS_STATE_KEY, remoteState.updatedAt)) {
    setWorkspaceDetails(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_WORKSPACE_DETAILS_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase-empty" };
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function syncUserProductsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_USER_PRODUCTS_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && hasUserProductsData(remoteState.stateData) && shouldApplyRemoteSupabaseState(SUPABASE_USER_PRODUCTS_STATE_KEY, remoteState.updatedAt)) {
    setUserProducts(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_USER_PRODUCTS_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

  if (hasUserProductsData(userProducts) && canWriteSupabaseWorkspaceState() && !remoteState.exists) {
    return persistUserProductsToSupabase({ awaitResult: true });
  }

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_USER_PRODUCTS_STATE_KEY, remoteState.updatedAt)) {
    setUserProducts(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_USER_PRODUCTS_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase-empty" };
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function syncProductSettingsFromSupabase() {
  if (!canUseSupabaseWorkspaceState()) return { ok: true, source: "local" };

  const remoteState = await fetchSupabaseWorkspaceState(SUPABASE_PRODUCT_SETTINGS_STATE_KEY);
  if (!remoteState.ok) return remoteState;

  if (remoteState.exists && hasProductSettingsData(remoteState.stateData) && shouldApplyRemoteSupabaseState(SUPABASE_PRODUCT_SETTINGS_STATE_KEY, remoteState.updatedAt)) {
    setProductSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_PRODUCT_SETTINGS_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase" };
  }

  if (hasProductSettingsData(productSettings) && canWriteSupabaseWorkspaceState() && !remoteState.exists) {
    return persistProductSettingsToSupabase({ awaitResult: true });
  }

  if (remoteState.exists && shouldApplyRemoteSupabaseState(SUPABASE_PRODUCT_SETTINGS_STATE_KEY, remoteState.updatedAt)) {
    setProductSettings(remoteState.stateData, { skipSupabaseSync: true });
    rememberSupabaseStateRemoteUpdatedAt(SUPABASE_PRODUCT_SETTINGS_STATE_KEY, remoteState.updatedAt);
    return { ok: true, source: "supabase-empty" };
  }

  return { ok: true, source: remoteState.exists ? "supabase-unchanged" : "empty" };
}

async function fetchSupabaseWorkspaceState(stateKey) {
  const config = getSupabaseConfig();
  await refreshSupabaseSessionIfNeeded();
  const query = new URLSearchParams({
    select: "state_data,updated_at",
    workspace_id: `eq.${authSession.workspaceId}`,
    state_key: `eq.${stateKey}`,
    limit: "1",
  });

  try {
    let response = await fetch(`${config.url}/rest/v1/workspace_app_state?${query.toString()}`, {
      method: "GET",
      headers: getSupabaseRestHeaders(config.anonKey, authSession.accessToken),
    });
    if (response.status === 401 && await refreshSupabaseAuthSession()) {
      response = await fetch(`${config.url}/rest/v1/workspace_app_state?${query.toString()}`, {
        method: "GET",
        headers: getSupabaseRestHeaders(config.anonKey, authSession.accessToken),
      });
    }
    const payload = await response.json().catch(() => ([]));
    if (!response.ok) {
      return {
        ok: false,
        message: getSupabaseErrorMessage(payload, "Supabase could not load shared workspace fields. Make sure 003_workspace_app_state.sql has been run."),
      };
    }

    const row = Array.isArray(payload) ? payload[0] : null;
    return { ok: true, exists: Boolean(row), stateData: row?.state_data ?? null, updatedAt: row?.updated_at ?? "" };
  } catch (error) {
    return {
      ok: false,
      message: `Supabase shared workspace fields are unavailable right now: ${error?.message ?? "network error"}`,
    };
  }
}

function persistStageSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_STAGE_SETTINGS_STATE_KEY, stageSettings, "stage settings", { debounceMs: 400, ...options });
}

function persistCampaignPrepSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_CAMPAIGN_PREP_STATE_KEY, campaignPrepSettings, "campaign prep settings", { debounceMs: 400, ...options });
}

function persistVineSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_VINE_SETTINGS_STATE_KEY, vineSettings, "Vine settings", { debounceMs: 400, ...options });
}

function persistLaunchMonitoringSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_LAUNCH_MONITORING_STATE_KEY, launchMonitoringSettings, "launch monitoring settings", { debounceMs: 400, ...options });
}

function persistWorkspaceDetailsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_WORKSPACE_DETAILS_STATE_KEY, workspaceDetails, "workspace details", { debounceMs: 400, ...options });
}

function persistUserProductsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_USER_PRODUCTS_STATE_KEY, userProducts, "user products", options);
}

function persistProductSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_PRODUCT_SETTINGS_STATE_KEY, productSettings, "product settings", options);
}

function persistStageSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_STAGE_SETTINGS_STATE_KEY, stageSettings, "stage settings", options);
}

function persistCampaignPrepSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_CAMPAIGN_PREP_SETTINGS_STATE_KEY, campaignPrepSettings, "campaign prep settings", options);
}

function persistVineSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_VINE_SETTINGS_STATE_KEY, vineSettings, "Vine settings", options);
}

function persistLaunchMonitoringSettingsToSupabase(options = {}) {
  return persistSupabaseState(SUPABASE_LAUNCH_MONITORING_SETTINGS_STATE_KEY, launchMonitoringSettings, "launch monitoring settings", options);
}

function persistSupabaseState(stateKey, stateData, label, options = {}) {
  if (!canUseSupabaseWorkspaceState() || !canWriteSupabaseWorkspaceState()) return options.awaitResult ? Promise.resolve({ ok: true, skipped: true }) : undefined;

  const snapshot = cloneSupabaseStateData(stateData);
  if (options.awaitResult) return flushSupabaseStateWrite(stateKey, snapshot, label);

  scheduleSupabaseStateWrite(stateKey, snapshot, label, options.debounceMs ?? 0);
  return undefined;
}

function cloneSupabaseStateData(stateData) {
  if (typeof structuredClone === "function") return structuredClone(stateData);
  return JSON.parse(JSON.stringify(stateData));
}

function scheduleSupabaseStateWrite(stateKey, stateData, label, debounceMs = 0) {
  const existingWrite = pendingSupabaseStateWrites.get(stateKey) ?? {};
  if (existingWrite.timerId) clearTimeout(existingWrite.timerId);

  const nextWrite = {
    ...existingWrite,
    stateData,
    label,
    queuedWhileInFlight: Boolean(existingWrite.inFlight),
    timerId: null,
  };
  pendingSupabaseStateWrites.set(stateKey, nextWrite);

  nextWrite.timerId = setTimeout(() => {
    nextWrite.timerId = null;
    void flushQueuedSupabaseStateWrite(stateKey);
  }, Math.max(0, debounceMs));
}

function flushPendingSupabaseStateWrites() {
  for (const stateKey of pendingSupabaseStateWrites.keys()) {
    void flushQueuedSupabaseStateWrite(stateKey);
  }
}

function cloneWorkspaceFieldDefinition(field) {
  return {
    fieldId: String(field?.fieldId ?? "") || createWorkspaceFieldId(),
    label: String(field?.label ?? "").trim(),
    type: String(field?.type ?? ""),
    options: field?.type === "CUSTOM_DROPDOWN" ? normalizeDropdownOptions(field?.options) : [],
    tableColumns: field?.type === "CUSTOM_TABLE" ? normalizeFieldList(field?.tableColumns) : [],
    tableRows: field?.type === "CUSTOM_TABLE" ? normalizeFieldList(field?.tableRows) : [],
    checklistItems: field?.type === "CHECKLIST_NOTES" ? normalizeFieldList(field?.checklistItems) : [],
    galleryFormat: field?.type === "IMAGE_GALLERY" ? getImageGalleryFormat(field?.galleryFormat ?? field?.value?.format)?.value ?? "" : "",
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

function hasPendingSupabaseStateWrite(stateKey = SUPABASE_WORKSPACE_DETAILS_STATE_KEY) {
  const pendingWrite = pendingSupabaseStateWrites.get(stateKey);
  return Boolean(pendingWrite?.timerId || pendingWrite?.inFlight || pendingWrite?.queuedWhileInFlight);
}

function getSyncedWorkspaceFieldValue(definition, existingField = null) {
  if (!existingField || existingField.type !== definition.type) return createWorkspaceFieldInitialValue(definition.type, definition.galleryFormat);

async function upsertSupabaseWorkspaceState(stateKey, stateData) {
  const config = getSupabaseConfig();
  await refreshSupabaseSessionIfNeeded();
  try {
    let response = await fetch(`${config.url}/rest/v1/workspace_app_state?on_conflict=workspace_id,state_key`, {
      method: "POST",
      headers: {
        ...getSupabaseRestHeaders(config.anonKey, authSession.accessToken),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        workspace_id: authSession.workspaceId,
        state_key: stateKey,
        state_data: stateData,
        updated_by: authSession.userId,
      }),
    });
    if (response.status === 401 && await refreshSupabaseAuthSession()) {
      response = await fetch(`${config.url}/rest/v1/workspace_app_state?on_conflict=workspace_id,state_key`, {
        method: "POST",
        headers: {
          ...getSupabaseRestHeaders(config.anonKey, authSession.accessToken),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          workspace_id: authSession.workspaceId,
          state_key: stateKey,
          state_data: stateData,
          updated_by: authSession.userId,
        }),
      });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: getSupabaseErrorMessage(payload, "Supabase could not save shared workspace fields."),
      };
    }
    const row = Array.isArray(payload) ? payload[0] : payload;
    return { ok: true, updatedAt: row?.updated_at ?? "" };
  } catch (error) {
    return {
      ok: false,
      message: `Supabase shared workspace fields could not be saved: ${error?.message ?? "network error"}`,
    };
  }
}

async function forceUploadLocalWorkspaceDetails() {
  if (!canUseSupabaseWorkspaceState()) {
    uiState.supabaseSyncNotice = "Supabase workspace access is not loaded yet. Please log out, log in again, and retry.";
    renderFromCurrentState();
    return;
  }
  if (!canWriteSupabaseWorkspaceState()) {
    uiState.supabaseSyncNotice = "Only workspace owners, admins, or users can upload shared workspace fields.";
    renderFromCurrentState();
    return;
  }
  if (!hasWorkspaceDetailsData(workspaceDetails)) {
    uiState.supabaseSyncNotice = "This browser does not currently have local workspace fields to upload.";
    renderFromCurrentState();
    return;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  if (definition.type === "IMAGE_GALLERY") {
    const galleryValue = normalizeImageGalleryValue(existingField.value);
    if (definition.galleryFormat) galleryValue.format = definition.galleryFormat;
    return galleryValue;
  }

  return normalizeWorkspaceFieldValue(definition.type, existingField.value);
}

async function persistAllSharedWorkspaceStateToSupabase() {
  const workspaceResult = await persistWorkspaceDetailsToSupabase({ awaitResult: true, force: true });
  if (!workspaceResult.ok) return workspaceResult;

  const userProductsResult = await persistUserProductsToSupabase({ awaitResult: true, force: true });
  if (!userProductsResult.ok) return userProductsResult;

  const productSettingsResult = await persistProductSettingsToSupabase({ awaitResult: true, force: true });
  if (!productSettingsResult.ok) return productSettingsResult;

  const launchMonitoringResult = await persistLaunchMonitoringSettingsToSupabase({ awaitResult: true, force: true });
  if (!launchMonitoringResult.ok) return launchMonitoringResult;

  return { ok: true };
}

function startSupabaseWorkspaceSyncPolling() {
  if (typeof window === "undefined" || !canUseSupabaseWorkspaceState()) return;
  stopSupabaseWorkspaceSyncPolling();
  supabaseWorkspaceSyncIntervalId = window.setInterval(async () => {
    const result = await syncSharedWorkspaceStateFromSupabase();
    if (result.ok && !result.deferred) renderFromCurrentState();
  }, SUPABASE_WORKSPACE_SYNC_INTERVAL_MS);
}

function stopSupabaseWorkspaceSyncPolling() {
  if (typeof window === "undefined" || !supabaseWorkspaceSyncIntervalId) return;
  window.clearInterval(supabaseWorkspaceSyncIntervalId);
  supabaseWorkspaceSyncIntervalId = null;
}

function canUseSupabaseWorkspaceState() {
  return isSupabaseConfigured() && authSession?.provider === "supabase" && Boolean(authSession?.workspaceId && authSession?.accessToken);
}

function canWriteSupabaseWorkspaceState() {
  const workspaceRole = String(authSession?.workspaceRole ?? "").trim().toLowerCase();
  return ["owner", "admin", "user"].includes(workspaceRole) || ["ADMIN", "USER"].includes(getCurrentUserRole());
}

function hasVineSettingsData(settings) {
  return JSON.stringify(normalizeVineSettings(settings)) !== JSON.stringify(normalizeVineSettings(DEFAULT_VINE_SETTINGS));
}

function hasCampaignPrepSettingsData(settings) {
  return JSON.stringify(normalizeCampaignPrepSettings(settings)) !== JSON.stringify(normalizeCampaignPrepSettings(DEFAULT_CAMPAIGN_PREP_SETTINGS));
}

function hasLaunchMonitoringSettingsData(settings) {
  return JSON.stringify(normalizeLaunchMonitoringSettings(settings)) !== JSON.stringify(normalizeLaunchMonitoringSettings(DEFAULT_LAUNCH_MONITORING_SETTINGS));
}

function hasStageSettingsData(settings) {
  const normalizedSettings = normalizeStageSettings(settings);
  return normalizedSettings.hiddenStageIds.length > 0
    || normalizedSettings.customStages.length > 0
    || Object.keys(normalizedSettings.labels).length > 0
    || normalizedSettings.order.join("|") !== createDefaultStageSettings().order.join("|");
}

function hasWorkspaceDetailsData(details) {
  const normalizedDetails = normalizeWorkspaceDetails(details);
  return Object.keys(normalizedDetails.products).length > 0
    || Object.values(normalizedDetails.stageFieldTemplates).some((fields) => Array.isArray(fields) && fields.length > 0);
}

function hasUserProductsData(products) {
  return normalizeUserProducts(products).length > 0;
}

function hasProductSettingsData(settings) {
  const normalizedSettings = normalizeProductSettings(settings);
  return Object.keys(normalizedSettings.edits).length > 0 || normalizedSettings.deletedProductIds.length > 0;
}

async function refreshSupabaseSessionIfNeeded() {
  if (!canUseSupabaseWorkspaceState()) return false;
  const expiresAtMs = Number(authSession?.expiresAt ?? 0) * 1000;
  if (!expiresAtMs || expiresAtMs - Date.now() > 60000) return true;
  return refreshSupabaseAuthSession();
}

async function refreshSupabaseAuthSession() {
  if (!authSession?.refreshToken || !isSupabaseConfigured()) return false;

  const config = getSupabaseConfig();
  try {
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: getSupabaseAuthHeaders(config.anonKey),
      body: JSON.stringify({ refresh_token: authSession.refreshToken }),
    });
    if (!payload?.user || !payload?.token) return { handled: false };
    mergeRemoteTeamUsers([payload.user]);
    setAuthSession({ email: payload.user.email, name: payload.user.name, role: payload.user.role, token: payload.token }, remember);
    await refreshRemoteTeamUsers();
    startRemoteWorkspaceSync();
    await refreshRemoteWorkspaceState();
    uiState.loginDraft = { email: "", password: "", remember: false };
    uiState.authError = "";
    uiState.showLoginPassword = false;
    renderFromCurrentState();
    return { handled: true };
  } catch (error) {
    console.warn("LaunchFlow could not refresh the Supabase session.", error);
    uiState.supabaseSyncNotice = `Supabase session refresh failed: ${error?.message ?? "network error"}`;
    return false;
  }
}

async function requestSupabasePasswordReset() {
  const email = String(uiState.loginDraft.email ?? "").trim().toLowerCase();
  if (!email) {
    uiState.authError = "Enter your email first, then click Forgot password.";
    renderFromCurrentState();
    return;
  }
  if (!isSupabaseConfigured()) {
    uiState.authError = "Supabase is not configured yet, so password reset is unavailable.";
    renderFromCurrentState();
    return;
  }

  uiState.authError = "Sending Supabase password reset email...";
  renderFromCurrentState();
  const config = getSupabaseConfig();
  try {
    const response = await fetch(`${config.url}/auth/v1/recover?redirect_to=${encodeURIComponent(getSupabaseAuthRedirectUrl())}`, {
      method: "POST",
      headers: getSupabaseAuthHeaders(config.anonKey),
      body: JSON.stringify({ email }),
    });
    const payload = await response.json().catch(() => ({}));
    uiState.authError = response.ok
      ? "Password reset email sent. Use the link from Supabase to set a new password."
      : getSupabaseErrorMessage(payload, "Supabase could not send the password reset email.");
  } catch (error) {
    uiState.authError = `Supabase password reset is unavailable right now: ${error?.message ?? "network error"}`;
  }
  renderFromCurrentState();
}

async function handleSupabaseRecoveryRedirect() {
  if (typeof window === "undefined" || !isSupabaseConfigured()) return;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, "") || window.location.search.replace(/^\?/, ""));
  if (params.get("type") !== "recovery" || !params.get("access_token")) return;

  const nextPassword = window.prompt("Enter your new LaunchFlow password");
  if (!nextPassword) {
    uiState.authError = "Password reset was opened, but no new password was entered.";
    renderFromCurrentState();
    return;
  }

  const config = getSupabaseConfig();
  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${params.get("access_token")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: nextPassword }),
    });
    const payload = await response.json().catch(() => ({}));
    uiState.authError = response.ok
      ? "Password updated. Sign in with your new password."
      : getSupabaseErrorMessage(payload, "Supabase could not update the password.");
    if (response.ok) window.history.replaceState({}, document.title, getSupabaseAuthRedirectUrl());
  } catch (error) {
    uiState.authError = `Supabase password update is unavailable right now: ${error?.message ?? "network error"}`;
  }
  renderFromCurrentState();
}

function startRemoteWorkspaceSync() {
  if (!authSession?.token || remoteWorkspacePollIntervalId) return;
  refreshRemoteWorkspaceState();
  remoteWorkspacePollIntervalId = window.setInterval(refreshRemoteWorkspaceState, 20000);
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
}

function getRemoteWorkspaceSnapshot() {
  return {
    userProducts,
    productSettings,
    workspaceDetails,
    stageSettings,
  };
}

function persistRemoteWorkspaceSnapshotLocally() {
  safeSetStorageItem(USER_PRODUCTS_STORAGE_KEY, JSON.stringify(userProducts));
  safeSetStorageItem(PRODUCT_SETTINGS_STORAGE_KEY, JSON.stringify(productSettings));
  safeSetStorageItem(WORKSPACE_DETAILS_STORAGE_KEY, JSON.stringify(workspaceDetails));
  safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
}

function applyRemoteWorkspaceState(state) {
  if (!state || typeof state !== "object") return;
  userProducts = normalizeUserProducts(state.userProducts);
  productSettings = normalizeProductSettings(state.productSettings);
  workspaceDetails = normalizeWorkspaceDetails(state.workspaceDetails);
  stageSettings = normalizeStageSettings(state.stageSettings);
  persistRemoteWorkspaceSnapshotLocally();
  ensureSelectedProductForStage(true);
  renderFromCurrentState();
}

async function refreshRemoteWorkspaceState() {
  if (!authSession?.token) return;
  if (remoteWorkspaceDirty || remoteWorkspaceSyncInFlight) return;
  try {
    const payload = await requestRemoteAuth("/api/workspace-state");
    if (payload.state) {
      applyRemoteWorkspaceState(payload.state);
    } else {
      queueRemoteWorkspaceSync();
    }
  } catch (error) {
    console.warn("LaunchFlow could not refresh shared workspace state.", error);
  }
}

function queueRemoteWorkspaceSync() {
  if (!authSession?.token || remoteWorkspaceSyncInFlight) return;
  remoteWorkspaceDirty = true;
  if (remoteWorkspaceSyncTimeoutId) window.clearTimeout(remoteWorkspaceSyncTimeoutId);
  remoteWorkspaceSyncTimeoutId = window.setTimeout(syncRemoteWorkspaceState, 800);
}

async function syncRemoteWorkspaceState() {
  if (!authSession?.token) return;
  remoteWorkspaceSyncTimeoutId = null;
  remoteWorkspaceSyncInFlight = true;
  try {
    await requestRemoteAuth("/api/workspace-state", {
      method: "PATCH",
      body: JSON.stringify({ state: getRemoteWorkspaceSnapshot() }),
    });
    remoteWorkspaceDirty = false;
  } catch (error) {
    console.warn("LaunchFlow could not sync shared workspace state.", error);
  } finally {
    remoteWorkspaceSyncInFlight = false;
  }
}

function startRemoteWorkspaceSync() {
  if (!authSession?.token || remoteWorkspacePollIntervalId) return;
  refreshRemoteWorkspaceState();
  remoteWorkspacePollIntervalId = window.setInterval(refreshRemoteWorkspaceState, 20000);
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
}

function getRemoteWorkspaceSnapshot() {
  return {
    userProducts,
    productSettings,
    workspaceDetails,
    stageSettings,
  };
}

function persistRemoteWorkspaceSnapshotLocally() {
  safeSetStorageItem(USER_PRODUCTS_STORAGE_KEY, JSON.stringify(userProducts));
  safeSetStorageItem(PRODUCT_SETTINGS_STORAGE_KEY, JSON.stringify(productSettings));
  safeSetStorageItem(WORKSPACE_DETAILS_STORAGE_KEY, JSON.stringify(workspaceDetails));
  safeSetStorageItem(STAGE_SETTINGS_STORAGE_KEY, JSON.stringify(stageSettings));
}

function applyRemoteWorkspaceState(state) {
  if (!state || typeof state !== "object") return;
  const nextWorkspaceSnapshot = {
    userProducts: state.userProducts,
    productSettings: state.productSettings,
    workspaceDetails: state.workspaceDetails,
    stageSettings: state.stageSettings,
  };
  if (JSON.stringify(nextWorkspaceSnapshot) === JSON.stringify(getRemoteWorkspaceSnapshot())) return;
  userProducts = normalizeUserProducts(state.userProducts);
  productSettings = normalizeProductSettings(state.productSettings);
  workspaceDetails = normalizeWorkspaceDetails(state.workspaceDetails);
  stageSettings = normalizeStageSettings(state.stageSettings);
  persistRemoteWorkspaceSnapshotLocally();
  ensureSelectedProductForStage(true);
  renderFromCurrentState();
}

function isWorkspaceInteractionInProgress() {
  if (uiState.fieldModal || uiState.imageGalleryPreview) return true;
  if (typeof document === "undefined") return false;
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  const tagName = activeElement.tagName;
  return tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA" || activeElement.isContentEditable;
}

async function refreshRemoteWorkspaceState() {
  if (!authSession?.token) return;
  if (remoteWorkspaceDirty || remoteWorkspaceSyncInFlight) return;
  if (isWorkspaceInteractionInProgress()) return;
  try {
    const payload = await requestRemoteAuth("/api/workspace-state");
    if (payload.state) {
      applyRemoteWorkspaceState(payload.state);
    } else {
      queueRemoteWorkspaceSync();
    }
  } catch (error) {
    console.warn("LaunchFlow could not refresh shared workspace state.", error);
  }
}

function queueRemoteWorkspaceSync() {
  if (!authSession?.token || remoteWorkspaceSyncInFlight) return;
  remoteWorkspaceDirty = true;
  if (remoteWorkspaceSyncTimeoutId) window.clearTimeout(remoteWorkspaceSyncTimeoutId);
  remoteWorkspaceSyncTimeoutId = window.setTimeout(syncRemoteWorkspaceState, 800);
}

async function syncRemoteWorkspaceState() {
  if (!authSession?.token) return;
  remoteWorkspaceSyncTimeoutId = null;
  remoteWorkspaceSyncInFlight = true;
  try {
    await requestRemoteAuth("/api/workspace-state", {
      method: "PATCH",
      body: JSON.stringify({ state: getRemoteWorkspaceSnapshot() }),
    });
    remoteWorkspaceDirty = false;
  } catch (error) {
    console.warn("LaunchFlow could not sync shared workspace state.", error);
  } finally {
    remoteWorkspaceSyncInFlight = false;
  }
}

async function submitLoginForm(form) {
  syncTeamUsersFromStorage();
  const formData = new FormData(form);
  const email = String(formData.get("email") || uiState.loginDraft.email || "").trim().toLowerCase();
  const password = normalizePasswordInput(formData.get("password") || uiState.loginDraft.password || "");
  const remember = Boolean(formData.get("remember") || uiState.loginDraft.remember);

function getSupabaseRestHeaders(anonKey, accessToken) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

function getSupabaseErrorMessage(payload, fallbackMessage) {
  return String(payload?.msg ?? payload?.message ?? payload?.error_description ?? payload?.error ?? fallbackMessage);
}

function getSupabaseAuthRedirectUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

function upsertSupabaseTeamUser(email, name, role) {
  const existingUser = findTeamUserByEmail(email);
  const nextUser = {
    id: existingUser?.id ?? `team_supabase_${Date.now().toString(36)}`,
    name: name || email,
    email,
    role: normalizeUserRole(role),
    status: "Active",
    password: existingUser?.password ?? "",
    jobTitle: existingUser?.jobTitle ?? "Supabase User",
    avatarDataUrl: existingUser?.avatarDataUrl ?? "",
    inviteSentAt: existingUser?.inviteSentAt ?? null,
    lastLoginAt: new Date().toISOString(),
  };
  setTeamUsers(existingUser
    ? teamUsers.map((user) => user.email === email ? { ...user, ...nextUser } : user)
    : [...teamUsers, nextUser]);
}

function isAuthenticated() {
  return Boolean(authSession?.provider === "supabase" ? authSession?.email : authSession?.email && findTeamUserByEmail(authSession.email));
}

function loadAuthSession() {
  if (typeof window === "undefined") return null;
  const rawSession = safeGetStorageItem(AUTH_SESSION_STORAGE_KEY) ?? safeGetStorageItem(AUTH_SESSION_STORAGE_KEY, "session");
  if (!rawSession) return null;

  try {
    const parsedSession = JSON.parse(rawSession);
    if (isSupabaseConfigured() && parsedSession?.provider !== "supabase") {
      clearStoredAuthSession();
      return null;
    }
    const sessionUser = findTeamUserByEmail(parsedSession?.email);
    if (parsedSession?.provider === "supabase" && parsedSession?.email) {
      return { ...parsedSession, name: sessionUser?.name ?? parsedSession.name ?? parsedSession.email, role: normalizeUserRole(sessionUser?.role ?? parsedSession.role) };
    }
    return sessionUser ? { ...parsedSession, name: sessionUser.name, role: normalizeUserRole(sessionUser.role) } : null;
  } catch {
    return null;
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
  if (normalizedRole.includes("OWNER")) return "ADMIN";
  if (normalizedRole.includes("VIEW")) return "VIEWER";
  if (["RESEARCH LEAD", "LOGISTICS MANAGER", "SOURCING SPECIALIST"].includes(normalizedRole)) return "USER";
  return "USER";
}

function mapSupabaseWorkspaceRole(role) {
  const normalizedRole = String(role ?? "").trim().toLowerCase();
  if (["owner", "admin"].includes(normalizedRole)) return "ADMIN";
  if (normalizedRole === "viewer") return "VIEWER";
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
  return canManageProducts();
}

function canManageChecklistTasks() {
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
    { id: "general", label: "General", icon: "tune" },
    { id: "security", label: "Security", icon: "security" },
    { id: "notifications", label: "Notifications", icon: "notifications" },
  ];
  return canManageUsers() ? categories : categories.filter((category) => category.id !== "users");
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
  clearStoredAuthSession();
}

function clearStoredAuthSession() {
  if (typeof window === "undefined") return;
  safeRemoveStorageItem(AUTH_SESSION_STORAGE_KEY);
  safeRemoveStorageItem(AUTH_SESSION_STORAGE_KEY, "session");
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

  if (!remoteResult.handled) {
    if (existingUser) {
      const updatedEmail = existingUser.email === ADMIN_OWNER_CREDENTIALS.email ? ADMIN_OWNER_CREDENTIALS.email : email;
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

function setProductSettings(nextSettings, options = {}) {
  productSettings = normalizeProductSettings(nextSettings);
  if (typeof window !== "undefined") {
    safeSetStorageItem(PRODUCT_SETTINGS_STORAGE_KEY, JSON.stringify(productSettings));
  }
  queueRemoteWorkspaceSync();
}

function createDefaultProductSettings() {
  return { edits: {}, deletedProductIds: [] };
}

function normalizeProductSettings(settings) {
  const edits = settings?.edits && typeof settings.edits === "object" ? settings.edits : {};
  return {
    edits: Object.fromEntries(Object.entries(edits).map(([productId, edit]) => [productId, normalizeProductEdit(edit)])),
    deletedProductIds: Array.isArray(settings?.deletedProductIds) ? settings.deletedProductIds.map((productId) => String(productId)) : [],
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

function setUserProducts(nextProducts, options = {}) {
  userProducts = normalizeUserProducts(nextProducts);
  if (typeof window !== "undefined") {
    safeSetStorageItem(USER_PRODUCTS_STORAGE_KEY, JSON.stringify(userProducts));
  }
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


function loadSupabaseStateRemoteUpdatedAt() {
  if (typeof window === "undefined") return {};
  try {
    const rawValue = window.localStorage.getItem(SUPABASE_STATE_REMOTE_UPDATED_AT_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    return parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue) ? parsedValue : {};
  } catch {
    return {};
  }
}

function rememberSupabaseStateRemoteUpdatedAt(stateKey, updatedAt) {
  if (!stateKey || !updatedAt) return;
  supabaseStateRemoteUpdatedAt = { ...supabaseStateRemoteUpdatedAt, [stateKey]: updatedAt };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SUPABASE_STATE_REMOTE_UPDATED_AT_STORAGE_KEY, JSON.stringify(supabaseStateRemoteUpdatedAt));
  }
}

function shouldApplyRemoteSupabaseState(stateKey, remoteUpdatedAt) {
  if (!remoteUpdatedAt) return true;
  const lastAppliedAt = supabaseStateRemoteUpdatedAt[stateKey];
  return !lastAppliedAt || remoteUpdatedAt !== lastAppliedAt;
}

function isRemoteStateNewerThanLocalDirty(remoteUpdatedAt, localDirtyAt) {
  if (!remoteUpdatedAt || !localDirtyAt) return false;
  return Date.parse(remoteUpdatedAt) > Date.parse(localDirtyAt);
}

function loadWorkspaceDetailsDirtyAt() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(WORKSPACE_DETAILS_DIRTY_AT_STORAGE_KEY) ?? "";
}

function markWorkspaceDetailsDirty() {
  workspaceDetailsDirtyAt = new Date().toISOString();
  if (typeof window !== "undefined") window.localStorage.setItem(WORKSPACE_DETAILS_DIRTY_AT_STORAGE_KEY, workspaceDetailsDirtyAt);
}

function markWorkspaceDetailsSynced() {
  workspaceDetailsDirtyAt = "";
  if (typeof window !== "undefined") window.localStorage.removeItem(WORKSPACE_DETAILS_DIRTY_AT_STORAGE_KEY);
}

function hasUnsyncedLocalWorkspaceDetails() {
  return Boolean(workspaceDetailsDirtyAt);
}

function isRecentWorkspaceDetailsDirty() {
  const dirtyTime = Date.parse(workspaceDetailsDirtyAt);
  return Number.isFinite(dirtyTime) && Date.now() - dirtyTime < WORKSPACE_DETAILS_DIRTY_GRACE_MS;
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

function setWorkspaceDetails(nextDetails, options = {}) {
  workspaceDetails = normalizeWorkspaceDetails(nextDetails);
  if (typeof window !== "undefined") {
    try {
      safeSetStorageItem(WORKSPACE_DETAILS_STORAGE_KEY, JSON.stringify(workspaceDetails));
    } catch (error) {
      console.warn("LaunchFlow could not persist workspace details locally.", error);
    }
  }
  queueRemoteWorkspaceSync();
}

function normalizeWorkspaceDetails(details) {
  const normalizedDetails = createEmptyWorkspaceDetails();
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
    text,
    createdAt: typeof message?.createdAt === "string" ? message.createdAt : new Date().toISOString(),
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
  if (!label || !WORKSPACE_CUSTOM_FIELD_TYPE_VALUES.includes(type)) return null;

  return {
    fieldId: String(field?.fieldId ?? "") || createWorkspaceFieldId(),
    label,
    type,
    value: normalizeWorkspaceFieldValue(type, field?.value),
    options: type === "CUSTOM_DROPDOWN" ? normalizeDropdownOptions(field?.options) : [],
    tableColumns: type === "CUSTOM_TABLE" ? normalizeFieldList(field?.tableColumns) : [],
    tableRows: type === "CUSTOM_TABLE" ? normalizeFieldList(field?.tableRows) : [],
    checklistItems: type === "CHECKLIST_NOTES" ? normalizeFieldList(field?.checklistItems) : [],
    galleryFormat: type === "IMAGE_GALLERY" ? getImageGalleryFormat(field?.galleryFormat ?? field?.value?.format)?.value ?? "" : "",
  };
}

function createEmptyListingContentValue() {
  return {
    title: "",
    bullets: ["", "", "", "", ""],
    description: "",
    backendKeywords: "",
    status: "",
  };
}

function normalizeListingContentValue(value) {
  const rawValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const bullets = Array.isArray(rawValue.bullets) ? rawValue.bullets : [];
  return {
    title: String(rawValue.title ?? "").slice(0, 200),
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
  if (type === "CUSTOM_DROPDOWN") return String(value ?? "");
  if (type === "LINK") return normalizeWorkspaceLinkValue(value);
  if (type === "LISTING_CONTENT") return normalizeListingContentValue(value);
  if (type === "SHIPMENT_TRACKER") return normalizeTrackingNumber(value);
  if (type === "CUSTOM_TABLE") return Array.isArray(value) ? value : [];
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

function normalizeWorkspaceLinkValue(value, fallbackLabel = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const url = String(value.url ?? value.href ?? "").trim();
    const label = String(value.label ?? value.text ?? "").trim();
    return { url, label: label || getDefaultWorkspaceLinkLabel(url, fallbackLabel) };
  }

  const url = String(value ?? "").trim();
  return { url, label: getDefaultWorkspaceLinkLabel(url, fallbackLabel) };
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

function getCustomTableColumns(field) {
  return normalizeFieldList(field?.tableColumns);
}

function getCustomTableRows(field) {
  return normalizeFieldList(field?.tableRows);
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
  return columns.length > 0 ? columns.length : 1;
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
  return { products: {}, stageFieldTemplates: {} };
}

function structuredCloneWorkspaceDetails(details) {
  return JSON.parse(JSON.stringify(details ?? createEmptyWorkspaceDetails()));
}

function createWorkspaceFieldInitialValue(type, imageGalleryFormat = "") {
  if (type === "CURRENCY") return { amount: "", currency: "USD" };
  if (type === "CUSTOM_TABLE") return [];
  if (type === "FILE_UPLOAD") return [];
  if (type === "IMAGE_GALLERY") return createEmptyImageGalleryValue(imageGalleryFormat);
  if (type === "PAYMENT_STATUS") return createEmptyPaymentStatusValue();
  if (type === "LISTING_CONTENT") return createEmptyListingContentValue();
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

function launchConfettiEffect(originElement = null) {
  if (typeof document === "undefined") return;

  const originRect = originElement instanceof Element ? originElement.getBoundingClientRect() : null;
  const originX = originRect ? originRect.left + originRect.width / 2 : window.innerWidth / 2;
  const originY = originRect ? originRect.top + originRect.height / 2 : window.innerHeight / 2;
  const confettiPieces = Array.from({ length: 36 }, (_, index) => createElement("span", {
    className: "confetti-piece",
    style: {
      left: `${originX}px`,
      top: `${originY}px`,
      background: getConfettiColor(index),
      animationDelay: `${Math.random() * 0.12}s`,
      '--confetti-x': `${(Math.random() - 0.5) * 240}px`,
      '--confetti-y': `${80 + Math.random() * 220}px`,
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
    ariaModal: (value) => setNullableAttribute(element, "aria-modal", value),
    ariaPressed: (value) => setNullableAttribute(element, "aria-pressed", value),
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
    dataListingPart: (value) => setNullableAttribute(element, "data-listing-part", value),
    dataListingCounter: (value) => setNullableAttribute(element, "data-listing-counter", value),
    dataLaunchMode: (value) => setNullableAttribute(element, "data-launch-mode", value),
    dataDashboardRange: (value) => setNullableAttribute(element, "data-dashboard-range", value),
    dataLaunchChartIndex: (value) => setNullableAttribute(element, "data-launch-chart-index", value),
    dataLaunchEntryId: (value) => setNullableAttribute(element, "data-launch-entry-id", value),
    dataLaunchPlanField: (value) => setNullableAttribute(element, "data-launch-plan-field", value),
    dataBulletIndex: (value) => setNullableAttribute(element, "data-bullet-index", value),
    dataCampaignMetric: (value) => setNullableAttribute(element, "data-campaign-metric", value),
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
    dataVineEntryType: (value) => setNullableAttribute(element, "data-vine-entry-type", value),
    dataVineMetric: (value) => setNullableAttribute(element, "data-vine-metric", value),
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
