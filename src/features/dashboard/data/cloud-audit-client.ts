import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
export const CLOUD_AUDIT_API="/ppc/api/dashboard/audits";
export async function cloudAuditRequest<T>(path:string,options:RequestInit={}) :Promise<T> {
  const response=await fetch(`${CLOUD_AUDIT_API}${path}`,{...options,cache:"no-store",headers:{...getPipelineAuthorizationHeader(),"Content-Type":"application/json",...options.headers}});
  const value=await response.json();if(!response.ok)throw new Error(value.error||"The audit request could not finish.");return value;
}
