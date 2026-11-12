import { PGlite, type Transaction } from "@electric-sql/pglite";
import type postgres from "postgres";
type InsertFragment={insert:Record<string,unknown>[]};
// A small tagged-query adapter lets production SQL run unchanged against an
// isolated PostgreSQL engine. No network or production credentials are used.
export function auditTestSql(db:PGlite|Transaction):postgres.Sql {
  function tag(first:TemplateStringsArray|Record<string,unknown>[],...args:unknown[]):unknown {
    if(!("raw" in first))return {insert:first} satisfies InsertFragment;
    const params:unknown[]=[];let query=first[0];
    args.forEach((value,index)=>{
      if(value&&typeof value==="object"&&"insert" in value){
        const records=(value as InsertFragment).insert,keys=Object.keys(records[0]);
        query+=`(${keys.map(k=>`"${k}"`).join(",")}) values `+records.map(row=>"("+keys.map(key=>{params.push(row[key]);return `$${params.length}`;}).join(",")+")").join(",");
      }else{params.push(value);query+=`$${params.length}`;}
      query+=first[index+1];
    });
    return db.query(query,params).then(result=>result.rows);
  }
  return Object.assign(tag,{
    json:(value:unknown)=>JSON.stringify(value),
    unsafe:(query:string,params:unknown[]=[])=>db.query(query,params).then(result=>result.rows),
    begin:(callback:(sql:postgres.Sql)=>Promise<unknown>)=>"transaction" in db?db.transaction(tx=>callback(auditTestSql(tx))):callback(auditTestSql(db)),
  }) as unknown as postgres.Sql;
}
