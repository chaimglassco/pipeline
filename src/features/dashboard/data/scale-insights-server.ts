import "server-only";

import {
  ConnectError,
  NoValidTokenError,
  UserAuthorizationRequiredError,
  getToken,
  startAuthorization,
} from "@vercel/connect";
import {
  Client,
  StreamableHTTPClientTransport,
  type AuthProvider,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/client";
import {
  loadScaleInsightsWeeklyPerformance,
  type ScaleInsightsWeeklyPerformance,
  type ScaleInsightsWeeklyPerformanceParams,
} from "./scale-insights-performance";
import {
  getReadOnlyScaleInsightsToolNames,
  getScaleInsightsCampaignToolCapabilities,
  loadScaleInsightsCampaignComparison,
  loadScaleInsightsCampaignSpendBaseline,
  ScaleInsightsCampaignProviderError,
  summarizeCampaignToolSchema,
  type CampaignDiagnosticReporter,
  type ScaleInsightsCampaignComparisonParams,
} from "./scale-insights-campaign-comparison";
import type { CampaignSpendBaseline, CampaignWeeklyComparison } from "../domain/campaign-weekly-comparison";
import {
  loadUntargetedSalesOpportunities,
  type UntargetedOpportunityParams,
} from "./scale-insights-untargeted-opportunities";
import type { UntargetedSalesOpportunities } from "../domain/untargeted-sales-opportunities";
import { loadScaleInsightsPerformanceOverview, type PerformanceOverviewParams } from "./scale-insights-performance-overview";
import type { PerformanceOverviewData } from "../domain/performance-overview";
import { loadCampaignContribution } from "./scale-insights-campaign-contribution";

const DEFAULT_SCALE_INSIGHTS_MCP_URL = "https://mcp.scaleinsights.com/mcp";
const DEFAULT_SCALE_INSIGHTS_CONNECTOR = "mcp.scaleinsights.com/glassco-scale-insights";
const SCALE_INSIGHTS_REQUEST_TIMEOUT_MS = 25_000;

export class ScaleInsightsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaleInsightsConfigurationError";
  }
}

export class ScaleInsightsAuthorizationRequiredError extends Error {
  constructor(readonly authorizationUrl: string) {
    super("Scale Insights authorization is required.");
    this.name = "ScaleInsightsAuthorizationRequiredError";
  }
}

export type ScaleInsightsRequestIdentity = {
  userId: string;
  issuer: string;
  callbackUrl: string;
};

export type ScaleInsightsToolCaller = (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;

export type ScaleInsightsToolSession = {
  definitions: Tool[];
  callTool: ScaleInsightsToolCaller;
};

export type ScaleInsightsCampaignDiagnosticContext = {
  requestId: string;
};

export type ScaleInsightsOpportunityDiagnosticContext = {
  requestId: string;
};

function createCampaignDiagnosticReporter(requestId: string): CampaignDiagnosticReporter {
  return (event, details) => {
    console.warn(JSON.stringify({
      level: "warning",
      message: "Scale Insights campaign provider diagnostic",
      route: "/api/dashboard/campaign-comparison",
      requestId,
      event,
      ...details,
    }));
  };
}

function createOpportunityDiagnosticReporter(requestId: string) {
  return (event: string, details: Record<string, unknown>) => {
    console.warn(JSON.stringify({
      level: "warning",
      message: "Scale Insights untargeted-opportunity provider diagnostic",
      route: "/api/dashboard/untargeted-opportunities",
      requestId,
      event,
      ...details,
    }));
  };
}

function getConnector() {
  return process.env.SCALE_INSIGHTS_CONNECTOR?.trim() || DEFAULT_SCALE_INSIGHTS_CONNECTOR;
}

function validateAuthorizationUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ScaleInsightsConfigurationError("Scale Insights authorization returned an invalid URL.");
  }
  if (url.protocol !== "https:" || (url.hostname !== "vercel.com" && !url.hostname.endsWith(".vercel.com"))) {
    throw new ScaleInsightsConfigurationError("Scale Insights authorization returned an untrusted URL.");
  }
  return url.toString();
}

async function createAuthProvider(identity: ScaleInsightsRequestIdentity): Promise<AuthProvider> {
  const connector = getConnector();
  const params = {
    subject: { type: "user" as const, id: identity.userId, issuer: identity.issuer },
  };

  try {
    const accessToken = await getToken(connector, params);
    return { token: async () => accessToken };
  } catch (error) {
    if (error instanceof UserAuthorizationRequiredError || error instanceof NoValidTokenError) {
      const authorization = await startAuthorization(connector, params, { callbackUrl: identity.callbackUrl });
      throw new ScaleInsightsAuthorizationRequiredError(validateAuthorizationUrl(authorization.url));
    }
    if (error instanceof ConnectError) {
      throw new ScaleInsightsConfigurationError("Vercel Connect could not provide Scale Insights access.");
    }
    throw error;
  }
}

function getServerUrl() {
  const configured = process.env.SCALE_INSIGHTS_MCP_URL?.trim() || DEFAULT_SCALE_INSIGHTS_MCP_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ScaleInsightsConfigurationError("SCALE_INSIGHTS_MCP_URL is invalid.");
  }
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new ScaleInsightsConfigurationError("Scale Insights MCP must use HTTPS.");
  }
  return url;
}

