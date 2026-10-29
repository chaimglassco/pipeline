import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AuditDuplicates } from "./audit-duplicates";
import type { AuditAd, AuditData } from "../domain/ppc-audit";
afterEach(cleanup);
const row: AuditAd={entity:"keyword",type:"SP",campaign:"Core",campaignId:"1",adGroup:"Exact",adGroupId:"g1",target:"lead knife",query:"",asin:"B012345678",sku:"",match:"Exact",placement:"",strategy:"",state:"enabled",bid:1,bidAvailable:true,targetMetricsAvailable:true,spend:40,sales:200,orders:4,clicks:20,impressions:100};
const audit:AuditData={version:1,name:"Test",start:"2026-09-01",end:"2026-09-30",currency:"USD",importedAt:"2026-10-22T00:00:00Z",files:["ppc.csv","business.csv"],ads:[],business:[]};
it("shows report-backed summaries, expanded occurrences and filters",()=>{
 render(<AuditDuplicates audit={audit} ads={[row,{...row,campaign:"Test",campaignId:"2",spend:60,sales:100}]} />);
 expect(screen.getByText("Showing 1 duplicate groups (2 occurrences)")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"+ lead knife"}));expect(screen.getByRole("table",{name:"Occurrences of lead knife"})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Duplicate Rules"}));expect(screen.getByLabelText("High review ACOS gap (pp)")).toHaveValue(15);
 fireEvent.change(screen.getByLabelText("Search"),{target:{value:"nonexistent"}});expect(screen.getByText("No duplicate target groups match this scope.")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Reset Filters"}));expect(screen.getByText("Showing 1 duplicate groups (2 occurrences)")).toBeInTheDocument();
});
it("offers only the shared PPC upload instruction when empty",()=>{render(<AuditDuplicates audit={null} ads={[]} />);expect(screen.getByRole("button",{name:"Export CSV"})).toBeDisabled();expect(screen.getByText(/Upload your PPC Report above/)).toBeInTheDocument();});