export async function getScaleInsightsWeeklyPerformance(
  params: ScaleInsightsWeeklyPerformanceParams,
  identity: ScaleInsightsRequestIdentity,
): Promise<ScaleInsightsWeeklyPerformance> {
  return withScaleInsightsToolSession(identity, ({ definitions, callTool }) => {
    const requestId = crypto.randomUUID();
    const diagnostic = (event: string, details: Record<string, unknown>) => console.info(JSON.stringify({
      route: "/api/dashboard/performance", requestId, event, ...details,
    }));
    diagnostic("weekly_tool_contract", {
      tools: definitions.filter(tool => ["get_sales_data", "get_ads_performance", "get_search_term_performance", "get_sales_trend"].includes(tool.name))
        .map(tool => ({ name: tool.name, schema: summarizeCampaignToolSchema(tool.inputSchema) })),
    });
    return loadScaleInsightsWeeklyPerformance(params, callTool, diagnostic);
  });
}

export async function getScaleInsightsPerformanceOverview(
  params: PerformanceOverviewParams,
  identity: ScaleInsightsRequestIdentity,
): Promise<PerformanceOverviewData> {
  return withScaleInsightsToolSession(identity, ({ definitions, callTool }) => loadScaleInsightsPerformanceOverview(params, definitions, callTool));
}

export async function getScaleInsightsCampaignComparison(
  params: ScaleInsightsCampaignComparisonParams,
  identity: ScaleInsightsRequestIdentity,
): Promise<CampaignWeeklyComparison> {
  return withScaleInsightsToolSession(identity, ({ definitions, callTool }) => {
    const adsTool = definitions.find(tool => tool.name === "get_ads_performance");
    if (!adsTool) throw new ScaleInsightsConfigurationError("Scale Insights did not advertise campaign performance access.");
    return loadScaleInsightsCampaignComparison(params, callTool, getScaleInsightsCampaignToolCapabilities(adsTool.inputSchema));
  });
}

export async function getScaleInsightsCampaignContribution(params: ScaleInsightsCampaignComparisonParams, identity: ScaleInsightsRequestIdentity, requestId: string) {
  return withScaleInsightsToolSession(identity, ({ definitions, callTool }) => loadCampaignContribution(params, definitions, callTool, (event, details) => {
    console.warn(JSON.stringify({ message: "Scale Insights campaign contribution diagnostic", requestId, event, ...details }));
  }));
}

export async function getScaleInsightsCampaignSpendBaseline(
  params: ScaleInsightsCampaignComparisonParams,
  identity: ScaleInsightsRequestIdentity,
  diagnostic: ScaleInsightsCampaignDiagnosticContext,
): Promise<CampaignSpendBaseline> {
  return withScaleInsightsToolSession(identity, ({ definitions, callTool }) => {
    const reportDiagnostic = createCampaignDiagnosticReporter(diagnostic.requestId);
    const adsTool = definitions.find(tool => tool.name === "get_ads_performance");
    const capabilities = adsTool ? getScaleInsightsCampaignToolCapabilities(adsTool.inputSchema) : {};
    reportDiagnostic("campaign_tool_contract", {
      period: { startDate: params.previousStartDate, endDate: params.previousEndDate },
      marketplace: params.country,
      readOnlyToolNames: getReadOnlyScaleInsightsToolNames(definitions),
      adsPerformanceSchema: adsTool ? summarizeCampaignToolSchema(adsTool.inputSchema) : null,
      capabilities,
    });
    if (!adsTool) {
      reportDiagnostic("campaign_capability_missing", { capabilities });
      throw new ScaleInsightsCampaignProviderError(
        "campaign_capability_missing",
        "The connected Scale Insights integration does not expose campaign-level reporting.",
      );
    }
    return loadScaleInsightsCampaignSpendBaseline(params, callTool, capabilities, reportDiagnostic);
  });
}

export async function getScaleInsightsUntargetedSalesOpportunities(
  params: UntargetedOpportunityParams,
  identity: ScaleInsightsRequestIdentity,
  diagnostic: ScaleInsightsOpportunityDiagnosticContext,
): Promise<UntargetedSalesOpportunities> {
  return withScaleInsightsToolSession(identity, ({ definitions, callTool }) => loadUntargetedSalesOpportunities(
    params,
    definitions,
    callTool,
    createOpportunityDiagnosticReporter(diagnostic.requestId),
  ));
}

async function withConnectedScaleInsightsClient<T>(
  identity: ScaleInsightsRequestIdentity,
  load: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "glassco-ppc-dashboard", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(getServerUrl(), { authProvider: await createAuthProvider(identity) });

  try {
    await client.connect(transport);
    return await load(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function createToolCaller(client: Client): ScaleInsightsToolCaller {
  return async (name, args) => client.callTool(
    { name, arguments: args },
    { signal: AbortSignal.timeout(name === "get_campaign_performance" || name === "get_target_performance" ? 60_000 : SCALE_INSIGHTS_REQUEST_TIMEOUT_MS) },
  );
}

export async function withScaleInsightsClient<T>(
  identity: ScaleInsightsRequestIdentity,
  load: (callTool: import("./scale-insights-performance").ScaleInsightsToolCaller) => Promise<T>,
): Promise<T> {
  return withConnectedScaleInsightsClient(identity, client => load(createToolCaller(client)));
}

export async function withScaleInsightsToolSession<T>(
  identity: ScaleInsightsRequestIdentity,
  load: (session: ScaleInsightsToolSession) => Promise<T>,
): Promise<T> {
  return withConnectedScaleInsightsClient(identity, async client => {
    const listed = await client.listTools(undefined, { signal: AbortSignal.timeout(SCALE_INSIGHTS_REQUEST_TIMEOUT_MS) });
    return load({ definitions: listed.tools, callTool: createToolCaller(client) });
  });
}
